import { fetchWith } from './chunk-LUFA47FP.js';

// src/subtitles/srt.ts
function srtToVtt(srt) {
  if (srt.charCodeAt(0) === 65279) srt = srt.slice(1);
  const normalized = srt.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const blocks = normalized.split(/\n{2,}/);
  const out = ["WEBVTT", ""];
  for (const block of blocks) {
    const lines = block.split("\n");
    if (lines.length > 0 && /^\d+$/.test(lines[0].trim())) {
      lines.shift();
    }
    if (lines.length === 0) continue;
    const timing = lines.shift();
    const vttTiming = convertTiming(timing);
    if (!vttTiming) continue;
    out.push(vttTiming);
    for (const l of lines) out.push(l);
    out.push("");
  }
  return out.join("\n");
}
function convertTiming(line) {
  const m = /^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})(.*)$/.exec(
    line.trim()
  );
  if (!m) return null;
  const fmt = (h, mm, s, ms) => `${h.padStart(2, "0")}:${mm}:${s}.${ms.padEnd(3, "0").slice(0, 3)}`;
  return `${fmt(m[1], m[2], m[3], m[4])} --> ${fmt(m[5], m[6], m[7], m[8])}${m[9] ?? ""}`;
}

// src/subtitles/vtt.ts
function isVtt(text) {
  const trimmed = text.replace(/^\ufeff/, "").trimStart();
  return trimmed.startsWith("WEBVTT");
}

// src/subtitles/render.ts
var SubtitleOverlay = class {
  el;
  cues = [];
  constructor(parent) {
    this.el = document.createElement("div");
    this.el.style.cssText = "position:absolute;left:0;right:0;bottom:8%;text-align:center;color:white;text-shadow:0 0 4px black;font-family:sans-serif;font-size:1.4em;pointer-events:none;";
    parent.appendChild(this.el);
  }
  loadVtt(text) {
    this.cues = parseVtt(text);
  }
  update(currentTime) {
    const active = this.cues.find((c) => currentTime >= c.start && currentTime <= c.end);
    this.el.textContent = active?.text ?? "";
  }
  /** Set the currently-displayed text directly (bypasses loadVtt/update). */
  setText(text) {
    if (this.el.textContent !== text) {
      this.el.textContent = text;
    }
  }
  destroy() {
    this.el.remove();
    this.cues = [];
  }
};
function parseVtt(text) {
  const cues = [];
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split("\n").filter(Boolean);
    if (lines.length === 0 || lines[0] === "WEBVTT") continue;
    const timingIdx = lines.findIndex((l) => l.includes("-->"));
    if (timingIdx < 0) continue;
    const m = /(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})/.exec(
      lines[timingIdx]
    );
    if (!m) continue;
    const t = (h, mm, s, ms) => Number(h) * 3600 + Number(mm) * 60 + Number(s) + Number(ms) / 1e3;
    cues.push({
      start: t(m[1], m[2], m[3], m[4]),
      end: t(m[5], m[6], m[7], m[8]),
      text: lines.slice(timingIdx + 1).join("\n")
    });
  }
  return cues;
}

// src/subtitles/index.ts
async function discoverSidecars(file, directory) {
  const baseName = file.name.replace(/\.[^.]+$/, "");
  const found = [];
  for await (const [name, handle] of directory) {
    if (handle.kind !== "file") continue;
    if (!name.startsWith(baseName)) continue;
    const lower = name.toLowerCase();
    let format = null;
    if (lower.endsWith(".srt")) format = "srt";
    else if (lower.endsWith(".vtt")) format = "vtt";
    if (!format) continue;
    const sidecarFile = await handle.getFile();
    const url = URL.createObjectURL(sidecarFile);
    const langMatch = name.slice(baseName.length).match(/[._-]([a-z]{2,3})(?:[._-]|\.)/i);
    found.push({
      url,
      format,
      language: langMatch?.[1]
    });
  }
  return found;
}
var SubtitleResourceBag = class {
  urls = /* @__PURE__ */ new Set();
  /** Track an externally-created blob URL (e.g. from `discoverSidecars`). */
  track(url) {
    this.urls.add(url);
  }
  /** Convenience: create a blob URL and track it in one call. */
  createObjectURL(blob) {
    const url = URL.createObjectURL(blob);
    this.urls.add(url);
    return url;
  }
  /** Revoke every tracked URL. Idempotent — safe to call multiple times. */
  revokeAll() {
    for (const u of this.urls) URL.revokeObjectURL(u);
    this.urls.clear();
  }
};
async function attachSubtitleTracks(video, tracks, bag, onError, transport) {
  const doFetch = fetchWith(transport);
  for (const t of Array.from(video.querySelectorAll("track[data-avbridge]"))) {
    t.remove();
  }
  for (const t of tracks) {
    if (!t.sidecarUrl) continue;
    console.log(`[avbridge:subs] attaching track id=${t.id} format=${t.format} url=${t.sidecarUrl.slice(0, 60)}`);
    try {
      let url = t.sidecarUrl;
      if (t.format === "srt") {
        const res = await doFetch(t.sidecarUrl, transport?.requestInit);
        const text = await res.text();
        const vtt = srtToVtt(text);
        const blob = new Blob([vtt], { type: "text/vtt" });
        url = bag ? bag.createObjectURL(blob) : URL.createObjectURL(blob);
      } else if (t.format === "vtt") {
        const res = await doFetch(t.sidecarUrl, transport?.requestInit);
        const text = await res.text();
        if (!isVtt(text)) {
          console.warn("[avbridge] subtitle missing WEBVTT header:", t.sidecarUrl);
        }
      }
      const trackEl = document.createElement("track");
      trackEl.kind = "subtitles";
      trackEl.src = url;
      trackEl.srclang = t.language ?? "und";
      trackEl.label = t.language ?? `Subtitle ${t.id}`;
      trackEl.dataset.avbridge = "true";
      video.appendChild(trackEl);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      onError?.(e, t);
    }
  }
}

export { SubtitleOverlay, SubtitleResourceBag, attachSubtitleTracks, discoverSidecars, srtToVtt };
//# sourceMappingURL=chunk-EDDWAN2L.js.map
//# sourceMappingURL=chunk-EDDWAN2L.js.map