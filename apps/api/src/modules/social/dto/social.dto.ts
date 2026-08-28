import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { FriendRequestPolicy, PartyGameMode, PartyReadyState } from '@o2/types';

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}

export class SearchPlayersDto {
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  query!: string;
}

export class UserTargetDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  userId!: string;
}

export class UpdatePrivacyDto {
  @IsOptional()
  @IsIn(['EVERYONE', 'NOBODY'])
  friendRequestPolicy?: FriendRequestPolicy;

  @IsOptional()
  @IsBoolean()
  allowPartyInvites?: boolean;
}

export class PartyInviteDto extends UserTargetDto {}

export class ReadyDto {
  @IsIn(['READY', 'NOT_READY'])
  readyState!: PartyReadyState;
}

export class SelectGameDto {
  @IsIn(['ATRASH', 'MAFIA_CLASSIC', 'TARNEEB', 'HIDE_AND_SEEK', 'O2_IMPOSTER'])
  desiredGameMode!: PartyGameMode;
}

export class PartyAccessDto {
  @IsBoolean()
  allowJoinByCode!: boolean;
}

export class JoinByCodeDto {
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  code!: string;
}
