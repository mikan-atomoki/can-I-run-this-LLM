import { useEffect, useState } from "react";
import { detectGpu, type GpuInfo } from "./lib/gpu";
import { guessBandwidth } from "./lib/bandwidth";
import { totalVram, canRun, estimateTokensPerSec, type Model, type Variant, type ModelConfig } from "./lib/calc";
import modelsData from "./data/models.json";
import "./App.css";

const models = modelsData as Model[];

/** tk/s → color. Green = fast, red = slow, grey = can't run */
function tksColor(tks: number | null, runnable: boolean): string {
  if (!runnable) return "#333";
  if (tks === null) return "#555";
  if (tks >= 30) return "#22c55e";
  if (tks >= 15) return "#6bdf6b";
  if (tks >= 8)  return "#e2b735";
  if (tks >= 3)  return "#e88a30";
  return "#ef4444";
}

function tksLabel(tks: number | null, runnable: boolean): string {
  if (!runnable) return "Can't run";
  if (tks === null) return "—";
  if (tks >= 30) return "Fast";
  if (tks >= 15) return "Good";
  if (tks >= 8)  return "Usable";
  if (tks >= 3)  return "Slow";
  return "Very slow";
}

/** Get the best runnable variant's info for the summary bar */
function bestVariant(
  model: Model,
  vram: number,
  bandwidth: number,
  contextLen: number
): { tks: number | null; runnable: boolean; quant: string } {
  // Find the biggest (highest quality) variant that fits
  for (let i = model.variants.length - 1; i >= 0; i--) {
    const v = model.variants[i];
    const vramNeeded = totalVram(v, model.config, contextLen);
    const status = canRun(vramNeeded, vram);
    if (status === "ok") {
      const tks = estimateTokensPerSec(v, bandwidth, vram);
      return { tks, runnable: true, quant: v.quant };
    }
  }
  // Fallback: try smallest variant
  const smallest = model.variants[0];
  const vramNeeded = totalVram(smallest, model.config, contextLen);
  const status = canRun(vramNeeded, vram);
  if (status === "ok" || status === "partial") {
    const tks = estimateTokensPerSec(smallest, bandwidth, vram);
    return { tks, runnable: true, quant: smallest.quant };
  }
  return { tks: null, runnable: false, quant: "" };
}

function VariantDetail({ v, config, contextLen, vram, bandwidth }: {
  v: Variant; config: ModelConfig; contextLen: number; vram: number; bandwidth: number;
}) {
  const vramNeeded = totalVram(v, config, contextLen);
  const status = canRun(vramNeeded, vram);
  const runnable = status === "ok" || status === "partial";
  const tks = runnable ? estimateTokensPerSec(v, bandwidth, vram) : null;
  const color = tksColor(tks, runnable);

  return (
    <div className="variant-row" style={{ borderLeftColor: color }}>
      <span className="v-quant">{v.quant}</span>
      <span className="v-size">{v.file_gb} GB</span>
      <span className="v-vram">{vramNeeded} GB</span>
      <span className="v-tks" style={{ color }}>
        {runnable ? (tks ? `${tks} tk/s` : "—") : "—"}
      </span>
      <span className="v-status" style={{ color }}>
        {tksLabel(tks, runnable)}
      </span>
    </div>
  );
}

