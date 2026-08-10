import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  LyricLine,
  MusicProvider,
  PlaylistSummary,
  ProviderLyricResult,
  ProviderPlaylistSearchResult,
  ProviderResolveResult,
  ProviderSearchResult,
  Track,
} from '@lune/shared';
import { KugouApiService } from './kugou-api.service';

interface KugouSongRef {
  hash: string;
  albumId?: string;
  albumAudioId?: string;
  duration?: number;
}

@Injectable()
export class KugouProvider implements MusicProvider {
  readonly id = 'kugou';
  private readonly logger = new Logger(KugouProvider.name);

  constructor(@Inject(KugouApiService) private readonly api: KugouApiService) {}

  async search(keyword: string, limit = 20): Promise<ProviderSearchResult> {
    if (!keyword.trim()) return { songs: [] };
    return this.safe('search', { songs: [] }, async () => {
      const body = await this.api.search({
        keywords: keyword,
        page: 1,
        pagesize: limit,
        type: 'song',
      });
      return {
        songs: this.asList(body?.data?.lists ?? body?.data?.info ?? body?.data)
          .map((song) => this.mapTrack(song))
          .filter((track): track is Track => Boolean(track)),
      };
    });
  }

  async resolve(songId: string): Promise<ProviderResolveResult> {
    const ref = this.decodeSongId(songId);
    const fallback: ProviderResolveResult = {
      track: this.emptyTrack(songId),
      url: null,
      unplayable: true,
    };
    if (!ref) return fallback;

    return this.safe('resolve', fallback, async () => {
      const body = await this.api.songUrl({
        hash: ref.hash,
        album_id: ref.albumId,
        album_audio_id: ref.albumAudioId,
        quality: 128,
      });
      const data = body?.data ?? body;
      const url =
        this.stringValue(data, ['play_url', 'playUrl', 'url']) ||
        this.firstString(data?.backup_url ?? data?.backupUrl);
      const detailTrack = this.mapTrack(data, ref);
      const track = detailTrack ? { ...detailTrack, id: songId } : this.emptyTrack(songId);
      if (!url) this.logger.warn(`resolve 无可播 URL: hash=${ref.hash}`);
      return { track, url: url || null, unplayable: !url };
    });
  }

  async lyric(songId: string): Promise<ProviderLyricResult> {
    const ref = this.decodeSongId(songId);
    if (!ref) return { lines: [] };

    return this.safe('lyric', { lines: [] }, async () => {
      const search = await this.api.searchLyric({
        hash: ref.hash,
        duration: ref.duration ? Math.round(ref.duration / 1000) : undefined,
        man: 'no',
      });
      const candidates = this.asList(
        search?.candidates ?? search?.data?.candidates ?? search?.data?.lists ?? search?.data,
      );
      const candidate = candidates[0];
      const lyricId = this.stringValue(candidate, ['id', 'lyrics_id', 'lyric_id']);
      const accesskey = this.stringValue(candidate, ['accesskey', 'access_key']);
      if (!lyricId || !accesskey) return { lines: [] };

      const result = await this.api.lyric({
        id: lyricId,
        accesskey,
        fmt: 'lrc',
        decode: true,
      });
      const lrc =
        this.stringValue(result, ['decodeContent', 'decode_content', 'lyric']) ||
        this.stringValue(result?.data, ['decodeContent', 'decode_content', 'lyric']);
      return { lines: this.parseLyric(lrc) };
    });
  }

