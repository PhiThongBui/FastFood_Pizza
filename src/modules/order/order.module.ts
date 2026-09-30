import { Module } from '@nestjs/common';
import { OrderService } from './order.service';
import { OrderController } from './order.controller';
import { SequelizeModule } from '@nestjs/sequelize';
import { Address, Combo, ComboItem, DiningTable, Ingredient, KitchenTicket, Order, OrderItemComboOption, OrderItemComboOptionIngredient, OrderItemIngredient, OrderItems, Product, ProductVariant, TableSession, User } from '@/models';
import { AddressModule } from '../address/address.module';
import { RedisModule } from '../redis/redis.module';
import { StorePolicySettingModule } from '../store-policy-setting/store-policy-setting.module';
import { SepayModule } from '../sepay/sepay.module';

@Module({
  controllers: [OrderController],
  providers: [OrderService],
  imports: [SequelizeModule.forFeature([Order, Address, User, OrderItems, ProductVariant, Product, Ingredient, Combo, ComboItem, OrderItemIngredient, OrderItemComboOption, OrderItemComboOptionIngredient, TableSession, DiningTable, KitchenTicket]), AddressModule, RedisModule, StorePolicySettingModule, SepayModule],
})
export class OrderModule {}
