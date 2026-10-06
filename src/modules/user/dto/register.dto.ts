import { ApiProperty } from "@nestjs/swagger";
import {
    IsEmail,
    IsNotEmpty,
    IsString,
    Matches,
    MaxLength,
    MinLength,
    registerDecorator,
    ValidationOptions,
} from "class-validator";
import { Type } from "class-transformer";

export function IsValidEmailDomain(validationOptions?: ValidationOptions) {
    return function (object: Object, propertyName: string) {
        registerDecorator({
            name: 'isValidEmailDomain',
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions,
            validator: {
                validate(value: any) {
                    if (typeof value !== 'string') return false;
                    const trimmed = value.trim();
                    const parts = trimmed.split('@');
                    if (parts.length !== 2) return false;
                    const domain = parts[1].toLowerCase();

                    // Gmail check
                    if (domain.startsWith('gmail.') && domain !== 'gmail.com') return false;
                    if (['gmai.com', 'gmial.com', 'gamil.com', 'gmaill.com', 'gmailc.com'].includes(domain)) return false;

                    // Yahoo check
                    if (domain.startsWith('yahoo.') && !['yahoo.com', 'yahoo.com.vn'].includes(domain)) return false;
                    if (['yaho.com', 'yhoo.com'].includes(domain)) return false;

                    // Outlook / Hotmail check
                    if (domain.startsWith('outlook.') && !['outlook.com', 'outlook.com.vn'].includes(domain)) return false;
                    if (domain.startsWith('hotmail.') && domain !== 'hotmail.com') return false;

                    // iCloud check
                    if (domain.startsWith('icloud.') && domain !== 'icloud.com') return false;

                    // TLD validation (2-10 letters, only letters)
                    const domainParts = domain.split('.');
                    const tld = domainParts[domainParts.length - 1];
                    if (!tld || tld.length < 2 || !/^[a-z]+$/.test(tld)) return false;

                    return true;
                },
                defaultMessage() {
                    return 'Tên miền email không hợp lệ (nếu dùng Gmail, vui lòng nhập @gmail.com)';
                },
            },
        });
    };
}

export class CreateUserDto {
    @ApiProperty({ required: true, example: 'Nguyễn Văn A', minLength: 2, maxLength: 50 })
    @Type(() => String)
    @IsString({ message: 'Họ tên phải là chuỗi ký tự' })
    @IsNotEmpty({ message: 'Họ tên không được để trống' })
    @MinLength(2, { message: 'Họ tên cần ít nhất 2 ký tự' })
    @MaxLength(50, { message: 'Họ tên không được vượt quá 50 ký tự' })
    name: string

    @ApiProperty({ required: true, example: 'user@example.com' })
    @Type(() => String)
    @IsString({ message: 'Email phải là chuỗi ký tự' })
    @IsNotEmpty({ message: 'Email không được để trống' })
    @IsEmail({}, { message: 'Email không đúng định dạng (ví dụ: user@example.com)' })
    @Matches(/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,10}$/, {
        message: 'Email không đúng định dạng (ví dụ: user@example.com)'
    })
    @IsValidEmailDomain()
    email: string

    @ApiProperty({
        required: true,
        minLength: 8,
        description: 'Mật khẩu ≥ 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt',
        example: 'Abc@1234'
    })
    @Type(() => String)
    @IsString({ message: 'Mật khẩu phải là chuỗi ký tự' })
    @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
    @MinLength(8, { message: 'Mật khẩu cần ít nhất 8 ký tự' })
    @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&^#\-_])[A-Za-z\d@$!%*?&^#\-_]{8,}$/, {
        message: 'Mật khẩu phải có ít nhất 1 chữ hoa, 1 chữ thường, 1 số và 1 ký tự đặc biệt (@$!%*?&^#-_)'
    })
    password: string
}