  async searchPlaylists(keyword: string, limit = 20): Promise<ProviderPlaylistSearchResult> {
    if (!keyword.trim()) return { playlists: [] };
    return this.safe('playlist-search', { playlists: [] }, async () => {
      const body = await this.api.search({
        keywords: keyword,
        page: 1,
        pagesize: limit,
        type: 'special',
      });
      const playlists = this.asList(body?.data?.lists ?? body?.data?.info ?? body?.data)
        .map((item): PlaylistSummary | null => {
          const id = this.stringValue(item, [
            'specialid',
            'special_id',
            'global_collection_id',
            'listid',
            'id',
          ]);
          if (!id) return null;
          return {
            id,
            provider: this.id,
            name: this.cleanText(
              this.stringValue(item, ['specialname', 'special_name', 'name', 'collectname']),
            ),
            coverUrl: this.coverUrl(
              this.stringValue(item, ['img', 'image', 'cover', 'pic', 'sizable_cover']),
            ),
            trackCount: this.numberValue(item, [
              'songcount',
              'song_count',
              'track_count',
              'count',
            ]),
            creator: this.cleanText(
              this.stringValue(item, ['nickname', 'username', 'user_name', 'author_name']),
            ),
          };
        })
        .filter((item): item is PlaylistSummary => Boolean(item));
      return { playlists };
    });
  }

  async playlist(playlistId: string): Promise<Track[]> {
    return this.safe('playlist', [], async () => {
      let body: any;
      try {
        body = await this.api.playlistSpecialTracks({
          specialid: playlistId,
          page: 1,
          pagesize: 500,
        });
      } catch {
        // 兼容直接传入 global_collection_id 的旧调用。
        body = await this.api.playlistTrackAll({
          id: playlistId,
          page: 1,
          pagesize: 500,
        });
      }
      return this.asList(
        body?.data?.info ?? body?.data?.songs ?? body?.data?.lists ?? body?.data,
      )
        .map((song) => this.mapTrack(song))
        .filter((track): track is Track => Boolean(track));
    });
  }

  private mapTrack(value: any, suppliedRef?: KugouSongRef): Track | null {
    if (!value || typeof value !== 'object') return null;
    const transParam = value.trans_param ?? value.transParam ?? {};
    const hash =
      suppliedRef?.hash ||
      this.stringValue(value, ['FileHash', 'filehash', 'file_hash', 'hash', 'Hash']) ||
      this.stringValue(transParam, ['hash', 'music_hash']);
    if (!hash) return null;

    const duration =
      suppliedRef?.duration ||
      this.millisecondValue(value, ['timelength', 'time_length', 'duration_ms']) ||
      this.secondValue(value, ['Duration', 'duration', 'time']);
    const albumId =
      suppliedRef?.albumId ||
      this.stringValue(value, ['AlbumID', 'album_id', 'albumid']) ||
      this.stringValue(transParam, ['album_id']);
    const albumAudioId =
      suppliedRef?.albumAudioId ||
      this.stringValue(value, [
        'AlbumAudioID',
        'album_audio_id',
        'MixSongID',
        'mixsongid',
        'mixsong_id',
      ]);
    const fileName = this.cleanText(
      this.stringValue(value, ['FileName', 'filename', 'file_name', 'audio_name']),
    );
    let name = this.cleanText(
      this.stringValue(value, ['SongName', 'songname', 'song_name', 'name']),
    );
    let artists = this.artistValue(value);
    if (!name && fileName.includes(' - ')) name = fileName.slice(fileName.indexOf(' - ') + 3);
    if (!artists && fileName.includes(' - ')) artists = fileName.slice(0, fileName.indexOf(' - '));

    const ref: KugouSongRef = { hash, albumId, albumAudioId, duration };
    return {
      id: this.encodeSongId(ref),
      provider: this.id,
      name: name || fileName,
      artists,
      album: this.cleanText(
        this.stringValue(value, ['AlbumName', 'album_name', 'albumname', 'remark']),
      ),
      coverUrl: this.coverUrl(
        this.stringValue(value, [
          'Image',
          'image',
          'img',
          'cover',
          'album_img',
          'sizable_cover',
        ]) || this.stringValue(transParam, ['union_cover', 'unionCover']),
      ),
      duration,
    };
  }

