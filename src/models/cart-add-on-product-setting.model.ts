import { BelongsTo, Column, DataType, ForeignKey, Model, Table } from 'sequelize-typescript';
import { CartAddOnCategorySetting } from './cart-add-on-category-setting.model';
import { Product } from './product.model';
import { ProductVariant } from './product-variant.model';

@Table({
  tableName: 'cart_add_on_product_settings',
  indexes: [
    {
      unique: true,
      fields: ['categorySettingId', 'productId'],
    },
  ],
})
export class CartAddOnProductSetting extends Model<CartAddOnProductSetting> {
  @ForeignKey(() => CartAddOnCategorySetting)
  @Column({
    allowNull: false,
    type: DataType.INTEGER,
  })
  declare categorySettingId: number;

  @ForeignKey(() => Product)
  @Column({
    allowNull: false,
    type: DataType.INTEGER,
  })
  declare productId: number;

  @ForeignKey(() => ProductVariant)
  @Column({
    allowNull: true,
    type: DataType.INTEGER,
  })
  declare variantId: number | null;

  @Column({
    allowNull: false,
    defaultValue: true,
    type: DataType.BOOLEAN,
  })
  declare isActive: boolean;

  @Column({
    allowNull: false,
    defaultValue: 0,
    type: DataType.INTEGER,
  })
  declare sortOrder: number;

  @BelongsTo(() => CartAddOnCategorySetting)
  declare categorySetting: CartAddOnCategorySetting;

  @BelongsTo(() => Product)
  declare product: Product;

  @BelongsTo(() => ProductVariant)
  declare variant: ProductVariant | null;
}
