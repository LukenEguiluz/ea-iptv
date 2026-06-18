'use strict';

var chunkYPZFGJV3_cjs = require('./chunk-YPZFGJV3.cjs');
var chunkG4APZMCP_cjs = require('./chunk-G4APZMCP.cjs');
var chunkF3LQJKXK_cjs = require('./chunk-F3LQJKXK.cjs');

// src/util/libav-demux.ts
async function openLibavDemux(opts) {
  const variant = opts.variant ?? chunkF3LQJKXK_cjs.pickLibavVariant(opts.context);
  const libav = await chunkG4APZMCP_cjs.loadLibav(variant);
  const inputHandle = await chunkYPZFGJV3_cjs.prepareLibavInput(
    libav,
    opts.filename,
    opts.source,
    opts.transport
  );
  const readPkt = await libav.av_packet_alloc();
  const [fmtCtx, streams] = await libav.ff_init_demuxer_file(opts.filename);
  const videoStream = streams.find((s) => s.codec_type === libav.AVMEDIA_TYPE_VIDEO) ?? null;
  const audioStream = streams.find((s) => s.codec_type === libav.AVMEDIA_TYPE_AUDIO) ?? null;
  let destroyed = false;
  async function pump(cb) {
    while (!destroyed) {
      if (cb.signal?.aborted) return;
      let readErr;
      let packets;
      try {
        [readErr, packets] = await libav.ff_read_frame_multi(fmtCtx, readPkt, {
          // 16 KB batch — chosen so each read produces a handful of
          // packets, keeping downstream queues bounded. Same rationale
          // as the hybrid/fallback pumps (see CLAUDE.md note).
          limit: 16 * 1024
        });
      } catch (err) {
        throw new Error(`libav-demux: ff_read_frame_multi failed: ${err.message}`);
      }
      if (destroyed || cb.signal?.aborted) return;
      const videoPackets = videoStream ? packets[videoStream.index] : void 0;
      const audioPackets = audioStream ? packets[audioStream.index] : void 0;
      if (cb.onAudioPackets && audioPackets && audioPackets.length > 0) {
        await cb.onAudioPackets(audioPackets);
      }
      if (destroyed || cb.signal?.aborted) return;
      if (cb.onVideoPackets && videoPackets && videoPackets.length > 0) {
        await cb.onVideoPackets(videoPackets);
      }
      if (readErr === libav.AVERROR_EOF) {
        if (cb.onEof) await cb.onEof();
        return;
      }
      if (readErr && readErr !== 0 && readErr !== -libav.EAGAIN) {
        throw new Error(`libav-demux: ff_read_frame_multi returned ${readErr}`);
      }
    }
  }
  async function destroy() {
    destroyed = true;
    try {
      await libav.av_packet_free?.(readPkt);
    } catch {
    }
    try {
      await libav.avformat_close_input_js(fmtCtx);
    } catch {
    }
    try {
      await inputHandle.detach();
    } catch {
    }
  }
  return {
    libav,
    fmtCtx,
    streams,
    videoStream,
    audioStream,
    transport: inputHandle.transport,
    pump,
    destroy
  };
}
function sanitizePacketTimestamp(pkt, nextUs, fallbackTimeBase) {
  const lo = pkt.pts ?? 0;
  const hi = pkt.ptshi ?? 0;
  const isInvalid = hi === -2147483648 && lo === 0 || !Number.isFinite(lo);
  if (isInvalid) {
    const us2 = nextUs();
    pkt.pts = us2;
    pkt.ptshi = 0;
    pkt.time_base_num = 1;
    pkt.time_base_den = 1e6;
    return;
  }
  const tb = fallbackTimeBase ?? [1, 1e6];
  const pts64 = hi * 4294967296 + lo;
  const us = Math.round(pts64 * 1e6 * tb[0] / tb[1]);
  if (Number.isFinite(us) && Math.abs(us) <= Number.MAX_SAFE_INTEGER) {
    pkt.pts = us;
    pkt.ptshi = us < 0 ? -1 : 0;
    pkt.time_base_num = 1;
    pkt.time_base_den = 1e6;
    return;
  }
  const fallback = nextUs();
  pkt.pts = fallback;
  pkt.ptshi = 0;
  pkt.time_base_num = 1;
  pkt.time_base_den = 1e6;
}
function packetPtsSec(pkt, timeBase) {
  const lo = pkt.pts ?? 0;
  const hi = pkt.ptshi ?? 0;
  const isInvalid = hi === -2147483648 && lo === 0 || !Number.isFinite(lo);
  if (isInvalid) return null;
  const tb = timeBase ?? [1, 1e6];
  if (!tb[0] || !tb[1]) return null;
  const pts64 = hi * 4294967296 + lo;
  const sec = pts64 * tb[0] / tb[1];
  return Number.isFinite(sec) ? sec : null;
}
var AV_SAMPLE_FMT_U8 = 0;
var AV_SAMPLE_FMT_S16 = 1;
var AV_SAMPLE_FMT_S32 = 2;
var AV_SAMPLE_FMT_FLT = 3;
var AV_SAMPLE_FMT_U8P = 5;
var AV_SAMPLE_FMT_S16P = 6;
var AV_SAMPLE_FMT_S32P = 7;
var AV_SAMPLE_FMT_FLTP = 8;
function libavFrameToInterleavedFloat32(frame) {
  const channels = frame.channels ?? frame.ch_layout_nb_channels ?? 1;
  const sampleRate = frame.sample_rate ?? 44100;
  const nbSamples = frame.nb_samples ?? 0;
  if (nbSamples === 0) return null;
  const out = new Float32Array(nbSamples * channels);
  switch (frame.format) {
    case AV_SAMPLE_FMT_FLTP: {
      const planes = ensurePlanes(frame.data, channels);
      for (let ch = 0; ch < channels; ch++) {
        const plane = asFloat32(planes[ch]);
        for (let i = 0; i < nbSamples; i++) out[i * channels + ch] = plane[i];
      }
      return { data: out, channels, sampleRate };
    }
    case AV_SAMPLE_FMT_FLT: {
      const flat = asFloat32(frame.data);
      for (let i = 0; i < nbSamples * channels; i++) out[i] = flat[i];
      return { data: out, channels, sampleRate };
    }
    case AV_SAMPLE_FMT_S16P: {
      const planes = ensurePlanes(frame.data, channels);
      for (let ch = 0; ch < channels; ch++) {
        const plane = asInt16(planes[ch]);
        for (let i = 0; i < nbSamples; i++) out[i * channels + ch] = plane[i] / 32768;
      }
      return { data: out, channels, sampleRate };
    }
    case AV_SAMPLE_FMT_S16: {
      const flat = asInt16(frame.data);
      for (let i = 0; i < nbSamples * channels; i++) out[i] = flat[i] / 32768;
      return { data: out, channels, sampleRate };
    }
    case AV_SAMPLE_FMT_S32P: {
      const planes = ensurePlanes(frame.data, channels);
      for (let ch = 0; ch < channels; ch++) {
        const plane = asInt32(planes[ch]);
        for (let i = 0; i < nbSamples; i++) out[i * channels + ch] = plane[i] / 2147483648;
      }
      return { data: out, channels, sampleRate };
    }
    case AV_SAMPLE_FMT_S32: {
      const flat = asInt32(frame.data);
      for (let i = 0; i < nbSamples * channels; i++) out[i] = flat[i] / 2147483648;
      return { data: out, channels, sampleRate };
    }
    case AV_SAMPLE_FMT_U8P: {
      const planes = ensurePlanes(frame.data, channels);
      for (let ch = 0; ch < channels; ch++) {
        const plane = asUint8(planes[ch]);
        for (let i = 0; i < nbSamples; i++) out[i * channels + ch] = (plane[i] - 128) / 128;
      }
      return { data: out, channels, sampleRate };
    }
    case AV_SAMPLE_FMT_U8: {
      const flat = asUint8(frame.data);
      for (let i = 0; i < nbSamples * channels; i++) out[i] = (flat[i] - 128) / 128;
      return { data: out, channels, sampleRate };
    }
    default:
      return null;
  }
}
function ensurePlanes(data, channels) {
  if (Array.isArray(data)) return data;
  const arr = data;
  const len = arr.length;
  const perChannel = Math.floor(len / channels);
  const planes = [];
  for (let ch = 0; ch < channels; ch++) {
    planes.push(arr.subarray ? arr.subarray(ch * perChannel, (ch + 1) * perChannel) : arr);
  }
  return planes;
}
function asFloat32(x) {
  if (x instanceof Float32Array) return x;
  const ta = x;
  return new Float32Array(ta.buffer, ta.byteOffset, ta.byteLength / 4);
}
function asInt16(x) {
  if (x instanceof Int16Array) return x;
  const ta = x;
  return new Int16Array(ta.buffer, ta.byteOffset, ta.byteLength / 2);
}
function asInt32(x) {
  if (x instanceof Int32Array) return x;
  const ta = x;
  return new Int32Array(ta.buffer, ta.byteOffset, ta.byteLength / 4);
}
function asUint8(x) {
  if (x instanceof Uint8Array) return x;
  const ta = x;
  return new Uint8Array(ta.buffer, ta.byteOffset, ta.byteLength);
}
function sanitizeFrameTimestamp(frame, nextUs, fallbackTimeBase) {
  const lo = frame.pts ?? 0;
  const hi = frame.ptshi ?? 0;
  const isInvalid = hi === -2147483648 && lo === 0 || !Number.isFinite(lo);
  if (isInvalid) {
    const us2 = nextUs();
    frame.pts = us2;
    frame.ptshi = 0;
    return;
  }
  const tb = fallbackTimeBase ?? [1, 1e6];
  const pts64 = hi * 4294967296 + lo;
  const us = Math.round(pts64 * 1e6 * tb[0] / tb[1]);
  if (Number.isFinite(us) && Math.abs(us) <= Number.MAX_SAFE_INTEGER) {
    frame.pts = us;
    frame.ptshi = us < 0 ? -1 : 0;
    return;
  }
  const fallback = nextUs();
  frame.pts = fallback;
  frame.ptshi = 0;
}

exports.libavFrameToInterleavedFloat32 = libavFrameToInterleavedFloat32;
exports.openLibavDemux = openLibavDemux;
exports.packetPtsSec = packetPtsSec;
exports.sanitizeFrameTimestamp = sanitizeFrameTimestamp;
exports.sanitizePacketTimestamp = sanitizePacketTimestamp;
//# sourceMappingURL=chunk-HZUVMXBN.cjs.map
//# sourceMappingURL=chunk-HZUVMXBN.cjs.map