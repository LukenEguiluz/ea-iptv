/**
 * Core types shared across avbridge modules.
 *
 * The four main concepts:
 * - {@link MediaInput} — what the user gives us (File / Blob / URL / bytes).
 * - {@link MediaContext} — what we learned about it from probing.
 * - {@link Classification} — which playback strategy we picked.
 * - {@link PlaybackSession} — the running playback, returned by a strategy.
 */
/**
 * Anything we accept as a media source. We do not accept arbitrary
 * `ReadableStream`s in v1 because we need random access for seeking.
 */
type MediaInput = File | Blob | string | URL | ArrayBuffer | Uint8Array;
/** Container format families we know about. */
type ContainerKind = "mp4" | "mov" | "mkv" | "webm" | "avi" | "asf" | "flv" | "rm" | "ogg" | "wav" | "mp3" | "flac" | "adts" | "mpegts" | "unknown";
/** Video codec families. Strings, not enums, so plugins can extend. */
type VideoCodec = "h264" | "h265" | "vp8" | "vp9" | "av1" | "mpeg4" | "wmv3" | "vc1" | "rv10" | "rv20" | "rv30" | "rv40" | "mpeg2" | "mpeg1" | "theora" | "dv" | "hq_hqa" | "rawvideo" | "qtrle" | "png" | "vp6f" | (string & {});
/** Audio codec families. */
type AudioCodec = "aac" | "mp3" | "opus" | "vorbis" | "flac" | "pcm" | "ac3" | "eac3" | "wmav2" | "wmapro" | "alac" | "cook" | "ra_144" | "ra_288" | "sipr" | "atrac3" | "dts" | "truehd" | (string & {});
interface VideoTrackInfo {
    id: number;
    codec: VideoCodec;
    /** Codec-private profile string when known (e.g. "High", "Main 10"). */
    profile?: string;
    level?: number;
    width: number;
    height: number;
    /** Pixel format string in ffmpeg style (e.g. "yuv420p", "yuv420p10le"). */
    pixelFormat?: string;
    /** Frames per second, when known. */
    fps?: number;
    bitDepth?: number;
    /** RFC 6381 codec string for `MediaSource.isTypeSupported`, when computable. */
    codecString?: string;
}
interface AudioTrackInfo {
    id: number;
    codec: AudioCodec;
    channels: number;
    sampleRate: number;
    language?: string;
    codecString?: string;
}
interface SubtitleTrackInfo {
    id: number;
    /** "vtt" | "srt" | "ass" | "pgs" | "embedded" */
    format: string;
    language?: string;
    /** Set if this is a sidecar file rather than embedded in the container. */
    sidecarUrl?: string;
}
/**
 * Everything the probe layer learned about a source.
 * This is the input to the classification engine.
 */
interface MediaContext {
    source: MediaInput;
    /** Stable display name for diagnostics, if we have one. */
    name?: string;
    byteLength?: number;
    container: ContainerKind;
    videoTracks: VideoTrackInfo[];
    audioTracks: AudioTrackInfo[];
    subtitleTracks: SubtitleTrackInfo[];
    /** Which probe backend produced this context, for diagnostics. */
    probedBy: "mediabunny" | "libav" | "sniff";
    /** Total duration in seconds, if known. */
    duration?: number;
}
/**
 * The four playback strategies, ordered from lightest to heaviest:
 * - `"native"` — direct `<video>` playback (zero overhead)
 * - `"remux"` — repackage to fragmented MP4 via MSE (preserves hardware decode)
 * - `"hybrid"` — libav.js demux + WebCodecs hardware decode (for AVI/ASF/FLV with modern codecs)
 * - `"fallback"` — full WASM software decode via libav.js (universal, CPU-intensive)
 */
type StrategyName = "native" | "remux" | "hybrid" | "fallback";
/**
 * Classification outcome from the rules engine. Determines which strategy to use:
 * - `NATIVE` — browser plays this directly
 * - `REMUX_CANDIDATE` — codecs are native, container needs repackaging
 * - `HYBRID_CANDIDATE` — container needs libav demux, codecs are hardware-decodable
 * - `FALLBACK_REQUIRED` — codec has no browser decoder, WASM decode needed
 * - `RISKY_NATIVE` — might work natively but may stall (e.g. Hi10P, 4K120)
 */
