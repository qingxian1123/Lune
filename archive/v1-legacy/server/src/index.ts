import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { loadEnvFile } from 'node:process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { handleConnection } from './wsHandler.js';
import neteaseProxy from './neteaseProxy.js';

// 加载 server/.env（使用相对于本文件的绝对路径，与 CWD 无关）
const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnvFile(resolve(__dirname, '..', '.env'));

const PORT = Number(process.env.PORT) || 3001;

const app = express();
app.use(cors());
app.use(express.json());

// 网易云 API 代理
app.use('/api', neteaseProxy);

// 健康检查
app.get('/health', (_req, res) => res.json({ ok: true }));

const server = createServer(app);

// WebSocket 升级
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  handleConnection(ws);
});

server.listen(PORT, () => {
  console.log(`[Lune Server] 运行在 http://localhost:${PORT}`);
  console.log(`[Lune Server] MUSIC_COOKIE: ${process.env.MUSIC_COOKIE ? '已加载' : '未设置'}`);
  console.log(`[Lune Server] WebSocket 路径: ws://localhost:${PORT}/ws`);
});
