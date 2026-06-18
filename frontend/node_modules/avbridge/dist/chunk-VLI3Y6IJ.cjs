'use strict';

var chunk2IJ66NTD_cjs = require('./chunk-2IJ66NTD.cjs');

// src/probe/mediabunny.ts
async function probeWithMediabunny(source, sniffedContainer) {
  const mb = await import('mediabunny');
  const input = new mb.Input({
    source: await buildMediabunnySource(mb, source),
    formats: mb.ALL_FORMATS
  });
  const allTracks = await input.getTracks();
  const duration = await safeNumber(() => input.computeDuration());
  const videoTracks = [];
  const audioTracks = [];
  for (const track of allTracks) {
    if (track.isVideoTrack()) {
      const codecParam = await safe(() => track.getCodecParameterString());
      videoTracks.push({
        id: track.id,
        codec: mediabunnyVideoToAvbridge(track.codec),
        width: track.displayWidth ?? track.codedWidth ?? 0,
        height: track.displayHeight ?? track.codedHeight ?? 0,
        codecString: codecParam ?? void 0
      });
    } else if (track.isAudioTrack()) {
      const codecParam = await safe(() => track.getCodecParameterString());
      audioTracks.push({
        id: track.id,
        codec: mediabunnyAudioToAvbridge(track.codec),
        channels: track.numberOfChannels ?? 0,
        sampleRate: track.sampleRate ?? 0,
        language: track.languageCode,
        codecString: codecParam ?? void 0
      });
    }
  }
  const format = await safe(() => input.getFormat());
  const container = resolveContainer(format?.name, sniffedContainer);
  return {
    source: source.original,
    name: source.name,
    byteLength: source.byteLength,
    container,
    videoTracks,
    audioTracks,
    subtitleTracks: [],
    probedBy: "mediabunny",
    duration
  };
}
async function buildMediabunnySource(mb, source) {
  if (source.kind === "url") {
    return new mb.UrlSource(source.url);
  }
  return new mb.BlobSource(source.blob);
}
async function buildMediabunnySourceFromInput(mb, source) {
  if (typeof source === "string") return new mb.UrlSource(source);
  if (source instanceof URL) return new mb.UrlSource(source.toString());
  if (source instanceof Blob) return new mb.BlobSource(source);
  if (source instanceof ArrayBuffer) return new mb.BlobSource(new Blob([source]));
  if (source instanceof Uint8Array) return new mb.BlobSource(new Blob([source]));
  throw new TypeError("unsupported source type for mediabunny");
}
function resolveContainer(formatName, sniffed) {
  const name = (formatName ?? "").toLowerCase();
  if (name.includes("matroska") || name.includes("mkv")) return "mkv";
  if (name.includes("webm")) return "webm";
  if (name.includes("mp4") || name.includes("isom")) return "mp4";
  if (name.includes("mov") || name.includes("quicktime")) return "mov";
  if (name.includes("ogg")) return "ogg";
  if (name.includes("wav")) return "wav";
  if (name.includes("flac")) return "flac";
  if (name.includes("mp3")) return "mp3";
  if (name.includes("adts") || name.includes("aac")) return "adts";
  if (name.includes("mpegts") || name.includes("mpeg-ts") || name.includes("transport")) return "mpegts";
  return sniffed;
}
function mediabunnyVideoToAvbridge(c) {
  switch (c) {
    case "avc":
      return "h264";
    case "hevc":
      return "h265";
    case "vp8":
      return "vp8";
    case "vp9":
      return "vp9";
    case "av1":
      return "av1";
    default:
      return c ? c : "unknown";
  }
}
function avbridgeVideoToMediabunny(c) {
  switch (c) {
    case "h264":
      return "avc";
    case "h265":
      return "hevc";
    case "vp8":
      return "vp8";
    case "vp9":
      return "vp9";
    case "av1":
      return "av1";
    default:
      return null;
  }
}
function mediabunnyAudioToAvbridge(c) {
  switch (c) {
    case "aac":
      return "aac";
    case "mp3":
      return "mp3";
    case "opus":
      return "opus";
    case "vorbis":
      return "vorbis";
    case "flac":
      return "flac";
    case "ac3":
      return "ac3";
    case "eac3":
      return "eac3";
    default:
      return c ? c : "unknown";
  }
}
function avbridgeAudioToMediabunny(c) {
  switch (c) {
    case "aac":
      return "aac";
    case "mp3":
      return "mp3";
    case "opus":
      return "opus";
    case "vorbis":
      return "vorbis";
    case "flac":
      return "flac";
    case "ac3":
      return "ac3";
    case "eac3":
      return "eac3";
    default:
      return null;
  }
}
async function safeNumber(fn) {
  try {
    const v = await fn();
    return typeof v === "number" && Number.isFinite(v) ? v : void 0;
  } catch {
    return void 0;
  }
}
async function safe(fn) {
  try {
    return await fn();
  } catch {
    return void 0;
  }
}

