'use strict';

// src/strategies/fallback/variant-routing.ts
var LEGACY_CONTAINERS = /* @__PURE__ */ new Set(["avi", "asf", "flv"]);
var WEBCODECS_AUDIO = /* @__PURE__ */ new Set(["aac", "mp3", "opus", "vorbis", "flac"]);
var WEBCODECS_VIDEO = /* @__PURE__ */ new Set(["h264", "h265", "vp8", "vp9", "av1"]);
function pickLibavVariant(ctx) {
  if (LEGACY_CONTAINERS.has(ctx.container)) return "avbridge";
  for (const v of ctx.videoTracks) {
    if (!WEBCODECS_VIDEO.has(v.codec)) return "avbridge";
  }
  for (const a of ctx.audioTracks) {
    if (!WEBCODECS_AUDIO.has(a.codec)) return "avbridge";
  }
  return "webcodecs";
}

exports.pickLibavVariant = pickLibavVariant;
//# sourceMappingURL=chunk-F3LQJKXK.cjs.map
//# sourceMappingURL=chunk-F3LQJKXK.cjs.map