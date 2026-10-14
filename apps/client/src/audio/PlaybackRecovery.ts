import type { PlaybackState, ProviderResolveResult } from '@lune/shared';
import type { AudioEngine } from './AudioEngine';
import { ApiError, boundedRequest } from '../lib/apiError';
import { recordPlaybackEvent } from '../lib/playbackDiagnostics';
import { recoveryPolicy as policy } from './recoveryPolicy';
import { idleRecovery, type EngineSnapshot, type MediaResult, type RecoveryState } from './playbackTypes';

export type RecoveryEngine = Pick<AudioEngine, 'load' | 'resume' | 'stop' | 'snapshot' | 'subscribe' | 'unlock' | 'releaseHold' | 'setHold'>;
type Resolver = (id: string, provider?: string, signal?: AbortSignal) => Promise<ProviderResolveResult>;

/** One owner for source loading, interruption recovery and the shared retry budget. */
export class PlaybackRecovery {
  state: RecoveryState = { ...idleRecovery };
  private playback: PlaybackState | null = null;
  private target: () => number = () => 0;
  private url: string | null = null;
  private connected = true;
  private disposed = false;
  private operation = 0;
  private controller: AbortController | null = null;
  private pending: Promise<MediaResult> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  private deadline = 0;
  private attempts = 0;
  private exhausted = false;
  private healthyAt = 0;
  private lastSample = 0;
  private lastPosition = 0;
  private listeners = new Set<(state: RecoveryState) => void>();
  private unsubscribe: () => void;

  constructor(private engine: RecoveryEngine, private resolve: Resolver,
    private unplayable: () => void, private now = () => performance.now(), private random = Math.random) {
    this.unsubscribe = engine.subscribe((state) => this.onEngine(state));
  }

  subscribe(listener: (state: RecoveryState) => void): () => void {
    this.listeners.add(listener); listener(this.state); return () => { this.listeners.delete(listener); };
  }
  private publish(phase: RecoveryState['phase'], code: string | null = null): void {
    const next = { phase, code, attempt: this.attempts, hold: this.engine.snapshot.hold };
    if (JSON.stringify(next) === JSON.stringify(this.state)) return;
    this.state = next;
    recordPlaybackEvent({ event: 'recovery', phase, code, hold: next.hold, attempt: this.attempts, seq: this.playback?.seq,
      operation: this.operation, readyState: this.engine.snapshot.readyState,
      durationMs: this.deadline ? Math.max(0, policy.recoveryTimeout - (this.deadline - this.now())) : undefined });
    this.listeners.forEach((listener) => listener(next));
  }
  private cancel(): void {
    ++this.operation;
    const controller = this.controller;
    this.controller = null; this.pending = null;
    clearTimeout(this.retryTimer); this.retryTimer = undefined;
    controller?.abort();
  }
  private resetBudget(): void {
    clearTimeout(this.deadlineTimer); this.deadlineTimer = undefined;
    this.deadline = 0; this.attempts = 0; this.exhausted = false; this.healthyAt = 0;
  }
  private expire(): void {
    this.exhausted = true; this.cancel(); this.publish('failed', this.state.code || 'RECOVERY_EXHAUSTED');
  }
  private beginBudget(): void {
    this.deadline ||= this.now() + policy.recoveryTimeout;
    clearTimeout(this.deadlineTimer);
    this.deadlineTimer = setTimeout(() => this.expire(), Math.max(0, this.deadline - this.now()));
  }

  prepare(playback: PlaybackState, target: () => number, newInstance: boolean): void {
    this.cancel();
    if (newInstance) this.resetBudget();
    this.url = null;
    this.playback = playback; this.target = target;
    this.lastSample = 0; this.healthyAt = 0;
  }
  setConnected(value: boolean): void {
    this.connected = value;
    if (!value) {
      this.cancel();
      if (!this.engine.snapshot.playing && this.playback) this.publish('waiting', 'CONNECTION');
    }
  }
  start(): Promise<MediaResult> { return this.run(false); }

  retry(resumeSound = false): Promise<MediaResult> {
    if (this.pending || this.retryTimer) return this.pending ?? Promise.resolve({ status: 'cancelled' });
    if (this.disposed || !this.playback) return Promise.resolve({ status: 'cancelled' });
    this.resetBudget();
    if (this.engine.snapshot.failure) this.url = null;
    if (resumeSound) this.engine.releaseHold();
    this.engine.unlock();
    // Resume a valid existing source synchronously in the gesture. Invalid URLs are re-resolved.
    return this.run(Boolean(this.url && !this.engine.snapshot.failure), true);
  }
  hold(reason: 'manual' | 'noisy'): void {
    clearTimeout(this.deadlineTimer); this.deadlineTimer = undefined;
    this.cancel(); this.engine.setHold(reason); this.publish('waiting', 'OUTPUT_HELD');
  }
  ended(): void {
    this.cancel(); clearTimeout(this.deadlineTimer); this.deadlineTimer = undefined;
    this.publish('waiting', this.connected ? 'NEXT_TRACK' : 'CONNECTION');
  }
  sample(): void {
    const state = this.engine.snapshot;
    const at = this.now();
    const healthy = state.playing && !state.buffering && !state.seeking && state.hold === 'none';
    if (!healthy || !this.lastSample || at - this.lastSample > 7_500 || state.position <= this.lastPosition
      || state.position - this.lastPosition > (at - this.lastSample) * 1.5 + 500) this.healthyAt = 0;
    else {
      this.healthyAt ||= this.lastSample;
      if (at - this.healthyAt >= policy.healthyReset) this.resetBudget();
    }
    this.lastSample = at; this.lastPosition = state.position;
  }
  private onEngine(state: EngineSnapshot): void {
    if (this.disposed || !this.playback) return;
    if (state.hold !== 'none') {
      clearTimeout(this.deadlineTimer); this.deadlineTimer = undefined;
      this.publish('waiting', 'OUTPUT_HELD');
      return;
    }
    if (this.pending || this.controller || this.retryTimer) return;
    if (state.failure) {
      // Engine events can arrive while a source is being retired. Recheck after that operation.
      queueMicrotask(() => {
        if (!this.disposed && !this.pending && !this.controller && !this.retryTimer
          && this.engine.snapshot.failure === state.failure) this.failed(new ApiError('', 0, state.failure!));
      });
    } else if (state.playing) {
      if (!state.buffering) { clearTimeout(this.deadlineTimer); this.deadlineTimer = undefined; }
      this.publish(state.buffering ? 'buffering' : 'playing');
    }
    else if (state.buffering) this.publish('buffering');
    else if (this.state.phase === 'playing' || this.state.phase === 'buffering') this.publish('waiting', this.connected ? 'NEXT_TRACK' : 'CONNECTION');
  }

