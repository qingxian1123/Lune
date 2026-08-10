import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ProviderRegistry } from './provider.registry';
import { IsOptional, IsString, MinLength } from 'class-validator';

class SearchQueryDto {
  @IsString()
  @MinLength(1)
  kw!: string;

  @IsOptional()
  limit?: number;

  @IsOptional()
  @IsString()
  provider?: string;
}

class ResolveQueryDto {
  @IsString()
  @MinLength(1)
  id!: string;

  @IsOptional()
  @IsString()
  provider?: string;
}

class LyricQueryDto {
  @IsString()
  @MinLength(1)
  id!: string;

  @IsOptional()
  @IsString()
  provider?: string;
}

class PlaylistQueryDto {
  @IsString()
  @MinLength(1)
  id!: string;

  @IsOptional()
  @IsString()
  provider?: string;
}

class PlaylistSearchQueryDto {
  @IsString()
  @MinLength(1)
  kw!: string;

  @IsOptional()
  limit?: number;

  @IsOptional()
  @IsString()
  provider?: string;
}

@Controller('providers')
export class ProvidersController {
  constructor(@Inject(ProviderRegistry) private readonly registry: ProviderRegistry) {}

  /** 列出已激活 provider */
  @Get()
  list() {
    const details = this.registry.listActiveDetails().map(({ descriptor, status }) => ({
      ...descriptor,
      status: status.status,
    }));
    return {
      // 保留旧字段，避免当前客户端升级前发生不兼容。
      providers: details.map((provider) => provider.id),
      details,
      defaultProvider: this.registry.getDefaultId() || null,
    };
  }

  /** 搜索 */
  @Get('search')
  async search(@Query() q: SearchQueryDto) {
    const provider = this.pick(q.provider);
    const limit = q.limit && q.limit > 0 && q.limit <= 100 ? Math.floor(q.limit) : 20;
    return provider.search(q.kw, limit);
  }

  /** 解析为可播 URL */
  @Get('resolve')
  async resolve(@Query() q: ResolveQueryDto) {
    const provider = this.pick(q.provider);
    return provider.resolve(q.id);
  }

  /** 歌词 */
  @Get('lyric')
  async lyric(@Query() q: LyricQueryDto) {
    const provider = this.pick(q.provider);
    return provider.lyric(q.id);
  }

  /** 歌单导入(provider 未实现该能力时返回空数组) */
  @Get('playlist')
  async playlist(@Query() q: PlaylistQueryDto) {
    const provider = this.pick(q.provider);
    if (!provider.playlist) return [];
    return provider.playlist(q.id);
  }

  /** 按名搜歌单(provider 未实现该能力时返回空列表) */
  @Get('playlist-search')
  async playlistSearch(@Query() q: PlaylistSearchQueryDto) {
    const provider = this.pick(q.provider);
    if (!provider.searchPlaylists) return { playlists: [] };
    const limit = q.limit && q.limit > 0 && q.limit <= 100 ? Math.floor(q.limit) : 20;
    return provider.searchPlaylists(q.kw, limit);
  }

  private pick(explicit?: string) {
    const providerId = explicit || this.registry.getDefaultId();
    const provider = explicit ? this.registry.getActiveById(explicit) : this.registry.getActive();
    if (!provider) {
      throw new NotFoundException('无可用音乐源或指定的 provider 未激活');
    }
    const status = this.registry.getRuntimeStatus(providerId!);
    if (status.status === 'auth-required') {
      throw new ServiceUnavailableException({
        code: 'PROVIDER_AUTH_REQUIRED',
        message: '音乐源需要重新登录',
        provider: providerId,
        retryable: false,
      });
    }
    if (status.status === 'unavailable' || status.status === 'starting') {
      throw new ServiceUnavailableException({
        code: 'PROVIDER_UNAVAILABLE',
        message: '音乐源当前不可用',
        provider: providerId,
        retryable: true,
      });
    }
    return provider;
  }
}
