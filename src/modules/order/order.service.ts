import { Address, Combo, ComboItem, DiningTable, Ingredient, KitchenTicket, Order, OrderItemComboOption, OrderItemComboOptionIngredient, OrderItemIngredient, OrderItems, Product, ProductVariant, TableSession, User } from '@/models';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { AddressService } from '../address/address.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { Sequelize } from 'sequelize-typescript';
import { Helper } from '@/utils/helper';
import { ORDERTYPE, ORDERSTATUS, PAYMENTMETHOD, PAYMENTSTATUS } from '@/models/order.model';
import { Op, col, fn } from 'sequelize';
import { AdminOrderDateRangeQueryDto, AdminOrderLimitQueryDto, AdminOrderListQueryDto, AdminOrderRevenueQueryDto } from './dto/admin-order-statistics.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { RedisService } from '../redis/redis.service';
import { StorePolicySettingService } from '../store-policy-setting/store-policy-setting.service';
import { SepayService } from '../sepay/sepay.service';

interface MyOrdersQuery {
    page?: string | number;
    limit?: string | number;
    search?: string;
    minPrice?: string | number;
    maxPrice?: string | number;
    orderStatus?: string;
    paymentStatus?: string;
}

type AdminOrderDateRange = Pick<AdminOrderDateRangeQueryDto, 'fromDate' | 'toDate'>;

@Injectable()
export class OrderService {
    private readonly logger = new Logger(OrderService.name);

    constructor(
        @InjectModel(Order) private readonly orderModel: typeof Order,
        @InjectModel(OrderItems) private readonly orderItemsModel: typeof OrderItems,
        @InjectModel(OrderItemIngredient) private readonly orderItemsIngredientModel: typeof OrderItemIngredient,
        @InjectModel(Address) private readonly addressModel: typeof Address,
        @InjectModel(ProductVariant) private readonly productVariantModel: typeof ProductVariant,
        @InjectModel(Product) private readonly productModel: typeof Product,
        @InjectModel(Ingredient) private readonly ingredientModel: typeof Ingredient,
        private readonly addressService: AddressService,
        private readonly redisService: RedisService,
        private readonly storePolicySettingService: StorePolicySettingService,
        private readonly sepayService: SepayService,
        private readonly sequelize: Sequelize
    ) { }

    async getAdminOrders(query: AdminOrderListQueryDto = {}) {
        const currentPage = Math.max(Number(query.page || 1), 1);
        const limitPage = this.parseLimit(query.limit, 10, 50);
        const offsetPage = (currentPage - 1) * limitPage;
        const search = query.search?.trim();
        const whereClause: any = this.buildAdminOrderDateWhere(query);

        if (query.orderStatus) {
            whereClause.orderStatus = query.orderStatus;
        }

        if (query.paymentStatus) {
            whereClause.paymentStatus = query.paymentStatus;
        }

        if (query.orderType) {
            whereClause.orderType = query.orderType;
        }

        if (search) {
            whereClause[Op.or] = [
                { orderNumber: { [Op.iLike]: `%${search}%` } },
                { '$user.name$': { [Op.iLike]: `%${search}%` } },
                { '$user.email$': { [Op.iLike]: `%${search}%` } },
                { '$user.phone$': { [Op.iLike]: `%${search}%` } },
                { '$address.recipientName$': { [Op.iLike]: `%${search}%` } },
                { '$address.recipientPhone$': { [Op.iLike]: `%${search}%` } },
                { '$tableSession.table.code$': { [Op.iLike]: `%${search}%` } },
                { '$tableSession.table.name$': { [Op.iLike]: `%${search}%` } },
                { '$orderItems.product.name$': { [Op.iLike]: `%${search}%` } },
                { '$orderItems.combo.name$': { [Op.iLike]: `%${search}%` } }
            ];
        }

        const result = await this.orderModel.findAndCountAll({
            where: whereClause,
            attributes: [
                'id',
                'orderNumber',
                'orderType',
                'orderStatus',
                'paymentMethod',
                'paymentStatus',
                'subTotal',
                'deliveryFee',
                'discount',
                'finalTotal',
                'notes',
                'paidAt',
                'cancelledReason',
                'cancelledAt',
                'tableSessionId',
                'createdAt',
                'updatedAt'
            ],
            include: this.buildAdminOrderInclude(),
            distinct: true,
            subQuery: false,
            limit: limitPage,
            offset: offsetPage,
            order: [['createdAt', 'DESC']]
        });

        return {
            items: result.rows.map((order) => this.mapAdminOrder(order)),
            pagination: {
                page: currentPage,
                limit: limitPage,
                totalItems: result.count,
                totalPages: Math.ceil(result.count / limitPage)
            }
        };
    }

    async updateAdminOrderStatus(id: number, dto: UpdateOrderStatusDto) {
        if (dto.orderStatus === ORDERSTATUS.CANCELLED) {
            return this.cancelAdminOrder(id, { reason: dto.cancelledReason });
        }

        const order = await this.orderModel.findByPk(id);
        if (!order) {
            throw new BadRequestException('Order not found');
        }

        if (order.orderStatus === ORDERSTATUS.CANCELLED) {
            throw new BadRequestException('Cancelled order cannot be updated');
        }

        order.setDataValue('orderStatus', dto.orderStatus);

        await order.save();

        const updatedOrder = await this.orderModel.findByPk(id, {
            attributes: [
                'id',
                'orderNumber',
                'orderType',
                'orderStatus',
                'paymentMethod',
                'paymentStatus',
                'subTotal',
                'deliveryFee',
                'discount',
                'finalTotal',
                'notes',
                'paidAt',
                'cancelledReason',
                'cancelledAt',
                'tableSessionId',
                'createdAt',
                'updatedAt'
            ],
            include: this.buildAdminOrderInclude()
        });

        if (!updatedOrder) {
            throw new BadRequestException('Order not found');
        }

        return this.mapAdminOrder(updatedOrder);
    }

    async cancelMyOrder(userId: number, id: number, dto: CancelOrderDto = {}) {
        if (!userId) throw new BadRequestException('User id not found');

        return this.cancelOrder(id, {
            actor: 'user',
            userId,
            reason: dto.reason
        });
    }

    async cancelAdminOrder(id: number, dto: CancelOrderDto = {}) {
        return this.cancelOrder(id, {
            actor: 'admin',
            reason: dto.reason
        });
    }

