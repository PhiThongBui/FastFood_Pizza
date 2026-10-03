import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class CreateCartAddOnCategorySettingDto {
  @IsInt()
  @Min(1)
  categoryId: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxItems?: number;
}
