import { a as MediaInput, o as StrategyName, n as StrategyClass, U as UnifiedPlayer, e as AudioTrackInfo, p as SubtitleTrackInfo, D as DiagnosticsSnapshot, t as AvbridgeVideoElementEventMap } from './player-bQ6n4hVp.js';

/**
 * `<avbridge-video>` — `HTMLMediaElement`-compatible primitive backed by the
 * avbridge engine. Drop-in replacement for a `<video>` element with no
 * built-in UI.
 *
 * Purpose:
 *
 *   1. Validate the public API by being a real consumer of `createPlayer()`.
 *   2. Drive lifecycle correctness in the core via adversarial integration tests.
 *   3. Give consumers a `<video>`-compatible primitive they can wrap with
 *      their own UI.
 *
 * **It is not a player UI framework.** For YouTube-style chrome (seek
 * bar, play/pause, settings menu, fullscreen, auto-hiding controls) use
 * `<avbridge-player>` — it wraps this element with a full UI. See
 * `docs/dev/WEB_COMPONENT_SPEC.md` for the full spec, lifecycle invariants,
 * and edge case list.
 */

/** Strategy preference passed via the `preferstrategy` attribute. */
type PreferredStrategy = "auto" | StrategyName;
/** Fit mode — how the video fills the element's box. Mirrors CSS object-fit. */
type FitMode = "contain" | "cover" | "fill";
/**
 * `HTMLElement` is a browser-only global. SSR frameworks (Next.js, Astro,
 * Remix, etc.) commonly import library modules on the server to extract
 * types or do tree-shaking, even if the user only ends up using them in
 * the browser. If we extended `HTMLElement` directly, the `class extends`
 * expression would be evaluated at module load time and crash in Node.
 *
 * The fix: in non-browser environments, fall back to an empty stub class.
 * The element is never *constructed* server-side (the registration in
 * `element.ts` is guarded by `typeof customElements !== "undefined"`), so
 * the stub is never instantiated — it just lets the class declaration
 * evaluate cleanly so the module can be imported anywhere.
 */
declare const HTMLElementCtor: typeof HTMLElement;
/**
 * Custom element. Lifecycle correctness is enforced via a monotonically
 * increasing `_bootstrapId`: every async bootstrap captures the ID at start
 * and discards itself if the ID has changed by the time it resolves. This
 * single pattern handles disconnect-during-bootstrap, rapid src reassignment,
 * bootstrap races, and destroy-during-bootstrap.
 */
