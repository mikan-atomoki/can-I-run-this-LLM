import { useEffect, useState, createContext, useContext, useMemo } from "react";
import { HashRouter, Routes, Route, useNavigate, useParams } from "react-router-dom";
import { detectGpu, type GpuInfo } from "./lib/gpu";
import { guessGpuBandwidth, guessRamBandwidth } from "./lib/bandwidth";
import { evaluate, totalVram, type Model, type RunMode, type RunInfo } from "./lib/calc";
import modelsData from "./data/models.json";
import "./App.css";

const models = modelsData as Model[];
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const CTX = 4096;

interface HwCtx { vram: number; gpuBw: number; ram: number; ramBw: number }
const Hw = createContext<HwCtx>({ vram: 0, gpuBw: 0, ram: 0, ramBw: 0 });

/* ── helpers ──────────────────── */

function bestEval(m: Model, hw: HwCtx): RunInfo {
  for (let i = m.variants.length - 1; i >= 0; i--) {
    const r = evaluate(m.variants[i], hw.vram, hw.gpuBw, hw.ram, hw.ramBw, m.config, CTX);
    if (r.mode === "gpu") return r;
  }
  return evaluate(m.variants[0], hw.vram, hw.gpuBw, hw.ram, hw.ramBw, m.config, CTX);
}

function tksColor(tks: number | null, mode: RunMode): string {
  if (mode === "no") return "#ef4444";
  if (tks === null) return "#666";
  if (tks >= 25) return "#22c55e";
  if (tks >= 12) return "#4ade80";
  if (tks >= 6) return "#facc15";
  if (tks >= 2) return "#fb923c";
  return "#ef4444";
}

function gradeInfo(tks: number | null, mode: RunMode) {
  if (mode === "no") return { letter: "F", color: "#ef4444" };
  if (tks === null) return { letter: "?", color: "#666" };
  if (tks >= 30) return { letter: "S", color: "#22c55e" };
  if (tks >= 20) return { letter: "A", color: "#4ade80" };
  if (tks >= 12) return { letter: "B", color: "#a3e635" };
  if (tks >= 6)  return { letter: "C", color: "#facc15" };
  if (tks >= 2)  return { letter: "D", color: "#fb923c" };
  return { letter: "F", color: "#ef4444" };
}

function benchColor(score: number): string {
  if (score >= 85) return "#22c55e";
  if (score >= 75) return "#4ade80";
  if (score >= 65) return "#facc15";
  if (score >= 55) return "#fb923c";
  return "#ef4444";
}

function ModeIcon({ mode }: { mode: RunMode }) {
  if (mode === "gpu") return <span className="mode-icon" title="GPU inference">⚡</span>;
  if (mode === "cpu") return <span className="mode-icon" title="CPU inference (slow)">🐢</span>;
  return <span className="mode-icon mode-no" title="Cannot run">✕</span>;
}

type SortKey = "speed" | "size" | "score";

/* ── List Page ────────────────── */

