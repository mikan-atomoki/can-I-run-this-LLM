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
  config: ModelConfig;
  variants: Variant[];
}

export interface RunResult {
  model: string;
  quant: string;
  vram_required_gb: number;
  status: "ok" | "partial" | "no";
  tokens_per_sec: number | null;
}

/**
 * KV cache size in GB for a given context length
 */
function kvCacheGb(config: ModelConfig, contextLen: number, cacheBit = 16): number {
  const gqa = config.heads / config.kv_heads;
  const embdGqa = config.hidden / gqa;
  const elements = embdGqa * config.layers * contextLen;
  return (2 * elements * (cacheBit / 8)) / 1e9;
}

/**
 * Total VRAM needed: file size (model weights) + KV cache + overhead
 */
export function totalVram(
  variant: Variant,
  config: ModelConfig,
  contextLen: number
): number {
  const weights = variant.file_gb;
  const kv = kvCacheGb(config, contextLen);
  const overhead = 0.3; // CUDA/Metal overhead
  return Math.round((weights + kv + overhead) * 100) / 100;
}

/**
 * Estimate tokens/sec based on memory bandwidth
 * For GPU-only: bandwidth / model_size
 * Simple but reasonable for inference (memory-bound)
 */
export function estimateTokensPerSec(
  variant: Variant,
  bandwidthGBs: number,
  vramGb: number,
  ramGb: number = 0,
  ramBandwidthGBs: number = 0
): number | null {
  if (!bandwidthGBs) return null;

  const modelGb = variant.file_gb;

  // Fully in VRAM
  if (modelGb <= vramGb) {
    return Math.round((bandwidthGBs / modelGb) * 10) / 10;
  }

  // Partial offload to RAM
  if (ramGb > 0 && ramBandwidthGBs > 0 && modelGb <= vramGb + ramGb) {
    const gpuFraction = vramGb / modelGb;
    const ramFraction = 1 - gpuFraction;
    // Weighted harmonic mean of bandwidths
    const effectiveBw =
      1 / (gpuFraction / bandwidthGBs + ramFraction / ramBandwidthGBs);
    const baseTks = effectiveBw / modelGb;
    // Offload penalty ~30-60%
    return Math.round(baseTks * 0.5 * 10) / 10;
  }

  return null; // Can't run
}

/**
 * Determine run status
 */
export function canRun(
  requiredVram: number,
  gpuVram: number,
  systemRam: number = 0
): "ok" | "partial" | "no" {
  if (requiredVram <= gpuVram) return "ok";
  if (requiredVram <= gpuVram + systemRam) return "partial";
  return "no";
}

/**
 * Evaluate all models against a given GPU
 */
export function evaluateAll(
  models: Model[],
  gpuVram: number,
  bandwidthGBs: number,
  contextLen: number = 4096
): RunResult[] {
  const results: RunResult[] = [];

  for (const model of models) {
    for (const variant of model.variants) {
      const vram = totalVram(variant, model.config, contextLen);
      const status = canRun(vram, gpuVram);
      const tks = estimateTokensPerSec(variant, bandwidthGBs, gpuVram);

      results.push({
        model: model.name,
        quant: variant.quant,
        vram_required_gb: vram,
        status,
        tokens_per_sec: tks,
      });
    }
  }

  return results;
}
