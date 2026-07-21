import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class JoinRoomDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  nickname!: string;
}

export class CreateRoomDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  nickname!: string;
}

export class CodeParamDto {
  @IsString()
  @Matches(/^[A-Z0-9]{6,12}$/, { message: 'code 格式非法' })
  code!: string;
}