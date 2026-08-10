import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProviderRegistry } from './provider.registry';
import { ProvidersController } from './providers.controller';
import { NeteaseProvider } from './netease/netease.provider';
import { NeteaseAuthAdapter } from './netease/netease-auth.adapter';
import { KugouApiService } from './kugou/kugou-api.service';
import { KugouProvider } from './kugou/kugou.provider';
import { KugouAuthAdapter } from './kugou/kugou-auth.adapter';
import { ProviderConfigService } from './infrastructure/config/provider-config.service';
import { EncryptedCredentialStore } from './infrastructure/credentials/encrypted-credential.store';
import { LocalProviderEventBus } from './infrastructure/events/local-provider-event-bus';
import { ProviderStatusStore } from './runtime/provider-status.store';
import { ProviderAuthService } from './application/provider-auth.service';
import { ProviderAdminController } from './interfaces/http/provider-admin.controller';
import { AdminTokenGuard } from './interfaces/http/admin-token.guard';
import { APP_FILTER } from '@nestjs/core';
import { ProviderApplicationErrorFilter } from './interfaces/http/provider-application-error.filter';

@Module({
  imports: [ConfigModule],
  controllers: [ProvidersController, ProviderAdminController],
  providers: [
    LocalProviderEventBus,
    ProviderStatusStore,
    ProviderConfigService,
    EncryptedCredentialStore,
    ProviderRegistry,
    NeteaseProvider,
    NeteaseAuthAdapter,
    KugouApiService,
    KugouProvider,
    KugouAuthAdapter,
    {
      provide: ProviderAuthService,
      inject: [
        ProviderRegistry,
        EncryptedCredentialStore,
        ProviderStatusStore,
        ProviderConfigService,
        LocalProviderEventBus,
      ],
      useFactory: (
        registry: ProviderRegistry,
        credentials: EncryptedCredentialStore,
        statuses: ProviderStatusStore,
        config: ProviderConfigService,
        events: LocalProviderEventBus,
      ) =>
        new ProviderAuthService(registry, credentials, statuses, config, events, {
          warn: (message) => new Logger(ProviderAuthService.name).warn(message),
        }),
    },
    AdminTokenGuard,
    {
      provide: APP_FILTER,
      useClass: ProviderApplicationErrorFilter,
    },
    {
      // 组合根：只有这里知道具体 Provider 插件与核心端口的绑定关系。
      provide: 'PROVIDER_BOOTSTRAP',
      inject: [
        ProviderRegistry,
        NeteaseProvider,
        NeteaseAuthAdapter,
        KugouProvider,
        KugouAuthAdapter,
        ProviderConfigService,
      ],
      useFactory: (
        registry: ProviderRegistry,
        netease: NeteaseProvider,
        neteaseAuth: NeteaseAuthAdapter,
        kugou: KugouProvider,
        kugouAuth: KugouAuthAdapter,
        config: ProviderConfigService,
      ) => {
        registry.register({
          descriptor: {
            id: 'netease',
            displayName: '网易云音乐',
            capabilities: ['search', 'resolve', 'lyric', 'playlist-search', 'playlist'],
            requiresAccount: true,
          },
          catalog: netease,
          auth: neteaseAuth,
        });
        registry.register({
          descriptor: {
            id: 'kugou',
            displayName: '酷狗音乐',
            capabilities: ['search', 'resolve', 'lyric', 'playlist-search', 'playlist'],
            requiresAccount: true,
          },
          catalog: kugou,
          auth: kugouAuth,
        });
        registry.setActive(config.getActiveProviderIds());
        if (registry.getDefaultId() !== config.getSnapshot().defaultProvider) {
          throw new Error(
            `default provider is not compiled or registered: ${config.getSnapshot().defaultProvider}`,
          );
        }
        return registry;
      },
    },
  ],
  exports: [ProviderRegistry, ProviderAuthService, ProviderConfigService],
})
export class ProvidersModule {}