type StrategyClass = "NATIVE" | "REMUX_CANDIDATE" | "HYBRID_CANDIDATE" | "FALLBACK_REQUIRED" | "RISKY_NATIVE";
interface Classification {
    class: StrategyClass;
    strategy: StrategyName;
    reason: string;
    /**
     * Ordered list of strategies to try if the primary fails or stalls.
     * The player pops from the front on each escalation.
     */
    fallbackChain?: StrategyName[];
}
/**
 * A live playback session created by a strategy. The {@link UnifiedPlayer}
 * delegates user-facing controls to whichever session is currently active.
 */
interface PlaybackSession {
    readonly strategy: StrategyName;
    play(): Promise<void>;
    pause(): void;
    seek(time: number): Promise<void>;
    setAudioTrack(id: number): Promise<void>;
    setSubtitleTrack(id: number | null): Promise<void>;
    /** Tear down everything: revoke object URLs, close decoders, etc. */
    destroy(): Promise<void>;
    /** Strategy-specific runtime stats merged into Diagnostics. */
    getRuntimeStats(): Record<string, unknown>;
    /** Current playback position in seconds. Used to capture position before strategy switch. */
    getCurrentTime(): number;
    /** Register a callback for unrecoverable errors that should trigger escalation. */
    onFatalError?(handler: (reason: string) => void): void;
}
interface DiagnosticsSnapshot {
    container: ContainerKind | "unknown";
    videoCodec?: VideoCodec;
    audioCodec?: AudioCodec;
    width?: number;
    height?: number;
    fps?: number;
    duration?: number;
    strategy: StrategyName | "pending";
    strategyClass: StrategyClass | "pending";
    reason: string;
    probedBy?: "mediabunny" | "libav" | "sniff";
    /**
     * Where the source is coming from. `"blob"` means File / Blob /
     * ArrayBuffer / Uint8Array (in-memory). `"url"` means an HTTP/HTTPS URL
     * being streamed via Range requests.
     */
    sourceType?: "blob" | "url";
    /**
     * Transport used to read the source. `"memory"` for in-memory blobs;
     * `"http-range"` for URL sources streamed via HTTP Range requests.
     */
    transport?: "memory" | "http-range";
    /**
     * For URL sources, true if the server supports HTTP Range requests
     * (the only mode we accept — see `attachLibavHttpReader`). Always true
     * when `transport === "http-range"` because we fail fast otherwise.
     */
    rangeSupported?: boolean;
    runtime?: Record<string, unknown>;
    strategyHistory?: Array<{
        strategy: StrategyName;
        reason: string;
        at: number;
    }>;
}
/** §8.2 plugin interface, kept structurally identical to the design doc. */
interface Plugin {
    name: string;
    canHandle(context: MediaContext): boolean;
    /** Returns a session if it claims the context, otherwise throws. */
    execute(context: MediaContext, target: HTMLVideoElement, transport?: TransportConfig): Promise<PlaybackSession>;
}
/** Player creation options. */
interface CreatePlayerOptions {
    source: MediaInput;
    target: HTMLVideoElement;
    /**
     * Optional explicit subtitle list. The player otherwise tries to discover
     * sidecar files via the FileSystemDirectoryHandle (when supplied), or pulls
     * embedded subtitle tracks if the container exposes them.
     */
    subtitles?: Array<{
        url: string;
        language?: string;
        format?: "vtt" | "srt";
    }>;
    /**
     * Optional directory handle for sidecar discovery. When the source is a
     * `File` selected from this directory, sibling `*.srt`/`*.vtt` files are
     * picked up automatically.
     */
    directory?: FileSystemDirectoryHandle;
    /**
     * Skip classification and start with the given strategy. Useful for
     * diagnostics, tests, and consumers that already know the right path.
     *
     * **Note:** this is the *initial* strategy, not a hard force — if the
     * named strategy fails to start, the player still walks the fallback
     * chain like a normal classification would. The strategy class shown in
     * diagnostics matches whatever the picked strategy actually is, not
     * "NATIVE" by default.
     */
    initialStrategy?: StrategyName;
    /** Inject extra plugins; they take priority over built-ins. */
    plugins?: Plugin[];
    /**
     * When true (default), the player automatically escalates to the next
     * strategy in the fallback chain on failure or stall.
     */
    autoEscalate?: boolean;
    /**
     * Behavior when the browser tab becomes hidden.
     * - `"pause"` (default): auto-pause on hide, auto-resume on visible
     *   if the user had been playing. Matches YouTube, Netflix, and
     *   native media players. Prevents degraded playback from Chrome's
     *   background throttling of requestAnimationFrame and setTimeout.
     * - `"continue"`: keep playing. Playback will degrade anyway due to
     *   browser throttling, but useful for consumers who want full
     *   control of visibility handling themselves.
     */
    backgroundBehavior?: "pause" | "continue";
    /**
     * Extra {@link RequestInit} merged into every HTTP request the player
     * makes (probe Range requests, subtitle fetches, libav HTTP reader).
     * Headers are merged, not overwritten — so you can add `Authorization`
     * without losing the player's `Range` header.
     */
    requestInit?: RequestInit;
    /**
     * Custom fetch implementation. Defaults to `globalThis.fetch`. Useful
     * for interceptors, logging, or environments without a global fetch.
     */
    fetchFn?: FetchFn;
    /**
     * Byte budget for the libav HTTP reader's LRU cache of fetched ranges.
     * Defaults to 8 MB. Set to `0` to disable caching. Raise this when the
     * app plays seek-heavy legacy-container media from URLs — hot regions
     * (header/moov, tail index, current window) stay resident instead of
     * being re-fetched on every bounce.
     */
    cacheBytes?: number;
}
/** Signature-compatible with `globalThis.fetch`. */
type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
/** Internal transport config bundle. Not part of the public API. */
interface TransportConfig {
    requestInit?: RequestInit;
    fetchFn?: FetchFn;
    /**
     * Byte budget for the libav HTTP reader's LRU cache of fetched ranges.
     * Defaults to 8 MB. Set to `0` to disable caching entirely. Higher
     * values help seek-heavy network playback keep hot regions
     * (header/moov, tail index, current read) resident.
     */
    cacheBytes?: number;
}
/** Events emitted by {@link UnifiedPlayer}. Strongly typed. */
interface PlayerEventMap {
    strategy: {
        strategy: StrategyName;
        reason: string;
    };
    strategychange: {
        from: StrategyName;
        to: StrategyName;
        reason: string;
        currentTime: number;
    };
    tracks: {
        video: VideoTrackInfo[];
        audio: AudioTrackInfo[];
        subtitle: SubtitleTrackInfo[];
    };
    error: Error;
    timeupdate: {
        currentTime: number;
    };
    ended: void;
    ready: void;
}
type PlayerEventName = keyof PlayerEventMap;
/** Generic listener type re-exported for player.on overloads. */
type Listener<T> = (payload: T) => void;
/**
 * CustomEvents dispatched by `<avbridge-video>` and `<avbridge-player>`.
 * Map each event name to the full `CustomEvent<Detail>` so addEventListener
 * overloads can type the listener parameter correctly.
 *
 * Standard HTMLMediaElement events (play, pause, seeking, volumechange,
 * etc.) are forwarded from the inner `<video>` as plain `Event`s and remain
 * typed via the built-in `HTMLElementEventMap`. They are NOT in this map —
 * TypeScript will pick up their native types automatically.
 */