    async getAdminOrderOverview(query: AdminOrderDateRangeQueryDto = {}) {
        const whereClause = this.buildAdminOrderDateWhere(query);
        const todayWhere = this.buildTodayOrderWhere();

        const [
            totalOrders,
            pendingOrders,
            preparingOrders,
            deliveredOrders,
            cancelledOrders,
            totalRevenue,
            paidRevenue,
            pendingPaymentAmount,
            totalOrderAmount,
            todayOrders,
            todayRevenue
        ] = await Promise.all([
            this.orderModel.count({ where: whereClause }),
            this.orderModel.count({ where: { ...whereClause, orderStatus: ORDERSTATUS.PENDING } }),
            this.orderModel.count({ where: { ...whereClause, orderStatus: ORDERSTATUS.PREPARING } }),
            this.orderModel.count({ where: { ...whereClause, orderStatus: ORDERSTATUS.DELIVERED } }),
            this.orderModel.count({ where: { ...whereClause, orderStatus: ORDERSTATUS.CANCELLED } }),
            this.orderModel.sum('finalTotal', { where: { ...whereClause, orderStatus: ORDERSTATUS.DELIVERED } }),
            this.orderModel.sum('finalTotal', { where: { ...whereClause, paymentStatus: PAYMENTSTATUS.PAID } }),
            this.orderModel.sum('finalTotal', { where: { ...whereClause, paymentStatus: PAYMENTSTATUS.PENDING } }),
            this.orderModel.sum('finalTotal', { where: whereClause }),
            this.orderModel.count({ where: todayWhere }),
            this.orderModel.sum('finalTotal', { where: { ...todayWhere, orderStatus: ORDERSTATUS.DELIVERED } })
        ]);

        return {
            totalOrders,
            pendingOrders,
            preparingOrders,
            deliveredOrders,
            cancelledOrders,
            totalRevenue: this.toNumber(totalRevenue),
            paidRevenue: this.toNumber(paidRevenue),
            pendingPaymentAmount: this.toNumber(pendingPaymentAmount),
            averageOrderValue: totalOrders > 0 ? Math.round(this.toNumber(totalOrderAmount) / totalOrders) : 0,
            todayOrders,
            todayRevenue: this.toNumber(todayRevenue)
        };
    }

    async getAdminRevenueStatistics(query: AdminOrderRevenueQueryDto = {}) {
        const groupBy = query.groupBy || 'day';
        const bucketExpression = fn('date_trunc', groupBy, col('createdAt'));
        const rows = await this.orderModel.findAll({
            attributes: [
                [bucketExpression, 'bucket'],
                [fn('COUNT', col('id')), 'totalOrders'],
                [fn('SUM', col('finalTotal')), 'revenue']
            ],
            where: {
                ...this.buildAdminOrderDateWhere(query),
                orderStatus: ORDERSTATUS.DELIVERED
            },
            group: [bucketExpression],
            order: [[bucketExpression as any, 'ASC']],
            raw: true
        });

        return {
            groupBy,
            items: rows.map((row: any) => ({
                label: this.formatRevenueBucket(row.bucket, groupBy),
                totalOrders: this.toNumber(row.totalOrders),
                revenue: this.toNumber(row.revenue)
            }))
        };
    }

    async getAdminOrderStatusStatistics(query: AdminOrderDateRangeQueryDto = {}) {
        const rows = await this.orderModel.findAll({
            attributes: [
                'orderStatus',
                [fn('COUNT', col('id')), 'count'],
                [fn('SUM', col('finalTotal')), 'amount']
            ],
            where: this.buildAdminOrderDateWhere(query),
            group: ['orderStatus'],
            raw: true
        });

        const statsByStatus = new Map(
            rows.map((row: any) => [
                row.orderStatus,
                {
                    status: row.orderStatus,
                    count: this.toNumber(row.count),
                    amount: this.toNumber(row.amount)
                }
            ])
        );

        return {
            items: Object.values(ORDERSTATUS).map((status) => (
                statsByStatus.get(status) || { status, count: 0, amount: 0 }
            ))
        };
    }

    async getAdminPaymentStatistics(query: AdminOrderDateRangeQueryDto = {}) {
        const rows = await this.orderModel.findAll({
            attributes: [
                'paymentStatus',
                [fn('COUNT', col('id')), 'count'],
                [fn('SUM', col('finalTotal')), 'amount']
            ],
            where: this.buildAdminOrderDateWhere(query),
            group: ['paymentStatus'],
            raw: true
        });

        const statsByStatus = new Map(
            rows.map((row: any) => [
                row.paymentStatus,
                {
                    paymentStatus: row.paymentStatus,
                    count: this.toNumber(row.count),
                    amount: this.toNumber(row.amount)
                }
            ])
        );

        return {
            items: Object.values(PAYMENTSTATUS).map((paymentStatus) => (
                statsByStatus.get(paymentStatus) || { paymentStatus, count: 0, amount: 0 }
            ))
        };
    }

    async getAdminTopProducts(query: AdminOrderLimitQueryDto = {}) {
        const limit = this.parseLimit(query.limit, 5, 20);
        const orders = await this.orderModel.findAll({
            where: {
                ...this.buildAdminOrderDateWhere(query),
                orderStatus: ORDERSTATUS.DELIVERED
            },
            attributes: ['id'],
            include: [
                {
                    model: OrderItems,
                    attributes: ['id', 'productId', 'comboId', 'quantity', 'metadata'],
                    include: [
                        {
                            model: Product,
                            attributes: ['id', 'name', 'imageUrl']
                        },
                        {
                            model: Combo,
                            attributes: ['id', 'name', 'imageUrl']
                        }
                    ]
                }
            ],
            order: [['createdAt', 'DESC']]
        });

        const stats = new Map<string, any>();

        for (const order of orders) {
            const plain = order.get({ plain: true }) as any;
            for (const item of plain.orderItems || []) {
                const metadata = item.metadata || {};
                const type = item.comboId ? 'COMBO' : 'PRODUCT';
                const itemId = item.comboId || item.productId;
                if (!itemId) continue;

                const key = `${type}:${itemId}`;
                const quantity = Math.max(this.toNumber(item.quantity), 1);
                const finalPrice = this.resolveTopItemFinalPrice(metadata);
                const current = stats.get(key) || {
                    id: itemId,
                    productId: item.productId || null,
                    comboId: item.comboId || null,
                    type,
                    name: metadata.itemName || item.product?.name || item.combo?.name || 'Item',
                    imageUrl: item.product?.imageUrl || item.combo?.imageUrl || null,
                    quantitySold: 0,
                    revenue: 0
                };

                current.quantitySold += quantity;
                current.revenue += finalPrice * quantity;
                stats.set(key, current);
            }
        }

        return {
            items: Array.from(stats.values())
                .sort((a, b) => b.quantitySold - a.quantitySold || b.revenue - a.revenue)
                .slice(0, limit)
        };
    }

