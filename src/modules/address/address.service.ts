import { Address, Order } from '@/models';
import { HttpService } from '@nestjs/axios';
import {
    BadGatewayException,
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreateAddressDto, DistanceCalculationResultDto } from './dto/addressStore.dto';
import { firstValueFrom } from 'rxjs';
import { InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Op, Transaction } from 'sequelize';

@Injectable()
export class AddressService {
    private GOONG_API_KEY: string;
    private StoreLocation: { latitude: number; longitude: number };

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
        private readonly sequelize: Sequelize,
        @InjectModel(Address) private readonly modelAddress: typeof Address,
        @InjectModel(Order) private readonly orderModel: typeof Order,
    ) {
        this.GOONG_API_KEY = this.configService.get('GOONG_API_KEY') as string;
        this.StoreLocation = {
            latitude: this.configService.get('STORE_LATITUDE') as number,
            longitude: this.configService.get('STORE_LONGITUDE') as number,
        };
    }

    async caculateDistance(
        customerLatitude: number,
        customerLongitude: number
    ): Promise<DistanceCalculationResultDto> {
        const origins = `${this.StoreLocation.latitude},${this.StoreLocation.longitude}`;
        const destinations = `${customerLatitude},${customerLongitude}`;

        const url = `https://rsapi.goong.io/DistanceMatrix?origins=${origins}&destinations=${destinations}&vehicle=car&api_key=${this.GOONG_API_KEY}`;

        try {
            const response = await firstValueFrom(this.httpService.get(url));
            console.log('Goong API Response:', JSON.stringify(response.data, null, 2));

            if (!response.data.rows || response.data.rows.length === 0) {
                throw new BadGatewayException('Không có dữ liệu tuyến đường từ Goong API');
            }

            const row = response.data.rows[0];
            if (!row.elements || row.elements.length === 0) {
                throw new BadGatewayException('Không tìm thấy elements trong dữ liệu');
            }

            const element = row.elements[0];

            if (element.status === 'OK') {
                return {
                    distance: element.distance.value / 1000,
                    duration: element.duration.value / 60,
                    status: element.status,
                };
            }

            if (element.status === 'ZERO_RESULTS') {
                throw new BadGatewayException(
                    'Không tìm thấy tuyến đường giữa cửa hàng và điểm giao hàng'
                );
            }

            throw new BadGatewayException(`Loi tinh toan khoang cach: ${element.status}`);
        } catch (error: unknown) {
            console.error('Loi tinh toan khoang cach:', error);

            if (error instanceof BadGatewayException) {
                throw error;
            }

            if (error instanceof Error) {
                throw new BadGatewayException(
                    `Không thể tính toán khoảng cách: ${error.message}`
                );
            }

            throw new BadGatewayException('Không thể tính toán khoảng cách');
        }
    }

    async createAddress(address: CreateAddressDto) {
        const transaction = await this.sequelize.transaction();

        try {
            const payload = await this.prepareUserAddressPayload(address, transaction);
            const newAddress = await this.modelAddress.create(payload as Address, { transaction });
            await transaction.commit();

            return {
                message: 'Tạo địa chỉ thành công',
                data: newAddress,
            };
        } catch (error: unknown) {
            await transaction.rollback();

            if (error instanceof BadRequestException || error instanceof NotFoundException) {
                throw error;
            }

            if (error instanceof Error) {
                throw new BadRequestException(error.message);
            }

            throw new BadRequestException('Không thể tạo địa chỉ');
        }
    }

    async createUserAddress(userId: number, address: CreateAddressDto) {
        return this.createAddress({
            ...address,
            userId,
            sessionId: undefined,
        });
    }

    async updateUserAddress(userId: number, addressId: number, address: CreateAddressDto) {
        const transaction = await this.sequelize.transaction();

        try {
            const existingAddress = await this.modelAddress.findOne({
                where: { id: addressId, userId },
                transaction,
            });

            if (!existingAddress) {
                throw new NotFoundException('Không tìm thấy địa chỉ giao hàng');
            }

            const payload = await this.prepareUserAddressPayload(
                {
                    ...address,
                    userId,
                    sessionId: undefined,
                },
                transaction,
                existingAddress.id
            );
            await this.modelAddress.update(
                {
                    ...payload,
                    userId,
                    sessionId: null,
                } as Partial<Address>,
                {
                    where: { id: addressId, userId },
                    transaction,
                    hooks: false,
                    validate: false,
                }
            );

            const updatedAddress = await this.modelAddress.findOne({
                where: { id: addressId, userId },
                transaction,
            });

            await transaction.commit();

            return {
                message: 'Cập nhật địa chỉ thành công',
                data: updatedAddress,
            };
        } catch (error: unknown) {
            await transaction.rollback();

            if (error instanceof BadRequestException || error instanceof NotFoundException) {
                throw error;
            }

            if (error instanceof Error) {
                throw new BadRequestException(error.message);
            }

            throw new BadRequestException('Không thể cập nhật địa chỉ');
        }
    }

    async getUserAddresses(userId: number) {
        const addresses = await this.modelAddress.findAll({
            where: { userId },
            order: [
                ['isDefault', 'DESC'],
                ['createdAt', 'DESC'],
            ],
        });

        return {
            message: 'Lấy danh sách địa chỉ thành công',
            data: addresses,
        };
    }

    async reverseGeocode(latitude: number, longitude: number) {
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            throw new BadRequestException('Tọa độ không hợp lệ');
        }

        if (!this.GOONG_API_KEY) {
            throw new BadRequestException('Chưa cấu hình GOONG_API_KEY');
        }

        const latlng = `${latitude},${longitude}`;
        const url = `https://rsapi.goong.io/v2/geocode?latlng=${encodeURIComponent(latlng)}&limit=5&api_key=${this.GOONG_API_KEY}&has_deprecated_administrative_unit=true`;

        try {
            const response = await firstValueFrom(this.httpService.get(url));
            const result = this.normalizeReverseGeocodeResult(response.data);

            return {
                message: 'Lấy địa chỉ từ vị trí thành công',
                data: {
                    latitude,
                    longitude,
                    ...result,
                },
            };
        } catch (error: unknown) {
            if (error instanceof BadRequestException || error instanceof BadGatewayException) {
                throw error;
            }

            if (error instanceof Error) {
                throw new BadGatewayException(`Không thể lấy địa chỉ từ vị trí: ${error.message}`);
            }

            throw new BadGatewayException('Không thể lấy địa chỉ từ vị trí');
        }
    }

    async deleteUserAddress(userId: number, addressId: number) {
        const transaction = await this.sequelize.transaction();

        try {
            const existingAddress = await this.modelAddress.findOne({
                where: { id: addressId, userId },
                transaction,
            });

            if (!existingAddress) {
                throw new NotFoundException('Không tìm thấy địa chỉ giao hàng');
            }

            const orderCount = await this.orderModel.count({
                where: { addressId },
                transaction,
            });

            if (orderCount > 0) {
                await existingAddress.update(
                    {
                        userId: null,
                        isDefault: false,
                    } as Partial<Address>,
                    {
                        transaction,
                        hooks: false,
                        validate: false,
                    }
                );
            } else {
                await this.modelAddress.destroy({
                    where: { id: addressId, userId },
                    transaction,
                });
            }

            await this.ensureUserHasDefaultAddress(userId, transaction);
            await transaction.commit();

            return {
                message: 'Đã xóa địa chỉ giao hàng',
            };
        } catch (error: unknown) {
            await transaction.rollback();

            if (error instanceof BadRequestException || error instanceof NotFoundException) {
                throw error;
            }

            if (error instanceof Error) {
                throw new BadRequestException(error.message);
            }

            throw new BadRequestException('Không thể xóa địa chỉ');
        }
    }

    private async prepareUserAddressPayload(
        address: CreateAddressDto,
        transaction: Transaction,
        excludeAddressId?: number
    ) {
        const payload: CreateAddressDto = {
            ...address,
        };

        if (!payload.userId) {
            return payload;
        }

        if (payload.isDefault) {
            await this.modelAddress.update(
                { isDefault: false },
                {
                    where: {
                        userId: payload.userId,
                        ...(excludeAddressId ? { id: { [Op.ne]: excludeAddressId } } : {}),
                    },
                    transaction,
                    hooks: false,
                    validate: false,
                }
            );

            return payload;
        }

        const defaultCount = await this.modelAddress.count({
            where: {
                userId: payload.userId,
                isDefault: true,
                ...(excludeAddressId ? { id: { [Op.ne]: excludeAddressId } } : {}),
            },
            transaction,
        });

        if (defaultCount === 0) {
            payload.isDefault = true;
        }

        return payload;
    }

    private async ensureUserHasDefaultAddress(userId: number, transaction: Transaction) {
        const defaultCount = await this.modelAddress.count({
            where: {
                userId,
                isDefault: true,
            },
            transaction,
        });

        if (defaultCount > 0) {
            return;
        }

        const nextDefaultAddress = await this.modelAddress.findOne({
            where: { userId },
            order: [['createdAt', 'DESC']],
            transaction,
        });

        if (!nextDefaultAddress) {
            return;
        }

        await this.modelAddress.update(
            { isDefault: true },
            {
                where: { id: nextDefaultAddress.id, userId },
                transaction,
                hooks: false,
                validate: false,
            }
        );
    }

    private normalizeReverseGeocodeResult(data: any) {
        if (!data || data.status !== 'OK' || !Array.isArray(data.results) || data.results.length === 0) {
            throw new BadGatewayException('Không tìm thấy địa chỉ từ vị trí hiện tại');
        }

        const bestMatch = data.results[0];
        const compound = bestMatch.compound || bestMatch.deprecated_compound || {};
        const city = this.pickText(compound.province, bestMatch.province);
        const district = this.pickText(compound.district, bestMatch.district);
        const ward = this.pickText(compound.commune, bestMatch.commune);
        const formattedAddress = this.pickText(
            bestMatch.formatted_address,
            bestMatch.description,
            bestMatch.deprecated_description,
            bestMatch.address
        );
        const street = this.resolveStreet(bestMatch, formattedAddress, {
            city,
            district,
            ward,
        });

        return {
            city,
            district,
            ward,
            street,
            formattedAddress,
        };
    }

    private pickText(...values: unknown[]) {
        for (const value of values) {
            if (typeof value === 'string' && value.trim()) {
                return value.trim();
            }
        }

        return '';
    }

    private resolveStreet(
        result: any,
        formattedAddress: string,
        administrativeParts: { city: string; district: string; ward: string }
    ) {
        const directName = this.pickText(result.name);
        const lowerAdministrativeParts = Object.values(administrativeParts)
            .filter(Boolean)
            .map((value) => value.toLowerCase());

        if (directName && !lowerAdministrativeParts.includes(directName.toLowerCase())) {
            return directName;
        }

        const addressParts = formattedAddress
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean)
            .filter((part) => !lowerAdministrativeParts.includes(part.toLowerCase()));

        return addressParts[0] || '';
    }
}
