import { PartialType } from '@nestjs/mapped-types';
import { CreateCartAddOnCategorySettingDto } from './create-cart-add-on-category-setting.dto';

export class UpdateCartAddOnCategorySettingDto extends PartialType(
  CreateCartAddOnCategorySettingDto,
) {}
