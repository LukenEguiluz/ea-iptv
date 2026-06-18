'use strict';

var bridge = require('libavjs-webcodecs-bridge');

function _interopNamespace(e) {
  if (e && e.__esModule) return e;
  var n = Object.create(null);
  if (e) {
    Object.keys(e).forEach(function (k) {
      if (k !== 'default') {
        var d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: function () { return e[k]; }
        });
      }
    });
  }
  n.default = e;
  return Object.freeze(n);
}

var bridge__namespace = /*#__PURE__*/_interopNamespace(bridge);

// src/strategies/fallback/libav-import.ts
var libavBridge = bridge__namespace;

exports.libavBridge = libavBridge;
//# sourceMappingURL=libav-import-2ZVKV2E7.cjs.map
//# sourceMappingURL=libav-import-2ZVKV2E7.cjs.map