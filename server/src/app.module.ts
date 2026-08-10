import { Inject, Module, ServiceUnavailableException, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import { Controller, Get } from '@nestjs/common';
import { RoomsModule } from './rooms/rooms.module';
import { ProvidersModule } from './providers/providers.module';
import { SyncModule } from './sync/sync.module';
import { DailyBestModule } from './daily-best/daily-best.module';
import { ProviderRegistry } from './providers/provider.registry';

@Controller('health')
class HealthController {
  constructor(@Inject(ProviderRegistry) private readonly providers: ProviderRegistry) {}

  @Get()
  check() {
    return { ok: true };
  }

  @Get('live')
  live() {
    return { ok: true };
  }

  @Get('ready')
  ready() {
    const providers = this.providers.listActiveDetails().map(({ descriptor, status }) => ({
      id: descriptor.id,
      status: status.status,
    }));
    if (!providers.some((provider) => provider.status === 'ready')) {
      throw new ServiceUnavailableException({ ok: false, providers });
    }
    return { ok: true, providers };
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
