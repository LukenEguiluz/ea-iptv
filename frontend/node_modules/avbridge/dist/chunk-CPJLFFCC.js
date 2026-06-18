import { fetchWith, mergeFetchInit } from './chunk-LUFA47FP.js';

// src/errors.ts
var AvbridgeError = class extends Error {
  constructor(code, message, recovery, options) {
    super(message, options);
    this.code = code;
    this.recovery = recovery;
  }
  code;
  recovery;
  name = "AvbridgeError";
};
var ERR_PROBE_FAILED = "ERR_AVBRIDGE_PROBE_FAILED";
var ERR_PROBE_UNKNOWN_CONTAINER = "ERR_AVBRIDGE_PROBE_UNKNOWN_CONTAINER";
var ERR_PROBE_FETCH_FAILED = "ERR_AVBRIDGE_PROBE_FETCH_FAILED";
var ERR_CODEC_NOT_SUPPORTED = "ERR_AVBRIDGE_CODEC_NOT_SUPPORTED";
var ERR_STRATEGY_FAILED = "ERR_AVBRIDGE_STRATEGY_FAILED";
var ERR_ALL_STRATEGIES_EXHAUSTED = "ERR_AVBRIDGE_ALL_STRATEGIES_EXHAUSTED";
var ERR_PLAYER_NOT_READY = "ERR_AVBRIDGE_PLAYER_NOT_READY";
var ERR_RANGE_NOT_SUPPORTED = "ERR_AVBRIDGE_RANGE_NOT_SUPPORTED";
var ERR_FETCH_FAILED = "ERR_AVBRIDGE_FETCH_FAILED";
var ERR_LIBAV_NOT_REACHABLE = "ERR_AVBRIDGE_LIBAV_NOT_REACHABLE";
var ERR_MSE_NOT_SUPPORTED = "ERR_AVBRIDGE_MSE_NOT_SUPPORTED";
var ERR_MSE_CODEC_NOT_SUPPORTED = "ERR_AVBRIDGE_MSE_CODEC_NOT_SUPPORTED";
var ERR_TRANSCODE_ABORTED = "ERR_AVBRIDGE_TRANSCODE_ABORTED";
var ERR_TRANSCODE_UNSUPPORTED_COMBO = "ERR_AVBRIDGE_TRANSCODE_UNSUPPORTED_COMBO";
var ERR_TRANSCODE_DECODE = "ERR_AVBRIDGE_TRANSCODE_DECODE";
var ERR_CONTAINER_NOT_SUPPORTED = "ERR_AVBRIDGE_CONTAINER_NOT_SUPPORTED";

