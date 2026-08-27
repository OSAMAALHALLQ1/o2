import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'البريد الإلكتروني غير صالح' })
  @IsNotEmpty({ message: 'البريد الإلكتروني مطلوب' })
  email!: string;

  @IsString({ message: 'كلمة المرور مطلوبة' })
  @IsNotEmpty({ message: 'كلمة المرور مطلوبة' })
  password!: string;

  @IsOptional()
  @IsString()
  deviceInfo?: string;
}
