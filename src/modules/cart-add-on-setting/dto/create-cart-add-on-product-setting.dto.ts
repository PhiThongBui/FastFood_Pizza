import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class CreateCartAddOnProductSettingDto {
  @IsInt()
  @Min(1)
  categorySettingId: number;

  @IsInt()
  @Min(1)
  productId: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  variantId?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
