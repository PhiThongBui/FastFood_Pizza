import { Helper } from '@/utils/helper';
import { CartCheckoutOutput, CartPreviewItem, CartPreviewOutput } from './types/cart-prev.type';
import {
    Address,
    CartItemComboOption,
    CartItemComboOptionIngredient,
    CartItems,
    CartItemsIngredient,
    Combo,
    ComboItem,
    Ingredient,
    Product,
    ProductVariant
} from '@/models';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { CheckoutCaculateDto } from './dto/checkout.dto';
import { AddressService } from '../address/address.service';
import { CouponService } from '../coupon/coupon.service';

@Injectable()
export class CartPreviewService {
    constructor(
        @InjectModel(CartItems) private cartItemsModel: typeof CartItems,
        @InjectModel(CartItemsIngredient) private cartItemsIngredientModel: typeof CartItemsIngredient,
        @InjectModel(ProductVariant) private productVariantModel: typeof ProductVariant,
        @InjectModel(Ingredient) private ingredientModel: typeof Ingredient,
        @InjectModel(Address) private addressModel: typeof Address,
        @InjectModel(Product) private productModel: typeof Product,
        @InjectModel(Combo) private comboModel: typeof Combo,
        @InjectModel(ComboItem) private comboItemModel: typeof ComboItem,
        @InjectModel(CartItemComboOption) private cartItemComboOptionModel: typeof CartItemComboOption,
        @InjectModel(CartItemComboOptionIngredient) private cartItemComboOptionIngredientModel: typeof CartItemComboOptionIngredient,
        private readonly addressService: AddressService,
        private readonly couponService: CouponService,
    ) { }

