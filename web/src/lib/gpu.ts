export interface GpuInfo {
  gpuName: string;
  vram_gb: number | null;
  ram_gb: number | null;
  detected: boolean;
  isMobile: boolean;
}

// Only GPUs where we KNOW the VRAM for sure
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

function lookupVram(name: string): number | null {
  const lower = name.toLowerCase();
  for (const [gpu, vram] of Object.entries(KNOWN_GPUS)) {
    if (lower.includes(gpu)) return vram;
  }
  return null;
}

function isMobileDevice(): boolean {
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
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

  // Try WebGPU
  if ("gpu" in navigator) {
    try {
      const gpu = navigator.gpu as GPU;
      const adapter = await gpu.requestAdapter();
      if (adapter) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const info = (adapter as any).info ?? await (adapter as any).requestAdapterInfo?.() ?? {};
        const gpuName = info.device || info.vendor || "Unknown GPU";

        // ONLY trust VRAM from known GPU name lookup. Never guess from maxBufferSize.
        const vram_gb = mobile ? null : lookupVram(gpuName);

        return { gpuName, vram_gb, ram_gb, detected: true, isMobile: mobile };
      }
    } catch { /* fall through */ }
  }

  // Fallback: WebGL
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (gl) {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      if (ext) {
        const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;
        const vram_gb = mobile ? null : lookupVram(renderer);
        return { gpuName: renderer, vram_gb, ram_gb, detected: true, isMobile: mobile };
      }
    }
  } catch { /* fall through */ }

  return { gpuName: "Not detected", vram_gb: null, ram_gb, detected: false, isMobile: mobile };
}
