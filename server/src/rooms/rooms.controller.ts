import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { CreateRoomDto, JoinRoomDto } from './rooms.dto';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  /** 创建房间,返回 code + 成员 + token */
  @Post()
  async create(@Body() dto: CreateRoomDto) {
    return this.rooms.create(dto.nickname);
  }

  /** 房间快照(成员/播放/队列) */
  @Get(':code')
  async snapshot(@Param('code') code: string) {
    return this.rooms.snapshot(code);
  }

  /** 加入房间,返回成员 + token */
  @Post(':code/join')
  async join(@Param('code') code: string, @Body() dto: JoinRoomDto) {
    return this.rooms.join(code, dto.nickname);
  }
}