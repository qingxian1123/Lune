import { Module, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import { Controller, Get } from '@nestjs/common';
import { RoomsModule } from './rooms/rooms.module';
import { ProvidersModule } from './providers/providers.module';
import { SyncModule } from './sync/sync.module';
import { DailyBestModule } from './daily-best/daily-best.module';

@Controller('health')
class HealthController {
  @Get()
  check() {
    return { ok: true };
  }
}

@Module({
  imports: [
    // envFilePath 用绝对路径,与启动 CWD 无关(沿用 V1 思路)
    ConfigModule.forRoot({ isGlobal: true, envFilePath: resolve(__dirname, '..', '.env') }),
    RoomsModule,
    ProvidersModule,
    SyncModule,
    DailyBestModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_PIPE,
      useFactory: () =>
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
    },
  ],
})
export class AppModule {}