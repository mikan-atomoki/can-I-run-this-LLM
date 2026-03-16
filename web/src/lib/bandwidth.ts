// Known GPU memory bandwidths (GB/s)
const GPU_BANDWIDTHS: Record<string, number> = {
  "rtx 4090": 1008, "rtx 4080 super": 736, "rtx 4080": 717,
  "rtx 4070 ti super": 672, "rtx 4070 ti": 504, "rtx 4070 super": 504,
  "rtx 4070": 504, "rtx 4060 ti": 288, "rtx 4060": 272,
  "rtx 3090 ti": 1008, "rtx 3090": 936, "rtx 3080 ti": 912, "rtx 3080": 760,
  "rtx 3070 ti": 608, "rtx 3070": 448, "rtx 3060 ti": 448, "rtx 3060": 360,
  "rtx a6000": 768, "rtx a5000": 768, "rtx a4000": 448,
  "a100": 2039, "h100": 3352, "l40s": 864, "l4": 300,
  "rx 7900 xtx": 960, "rx 7900 xt": 800, "rx 7900 gre": 576,
  "rx 7800 xt": 624, "rx 7700 xt": 432, "rx 7600": 288,
  // Apple unified
  "m1": 68, "m1 pro": 200, "m1 max": 400, "m1 ultra": 800,
  "m2": 100, "m2 pro": 200, "m2 max": 400, "m2 ultra": 800,
  "m3": 100, "m3 pro": 150, "m3 max": 400, "m3 ultra": 800,
  "m4": 120, "m4 pro": 273, "m4 max": 546,
};

export function guessGpuBandwidth(gpuName: string): number | null {
  const lower = gpuName.toLowerCase();
  for (const [gpu, bw] of Object.entries(GPU_BANDWIDTHS)) {
    if (lower.includes(gpu)) return bw;
  }
  return null;
}

/**
 * Guess RAM bandwidth. Most desktop DDR4 ~40-50 GB/s, DDR5 ~60-80 GB/s.
 * Conservative default since we can't detect RAM type from browser.
 */
export function guessRamBandwidth(): number {
  return 40; // DDR4 dual-channel conservative estimate
}
