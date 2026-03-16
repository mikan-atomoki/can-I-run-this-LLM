export interface Variant {
  quant: string;
  file_gb: number;
  bpw: number;
}

export interface ModelConfig {
  heads: number;
  kv_heads: number;
  hidden: number;
  layers: number;
}

export interface Model {
  name: string;
  params_b: number;
  context: number;
  bench: number;       // MMLU-approximate score (0-100)
  tags: string[];      // "chat" | "code" | "reasoning"
  config: ModelConfig;
  variants: Variant[];
  hf?: string;
  gguf?: string;
}

export type RunMode = "gpu" | "cpu" | "no";

export interface RunInfo {
  mode: RunMode;
  tks: number | null;
  vram_needed: number;
}

function kvCacheGb(config: ModelConfig, contextLen: number, cacheBit = 16): number {
  const gqa = config.heads / config.kv_heads;
  const embdGqa = config.hidden / gqa;
  const elements = embdGqa * config.layers * contextLen;
  return (2 * elements * (cacheBit / 8)) / 1e9;
}

export function totalVram(
  variant: Variant,
  config: ModelConfig,
  contextLen: number
): number {
  const weights = variant.file_gb;
  const kv = kvCacheGb(config, contextLen);
  const overhead = 0.3;
  return Math.round((weights + kv + overhead) * 100) / 100;
}

/**
 * Evaluate a single variant against hardware.
 *
 * GPU mode:  model fits in VRAM → gpu_bw / model_size
 * CPU mode:  model fits in RAM  → ram_bw / model_size (llama.cpp style, much slower)
 * No:        doesn't fit anywhere
 */
export function evaluate(
  variant: Variant,
  gpuVram: number,
  gpuBw: number,
  ram: number,
  ramBw: number,
  config: ModelConfig,
  ctx: number,
): RunInfo {
  const needed = totalVram(variant, config, ctx);
  const modelGb = variant.file_gb;

  // GPU: fits in VRAM
  if (gpuVram > 0 && needed <= gpuVram && gpuBw > 0) {
    const tks = Math.round((gpuBw / modelGb) * 10) / 10;
    return { mode: "gpu", tks, vram_needed: needed };
  }

  // CPU: doesn't fit in VRAM but fits in RAM
  if (ram > 0 && modelGb <= ram) {
    if (ramBw > 0) {
      // CPU inference is memory-bandwidth bound but with extra overhead
      // llama.cpp CPU: roughly ram_bw / model_size * efficiency (~0.85)
      const tks = Math.round((ramBw / modelGb) * 0.85 * 10) / 10;
      return { mode: "cpu", tks, vram_needed: needed };
    }
    return { mode: "cpu", tks: null, vram_needed: needed };
  }

  return { mode: "no", tks: null, vram_needed: needed };
}
