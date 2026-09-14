"use strict";

const cjs = "cjs";

module.exports = { cjs };

// Keeps this module in the graph so the collector can see its package name.
globalThis.__fixtureCjs = cjs;
