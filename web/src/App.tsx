import { useEffect, useState, createContext, useContext, useMemo } from "react";
import { HashRouter, Routes, Route, useNavigate, useParams } from "react-router-dom";
import { detectGpu, type GpuInfo } from "./lib/gpu";
import { guessBandwidth } from "./lib/bandwidth";
import { totalVram, canRun, estimateTokensPerSec, type Model } from "./lib/calc";
import modelsData from "./data/models.json";
import "./App.css";

const models = modelsData as Model[];
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/* ── Context ──────────────────── */
const GpuCtx = createContext<{ vram: number; bw: number }>({ vram: 0, bw: 0 });

/* ── helpers ──────────────────── */
const CTX = 4096;

function bestResult(m: Model, vram: number, bw: number) {
  for (let i = m.variants.length - 1; i >= 0; i--) {
    const v = m.variants[i];
    const need = totalVram(v, m.config, CTX);
    if (canRun(need, vram) === "ok")
      return { v, tks: estimateTokensPerSec(v, bw, vram), need, runnable: true };
  }
  const v = m.variants[0];
  const need = totalVram(v, m.config, CTX);
  const s = canRun(need, vram);
  if (s !== "no")
    return { v, tks: estimateTokensPerSec(v, bw, vram), need, runnable: true };
  return { v, tks: null, need, runnable: false };
}

function tksColor(tks: number | null, ok: boolean): string {
  if (!ok) return "#ef4444";
  if (tks === null) return "#666";
  if (tks >= 25) return "#22c55e";
  if (tks >= 12) return "#4ade80";
  if (tks >= 6) return "#facc15";
  if (tks >= 2) return "#fb923c";
  return "#ef4444";
}

function grade(tks: number | null, ok: boolean): { letter: string; color: string } {
  if (!ok) return { letter: "F", color: "#ef4444" };
  if (tks === null) return { letter: "?", color: "#666" };
  if (tks >= 30) return { letter: "S", color: "#22c55e" };
  if (tks >= 20) return { letter: "A", color: "#4ade80" };
  if (tks >= 12) return { letter: "B", color: "#a3e635" };
  if (tks >= 6) return { letter: "C", color: "#facc15" };
  if (tks >= 2) return { letter: "D", color: "#fb923c" };
  return { letter: "F", color: "#ef4444" };
}

/* ── List Page ────────────────── */

