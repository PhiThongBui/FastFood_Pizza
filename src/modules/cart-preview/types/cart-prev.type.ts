

export interface CartPreviewItem {
    cartItemId: number;
    type: 'SINGLE' | 'COMBO';
    name: string;
    unitPrice: number;
    quantity: number;
    totalPrice: number;
    imageUrl: string;
    
    // ✅ THÊM: Raw data để restore modal
    rawData?: {
        // For SINGLE
        productId?: number;
        productVariantId?: number;
        
        // For COMBO
        comboId?: number;
        comboOptions?: Array<{
            productId: number;
            productVariantId: number;
            comboItemId?: number;
            slotIndex?: number;
            originalProductId?: number;
            originalProductVariantId?: number;
            originalProductName?: string;
            originalVariantName?: string;
            originalVariantModifiedPrice?: number;
            selectedProductName?: string;
            selectedVariantName?: string;
            selectedVariantModifiedPrice?: number;
            variantSurcharge?: number;
            ingredientSurcharge?: number;
            surcharge?: number;
            ingredients?: Array<{
                ingredientId: number;
                quantity: number;
                type: 'ADD' | 'REMOVE';
                name?: string;
                price?: number;
            }>;
            // ✅ Enriched data
            product?: {
                id: number;
                name: string;
                imageUrl?: string;
                basePrice: number;
            };
            variant?: {
                id: number;
                name: string;
                size: string;
                type: string;
                modifiedPrice: number;
            };
        }>;
    };
    
    // Chi tiết hiển thị
    details?: {
        variantName?: string;
        size?: string;
        crust?: string;
        ingredients?: {
            name: string;
            price: number;
            quantity?: number;
            totalPrice?: number;
            type?: 'ADD' | 'REMOVE';
        }[];
        discountPercentage?: number;
        savedAmount?: number;
        originalPrice?: number;  
        basePrice?: number;
        discountedBasePrice?: number;
        totalSurcharge?: number;
        variantSurcharge?: number;
        ingredientSurcharge?: number;
        priceAfterChange?: number;
        comboItems?: {
            productName: string;
            variantName: string;
            originalProductName?: string;
            originalVariantName?: string;
            selectedProductName?: string;
            selectedVariantName?: string;
            isChanged?: boolean;
            ingredients: Array<string | {
                ingredientId?: number;
                quantity?: number;
                type?: 'ADD' | 'REMOVE';
                action?: 'ADD' | 'REMOVE';
                name?: string;
                ingredientName?: string;
                price?: number;
                totalPrice?: number;
            }>;
            quantity?: number;
            surcharge?: number;
            variantSurcharge?: number;
            ingredientSurcharge?: number;
        }[];
    };
}
export interface CartPreviewOutput {
    message: string;
    data: {
        items: CartPreviewItem[];
        totalAmount: number;
        itemCount?: number;
        totalQuantity?: number;
    }
}

export type CartCheckoutOutput = {
    message:string,
    data:{
        items: CartPreviewItem[],
        subtotal: number,
        deliveryFee: number,
        discount : number,
        finalTotal: number,
        appliedCoupon?: {
            code: string;
            type: string;
            value: number;
        };
    }
}
