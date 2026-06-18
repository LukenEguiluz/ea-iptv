'use strict';

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

exports.fetchWith = fetchWith;
exports.mergeFetchInit = mergeFetchInit;
//# sourceMappingURL=chunk-QDJLQR53.cjs.map
//# sourceMappingURL=chunk-QDJLQR53.cjs.map