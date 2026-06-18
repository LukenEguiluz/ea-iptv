// src/util/transport.ts
function mergeFetchInit(base, extra) {
  if (!base && !extra) return void 0;
  return {
    ...base,
    ...extra,
    headers: {
      ...base?.headers ?? {},
      ...extra?.headers ?? {}
    }
  };
}
function fetchWith(transport) {
  return transport?.fetchFn ?? globalThis.fetch;
}

export { fetchWith, mergeFetchInit };
//# sourceMappingURL=chunk-LUFA47FP.js.map
//# sourceMappingURL=chunk-LUFA47FP.js.map