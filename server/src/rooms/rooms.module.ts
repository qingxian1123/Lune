import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RoomStore } from './room.store';
import { RoomsService } from './rooms.service';
import { RoomsController } from './rooms.controller';
import { resolve } from 'node:path';

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
  providers: [{
    provide: RoomStore,
    inject: [ConfigService],
    useFactory: (config: ConfigService) => new RoomStore({
      dataDir: resolve(config.get<string>('LUNE_DATA_DIR') || 'data', 'rooms'),
      retentionMs: Number(config.get<string>('LUNE_ROOM_RETENTION_MS') || 86_400_000),
      graceMs: Number(config.get<string>('LUNE_ROOM_GRACE_MS') || 30_000),
      checkpointMs: Number(config.get<string>('LUNE_ROOM_CHECKPOINT_MS') || 30_000),
    }),
  }, RoomsService],
  controllers: [RoomsController],
  exports: [RoomStore, RoomsService, JwtModule],
})
export class RoomsModule {}
