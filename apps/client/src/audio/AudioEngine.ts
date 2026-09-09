import { clampAudioVolume, SAFE_INITIAL_VOLUME } from '../lib/audioVolume';

export type PlaybackIssue = 'paused' | 'blocked' | 'error' | null;

/**
 * AudioEngine —— 单例音频引擎。
 *
 * 底层:HTMLAudioElement(流式加载) → MediaElementAudioSourceNode → GainNode → AudioContext.destination
 * - 保留 HTMLAudio 的流式加载(不必整首 decodeAudioData)
 * - 接入 Web Audio 节点图,后续可串 AnalyserNode 做可视化、或用 GainNode 做淡入
 *
 * 竞态控制:load(url) 用 generation token,加载中途再次 load 新 url 时丢弃旧回调,
 * 避免旧 url 加载完成后覆盖新曲目(V1 usePlayer 同款约束)。
 *
 * 无 pause API(产品决定只做播放/切歌)。
 */
export class AudioEngine {
  private static _instance: AudioEngine | null = null;

  static instance(): AudioEngine {
    if (!AudioEngine._instance) AudioEngine._instance = new AudioEngine();
    return AudioEngine._instance;
  }

  private readonly audio: HTMLAudioElement;
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private source: MediaElementAudioSourceNode | null = null;

  private loadGen = 0;
  private volume = SAFE_INITIAL_VOLUME;
  private outputSuppressed = false;
  private wantsPlayback = false;
  private playbackHeld = false;
  private playbackIssue: PlaybackIssue = null;
  private issueCb: ((issue: PlaybackIssue) => void) | null = null;
  private rafId = 0;
  private tickCb: ((ms: number) => void) | null = null;
  private endCb: (() => void) | null = null;
  private bufferingCb: ((b: boolean) => void) | null = null;
  private durationCb: ((ms: number) => void) | null = null;

