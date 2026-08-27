import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RefreshTokenDto {
  @IsString({ message: 'رمز التحديث مطلوب' })
  @IsNotEmpty({ message: 'رمز التحديث مطلوب' })
  refreshToken!: string;

  @IsOptional()
  @IsString()
  deviceInfo?: string;
}
