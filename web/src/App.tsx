import { useEffect, useState } from "react";
import { detectGpu, type GpuInfo } from "./lib/gpu";
import { guessBandwidth } from "./lib/bandwidth";
import { totalVram, canRun, estimateTokensPerSec, type Model } from "./lib/calc";
import modelsData from "./data/models.json";
import "./App.css";

const models = modelsData as Model[];

function StatusBadge({ status }: { status: "ok" | "partial" | "no" }) {
  const map = {
    ok: { label: "OK", cls: "badge-ok" },
    partial: { label: "Offload", cls: "badge-partial" },
    no: { label: "NG", cls: "badge-no" },
  };
  const { label, cls } = map[status];
  return <span className={`badge ${cls}`}>{label}</span>;
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

  return (
    <div className="app">
      <header>
        <h1>Can I Run This LLM?</h1>
        <p className="subtitle">
          Auto-detect your GPU, instantly see what you can run
        </p>
      </header>

      <section className="gpu-bar">
        {loading ? (
          <div className="gpu-detecting">Detecting GPU...</div>
        ) : (
          <>
            <div className="gpu-info">
              <span className="gpu-label">GPU</span>
              <span className="gpu-name">{gpu?.name ?? "Not detected"}</span>
            </div>
            <div className="gpu-info">
              <span className="gpu-label">VRAM</span>
              <input
                type="number"
                className="vram-input"
                value={vram || ""}
                onChange={(e) =>
                  setVramOverride(
                    e.target.value ? Number(e.target.value) : null
                  )
                }
                placeholder="GB"
                min={0}
                step={1}
              />
              <span className="gpu-unit">GB</span>
              {!gpu?.vram_gb && gpu?.detected && (
                <span className="vram-hint">enter VRAM manually</span>
              )}
            </div>
            <div className="gpu-info">
              <span className="gpu-label">Bandwidth</span>
              <span className="gpu-value">
                {bandwidth ? `${bandwidth} GB/s` : "—"}
              </span>
            </div>
            <div className="gpu-info">
              <span className="gpu-label">Context</span>
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

      <section className="model-grid">
        {models.map((model) => (
          <div key={model.name} className="model-card">
            <div className="model-header">
              <h3>{model.name}</h3>
              <span className="model-params">{model.params_b}B</span>
            </div>
            <div className="variant-table">
              <div className="variant-header">
                <span>Quant</span>
                <span>Size</span>
                <span>VRAM</span>
                <span>tk/s</span>
                <span></span>
              </div>
              {model.variants.map((v) => {
                const vramNeeded = totalVram(v, model.config, contextLen);
                const status =
                  vram > 0 ? canRun(vramNeeded, vram) : ("no" as const);
                const tks =
                  vram > 0
                    ? estimateTokensPerSec(v, bandwidth, vram)
                    : null;

                return (
                  <div
                    key={v.quant}
                    className={`variant-row variant-${status}`}
                  >
                    <span className="quant-name">{v.quant}</span>
                    <span>{v.file_gb} GB</span>
                    <span>{vramNeeded} GB</span>
                    <span>{tks ? `${tks}` : "—"}</span>
                    <StatusBadge status={status} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <footer>
        <p>
          VRAM = model weights + KV cache + overhead. tk/s = theoretical
          (memory-bandwidth bound).
        </p>
      </footer>
    </div>
  );
}

export default App;
