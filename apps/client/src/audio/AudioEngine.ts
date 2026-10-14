import { clampAudioVolume, SAFE_INITIAL_VOLUME } from '../lib/audioVolume';
import { recoveryPolicy } from './recoveryPolicy';
import type { EngineSnapshot, MediaFailureCode, MediaResult, OutputHold } from './playbackTypes';

export type PlaybackIssue = 'paused' | 'blocked' | 'error' | null;

/** Single media executor. PlaybackRecovery owns retries and room synchronization. */
export class AudioEngine {
  private static _instance: AudioEngine | null = null;
  static instance(): AudioEngine { return this._instance ??= new AudioEngine(); }
  private readonly audio = new Audio();
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private graphReady = false;
  private generation = 0;
  private volume = SAFE_INITIAL_VOLUME;
  private hold: OutputHold = 'none';
  private wantsPlayback = false;
  private startAuthorized = false;
  private confirmed = false;
  private buffering = false;
  private failure: MediaFailureCode | null = null;
  private cancelStartup: (() => void) | null = null;
  private stallTimer: ReturnType<typeof setTimeout> | undefined;
  private rafId = 0;
  private listeners = new Set<(state: EngineSnapshot) => void>();
  private tickCb: ((ms: number) => void) | null = null;
  private endCb: (() => void) | null = null;
  private bufferingCb: ((value: boolean) => void) | null = null;
  private durationCb: ((value: number) => void) | null = null;
  private issueCb: ((value: PlaybackIssue) => void) | null = null;
  private observedPosition = 0;

  private constructor() {
    this.audio.preload = 'auto'; this.audio.crossOrigin = 'anonymous'; this.audio.volume = 1;
    const position = () => {
      if (!this.wantsPlayback) return;
      this.tickCb?.(this.currentMs);
      if (!this.cancelStartup && this.startAuthorized && this.hold === 'none' && !this.audio.seeking
        && !this.audio.paused && !this.audio.ended && !this.buffering && this.ctx?.state === 'running'
        && this.currentMs > this.observedPosition + 40 && !this.confirmed) {
        this.confirmed = true; this.publish();
      }
      this.observedPosition = this.currentMs;
    };
    this.audio.addEventListener('timeupdate', position);
    this.audio.addEventListener('seeked', position);
    this.audio.addEventListener('loadedmetadata', () => {
      this.durationCb?.(Number.isFinite(this.audio.duration) ? this.audio.duration * 1000 : 0);
    });
    this.audio.addEventListener('playing', () => {
      if (!this.wantsPlayback || !this.startAuthorized || this.isOutputSuppressed || this.hold === 'gesture') {
        this.audio.pause(); return;
      }
      if (this.ctx?.state === 'running' && this.hold === 'system') this.hold = 'none';
      this.buffering = false; this.failure = null; this.clearStall(); this.startTicker(); this.publish();
    });
    this.audio.addEventListener('waiting', () => {
      if (!this.wantsPlayback) return;
      this.buffering = true; this.publish(); this.watchStall();
    });
    this.audio.addEventListener('stalled', () => this.watchStall());
    this.audio.addEventListener('pause', () => {
      if (this.wantsPlayback && this.startAuthorized && this.audio.paused && !this.audio.ended
        && !this.audio.error && this.hold === 'none') {
        this.hold = 'system'; this.confirmed = false; this.publish();
      }
    });
    this.audio.addEventListener('ended', () => {
      if (!this.wantsPlayback || !this.startAuthorized || !this.audio.ended) return;
      this.confirmed = false; this.stopTicker(); this.publish(); this.endCb?.();
    });
    this.audio.addEventListener('error', () => {
      if (!this.wantsPlayback || !this.audio.error) return;
      this.failure = this.audio.error.code === 3 ? 'MEDIA_DECODE'
        : this.audio.error.code === 4 ? 'MEDIA_UNSUPPORTED' : 'MEDIA_NETWORK';
      this.confirmed = false; this.buffering = false; this.clearStall(); this.publish();
    });
  }

  private ensureGraph(): void {
    if (this.graphReady) return;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx ??= new Ctor(); this.gain ??= this.ctx.createGain();
    this.gain.gain.value = this.effectiveVolume;
    this.source ??= this.ctx.createMediaElementSource(this.audio);
    this.source.connect(this.gain).connect(this.ctx.destination);
    this.ctx.addEventListener('statechange', () => {
      if (!this.wantsPlayback || !this.startAuthorized) return;
      if (this.ctx?.state !== 'running' && this.hold === 'none') {
        this.hold = 'system'; this.confirmed = false;
      } else if (this.ctx?.state === 'running' && !this.audio.paused && this.hold === 'system') this.hold = 'none';
      this.publish();
    });
    this.graphReady = true;
  }