  private constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.crossOrigin = 'anonymous';
    // 只让 GainNode 负责应用内音量，避免与 media.volume 叠乘造成非线性衰减。
    this.audio.volume = 1;
    this.bindEvents();
  }

  /** 用户手势触发 AudioContext 解锁(Tauri/浏览器首屏策略) */
  async resume(): Promise<void> {
    this.ensureGraph();
    if (this.outputSuppressed) return;
    this.playbackHeld = false;
    const gen = this.loadGen;
    // 网络/解码错误后单独 play 会继续拒绝；重新加载当前源后才能重试。
    if (this.wantsPlayback && this.audio.error) {
      const position = this.currentMs;
      this.audio.load();
      this.seek(position);
    }
    // 两项调用都在用户手势内发起；仅恢复 AudioContext 不会重启被系统暂停的媒体。
    const contextReady = this.ctx && this.ctx.state !== 'running' ? this.ctx.resume() : Promise.resolve();
    const mediaReady = this.wantsPlayback ? this.audio.play() : Promise.resolve();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.all([contextReady, mediaReady]),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('音频启动超时')), 10_000);
        }),
      ]);
      if (gen === this.loadGen && this.wantsPlayback && !this.audio.paused && this.ctx?.state === 'running') {
        this.setPlaybackIssue(null);
      }
    } catch (error) {
      if (gen === this.loadGen && this.wantsPlayback) this.reportPlaybackError(error);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private ensureGraph(): void {
    if (this.ctx && this.source) return;
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = this.effectiveVolume;
      this.source = this.ctx.createMediaElementSource(this.audio);
      this.source.connect(this.gain).connect(this.ctx.destination);
      this.ctx.addEventListener('statechange', () => {
        if (!this.wantsPlayback) return;
        if (this.ctx?.state !== 'running') {
          this.playbackHeld = true;
          this.setPlaybackIssue('paused');
        } else if (!this.audio.paused && !this.outputSuppressed) {
          this.playbackHeld = false;
          this.setPlaybackIssue(null);
        }
      });
    }
  }

  private bindEvents(): void {
    this.audio.addEventListener('loadedmetadata', () => {
      const d = Number.isFinite(this.audio.duration) ? this.audio.duration * 1000 : 0;
      this.durationCb?.(d);
    });
    this.audio.addEventListener('playing', () => {
      if (this.outputSuppressed) {
        this.audio.pause();
        return;
      }
      this.playbackHeld = false;
      this.setPlaybackIssue(this.ctx?.state === 'running' ? null : 'paused');
      this.bufferingCb?.(false);
      this.startTicker();
    });
    this.audio.addEventListener('waiting', () => this.bufferingCb?.(true));
    this.audio.addEventListener('pause', () => {
      if (this.wantsPlayback && this.audio.paused && !this.audio.ended && !this.audio.error) {
        this.playbackHeld = true;
        this.setPlaybackIssue('paused');
      }
    });
    this.audio.addEventListener('canplay', () => this.bufferingCb?.(false));
    this.audio.addEventListener('ended', () => {
      // 已换源或 stop 后，旧媒体任务队列中的 ended 不能结束新歌曲。
      if (!this.audio.ended) return;
      this.stopTicker();
      this.endCb?.();
    });
    this.audio.addEventListener('error', () => {
      if (this.wantsPlayback && this.audio.error) this.setPlaybackIssue('error');
      this.stopTicker();
      this.bufferingCb?.(false);
    });
  }

  private startTicker(): void {
    this.stopTicker();
    const tick = () => {
      if (!this.audio.paused && !this.audio.ended) {
        this.tickCb?.(this.audio.currentTime * 1000);
        this.rafId = requestAnimationFrame(tick);
      }
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopTicker(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  /**
   * 加载 URL 并从 offsetMs 开始播放。
   * 每次 await 后检查 generation，禁止旧加载任务修改新音频。
   */
  async load(url: string, offsetMs = 0): Promise<void> {
    const gen = ++this.loadGen;
    await this.ensureGraph();
    if (gen !== this.loadGen) return;
    this.stopTicker();
    this.wantsPlayback = true;
    if (!this.playbackHeld && !this.outputSuppressed) this.setPlaybackIssue(null);
    this.audio.src = url;
    this.audio.load();
    // 系统暂停、耳机断开或手动静音期间切歌只更新源，不能重新抢占焦点。
    if (this.playbackHeld || this.outputSuppressed) {
      this.setPlaybackIssue('paused');
      if (offsetMs > 0) this.seek(offsetMs);
      return;
    }
    try {
      await this.resume();
    } catch (error) {
      if (gen !== this.loadGen) return;
      console.warn('音频播放失败', error);
    }
    // 若在 await 期间被新 load 覆盖,丢弃
    if (gen !== this.loadGen) return;
    if (offsetMs > 0) this.seek(offsetMs);
  }

  /** 跳转到指定毫秒 */
  seek(ms: number): void {
    if (!Number.isFinite(ms)) return;
    this.audio.currentTime = ms / 1000;
  }

  /** 停止播放并清空 src */
  stop(): void {
    this.loadGen++;
    this.wantsPlayback = false;
    this.setPlaybackIssue(null);
    this.stopTicker();
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.tickCb?.(0);
  }

  setVolume(v: number, options: { immediate?: boolean } = {}): void {
    this.volume = clampAudioVolume(v);
    this.audio.volume = 1;
    this.applyGain(options);
  }

  /**
   * 耳机断开或用户在系统媒体卡静音时，锁住本机播放，不改写记忆音量。
   * 房间时间线继续推进；解除后由 resume + 房间同步恢复。
   */
  setOutputSuppressed(suppressed: boolean, options: { immediate?: boolean } = {}): void {
    if (this.outputSuppressed === suppressed) return;
    this.outputSuppressed = suppressed;
    this.applyGain(options);
    if (suppressed) {
      this.playbackHeld = true;
      this.audio.pause();
    }
  }

  private applyGain(options: { immediate?: boolean } = {}): void {
    if (!this.gain || !this.ctx) return;

    const now = this.ctx.currentTime;
    const gain = this.gain.gain;
    if (typeof gain.cancelAndHoldAtTime === 'function') {
      gain.cancelAndHoldAtTime(now);
    } else {
      const currentValue = gain.value;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(currentValue, now);
    }
    if (options.immediate || this.ctx.state !== 'running') {
      gain.setValueAtTime(this.effectiveVolume, now);
      return;
    }

    // 40ms 内平滑且精确到达目标值，静音和快速拖动时不会产生爆音。
    gain.linearRampToValueAtTime(this.effectiveVolume, now + 0.04);
  }

  getVolume(): number {
    return this.volume;
  }

  get isOutputSuppressed(): boolean {
    return this.outputSuppressed;
  }

  private get effectiveVolume(): number {
    return this.outputSuppressed ? 0 : this.volume;
  }

  /** 设置微调播放速率(同步修正用) */
  setRate(rate: number): void {
    this.audio.playbackRate = rate;
  }

  onTick(cb: ((ms: number) => void) | null): void {
    this.tickCb = cb;
  }

  onEnd(cb: (() => void) | null): void {
    this.endCb = cb;
  }

  onBuffering(cb: ((b: boolean) => void) | null): void {
    this.bufferingCb = cb;
  }

  onDuration(cb: ((ms: number) => void) | null): void {
    this.durationCb = cb;
  }

  onPlaybackIssue(cb: ((issue: PlaybackIssue) => void) | null): void {
    this.issueCb = cb;
    cb?.(this.playbackIssue);
  }

  private setPlaybackIssue(issue: PlaybackIssue): void {
    this.playbackIssue = issue;
    this.issueCb?.(issue);
  }

  private reportPlaybackError(error: unknown): void {
    if (this.outputSuppressed) {
      this.setPlaybackIssue('paused');
      return;
    }
    this.setPlaybackIssue(error instanceof DOMException && error.name === 'NotAllowedError' ? 'blocked' : 'error');
  }

  get isPlaying(): boolean {
    return !this.audio.paused && !this.audio.ended;
  }

  get currentMs(): number {
    return this.audio.currentTime * 1000;
  }
}
