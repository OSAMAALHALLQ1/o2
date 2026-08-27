import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class SetUsernameDto {
  @IsString({ message: 'اسم المستخدم يجب أن يكون نصاً' })
  @IsNotEmpty({ message: 'اسم المستخدم مطلوب' })
  @MinLength(3, { message: 'يجب أن لا يقل اسم المستخدم عن 3 أحرف' })
  @MaxLength(20, { message: 'يجب أن لا يزيد اسم المستخدم عن 20 حرفاً' })
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'اسم المستخدم يجب أن يحتوي فقط على أحرف إنجليزية وأرقام وشرطة سفلية (_)',
  })
  username!: string;
}

export class CheckUsernameDto {
  @IsString({ message: 'اسم المستخدم يجب أن يكون نصاً' })
  @IsNotEmpty({ message: 'اسم المستخدم مطلوب' })
  username!: string;
}
