import { A as AudioCodec, V as VideoCodec, M as MediaContext, C as Classification, a as MediaInput, T as TransportConfig, b as ConvertOptions, c as ConvertResult, d as TranscodeOptions } from './player-bQ6n4hVp.js';
export { e as AudioTrackInfo, f as ContainerKind, g as CreatePlayerOptions, D as DiagnosticsSnapshot, F as FetchFn, H as HardwareAccelerationHint, O as OutputAudioCodec, h as OutputFormat, i as OutputVideoCodec, P as PlaybackSession, j as PlayerEventMap, k as PlayerEventName, l as Plugin, m as ProgressInfo, S as SettingsSectionConfig, n as StrategyClass, o as StrategyName, p as SubtitleTrackInfo, q as TranscodeQuality, U as UnifiedPlayer, r as VideoTrackInfo, s as createPlayer } from './player-bQ6n4hVp.js';

/**
 * Codecs we know `<video>` and MSE support across modern desktop + Android.
 * The decision to remux instead of decode hinges on this list.
 */
/** Codecs the browser can decode natively (also the set WebCodecs can transcode). */
declare const NATIVE_VIDEO_CODECS: Set<VideoCodec>;
declare const NATIVE_AUDIO_CODECS: Set<AudioCodec>;
/**
 * Codecs no major browser plays, period. These force the WASM fallback.
 */
declare const FALLBACK_VIDEO_CODECS: Set<VideoCodec>;
declare const FALLBACK_AUDIO_CODECS: Set<AudioCodec>;
/**
 * Pure classification — no I/O, no async. Test-friendly.
 */
declare function classifyContext(ctx: MediaContext): Classification;

/**
 * Probe a source and produce a {@link MediaContext}.
 *
 * Routing:
 * 1. Sniff the magic header. Cheap, deterministic, ignores file extensions.
 * 2. If the container is one mediabunny supports → try mediabunny first
 *    (fast path — it's a single pass of WASM-free JS parsing). If mediabunny
 *    throws (e.g. an assertion on an unsupported sample entry like `mp4v`
 *    for MPEG-4 Part 2 in ISOBMFF, or an exotic MKV codec), fall through to
 *    libav.js which handles the long tail of codecs mediabunny doesn't.
 *    The combined-error case surfaces *both* failures so the user sees
 *    which path each step took.
 * 3. If sniffing identifies AVI/ASF/FLV (or `unknown`) → libav.js directly.
 *    mediabunny can't read those containers at all, so there's no fast path
 *    to try.
 */
declare function probe(source: MediaInput, transport?: TransportConfig): Promise<MediaContext>;

/**
 * Remux a media source into a modern container format without re-encoding.
 *
 * @throws When the source codecs cannot be remuxed (e.g. WMV3 — use `transcode()` instead).
 * @throws When an AVI/ASF/FLV source is provided but libav.js is not installed.
 */
declare function remux(source: MediaInput, options?: ConvertOptions): Promise<ConvertResult>;

/**
 * Standalone transcode function: re-encode media into a modern container with
 * modern codecs. Unlike {@link remux}, this is a lossy operation that decodes
 * and re-encodes the streams.
 *
 * Built on top of mediabunny's `Conversion` class which handles the full
 * decode → encode → mux pipeline. WebCodecs encoders are used when available;
 * mediabunny falls back to other paths internally.
 *
 * Limitations in v1:
 * - Input must be in a mediabunny-readable container (MP4, MKV, WebM, OGG, ...).
 *   AVI/ASF/FLV sources are not yet supported by transcode (use remux + native
 *   playback or wait for v1.1).
 */

/**
 * Transcode a media source into a modern container with modern codecs.
 *
 * Re-encodes both video and audio. Use {@link remux} instead when the source
 * codecs are already modern and only the container needs changing — it's much
 * faster and lossless.
 */
declare function transcode(source: MediaInput, options?: TranscodeOptions): Promise<ConvertResult>;