interface AvbridgeVideoElementEventMap {
    strategychange: CustomEvent<{
        strategy: StrategyName;
        strategyClass: string | null;
        reason: string;
        from?: StrategyName;
        currentTime?: number;
        diagnostics: DiagnosticsSnapshot;
    }>;
    trackschange: CustomEvent<{
        audioTracks: AudioTrackInfo[];
        subtitleTracks: SubtitleTrackInfo[];
    }>;
    timeupdate: CustomEvent<{
        currentTime: number;
    }>;
    ended: CustomEvent<Record<string, never>>;
    ready: CustomEvent<{
        diagnostics: DiagnosticsSnapshot;
    }>;
    destroy: CustomEvent<Record<string, never>>;
    error: CustomEvent<{
        error: Error;
        diagnostics: DiagnosticsSnapshot | null;
    }>;
    progress: CustomEvent<{
        buffered: TimeRanges;
    }>;
    loadstart: CustomEvent<Record<string, never>>;
    fitchange: CustomEvent<{
        fit: "contain" | "cover" | "fill";
    }>;
}
/** Target output format for conversion functions. */
type OutputFormat = "mp4" | "webm" | "mkv";
/** Options for standalone conversion functions ({@link remux}, transcode). */
interface ConvertOptions {
    /** Target container format. Default: `"mp4"`. */
    outputFormat?: OutputFormat;
    /** AbortSignal to cancel the operation. */
    signal?: AbortSignal;
    /** Called periodically with progress information. */
    onProgress?: (info: ProgressInfo) => void;
    /** When true, reject on any uncertain codec/container combo. Default: `false` (best-effort). */
    strict?: boolean;
    /**
     * Write output progressively to a `WritableStream` instead of accumulating
     * in memory. Use with the File System Access API (`showSaveFilePicker()`) to
     * transcode files larger than available memory.
     *
     * When set, the returned `ConvertResult.blob` will be an empty Blob (the
     * real data went to the stream). The caller is responsible for closing the
     * stream after the returned promise resolves.
     *
     * @example
     * ```ts
     * const handle = await showSaveFilePicker({ suggestedName: "output.mp4" });
     * const writable = await handle.createWritable();
     * const result = await transcode(file, { outputStream: writable });
     * await writable.close();
     * ```
     */
    outputStream?: WritableStream;
}
/** Progress information passed to {@link ConvertOptions.onProgress}. */
interface ProgressInfo {
    /** Estimated completion percentage, 0–100. */
    percent: number;
    /** Total bytes written to the output so far. */
    bytesWritten: number;
}
/** Quality preset for transcode. */
type TranscodeQuality = "low" | "medium" | "high" | "very-high";
/** Modern video codecs supported as transcode targets. */
type OutputVideoCodec = "h264" | "h265" | "vp9" | "av1";
/** Modern audio codecs supported as transcode targets. */
type OutputAudioCodec = "aac" | "opus" | "flac";
/**
 * Hardware acceleration hint for WebCodecs encoders.
 * - `"no-preference"` (default) — let the browser pick
 * - `"prefer-hardware"` — faster, may produce slightly lower quality at low bitrates
 * - `"prefer-software"` — better quality at low bitrates, slower; recommended for archival
 */
