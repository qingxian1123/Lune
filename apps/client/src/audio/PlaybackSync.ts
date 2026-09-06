import type { ClientMessage, PlaybackState, ProviderResolveResult } from '@lune/shared';
import type { AudioEngine } from './AudioEngine';
import { createAdvancePlaybackMessage, getTrackKey } from '../lib/playbackCommand';
import { calcTargetPosition, shouldCorrect } from '../lib/sync';

type SyncEngine = Pick<AudioEngine, 'load' | 'stop' | 'onEnd' | 'seek' | 'setRate' | 'currentMs'>;

/** 音频事件属于本机实际加载的播放版本，不能借用 React 中最新的房间版本。 */
export class PlaybackSync {
  private playback: PlaybackState | null = null;
  private loadedTrackKey: string | null = null;
  private generation = 0;
  private loading = false;
  private rateTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly engine: SyncEngine,
    private readonly resolve: (id: string, provider?: string) => Promise<ProviderResolveResult>,
    private readonly send: (message: ClientMessage) => void,
    private readonly getRtt: () => number,
  ) {}

  apply(pb: PlaybackState, options: { reset?: boolean; restart?: boolean } = {}): void {
    // 排序、增删队列及过期命令的 resync 都不能重新绑定音频的结束事件。
    if (!options.reset && this.playback && pb.seq <= this.playback.seq) return;
    this.playback = pb;
    const generation = ++this.generation;
    this.engine.onEnd(null);
    this.resetRate();

    if (pb.status !== 'playing' || !pb.track) {
      this.loadedTrackKey = null;
      this.loading = false;
      this.engine.stop();
      return;
    }

    const sameLoadedTrack = !this.loading && this.loadedTrackKey === getTrackKey(pb.track);
    if (sameLoadedTrack && !options.reset && !options.restart) {
      // 同一音轨 seek 后，只接受修正完成后的这个播放版本的结束事件。
      this.bindEnd(pb, generation);
      const correction = shouldCorrect(this.engine.currentMs, this.target(pb));
      if (correction?.type === 'seek') this.engine.seek(correction.target);
      if (correction?.type === 'rate') {
        this.engine.setRate(correction.rate);
        this.rateTimer = setTimeout(() => this.engine.setRate(1), 2000);
      }
      return;
    }

    // 收到切歌就停止旧音频，不能让它在新 URL 解析期间继续触发 ended。
    this.loadedTrackKey = null;
    this.loading = true;
    this.engine.stop();
    void this.load(pb, generation);
  }

  private bindEnd(pb: PlaybackState, generation: number): void {
    let sent = false;
    this.engine.onEnd(() => {
      if (generation !== this.generation || sent) return;
      sent = true;
      const message = createAdvancePlaybackMessage(pb, 'ended');
      if (message) this.send(message);
    });
  }

  private async load(pb: PlaybackState, generation: number): Promise<void> {
    const track = pb.track!;
    try {
      const result = await this.resolve(track.id, track.provider);
      if (generation !== this.generation) return;
      if (!result.url) {
        const message = createAdvancePlaybackMessage(pb, 'unplayable');
        if (message) this.send(message);
        return;
      }
      this.bindEnd(pb, generation);
      // URL 解析可能很慢；以加载时的时间估算进度。
      await this.engine.load(result.url, this.target(pb));
      if (generation !== this.generation) return;
      this.loadedTrackKey = getTrackKey(track);
    } catch (error) {
      if (generation === this.generation) {
        console.warn('歌曲加载失败', error);
      }
    } finally {
      if (generation === this.generation) this.loading = false;
    }
  }

  resync(): boolean {
    const pb = this.playback;
    if (!pb || pb.status !== 'playing' || !pb.track || this.loading) return false;
    if (this.loadedTrackKey !== getTrackKey(pb.track)) {
      this.apply(pb, { reset: true });
      return true;
    }
    const target = this.target(pb);
    if (Math.abs(this.engine.currentMs - target) < 200) return false;
    this.resetRate();
    this.engine.seek(target);
    return true;
  }

  dispose(): void {
    ++this.generation;
    this.playback = null;
    this.loadedTrackKey = null;
    this.loading = false;
    this.engine.onEnd(null);
    this.resetRate();
    this.engine.stop();
  }

  private target(pb: PlaybackState): number {
    return calcTargetPosition(pb.position, pb.serverTimestamp, this.getRtt());
  }

  private resetRate(): void {
    clearTimeout(this.rateTimer);
    this.rateTimer = undefined;
    this.engine.setRate(1);
  }
}