  /** Synchronous user activation, including when a URL still needs resolving. */
  unlock(): void {
    try { this.ensureGraph(); void this.ctx?.resume().catch(() => {}); } catch { /* reported by start */ }
  }
  releaseHold(): void { this.hold = 'none'; this.applyGain(); this.publish(); }
  setHold(reason: 'manual' | 'noisy'): void {
    this.hold = reason; this.cancelStartup?.();
    this.startAuthorized = false; this.confirmed = false;
    this.audio.pause(); this.applyGain({ immediate: true }); this.publish();
  }
  setOutputSuppressed(value: boolean, _options: { immediate?: boolean } = {}): void {
    if (value) this.setHold('manual'); else this.releaseHold();
  }

  async load(url: string, offset: number | (() => number) = 0, signal?: AbortSignal): Promise<MediaResult> {
    this.retire();
    const gen = this.generation;
    this.wantsPlayback = true; this.failure = null; this.buffering = true;
    if (signal?.aborted) { this.stop(); return { status: 'cancelled' }; }
    this.audio.src = url; this.audio.load(); this.publish();
    if (this.hold !== 'none') { this.buffering = false; this.publish(); return { status: 'held', reason: this.hold }; }
    return this.start(gen, signal, typeof offset === 'function' ? offset : () => offset);
  }

  resume(signal?: AbortSignal, target?: () => number): Promise<MediaResult> {
    if (this.isOutputSuppressed) return Promise.resolve({ status: 'held', reason: this.hold });
    this.hold = 'none';
    if (!this.wantsPlayback) { this.unlock(); return Promise.resolve({ status: 'held', reason: 'none' }); }
    this.cancelStartup?.();
    if (this.failure) {
      const position = this.currentMs;
      this.startAuthorized = false; this.audio.pause(); this.audio.load();
      target ??= () => position;
    }
    this.failure = null;
    return this.start(this.generation, signal, target);
  }

  private start(gen: number, signal?: AbortSignal, target?: () => number): Promise<MediaResult> {
    if (signal?.aborted) return Promise.resolve({ status: 'cancelled' });
    try { this.ensureGraph(); } catch {
      this.failure = 'MEDIA_UNSUPPORTED'; this.publish(); return Promise.resolve({ status: 'failed', code: this.failure });
    }
    this.startAuthorized = true;
    let done = false;
    let positioned = !target;
    let started = false;
    let baseline = this.currentMs;
    let settledAt = 0;
    const began = performance.now();
    return new Promise<MediaResult>((resolve) => {
      let interval: ReturnType<typeof setInterval>;
      const current = () => gen === this.generation;
      const finish = (result: MediaResult) => {
        if (done) return;
        done = true; clearInterval(interval);
        signal?.removeEventListener('abort', cancel);
        this.audio.removeEventListener('loadedmetadata', position);
        if (this.cancelStartup === cancel) this.cancelStartup = null;
        if (current()) {
          this.buffering = false;
          if (result.status === 'playing') { this.confirmed = true; this.failure = null; }
          else {
            this.startAuthorized = result.status === 'held' && result.reason === 'system';
            this.confirmed = false;
            if (!this.startAuthorized) this.audio.pause();
            if (result.status === 'failed') this.failure = result.code;
          }
          this.publish();
        }
        resolve(result);
      };
      const cancel = () => finish({ status: 'cancelled' });
      const position = () => {
        if (!current() || done || positioned || this.audio.readyState < 1) return;
        try { this.seek(target!()); positioned = true; baseline = this.currentMs; } catch { /* retry within deadline */ }
      };
      this.cancelStartup = cancel;
      signal?.addEventListener('abort', cancel, { once: true });
      this.audio.addEventListener('loadedmetadata', position);
      position();
      interval = setInterval(() => {
        if (!current()) { finish({ status: 'cancelled' }); return; }
        if (this.hold !== 'none') { finish({ status: 'held', reason: this.hold }); return; }
        if (this.failure) { finish({ status: 'failed', code: this.failure }); return; }
        position();
        if (started && positioned && !this.audio.seeking && !this.audio.paused && !this.audio.ended
          && !this.buffering && this.ctx?.state === 'running' && this.currentMs > baseline + 40) {
          finish({ status: 'playing' }); return;
        }
        if ((!started && performance.now() - began >= recoveryPolicy.startTimeout)
          || (started && performance.now() - settledAt >= recoveryPolicy.confirmTimeout)) {
          finish({ status: 'failed', code: 'MEDIA_START_TIMEOUT' });
        }
      }, 100);
      try {
        const contextReady = this.ctx!.state === 'running' ? Promise.resolve() : this.ctx!.resume();
        let mediaReady: Promise<void>;
        try { mediaReady = this.audio.play(); } catch (error) { mediaReady = Promise.reject(error); }
        void Promise.all([contextReady, mediaReady]).then(() => {
          if (done || !current()) return;
          started = true; settledAt = performance.now(); this.buffering = false;
          baseline = this.currentMs; this.startTicker();
        }, (error: unknown) => {
          if (done || !current()) return;
          if (error instanceof DOMException && error.name === 'NotAllowedError') {
            this.hold = 'gesture'; finish({ status: 'held', reason: 'gesture' });
          } else finish({ status: 'failed', code: error instanceof DOMException && error.name === 'NotSupportedError' ? 'MEDIA_UNSUPPORTED' : 'MEDIA_NETWORK' });
        });
      } catch { finish({ status: 'failed', code: 'MEDIA_NETWORK' }); }
    });
  }

