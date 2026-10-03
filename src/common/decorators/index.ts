import { applyDecorators } from "@nestjs/common";
import { ApiProperty } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsBoolean, IsDate, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";
import {  Max, Min } from "sequelize-typescript";

export const StringRequired = (name) => applyDecorators(
    ApiProperty({ required: true }),
    Type(() => String),
    IsString({ message: `${name} là bắt buộc` }),
    IsNotEmpty({ message: `${name} không được để trống` })
)

export const StringNotRequired = applyDecorators(
    ApiProperty({
        required: false
    }),
    Type(() => String),
    IsString(),
    IsOptional(),
)
export const NumberNotRequired = applyDecorators(
    ApiProperty({
        required: false,
    }),
    IsOptional(),
    Type(() => Number),
    IsNumber(),
)
export const NumberRequired = (name: string, min = 0, max?: number) => {
    const decorators = [
        ApiProperty({ required: true }),
        IsNumber(),
        IsNotEmpty({ message: `${name} không được để trống` }),
    ];

    if (min !== undefined) {
        decorators.push(() => Min(min));
    }
    if (max !== undefined) {
        decorators.push(() => Max(max));
    }
    return applyDecorators(...decorators);
};


export const BooleanNotRequired = applyDecorators(
    ApiProperty({
        required: false
    }),
    Transform(({ value }) => {
        if (value === 'true') return true;
        if (value === 'false') return false;
        return value;
    }),
    IsBoolean(),
    IsOptional()
)

export const EnumRequired = (name: string, type: any) => applyDecorators(
    ApiProperty({ required: true }),
    IsEnum(type),
    IsNotEmpty({ message: `${name} không được để trống` })
)

export const EnumNotRequired = (type: any) => applyDecorators(
    ApiProperty({ required: false }),
    IsEnum(type),
    IsOptional()
)


export const ArrayNotRequired = (array: any) => applyDecorators(
    ApiProperty({ 
        required: false, 
        isArray: true,    
        type: array 
    }),
    IsOptional(),
    ValidateNested({ each: true }),
    Type(() => array),
)

export const DateRequired = (name:string) => applyDecorators(
    ApiProperty({ required: true , format: 'date-time', type: String }),
    Type(() => Date),
    IsDate({ message: `${name} phải là 1 ngày` }),
    IsNotEmpty({ message: `${name} không được để trống` })
)

export const DateNotRequired = applyDecorators(
    ApiProperty({ required: false, type: String, format: 'date-time' }),
    Type(() => Date),
    IsOptional(),
    IsDate({ message: `Ngày không hợp lệ` })
);