type HardwareAccelerationHint = "no-preference" | "prefer-hardware" | "prefer-software";
/** Options for {@link transcode}. Extends {@link ConvertOptions} with codec/quality. */
interface TranscodeOptions extends ConvertOptions {
    /** Target video codec. Default: `"h264"` for mp4/mkv, `"vp9"` for webm. */
    videoCodec?: OutputVideoCodec;
    /** Target audio codec. Default: `"aac"` for mp4/mkv, `"opus"` for webm. */
    audioCodec?: OutputAudioCodec;
    /** Quality preset. Default: `"medium"`. Maps to mediabunny `Quality` levels. */
    quality?: TranscodeQuality;
    /** Explicit video bitrate in bits per second. Overrides `quality`. */
    videoBitrate?: number;
    /** Explicit audio bitrate in bits per second. Overrides `quality`. */
    audioBitrate?: number;
    /** Target output width in pixels. Height is auto-deduced if not set. */
    width?: number;
    /** Target output height in pixels. Width is auto-deduced if not set. */
    height?: number;
    /** Target output frame rate. */
    frameRate?: number;
    /** Drop the video track entirely (audio-only output). */
    dropVideo?: boolean;
    /** Drop the audio track entirely (silent output). */
    dropAudio?: boolean;
    /**
     * Hardware acceleration hint for the WebCodecs video encoder. Default: `"no-preference"`.
     * Set to `"prefer-software"` for archival-quality encodes at low bitrates;
     * `"prefer-hardware"` for fast batch transcoding where speed matters more than the last
     * few percent of quality.
     */
    hardwareAcceleration?: HardwareAccelerationHint;
}
/** Result of a standalone conversion ({@link remux} or transcode). */
interface ConvertResult {
    /** The converted file as a Blob, ready for download or further processing. */
    blob: Blob;
    /** Full MIME type string, e.g. `"video/mp4"`. */
    mimeType: string;
    /** Container format name: `"mp4"`, `"webm"`, or `"mkv"`. */
    container: OutputFormat;
    /** Video codec in the output, if present. */
    videoCodec?: string;
    /** Audio codec in the output, if present. */
    audioCodec?: string;
    /** Duration in seconds, if known. */
    duration?: number;
    /** Suggested filename for download. */
    filename?: string;
    /**
     * Diagnostic notes about how the conversion ran. Currently records
     * automatic retry of WebCodecs encoder failures (a known headless
     * Chromium first-call init bug for the H.264 encoder).
     */
    notes?: string[];
}
/**
 * Configuration for a custom settings section added to `<avbridge-player>`
 * via {@link addSettingsSection}. Sections render in the bottom-sheet
 * settings panel alongside built-in sections (Speed, Audio, Subtitles,
 * Fit, Stats for Nerds). The player owns rendering — consumers describe
 * data; avbridge renders it in a consistent visual style.
 */
interface SettingsSectionConfig {
    /** Unique id for this section. Used to update/remove later. */
    id: string;
    /** Display label (e.g. "Quality", "Translate"). */
    label: string;
    /** Items to show when the section is expanded. */
    items: Array<{
        id: string;
        label: string;
        /** Mark the currently-selected item. */
        active?: boolean;
    }>;
    /** Called when the user picks an item. */
    onSelect(itemId: string): void;
}

