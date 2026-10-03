import { PartialType } from '@nestjs/mapped-types';
import { CreateCartAddOnProductSettingDto } from './create-cart-add-on-product-setting.dto';

export class UpdateCartAddOnProductSettingDto extends PartialType(CreateCartAddOnProductSettingDto) {}