    async getAdminRecentOrders(query: AdminOrderLimitQueryDto = {}) {
        const limit = this.parseLimit(query.limit, 8, 20);
        const orders = await this.orderModel.findAll({
            where: this.buildAdminOrderDateWhere(query),
            attributes: ['id', 'orderNumber', 'orderType', 'orderStatus', 'paymentMethod', 'paymentStatus', 'finalTotal', 'createdAt'],
            include: [
                {
                    model: User,
                    attributes: ['id', 'name', 'email', 'phone', 'avatar']
                },
                {
                    model: Address,
                    attributes: ['id', 'recipientName', 'recipientPhone', 'street', 'ward', 'district', 'city'],
                    required: false
                },
                {
                    model: TableSession,
                    attributes: ['id', 'tableId', 'status'],
                    required: false,
                    include: [
                        {
                            model: DiningTable,
                            attributes: ['id', 'code', 'name', 'area']
                        }
                    ]
                },
                {
                    model: OrderItems,
                    attributes: ['id', 'quantity']
                }
            ],
            limit,
            order: [['createdAt', 'DESC']]
        });

        return {
            items: orders.map((order) => {
                const plain = order.get({ plain: true }) as any;
                const itemCount = (plain.orderItems || []).reduce(
                    (total: number, item: any) => total + Math.max(this.toNumber(item.quantity), 1),
                    0
                );

                return {
                    id: plain.id,
                    orderNumber: plain.orderNumber,
                    orderType: plain.orderType || ORDERTYPE.DELIVERY,
                    customer: plain.user ? {
                        id: plain.user.id,
                        name: plain.user.name,
                        email: plain.user.email,
                        phone: plain.user.phone,
                        avatar: plain.user.avatar
                    } : null,
                    recipient: plain.address ? {
                        name: plain.address.recipientName,
                        phone: plain.address.recipientPhone
                    } : null,
                    address: plain.address ? this.formatAddress(plain.address) : null,
                    table: plain.tableSession?.table ? {
                        id: plain.tableSession.table.id,
                        code: plain.tableSession.table.code,
                        name: plain.tableSession.table.name,
                        area: plain.tableSession.table.area,
                    } : null,
                    orderStatus: plain.orderStatus,
                    paymentMethod: plain.paymentMethod,
                    paymentStatus: plain.paymentStatus,
                    finalTotal: this.toNumber(plain.finalTotal),
                    itemCount,
                    createdAt: plain.createdAt
                };
            })
        };
    }

    async getMyOrders(userId: number, query: MyOrdersQuery = {}) {
        if (!userId) throw new BadRequestException('User id not found');

        const currentPage = Math.max(Number(query.page || 1), 1);
        const limitPage = Math.min(Math.max(Number(query.limit || 5), 1), 50);
        const offsetPage = (currentPage - 1) * limitPage;
        const search = query.search?.trim();
        const minPrice = Number(query.minPrice);
        const maxPrice = Number(query.maxPrice);
        const whereClause: any = { userId };

        if (query.orderStatus) {
            whereClause.orderStatus = query.orderStatus;
        }

        if (query.paymentStatus) {
            whereClause.paymentStatus = query.paymentStatus;
        }

        if (!Number.isNaN(minPrice) || !Number.isNaN(maxPrice)) {
            whereClause.finalTotal = {};
            if (!Number.isNaN(minPrice)) whereClause.finalTotal[Op.gte] = minPrice;
            if (!Number.isNaN(maxPrice)) whereClause.finalTotal[Op.lte] = maxPrice;
        }

        if (search) {
            whereClause[Op.or] = [
                { orderNumber: { [Op.iLike]: `%${search}%` } },
                { '$orderItems.product.name$': { [Op.iLike]: `%${search}%` } },
                { '$orderItems.combo.name$': { [Op.iLike]: `%${search}%` } }
            ];
        }

        let count = 0;
        let orders: Order[] = [];

        try {
            const result = await this.orderModel.findAndCountAll({
                where: whereClause,
                include: this.buildMyOrdersInclude(true),
                distinct: true,
                subQuery: false,
                limit: limitPage,
                offset: offsetPage,
                order: [['createdAt', 'DESC']]
            });

            count = result.count;
            orders = result.rows;
        } catch (error: any) {
            if (!this.isMissingNormalizedSchemaError(error)) {
                throw error;
            }

            this.logger.warn('Normalized order schema is not fully available yet. Falling back to metadata-only order history query.');

            const legacyResult = await this.orderModel.findAndCountAll({
                where: whereClause,
                include: this.buildMyOrdersInclude(false),
                distinct: true,
                subQuery: false,
                limit: limitPage,
                offset: offsetPage,
                order: [['createdAt', 'DESC']]
            });

            count = legacyResult.count;
            orders = legacyResult.rows;
        }

        const items = orders.map((order) => {
            const plain = order.get({ plain: true }) as any;
            const mappedOrderItems = (plain.orderItems || []).map((item: any) => {
                const metadata = item.metadata || {};
                const singleMetadata = metadata.singleItemMetadata || {};
                const normalizedComboItems = this.buildNormalizedComboItems(item);
                const legacyComboItems = this.buildLegacyComboItems(metadata.items || []);
                const comboItemsSource = normalizedComboItems.length > 0
                    ? 'NORMALIZED_SNAPSHOT'
                    : legacyComboItems.length > 0
                        ? 'LEGACY_METADATA'
                        : 'NONE';
                const normalizedIngredients = this.buildNormalizedSingleIngredients(item);

                return {
                    id: item.id,
                    productId: item.productId,
                    productVariantId: item.productVariantId,
                    comboId: item.comboId,
                    quantity: item.quantity,
                    name: metadata.itemName || item.product?.name || item.combo?.name || 'San pham',
                    imageUrl: item.product?.imageUrl || item.combo?.imageUrl || null,
                    variantName: singleMetadata.variantName || this.buildVariantName(item.productVariant) || '',
                    originalPrice: this.resolveOrderItemOriginalPrice(item, metadata, normalizedComboItems),
                    finalPrice: this.resolveOrderItemFinalPrice(item, metadata, normalizedComboItems),
                    comboPricing: this.buildComboPricing(item, metadata, normalizedComboItems),
                    comboItemsSource,
                    comboItems: normalizedComboItems.length > 0 ? normalizedComboItems : legacyComboItems,
                    ingredients: normalizedIngredients.length > 0 ? normalizedIngredients : (singleMetadata.ingredients || []),
                    metadata
                };
            });
            const derivedSubTotal = mappedOrderItems.reduce(
                (total: number, item: any) => total + (Number(item.finalPrice || 0) * Math.max(Number(item.quantity || 1), 1)),
                0
            );
            const deliveryFee = Number(plain.deliveryFee || 0);
            const discount = Number(plain.discount || 0);
            const effectiveSubTotal = derivedSubTotal > 0 ? derivedSubTotal : Number(plain.subTotal || 0);

            return {
                id: plain.id,
                orderNumber: plain.orderNumber,
                orderStatus: plain.orderStatus,
                paymentMethod: plain.paymentMethod,
                paymentStatus: plain.paymentStatus,
                subTotal: effectiveSubTotal,
                deliveryFee,
                discount,
                finalTotal: effectiveSubTotal - discount + deliveryFee,
                notes: plain.notes,
                paidAt: plain.paidAt,
                cancelledReason: plain.cancelledReason,
                cancelledAt: plain.cancelledAt,
                createdAt: plain.createdAt,
                updatedAt: plain.updatedAt,
                address: plain.address,
                items: mappedOrderItems
            };
        });

        return {
            items,
            pagination: {
                page: currentPage,
                limit: limitPage,
                totalItems: count,
                totalPages: Math.ceil(count / limitPage)
            }
        };
    }