function ModelStrip({ model, vram, bandwidth, contextLen }: {
  model: Model; vram: number; bandwidth: number; contextLen: number;
}) {
  const [open, setOpen] = useState(false);
  const best = vram > 0 ? bestVariant(model, vram, bandwidth, contextLen) : { tks: null, runnable: false, quant: "" };
  const color = tksColor(best.tks, best.runnable);

  return (
    <div className="model-strip">
      <div
        className={`strip-bar ${open ? "strip-open" : ""}`}
        style={{ borderLeftColor: color }}
        onClick={() => setOpen(!open)}
      >
        <div className="strip-left">
          <span className="strip-name">{model.name}</span>
          <span className="strip-params">{model.params_b}B</span>
        </div>
        <div className="strip-right">
          {vram > 0 && (
            <>
              <span className="strip-tks" style={{ color }}>
                {best.runnable
                  ? best.tks
                    ? `${best.tks} tk/s`
                    : "—"
                  : "Can't run"}
              </span>
              {best.runnable && best.quant && (
                <span className="strip-best">best: {best.quant}</span>
              )}
            </>
          )}
          <span className="strip-arrow">{open ? "▲" : "▼"}</span>
        </div>
      </div>

      {open && (
        <div className="strip-detail">
          <div className="detail-header">
            <span>Quant</span>
            <span>File</span>
            <span>VRAM</span>
            <span>Speed</span>
            <span></span>
          </div>
          {model.variants.map((v) => (
            <VariantDetail
              key={v.quant}
              v={v}
              config={model.config}
              contextLen={contextLen}
              vram={vram}
              bandwidth={bandwidth}
            />
          ))}
          <div className="detail-links">
            {model.hf && (
              <a href={`https://huggingface.co/${model.hf}`} target="_blank" rel="noopener">
                Base model
              </a>
            )}
            {model.gguf && (
              <a href={`https://huggingface.co/${model.gguf}`} target="_blank" rel="noopener">
                GGUF files
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  const [gpu, setGpu] = useState<GpuInfo | null>(null);
  const [vramOverride, setVramOverride] = useState<number | null>(null);
  const [contextLen, setContextLen] = useState(4096);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    detectGpu().then((info) => {
      setGpu(info);
      setLoading(false);
    });
  }, []);

  const vram = vramOverride ?? gpu?.vram_gb ?? 0;
  const bandwidth = gpu ? guessBandwidth(gpu.name) ?? 0 : 0;

  // Sort: runnable first (by best tk/s desc), then can't-run
  const sorted = [...models].sort((a, b) => {
    if (vram <= 0) return 0;
    const ba = bestVariant(a, vram, bandwidth, contextLen);
    const bb = bestVariant(b, vram, bandwidth, contextLen);
    if (ba.runnable && !bb.runnable) return -1;
    if (!ba.runnable && bb.runnable) return 1;
    return (bb.tks ?? 0) - (ba.tks ?? 0);
  });

  return (
    <div className="app">
      <header>
        <h1>Can I Run This LLM?</h1>
      </header>

      <section className="gpu-bar">
        {loading ? (
          <div className="gpu-detecting">Detecting GPU...</div>
        ) : (
          <>
            <div className="gpu-chip">
              <span className="chip-label">GPU</span>
              <span className="chip-value gpu-name-val">{gpu?.name ?? "Not detected"}</span>
            </div>
            <div className="gpu-chip">
              <span className="chip-label">VRAM</span>
              <input
                type="number"
                className="vram-input"
                value={vram || ""}
                onChange={(e) => setVramOverride(e.target.value ? Number(e.target.value) : null)}
                placeholder="?"
                min={0}
                step={1}
              />
              <span className="chip-unit">GB</span>
            </div>
            <div className="gpu-chip">
              <span className="chip-label">BW</span>
              <span className="chip-value">{bandwidth ? `${bandwidth} GB/s` : "—"}</span>
            </div>
            <div className="gpu-chip">
              <span className="chip-label">Context</span>
              <select
                value={contextLen}
                onChange={(e) => setContextLen(Number(e.target.value))}
                className="context-select"
              >
                <option value={2048}>2K</option>
                <option value={4096}>4K</option>
                <option value={8192}>8K</option>
                <option value={16384}>16K</option>
                <option value={32768}>32K</option>
                <option value={65536}>64K</option>
                <option value={131072}>128K</option>
              </select>
            </div>
          </>
        )}
      </section>

      {!loading && vram <= 0 && (
        <div className="vram-notice">
          VRAM を入力すると、各モデルの推定速度が表示されます
        </div>
      )}

      <section className="model-list">
        {sorted.map((model) => (
          <ModelStrip
            key={model.name}
            model={model}
            vram={vram}
            bandwidth={bandwidth}
            contextLen={contextLen}
          />
        ))}
      </section>

      <footer>
        <p>
          Speed estimates are theoretical (memory-bandwidth bound).
          VRAM includes model weights + KV cache + overhead.
        </p>
      </footer>
    </div>
  );
}

export default App;
