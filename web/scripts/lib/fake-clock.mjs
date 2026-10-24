// Preloaded into `next start` by check-warnings.mjs (NODE_OPTIONS=--import):
// the server's clock runs FAKE_CLOCK_OFFSET_MS ahead, so a kept copy of
// IMGW's feed ages (stale, then too old) without waiting.
const offset = Number(process.env.FAKE_CLOCK_OFFSET_MS ?? 0);
const RealDate = Date;

// Date's own statics are set explicitly: Next.js's server did not find
// them through the subclass.
globalThis.Date = class extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(RealDate.now() + offset);
    else super(...args);
  }

  static now() {
    return RealDate.now() + offset;
  }

  static parse = RealDate.parse;
  static UTC = RealDate.UTC;
};