  private retire(): void {
    this.startAuthorized = false; this.wantsPlayback = false;
    this.cancelStartup?.(); this.generation++; this.confirmed = false;
    this.clearStall(); this.stopTicker(); this.audio.pause();
  }
  stop(): void {
    this.retire(); this.failure = null; this.buffering = false;
    this.audio.removeAttribute('src'); this.audio.load();
    this.tickCb?.(0); this.durationCb?.(0); this.publish();
  }
  private clearStall(): void { clearTimeout(this.stallTimer); this.stallTimer = undefined; }
  private watchStall(): void {
    if (this.stallTimer !== undefined || !this.wantsPlayback || this.hold !== 'none') return;
    const position = this.currentMs;
    this.stallTimer = setTimeout(() => {
      this.stallTimer = undefined;
      if (!this.wantsPlayback || this.hold !== 'none' || this.audio.paused || this.audio.ended) return;
      if (this.currentMs > position + 40) { if (this.buffering) this.watchStall(); return; }
      if (this.audio.readyState >= 3 && !this.buffering) return;
      this.failure = 'MEDIA_STALL'; this.confirmed = false; this.publish();
    }, recoveryPolicy.stallTimeout);
  }
  private startTicker(): void {
    this.stopTicker();
    const tick = () => {
      if (!this.audio.paused && !this.audio.ended) {
        this.tickCb?.(this.currentMs); this.rafId = requestAnimationFrame(tick);
      }
    };
    this.rafId = requestAnimationFrame(tick);
  }
  private stopTicker(): void { if (this.rafId) cancelAnimationFrame(this.rafId); this.rafId = 0; }
  seek(ms: number): void {
    if (!Number.isFinite(ms)) return;
    this.audio.currentTime = Math.max(0, ms) / 1000; this.tickCb?.(this.currentMs);
    this.observedPosition = this.currentMs;
  }
  setRate(rate: number): void { this.audio.playbackRate = rate; }
  get currentMs(): number { return this.audio.currentTime * 1000; }
  get isPlaying(): boolean { return this.confirmed && !this.audio.paused && !this.audio.ended && this.ctx?.state === 'running'; }
  get isOutputSuppressed(): boolean { return this.hold === 'manual' || this.hold === 'noisy'; }
  get snapshot(): EngineSnapshot {
    return { playing: this.isPlaying, buffering: this.buffering, hold: this.hold, failure: this.failure,
      position: this.currentMs, readyState: this.audio.readyState, seeking: this.audio.seeking };
  }
  subscribe(listener: (state: EngineSnapshot) => void): () => void {
    this.listeners.add(listener); listener(this.snapshot); return () => { this.listeners.delete(listener); };
  }
  private publish(): void {
    const state = this.snapshot;
    this.bufferingCb?.(state.buffering);
    this.issueCb?.(state.hold === 'gesture' ? 'blocked' : state.hold !== 'none' ? 'paused' : state.failure ? 'error' : null);
    this.listeners.forEach((listener) => listener(state));
  }
  onTick(cb: ((value: number) => void) | null): void { this.tickCb = cb; }
  onEnd(cb: (() => void) | null): void { this.endCb = cb; }
  onDuration(cb: ((value: number) => void) | null): void { this.durationCb = cb; }
  onBuffering(cb: ((value: boolean) => void) | null): void { this.bufferingCb = cb; }
  onPlaybackIssue(cb: ((value: PlaybackIssue) => void) | null): void { this.issueCb = cb; this.publish(); }
  getVolume(): number { return this.volume; }
  setVolume(value: number, options: { immediate?: boolean } = {}): void {
    this.volume = clampAudioVolume(value); this.audio.volume = 1; this.applyGain(options);
  }
  private get effectiveVolume(): number { return this.isOutputSuppressed ? 0 : this.volume; }
  private applyGain(options: { immediate?: boolean } = {}): void {
    if (!this.gain || !this.ctx) return;
    const now = this.ctx.currentTime;
    const gain = this.gain.gain;
    if (typeof gain.cancelAndHoldAtTime === 'function') gain.cancelAndHoldAtTime(now);
    else { const value = gain.value; gain.cancelScheduledValues(now); gain.setValueAtTime(value, now); }
    if (options.immediate || this.ctx.state !== 'running') gain.setValueAtTime(this.effectiveVolume, now);
    else gain.linearRampToValueAtTime(this.effectiveVolume, now + 0.04);
  }
}