    async getUserCartPreview(cartId: number, cartItemIds?: number[]): Promise<CartPreviewOutput> {
        const cartItems = await this.cartItemsModel.findAll({
            where: {
                cartId,
                ...(cartItemIds && cartItemIds.length > 0 ? { id: { [Op.in]: cartItemIds } } : {})
            },
            include: [
                { model: this.productModel, attributes: ['id', 'name', 'basePrice', 'imageUrl', 'isActive'], required: false },
                {
                    model: this.productVariantModel,
                    attributes: ['id', 'name', 'size', 'type', 'modifiedPrice', 'productId', 'isActive'],
                    required: false,
                    include: [
                        {
                            model: this.productModel,
                            attributes: ['id', 'name', 'basePrice', 'imageUrl', 'isActive'],
                            required: false
                        }
                    ]
                },
                { model: this.comboModel, attributes: ['id', 'name', 'price', 'imageUrl', 'discountPercentage', 'isActive'], required: false },
                {
                    model: this.cartItemsIngredientModel,
                    required: false,
                    include: [{ model: this.ingredientModel, attributes: ['id', 'name', 'price', 'isActive'] }]
                },
                {
                    model: this.cartItemComboOptionModel,
                    required: false,
                    include: [
                        {
                            model: this.comboItemModel,
                            required: false,
                            include: [
                                {
                                    model: this.productVariantModel,
                                    attributes: ['id', 'name', 'size', 'type', 'modifiedPrice', 'productId', 'isActive'],
                                    required: false
                                }
                            ]
                        },
                        {
                            model: this.cartItemComboOptionIngredientModel,
                            required: false,
                            include: [{ model: this.ingredientModel, attributes: ['id', 'name', 'price', 'isActive'] }]
                        }
                    ]
                }
            ],
            order: [['createdAt', 'DESC']]
        });

        if (!cartItems || cartItems.length === 0) {
            return { message: 'Giỏ hàng trống', data: { items: [], totalAmount: 0 } };
        }

        const comboIdsInCart = new Set<number>();
        const selectedProductIds = new Set<number>();
        const selectedVariantIds = new Set<number>();

        cartItems.forEach(item => {
            if (item.dataValues.comboId) comboIdsInCart.add(Number(item.dataValues.comboId));
            (item.dataValues.comboOptions || []).forEach(option => {
                selectedProductIds.add(Number(option.dataValues.selectedProductId));
                selectedVariantIds.add(Number(option.dataValues.selectedProductVariantId));
            });
        });

        const defaultComboItems = await this.comboItemModel.findAll({
            where: { comboId: { [Op.in]: Array.from(comboIdsInCart) } },
            include: [
                { model: this.productModel, attributes: ['id', 'name', 'basePrice', 'imageUrl', 'isActive'] },
                {
                    model: this.productVariantModel,
                    attributes: ['id', 'name', 'size', 'type', 'modifiedPrice', 'productId', 'isActive'],
                    include: [
                        {
                            model: this.productModel,
                            attributes: ['id', 'name', 'basePrice', 'imageUrl', 'isActive'],
                            required: false
                        }
                    ]
                }
            ],
            order: [['id', 'ASC']]
        });

        const comboDefaultsMap = new Map<number, { comboItem: ComboItem; slotIndex: number }[]>();
        defaultComboItems.forEach(comboItem => {
            const comboId = Number(comboItem.comboId);
            if (!comboDefaultsMap.has(comboId)) comboDefaultsMap.set(comboId, []);

            const qty = Number(comboItem.quantity || 1);
            for (let slotIndex = 0; slotIndex < qty; slotIndex++) {
                comboDefaultsMap.get(comboId)?.push({ comboItem, slotIndex });
            }
        });

        const [selectedProducts, selectedVariants] = await Promise.all([
            selectedProductIds.size > 0
                ? this.productModel.findAll({
                    where: { id: { [Op.in]: Array.from(selectedProductIds) } },
                    attributes: ['id', 'name', 'basePrice', 'imageUrl', 'isActive']
                })
                : [],
            selectedVariantIds.size > 0
                ? this.productVariantModel.findAll({
                    where: { id: { [Op.in]: Array.from(selectedVariantIds) } },
                    attributes: ['id', 'name', 'size', 'type', 'modifiedPrice', 'productId', 'isActive'],
                    include: [
                        {
                            model: this.productModel,
                            attributes: ['id', 'name', 'basePrice', 'imageUrl', 'isActive'],
                            required: false
                        }
                    ]
                })
                : []
        ]);

        const selectedProductMap = new Map<number, Product>(selectedProducts.map(product => [Number(product.id), product] as [number, Product]));
        const selectedVariantMap = new Map<number, ProductVariant>(selectedVariants.map(variant => [Number(variant.id), variant] as [number, ProductVariant]));
        let subtotal = 0;
        const previewItems: CartPreviewItem[] = [];

        for (const item of cartItems) {
            const finalItemObj = item.dataValues.comboId
                ? this.buildComboPreviewItem(
                    item,
                    comboDefaultsMap,
                    selectedProductMap,
                    selectedVariantMap
                )
                : this.buildSinglePreviewItem(item);

            if (!finalItemObj) continue;

            subtotal += finalItemObj.totalPrice;
            previewItems.push(finalItemObj);
        }

        return {
            message: 'Lấy thông tin giỏ hàng thành công.',
            data: {
                items: previewItems,
                totalAmount: subtotal,
                itemCount: previewItems.length,
                totalQuantity: previewItems.reduce(
                    (total, item) => total + Number(item.quantity || 0),
                    0
                )
            }
        };
    }

    async cartPreview(cartId: number, cartItemIds: number[]): Promise<CartPreviewOutput> {
        return this.getUserCartPreview(cartId, cartItemIds);
    }

