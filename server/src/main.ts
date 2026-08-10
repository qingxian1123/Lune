import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';
import { ProviderRegistry } from './providers/provider.registry';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // systemd/PM2 发送 SIGTERM/SIGINT 时，先关闭 HTTP/WebSocket 和模块定时任务。
  app.enableShutdownHooks();
  app.enableCors();
  app.setGlobalPrefix('api');
  // 使用 ws 原生 adapter,@WebSocketGateway({ path: '/ws' }) 生效
  app.useWebSocketAdapter(new WsAdapter(app));

  const port = Number(process.env.PORT) || 9527;
  const host = process.env.HOST?.trim() || '0.0.0.0';
  await app.listen(port, host);
  const providers = app.get(ProviderRegistry).listActiveDetails();
  console.log(`[Lune Server] 运行在 http://${host}:${port}/api`);
  console.log(
    `[Lune Server] Providers: ${providers.map(({ descriptor, status }) => `${descriptor.id}=${status.status}`).join(', ') || '(无)'}`,
  );
  console.log(`[Lune Server] WebSocket 路径: ws://${host}:${port}/ws`);
}

bootstrap();
