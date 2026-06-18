'use strict';

var _documentCurrentScript = typeof document !== 'undefined' ? document.currentScript : null;
// src/util/debug.ts
function isDebugEnabled() {
  if (typeof globalThis === "undefined") return false;
  const g = globalThis;
  if (g.AVBRIDGE_DEBUG === true) return true;
  if (typeof location !== "undefined" && typeof URLSearchParams !== "undefined") {
    try {
      const p = new URLSearchParams(location.search);
      if (p.has("avbridge_debug")) {
        g.AVBRIDGE_DEBUG = true;
        return true;
      }
    } catch {
    }
  }
  return false;
}
function fmt(tag) {
  return `[avbridge:${tag}]`;
}
var dbg = {
  /** Verbose — only when debug is enabled. The hot-path normal case. */
  info(tag, ...args) {
    if (isDebugEnabled()) console.info(fmt(tag), ...args);
  },
  /** Warning — only when debug is enabled. Non-fatal oddities. */
  warn(tag, ...args) {
    if (isDebugEnabled()) console.warn(fmt(tag), ...args);
  },
  /**
   * Self-diagnosis warning. **Always** emits regardless of debug flag.
   * Use this only for conditions that mean something is actually wrong
   * or degraded — not for routine chatter.
   */
  diag(tag, ...args) {
    console.warn(fmt(tag), ...args);
  },
  /**
   * Timing helper: wraps an async call and logs its elapsed time when
   * debug is on. The callback runs whether debug is on or off — this is
   * just for the `dbg.info` at the end.
   *
   * Also unconditionally fires `dbg.diag` if the elapsed time exceeds
   * `slowMs`, so "the bootstrap took 8 seconds" shows up even without
   * debug mode enabled.
   */
  async timed(tag, label, slowMs, fn) {
    const start = performance.now();
    try {
      const result = await fn();
      const elapsed = performance.now() - start;
      if (isDebugEnabled()) {
        console.info(fmt(tag), `${label} ${elapsed.toFixed(0)}ms`);
      }
      if (elapsed > slowMs) {
        console.warn(
          fmt(tag),
          `${label} took ${elapsed.toFixed(0)}ms (>${slowMs}ms expected) \u2014 this is unusually slow; possible causes: ${hintForTag(tag)}`
        );
      }
      return result;
    } catch (err) {
      const elapsed = performance.now() - start;
      console.warn(
        fmt(tag),
        `${label} FAILED after ${elapsed.toFixed(0)}ms:`,
        err
      );
      throw err;
    }
  }
};
function hintForTag(tag) {
  switch (tag) {
    case "probe":
      return "slow network (range request), large sniff window, or libav cold-start";
    case "libav-load":
      return "large .wasm download, misconfigured AVBRIDGE_LIBAV_BASE, or server-side MIME type";
    case "bootstrap":
      return "probe+classify+strategy-init chain; enable AVBRIDGE_DEBUG for a phase breakdown";
    case "cold-start":
      return "decoder is producing output slower than realtime \u2014 check framesDecoded in getDiagnostics()";
    default:
      return "unknown stage \u2014 enable globalThis.AVBRIDGE_DEBUG for more detail";
  }
}

// src/strategies/fallback/libav-loader.ts
var cache = /* @__PURE__ */ new Map();
function cacheKey(variant, threads) {
  return `${variant}:${threads ? "thr" : "wasm"}`;
}
function loadLibav(variant = "webcodecs", opts = {}) {
  const env = globalThis;
  const wantThreads = opts.threads !== void 0 ? opts.threads : env.AVBRIDGE_LIBAV_THREADS === true;
  const key = cacheKey(variant, wantThreads);
  let entry = cache.get(key);
  if (!entry) {
    entry = loadVariant(variant, wantThreads);
    cache.set(key, entry);
  }
  return entry;
}
async function loadVariant(variant, wantThreads) {
  return dbg.timed(
    "libav-load",
    `load "${variant}" (threads=${wantThreads})`,
    5e3,
    () => loadVariantInner(variant, wantThreads)
  );
}
async function loadVariantInner(variant, wantThreads) {
  const key = cacheKey(variant, wantThreads);
  const base = `${libavBaseUrl()}/${variant}`;
  const variantUrl = `${base}/libav-${variant}.mjs`;
  dbg.info("libav-load", `fetching ${variantUrl}`);
  if (typeof fetch === "function") {
    try {
      const head = await fetch(variantUrl, { method: "GET", headers: { Range: "bytes=0-0" } });
      if (!head.ok && head.status !== 206) {
        throw new Error(
          `HTTP ${head.status} ${head.statusText} \u2014 check that libav files are served at ${base}/ (override via globalThis.AVBRIDGE_LIBAV_BASE)`
        );
      }
      try {
        await head.arrayBuffer();
      } catch {
      }
    } catch (err) {
      cache.delete(key);
      throw chain(
        `libav.js "${variant}" variant not reachable at ${variantUrl}`,
        err
      );
    }
  }
  let mod;
  try {
    const imported = await import(
      /* @vite-ignore */
      variantUrl
    );
    if (!imported || typeof imported.LibAV !== "function") {
      throw new Error(`module at ${variantUrl} did not export LibAV`);
    }
    mod = imported;
  } catch (err) {
    cache.delete(key);
    const hint = variant === "avbridge" ? `The "avbridge" variant is a custom local build. Run \`./scripts/build-libav.sh\` to produce it (requires Emscripten; ~15-30 min the first time).` : `Make sure the variant files are present at ${base}/ (set globalThis.AVBRIDGE_LIBAV_BASE to override the default lookup path).`;
    throw new Error(
      `failed to load libav.js "${variant}" variant from ${variantUrl}. ${hint} Original error: ${err.message || String(err)}`
    );
  }
  try {
    const inst = await mod.LibAV(buildOpts(base, wantThreads));
    await silenceLibavLogs(inst);
    return inst;
  } catch (err) {
    cache.delete(key);
    throw chain(`LibAV() factory failed for "${variant}" variant (threads=${wantThreads})`, err);
  }
}
async function silenceLibavLogs(inst) {
  try {
    const setLevel = inst.av_log_set_level;
    if (typeof setLevel === "function") {
      const quiet = inst.AV_LOG_QUIET ?? -8;
      await setLevel(quiet);
    }
  } catch {
  }
}
function buildOpts(base, wantThreads) {
  return {
    base,
    nothreads: !wantThreads,
    yesthreads: wantThreads
  };
}
function libavBaseUrl() {
  const override = typeof globalThis !== "undefined" ? globalThis.AVBRIDGE_LIBAV_BASE : void 0;
  if (override) return override;
  try {
    return new URL("../vendor/libav", (typeof document === 'undefined' ? require('u' + 'rl').pathToFileURL(__filename).href : (_documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === 'SCRIPT' && _documentCurrentScript.src || new URL('chunk-NNVOHKXJ.cjs', document.baseURI).href))).href;
  } catch {
    if (typeof location !== "undefined" && location.protocol.startsWith("http")) {
      return `${location.origin}/libav`;
    }
    return "/libav";
  }
}
function chain(message, err) {
  const inner = err instanceof Error ? err.message : String(err);
  console.error(`[avbridge] ${message}:`, err);
  return new Error(`${message}: ${inner || "(no message \u2014 see browser console)"}`);
}

exports.dbg = dbg;
exports.loadLibav = loadLibav;
//# sourceMappingURL=chunk-NNVOHKXJ.cjs.map
//# sourceMappingURL=chunk-NNVOHKXJ.cjs.map