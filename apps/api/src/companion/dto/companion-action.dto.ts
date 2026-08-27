import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { CompanionCareActionType } from '@o2/types';

export class CompanionActionDto {
  @IsEnum(['FEED', 'CLEAN', 'PLAY', 'PET', 'SLEEP', 'WAKE'], {
    message: 'نوع إجراء العناية غير صالح',
  })
  action!: CompanionCareActionType;

  @IsString()
  @IsNotEmpty({ message: 'معرف إجراء العميل الفريد مطلوب لمنع تكرار الإجراء' })
  @MaxLength(64)
  clientActionId!: string;
}
