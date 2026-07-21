import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RoomStore } from './room.store';
import { RoomsService } from './rooms.service';
import { RoomsController } from './rooms.controller';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get<string>('JWT_SECRET') || 'lune-dev-secret-change-me',
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  providers: [RoomStore, RoomsService],
  controllers: [RoomsController],
  exports: [RoomStore, RoomsService, JwtModule],
})
export class RoomsModule {}