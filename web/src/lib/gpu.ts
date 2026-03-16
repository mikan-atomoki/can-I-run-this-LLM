export interface GpuInfo {
  gpuName: string;
  vram_gb: number | null;
  ram_gb: number | null;
  detected: boolean;
  isMobile: boolean;
  isAppleSilicon: boolean;
  unifiedMemory_gb: number | null;  // Apple Silicon: total unified memory
}

// Discrete GPUs: name → VRAM in GB
const KNOWN_GPUS: Record<string, number> = {
  // NVIDIA
  "rtx 4090": 24, "rtx 4080 super": 16, "rtx 4080": 16,
  "rtx 4070 ti super": 16, "rtx 4070 ti": 12, "rtx 4070 super": 12,
  "rtx 4070": 12, "rtx 4060 ti 16": 16, "rtx 4060 ti": 8, "rtx 4060": 8,
  "rtx 3090 ti": 24, "rtx 3090": 24, "rtx 3080 ti": 12, "rtx 3080": 10,
  "rtx 3070 ti": 8, "rtx 3070": 8, "rtx 3060 ti": 8, "rtx 3060": 12,
  "gtx 1080 ti": 11, "gtx 1080": 8, "gtx 1070 ti": 8, "gtx 1070": 8,
  "gtx 1060": 6, "gtx 1660 super": 6, "gtx 1660 ti": 6, "gtx 1660": 6,
  "gtx 1650 super": 4, "gtx 1650": 4,
  "rtx a6000": 48, "rtx a5000": 24, "rtx a4000": 16,
  "a100 80": 80, "a100": 40, "h100": 80, "l40s": 48, "l4": 24,
  // AMD discrete
  "rx 7900 xtx": 24, "rx 7900 xt": 20, "rx 7900 gre": 16,
  "rx 7800 xt": 16, "rx 7700 xt": 12, "rx 7600": 8,
  "rx 6950 xt": 16, "rx 6900 xt": 16, "rx 6800 xt": 16, "rx 6800": 16,
  "rx 6700 xt": 12, "rx 6600 xt": 8, "rx 6600": 8,
};

// Apple Silicon chips: name → { bandwidth, ram options }
// We detect via GPU name containing "apple" and architecture
const APPLE_CHIPS: Record<string, { bw: number; defaultRam: number }> = {
  "m1 ultra": { bw: 800, defaultRam: 64 },
  "m1 max":   { bw: 400, defaultRam: 32 },
  "m1 pro":   { bw: 200, defaultRam: 16 },
  "m1":       { bw: 68,  defaultRam: 8 },
  "m2 ultra": { bw: 800, defaultRam: 64 },
  "m2 max":   { bw: 400, defaultRam: 32 },
  "m2 pro":   { bw: 200, defaultRam: 16 },
  "m2":       { bw: 100, defaultRam: 8 },
  "m3 ultra": { bw: 800, defaultRam: 64 },
  "m3 max":   { bw: 400, defaultRam: 36 },
  "m3 pro":   { bw: 150, defaultRam: 18 },
  "m3":       { bw: 100, defaultRam: 8 },
  "m4 max":   { bw: 546, defaultRam: 36 },
  "m4 pro":   { bw: 273, defaultRam: 24 },
  "m4":       { bw: 120, defaultRam: 16 },
};

function lookupVram(name: string): number | null {
  const lower = name.toLowerCase();
  for (const [gpu, vram] of Object.entries(KNOWN_GPUS)) {
    if (lower.includes(gpu)) return vram;
  }
  return null;
}

function detectAppleChip(gpuName: string): { chip: string; bw: number; defaultRam: number } | null {
  const lower = gpuName.toLowerCase();
  // Check if it's Apple GPU
  if (!lower.includes("apple")) return null;

  // Try to match specific chip from architecture or name
  // WebGPU on Mac often reports "Apple M3 Max" or just "Apple GPU"
  // Also check userAgent for Mac
  for (const [chip, info] of Object.entries(APPLE_CHIPS)) {
    if (lower.includes(chip)) return { chip, ...info };
  }

  // Generic Apple GPU detected but can't identify specific chip
  // Check userAgent for clues
  const ua = navigator.userAgent.toLowerCase();
  for (const [chip, info] of Object.entries(APPLE_CHIPS)) {
    if (ua.includes(chip.replace(" ", ""))) return { chip, ...info };
  }

  // Fallback: it's Apple Silicon but unknown chip
  return { chip: "apple silicon", bw: 100, defaultRam: 8 };
}

function isMobileDevice(): boolean {
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent) &&
    !/macintosh/i.test(navigator.userAgent);
}

function detectRam(): number | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dm = (navigator as any).deviceMemory as number | undefined;
  if (dm && dm > 0) return dm;
  return null;
}

export async function detectGpu(): Promise<GpuInfo> {
  const ram_gb = detectRam();
  const mobile = isMobileDevice();
  let gpuName = "Not detected";

  // Try WebGPU
  if ("gpu" in navigator) {
    try {
      const gpu = navigator.gpu as GPU;
      const adapter = await gpu.requestAdapter();
      if (adapter) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const info = (adapter as any).info ?? await (adapter as any).requestAdapterInfo?.() ?? {};
        gpuName = info.device || info.vendor || "Unknown GPU";
      }
    } catch { /* fall through */ }
  }

  // Fallback: WebGL
  if (gpuName === "Not detected" || gpuName === "Unknown GPU") {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      if (gl) {
        const ext = gl.getExtension("WEBGL_debug_renderer_info");
        if (ext) {
          gpuName = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;
        }
      }
    } catch { /* fall through */ }
  }

  // Check Apple Silicon
  const apple = detectAppleChip(gpuName);
  if (apple) {
    // Unified memory: use deviceMemory or default for chip
    const totalRam = ram_gb ?? apple.defaultRam;
    // ~75% of unified memory available for model
    const usableVram = Math.floor(totalRam * 0.75);

    return {
      gpuName: `Apple ${apple.chip.toUpperCase()}`,
      vram_gb: usableVram,
      ram_gb: totalRam,
      detected: true,
      isMobile: mobile,
      isAppleSilicon: true,
      unifiedMemory_gb: totalRam,
    };
  }

  // Also check userAgent for Mac (Safari doesn't always expose GPU name)
  if (/macintosh/i.test(navigator.userAgent)) {
    const ua = navigator.userAgent.toLowerCase();
    for (const [chip, info] of Object.entries(APPLE_CHIPS)) {
      if (ua.includes(chip.replace(" ", ""))) {
        const totalRam = ram_gb ?? info.defaultRam;
        const usableVram = Math.floor(totalRam * 0.75);
        return {
          gpuName: `Apple ${chip.toUpperCase()}`,
          vram_gb: usableVram,
          ram_gb: totalRam,
          detected: true,
          isMobile: false,
          isAppleSilicon: true,
          unifiedMemory_gb: totalRam,
        };
      }
    }
  }

  // Discrete GPU
  const vram_gb = mobile ? null : lookupVram(gpuName);

  return {
    gpuName,
    vram_gb,
    ram_gb,
    detected: gpuName !== "Not detected",
    isMobile: mobile,
    isAppleSilicon: false,
    unifiedMemory_gb: null,
  };
}
