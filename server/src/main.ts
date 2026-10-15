import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { AppModule } from './app.module';
import { ProviderRegistry } from './providers/provider.registry';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // systemd/PM2 发送 SIGTERM/SIGINT 时，先关闭 HTTP/WebSocket 和模块定时任务。
  app.enableShutdownHooks();
  const port = Number(process.env.PORT) || 9527;
  const host = process.env.HOST?.trim() || '0.0.0.0';
  const managePort = Number(process.env.LUNE_MANAGE_PORT || '9528');
  const manageHost = process.env.LUNE_MANAGE_HOST?.trim() || '127.0.0.1';
  if (!Number.isInteger(managePort) || managePort < 1 || managePort > 65535 || managePort === port) {
    throw new Error('LUNE_MANAGE_PORT 必须是与 PORT 不同的有效端口');
  }
  // 管理路由在路由与 CORS 中间件之前隔离；即使公网代理误转发路径也无法访问。
  app.use((request: IncomingMessage, response: ServerResponse, next: () => void) => {
    let path = request.url?.split('?')[0] || '';
    try {
      path = decodeURIComponent(path).toLowerCase().replace(/\/+/g, '/');
    } catch {
      response.statusCode = 400;
      response.end();
      return;
    }
    if (path === '/api/admin' || path.startsWith('/api/admin/')) {
      if (request.socket.localPort !== managePort) {
        response.statusCode = 404;
        response.end();
        return;
      }
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('Referrer-Policy', 'no-referrer');
      response.setHeader('Vary', 'Origin');
      const origin = request.headers.origin;
      const authority = request.headers.host;
      if (origin && origin !== `http://${authority}` && origin !== `https://${authority}`) {
        response.statusCode = 403;
        response.end();
        return;
      }
    }
    next();
  });
  app.enableCors();
  app.setGlobalPrefix('api');
  // 使用 ws 原生 adapter,@WebSocketGateway({ path: '/ws' }) 生效
  app.useWebSocketAdapter(new WsAdapter(app));

  await app.listen(port, host);
  // 两个监听器共享同一 Express handler、Provider 状态与内存会话；不创建第二个 AppModule。
  const manageServer = createServer(app.getHttpAdapter().getInstance());
  await new Promise<void>((resolve, reject) => {
    manageServer.once('error', reject);
    manageServer.listen(managePort, manageHost, () => {
      manageServer.off('error', reject);
      resolve();
    });
  });
  app.getHttpServer().on('close', () => manageServer.close());
  const providers = app.get(ProviderRegistry).listActiveDetails();
  console.log(`[Lune Server] 运行在 http://${host}:${port}/api`);
  console.log(
    `[Lune Server] Providers: ${providers.map(({ descriptor, status }) => `${descriptor.id}=${status.status}`).join(', ') || '(无)'}`,
  );
  console.log(`[Lune Server] WebSocket 路径: ws://${host}:${port}/ws`);
  console.log(`[Lune Server] 管理入口: http://${manageHost}:${managePort}/api/admin/ui`);
}

bootstrap();
