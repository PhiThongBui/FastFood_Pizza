import { Module } from '@nestjs/common';
import { AddressService } from './address.service';
import { AddressController } from './address.controller';
import { Address, Order } from '@/models';
import { SequelizeModule } from '@nestjs/sequelize';
import { HttpModule } from '@nestjs/axios';
@Module({
  controllers: [AddressController],
  providers: [AddressService],
  imports: [SequelizeModule.forFeature([Address, Order]), HttpModule],
  exports: [AddressService],
})
export class AddressModule {}