  private run(resumeExisting: boolean, manual = false): Promise<MediaResult> {
    if (this.pending) return this.pending;
    if (!this.playback || this.disposed) return Promise.resolve({ status: 'cancelled' });
    if (this.engine.snapshot.hold !== 'none') {
      this.publish('waiting', 'OUTPUT_HELD'); return Promise.resolve({ status: 'held', reason: this.engine.snapshot.hold });
    }
    if (!this.connected && !(manual && resumeExisting)) {
      this.publish('waiting', 'CONNECTION'); return Promise.resolve({ status: 'cancelled' });
    }
    if (this.exhausted || (this.deadline && this.now() >= this.deadline)) {
      this.expire(); return Promise.resolve({ status: 'cancelled' });
    }
    const id = ++this.operation;
    const controller = new AbortController(); this.controller = controller;
    const pb = this.playback;
    const current = () => !this.disposed && id === this.operation && !controller.signal.aborted;
    const perform = async (): Promise<MediaResult> => {
      try {
        let result: MediaResult;
        if (resumeExisting) {
          this.publish('recovering');
          result = await this.engine.resume(controller.signal, this.connected ? this.target : undefined);
        } else {
          if (!this.url) {
            this.publish(this.attempts ? 'recovering' : 'resolving');
            const source = await boundedRequest((signal) => this.resolve(pb.track!.id, pb.track!.provider, signal),
              controller.signal, Math.min(policy.resolveTimeout, this.deadline ? Math.max(1, this.deadline - this.now()) : policy.resolveTimeout));
            if (!current()) return { status: 'cancelled' };
            if (!source.url) {
              if (source.unplayable === true) {
                this.exhausted = true; clearTimeout(this.deadlineTimer);
                this.publish('waiting', 'UNPLAYABLE'); this.unplayable();
                return { status: 'cancelled' };
              }
              throw new ApiError('歌曲暂时未能载入', 0, 'RESOLVE_NETWORK');
            }
            this.url = source.url;
          }
          if (!current()) return { status: 'cancelled' };
          this.publish(this.attempts ? 'recovering' : 'loading');
          result = await this.engine.load(this.url, this.target, controller.signal);
        }
        if (!current()) return { status: 'cancelled' };
        if (result.status === 'playing') {
          clearTimeout(this.deadlineTimer); this.deadlineTimer = undefined;
          this.publish('playing');
        } else if (result.status === 'held') this.publish('waiting', 'OUTPUT_HELD');
        else if (result.status === 'failed') throw new ApiError('', 0, result.code);
        return result;
      } catch (error) {
        if (!current()) return { status: 'cancelled' };
        this.failed(error);
        return { status: 'failed', code: 'MEDIA_NETWORK' };
      } finally {
        if (id === this.operation) { this.controller = null; this.pending = null; }
      }
    };
    // perform starts synchronously so resume() retains the original user activation.
    const task = perform();
    if (id === this.operation && this.controller) this.pending = task;
    return task;
  }

  private failed(error: unknown): void {
    if (!this.playback || this.disposed || this.retryTimer) return;
    this.healthyAt = 0;
    const api = error instanceof ApiError ? error : new ApiError('', 0, 'RESOLVE_NETWORK');
    if (!this.connected) { this.publish('waiting', 'CONNECTION'); return; }
    if (this.engine.snapshot.hold !== 'none') { this.publish('waiting', 'OUTPUT_HELD'); return; }
    this.beginBudget();
    const formatError = api.code === 'MEDIA_DECODE' || api.code === 'MEDIA_UNSUPPORTED';
    const maxRetries = formatError ? 1 : policy.maxRetries;
    if (!api.retryable || this.exhausted || this.attempts >= maxRetries || this.now() >= this.deadline) {
      this.exhausted = true; clearTimeout(this.deadlineTimer);
      this.publish('failed', api.code); return;
    }
    const delay = Math.max(api.retryAfterMs, policy.retryDelays[this.attempts] * (0.8 + this.random() * 0.4));
    if (this.now() + delay >= this.deadline) { this.exhausted = true; clearTimeout(this.deadlineTimer); this.publish('failed', api.code); return; }
    // First media-network retry may reuse the source; subsequent failures re-resolve it.
    if (formatError || this.attempts > 0 || !api.code.startsWith('MEDIA_')) this.url = null;
    this.attempts++;
    this.publish('recovering', api.code);
    this.retryTimer = setTimeout(() => { this.retryTimer = undefined; void this.run(false); }, delay);
  }
  stop(): void {
    this.playback = null; this.cancel(); this.resetBudget(); this.url = null;
    this.engine.stop(); this.publish('idle');
  }
  dispose(): void { this.disposed = true; this.stop(); this.unsubscribe(); this.listeners.clear(); }
}