// src/probe/index.ts
var MEDIABUNNY_CONTAINERS = /* @__PURE__ */ new Set([
  "mp4",
  "mov",
  "mkv",
  "webm",
  "ogg",
  "wav",
  "mp3",
  "flac",
  "adts",
  "mpegts"
]);
async function probe(source, transport) {
  const normalized = await chunk2IJ66NTD_cjs.normalizeSource(source, transport);
  const sniffed = await chunk2IJ66NTD_cjs.sniffNormalizedSource(normalized);
  if (MEDIABUNNY_CONTAINERS.has(sniffed)) {
    try {
      const result = await probeWithMediabunny(normalized, sniffed);
      const hasUnknownCodec = result.videoTracks.some((t) => t.codec === "unknown") || result.audioTracks.some((t) => t.codec === "unknown");
      if (hasUnknownCodec) {
        try {
          const { probeWithLibav } = await import('./avi-32UABODO.cjs');
          return await probeWithLibav(normalized, sniffed);
        } catch {
          return result;
        }
      }
      return result;
    } catch (mediabunnyErr) {
      console.warn(
        `[avbridge] mediabunny rejected ${sniffed} file, falling back to libav:`,
        mediabunnyErr.message
      );
      try {
        const { probeWithLibav } = await import('./avi-32UABODO.cjs');
        return await probeWithLibav(normalized, sniffed);
      } catch (libavErr) {
        const mbMsg = mediabunnyErr.message || String(mediabunnyErr);
        const lvMsg = libavErr instanceof Error ? libavErr.message : String(libavErr);
        throw new chunk2IJ66NTD_cjs.AvbridgeError(
          chunk2IJ66NTD_cjs.ERR_PROBE_FAILED,
          `Failed to probe ${sniffed.toUpperCase()} file. mediabunny: ${mbMsg}. libav: ${lvMsg}.`,
          "The file may be corrupt, truncated, or in an unsupported format. Enable AVBRIDGE_DEBUG for detailed logs."
        );
      }
    }
  }
  try {
    const { probeWithLibav } = await import('./avi-32UABODO.cjs');
    return await probeWithLibav(normalized, sniffed);
  } catch (err) {
    const inner = err instanceof Error ? err.message : String(err);
    console.error("[avbridge] libav probe failed for", sniffed, "file:", err);
    if (sniffed === "unknown") {
      throw new chunk2IJ66NTD_cjs.AvbridgeError(
        chunk2IJ66NTD_cjs.ERR_PROBE_UNKNOWN_CONTAINER,
        `Unable to probe source: container format could not be identified. libav fallback: ${inner || "(no details)"}`,
        "The file may be corrupt or in a format avbridge doesn't recognize. Check the file plays in VLC or ffprobe."
      );
    }
    throw new chunk2IJ66NTD_cjs.AvbridgeError(
      chunk2IJ66NTD_cjs.ERR_LIBAV_NOT_REACHABLE,
      `${sniffed.toUpperCase()} files require libav.js, which failed to load: ${inner || "(no details)"}`,
      "Install @libav.js/variant-webcodecs, or check that AVBRIDGE_LIBAV_BASE points to the correct path."
    );
  }
}

exports.avbridgeAudioToMediabunny = avbridgeAudioToMediabunny;
exports.avbridgeVideoToMediabunny = avbridgeVideoToMediabunny;
exports.buildMediabunnySourceFromInput = buildMediabunnySourceFromInput;
exports.probe = probe;
//# sourceMappingURL=chunk-VLI3Y6IJ.cjs.map
//# sourceMappingURL=chunk-VLI3Y6IJ.cjs.map