    async payMyOrderNow(userId: number, orderId: number) {
        if (!userId) throw new BadRequestException('User id not found');

        const order = await this.orderModel.findOne({
            where: {
                id: orderId,
                userId
            }
        });

        if (!order) {
            throw new BadRequestException('Order not found');
        }

        if (order.orderStatus === ORDERSTATUS.CANCELLED) {
            throw new BadRequestException('Cancelled order cannot be paid');
        }

        if (order.paymentStatus === PAYMENTSTATUS.PAID) {
            throw new BadRequestException('Order has already been paid');
        }

        if (order.paymentMethod !== PAYMENTMETHOD.CASH && order.paymentMethod !== PAYMENTMETHOD.SEPAY) {
            throw new BadRequestException('This payment method cannot be switched to online payment');
        }

        const sepayPayment = await this.sepayService.createPayment({
            orderNumber: order.orderNumber,
            amount: Number(order.finalTotal || 0),
            orderInfo: `Thanh toán đơn hàng ${order.orderNumber}`
        });

        if (order.paymentMethod !== PAYMENTMETHOD.SEPAY || order.paymentStatus !== PAYMENTSTATUS.PENDING) {
            await order.update({
                paymentMethod: PAYMENTMETHOD.SEPAY,
                paymentStatus: PAYMENTSTATUS.PENDING,
                paidAt: null
            } as Partial<Order>);
        }

        await this.redisService.addPendingOrder(order.orderNumber);

        return {
            success: true,
            message: 'Vui lòng hoàn tất thanh toán chuyển khoản',
            data: {
                orderNumber: order.orderNumber,
                orderId: order.id,
                finalTotal: order.finalTotal,
                paymentMethod: PAYMENTMETHOD.SEPAY,
                paymentStatus: PAYMENTSTATUS.PENDING,
                paymentInfo: {
                    qrCode: sepayPayment.qrDataURL,
                    bankAccount: sepayPayment.bankAccount,
                    bankName: sepayPayment.bankName,
                    accountName: sepayPayment.accountName,
                    transferContent: sepayPayment.transferContent,
                    amount: sepayPayment.amount
                }
            }
        };
    }

    private async cancelOrder(
        id: number,
        options: {
            actor: 'admin' | 'user';
            userId?: number;
            reason?: string;
        }
    ) {
        const order = await this.orderModel.findByPk(id);
        if (!order) {
            throw new BadRequestException('Order not found');
        }

        if (options.actor === 'user' && order.userId !== options.userId) {
            throw new BadRequestException('Order not found');
        }

        if (order.orderStatus === ORDERSTATUS.CANCELLED) {
            throw new BadRequestException('Order already cancelled');
        }

        if (order.orderStatus === ORDERSTATUS.DELIVERED) {
            throw new BadRequestException('Delivered order cannot be cancelled');
        }

        if (options.actor === 'user') {
            await this.storePolicySettingService.assertUserCanCancelOrder(order);
        }

        const reason = options.reason?.trim()
            || (options.actor === 'admin' ? 'Admin cancelled order' : 'Customer cancelled order');
        const nextPaymentStatus = order.paymentStatus === PAYMENTSTATUS.PAID
            ? PAYMENTSTATUS.REFUNDED
            : order.paymentStatus === PAYMENTSTATUS.PENDING
                ? PAYMENTSTATUS.FAILED
                : order.paymentStatus;

        await order.update({
            orderStatus: ORDERSTATUS.CANCELLED,
            paymentStatus: nextPaymentStatus,
            cancelledReason: reason,
            cancelledAt: new Date()
        } as Partial<Order>);

        try {
            await this.redisService.removePendingOrder(order.orderNumber);
        } catch (error: any) {
            this.logger.warn(`Cannot remove pending order ${order.orderNumber} from Redis: ${error.message}`);
        }

        const updatedOrder = await this.orderModel.findByPk(id, {
            include: this.buildAdminOrderInclude()
        });

        if (!updatedOrder) {
            throw new BadRequestException('Order not found');
        }

        return this.mapAdminOrder(updatedOrder);
    }

    private buildAdminOrderDateWhere(query: AdminOrderDateRange = {}) {
        const whereClause: any = {};
        const fromDate = this.parseDateBoundary(query.fromDate, 'fromDate', false);
        const toDate = this.parseDateBoundary(query.toDate, 'toDate', true);

        if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
            throw new BadRequestException('fromDate must be before toDate');
        }

        if (fromDate || toDate) {
            whereClause.createdAt = {};
            if (fromDate) whereClause.createdAt[Op.gte] = fromDate;
            if (toDate) whereClause.createdAt[Op.lte] = toDate;
        }