declare class UnifiedPlayer {
    private readonly options;
    private readonly registry;
    private emitter;
    private session;
    private diag;
    private timeupdateInterval;
    private mediaContext;
    private classification;
    private stallTimer;
    private lastProgressTime;
    private lastProgressPosition;
    /** Last observed `HTMLVideoElement.getVideoPlaybackQuality().totalVideoFrames`
     *  (or `webkitDecodedFrameCount` fallback). Used by the silent-video
     *  watchdog — catches cases where `currentTime` advances (audio plays)
     *  but the decoder produces no frames, e.g. Firefox claiming `hev1.*`
     *  via MSE when the decoder actually can't decode HEVC. */
    private lastVideoFrameCount;
    private lastVideoFrameProgressTime;
    private errorListener;
    private endedListener;
    private userIntent;
    private autoPausedForVisibility;
    private visibilityListener;
    private switchingPromise;
    private subtitleResources;
    private readonly transport;
    /**
     * @internal Use {@link createPlayer} or {@link UnifiedPlayer.create} instead.
     */
    private constructor();
    static create(options: CreatePlayerOptions): Promise<UnifiedPlayer>;
    private bootstrap;
    /**
     * Try to start a session with the given strategy. On failure, walk the
     * fallback chain. Throws only if all strategies are exhausted.
     */
    private startSession;
    private escalate;
    private doEscalate;
    private attachSupervisor;
    private clearSupervisor;
    /** Manually switch to a different playback strategy. Preserves current position and play/pause state. Concurrent calls are serialized. */
    setStrategy(strategy: StrategyName, reason?: string): Promise<void>;
    private doSetStrategy;
    private startTimeupdateLoop;
    /** Subscribe to a player event. Returns an unsubscribe function. Sticky events (strategy, ready, tracks) replay for late subscribers. */
    on<K extends PlayerEventName>(event: K, fn: Listener<PlayerEventMap[K]>): () => void;
    /** Remove a previously registered event listener. */
    off<K extends PlayerEventName>(event: K, fn: Listener<PlayerEventMap[K]>): void;
    /** Begin or resume playback. Throws if the player is not ready. */
    play(): Promise<void>;
    /** Pause playback. No-op if the player is not ready or already paused. */
    pause(): void;
    /**
     * Handle browser tab visibility changes. On hide: pause if the user
     * had been playing. On show: resume if we were the one who paused.
     * Skips when `backgroundBehavior: "continue"` is set (listener isn't
     * installed in that case).
     */
    private onVisibilityChange;
    /** Seek to the given time in seconds. Throws if the player is not ready. */
    seek(time: number): Promise<void>;
    /** Switch the active audio track by track ID. Throws if the player is not ready. */
    setAudioTrack(id: number): Promise<void>;
    /** Switch the active subtitle track by track ID, or pass `null` to disable subtitles. */
    setSubtitleTrack(id: number | null): Promise<void>;
    /** Return a snapshot of current diagnostics: container, codecs, strategy, runtime stats, and strategy history. */
    getDiagnostics(): DiagnosticsSnapshot;
    /** Return the total duration in seconds, or `NaN` if unknown. */
    getDuration(): number;
    /** Return the current playback position in seconds. */
    getCurrentTime(): number;
    /** Tear down the player: stop timers, destroy the active session, remove all event listeners. The player is unusable after this call. */
    destroy(): Promise<void>;
}
declare function createPlayer(options: CreatePlayerOptions): Promise<UnifiedPlayer>;

export { type AudioCodec as A, type Classification as C, type DiagnosticsSnapshot as D, type FetchFn as F, type HardwareAccelerationHint as H, type MediaContext as M, type OutputAudioCodec as O, type PlaybackSession as P, type SettingsSectionConfig as S, type TransportConfig as T, UnifiedPlayer as U, type VideoCodec as V, type MediaInput as a, type ConvertOptions as b, type ConvertResult as c, type TranscodeOptions as d, type AudioTrackInfo as e, type ContainerKind as f, type CreatePlayerOptions as g, type OutputFormat as h, type OutputVideoCodec as i, type PlayerEventMap as j, type PlayerEventName as k, type Plugin as l, type ProgressInfo as m, type StrategyClass as n, type StrategyName as o, type SubtitleTrackInfo as p, type TranscodeQuality as q, type VideoTrackInfo as r, createPlayer as s, type AvbridgeVideoElementEventMap as t };
