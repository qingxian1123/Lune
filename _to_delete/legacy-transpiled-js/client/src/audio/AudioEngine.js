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
    static _instance = null;
    static instance() {
        if (!AudioEngine._instance)
            AudioEngine._instance = new AudioEngine();
        return AudioEngine._instance;
    }
    audio;
    ctx = null;
    gain = null;
    source = null;
    loadGen = 0;
    volume = 0.8;
    rafId = 0;
    tickCb = null;
    endCb = null;
    bufferingCb = null;
    durationCb = null;
    constructor() {
        this.audio = new Audio();
        this.audio.preload = 'auto';
        this.audio.crossOrigin = 'anonymous';
        this.audio.volume = this.volume;
        this.bindEvents();
    }
    /** 用户手势触发 AudioContext 解锁(Tauri/浏览器首屏策略) */
    async resume() {
        await this.ensureGraph();
        if (this.ctx && this.ctx.state !== 'running') {
            await this.ctx.resume();
        }
    }
    async ensureGraph() {
        if (this.ctx && this.source)
            return;
        if (!this.ctx) {
            const Ctor = window.AudioContext || window.webkitAudioContext;
            this.ctx = new Ctor();
            this.gain = this.ctx.createGain();
            this.gain.gain.value = this.volume;
            this.source = this.ctx.createMediaElementSource(this.audio);
            this.source.connect(this.gain).connect(this.ctx.destination);
        }
    }
    bindEvents() {
        this.audio.addEventListener('loadedmetadata', () => {
            const d = Number.isFinite(this.audio.duration) ? this.audio.duration * 1000 : 0;
            this.durationCb?.(d);
        });
        this.audio.addEventListener('playing', () => {
            this.bufferingCb?.(false);
            this.startTicker();
        });
        this.audio.addEventListener('waiting', () => this.bufferingCb?.(true));
        this.audio.addEventListener('canplay', () => this.bufferingCb?.(false));
        this.audio.addEventListener('ended', () => {
            this.stopTicker();
            this.endCb?.();
        });
        this.audio.addEventListener('error', () => {
            this.stopTicker();
            this.bufferingCb?.(false);
        });
    }
    startTicker() {
        this.stopTicker();
        const tick = () => {
            if (!this.audio.paused && !this.audio.ended) {
                this.tickCb?.(this.audio.currentTime * 1000);
                this.rafId = requestAnimationFrame(tick);
            }
        };
        this.rafId = requestAnimationFrame(tick);
    }
    stopTicker() {
        if (this.rafId)
            cancelAnimationFrame(this.rafId);
        this.rafId = 0;
    }
    /**
     * 加载 URL 并从 offsetMs 开始播放。
     * 返回 generation,外部可用以判断是否仍是当前请求。
     */
    async load(url, offsetMs = 0) {
        await this.ensureGraph();
        const gen = ++this.loadGen;
        this.stopTicker();
        this.audio.src = url;
        this.audio.load();
        try {
            await this.audio.play();
        }
        catch {
            // autoplay 被拦截,等 resume 后再 play;忽略
        }
        if (offsetMs > 0)
            this.seek(offsetMs);
        // 若在 await 期间被新 load 覆盖,丢弃
        if (gen !== this.loadGen)
            return;
    }
    /** 跳转到指定毫秒 */
    seek(ms) {
        if (!Number.isFinite(ms))
            return;
        this.audio.currentTime = ms / 1000;
    }
    /** 停止播放并清空 src */
    stop() {
        this.loadGen++;
        this.stopTicker();
        this.audio.pause();
        this.audio.removeAttribute('src');
        this.audio.load();
        this.tickCb?.(0);
    }
    setVolume(v) {
        this.volume = Math.max(0, Math.min(1, v));
        this.audio.volume = this.volume;
        if (this.gain)
            this.gain.gain.value = this.volume;
    }
    getVolume() {
        return this.volume;
    }
    /** 设置微调播放速率(同步修正用) */
    setRate(rate) {
        this.audio.playbackRate = rate;
    }
    onTick(cb) {
        this.tickCb = cb;
    }
    onEnd(cb) {
        this.endCb = cb;
    }
    onBuffering(cb) {
        this.bufferingCb = cb;
    }
    onDuration(cb) {
        this.durationCb = cb;
    }
    get isPlaying() {
        return !this.audio.paused && !this.audio.ended;
    }
    get currentMs() {
        return this.audio.currentTime * 1000;
    }
}
