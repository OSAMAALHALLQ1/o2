import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'البريد الإلكتروني غير صالح' })
  @IsNotEmpty({ message: 'البريد الإلكتروني مطلوب' })
  email!: string;

  @IsString({ message: 'كلمة المرور يجب أن تكون نصاً' })
  @MinLength(8, { message: 'يجب أن لا تقل كلمة المرور عن 8 خانات' })
  password!: string;

  @IsOptional()
  @IsString()
  deviceInfo?: string;
}
