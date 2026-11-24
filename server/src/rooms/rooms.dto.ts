import { IsString, MinLength, MaxLength } from 'class-validator';

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
