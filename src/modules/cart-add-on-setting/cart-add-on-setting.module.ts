import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { CartAddOnCategorySetting, CartAddOnProductSetting, Category, Product, ProductVariant, User } from '@/models';
import { CartAddOnSettingController } from './cart-add-on-setting.controller';
import { CartAddOnSettingService } from './cart-add-on-setting.service';

@Module({
  imports: [
    SequelizeModule.forFeature([
      CartAddOnCategorySetting,
      CartAddOnProductSetting,
      Category,
      Product,
      ProductVariant,
      User,
    ]),
  ],
  controllers: [CartAddOnSettingController],
  providers: [CartAddOnSettingService],
  exports: [CartAddOnSettingService],
})
export class CartAddOnSettingModule {}