    async checkoutCaculate(userId: number, cartId: number, dto: CheckoutCaculateDto): Promise<CartCheckoutOutput> {
        const checkoutItemIds = dto.cartItemIds || dto.cartItemId || [];
        if (checkoutItemIds.length === 0) {
            throw new BadRequestException('Cart item ids are required for checkout.');
        }
        const cartPrev = await this.cartPreview(cartId, checkoutItemIds);

        if (!cartPrev) {
            throw new BadRequestException('No valid cart items found for preview.');
        }

        let deliveryFee = 0;

        if (dto.temporaryAddress) {
            const distanceResult = await this.addressService.caculateDistance(dto.temporaryAddress.latitude, dto.temporaryAddress.longitude);
            if (!Helper.validateDeliveryDistance(distanceResult.distance)) {
                throw new BadRequestException(Helper.buildDeliveryRangeError(distanceResult.distance));
            }
            deliveryFee = Helper.caculateDeliveryFee(distanceResult.distance);
        } else if (dto.addressId) {
            const address = await this.addressModel.findByPk(dto.addressId);
            if (!address) {
                throw new BadRequestException('No valid address found for checkout.');
            }
            if (Number(address.dataValues.userId) !== Number(userId)) {
                throw new BadRequestException('This address does not belong to this user.');
            }

            const distanceResult = await this.addressService.caculateDistance(address.dataValues.latitude, address.dataValues.longitude);
            if (!Helper.validateDeliveryDistance(distanceResult.distance)) {
                throw new BadRequestException(Helper.buildDeliveryRangeError(distanceResult.distance));
            }
            deliveryFee = Helper.caculateDeliveryFee(distanceResult.distance);
        }

        let discount = 0;
        let appliedCoupon: any;
        if (dto.couponCode) {
            const validateCoupon = await this.couponService.validateCoupon(userId, dto.couponCode, cartPrev.data.totalAmount);
            discount = validateCoupon.discount;
            appliedCoupon = validateCoupon.couponInfo;
        }

        const subtotal = cartPrev.data.totalAmount;
        const finalTotal = subtotal + deliveryFee - discount;

        return {
            message: 'Cart checkout generated successfully.',
            data: {
                items: cartPrev.data.items || [],
                subtotal,
                deliveryFee,
                discount,
                finalTotal,
                appliedCoupon: appliedCoupon
                    ? {
                        code: appliedCoupon.code,
                        type: appliedCoupon.type,
                        value: appliedCoupon.value
                    }
                    : undefined
            }
        };
    }

