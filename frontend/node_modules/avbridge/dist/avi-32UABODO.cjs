'use strict';

var chunkYPZFGJV3_cjs = require('./chunk-YPZFGJV3.cjs');
var chunkG4APZMCP_cjs = require('./chunk-G4APZMCP.cjs');

// src/probe/avi.ts
async function probeWithLibav(source, sniffed) {
  const libav = await chunkG4APZMCP_cjs.loadLibav("avbridge");
  const filename = source.name ?? `input.${sniffed === "unknown" ? "bin" : sniffed}`;
  const handle = await chunkYPZFGJV3_cjs.prepareLibavInput(libav, filename, source);
  let fmt_ctx;
  let streams = [];
  try {
    const result = await libav.ff_init_demuxer_file(filename);
    fmt_ctx = result[0];
    streams = result[1];
  } catch (err) {
    await handle.detach().catch(() => {
    });
    const inner = err instanceof Error ? err.message : typeof err === "object" && err !== null ? JSON.stringify(err) : String(err);
    console.error("[avbridge] ff_init_demuxer_file raw error:", err);
    throw new Error(
      `libav.js could not demux ${filename}. The current libav variant likely lacks the required demuxer (e.g. AVI). See vendor/libav/README.md for build instructions. (${inner || "no message \u2014 see console for raw error"})`
    );
  }
  const videoTracks = [];
  const audioTracks = [];
  for (const stream of streams) {
    const codecName = await safe(() => libav.avcodec_get_name(stream.codec_id)) ?? `unknown(${stream.codec_id})`;
    const codecpar = await safe(() => libav.ff_copyout_codecpar(stream.codecpar));
    if (stream.codec_type === libav.AVMEDIA_TYPE_VIDEO) {
      videoTracks.push({
        id: stream.index,
        codec: ffmpegToAvbridgeVideo(codecName),
        width: codecpar?.width ?? 0,
        height: codecpar?.height ?? 0,
        fps: await framerate(libav, stream)
      });
    } else if (stream.codec_type === libav.AVMEDIA_TYPE_AUDIO) {
      audioTracks.push({
        id: stream.index,
        codec: ffmpegToAvbridgeAudio(codecName),
        channels: codecpar?.channels ?? codecpar?.ch_layout_nb_channels ?? 0,
        sampleRate: codecpar?.sample_rate ?? 0
      });
    }
  }
  const duration = await safeDuration(libav, fmt_ctx);
  await libav.avformat_close_input_js(fmt_ctx).catch(() => {
  });
  await handle.detach().catch(() => {
  });
  return {
    source: source.original,
    name: source.name,
    byteLength: source.byteLength,
    container: sniffed === "unknown" ? "unknown" : sniffed,
    videoTracks,
    audioTracks,
    subtitleTracks: [],
    probedBy: "libav",
    duration
  };
}
async function framerate(libav, stream) {
  if (typeof stream.avg_frame_rate_num === "number" && stream.avg_frame_rate_den) {
    return stream.avg_frame_rate_num / stream.avg_frame_rate_den;
  }
  if (stream.avg_frame_rate && typeof stream.avg_frame_rate === "object") {
    if (stream.avg_frame_rate.den === 0) return void 0;
    return stream.avg_frame_rate.num / stream.avg_frame_rate.den;
  }
  try {
    const num = await libav.AVCodecParameters_framerate_num?.(stream.codecpar);
    const den = await libav.AVCodecParameters_framerate_den?.(stream.codecpar);
    if (typeof num === "number" && typeof den === "number" && den > 0 && num > 0) {
      return num / den;
    }
  } catch {
  }
  return void 0;
}
async function safeDuration(libav, fmt_ctx) {
  try {
    const lo = await libav.AVFormatContext_duration?.(fmt_ctx);
    const hi = await libav.AVFormatContext_durationhi?.(fmt_ctx);
    if (typeof lo !== "number" || typeof hi !== "number") return void 0;
    if (hi === -2147483648 && lo === 0) return void 0;
    const us = typeof libav.i64tof64 === "function" ? libav.i64tof64(lo, hi) : hi * 4294967296 + lo + (lo < 0 ? 4294967296 : 0);
    if (!Number.isFinite(us) || us <= 0) return void 0;
    return us / 1e6;
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
function ffmpegToAvbridgeVideo(name) {
  switch (name) {
    case "h264":
      return "h264";
    case "hevc":
      return "h265";
    case "vp8":
      return "vp8";
    case "vp9":
      return "vp9";
    case "av1":
      return "av1";
    case "mpeg4":
      return "mpeg4";
    // MPEG-4 Part 2 / DivX / Xvid
    case "msmpeg4v1":
    case "msmpeg4v2":
    case "msmpeg4v3":
      return "mpeg4";
    case "wmv1":
    case "wmv2":
    case "wmv3":
      return "wmv3";
    case "vc1":
      return "vc1";
    case "mpeg2video":
      return "mpeg2";
    case "mpeg1video":
      return "mpeg1";
    case "theora":
      return "theora";
    case "rv10":
      return "rv10";
    case "rv20":
      return "rv20";
    case "rv30":
      return "rv30";
    case "rv40":
      return "rv40";
    case "dvvideo":
      return "dv";
    // DV / DVCPRO (camcorder, MiniDV)
    case "hq_hqa":
      return "hq_hqa";
    // Canopus HQ / HQA (Grass Valley)
    default:
      return name;
  }
}
function ffmpegToAvbridgeAudio(name) {
  switch (name) {
    case "aac":
      return "aac";
    case "mp3":
    case "mp3float":
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
    case "wmav1":
    case "wmav2":
      return "wmav2";
    case "wmapro":
      return "wmapro";
    case "alac":
      return "alac";
    case "cook":
      return "cook";
    case "ra_144":
      return "ra_144";
    case "ra_288":
      return "ra_288";
    case "sipr":
      return "sipr";
    case "atrac3":
      return "atrac3";
    case "dca":
    case "dts":
      return "dts";
    case "truehd":
    case "mlp":
      return "truehd";
    default:
      return name;
  }
}

exports.probeWithLibav = probeWithLibav;
//# sourceMappingURL=avi-32UABODO.cjs.map
//# sourceMappingURL=avi-32UABODO.cjs.map