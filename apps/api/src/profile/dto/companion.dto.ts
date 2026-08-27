import { IsNotEmpty, IsString } from 'class-validator';

export class SelectCompanionDto {
  @IsString({ message: 'معرف الرفيق مطلوب' })
  @IsNotEmpty({ message: 'معرف الرفيق مطلوب' })
  characterId!: string;
}
