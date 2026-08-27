import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GoogleAuthDto {
  @IsString({ message: 'رمز Google ID Token مطلوب' })
  @IsNotEmpty({ message: 'رمز Google ID Token مطلوب' })
  idToken!: string;

  @IsOptional()
  @IsString()
  deviceInfo?: string;
}

export class AppleAuthDto {
  @IsString({ message: 'رمز Apple Identity Token مطلوب' })
  @IsNotEmpty({ message: 'رمز Apple Identity Token مطلوب' })
  identityToken!: string;

  @IsOptional()
  @IsString()
  rawNonce?: string;

  @IsOptional()
  @IsString()
  deviceInfo?: string;
}