    private buildComboPreviewItem(
        item: CartItems,
        comboDefaultsMap: Map<number, { comboItem: ComboItem; slotIndex: number }[]>,
        selectedProductMap: Map<number, Product>,
        selectedVariantMap: Map<number, ProductVariant>
    ): CartPreviewItem | null {
        const comboInstance = item.dataValues.combo;
        if (!comboInstance || comboInstance.dataValues.isActive === false) return null;

        const comboData = comboInstance.dataValues;
        const defaultSlots = comboDefaultsMap.get(Number(comboData.id)) || [];
        if (defaultSlots.length === 0) return null;
        const optionMap = new Map<string, CartItemComboOption>();

        (item.dataValues.comboOptions || []).forEach(option => {
            optionMap.set(`${option.dataValues.comboItemId}:${option.dataValues.slotIndex}`, option);
        });

        const discountPercent = Number(comboData.discountPercentage || 0);
        const comboBasePrice = Number(comboData.price || 0);
        const discountedComboBasePrice = Math.ceil((comboBasePrice * (1 - (discountPercent / 100))) / 1000) * 1000;
        let itemUnitPrice = discountedComboBasePrice;
        let surchargeTotal = 0;
        let variantSurchargeTotal = 0;
        let ingredientSurchargeTotal = 0;
        const comboDetailsDisplayMap = new Map<string, {
            productName: string;
            variantName: string;
            originalProductName: string;
            originalVariantName: string;
            selectedProductName: string;
            selectedVariantName: string;
            isChanged: boolean;
            ingredients: any[];
            surcharge: number;
            variantSurcharge: number;
            ingredientSurcharge: number;
            quantity: number;
        }>();
        const enrichedOptions: any[] = [];

        for (const slot of defaultSlots) {
            const defaultItem = slot.comboItem;
            const defaultVariant = defaultItem.dataValues.productVariant;
            const defaultVariantData = this.getEntityData<any>(defaultVariant);
            const defaultProductData = this.resolveProductForVariant(defaultVariant, defaultItem.dataValues.product);
            if (!this.isUsableProductVariantPair(defaultProductData, defaultVariantData)) {
                return null;
            }

            const option = optionMap.get(`${defaultItem.id}:${slot.slotIndex}`);
            let optionData: any = null;
            let selectedProductData = defaultProductData;
            let selectedVariantData = defaultVariantData;
            let canUseCustomizedSelection = false;

            if (option) {
                optionData = this.getEntityData<any>(option);
                const selectedVariant = selectedVariantMap.get(Number(optionData?.selectedProductVariantId));
                const selectedVariantResolvedData = this.getEntityData<any>(selectedVariant);
                const selectedProductResolvedData = this.resolveProductForVariant(
                    selectedVariant,
                    selectedProductMap.get(Number(optionData?.selectedProductId))
                );

                // Nếu custom selection không còn hợp lệ thì fallback về cấu hình mặc định của slot
                // để preview không hiển thị sai sản phẩm hoặc tính sai surcharge.
                if (this.isUsableProductVariantPair(selectedProductResolvedData, selectedVariantResolvedData)) {
                    selectedProductData = selectedProductResolvedData;
                    selectedVariantData = selectedVariantResolvedData;
                    canUseCustomizedSelection = true;
                }
            }

            const optionComboItemData = this.getEntityData<any>(optionData?.comboItem);
            const optionComboItemVariantData = this.getEntityData<any>(optionComboItemData?.productVariant);
            const comboItemVariantData = optionComboItemVariantData || defaultVariantData;
            const defaultVariantId = Number(optionComboItemData?.productVariantId || comboItemVariantData?.id || 0);
            const selectedVariantIdFromOption = Number(optionData?.selectedProductVariantId || 0);
            const variantSurcharge =
                canUseCustomizedSelection &&
                selectedVariantIdFromOption > 0 &&
                selectedVariantIdFromOption !== defaultVariantId
                    ? Number(selectedVariantData.modifiedPrice || 0) - Number(comboItemVariantData?.modifiedPrice || 0)
                    : 0;
            let surcharge = variantSurcharge;
            const ingredientsDisplay: string[] = [];
            const enrichedIngredients: any[] = [];

            if (canUseCustomizedSelection) {
                for (const optionIngredient of optionData?.ingredients || []) {
                    const optionIngredientData = this.getEntityData<any>(optionIngredient);
                    const ingredientData = this.getEntityData<any>(optionIngredientData?.ingredient);
                    if (!ingredientData || ingredientData.isActive === false) continue;

                    enrichedIngredients.push({
                        ingredientId: ingredientData.id,
                        quantity: optionIngredientData.quantity,
                        type: optionIngredientData.type,
                        name: ingredientData.name,
                        price: ingredientData.price
                    });

                    if (optionIngredientData.type === 'ADD') {
                        const toppingTotal = Number(ingredientData.price || 0) * Number(optionIngredientData.quantity || 1);
                        surcharge += toppingTotal;
                        ingredientsDisplay.push(`+ ${ingredientData.name} (x${optionIngredientData.quantity})`);
                    } else {
                        ingredientsDisplay.push(`- ${ingredientData.name}`);
                    }
                }
            }

            const ingredientSurcharge = surcharge - variantSurcharge;
            const isChanged =
                Number(selectedProductData.id) !== Number(defaultProductData.id) ||
                Number(selectedVariantData.id) !== Number(defaultVariantData.id);

            // this.logger.debug({
            //     message: 'Combo slot pricing calculation',
            //     cartItemId: item.dataValues.id,
            //     comboId: comboData.id,
            //     comboItemId: Number(defaultItem.id),
            //     slotIndex: Number(slot.slotIndex),
            //     comboItemProductVariantId: defaultVariantId,
            //     selectedProductVariantId: selectedVariantIdFromOption || Number(selectedVariantData.id),
            //     comboItemVariantModifiedPrice: Number(comboItemVariantData?.modifiedPrice || 0),
            //     selectedVariantModifiedPrice: Number(selectedVariantData.modifiedPrice || 0),
            //     variantSurcharge,
            //     toppingSurcharge: surcharge - variantSurcharge,
            //     surcharge,
            //     unitPriceBeforeSlot: itemUnitPrice
            // });

            itemUnitPrice += surcharge;
            surchargeTotal += surcharge;
            variantSurchargeTotal += variantSurcharge;
            ingredientSurchargeTotal += ingredientSurcharge;

            const detailKey = JSON.stringify({
                comboItemId: Number(defaultItem.id),
                productId: Number(selectedProductData.id),
                productVariantId: Number(selectedVariantData.id),
                ingredients: enrichedIngredients.map(ingredient => ({
                    ingredientId: ingredient.ingredientId,
                    quantity: ingredient.quantity,
                    type: ingredient.type
                })).sort((a, b) => {
                    if (a.ingredientId !== b.ingredientId) return a.ingredientId - b.ingredientId;
                    return a.type.localeCompare(b.type);
                })
            });

            const existingDetail = comboDetailsDisplayMap.get(detailKey);
            if (existingDetail) {
                existingDetail.quantity += 1;
            } else {
                comboDetailsDisplayMap.set(detailKey, {
                    productName: selectedProductData.name,
                    variantName: `${selectedVariantData.size} - ${selectedVariantData.type}`,
                    originalProductName: defaultProductData.name,
                    originalVariantName: `${defaultVariantData.size} - ${defaultVariantData.type}`,
                    selectedProductName: selectedProductData.name,
                    selectedVariantName: `${selectedVariantData.size} - ${selectedVariantData.type}`,
                    isChanged,
                    ingredients: enrichedIngredients.length > 0 ? enrichedIngredients : ingredientsDisplay,
                    surcharge,
                    variantSurcharge,
                    ingredientSurcharge,
                    quantity: 1
                });
            }

            enrichedOptions.push({
                comboItemId: Number(defaultItem.id),
                slotIndex: Number(slot.slotIndex),
                productId: Number(selectedProductData.id),
                productVariantId: Number(selectedVariantData.id),
                originalProductId: Number(defaultProductData.id),
                originalProductVariantId: Number(defaultVariantData.id),
                originalProductName: defaultProductData.name,
                originalVariantName: `${defaultVariantData.size} - ${defaultVariantData.type}`,
                originalVariantModifiedPrice: Number(comboItemVariantData?.modifiedPrice || 0),
                selectedProductName: selectedProductData.name,
                selectedVariantName: `${selectedVariantData.size} - ${selectedVariantData.type}`,
                selectedVariantModifiedPrice: Number(selectedVariantData.modifiedPrice || 0),
                variantSurcharge,
                ingredientSurcharge,
                surcharge,
                ingredients: enrichedIngredients,
                product: {
                    id: selectedProductData.id,
                    name: selectedProductData.name,
                    imageUrl: selectedProductData.imageUrl || '',
                    basePrice: selectedProductData.basePrice
                },
                variant: {
                    id: selectedVariantData.id,
                    name: selectedVariantData.name,
                    size: selectedVariantData.size,
                    type: selectedVariantData.type,
                    modifiedPrice: selectedVariantData.modifiedPrice
                }
            });
        }

        const quantity = Number(item.dataValues.quantity || 1);
        const totalPrice = itemUnitPrice * quantity;
        const originalPrice = comboBasePrice + surchargeTotal;

        // this.logger.debug({
        //     message: 'Combo cart item pricing result',
        //     cartItemId: item.dataValues.id,
        //     comboId: comboData.id,
        //     comboBasePrice,
        //     discountPercent,
        //     discountedComboBasePrice,
        //     surchargeTotal,
        //     unitPrice: itemUnitPrice,
        //     quantity,
        //     totalPrice,
        //     originalPrice
        // });

        return {
            cartItemId: item.dataValues.id,
            type: 'COMBO',
            name: comboData.name,
            imageUrl: comboData.imageUrl,
            unitPrice: itemUnitPrice,
            quantity,
            totalPrice,
            rawData: {
                comboId: comboData.id,
                comboOptions: enrichedOptions
            },
            details: {
                comboItems: Array.from(comboDetailsDisplayMap.values()),
                originalPrice,
                basePrice: comboBasePrice,
                discountedBasePrice: discountedComboBasePrice,
                discountPercentage: discountPercent,
                savedAmount: comboBasePrice - discountedComboBasePrice,
                totalSurcharge: surchargeTotal,
                variantSurcharge: variantSurchargeTotal,
                ingredientSurcharge: ingredientSurchargeTotal,
                priceAfterChange: itemUnitPrice
            }
        };
    }

