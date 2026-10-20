export default {
  multipass: true,
  floatPrecision: 2,
  plugins: [
    {
      name: "preset-default",
      params: { overrides: { inlineStyles: false, minifyStyles: false, cleanupIds: false } },
    },
  ],
};
