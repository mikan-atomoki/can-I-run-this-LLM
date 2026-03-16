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

/**
 * Estimate quality degradation from quantization.
 *
 * Based on empirical observations from perplexity benchmarks:
 * - Larger models are more resilient to quantization
 * - Lower bpw = more degradation
 * - Below ~3 bpw, quality drops sharply especially for small models
 *
 * Returns estimated score after quantization (always <= baseBench).
 * This is an APPROXIMATION — actual results vary by model and task.
 */
export function estimateQuantizedScore(baseBench: number, bpw: number, params_b: number): number {
  if (bpw >= 16) return baseBench; // FP16 = no degradation

  // Size resilience factor: larger models lose less from quantization
  // 70B+ models are very resilient, <3B models are fragile
  const sizeResilience = Math.min(1, 0.5 + 0.5 * Math.log10(Math.max(params_b, 1)) / Math.log10(70));

  // Base degradation curve by bpw (at ~7B model size reference)
  // These are approximate percentage-point losses on MMLU-like benchmarks
  let baseLoss: number;
  if (bpw >= 8)       baseLoss = 0.3;   // Q8: negligible
  else if (bpw >= 6)  baseLoss = 1.0;   // Q6_K
  else if (bpw >= 5)  baseLoss = 2.0;   // Q5_K_M
  else if (bpw >= 4)  baseLoss = 3.5;   // Q4_K_M
  else if (bpw >= 3)  baseLoss = 7.0;   // Q3_K_M
  else                baseLoss = 15.0;  // Q2 and below

  // Adjust loss by model size: small models lose more, large models lose less
  const adjustedLoss = baseLoss * (1.5 - sizeResilience * 0.8);

  const result = Math.round(baseBench - adjustedLoss);
  return Math.max(result, Math.round(baseBench * 0.5)); // floor at 50% of original
}