    private buildSinglePreviewItem(item: CartItems): CartPreviewItem | null {
        const variantData = this.getEntityData<any>(item.dataValues.productVariant);
        const productData = this.resolveProductForVariant(item.dataValues.productVariant, item.dataValues.product);
        const cartItemIngredients = item.dataValues.cartItemIngredients || [];
        const itemQty = Number(item.dataValues.quantity || 1);

        if (!this.isUsableProductVariantPair(productData, variantData)) return null;

        const basePrice = Number(productData.basePrice || 0);
        const variantSurcharge = Number(variantData.modifiedPrice || 0);
        const ingredientsDisplay: any[] = [];
        let toppingsCost = 0;

        for (const ing of cartItemIngredients) {
            const ingInstance = ing.dataValues.ingredient;
            if (!ingInstance) continue;

            const ingData = this.getEntityData<any>(ingInstance);
            if (!ingData || ingData.isActive === false) continue;
            const totalIngQty = Number(ing.dataValues.quantity || 0);
            const unitQty = itemQty > 0 ? (totalIngQty / itemQty) : 0;
            const price = Number(ingData.price || 0);

            if (ing.dataValues.type === 'ADD') {
                toppingsCost += price * unitQty;
                ingredientsDisplay.push({
                    ingredientId: ingData.id,
                    name: `+ ${ingData.name}`,
                    price,
                    quantity: unitQty,
                    totalPrice: price * unitQty,
                    type: 'ADD'
                });
            } else {
                ingredientsDisplay.push({
                    ingredientId: ingData.id,
                    name: `Không lấy ${ingData.name}`,
                    price: 0,
                    quantity: unitQty,
                    totalPrice: 0,
                    type: 'REMOVE'
                });
            }
        }

        const itemUnitPrice = basePrice + variantSurcharge + toppingsCost;
        const totalPrice = itemUnitPrice * itemQty;

        // this.logger.debug({
        //     message: 'Single cart item pricing result',
        //     cartItemId: item.dataValues.id,
        //     productId: productData.id,
        //     productVariantId: variantData.id,
        //     basePrice,
        //     variantSurcharge,
        //     toppingsCost,
        //     unitPrice: itemUnitPrice,
        //     quantity: itemQty,
        //     totalPrice
        // });

        return {
            cartItemId: item.dataValues.id,
            type: 'SINGLE',
            name: productData.name,
            imageUrl: productData.imageUrl,
            unitPrice: itemUnitPrice,
            quantity: itemQty,
            totalPrice,
            rawData: {
                productId: productData.id,
                productVariantId: variantData.id
            },
            details: {
                variantName: variantData.name,
                size: variantData.size,
                crust: variantData.type,
                ingredients: ingredientsDisplay
            }
        };
    }

    private getEntityData<T>(entity: any): T | null {
        if (!entity) return null;
        return (entity.dataValues || entity) as T;
    }

    private resolveProductForVariant(variant: any, fallbackProduct?: any): any | null {
        const variantData = this.getEntityData<any>(variant);
        if (!variantData) return null;

        const canonicalProduct = this.getEntityData<any>(variantData.product);
        if (canonicalProduct && Number(canonicalProduct.id) === Number(variantData.productId)) {
            return canonicalProduct;
        }

        const fallbackProductData = this.getEntityData<any>(fallbackProduct);
        if (fallbackProductData && Number(fallbackProductData.id) === Number(variantData.productId)) {
            return fallbackProductData;
        }

        return null;
    }

    private isUsableProductVariantPair(productData: any, variantData: any): boolean {
        if (!productData || !variantData) return false;
        if (productData.isActive === false || variantData.isActive === false) return false;
        return Number(productData.id) === Number(variantData.productId);
    }
}