  private artistValue(value: any): string {
    const direct = this.cleanText(
      this.stringValue(value, [
        'SingerName',
        'singername',
        'singer_name',
        'author_name',
        'AuthorName',
      ]),
    );
    if (direct) return direct;
    const authors = value?.authors ?? value?.singers;
    if (!Array.isArray(authors)) return '';
    return authors
      .map((author) =>
        this.cleanText(this.stringValue(author, ['author_name', 'singername', 'name'])),
      )
      .filter(Boolean)
      .join('/');
  }

  private encodeSongId(ref: KugouSongRef): string {
    const compact = {
      h: ref.hash,
      a: ref.albumId || undefined,
      m: ref.albumAudioId || undefined,
      d: ref.duration || undefined,
    };
    return `kg_${Buffer.from(JSON.stringify(compact)).toString('base64url')}`;
  }

  private decodeSongId(songId: string): KugouSongRef | null {
    try {
      if (!songId.startsWith('kg_')) {
        return songId ? { hash: songId } : null;
      }
      const parsed = JSON.parse(Buffer.from(songId.slice(3), 'base64url').toString('utf8'));
      if (!parsed?.h || typeof parsed.h !== 'string') return null;
      return {
        hash: parsed.h,
        albumId: parsed.a ? String(parsed.a) : undefined,
        albumAudioId: parsed.m ? String(parsed.m) : undefined,
        duration: Number(parsed.d) || undefined,
      };
    } catch {
      return null;
    }
  }

  private parseLyric(lrc: string): LyricLine[] {
    const lines: LyricLine[] = [];
    const timestamp = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
    for (const rawLine of (lrc || '').split(/\r?\n/)) {
      const matches = [...rawLine.matchAll(timestamp)];
      if (matches.length === 0) continue;
      const text = rawLine.replace(timestamp, '').trim();
      if (!text) continue;
      for (const match of matches) {
        const fraction = match[3] || '0';
        const ms = Number(fraction.padEnd(3, '0').slice(0, 3));
        lines.push({
          time: Number(match[1]) * 60 + Number(match[2]) + ms / 1000,
          text,
        });
      }
    }
    return lines.sort((a, b) => a.time - b.time);
  }

  private safe<T>(label: string, fallback: T, run: () => Promise<T>): Promise<T> {
    return run().catch((error: any) => {
      this.logger.warn(`${label} 失败: ${error?.message || '未知错误'}`);
      return fallback;
    });
  }

  private asList(value: any): any[] {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];
    return Array.isArray(value.lists)
      ? value.lists
      : Array.isArray(value.info)
        ? value.info
        : Array.isArray(value.songs)
          ? value.songs
          : [];
  }

  private stringValue(value: any, keys: string[]): string {
    if (!value || typeof value !== 'object') return '';
    for (const key of keys) {
      const candidate = value[key];
      if (candidate !== undefined && candidate !== null && typeof candidate !== 'object') {
        return String(candidate);
      }
    }
    return '';
  }

  private firstString(value: any): string {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.find((item) => typeof item === 'string') || '';
    return '';
  }

  private numberValue(value: any, keys: string[]): number {
    const result = Number(this.stringValue(value, keys));
    return Number.isFinite(result) ? result : 0;
  }

  private millisecondValue(value: any, keys: string[]): number {
    return Math.max(0, Math.round(this.numberValue(value, keys)));
  }

  private secondValue(value: any, keys: string[]): number {
    return Math.max(0, Math.round(this.numberValue(value, keys) * 1000));
  }

  private cleanText(value: string): string {
    return (value || '')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  }

  private coverUrl(value: string): string {
    const url = (value || '').replace(/\{size\}/g, '400');
    return url.startsWith('//') ? `https:${url}` : url;
  }

  private emptyTrack(id: string): Track {
    return {
      id,
      provider: this.id,
      name: '',
      artists: '',
      album: '',
      coverUrl: '',
      duration: 0,
    };
  }
}
