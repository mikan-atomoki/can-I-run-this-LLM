import { useEffect, useState, createContext, useContext } from "react";
import { HashRouter, Routes, Route, useNavigate, useParams } from "react-router-dom";
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
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/* ── Context for GPU info ─────── */
const GpuCtx = createContext<{ vram: number; bw: number }>({ vram: 0, bw: 0 });

/* ── helpers ──────────────────── */

function bestResult(model: Model, vram: number, bw: number, ctx: number) {
  for (let i = model.variants.length - 1; i >= 0; i--) {
    const v = model.variants[i];
    const need = totalVram(v, model.config, ctx);
    if (canRun(need, vram) === "ok") {
      return { v, tks: estimateTokensPerSec(v, bw, vram), runnable: true };
    }
  }
  const v = model.variants[0];
  const need = totalVram(v, model.config, ctx);
  if (canRun(need, vram) !== "no") {
    return { v, tks: estimateTokensPerSec(v, bw, vram), runnable: true };
  }
  return { v, tks: null, runnable: false };
}

function perfColor(tks: number | null): string {
  if (tks === null) return "#555";
  if (tks >= 30) return "#22c55e";
  if (tks >= 15) return "#4ade80";
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

/* ── List Page ────────────────── */

function ListPage() {
  const { vram, bw } = useContext(GpuCtx);
  const nav = useNavigate();
  const ctx = 4096;

  const sorted = [...models].sort((a, b) => {
    if (vram <= 0) return 0;
    const ra = bestResult(a, vram, bw, ctx);
    const rb = bestResult(b, vram, bw, ctx);
    if (ra.runnable && !rb.runnable) return -1;
    if (!ra.runnable && rb.runnable) return 1;
    return (rb.tks ?? 0) - (ra.tks ?? 0);
  });

  return (
    <section className="list">
      {sorted.map((m) => {
        const r = vram > 0 ? bestResult(m, vram, bw, ctx) : null;
        const tks = r?.tks ?? null;
        const runnable = r?.runnable ?? false;
        const color = perfColor(tks);

        return (
          <div
            key={m.name}
            className={`row ${!runnable && vram > 0 ? "row-off" : ""}`}
            onClick={() => nav(`/model/${slugify(m.name)}`)}
          >
            <div className="row-indicator" style={{ background: vram > 0 ? color : "#333" }} />
            <div className="row-main">
              <span className="row-name">{m.name}</span>
              <span className="row-params">{m.params_b}B</span>
            </div>
            <div className="row-right">
              {vram > 0 && runnable && tks && (
                <>
                  <span className="row-tks" style={{ color }}>{tks} tk/s</span>
                  <span className="row-perf" style={{ color }}>{perfLabel(tks)}</span>
                </>
              )}
              {vram > 0 && !runnable && (
                <span className="row-cant">Can't run</span>
              )}
              <span className="row-arrow">›</span>
            </div>
          </div>
        );
      })}
    </section>
  );
}

/* ── Detail Page ──────────────── */

function DetailPage() {
  const { vram, bw } = useContext(GpuCtx);
  const { slug } = useParams();
  const nav = useNavigate();
  const ctx = 4096;

  const model = models.find((m) => slugify(m.name) === slug);
  if (!model) return <div className="detail"><p>Model not found</p></div>;

  return (
    <div className="detail">
      <button className="back-btn" onClick={() => nav("/")}>← Back</button>

      <div className="detail-hero">
        <h2>{model.name}</h2>
        <div className="detail-chips">
          <span className="chip">{model.params_b}B params</span>
          <span className="chip">{(model.context / 1024).toFixed(0)}K context</span>
        </div>
      </div>

      <div className="detail-variants">
        {model.variants.map((v) => {
          const need = totalVram(v, model.config, ctx);
          const st = vram > 0 ? canRun(need, vram) : "no";
          const runnable = st === "ok" || st === "partial";
          const tks = runnable ? estimateTokensPerSec(v, bw, vram) : null;
          const color = runnable ? perfColor(tks) : "#333";

          return (
            <div key={v.quant} className={`var-card ${runnable ? "" : "var-off"}`}>
              <div className="var-bar" style={{ background: color }} />
              <div className="var-body">
                <div className="var-top">
                  <span className="var-quant">{v.quant}</span>
                  <span className="var-size">{v.file_gb} GB</span>
                </div>
                <div className="var-bottom">
                  {runnable ? (
                    <>
                      <span className="var-tks" style={{ color }}>{tks ? `${tks} tk/s` : "—"}</span>
                      <span className="var-need">{need} GB VRAM</span>
                    </>
                  ) : (
                    <span className="var-cant">Needs {need} GB VRAM</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="detail-links">
        {model.hf && (
          <a href={`https://huggingface.co/${model.hf}`} target="_blank" rel="noopener" className="link-btn">
            🤗 Base Model
          </a>
        )}
        {model.gguf && (
          <a href={`https://huggingface.co/${model.gguf}`} target="_blank" rel="noopener" className="link-btn">
            📦 GGUF Files
          </a>
        )}
      </div>
    </div>
  );
}

/* ── App ──────────────────────── */

function App() {
  const [gpu, setGpu] = useState<GpuInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    detectGpu().then((info) => { setGpu(info); setLoading(false); });
  }, []);

  const vram = gpu?.vram_gb ?? 0;
  const bw = gpu ? (guessBandwidth(gpu.name) ?? 0) : 0;

  return (
    <GpuCtx.Provider value={{ vram, bw }}>
      <HashRouter>
        <div className="app">
          <header>
            <h1>Can I Run This LLM?</h1>
            <p className="tagline">
              {loading
                ? "Detecting your GPU…"
                : gpu?.detected
                  ? <>{gpu.name}{vram > 0 && <> · {vram} GB</>}{bw > 0 && <> · {bw} GB/s</>}</>
                  : "Could not detect GPU — results shown without speed estimates"}
            </p>
          </header>
          <Routes>
            <Route path="/" element={<ListPage />} />
            <Route path="/model/:slug" element={<DetailPage />} />
          </Routes>
          <footer>
            Speed = theoretical peak (memory-bandwidth bound).
          </footer>
        </div>
      </HashRouter>
    </GpuCtx.Provider>
  );
}

export default App;
