'use strict';

var chunkVLI3Y6IJ_cjs = require('./chunk-VLI3Y6IJ.cjs');
var chunk2IJ66NTD_cjs = require('./chunk-2IJ66NTD.cjs');
var chunkHZUVMXBN_cjs = require('./chunk-HZUVMXBN.cjs');
var chunkYPZFGJV3_cjs = require('./chunk-YPZFGJV3.cjs');

function isAnnexB(bytes) {
  if (bytes.length < 3) return false;
  if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1) return true;
  if (bytes.length >= 4 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 0 && bytes[3] === 1) return true;
  return false;
}
function* iterateAnnexBNalus(bytes) {
  const length = bytes.length;
  let i = 0;
  let nalStart = -1;
  while (i < length) {
    let scLen = 0;
    if (i + 3 < length && bytes[i] === 0 && bytes[i + 1] === 0 && bytes[i + 2] === 0 && bytes[i + 3] === 1) {
      scLen = 4;
    } else if (i + 2 < length && bytes[i] === 0 && bytes[i + 1] === 0 && bytes[i + 2] === 1) {
      scLen = 3;
    }
    if (scLen > 0) {
      if (nalStart >= 0) {
        yield bytes.subarray(nalStart, i);
      }
      nalStart = i + scLen;
      i += scLen;
    } else {
      i += 1;
    }
  }
  if (nalStart >= 0 && nalStart < length) {
    yield bytes.subarray(nalStart, length);
  }
}
function annexBToAvcc(annexB) {
  const nalus = [];
  let total = 0;
  for (const nal of iterateAnnexBNalus(annexB)) {
    nalus.push(nal);
    total += 4 + nal.length;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const nal of nalus) {
    const len = nal.length;
    out[off++] = len >>> 24 & 255;
    out[off++] = len >>> 16 & 255;
    out[off++] = len >>> 8 & 255;
    out[off++] = len & 255;
    out.set(nal, off);
    off += len;
  }
  return out;
}