function ListPage() {
  const { vram, bw } = useContext(GpuCtx);
  const nav = useNavigate();
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const filtered = models.filter((m) =>
      m.name.toLowerCase().includes(search.toLowerCase())
    );
    if (vram <= 0) return filtered;
    return [...filtered].sort((a, b) => {
      const ra = bestResult(a, vram, bw);
      const rb = bestResult(b, vram, bw);
      if (ra.runnable && !rb.runnable) return -1;
      if (!ra.runnable && rb.runnable) return 1;
      return (rb.tks ?? -1) - (ra.tks ?? -1);
    });
  }, [vram, bw, search]);

  return (
    <>
      {/* Filter bar */}
      <div className="filters">
        <div className="search-box">
          <span className="search-icon">⌕</span>
          <input
            type="text"
            placeholder="Search models..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Column headers */}
      <div className="col-header">
        <span className="ch-name">Model</span>
        <span className="ch-col">Size</span>
        <span className="ch-col">Context</span>
        <span className="ch-col">Speed</span>
        <span className="ch-grade">Grade</span>
      </div>

      {/* Rows */}
      <div className="table-body">
        {rows.map((m) => {
          const r = vram > 0 ? bestResult(m, vram, bw) : null;
          const tks = r?.tks ?? null;
          const ok = r?.runnable ?? true;
          const g = vram > 0 ? grade(tks, ok) : { letter: "?", color: "#555" };
          const bestQuant = r?.v.quant ?? m.variants[0].quant;
          const bestSize = r?.v.file_gb ?? m.variants[0].file_gb;
          const ctxK = (m.context / 1024).toFixed(0);

          return (
            <div
              key={m.name}
              className={`trow ${!ok && vram > 0 ? "trow-off" : ""}`}
              onClick={() => nav(`/model/${slugify(m.name)}`)}
            >
              <div className="trow-name">
                <span className="t-name">{m.name}</span>
                <span className="t-params">{m.params_b}B</span>
              </div>
              <span className="t-col t-size">{bestSize} GB</span>
              <span className="t-col t-ctx">{ctxK}K ctx</span>
              <span className="t-col t-tks" style={{ color: tksColor(tks, ok) }}>
                {vram > 0
                  ? ok
                    ? tks !== null ? `~${tks} tok/s` : "—"
                    : "~0 tok/s"
                  : "—"}
              </span>
              <span className="t-grade" style={{ color: g.color }}>{g.letter}</span>
              <span className="t-quant">{bestQuant}</span>
              <span className="t-arrow">›</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ── Detail Page ──────────────── */

function DetailPage() {
  const { vram, bw } = useContext(GpuCtx);
  const { slug } = useParams();
  const nav = useNavigate();

  const model = models.find((m) => slugify(m.name) === slug);
  if (!model) return <p style={{ color: "#888", padding: 40 }}>Model not found</p>;

  return (
    <div className="detail">
      <button className="back-btn" onClick={() => nav("/")}>← Back</button>

      <div className="d-hero">
        <h2>{model.name}</h2>
        <div className="d-chips">
          <span className="d-chip">{model.params_b}B parameters</span>
          <span className="d-chip">{(model.context / 1024).toFixed(0)}K context</span>
        </div>
      </div>

      <div className="d-table">
        <div className="d-thead">
          <span>Quant</span>
          <span>File size</span>
          <span>VRAM needed</span>
          <span>Speed</span>
          <span>Grade</span>
        </div>
        {model.variants.map((v) => {
          const need = totalVram(v, model.config, CTX);
          const st = vram > 0 ? canRun(need, vram) : "no";
          const ok = st === "ok" || st === "partial";
          const tks = ok ? estimateTokensPerSec(v, bw, vram) : null;
          const g = vram > 0 ? grade(tks, ok) : { letter: "?", color: "#555" };
          const col = tksColor(tks, ok);

          return (
            <div key={v.quant} className={`d-row ${ok ? "" : "d-row-off"}`}>
              <span className="d-quant">{v.quant}</span>
              <span>{v.file_gb} GB</span>
              <span>{need} GB</span>
              <span className="d-tks" style={{ color: col }}>
                {ok ? (tks ? `~${tks} tok/s` : "—") : "~0 tok/s"}
              </span>
              <span className="d-grade" style={{ color: g.color }}>{g.letter}</span>
            </div>
          );
        })}
      </div>

      <div className="d-links">
        {model.hf && (
          <a href={`https://huggingface.co/${model.hf}`} target="_blank" rel="noopener" className="d-link">
            🤗 Base Model
          </a>
        )}
        {model.gguf && (
          <a href={`https://huggingface.co/${model.gguf}`} target="_blank" rel="noopener" className="d-link">
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
    detectGpu().then((i) => { setGpu(i); setLoading(false); });
  }, []);

  const vram = gpu?.vram_gb ?? 0;
  const bw = gpu ? (guessBandwidth(gpu.name) ?? 0) : 0;

  return (
    <GpuCtx.Provider value={{ vram, bw }}>
      <HashRouter>
        <div className="app">
          {/* Header */}
          <header>
            <h1>Can I Run This LLM?</h1>
            <p className="sub">Find out which LLMs your machine can actually run.</p>
          </header>

          {/* HW bar */}
          <div className="hw-bar">
            {loading ? (
              <span className="hw-detecting">Detecting hardware…</span>
            ) : (
              <>
                <div className="hw-item">
                  <span className="hw-icon">⬡</span>
                  <span className="hw-val">{gpu?.name ?? "Unknown GPU"}</span>
                </div>
                {vram > 0 && (
                  <div className="hw-item">
                    <span className="hw-icon">⬢</span>
                    <span className="hw-val">{vram} GB VRAM</span>
                  </div>
                )}
                {bw > 0 && (
                  <div className="hw-item">
                    <span className="hw-icon">↕</span>
                    <span className="hw-val">~{bw} GB/s</span>
                  </div>
                )}
                <span className="hw-badge">WebGPU</span>
              </>
            )}
          </div>
          <p className="hw-note">Estimates based on browser APIs. Actual specs may vary.</p>

          <Routes>
            <Route path="/" element={<ListPage />} />
            <Route path="/model/:slug" element={<DetailPage />} />
          </Routes>

          <footer>Speed estimates are theoretical · memory-bandwidth bound · single-batch inference</footer>
        </div>
      </HashRouter>
    </GpuCtx.Provider>
  );
}

export default App;