/**
 * SRT → WebVTT converter.
 *
 * SRT cues:
 *
 *     1
 *     00:00:20,000 --> 00:00:24,400
 *     Subtitle text, possibly multiple lines.
 *
 * WebVTT cues:
 *
 *     WEBVTT
 *
 *     00:00:20.000 --> 00:00:24.400
 *     Subtitle text, possibly multiple lines.
 *
 * The differences in v1 are:
 *  - leading `WEBVTT` magic line
 *  - `,` → `.` for milliseconds
 *  - cue index lines are stripped (WebVTT allows them but SRT-style ints can
 *    confuse some parsers; we drop them)
 *  - BOM is stripped
 */
declare function srtToVtt(srt: string): string;

/**
 * Structured error with a machine-readable code and human-readable
 * recovery hint. Consumers can switch on `error.code` for programmatic
 * handling and show `error.recovery` in UI.
 *
 * All codes use the `ERR_AVBRIDGE_` prefix to avoid collisions.
 */
declare class AvbridgeError extends Error {
    /** Machine-readable error code. */
    readonly code: string;
    /** Human-readable recovery suggestion. */
    readonly recovery?: string | undefined;
    name: string;
    constructor(
    /** Machine-readable error code. */
    code: string, message: string, 
    /** Human-readable recovery suggestion. */
    recovery?: string | undefined, options?: ErrorOptions);
}
declare const ERR_PROBE_FAILED = "ERR_AVBRIDGE_PROBE_FAILED";
declare const ERR_PROBE_UNKNOWN_CONTAINER = "ERR_AVBRIDGE_PROBE_UNKNOWN_CONTAINER";
declare const ERR_PROBE_FETCH_FAILED = "ERR_AVBRIDGE_PROBE_FETCH_FAILED";
declare const ERR_CODEC_NOT_SUPPORTED = "ERR_AVBRIDGE_CODEC_NOT_SUPPORTED";
declare const ERR_STRATEGY_FAILED = "ERR_AVBRIDGE_STRATEGY_FAILED";
declare const ERR_ALL_STRATEGIES_EXHAUSTED = "ERR_AVBRIDGE_ALL_STRATEGIES_EXHAUSTED";
declare const ERR_PLAYER_NOT_READY = "ERR_AVBRIDGE_PLAYER_NOT_READY";
declare const ERR_RANGE_NOT_SUPPORTED = "ERR_AVBRIDGE_RANGE_NOT_SUPPORTED";
declare const ERR_FETCH_FAILED = "ERR_AVBRIDGE_FETCH_FAILED";
declare const ERR_LIBAV_NOT_REACHABLE = "ERR_AVBRIDGE_LIBAV_NOT_REACHABLE";
declare const ERR_MSE_NOT_SUPPORTED = "ERR_AVBRIDGE_MSE_NOT_SUPPORTED";
declare const ERR_MSE_CODEC_NOT_SUPPORTED = "ERR_AVBRIDGE_MSE_CODEC_NOT_SUPPORTED";

export { AudioCodec, AvbridgeError, Classification, ConvertOptions, ConvertResult, ERR_ALL_STRATEGIES_EXHAUSTED, ERR_CODEC_NOT_SUPPORTED, ERR_FETCH_FAILED, ERR_LIBAV_NOT_REACHABLE, ERR_MSE_CODEC_NOT_SUPPORTED, ERR_MSE_NOT_SUPPORTED, ERR_PLAYER_NOT_READY, ERR_PROBE_FAILED, ERR_PROBE_FETCH_FAILED, ERR_PROBE_UNKNOWN_CONTAINER, ERR_RANGE_NOT_SUPPORTED, ERR_STRATEGY_FAILED, FALLBACK_AUDIO_CODECS, FALLBACK_VIDEO_CODECS, MediaContext, MediaInput, MediaInput as MediaSource, NATIVE_AUDIO_CODECS, NATIVE_VIDEO_CODECS, TranscodeOptions, TransportConfig, VideoCodec, classifyContext as classify, probe, remux, srtToVtt, transcode };
