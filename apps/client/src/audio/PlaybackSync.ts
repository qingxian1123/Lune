import type { ClientMessage, PlaybackState, ProviderResolveResult } from '@lune/shared';
import type { AudioEngine } from './AudioEngine';
import { PlaybackRecovery, type RecoveryEngine } from './PlaybackRecovery';
import type { RecoveryState } from './playbackTypes';
import { createAdvancePlaybackMessage, getTrackKey } from '../lib/playbackCommand';
import { calcTargetPosition, PlaybackClock, shouldCorrect } from '../lib/sync';
import { recordPlaybackEvent } from '../lib/playbackDiagnostics';

type SyncEngine = RecoveryEngine & Pick<AudioEngine, 'onEnd' | 'seek' | 'setRate' | 'currentMs'>;

/** 音频事件属于本机实际加载的播放版本，不能借用 React 中最新的房间版本。 */
export class PlaybackSync {
  private playback: PlaybackState | null = null;
  private loadedTrackKey: string | null = null;
  private generation = 0;
  private loading = false;
  private rateTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly clock = new PlaybackClock();
  private awaitingAdvance = false;
  private recoveredSeq: number | null = null;
  private connected = true;
  readonly recovery: PlaybackRecovery;

  constructor(
    private readonly engine: SyncEngine,
    resolve: (id: string, provider?: string, signal?: AbortSignal) => Promise<ProviderResolveResult>,
    private readonly send: (message: ClientMessage) => boolean | void,
    private readonly getRtt: () => number,
    onState?: (state: RecoveryState) => void,
  ) {
    this.recovery = new PlaybackRecovery(engine, resolve, () => {
      if (!this.playback || !this.connected) return;
      const message = createAdvancePlaybackMessage(this.playback, 'unplayable');
      if (message) this.awaitingAdvance = this.send(message) !== false;
    });
    this.recovery.subscribe((state) => {
      onState?.(state);
      // Automatic and OS resumes also need calibration, without waiting for the next 5 s tick.
      if (state.phase === 'playing') queueMicrotask(() => this.resync());
    });
  }

  apply(pb: PlaybackState, options: { reset?: boolean; restart?: boolean; recover?: boolean; serverTime?: number } = {}): void {
    this.clock.observe(options.serverTime, this.getRtt());
    // 排序、增删队列及过期命令的 resync 都不能重新绑定音频的结束事件。
    if (!options.reset && this.playback && pb.seq <= this.playback.seq) {
      if (pb.seq !== this.playback.seq || !options.recover || !this.awaitingAdvance || this.recoveredSeq === pb.seq) return;
      // 服务端拒绝提前 ended/不可播报告后，按校准后的进度恢复一次，避免停在末尾或无限重试。
      this.recoveredSeq = pb.seq;
      options = { ...options, reset: true };
    }
    const newInstance = Boolean(options.restart || !this.playback?.track || (pb.track && getTrackKey(pb.track) !== getTrackKey(this.playback.track)));
    this.playback = pb;
    this.awaitingAdvance = false;
    const generation = ++this.generation;
    this.engine.onEnd(null);
    this.resetRate();

    if (pb.status !== 'playing' || !pb.track) {
      this.loadedTrackKey = null;
      this.loading = false;
      this.recovery.stop();
      return;
    }

    const sameLoadedTrack = !this.loading && this.loadedTrackKey === getTrackKey(pb.track);
    if (sameLoadedTrack && !options.reset && !options.restart) {
      // 同一音轨 seek 后，只接受修正完成后的这个播放版本的结束事件。
      this.bindEnd(pb, generation);
      this.resync();
      return;
    }

    // 收到切歌就停止旧音频，不能让它在新 URL 解析期间继续触发 ended。
    this.loadedTrackKey = null;
    this.loading = true;
    this.recovery.prepare(pb, () => this.target(this.playback ?? pb), newInstance);
    this.engine.stop();
    void this.load(pb, generation);
  }

  private bindEnd(pb: PlaybackState, generation: number): void {
    let sent = false;
    this.engine.onEnd(() => {
      if (generation !== this.generation || sent) return;
      sent = true;
      this.recovery.ended();
      if (!this.connected) return;
      this.awaitingAdvance = true;
      const message = createAdvancePlaybackMessage(pb, 'ended');
      if (message && this.send(message) === false) this.awaitingAdvance = false;
    });
  }

  private async load(pb: PlaybackState, generation: number): Promise<void> {
    try {
      this.bindEnd(pb, generation);
      const result = await this.recovery.start();
      if (generation !== this.generation) return;
      if (result.status === 'playing' || result.status === 'held') this.loadedTrackKey = getTrackKey(pb.track!);
    } finally {
      if (generation === this.generation) { this.loading = false; this.resync(); }
    }
  }

  resync(): boolean {
    const pb = this.playback;
    this.recovery.sample();
    if (!this.connected || !pb || pb.status !== 'playing' || !pb.track || this.loading
      || !this.engine.snapshot.playing || this.engine.snapshot.buffering || this.engine.snapshot.seeking) return false;
    if (this.loadedTrackKey !== getTrackKey(pb.track)) {
      this.loadedTrackKey = getTrackKey(pb.track);
    }
    const target = this.target(pb);
    recordPlaybackEvent({ event: 'drift', seq: pb.seq, drift: this.engine.currentMs - target, rtt: this.getRtt() });
    if (pb.track.duration > 0 && target >= pb.track.duration) return false;
    const correction = shouldCorrect(this.engine.currentMs, target);
    if (!correction) return false;
    this.resetRate();
    if (correction.type === 'seek') this.engine.seek(correction.target);
    else {
      this.engine.setRate(correction.rate);
      this.rateTimer = setTimeout(() => this.engine.setRate(1), 2000);
    }
    return true;
  }

  dispose(): void {
    ++this.generation;
    this.playback = null;
    this.loadedTrackKey = null;
    this.loading = false;
    this.awaitingAdvance = false;
    this.recoveredSeq = null;
    this.engine.onEnd(null);
    this.resetRate();
    this.recovery.dispose();
    this.engine.releaseHold();
  }

  setConnected(connected: boolean): void {
    this.connected = connected;
    this.recovery.setConnected(connected);
    if (!connected) this.resetRate();
  }

  observeClock(serverTime: number): void {
    if (this.connected && this.getRtt() < 5000) this.clock.observe(serverTime, this.getRtt());
  }

  retry(resumeSound = false) { return this.recovery.retry(resumeSound); }

  hold(reason: 'manual' | 'noisy'): void { this.recovery.hold(reason); }

  private target(pb: PlaybackState): number {
    return calcTargetPosition(pb.position, pb.serverTimestamp, 0, this.clock.now());
  }

  private resetRate(): void {
    clearTimeout(this.rateTimer);
    this.rateTimer = undefined;
    this.engine.setRate(1);
  }
}
