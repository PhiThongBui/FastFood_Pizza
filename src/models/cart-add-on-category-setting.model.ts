import { BelongsTo, Column, DataType, ForeignKey, HasMany, Model, Table } from 'sequelize-typescript';
import { Category } from './category.model';
import { CartAddOnProductSetting } from './cart-add-on-product-setting.model';

@Table({
  tableName: 'cart_add_on_category_settings',
})
export class CartAddOnCategorySetting extends Model<CartAddOnCategorySetting> {
  @ForeignKey(() => Category)
  @Column({
    allowNull: false,
    unique: true,
    type: DataType.INTEGER,
  })
  declare categoryId: number;

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

  @Column({
    allowNull: true,
    defaultValue: 10,
    type: DataType.INTEGER,
  })
  declare maxItems: number | null;

  @BelongsTo(() => Category)
  declare category: Category;

  @HasMany(() => CartAddOnProductSetting, {
    onDelete: 'CASCADE',
    hooks: false,
  })
  declare productSettings: CartAddOnProductSetting[];
}
