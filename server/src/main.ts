import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.setGlobalPrefix('api');
  // 使用 ws 原生 adapter,@WebSocketGateway({ path: '/ws' }) 生效
  app.useWebSocketAdapter(new WsAdapter(app));

  const port = Number(process.env.PORT) || 9527;
  await app.listen(port);
  const cookie = process.env.MUSIC_COOKIE;
  console.log(`[Lune Server] 运行在 http://localhost:${port}/api`);
  console.log(`[Lune Server] MUSIC_COOKIE: ${cookie ? '已加载' : '未设置'}`);
  console.log(`[Lune Server] WebSocket 路径: ws://localhost:${port}/ws`);
}

bootstrap();