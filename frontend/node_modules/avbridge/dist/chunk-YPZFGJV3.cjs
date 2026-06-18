'use strict';

// src/util/libav-http-reader.ts
var MIN_READ = 256 * 1024;
var MAX_READ = 1 * 1024 * 1024;
var DEFAULT_CACHE_BYTES = 8 * 1024 * 1024;
async function prepareLibavInput(libav, filename, source, transport) {
  if (source.kind === "url") {
    const handle = await attachLibavHttpReader(libav, filename, source.url, {
      requestInit: transport?.requestInit,
      fetchFn: transport?.fetchFn,
      cacheBytes: transport?.cacheBytes
    });
    return {
      filename,
      transport: "http-range",
      size: handle.size,
      detach: () => handle.detach()
    };
  }
  await libav.mkreadaheadfile(filename, source.blob);
  return {
    filename,
    transport: "blob",
    size: source.byteLength,
    detach: async () => {
      try {
        await libav.unlinkreadaheadfile(filename);
      } catch {
      }
    }
  };
}
async function attachLibavHttpReader(libav, filename, url, options = {}) {
  const fetchFn = options.fetchFn ?? fetch;
  let probeRes;
  try {
    probeRes = await fetchFn(url, {
      ...options.requestInit,
      headers: {
        ...options.requestInit?.headers ?? {},
        Range: "bytes=0-0"
      }
    });
  } catch (err) {
    throw new Error(
      `libav HTTP reader: failed to reach ${url}: ${err.message}`
    );
  }
  if (probeRes.status !== 206) {
    throw new Error(
      `libav HTTP reader: ${url} does not support HTTP Range requests (server returned ${probeRes.status} for a Range probe; need 206 Partial Content). Remote AVI/ASF/FLV playback requires a server that honors byte-range requests.`
    );
  }
  const contentRange = probeRes.headers.get("content-range") ?? "";
  const sizeMatch = contentRange.match(/\/(\d+)$/);
  if (!sizeMatch) {
    throw new Error(
      `libav HTTP reader: ${url} returned 206 but no parseable Content-Range header (got: "${contentRange}")`
    );
  }
  const size = parseInt(sizeMatch[1], 10);
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error(
      `libav HTTP reader: ${url} reported invalid file size ${size}`
    );
  }
  try {
    await probeRes.arrayBuffer();
  } catch {
  }
  await libav.mkblockreaderdev(filename, size);
  let detached = false;
  const cache = /* @__PURE__ */ new Map();
  let cacheBytes = 0;
  const cacheBudget = Math.max(0, options.cacheBytes ?? DEFAULT_CACHE_BYTES);
  let inflight = null;
  function clampReadLength(requested) {
    const doubled = requested * 2;
    if (doubled < MIN_READ) return MIN_READ;
    if (doubled > MAX_READ) return MAX_READ;
    return doubled;
  }
  function cacheLookup(pos, length) {
    for (const [blockPos, bytes] of cache) {
      if (pos >= blockPos && pos + length <= blockPos + bytes.byteLength) {
        cache.delete(blockPos);
        cache.set(blockPos, bytes);
        const offset = pos - blockPos;
        return bytes.subarray(offset, offset + length);
      }
    }
    return null;
  }
  function cacheInsert(pos, bytes) {
    const existing = cache.get(pos);
    if (existing) {
      cacheBytes -= existing.byteLength;
      cache.delete(pos);
    }
    cache.set(pos, bytes);
    cacheBytes += bytes.byteLength;
    while (cacheBytes > cacheBudget && cache.size > 0) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey === void 0) break;
      const oldest = cache.get(oldestKey);
      if (!oldest) break;
      cache.delete(oldestKey);
      cacheBytes -= oldest.byteLength;
    }
  }
  async function fetchRange(pos, length) {
    const end = Math.min(pos + length - 1, size - 1);
    const res = await fetchFn(url, {
      ...options.requestInit,
      headers: {
        ...options.requestInit?.headers ?? {},
        Range: `bytes=${pos}-${end}`
      }
    });
    if (res.status !== 206 && res.status !== 200) {
      throw new Error(
        `libav HTTP reader: Range request bytes=${pos}-${end} returned ${res.status}`
      );
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    cacheInsert(pos, buf);
    return buf;
  }
  async function handleRead(name, pos, length) {
    if (inflight) {
      try {
        await inflight;
      } catch {
      }
    }
    if (detached) return;
    const hit = cacheLookup(pos, length);
    if (hit) {
      try {
        await libav.ff_block_reader_dev_send(name, pos, hit);
      } catch {
      }
      return;
    }
    const fetchLen = clampReadLength(length);
    const fetched = (async () => {
      try {
        const buf = await fetchRange(pos, fetchLen);
        if (detached) return;
        const reply = buf.subarray(0, Math.min(length, buf.byteLength));
        try {
          await libav.ff_block_reader_dev_send(name, pos, reply);
        } catch {
        }
      } catch (err) {
        if (detached) return;
        try {
          await libav.ff_block_reader_dev_send(name, pos, null, {
            error: err
          });
        } catch {
        }
      }
    })();
    inflight = fetched;
    try {
      await fetched;
    } finally {
      if (inflight === fetched) inflight = null;
    }
  }
  const previousCallback = libav.onblockread;
  libav.onblockread = (name, pos, length) => {
    if (detached || name !== filename) {
      previousCallback?.(name, pos, length);
      return;
    }
    void handleRead(name, pos, length);
  };
  return {
    size,
    transport: "http-range",
    async detach() {
      if (detached) return;
      detached = true;
      libav.onblockread = previousCallback;
      if (inflight) {
        try {
          await inflight;
        } catch {
        }
      }
      cache.clear();
      cacheBytes = 0;
      try {
        await libav.unlinkreadaheadfile(filename);
      } catch {
      }
    }
  };
}

exports.attachLibavHttpReader = attachLibavHttpReader;
exports.prepareLibavInput = prepareLibavInput;
//# sourceMappingURL=chunk-YPZFGJV3.cjs.map
//# sourceMappingURL=chunk-YPZFGJV3.cjs.map