declare class AvbridgeVideoElement extends HTMLElementCtor {
    static readonly observedAttributes: string[];
    /** The shadow DOM `<video>` element that strategies render into. */
    private _videoEl;
    /** Active player session, if any. Cleared on teardown. */
    private _player;
    /**
     * Monotonic counter incremented on every (re)bootstrap. Async bootstrap
     * work captures the current ID; if it doesn't match by the time the work
     * resolves, the work is discarded.
     */
    private _bootstrapId;
    /** True after destroy() — element is permanently unusable. */
    private _destroyed;
    /** Internal source state. Either string-form (src) OR rich (source). */
    private _src;
    private _source;
    /**
     * Set when the `source` property setter is in the middle of clearing the
     * `src` attribute as part of mutual exclusion. The attributeChangedCallback
     * checks this flag and skips its normal "clear source" side effect, which
     * would otherwise wipe the value we just set.
     */
    private _suppressSrcAttrCallback;
    /** Last-known runtime state surfaced via getters. */
    private _strategy;
    private _strategyClass;
    private _audioTracks;
    /** Subtitle tracks reported by the active UnifiedPlayer (options.subtitles
     *  + embedded container tracks + programmatic addSubtitle calls). */
    private _subtitleTracks;
    /** Subtitle tracks derived from light-DOM `<track>` children. Maintained
     *  by _syncTextTracks on every mutation. Merged into the public
     *  `subtitleTracks` getter so the player's settings menu sees them. */
    private _htmlTrackInfo;
    /**
     * External subtitle list forwarded to `createPlayer()` on the next
     * bootstrap. Setting this after bootstrap queues it for the next
     * source change; consumers that need to swap subtitles mid-playback
     * should set `source` to reload.
     */
    private _subtitles;
    /**
     * Initial strategy preference. `"auto"` means "let the classifier decide";
     * any other value is passed to `createPlayer({ initialStrategy })` and
     * skips classification on the next bootstrap. Note that this only affects
     * the *initial* pick — runtime fallback escalation still applies, so a
     * preference of `"native"` may still escalate to remux/hybrid/fallback if
     * native fails.
     */
    private _preferredStrategy;
    /** Current fit mode. Applied to the inner `<video>` via object-fit, and
     *  to the fallback canvas via the `--avbridge-fit` CSS custom property on
     *  the stage wrapper (see `src/strategies/fallback/video-renderer.ts`). */
    private _fit;
    /** The stage wrapper — the element the canvas attaches into, and where
     *  the `--avbridge-fit` CSS custom property lives. */
    private _stageEl;
    /** Set if currentTime was assigned before the player was ready. */
    private _pendingSeek;
    /** Set if play() was called before the player was ready. */
    private _pendingPlay;
    /** MutationObserver tracking light-DOM `<track>` children. */
    private _trackObserver;
    /** Document-level fullscreenchange handler — installed while connected so
     *  the element can lock/unlock screen orientation to match the video's
     *  intrinsic aspect. */
    private _fullscreenChangeHandler;
    /** True if we successfully called screen.orientation.lock() on the last
     *  fullscreen entry. Used to know whether to unlock on exit. */
    private _orientationLocked;
    constructor();
    connectedCallback(): void;
    disconnectedCallback(): void;
    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null): void;
    /** Returns the currently-active source (src or source), whichever is set. */
    private _activeSource;
    /**
     * Mirror light-DOM `<track>` children into the shadow `<video>` so that
     * the browser's native text-track machinery picks them up. Called on
     * connect, on every mutation of light-DOM children, and once after each
     * source change so newly-set tracks survive a fresh `<video>`.
     *
     * Strategy: clone the children. We don't move them because the user's
     * code may still hold references to the originals (e.g. to set `default`).
     * The shadow copies are throwaway — we wipe them on every sync.
     */
    private _syncTextTracks;
    /** Internal src setter — separate from the property setter so the
     * attributeChangedCallback can use it without re-entering reflection. */
    private _setSrcInternal;
    /** Called whenever the active source changes (src or source). */
    private _onSourceChanged;
    private _bootstrap;
    /**
     * Tear down the active player and reset runtime state. Idempotent.
     * If `currentBootstrapId` is provided, the bootstrap counter is NOT
     * incremented (used by `_bootstrap()` to avoid invalidating itself).
     */
    private _teardown;
    get src(): string | null;
    set src(value: string | null);
    get source(): MediaInput | null;
    set source(value: MediaInput | null);
    get autoplay(): boolean;
    set autoplay(value: boolean);
    get muted(): boolean;
    set muted(value: boolean);
    get loop(): boolean;
    set loop(value: boolean);
    get preload(): "none" | "metadata" | "auto";
    set preload(value: "none" | "metadata" | "auto");
    get diagnostics(): boolean;
    set diagnostics(value: boolean);
    get fit(): FitMode;
    set fit(value: FitMode);
    get preferredStrategy(): PreferredStrategy;
    set preferredStrategy(value: PreferredStrategy);
    get currentTime(): number;
    set currentTime(value: number);
    get duration(): number;
    get paused(): boolean;
    get ended(): boolean;
    get readyState(): number;
    /**
     * Buffered time ranges for the active source. Mirrors the standard
     * `<video>.buffered` `TimeRanges` API.
     *
     * - **Native / remux:** pass-through to the real `<video>.buffered`
     *   (reflects the browser's SourceBuffer / progressive-download state).
     * - **Hybrid / fallback:** a single `[0, frontier]` range synthesized
     *   from the demuxer's read progress — "how far libav has ever pumped
     *   packets through." Monotonic; does not shrink on seek. This is an
     *   approximation, not MSE-fidelity: decoded frames on canvas strategies
     *   are consumed in flight, so we can't report per-range availability
     *   the way MSE does. Enough for a seek-bar buffered indicator.
     */
    get buffered(): TimeRanges;
    get poster(): string;
    set poster(value: string);
    get volume(): number;
    set volume(value: number);
    get playbackRate(): number;
    set playbackRate(value: number);
    get videoWidth(): number;
    get videoHeight(): number;
    get played(): TimeRanges;
    get seekable(): TimeRanges;
    get crossOrigin(): string | null;
    set crossOrigin(value: string | null);
    get disableRemotePlayback(): boolean;
    set disableRemotePlayback(value: boolean);
    /**
     * Native `HTMLMediaElement.canPlayType()` passthrough. Note that this
     * answers about the *browser's* native support, not avbridge's full
     * capabilities — avbridge can play many formats this method returns ""
     * for, by routing them to the remux/hybrid/fallback strategies.
     */
    canPlayType(mimeType: string): CanPlayTypeResult;
    /**
     * **Escape hatch.** The underlying shadow-DOM `<video>` element.
     *
     * Use for native browser APIs the wrapper doesn't expose:
     * - `el.videoElement.requestPictureInPicture()`
     * - `el.videoElement.audioTracks` (browser native, not avbridge's track list)
     * - direct integration with libraries that need a real HTMLVideoElement
     *
     * **Caveat:** When the active strategy is `"fallback"` or `"hybrid"`,
     * frames are rendered to a canvas overlay, not into this `<video>`.
     * APIs that depend on the actual pixels (Picture-in-Picture, captureStream)
     * will not show the playing content in those modes. Check `el.strategy`
     * before using such APIs.
     */
    get videoElement(): HTMLVideoElement;
    get strategy(): StrategyName | null;
    get strategyClass(): StrategyClass | null;
    get player(): UnifiedPlayer | null;
    get audioTracks(): AudioTrackInfo[];
    get subtitleTracks(): SubtitleTrackInfo[];
    /**
     * External subtitle files to attach when the source loads. Takes effect
     * on the next bootstrap — set before assigning `source`, or reload via
     * `load()` after changing. For dynamic post-bootstrap addition, use
     * `addSubtitle()` instead.
     *
     * @example
     * el.subtitles = [{ url: "/en.srt", format: "srt", language: "en" }];
     * el.src = "/movie.mp4";
     */
    get subtitles(): Array<{
        url: string;
        language?: string;
        format?: "vtt" | "srt";
    }> | null;
    set subtitles(value: Array<{
        url: string;
        language?: string;
        format?: "vtt" | "srt";
    }> | null);
    /**
     * Attach a subtitle track to the current playback without rebuilding
     * the player. Works while the element is playing — converts SRT to
     * VTT if needed, adds a `<track>` to the inner `<video>`. Canvas
     * strategies pick up the new track via their textTracks watcher.
     */
    addSubtitle(subtitle: {
        url: string;
        language?: string;
        format?: "vtt" | "srt";
    }): Promise<void>;
    /**
     * Disable the automatic `screen.orientation.lock()` that runs on
     * fullscreen entry. Set when you want to honor the device's native
     * auto-rotate instead of matching the video's intrinsic orientation.
     */
    get noOrientationLock(): boolean;
    set noOrientationLock(value: boolean);
    /** Called whenever `document.fullscreenchange` fires. If this element (or
     *  any of its ancestors) is now fullscreen, derive the target orientation
     *  from the video's intrinsic size and call `screen.orientation.lock()`.
     *  On exit, release the lock we took. iOS Safari rejects `lock()` — we
     *  swallow the rejection so nothing breaks on that path. */
    private _onFullscreenChange;
    /** Walk composed-tree ancestors to see if `target` is this element or
     *  any ancestor across shadow boundaries. `Node.contains()` can't cross
     *  shadow roots, so when `<avbridge-player>` (the fullscreen element)
     *  hosts this `<avbridge-video>` inside its shadow DOM, `contains()`
     *  returns false. */
    private _isInsideOrEquals;
    /** Derive "landscape" / "portrait" from the intrinsic video dimensions.
     *  Returns null when dimensions aren't known yet or the video is square.
     *  Uses `videoWidth` / `videoHeight` from the inner `<video>`, which the
     *  browser sets to the display-aspect-corrected size (so anamorphic
     *  content is judged by its display aspect, not pixel aspect). */
    private _desiredOrientation;
    /** Attempt to lock screen orientation. Swallows rejections — iOS Safari
     *  doesn't implement `lock()`, and desktop / non-fullscreen contexts will
     *  reject too. Records success so we know whether to unlock on exit. */
    private _lockOrientation;
    private _releaseOrientationLock;
    /** Force a (re-)bootstrap if a source is currently set. */
    load(): Promise<void>;
    /**
     * Begin or resume playback. If the player isn't ready yet, the call is
     * queued and applied once `ready` fires.
     */
    play(): Promise<void>;
    pause(): void;
    /**
     * Tear down the element permanently. After destroy(), the element ignores
     * all method calls and attribute changes.
     */
    destroy(): Promise<void>;
    setAudioTrack(id: number): Promise<void>;
    setSubtitleTrack(id: number | null): Promise<void>;
    getDiagnostics(): DiagnosticsSnapshot | null;
    addEventListener<K extends keyof AvbridgeVideoElementEventMap>(type: K, listener: (this: AvbridgeVideoElement, ev: AvbridgeVideoElementEventMap[K]) => unknown, options?: boolean | AddEventListenerOptions): void;
    addEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: AvbridgeVideoElement, ev: HTMLElementEventMap[K]) => unknown, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
    removeEventListener<K extends keyof AvbridgeVideoElementEventMap>(type: K, listener: (this: AvbridgeVideoElement, ev: AvbridgeVideoElementEventMap[K]) => unknown, options?: boolean | EventListenerOptions): void;
    removeEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: AvbridgeVideoElement, ev: HTMLElementEventMap[K]) => unknown, options?: boolean | EventListenerOptions): void;
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
    private _dispatch;
    private _dispatchError;
}
declare global {
    interface HTMLElementTagNameMap {
        "avbridge-video": AvbridgeVideoElement;
    }
}

export { AvbridgeVideoElement };
