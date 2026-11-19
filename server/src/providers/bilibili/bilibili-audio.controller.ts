import { BadRequestException, Controller, Get, Inject, NotFoundException, Query, Req, Res } from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ProviderRegistry } from '../provider.registry';
import { BilibiliProvider } from './bilibili.provider';

@Controller('providers/bilibili')
export class BilibiliAudioController {
  constructor(
    @Inject(ProviderRegistry) private readonly registry: ProviderRegistry,
    @Inject(BilibiliProvider) private readonly provider: BilibiliProvider,
  ) {}

  @Get('audio')
  async audio(@Query('id') id: string, @Req() request: IncomingMessage, @Res() response: ServerResponse): Promise<void> {
    if (!this.registry.getActiveById(this.provider.id)) throw new NotFoundException();
    if (typeof id !== 'string') throw new BadRequestException('无效的哔哩哔哩音轨');
    const range = request.headers.range;
    if (range && !/^bytes=(?:\d{1,16}-\d{0,16}|-\d{1,16})$/i.test(range)) {
      response.statusCode = 416;
      response.end();
      return;
    }

    const disconnect = new AbortController();
    const stop = () => disconnect.abort();
    const head = request.method === 'HEAD';
    response.once('close', stop);
    try {
      const upstream = await this.provider.openAudio(id, range, disconnect.signal, head);
      if (disconnect.signal.aborted) {
        await upstream?.body?.cancel();
        return;
      }
      if (!upstream) throw new NotFoundException('此音轨当前不可播放');
      const mediaType = upstream.headers.get('content-type') || '';
      const body = upstream.body;
      if (upstream.ok && !/^(?:audio\/|video\/(?:mp4|iso\.segment)\b|application\/octet-stream\b)/i.test(mediaType)) {
        await body?.cancel();
        throw new NotFoundException('哔哩哔哩未返回音频');
      }
      response.statusCode = upstream.status;
      response.setHeader('Cache-Control', 'private, no-store');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      for (const header of ['accept-ranges', 'content-range']) {
        const value = upstream.headers.get(header);
        if (value) response.setHeader(header, value);
      }
      if (upstream.ok) {
        response.setHeader('Content-Type', id.startsWith('BV') ? 'audio/mp4' : mediaType);
        const length = upstream.headers.get('content-length');
        if (length && !upstream.headers.get('content-encoding')) response.setHeader('Content-Length', length);
      }
      if (!body || head || !upstream.ok) {
        await body?.cancel();
        response.end();
        return;
      }
      await pipeline(Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]), response, { signal: disconnect.signal });
    } catch (error) {
      if (disconnect.signal.aborted) return;
      if (response.headersSent || response.destroyed) response.destroy();
      else throw error;
    } finally {
      response.off('close', stop);
    }
  }
}