        return whereClause;
    }

    private buildTodayOrderWhere() {
        const start = new Date();
        start.setHours(0, 0, 0, 0);

        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        end.setMilliseconds(end.getMilliseconds() - 1);

        return {
            createdAt: {
                [Op.gte]: start,
                [Op.lte]: end
            }
        };
    }

    private parseDateBoundary(value: string | undefined, fieldName: string, endOfDay: boolean) {
        if (!value) return null;

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            throw new BadRequestException(`${fieldName} is invalid`);
        }

        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            date.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
        }

        return date;
    }

    private parseLimit(value: string | number | undefined, fallback: number, max: number) {
        const limit = Number(value || fallback);
        if (Number.isNaN(limit)) return fallback;

        return Math.min(Math.max(Math.floor(limit), 1), max);
    }

    private toNumber(value: unknown) {
        const numberValue = Number(value || 0);
        return Number.isNaN(numberValue) ? 0 : numberValue;
    }

    private formatRevenueBucket(bucket: string | Date, groupBy: 'day' | 'week' | 'month') {
        const date = new Date(bucket);
        if (Number.isNaN(date.getTime())) return String(bucket);

        const isoDate = date.toISOString();
        if (groupBy === 'month') return isoDate.slice(0, 7);

        return isoDate.slice(0, 10);
    }

    private resolveTopItemFinalPrice(metadata: any) {
        const comboPricing = metadata?.comboPricing;
        if (comboPricing) {
            return this.toNumber(comboPricing.changedPrice || comboPricing.priceAfterChange || metadata.finalPrice);
        }

        return this.toNumber(metadata?.finalPrice || metadata?.originalPrice);
    }

    private buildAdminOrderInclude() {
        return [
            {
                model: User,
                attributes: ['id', 'name', 'email', 'phone', 'avatar']
            },
            {
                model: Address,
                attributes: ['id', 'recipientName', 'recipientPhone', 'street', 'ward', 'district', 'city'],
                required: false
            },
            {
                model: TableSession,
                attributes: ['id', 'tableId', 'status', 'openedByUserId', 'closedByUserId', 'closedAt'],
                required: false,
                include: [
                    {
                        model: DiningTable,
                        attributes: ['id', 'code', 'name', 'area', 'status']
                    }
                ]
            },
            {
                model: KitchenTicket,
                attributes: ['id', 'ticketNumber', 'status', 'source', 'createdAt'],
                required: false
            },
            {
                model: OrderItems,
                attributes: ['id', 'productId', 'productVariantId', 'comboId', 'kitchenTicketId', 'quantity', 'metadata'],
                include: [
                    {
                        model: Product,
                        attributes: ['id', 'name', 'imageUrl']
                    },
                    {
                        model: ProductVariant,
                        attributes: ['id', 'name', 'size', 'type', 'modifiedPrice']
                    },
                    {
                        model: Combo,
                        attributes: ['id', 'name', 'imageUrl']
                    }
                ]
            }
        ];
    }

    private mapAdminOrder(order: Order) {
        const plain = order.get({ plain: true }) as any;
        const items = (plain.orderItems || []).map((item: any) => {
            const metadata = item.metadata || {};
            const name = metadata.itemName || item.product?.name || item.combo?.name || 'San pham';
            const price = this.resolveTopItemFinalPrice(metadata);
            const comboItems = this.buildLegacyComboItems(metadata.items || []);
            const ingredients = metadata.singleItemMetadata?.ingredients || [];

            return {
                id: item.id,
                productId: item.productId || null,
                productVariantId: item.productVariantId || null,
                comboId: item.comboId || null,
                kitchenTicketId: item.kitchenTicketId || null,
                name,
                imageUrl: item.product?.imageUrl || item.combo?.imageUrl || null,
                variantName: metadata.singleItemMetadata?.variantName || this.buildVariantName(item.productVariant),
                quantity: Math.max(this.toNumber(item.quantity), 1),
                originalPrice: this.toNumber(metadata.originalPrice || price),
                price,
                comboPricing: metadata.comboPricing || null,
                comboItems,
                ingredients,
                metadata
            };
        });
        const itemCount = items.reduce((total: number, item: any) => total + item.quantity, 0);

        return {
            id: plain.id,
            orderNumber: plain.orderNumber,
            orderType: plain.orderType || ORDERTYPE.DELIVERY,
            customer: plain.user ? {
                id: plain.user.id,
                name: plain.user.name,
                email: plain.user.email,
                phone: plain.user.phone,
                avatar: plain.user.avatar
            } : null,
            recipient: plain.address ? {
                name: plain.address.recipientName,
                phone: plain.address.recipientPhone
            } : null,
            address: plain.address ? this.formatAddress(plain.address) : null,
            table: plain.tableSession?.table ? {
                id: plain.tableSession.table.id,
                code: plain.tableSession.table.code,
                name: plain.tableSession.table.name,
                area: plain.tableSession.table.area,
                status: plain.tableSession.table.status,
            } : null,
            tableSession: plain.tableSession ? {
                id: plain.tableSession.id,
                tableId: plain.tableSession.tableId,
                status: plain.tableSession.status,
                openedByUserId: plain.tableSession.openedByUserId,
                closedByUserId: plain.tableSession.closedByUserId,
                closedAt: plain.tableSession.closedAt,
            } : null,
            orderStatus: plain.orderStatus,
            paymentMethod: plain.paymentMethod,
            paymentStatus: plain.paymentStatus,
            subTotal: this.toNumber(plain.subTotal),
            deliveryFee: this.toNumber(plain.deliveryFee),
            discount: this.toNumber(plain.discount),
            finalTotal: this.toNumber(plain.finalTotal),
            notes: plain.notes,
            paidAt: plain.paidAt,
            cancelledReason: plain.cancelledReason,
            cancelledAt: plain.cancelledAt,
            itemCount,
            ticketCount: Array.isArray(plain.kitchenTickets) ? plain.kitchenTickets.length : 0,
            kitchenTickets: (plain.kitchenTickets || []).map((ticket: any) => ({
                id: ticket.id,
                ticketNumber: ticket.ticketNumber,
                status: ticket.status,
                source: ticket.source,
                createdAt: ticket.createdAt,
            })),
            items,
            createdAt: plain.createdAt,
            updatedAt: plain.updatedAt
        };
    }

    private formatAddress(address: any) {
        return [address.street, address.ward, address.district, address.city]
            .filter(Boolean)
            .join(', ');
    }

    private buildMyOrdersInclude(includeNormalized: boolean) {
        const orderItemInclude: any[] = [
            {
                model: Product,
                attributes: ['id', 'name', 'imageUrl']
            },
            {
                model: ProductVariant,
                attributes: ['id', 'size', 'type', 'modifiedPrice']
            },
            {
                model: Combo,
                attributes: ['id', 'name', 'imageUrl', 'price', 'discountPercentage']
            }
        ];

        if (includeNormalized) {
            orderItemInclude.push(
                {
                    model: OrderItemIngredient,
                    attributes: ['id', 'ingredientId', 'quantity', 'type', 'ingredientNameSnapshot', 'priceSnapshot']
                },
                {
                    model: OrderItemComboOption,
                    attributes: [
                        'id',
                        'comboItemId',
                        'slotIndex',
                        'selectedProductId',
                        'selectedProductVariantId',
                        'productNameSnapshot',
                        'variantNameSnapshot',
                        'unitPriceSnapshot',
                        'originalProductNameSnapshot',
                        'originalVariantNameSnapshot',
                        'selectedProductNameSnapshot',
                        'selectedVariantNameSnapshot',
                        'originalVariantModifiedPriceSnapshot',
                        'selectedVariantModifiedPriceSnapshot',
                        'variantSurchargeSnapshot',
                        'ingredientSurchargeSnapshot',
                        'surchargeSnapshot'
                    ],
                    include: [
                        {
                            model: ComboItem,
                            attributes: ['id', 'productId', 'productVariantId', 'quantity'],
                            include: [
                                {
                                    model: Product,
                                    attributes: ['id', 'name', 'imageUrl']
                                },
                                {
                                    model: ProductVariant,
                                    attributes: ['id', 'size', 'type', 'modifiedPrice']
                                }
                            ]
                        },
                        {
                            model: OrderItemComboOptionIngredient,
                            attributes: ['id', 'ingredientId', 'ingredientNameSnapshot', 'quantity', 'priceSnapshot', 'type']
                        }
                    ]
                }
            );
        }

        return [
            {
                model: Address,
                attributes: ['id', 'recipientName', 'recipientPhone', 'street', 'ward', 'district', 'city']
            },
            {
                model: OrderItems,
                attributes: ['id', 'productId', 'productVariantId', 'comboId', 'quantity', 'metadata'],
                include: orderItemInclude
            }
        ];
    }

    private isMissingNormalizedSchemaError(error: any) {
        const message = String(error?.message || error?.original?.message || '');
        const sql = String(error?.sql || '');
        const combined = `${message} ${sql}`;

        if (error?.name !== 'SequelizeDatabaseError') {
            return false;
        }

        return (
            combined.includes('ingredientNameSnapshot') ||
            combined.includes('priceSnapshot') ||
            combined.includes('originalProductNameSnapshot') ||
            combined.includes('variantSurchargeSnapshot') ||
            combined.includes('surchargeSnapshot') ||
            combined.includes('OrderItemComboOptions') ||
            combined.includes('OrderItemComboOptionIngredients')
        );
    }

    private buildVariantName(productVariant?: any) {
        if (!productVariant) return '';

        if (productVariant.size && productVariant.type) {
            return `${productVariant.size} - ${productVariant.type}`;
        }

        return '';
    }

    private buildNormalizedSingleIngredients(item: any) {
        const orderItemIngredients = item.orderItemIngredients || [];
        const orderItemQuantity = Math.max(Number(item.quantity || 1), 1);
        const hasSnapshots = orderItemIngredients.some((ingredient: any) =>
            ingredient.ingredientNameSnapshot !== null &&
            ingredient.ingredientNameSnapshot !== undefined
        );

        if (!hasSnapshots) return [];

        return orderItemIngredients.map((ingredient: any) => {
            const quantity = Number(ingredient.quantity || 0) / orderItemQuantity;
            const price = Number(ingredient.priceSnapshot || 0);

            return {
                name: ingredient.ingredientNameSnapshot || `Ingredient ${ingredient.ingredientId}`,
                quantity,
                price,
                totalPrice: ingredient.type === 'ADD' ? price * quantity : 0,
                type: ingredient.type || 'ADD'
            };
        });
    }

    private buildNormalizedComboItems(item: any) {
        const orderItemComboOptions = item.orderItemComboOptions || [];
        if (orderItemComboOptions.length === 0) return [];

        return orderItemComboOptions
            .slice()
            .sort((a: any, b: any) => {
                const slotDiff = Number(a.slotIndex || 0) - Number(b.slotIndex || 0);
                if (slotDiff !== 0) return slotDiff;
                return Number(a.id || 0) - Number(b.id || 0);
            })
            .map((option: any) => {
                const comboItem = option.comboItem || {};
                const defaultProduct = comboItem.product || {};
                const defaultVariant = comboItem.productVariant || {};

                const defaultProductId = comboItem.productId ? Number(comboItem.productId) : null;
                const defaultVariantId = comboItem.productVariantId ? Number(comboItem.productVariantId) : null;
                const defaultProductName = option.originalProductNameSnapshot || defaultProduct.name || option.productNameSnapshot || `Product ${option.selectedProductId}`;
                const defaultVariantName = option.originalVariantNameSnapshot || this.buildVariantName(defaultVariant);
                const defaultUnitPrice = Number(option.originalVariantModifiedPriceSnapshot ?? defaultVariant.modifiedPrice ?? 0);

                const selectedProductId = Number(option.selectedProductId || 0);
                const selectedVariantId = Number(option.selectedProductVariantId || 0);
                const selectedProductName = option.selectedProductNameSnapshot || option.productNameSnapshot || defaultProductName;
                const selectedVariantName = option.selectedVariantNameSnapshot || option.variantNameSnapshot || defaultVariantName;
                const selectedUnitPrice = Number(option.selectedVariantModifiedPriceSnapshot ?? option.unitPriceSnapshot ?? 0);

                const isReplacement =
                    (defaultProductId !== null && selectedProductId !== defaultProductId) ||
                    (defaultVariantId !== null && selectedVariantId !== defaultVariantId);

                const variantPriceDelta = option.variantSurchargeSnapshot !== null && option.variantSurchargeSnapshot !== undefined
                    ? Number(option.variantSurchargeSnapshot || 0)
                    : (isReplacement ? selectedUnitPrice - defaultUnitPrice : 0);

                const ingredients = (option.ingredients || []).map((ingredient: any) => {
                    const quantity = Number(ingredient.quantity || 1);
                    const unitPrice = Number(ingredient.priceSnapshot || 0);
                    const totalPrice = ingredient.type === 'ADD'
                        ? unitPrice * quantity
                        : 0;

                    return {
                        name: ingredient.ingredientNameSnapshot || `Ingredient ${ingredient.ingredientId}`,
                        quantity,
                        price: unitPrice,
                        totalPrice,
                        type: ingredient.type || 'ADD'
                    };
                });

                const calculatedIngredientPriceDelta = ingredients.reduce(
                    (total: number, ingredient: any) => total + Number(ingredient.totalPrice || 0),
                    0
                );
                const ingredientPriceDelta = option.ingredientSurchargeSnapshot !== null && option.ingredientSurchargeSnapshot !== undefined
                    ? Number(option.ingredientSurchargeSnapshot || 0)
                    : calculatedIngredientPriceDelta;
                const surcharge = option.surchargeSnapshot !== null && option.surchargeSnapshot !== undefined
                    ? Number(option.surchargeSnapshot || 0)
                    : variantPriceDelta + ingredientPriceDelta;

                return {
                    comboItemId: Number(option.comboItemId || 0),
                    slotIndex: Number(option.slotIndex || 0),
                    originalItem: {
                        productId: defaultProductId,
                        productName: defaultProductName,
                        variantId: defaultVariantId,
                        variantName: defaultVariantName,
                        unitPrice: defaultUnitPrice
                    },
                    changedItem: isReplacement ? {
                        productId: selectedProductId,
                        productName: selectedProductName,
                        variantId: selectedVariantId,
                        variantName: selectedVariantName,
                        unitPrice: selectedUnitPrice
                    } : null,
                    originalProductName: defaultProductName,
                    originalVariantName: defaultVariantName,
                    originalUnitPrice: defaultUnitPrice,
                    changedProductName: isReplacement ? selectedProductName : null,
                    changedVariantName: isReplacement ? selectedVariantName : null,
                    changedUnitPrice: isReplacement ? selectedUnitPrice : null,
                    variantPriceDelta,
                    variantSurcharge: variantPriceDelta,
                    isChanged: isReplacement,
                    surcharge,
                    quantity: 1,
                    ingredients,
                    ingredientPriceDelta
                };
            });
    }

    private buildLegacyComboItems(metadataItems: any[]) {
        if (!Array.isArray(metadataItems) || metadataItems.length === 0) return [];

        const replacedOriginalItems = metadataItems
            .filter((metadataItem: any) => metadataItem.changedProductName || metadataItem.changedVariantName)
            .map((metadataItem: any) => ({
                productName: metadataItem.originalProductName || metadataItem.productName,
                variantName: metadataItem.originalVariantName || metadataItem.variantName
            }))
            .filter((metadataItem: any) => metadataItem.productName);

        const visibleItems = metadataItems.filter((metadataItem: any) => {
            if (metadataItem.changedProductName || metadataItem.changedVariantName) {
                return true;
            }

            return !replacedOriginalItems.some((originalItem: any) => {
                const sameProduct = originalItem.productName === metadataItem.productName ||
                    originalItem.productName === metadataItem.selectedProductName ||
                    originalItem.productName === metadataItem.displayName;
                const originalVariant = originalItem.variantName || '';
                const currentVariant = metadataItem.variantName || metadataItem.selectedVariantName || metadataItem.displayVariantName || '';

                return sameProduct && (!originalVariant || !currentVariant || originalVariant === currentVariant);
            });
        });

        return visibleItems.map((metadataItem: any) => {
            const productName = metadataItem.changedProductName || metadataItem.selectedProductName || metadataItem.productName || 'San pham trong combo';
            const variantName = metadataItem.changedVariantName || metadataItem.selectedVariantName || metadataItem.variantName || '';

            return {
                ...metadataItem,
                productName,
                variantName,
                selectedProductName: productName,
                selectedVariantName: variantName,
                displayName: productName,
                displayVariantName: variantName,
                originalProductName: undefined,
                originalVariantName: undefined,
                changedProductName: null,
                changedVariantName: null,
                isLegacySelectionOnly: true,
                ingredients: Array.isArray(metadataItem.ingredients) ? metadataItem.ingredients : []
            };
        });
    }

    private buildComboPricing(item: any, metadata: any, normalizedComboItems: any[]) {
        if (!item?.comboId) {
            return null;
        }

        const snapshotPricing = metadata?.comboPricing;
        if (snapshotPricing) {
            const variantSurcharge = Number(snapshotPricing.variantSurcharge || 0);
            const ingredientSurcharge = Number(snapshotPricing.ingredientSurcharge || 0);
            const totalSurcharge = Number(snapshotPricing.totalSurcharge || variantSurcharge + ingredientSurcharge);
            const originalPrice = Number(
                snapshotPricing.originalPrice ||
                snapshotPricing.discountedBasePrice ||
                Math.max(Number(snapshotPricing.priceAfterChange || metadata?.finalPrice || 0) - totalSurcharge, 0)
            );
            const changedPrice = Number(snapshotPricing.changedPrice || snapshotPricing.priceAfterChange || originalPrice + totalSurcharge);

            return {
                originalPrice,
                changedPrice,
                totalSurcharge,
                variantSurcharge,
                ingredientSurcharge,
                basePrice: Number(snapshotPricing.basePrice || 0),
                discountedBasePrice: Number(snapshotPricing.discountedBasePrice || originalPrice),
                originalListPrice: Number(snapshotPricing.basePrice || metadata?.originalPrice || 0),
                discountPercentage: Number(snapshotPricing.discountPercentage || 0),
                savedAmount: Number(snapshotPricing.savedAmount || 0)
            };
        }

        const comboBasePrice = Number(item?.combo?.price || 0);
        const comboDiscountPercentage = Number(item?.combo?.discountPercentage || 0);
        const discountedComboBasePrice = Math.ceil(
            (comboBasePrice * (1 - (comboDiscountPercentage / 100))) / 1000
        ) * 1000;
        const fallbackFinalPrice = Number(metadata?.finalPrice || 0);
        const fallbackOriginalPrice = Number(metadata?.originalPrice || 0);

        if (normalizedComboItems.length === 0) {
            const legacyOriginalPrice = fallbackOriginalPrice || fallbackFinalPrice || discountedComboBasePrice;
            const legacyChangedPrice = fallbackFinalPrice || legacyOriginalPrice;

            return {
                originalPrice: legacyOriginalPrice,
                changedPrice: legacyChangedPrice,
                totalSurcharge: 0,
                variantSurcharge: 0,
                ingredientSurcharge: 0,
                basePrice: fallbackOriginalPrice || comboBasePrice,
                discountedBasePrice: legacyOriginalPrice,
                originalListPrice: fallbackOriginalPrice || comboBasePrice,
                discountPercentage: comboDiscountPercentage,
                savedAmount: 0
            };
        }

        const variantSurcharge = normalizedComboItems.reduce(
            (total: number, comboItem: any) => total + Number(comboItem.variantPriceDelta || 0),
            0
        );
        const ingredientSurcharge = normalizedComboItems.reduce(
            (total: number, comboItem: any) => total + Number(comboItem.ingredientPriceDelta || 0),
            0
        );
        const totalSurcharge = variantSurcharge + ingredientSurcharge;
        const comboOriginalPrice = discountedComboBasePrice || Math.max(fallbackFinalPrice - totalSurcharge, 0);
        const comboChangedPrice = comboOriginalPrice + totalSurcharge;

        return {
            originalPrice: Math.max(comboOriginalPrice, 0),
            changedPrice: Math.max(comboChangedPrice, 0),
            totalSurcharge,
            variantSurcharge,
            ingredientSurcharge,
            basePrice: comboBasePrice || fallbackOriginalPrice,
            discountedBasePrice: discountedComboBasePrice || comboOriginalPrice,
            originalListPrice: comboBasePrice || fallbackOriginalPrice,
            discountPercentage: comboDiscountPercentage,
            savedAmount: Math.max((comboBasePrice || 0) - (discountedComboBasePrice || 0), 0)
        };
    }

    private resolveOrderItemOriginalPrice(item: any, metadata: any, normalizedComboItems: any[]) {
        const comboPricing = this.buildComboPricing(item, metadata, normalizedComboItems);
        if (comboPricing) {
            return Number(comboPricing.originalPrice || 0);
        }

        return Number(metadata?.originalPrice || 0);
    }

    private resolveOrderItemFinalPrice(item: any, metadata: any, normalizedComboItems: any[]) {
        const comboPricing = this.buildComboPricing(item, metadata, normalizedComboItems);
        if (comboPricing) {
            return Number(comboPricing.changedPrice || 0);
        }

        return Number(metadata?.finalPrice || 0);
    }

    async createOrder(orderData: CreateOrderDto): Promise<Order> {

        const transaction = await this.sequelize.transaction()

        try {
            const address = await this.addressModel.findByPk(orderData.addressId, { transaction });
            if (!address) {
                throw new BadRequestException('Address not found');
            }
            if (address.userId !== orderData.userId) {
                throw new BadRequestException('This address does not belong to this user');
            }

            const distanceResult = await this.addressService.caculateDistance(address.latitude, address.longitude);

            if (!Helper.validateDeliveryDistance(distanceResult.distance)) {
                throw new BadRequestException(Helper.buildDeliveryRangeError(distanceResult.distance));
            }

            const deliveryFee = Helper.caculateDeliveryFee(distanceResult.distance);

            const subTotal = await this.caculateSubtotal(orderData.orderItems, transaction);
            const discount = orderData.discount ? orderData.discount : 0;

            const finalTotal = subTotal - discount + deliveryFee;

            const orderNumber = await Helper.generateOrderNumber();

            const newOrder = await this.orderModel.create({
                orderNumber,
                userId: orderData.userId,
                addressId: orderData.addressId,
                orderStatus: ORDERSTATUS.PENDING,
                paymentMethod: orderData.paymentMethod,
                paymentStatus: PAYMENTSTATUS.PENDING,
                subTotal,
                deliveryFee,
                discount,
                finalTotal,
                notes: orderData.note || null
            } as Order, { transaction });

            await this.createOrderItems(newOrder.id, orderData.orderItems, transaction);

            await transaction.commit();

            return await this.orderModel.findByPk(newOrder.id, {
                include: [
                    {
                        model: Address,
                        attributes: ['address', 'latitude', 'longitude']
                    },
                    {
                        model: User,
                        attributes: ['firstName', 'lastName']
                    },
                    {
                        model: OrderItems,
                        include: [
                            {
                                model: Product,
                                attributes: ['name', 'basePrice', 'imageUrl']
                            },
                            {
                                model: ProductVariant,
                                attributes: ['name', 'size', 'type', 'modifiedPrice']
                            },
                            {
                                model: OrderItemIngredient,
                                include: [
                                    {
                                        model: Ingredient,
                                        attributes: ['name', 'price']
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }) as Order;

        } catch (error: any) {
            console.log(error.message);
            await transaction.rollback();
            throw error
        }
    }

    async caculateSubtotal(orderItems: CreateOrderDto['orderItems'], transaction: any): Promise<number> {
        let subToal = 0

        for (const item of orderItems) {
            let productPrice = 0
            const product = await this.productModel.findByPk(item.productId, { transaction });
            if (item.productVariantId) {
                const productVariant = await this.productVariantModel.findByPk(item.productVariantId, { transaction });

                if (product && product.dataValues && productVariant && productVariant.dataValues) {
                    productPrice = product?.dataValues?.basePrice + productVariant?.dataValues?.modifiedPrice
                }
            } else {
                if (product && product.dataValues) {
                    productPrice = product?.dataValues?.basePrice
                }
            }
            let ingredientPrice = 0
            if (item.ingredients) {
                for (const ingredients of item.ingredients) {
                    const ingredient = await this.ingredientModel.findByPk(ingredients.ingredientId, { transaction });

                    if (ingredient && ingredient.dataValues) {
                        ingredientPrice += (ingredient?.dataValues?.price || 0) * ingredients.quantity
                    }
                }
            }

            subToal += (productPrice + ingredientPrice) * item.quantity
        }

        return subToal
    }

    async createOrderItems(orderId: number, orderItem: CreateOrderDto['orderItems'], transaction: any): Promise<void> {
        for (const item of orderItem) {
            const newOrderItem = await this.orderItemsModel.create({
                orderId,
                productId: item.productId,
                productVariantId: item.productVariantId,
                quantity: item.quantity
            } as OrderItems, { transaction });

            if (item.ingredients) {
                for (const ingredients of item.ingredients) {
                    await this.orderItemsIngredientModel.create({
                        orderItemId: newOrderItem.id,
                        ingredientId: ingredients.ingredientId,
                        quantity: ingredients.quantity
                    } as OrderItemIngredient, { transaction });
                }
            }
        }
    }
}