// src/util/source.ts
var SNIFF_BYTES_NEEDED = 380;
var URL_SNIFF_RANGE_BYTES = 32 * 1024;
function isInMemorySource(source) {
  return source.kind === "blob";
}
async function normalizeSource(source, transport) {
  if (source instanceof File) {
    return {
      kind: "blob",
      blob: source,
      name: source.name,
      byteLength: source.size,
      original: source
    };
  }
  if (source instanceof Blob) {
    return { kind: "blob", blob: source, byteLength: source.size, original: source };
  }
  if (source instanceof ArrayBuffer) {
    const blob = new Blob([source]);
    return { kind: "blob", blob, byteLength: blob.size, original: source };
  }
  if (source instanceof Uint8Array) {
    const blob = new Blob([source]);
    return { kind: "blob", blob, byteLength: blob.size, original: source };
  }
  if (typeof source === "string" || source instanceof URL) {
    const url = source instanceof URL ? source.toString() : source;
    return await fetchUrlForSniff(url, source, transport);
  }
  throw new TypeError("unsupported source type");
}
async function fetchUrlForSniff(url, originalSource, transport) {
  const name = url.split("/").pop()?.split("?")[0] ?? void 0;
  const doFetch = fetchWith(transport);
  let res;
  try {
    res = await doFetch(url, mergeFetchInit(transport?.requestInit, {
      headers: { Range: `bytes=0-${URL_SNIFF_RANGE_BYTES - 1}` }
    }));
  } catch (err) {
    throw new AvbridgeError(
      ERR_PROBE_FETCH_FAILED,
      `Failed to fetch source ${url}: ${err.message}`,
      "Check that the URL is reachable and CORS is configured. If the source requires authentication, pass requestInit with credentials/headers."
    );
  }
  if (!res.ok && res.status !== 206) {
    throw new AvbridgeError(
      ERR_PROBE_FETCH_FAILED,
      `Failed to fetch source ${url}: ${res.status} ${res.statusText}`,
      res.status === 403 || res.status === 401 ? "The server rejected the request. Pass requestInit with the required Authorization header or credentials." : "Check that the URL is correct and the server is reachable."
    );
  }
  let byteLength;
  const contentRange = res.headers.get("content-range");
  if (contentRange) {
    const m = contentRange.match(/\/(\d+)$/);
    if (m) byteLength = parseInt(m[1], 10);
  }
  if (byteLength === void 0) {
    const cl = res.headers.get("content-length");
    if (cl) {
      const n = parseInt(cl, 10);
      if (Number.isFinite(n)) {
        if (res.status === 200) byteLength = n;
        else if (res.status === 206 && !contentRange) byteLength = n;
      }
    }
  }
  const reader = res.body?.getReader();
  if (!reader) {
    const buf = new Uint8Array(await res.arrayBuffer());
    const sniffBytes2 = buf.slice(0, URL_SNIFF_RANGE_BYTES);
    return { kind: "url", url, sniffBytes: sniffBytes2, name, byteLength, original: originalSource };
  }
  const chunks = [];
  let collected = 0;
  while (collected < URL_SNIFF_RANGE_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    collected += value.byteLength;
  }
  await reader.cancel().catch(() => {
  });
  const total = Math.min(collected, URL_SNIFF_RANGE_BYTES);
  const sniffBytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= total) break;
    const room = total - offset;
    sniffBytes.set(chunk.subarray(0, Math.min(chunk.byteLength, room)), offset);
    offset += chunk.byteLength;
  }
  return { kind: "url", url, sniffBytes, name, byteLength, original: originalSource };
}
function sniffContainerFromBytes(head) {
  if (head.length >= 376 && head[0] === 71 && head[188] === 71) {
    return "mpegts";
  }
  if (head.length >= 380 && head[4] === 71 && head[192] === 71) {
    return "mpegts";
  }
  if (head[0] === 82 && head[1] === 73 && head[2] === 70 && head[3] === 70 && head[8] === 65 && head[9] === 86 && head[10] === 73) return "avi";
  if (head[0] === 82 && head[1] === 73 && head[2] === 70 && head[3] === 70 && head[8] === 87 && head[9] === 65 && head[10] === 86 && head[11] === 69) return "wav";
  if (head[0] === 26 && head[1] === 69 && head[2] === 223 && head[3] === 163) {
    return "mkv";
  }
  if (head[4] === 102 && head[5] === 116 && head[6] === 121 && head[7] === 112) {
    const brand = String.fromCharCode(head[8], head[9], head[10], head[11]);
    if (brand.startsWith("qt")) return "mov";
    return "mp4";
  }
  if (head[0] === 48 && head[1] === 38 && head[2] === 178 && head[3] === 117 && head[4] === 142 && head[5] === 102 && head[6] === 207 && head[7] === 17) return "asf";
  if (head[0] === 70 && head[1] === 76 && head[2] === 86) return "flv";
  if (head[0] === 46 && head[1] === 82 && head[2] === 77 && head[3] === 70) {
    return "rm";
  }
  if (head[0] === 79 && head[1] === 103 && head[2] === 103 && head[3] === 83) return "ogg";
  if (head[0] === 102 && head[1] === 76 && head[2] === 97 && head[3] === 67) return "flac";
  if (head[0] === 73 && head[1] === 68 && head[2] === 51) return "mp3";
  if (head[0] === 255 && (head[1] & 224) === 224) {
    if ((head[1] & 246) === 240) return "adts";
    return "mp3";
  }
  return "unknown";
}
async function sniffNormalizedSource(source) {
  if (source.kind === "url") {
    return sniffContainerFromBytes(source.sniffBytes);
  }
  const buf = await readBlobBytes(source.blob, SNIFF_BYTES_NEEDED);
  return sniffContainerFromBytes(new Uint8Array(buf));
}
async function sniffContainer(blob) {
  const buf = await readBlobBytes(blob, SNIFF_BYTES_NEEDED);
  return sniffContainerFromBytes(new Uint8Array(buf));
}
async function readBlobBytes(blob, limit) {
  const slice = blob.slice(0, limit);
  if (typeof slice.arrayBuffer === "function") {
    try {
      return await slice.arrayBuffer();
    } catch {
    }
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsArrayBuffer(slice);
  });
}

export { AvbridgeError, ERR_ALL_STRATEGIES_EXHAUSTED, ERR_CODEC_NOT_SUPPORTED, ERR_CONTAINER_NOT_SUPPORTED, ERR_FETCH_FAILED, ERR_LIBAV_NOT_REACHABLE, ERR_MSE_CODEC_NOT_SUPPORTED, ERR_MSE_NOT_SUPPORTED, ERR_PLAYER_NOT_READY, ERR_PROBE_FAILED, ERR_PROBE_FETCH_FAILED, ERR_PROBE_UNKNOWN_CONTAINER, ERR_RANGE_NOT_SUPPORTED, ERR_STRATEGY_FAILED, ERR_TRANSCODE_ABORTED, ERR_TRANSCODE_DECODE, ERR_TRANSCODE_UNSUPPORTED_COMBO, isInMemorySource, normalizeSource, sniffContainer, sniffContainerFromBytes, sniffNormalizedSource };
//# sourceMappingURL=chunk-CPJLFFCC.js.map
//# sourceMappingURL=chunk-CPJLFFCC.js.map