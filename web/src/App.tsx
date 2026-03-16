import { useEffect, useState, createContext, useContext, useMemo } from "react";
import { HashRouter, Routes, Route, useNavigate, useParams } from "react-router-dom";
import { detectGpu, type GpuInfo } from "./lib/gpu";
import { guessGpuBandwidth, guessRamBandwidth } from "./lib/bandwidth";
import { evaluate, totalVram, type Model, type RunMode, type RunInfo } from "./lib/calc";
import { PRESETS } from "./lib/presets";
import modelsData from "./data/models.json";
import "./App.css";

const models = modelsData as Model[];
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const CTX = 4096;
const COMFORTABLE_TKS = 8; // minimum comfortable speed

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

/** Find the smartest model that runs comfortably (>=8 tok/s GPU) with optional tag filter */
function recommend(hw: HwCtx, tag?: string): { model: Model; info: RunInfo; variant: string } | null {
  const ready = hw.vram > 0 || hw.ram > 0;
  if (!ready) return null;

  let best: { model: Model; info: RunInfo; variant: string } | null = null;

  for (const m of models) {
    if (tag && !m.tags.includes(tag)) continue;

    // Try all variants, find best GPU one with comfortable speed
    for (let i = m.variants.length - 1; i >= 0; i--) {
      const r = evaluate(m.variants[i], hw.vram, hw.gpuBw, hw.ram, hw.ramBw, m.config, CTX);
      if (r.mode === "gpu" && r.tks !== null && r.tks >= COMFORTABLE_TKS) {
        if (!best || m.bench > best.model.bench || (m.bench === best.model.bench && (r.tks ?? 0) > (best.info.tks ?? 0))) {
          best = { model: m, info: r, variant: m.variants[i].quant };
        }
        break; // found best variant for this model
      }
    }
  }
  return best;
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

function benchColor(s: number): string {
  if (s >= 85) return "#22c55e";
  if (s >= 75) return "#4ade80";
  if (s >= 65) return "#facc15";
  if (s >= 55) return "#fb923c";
  return "#ef4444";
}

function ModeIcon({ mode }: { mode: RunMode }) {
  if (mode === "gpu") return <span className="mode-icon" title="GPU inference">⚡</span>;
  if (mode === "cpu") return <span className="mode-icon" title="CPU inference">🐢</span>;
  return <span className="mode-icon mode-no" title="Cannot run">✕</span>;
}

const TAG_LABEL: Record<string, { icon: string; name: string }> = {
  chat: { icon: "💬", name: "Chat" },
  code: { icon: "💻", name: "Code" },
  reasoning: { icon: "🧠", name: "Reasoning" },
};

type SortKey = "speed" | "size" | "score";

/* ── Recommendation Cards ────── */

function RecCard({ rec, label, icon, onClick }: {
  rec: { model: Model; info: RunInfo; variant: string } | null;
  label: string; icon: string;
  onClick: (m: Model) => void;
}) {
  if (!rec) return (
    <div className="rec-card rec-card-empty">
      <div className="rec-header"><span className="rec-icon">{icon}</span><span className="rec-label">{label}</span></div>
      <span className="rec-none">No model fits comfortably</span>
    </div>
  );

  const { model, info, variant } = rec;
  return (
    <div className="rec-card" onClick={() => onClick(model)}>
      <div className="rec-header"><span className="rec-icon">{icon}</span><span className="rec-label">{label}</span></div>
      <span className="rec-name">{model.name}</span>
      <div className="rec-stats">
        <span className="rec-tks" style={{ color: tksColor(info.tks, info.mode) }}>
          ⚡ ~{info.tks} tok/s
        </span>
        <span className="rec-bench" style={{ color: benchColor(model.bench) }}>
          Score {model.bench}
        </span>
        <span className="rec-quant">{variant}</span>
      </div>
    </div>
  );
}

/* ── List Page ────────────────── */

function ListPage() {
  const hw = useContext(Hw);
  const nav = useNavigate();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("score");
  const ready = hw.vram > 0 || hw.ram > 0;

  const recAll = useMemo(() => recommend(hw), [hw]);
  const recChat = useMemo(() => recommend(hw, "chat"), [hw]);
  const recCode = useMemo(() => recommend(hw, "code"), [hw]);
  const recReason = useMemo(() => recommend(hw, "reasoning"), [hw]);

  const goModel = (m: Model) => nav(`/model/${slugify(m.name)}`);

  const { runnable: runnableRows, cantRun: cantRunRows } = useMemo(() => {
    const filtered = models.filter((m) =>
      m.name.toLowerCase().includes(search.toLowerCase())
    );

    const sortFn = (a: Model, b: Model) => {
      if (sortBy === "speed") {
        if (ready) {
          const ra = bestEval(a, hw), rb = bestEval(b, hw);
          const mr = { gpu: 0, cpu: 1, no: 2 };
          if (mr[ra.mode] !== mr[rb.mode]) return mr[ra.mode] - mr[rb.mode];
          return (rb.tks ?? -1) - (ra.tks ?? -1);
        }
        return (b.bench / b.variants[0].file_gb) - (a.bench / a.variants[0].file_gb);
      }
      if (sortBy === "size") return a.variants[0].file_gb - b.variants[0].file_gb;
      if (b.bench !== a.bench) return b.bench - a.bench;
      return a.params_b - b.params_b;
    };

    if (!ready) return { runnable: [...filtered].sort(sortFn), cantRun: [] as Model[] };

    const run: Model[] = [];
    const no: Model[] = [];
    for (const m of filtered) {
      const r = bestEval(m, hw);
      if (r.mode === "no") no.push(m); else run.push(m);
    }
    return { runnable: run.sort(sortFn), cantRun: no.sort(sortFn) };
  }, [hw, search, sortBy, ready]);

  return (
    <>
      {/* Recommendations */}
      {ready && (
        <div className="rec-section">
          <h2 className="rec-title">Recommended for you</h2>
          <div className="rec-grid">
            <RecCard rec={recAll} label="Best Overall" icon="🏆" onClick={goModel} />
            <RecCard rec={recChat} label="Chat" icon="💬" onClick={goModel} />
            <RecCard rec={recCode} label="Code" icon="💻" onClick={goModel} />
            <RecCard rec={recReason} label="Reasoning" icon="🧠" onClick={goModel} />
          </div>
        </div>
      )}

      {/* Filters */}
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

      {/* Table */}
      <div className="col-header">
        <span className="ch-name">Model</span>
        <span className={`ch-r ${sortBy === "score" ? "ch-active" : ""}`}>Score</span>
        <span className={`ch-r ${sortBy === "size" ? "ch-active" : ""}`}>Size</span>
        <span className="ch-r">Ctx</span>
        <span className={`ch-r ${sortBy === "speed" ? "ch-active" : ""}`}>Speed</span>
        <span className="ch-c">Run</span>
        <span className="ch-c">Grade</span>
      </div>

      <div className="table-body">
        {runnableRows.map((m) => {
          const r = bestEval(m, hw);
          const g = gradeInfo(r.tks, r.mode);
          return (
            <div key={m.name} className="trow" onClick={() => goModel(m)}>
              <div className="trow-name">
                <span className="t-name">{m.name}</span>
                <div className="t-tags">
                  {m.tags.map((t) => <span key={t} className="t-tag" title={TAG_LABEL[t]?.name}>{TAG_LABEL[t]?.icon}</span>)}
                </div>
              </div>
              <span className={`t-r t-mono t-bench ${sortBy === "score" ? "t-hl" : ""}`} style={{ color: benchColor(m.bench) }}>{m.bench}</span>
              <span className={`t-r t-mono ${sortBy === "size" ? "t-hl" : ""}`}>{m.variants[0].file_gb} GB</span>
              <span className="t-r t-mono t-dim">{(m.context / 1024).toFixed(0)}K</span>
              <span className={`t-r t-mono t-tks ${sortBy === "speed" ? "t-hl" : ""}`} style={{ color: tksColor(r.tks, r.mode) }}>
                {r.tks !== null ? `~${r.tks}` : "—"}
              </span>
              <span className="t-c"><ModeIcon mode={r.mode} /></span>
              <span className="t-c t-grade" style={{ color: g.color }}>{g.letter}</span>
              <span className="t-arrow">›</span>
            </div>
          );
        })}
      </div>

      {ready && cantRunRows.length > 0 && (
        <>
          <div className="cant-run-divider">
            <span>Can't run on this device ({cantRunRows.length})</span>
          </div>
          <div className="table-body table-body-off">
            {cantRunRows.map((m) => (
              <div key={m.name} className="trow trow-off" onClick={() => goModel(m)}>
                <div className="trow-name">
                  <span className="t-name">{m.name}</span>
                  <div className="t-tags">
                    {m.tags.map((t) => <span key={t} className="t-tag" title={TAG_LABEL[t]?.name}>{TAG_LABEL[t]?.icon}</span>)}
                  </div>
                </div>
                <span className="t-r t-mono t-bench" style={{ color: benchColor(m.bench) }}>{m.bench}</span>
                <span className="t-r t-mono">{m.variants[0].file_gb} GB</span>
                <span className="t-r t-mono t-dim">{(m.context / 1024).toFixed(0)}K</span>
                <span className="t-r t-mono" style={{ color: "#ef4444" }}>✕</span>
                <span className="t-c"><ModeIcon mode="no" /></span>
                <span className="t-c t-grade" style={{ color: "#ef4444" }}>F</span>
                <span className="t-arrow">›</span>
              </div>
            ))}
          </div>
        </>
      )}
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
          <span className="d-chip">{(model.context / 1024).toFixed(0)}K ctx</span>
          <span className="d-chip d-chip-score" style={{ borderColor: benchColor(model.bench), color: benchColor(model.bench) }}>
            Score {model.bench}
          </span>
          {model.tags.map((t) => (
            <span key={t} className="d-chip">{TAG_LABEL[t]?.icon} {TAG_LABEL[t]?.name}</span>
          ))}
        </div>
      </div>

      <div className="d-table">
        <div className="d-thead">
          <span>Quant</span><span>File</span><span>VRAM</span><span>Speed</span><span>Run</span><span>Grade</span>
        </div>
        {model.variants.map((v) => {
          const r = ready ? evaluate(v, hw.vram, hw.gpuBw, hw.ram, hw.ramBw, model.config, CTX)
            : { mode: "no" as RunMode, tks: null, vram_needed: totalVram(v, model.config, CTX) };
          const g = ready ? gradeInfo(r.tks, r.mode) : { letter: "?", color: "#555" };
          return (
            <div key={v.quant} className={`d-row ${r.mode === "no" && ready ? "d-row-off" : ""}`}>
              <span className="d-quant">{v.quant}</span>
              <span>{v.file_gb} GB</span>
              <span>{r.vram_needed} GB</span>
              <span className="d-tks" style={{ color: tksColor(r.tks, r.mode) }}>{r.tks ? `~${r.tks} tok/s` : "—"}</span>
              <span className="d-mode"><ModeIcon mode={r.mode} /></span>
              <span className="d-grade" style={{ color: g.color }}>{g.letter}</span>
            </div>
          );
        })}
      </div>

      <div className="d-legend">
        <span>⚡ GPU</span><span>🐢 CPU</span><span className="mode-no">✕ Can't run</span>
        <span className="d-bench-note">Score ≈ MMLU (higher = smarter)</span>
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
  const [presetIdx, setPresetIdx] = useState<number | null>(null);

  useEffect(() => { detectGpu().then((i) => { setGpu(i); setLoading(false); }); }, []);

  // If preset selected, use it. Otherwise use detected values.
  const preset = presetIdx !== null ? PRESETS[presetIdx] : null;
  const vram = preset ? preset.vram : (gpu?.vram_gb ?? 0);
  const gpuBw = preset ? preset.bw : (gpu ? (guessGpuBandwidth(gpu.gpuName) ?? 0) : 0);
  const ram = preset ? preset.ram : (gpu?.ram_gb ?? 0);
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
            {loading ? <span className="hw-detecting">Detecting hardware…</span> : (
              <>
                <select className="hw-preset" value={presetIdx ?? ""} onChange={(e) => {
                  const v = e.target.value;
                  setPresetIdx(v === "" ? null : Number(v));
                }}>
                  <option value="">{gpu?.detected ? `${gpu.gpuName} (detected)` : "Select your device…"}</option>
                  {(() => {
                    const cats = [...new Set(PRESETS.map(p => p.category))];
                    return cats.map(cat => (
                      <optgroup key={cat} label={cat}>
                        {PRESETS.map((p, i) => p.category === cat ? <option key={i} value={i}>{p.label}</option> : null)}
                      </optgroup>
                    ));
                  })()}
                </select>
                <div className="hw-specs">
                  {vram > 0 && <span className="hw-spec"><span className="hw-label">VRAM</span> {vram} GB</span>}
                  {ram > 0 && <span className="hw-spec"><span className="hw-label">RAM</span> {ram} GB</span>}
                  {gpuBw > 0 && <span className="hw-spec"><span className="hw-label">BW</span> ~{gpuBw} GB/s</span>}
                </div>
              </>
            )}
          </div>
          <p className="hw-note">Select a device or use auto-detected specs. Estimates are approximate.</p>
          <Routes>
            <Route path="/" element={<ListPage />} />
            <Route path="/model/:slug" element={<DetailPage />} />
          </Routes>
          <footer>⚡ GPU · 🐢 CPU · Score ≈ MMLU · Speed = theoretical</footer>
        </div>
      </HashRouter>
    </Hw.Provider>
  );
}

export default App;