// src/convert/remux.ts
var MEDIABUNNY_CONTAINERS = /* @__PURE__ */ new Set([
  "mp4",
  "mov",
  "mkv",
  "webm",
  "ogg",
  "wav",
  "mp3",
  "flac",
  "adts"
]);
async function remux(source, options = {}) {
  const outputFormat = options.outputFormat ?? "mp4";
  options.signal?.throwIfAborted();
  const ctx = await chunkVLI3Y6IJ_cjs.probe(source);
  options.signal?.throwIfAborted();
  validateRemuxEligibility(ctx, options.strict ?? false);
  if (MEDIABUNNY_CONTAINERS.has(ctx.container)) {
    return remuxViaMediAbunny(ctx, outputFormat, options);
  }
  return remuxViaLibav(ctx, outputFormat, options);
}
function validateRemuxEligibility(ctx, strict) {
  const video = ctx.videoTracks[0];
  const audio = ctx.audioTracks[0];
  if (video) {
    const mbCodec = chunkVLI3Y6IJ_cjs.avbridgeVideoToMediabunny(video.codec);
    if (!mbCodec) {
      throw new Error(
        `Cannot remux: video codec "${video.codec}" is not supported for remuxing. Use transcode() to re-encode to a modern codec.`
      );
    }
  }
  if (audio) {
    const mbCodec = chunkVLI3Y6IJ_cjs.avbridgeAudioToMediabunny(audio.codec);
    if (!mbCodec) {
      throw new Error(
        `Cannot remux: audio codec "${audio.codec}" is not supported for remuxing. Use transcode() to re-encode to a modern codec.`
      );
    }
  }
  if (strict && video?.codec === "h264" && audio?.codec === "mp3") {
    throw new Error(
      `Cannot remux in strict mode: H.264 + MP3 is a best-effort combination that may produce playback issues in some browsers. Set strict: false to allow, or use transcode() to re-encode audio to AAC.`
    );
  }
  if (!video && !audio) {
    throw new Error("Cannot remux: source has no video or audio tracks.");
  }
}
async function remuxViaMediAbunny(ctx, outputFormat, options) {
  const mb = await import('mediabunny');
  const input = new mb.Input({
    source: await chunkVLI3Y6IJ_cjs.buildMediabunnySourceFromInput(mb, ctx.source),
    formats: mb.ALL_FORMATS
  });
  const target = new mb.BufferTarget();
  const output = new mb.Output({
    format: createOutputFormat(mb, outputFormat),
    target
  });
  const conversion = await mb.Conversion.init({
    input,
    output,
    showWarnings: false
  });
  if (!conversion.isValid) {
    const reasons = conversion.discardedTracks.map((d) => `${d.track.type} track discarded: ${d.reason}`).join("; ");
    throw new Error(`Cannot remux: mediabunny rejected the conversion. ${reasons}`);
  }
  if (options.onProgress) {
    const onProgress = options.onProgress;
    conversion.onProgress = (p) => {
      onProgress({ percent: p * 100, bytesWritten: 0 });
    };
  }
  let abortHandler;
  if (options.signal) {
    options.signal.throwIfAborted();
    abortHandler = () => void conversion.cancel();
    options.signal.addEventListener("abort", abortHandler, { once: true });
  }
  try {
    await conversion.execute();
  } finally {
    if (abortHandler && options.signal) {
      options.signal.removeEventListener("abort", abortHandler);
    }
  }
  if (!target.buffer) {
    throw new Error("Remux failed: mediabunny produced no output buffer.");
  }
  const mimeType = mimeForFormat(outputFormat);
  const blob = new Blob([target.buffer], { type: mimeType });
  const filename = generateFilename(ctx.name, outputFormat);
  options.onProgress?.({ percent: 100, bytesWritten: blob.size });
  return {
    blob,
    mimeType,
    container: outputFormat,
    videoCodec: ctx.videoTracks[0]?.codec,
    audioCodec: ctx.audioTracks[0]?.codec,
    duration: ctx.duration,
    filename
  };
}
async function remuxViaLibav(ctx, outputFormat, options) {
  let loadLibav;
  let pickLibavVariant;
  try {
    const loader = await import('./libav-loader-IV4AJ2HW.cjs');
    const routing = await import('./variant-routing-HONNAA6R.cjs');
    loadLibav = loader.loadLibav;
    pickLibavVariant = routing.pickLibavVariant;
  } catch {
    throw new Error(
      `Cannot remux ${ctx.container.toUpperCase()} source: libav.js is not available. Install @libav.js/variant-webcodecs and libavjs-webcodecs-bridge, or build the custom avbridge variant with scripts/build-libav.sh.`
    );
  }
  const variant = pickLibavVariant(ctx);
  const libav = await loadLibav(variant);
  const normalized = await chunk2IJ66NTD_cjs.normalizeSource(ctx.source);
  const filename = ctx.name ?? `remux-input-${Date.now()}`;
  const handle = await chunkYPZFGJV3_cjs.prepareLibavInput(libav, filename, normalized);
  try {
    return await doLibavRemux(libav, filename, ctx, outputFormat, options);
  } finally {
    await handle.detach().catch(() => {
    });
  }
}
async function doLibavRemux(libav, filename, ctx, outputFormat, options) {
  const mb = await import('mediabunny');
  const readPkt = await libav.av_packet_alloc();
  const [fmt_ctx, streams] = await libav.ff_init_demuxer_file(filename);
  const videoStream = streams.find((s) => s.codec_type === libav.AVMEDIA_TYPE_VIDEO) ?? null;
  const audioStream = streams.find((s) => s.codec_type === libav.AVMEDIA_TYPE_AUDIO) ?? null;
  const videoTrackInfo = ctx.videoTracks[0];
  const audioTrackInfo = ctx.audioTracks[0];
  const mbVideoCodec = videoTrackInfo ? chunkVLI3Y6IJ_cjs.avbridgeVideoToMediabunny(videoTrackInfo.codec) : null;
  const mbAudioCodec = audioTrackInfo ? chunkVLI3Y6IJ_cjs.avbridgeAudioToMediabunny(audioTrackInfo.codec) : null;
  const target = new mb.BufferTarget();
  const output = new mb.Output({
    format: createOutputFormat(mb, outputFormat),
    target
  });
  let videoSource = null;
  let audioSource = null;
  if (mbVideoCodec && videoStream) {
    videoSource = new mb.EncodedVideoPacketSource(mbVideoCodec);
    output.addVideoTrack(videoSource);
  }
  if (mbAudioCodec && audioStream) {
    audioSource = new mb.EncodedAudioPacketSource(mbAudioCodec);
    output.addAudioTrack(audioSource);
  }
  await output.start();
  const videoFps = videoTrackInfo?.fps && videoTrackInfo.fps > 0 ? videoTrackInfo.fps : 30;
  const videoFrameStepUs = Math.max(1, Math.round(1e6 / videoFps));
  let syntheticVideoUs = 0;
  let syntheticAudioUs = 0;
  const videoTimeBase = videoStream?.time_base_num && videoStream?.time_base_den ? [videoStream.time_base_num, videoStream.time_base_den] : void 0;
  const audioTimeBase = audioStream?.time_base_num && audioStream?.time_base_den ? [audioStream.time_base_num, audioStream.time_base_den] : void 0;
  let totalPackets = 0;
  const durationUs = ctx.duration ? ctx.duration * 1e6 : 0;
  let firstVideoMeta = true;
  let firstAudioMeta = true;
  while (true) {
    options.signal?.throwIfAborted();
    let readErr;
    let packets;
    try {
      [readErr, packets] = await libav.ff_read_frame_multi(fmt_ctx, readPkt, {
        limit: 64 * 1024
      });
    } catch (err) {
      throw new Error(`libav demux failed: ${err.message}`);
    }
    const videoPackets = videoStream ? packets[videoStream.index] ?? [] : [];
    const audioPackets = audioStream ? packets[audioStream.index] ?? [] : [];
    if (videoSource) {
      for (const pkt of videoPackets) {
        chunkHZUVMXBN_cjs.sanitizePacketTimestamp(pkt, () => {
          const ts = syntheticVideoUs;
          syntheticVideoUs += videoFrameStepUs;
          return ts;
        }, videoTimeBase);
        if (videoTrackInfo && (videoTrackInfo.codec === "h264" || videoTrackInfo.codec === "h265") && isAnnexB(pkt.data)) {
          pkt.data = annexBToAvcc(pkt.data);
        }
        const mbPacket = libavPacketToMediAbunny(mb, pkt);
        await videoSource.add(
          mbPacket,
          firstVideoMeta ? { decoderConfig: buildVideoDecoderConfig(videoTrackInfo) } : void 0
        );
        firstVideoMeta = false;
      }
    }
    if (audioSource) {
      for (const pkt of audioPackets) {
        chunkHZUVMXBN_cjs.sanitizePacketTimestamp(pkt, () => {
          const ts = syntheticAudioUs;
          const sampleRate = audioTrackInfo?.sampleRate ?? 44100;
          syntheticAudioUs += Math.round(1024 * 1e6 / sampleRate);
          return ts;
        }, audioTimeBase);
        const mbPacket = libavPacketToMediAbunny(mb, pkt);
        await audioSource.add(
          mbPacket,
          firstAudioMeta ? { decoderConfig: buildAudioDecoderConfig(audioTrackInfo) } : void 0
        );
        firstAudioMeta = false;
      }
    }
    totalPackets += videoPackets.length + audioPackets.length;
    if (options.onProgress && durationUs > 0) {
      const lastVideoTs = videoPackets.length > 0 ? videoPackets[videoPackets.length - 1].pts ?? 0 : 0;
      const lastAudioTs = audioPackets.length > 0 ? audioPackets[audioPackets.length - 1].pts ?? 0 : 0;
      const currentUs = Math.max(lastVideoTs, lastAudioTs);
      const percent = Math.min(99, currentUs / durationUs * 100);
      options.onProgress({ percent, bytesWritten: 0 });
    }
    if (readErr === libav.AVERROR_EOF) break;
    if (readErr && readErr !== 0 && readErr !== -libav.EAGAIN) {
      console.warn("[avbridge] remux: ff_read_frame_multi returned", readErr);
      break;
    }
  }
  await output.finalize();
  try {
    await libav.av_packet_free?.(readPkt);
  } catch {
  }
  try {
    await libav.avformat_close_input_js(fmt_ctx);
  } catch {
  }
  if (!target.buffer) {
    throw new Error("Remux failed: mediabunny produced no output buffer.");
  }
  const mimeType = mimeForFormat(outputFormat);
  const blob = new Blob([target.buffer], { type: mimeType });
  const outputFilename = generateFilename(ctx.name, outputFormat);
  options.onProgress?.({ percent: 100, bytesWritten: blob.size });
  return {
    blob,
    mimeType,
    container: outputFormat,
    videoCodec: videoTrackInfo?.codec,
    audioCodec: audioTrackInfo?.codec,
    duration: ctx.duration,
    filename: outputFilename
  };
}
function createOutputFormat(mb, format) {
  switch (format) {
    case "mp4":
      return new mb.Mp4OutputFormat({ fastStart: "in-memory" });
    case "webm":
      return new mb.WebMOutputFormat();
    case "mkv":
      return new mb.MkvOutputFormat();
    default:
      return new mb.Mp4OutputFormat({ fastStart: "in-memory" });
  }
}
function mimeForFormat(format) {
  switch (format) {
    case "mp4":
      return "video/mp4";
    case "webm":
      return "video/webm";
    case "mkv":
      return "video/x-matroska";
    default:
      return "application/octet-stream";
  }
}
function generateFilename(originalName, format) {
  const ext = format === "mkv" ? "mkv" : format;
  if (!originalName) return `output.${ext}`;
  const base = originalName.replace(/\.[^.]+$/, "");
  return `${base}.${ext}`;
}
var _seqCounter = 0;
function libavPacketToMediAbunny(mb, pkt) {
  const KEY_FRAME_FLAG = 1;
  const timestampSec = (pkt.pts ?? 0) / 1e6;
  const durationSec = (pkt.duration ?? 0) / 1e6;
  const type = pkt.flags & KEY_FRAME_FLAG ? "key" : "delta";
  return new mb.EncodedPacket(pkt.data, type, timestampSec, durationSec, _seqCounter++);
}
function buildVideoDecoderConfig(track) {
  return {
    codec: track.codecString ?? track.codec,
    codedWidth: track.width,
    codedHeight: track.height
  };
}
function buildAudioDecoderConfig(track) {
  return {
    codec: track.codecString ?? track.codec,
    numberOfChannels: track.channels,
    sampleRate: track.sampleRate
  };
}

exports.createOutputFormat = createOutputFormat;
exports.generateFilename = generateFilename;
exports.mimeForFormat = mimeForFormat;
exports.remux = remux;
exports.validateRemuxEligibility = validateRemuxEligibility;
//# sourceMappingURL=chunk-E5MAM2P4.cjs.map
//# sourceMappingURL=chunk-E5MAM2P4.cjs.map