function ListPage() {
  const hw = useContext(Hw);
  const nav = useNavigate();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("score");
  const ready = hw.vram > 0 || hw.ram > 0;

  const rows = useMemo(() => {
    const filtered = models.filter((m) =>
      m.name.toLowerCase().includes(search.toLowerCase())
    );

    return [...filtered].sort((a, b) => {
      if (sortBy === "speed") {
        if (ready) {
          const ra = bestEval(a, hw);
          const rb = bestEval(b, hw);
          const modeRank = { gpu: 0, cpu: 1, no: 2 };
          if (modeRank[ra.mode] !== modeRank[rb.mode])
            return modeRank[ra.mode] - modeRank[rb.mode];
          return (rb.tks ?? -1) - (ra.tks ?? -1);
        }
        // No HW detected: best score-per-GB (smartest small models first)
        const effA = a.bench / a.variants[0].file_gb;
        const effB = b.bench / b.variants[0].file_gb;
        return effB - effA;
      }
      if (sortBy === "size") {
        return a.variants[0].file_gb - b.variants[0].file_gb;
      }
      // score: by bench desc, then smaller params first as tiebreaker
      if (b.bench !== a.bench) return b.bench - a.bench;
      return a.params_b - b.params_b;
    });
  }, [hw, search, sortBy, ready]);

  return (
    <>
      <div className="filters">
        <div className="search-box">
          <span className="search-icon">⌕</span>
          <input type="text" placeholder="Search models..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="sort-group">
          <span className="sort-label">Sort:</span>
          {(["score", "speed", "size"] as SortKey[]).map((k) => (
            <button key={k} className={`sort-btn ${sortBy === k ? "sort-active" : ""}`} onClick={() => setSortBy(k)}>
              {k === "score" ? "Score" : k === "speed" ? "Speed" : "Size"}
            </button>
          ))}
        </div>
      </div>

      <div className="col-header">
        <span className="ch-name">Model</span>
        <span className={`ch-r ${sortBy === "score" ? "ch-active" : ""}`}>Score</span>
        <span className={`ch-r ${sortBy === "size" ? "ch-active" : ""}`}>Size</span>
        <span className="ch-r">Context</span>
        <span className={`ch-r ${sortBy === "speed" ? "ch-active" : ""}`}>Speed</span>
        <span className="ch-c">Run</span>
        <span className="ch-c">Grade</span>
      </div>

      <div className="table-body">
        {rows.map((m) => {
          const r = ready ? bestEval(m, hw) : null;
          const mode = r?.mode ?? "no";
          const tks = r?.tks ?? null;
          const g = ready ? gradeInfo(tks, mode) : { letter: "?", color: "#555" };
          const bestV = m.variants[0]; // smallest for display

          return (
            <div key={m.name} className={`trow ${mode === "no" && ready ? "trow-off" : ""}`} onClick={() => nav(`/model/${slugify(m.name)}`)}>
              <div className="trow-name">
                <span className="t-name">{m.name}</span>
                <span className="t-params">{m.params_b}B</span>
              </div>
              <span className={`t-r t-mono t-bench ${sortBy === "score" ? "t-highlight" : ""}`} style={{ color: benchColor(m.bench) }}>{m.bench}</span>
              <span className={`t-r t-mono ${sortBy === "size" ? "t-highlight" : ""}`}>{bestV.file_gb} GB</span>
              <span className="t-r t-mono t-dim">{(m.context / 1024).toFixed(0)}K</span>
              <span className={`t-r t-mono t-tks ${sortBy === "speed" ? "t-highlight" : ""}`} style={{ color: tksColor(tks, mode) }}>
                {ready ? (tks !== null ? `~${tks} tok/s` : "—") : "—"}
              </span>
              <span className="t-c">{ready && <ModeIcon mode={mode} />}</span>
              <span className="t-c t-grade" style={{ color: g.color }}>{g.letter}</span>
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
  const hw = useContext(Hw);
  const { slug } = useParams();
  const nav = useNavigate();
  const ready = hw.vram > 0 || hw.ram > 0;
  const model = models.find((m) => slugify(m.name) === slug);
  if (!model) return <p style={{ color: "#888", padding: 40 }}>Model not found</p>;

  return (
    <div className="detail">
      <button className="back-btn" onClick={() => nav("/")}>← Back</button>

      <div className="d-hero">
        <h2>{model.name}</h2>
        <div className="d-chips">
          <span className="d-chip">{model.params_b}B params</span>
          <span className="d-chip">{(model.context / 1024).toFixed(0)}K context</span>
          <span className="d-chip d-chip-score" style={{ borderColor: benchColor(model.bench), color: benchColor(model.bench) }}>
            Score: {model.bench}
          </span>
        </div>
      </div>

      <div className="d-table">
        <div className="d-thead">
          <span>Quant</span>
          <span>File</span>
          <span>VRAM</span>
          <span>Speed</span>
          <span>Run</span>
          <span>Grade</span>
        </div>
        {model.variants.map((v) => {
          const r = ready
            ? evaluate(v, hw.vram, hw.gpuBw, hw.ram, hw.ramBw, model.config, CTX)
            : { mode: "no" as RunMode, tks: null, vram_needed: totalVram(v, model.config, CTX) };
          const g = ready ? gradeInfo(r.tks, r.mode) : { letter: "?", color: "#555" };

          return (
            <div key={v.quant} className={`d-row ${r.mode === "no" && ready ? "d-row-off" : ""}`}>
              <span className="d-quant">{v.quant}</span>
              <span>{v.file_gb} GB</span>
              <span>{r.vram_needed} GB</span>
              <span className="d-tks" style={{ color: tksColor(r.tks, r.mode) }}>
                {r.tks !== null ? `~${r.tks} tok/s` : "—"}
              </span>
              <span className="d-mode"><ModeIcon mode={r.mode} /></span>
              <span className="d-grade" style={{ color: g.color }}>{g.letter}</span>
            </div>
          );
        })}
      </div>

      <div className="d-legend">
        <span><span className="mode-icon">⚡</span> GPU</span>
        <span><span className="mode-icon">🐢</span> CPU (slow)</span>
        <span><span className="mode-icon mode-no">✕</span> Can't run</span>
        <span className="d-bench-note">Score ≈ MMLU benchmark (higher = smarter)</span>
      </div>

      <div className="d-links">
        {model.hf && <a href={`https://huggingface.co/${model.hf}`} target="_blank" rel="noopener" className="d-link">🤗 Base Model</a>}
        {model.gguf && <a href={`https://huggingface.co/${model.gguf}`} target="_blank" rel="noopener" className="d-link">📦 GGUF Files</a>}
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
  const gpuBw = gpu ? (guessGpuBandwidth(gpu.gpuName) ?? 0) : 0;
  const ram = gpu?.ram_gb ?? 0;
  const ramBw = guessRamBandwidth();

  return (
    <Hw.Provider value={{ vram, gpuBw, ram, ramBw }}>
      <HashRouter>
        <div className="app">
          <header>
            <h1>Can I Run This LLM?</h1>
            <p className="sub">Find out which LLMs your machine can actually run.</p>
          </header>
          <div className="hw-bar">
            {loading ? (
              <span className="hw-detecting">Detecting hardware…</span>
            ) : (
              <>
                <div className="hw-item"><span className="hw-icon">⬡</span><span className="hw-val">{gpu?.gpuName ?? "Unknown"}</span></div>
                {vram > 0 && <div className="hw-item"><span className="hw-label">VRAM</span><span className="hw-val">{vram} GB</span></div>}
                {ram > 0 && <div className="hw-item"><span className="hw-label">RAM</span><span className="hw-val">{ram} GB</span></div>}
                {gpuBw > 0 && <div className="hw-item"><span className="hw-label">BW</span><span className="hw-val">~{gpuBw} GB/s</span></div>}
                <span className="hw-badge">WebGPU</span>
              </>
            )}
          </div>
          <p className="hw-note">Estimates based on browser APIs. Actual specs may vary.</p>
          <Routes>
            <Route path="/" element={<ListPage />} />
            <Route path="/model/:slug" element={<DetailPage />} />
          </Routes>
          <footer>⚡ GPU · 🐢 CPU · Score ≈ MMLU · Speed = theoretical (memory-bandwidth bound)</footer>
        </div>
      </HashRouter>
    </Hw.Provider>
  );
}

export default App;
