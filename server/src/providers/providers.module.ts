import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ProviderRegistry } from './provider.registry';
import { ProvidersController } from './providers.controller';
import { NeteaseProvider } from './netease/netease.provider';

@Module({
  imports: [ConfigModule],
  controllers: [ProvidersController],
  providers: [
    ProviderRegistry,
    NeteaseProvider,
    {
      // 启动时根据 MUSIC_PROVIDERS env 激活 provider(否则注册但不激活)
      provide: 'PROVIDER_BOOTSTRAP',
      inject: [ProviderRegistry, NeteaseProvider, ConfigService],
      useFactory: (
        registry: ProviderRegistry,
        netease: NeteaseProvider,
        cfg: ConfigService,
      ) => {
        registry.register(netease);
        // 后续新增 provider 在此 register,并在 env 中按 id 激活
        const raw = cfg.get<string>('MUSIC_PROVIDERS') || 'netease';
        const ids = raw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        registry.setActive(ids);
        return registry;
      },
    },
  ],
  exports: [ProviderRegistry],
})
export class ProvidersModule {}