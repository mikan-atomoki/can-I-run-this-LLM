import { useEffect, useState } from "react";
import { detectGpu, type GpuInfo } from "./lib/gpu";
import { guessBandwidth } from "./lib/bandwidth";
import {
  totalVram,
  canRun,
  estimateTokensPerSec,
  type Model,
} from "./lib/calc";
import modelsData from "./data/models.json";
import "./App.css";

const models = modelsData as Model[];

/* ── helpers ─────────────────────────────────────── */

function bestRunnableVariant(
  model: Model,
  vram: number,
  bw: number,
  ctx: number
) {
  for (let i = model.variants.length - 1; i >= 0; i--) {
    const v = model.variants[i];
    const need = totalVram(v, model.config, ctx);
    if (canRun(need, vram) === "ok") {
      return { v, tks: estimateTokensPerSec(v, bw, vram), need };
    }
  }
  // smallest as partial?
  const v = model.variants[0];
  const need = totalVram(v, model.config, ctx);
  const st = canRun(need, vram);
  if (st !== "no")
    return { v, tks: estimateTokensPerSec(v, bw, vram), need };
  return null;
}

function perfColor(tks: number | null): string {
  if (tks === null) return "var(--c-muted)";
  if (tks >= 40) return "#22c55e";
  if (tks >= 25) return "#4ade80";
  if (tks >= 15) return "#a3e635";
  if (tks >= 8) return "#facc15";
  if (tks >= 4) return "#fb923c";
  return "#ef4444";
}

function perfLabel(tks: number | null): string {
  if (tks === null) return "";
  if (tks >= 25) return "Fast";
  if (tks >= 15) return "Good";
  if (tks >= 8) return "OK";
  if (tks >= 4) return "Slow";
  return "Very slow";
}

/* ── ModelCard ────────────────────────────────────── */

function ModelCard({
  model,
  vram,
  bw,
  ctx,
  onClick,
}: {
  model: Model;
  vram: number;
  bw: number;
  ctx: number;
  onClick: () => void;
}) {
  const best = vram > 0 ? bestRunnableVariant(model, vram, bw, ctx) : null;
  const runnable = best !== null;
  const tks = best?.tks ?? null;
  const color = perfColor(tks);

  return (
    <div
      className={`card ${runnable ? "" : "card-disabled"}`}
      onClick={onClick}
      style={{ "--accent": color } as React.CSSProperties}
    >
      <div className="card-top">
        <div className="card-glow" />
        <h3 className="card-name">{model.name}</h3>
        <span className="card-params">{model.params_b}B params</span>
      </div>
      <div className="card-bottom">
        {vram > 0 ? (
          runnable ? (
            <>
              <span className="card-tks" style={{ color }}>
                {tks ? `${tks} tk/s` : "—"}
              </span>
              <span className="card-perf" style={{ color }}>
                {perfLabel(tks)}
              </span>
              <span className="card-quant">{best.v.quant}</span>
            </>
          ) : (
            <span className="card-cant">Not enough VRAM</span>
          )
        ) : (
          <span className="card-cant">Detecting…</span>
        )}
      </div>
    </div>
  );
}

/* ── DetailPage ──────────────────────────────────── */

function DetailPage({
  model,
  vram,
  bw,
  ctx,
  onBack,
}: {
  model: Model;
  vram: number;
  bw: number;
  ctx: number;
  onBack: () => void;
}) {
  return (
    <div className="detail">
      <button className="back-btn" onClick={onBack}>
        ← Back
      </button>

      <div className="detail-hero">
        <h2>{model.name}</h2>
        <div className="detail-meta">
          <span>{model.params_b}B parameters</span>
          <span>Context: {(model.context / 1024).toFixed(0)}K</span>
        </div>
      </div>

      <div className="detail-table">
        <div className="dt-header">
          <span>Quantization</span>
          <span>File size</span>
          <span>VRAM needed</span>
          <span>Speed</span>
          <span>Status</span>
        </div>
        {model.variants.map((v) => {
          const need = totalVram(v, model.config, ctx);
          const status = vram > 0 ? canRun(need, vram) : "no";
          const runnable = status === "ok" || status === "partial";
          const tks = runnable
            ? estimateTokensPerSec(v, bw, vram)
            : null;
          const color = runnable ? perfColor(tks) : "var(--c-muted)";

          return (
            <div
              key={v.quant}
              className={`dt-row ${runnable ? "" : "dt-row-off"}`}
              style={{ "--row-color": color } as React.CSSProperties}
            >
              <span className="dt-quant">{v.quant}</span>
              <span>{v.file_gb} GB</span>
              <span>{need} GB</span>
              <span style={{ color, fontWeight: 600 }}>
                {tks ? `${tks} tk/s` : "—"}
              </span>
              <span className="dt-status" style={{ color }}>
                {runnable ? perfLabel(tks) : "Can't run"}
              </span>
            </div>
          );
        })}
      </div>

      <div className="detail-links">
        {model.hf && (
          <a
            href={`https://huggingface.co/${model.hf}`}
            target="_blank"
            rel="noopener"
            className="link-btn"
          >
            🤗 Base Model
          </a>
        )}
        {model.gguf && (
          <a
            href={`https://huggingface.co/${model.gguf}`}
            target="_blank"
            rel="noopener"
            className="link-btn"
          >
            📦 GGUF Files
          </a>
        )}
      </div>
    </div>
  );
}

/* ── App ─────────────────────────────────────────── */

function App() {
  const [gpu, setGpu] = useState<GpuInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Model | null>(null);
  const ctx = 4096;

  useEffect(() => {
    detectGpu().then((info) => {
      setGpu(info);
      setLoading(false);
    });
  }, []);

  const vram = gpu?.vram_gb ?? 0;
  const bw = gpu ? (guessBandwidth(gpu.name) ?? 0) : 0;

  const sorted = [...models].sort((a, b) => {
    if (vram <= 0) return 0;
    const ba = bestRunnableVariant(a, vram, bw, ctx);
    const bb = bestRunnableVariant(b, vram, bw, ctx);
    if (ba && !bb) return -1;
    if (!ba && bb) return 1;
    return (bb?.tks ?? 0) - (ba?.tks ?? 0);
  });

  if (selected) {
    return (
      <div className="app">
        <DetailPage
          model={selected}
          vram={vram}
          bw={bw}
          ctx={ctx}
          onBack={() => setSelected(null)}
        />
      </div>
    );
  }

  return (
    <div className="app">
      <header>
        <h1>Can I Run This LLM?</h1>
        <p className="tagline">
          {loading
            ? "Detecting your GPU…"
            : gpu?.detected
              ? <>Detected <strong>{gpu.name}</strong>{vram > 0 && <> · {vram} GB VRAM</>}{bw > 0 && <> · {bw} GB/s</>}</>
              : "Could not detect GPU"}
        </p>
      </header>

      <section className="grid">
        {sorted.map((m) => (
          <ModelCard
            key={m.name}
            model={m}
            vram={vram}
            bw={bw}
            ctx={ctx}
            onClick={() => setSelected(m)}
          />
        ))}
      </section>

      <footer>
        Speed estimates are theoretical (memory-bandwidth bound, single-batch inference).
      </footer>
    </div>
  );
}

export default App;
