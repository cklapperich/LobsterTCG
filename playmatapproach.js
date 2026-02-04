import { useState, useRef, useCallback, useEffect } from "react";

const PRESETS = {
  empty: {
    name: "Empty",
    aspectRatio: [3, 2],
    bg: "#1a3a1a",
    zones: []
  },
  standard: {
    name: "Standard Duel",
    aspectRatio: [3, 2],
    bg: "#1a3a1a",
    zones: [
      { id: "deck", label: "Deck", x: 82, y: 70, w: 12, h: 22, color: "#2d5a3d", border: "#4a8a5a" },
      { id: "discard", label: "Discard", x: 82, y: 40, w: 12, h: 22, color: "#5a2d2d", border: "#8a4a4a" },
      { id: "hand", label: "Hand", x: 15, y: 72, w: 60, h: 22, color: "#2d3d5a", border: "#4a5a8a" },
      { id: "field1", label: "Slot 1", x: 5, y: 38, w: 14, h: 24, color: "#3d3d2d", border: "#6a6a4a" },
      { id: "field2", label: "Slot 2", x: 22, y: 38, w: 14, h: 24, color: "#3d3d2d", border: "#6a6a4a" },
      { id: "field3", label: "Slot 3", x: 39, y: 38, w: 14, h: 24, color: "#3d3d2d", border: "#6a6a4a" },
      { id: "field4", label: "Slot 4", x: 56, y: 38, w: 14, h: 24, color: "#3d3d2d", border: "#6a6a4a" },
      { id: "hero", label: "Hero", x: 35, y: 6, w: 18, h: 26, color: "#5a3d5a", border: "#8a5a8a" },
      { id: "spell1", label: "Spell 1", x: 5, y: 8, w: 12, h: 22, color: "#2d4a5a", border: "#4a7a8a" },
      { id: "spell2", label: "Spell 2", x: 20, y: 8, w: 12, h: 22, color: "#2d4a5a", border: "#4a7a8a" },
      { id: "spell3", label: "Spell 3", x: 56, y: 8, w: 12, h: 22, color: "#2d4a5a", border: "#4a7a8a" },
      { id: "spell4", label: "Spell 4", x: 71, y: 8, w: 12, h: 22, color: "#2d4a5a", border: "#4a7a8a" },
    ]
  },
  tcg: {
    name: "TCG Classic",
    aspectRatio: [16, 9],
    bg: "#1a1a2e",
    zones: [
      { id: "deck", label: "Deck", x: 85, y: 55, w: 10, h: 30, color: "#2e1a3e", border: "#6a3a8a" },
      { id: "graveyard", label: "Grave", x: 85, y: 15, w: 10, h: 30, color: "#3e1a1a", border: "#8a3a3a" },
      { id: "hand", label: "Hand", x: 10, y: 70, w: 65, h: 24, color: "#1a2e3e", border: "#3a6a8a" },
      { id: "m1", label: "Mon 1", x: 5, y: 22, w: 11, h: 28, color: "#2e2e1a", border: "#6a6a3a" },
      { id: "m2", label: "Mon 2", x: 19, y: 22, w: 11, h: 28, color: "#2e2e1a", border: "#6a6a3a" },
      { id: "m3", label: "Mon 3", x: 33, y: 22, w: 11, h: 28, color: "#2e2e1a", border: "#6a6a3a" },
      { id: "m4", label: "Mon 4", x: 47, y: 22, w: 11, h: 28, color: "#2e2e1a", border: "#6a6a3a" },
      { id: "m5", label: "Mon 5", x: 61, y: 22, w: 11, h: 28, color: "#2e2e1a", border: "#6a6a3a" },
      { id: "extra", label: "Extra", x: 2, y: 55, w: 10, h: 30, color: "#1a3e2e", border: "#3a8a6a" },
    ]
  }
};

const COLORS = ["#2d5a3d","#5a2d2d","#2d3d5a","#3d3d2d","#5a3d5a","#2d4a5a","#4a3d2d","#2d5a5a"];
const BORDERS = ["#4a8a5a","#8a4a4a","#4a5a8a","#6a6a4a","#8a5a8a","#4a7a8a","#7a5a3a","#4a8a8a"];

let idCounter = 0;

function PlaymatCanvas({ mat, selected, onSelect, onMove, onResize, scale }) {
  const [ar_w, ar_h] = mat.aspectRatio;
  const ref = useRef(null);
  const dragRef = useRef(null);

  const getPercent = useCallback((e) => {
    const r = ref.current.getBoundingClientRect();
    return { px: ((e.clientX - r.left) / r.width) * 100, py: ((e.clientY - r.top) / r.height) * 100 };
  }, []);

  const onMouseDown = useCallback((e, zone, mode) => {
    e.stopPropagation();
    e.preventDefault();
    const { px, py } = getPercent(e);
    dragRef.current = { zone: zone.id, mode, startPx: px, startPy: py, ox: zone.x, oy: zone.y, ow: zone.w, oh: zone.h };
    onSelect(zone.id);
  }, [getPercent, onSelect]);

  useEffect(() => {
    const onMM = (e) => {
      if (!dragRef.current) return;
      const { px, py } = getPercent(e);
      const d = dragRef.current;
      const dx = px - d.startPx, dy = py - d.startPy;
      if (d.mode === "move") {
        onMove(d.zone, Math.max(0, Math.min(100 - d.ow, d.ox + dx)), Math.max(0, Math.min(100 - d.oh, d.oy + dy)));
      } else {
        const nw = Math.max(5, d.ow + dx), nh = Math.max(5, d.oh + dy);
        onResize(d.zone, nw, nh);
      }
    };
    const onMU = () => { dragRef.current = null; };
    window.addEventListener("mousemove", onMM);
    window.addEventListener("mouseup", onMU);
    return () => { window.removeEventListener("mousemove", onMM); window.removeEventListener("mouseup", onMU); };
  }, [getPercent, onMove, onResize]);

  return (
    <div style={{ width: "100%", position: "relative" }}>
      <div
        ref={ref}
        onClick={() => onSelect(null)}
        style={{
          width: "100%",
          paddingBottom: `${(ar_h / ar_w) * 100}%`,
          background: mat.bg,
          borderRadius: 8,
          position: "relative",
          overflow: "hidden",
          boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
          cursor: "crosshair",
        }}
      >
        {/* Grid overlay */}
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", opacity: 0.08 }}>
          {[10,20,30,40,50,60,70,80,90].map(v => (
            <g key={v}>
              <line x1={`${v}%`} y1="0" x2={`${v}%`} y2="100%" stroke="white" strokeWidth="1"/>
              <line x1="0" y1={`${v}%`} x2="100%" y2={`${v}%`} stroke="white" strokeWidth="1"/>
            </g>
          ))}
        </svg>

        {mat.zones.map(z => {
          const isSel = selected === z.id;
          return (
            <div
              key={z.id}
              onMouseDown={(e) => onMouseDown(e, z, "move")}
              style={{
                position: "absolute",
                left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%`,
                background: z.color || "#2d5a3d",
                border: `2px solid ${isSel ? "#fff" : (z.border || "#4a8a5a")}`,
                borderRadius: 6,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "grab",
                boxShadow: isSel ? "0 0 0 2px rgba(255,255,255,0.4), inset 0 0 20px rgba(255,255,255,0.05)" : "inset 0 0 20px rgba(0,0,0,0.2)",
                transition: "border-color 0.15s",
                userSelect: "none",
              }}
            >
              <span style={{
                color: "rgba(255,255,255,0.7)",
                fontSize: `max(9px, ${scale * 0.013}px)`,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: 1,
                textAlign: "center",
                pointerEvents: "none",
                textShadow: "0 1px 3px rgba(0,0,0,0.5)",
              }}>{z.label}</span>
              {isSel && (
                <div
                  onMouseDown={(e) => onMouseDown(e, z, "resize")}
                  style={{
                    position: "absolute", right: -4, bottom: -4, width: 10, height: 10,
                    background: "#fff", borderRadius: 2, cursor: "nwse-resize",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ZoneEditor({ zone, onChange, onDelete }) {
  return (
    <div style={{ padding: "10px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ color: "#aaa", fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>Selected Zone</span>
        <button onClick={onDelete} style={{ background: "#5a2020", color: "#ff8a8a", border: "none", borderRadius: 4, padding: "3px 10px", fontSize: 11, cursor: "pointer" }}>Delete</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <label style={{ gridColumn: "1/-1" }}>
          <span style={{ color: "#888", fontSize: 10 }}>Label</span>
          <input value={zone.label} onChange={e => onChange({ ...zone, label: e.target.value })}
            style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, padding: "4px 8px", color: "#eee", fontSize: 13, boxSizing: "border-box" }} />
        </label>
        <label style={{ gridColumn: "1/-1" }}>
          <span style={{ color: "#888", fontSize: 10 }}>ID</span>
          <input value={zone.id} onChange={e => onChange({ ...zone, id: e.target.value })}
            style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, padding: "4px 8px", color: "#eee", fontSize: 13, boxSizing: "border-box" }} />
        </label>
        {[["x","X %"],["y","Y %"],["w","W %"],["h","H %"]].map(([k,l]) => (
          <label key={k}>
            <span style={{ color: "#888", fontSize: 10 }}>{l}</span>
            <input type="number" value={Math.round(zone[k] * 10) / 10} onChange={e => onChange({ ...zone, [k]: +e.target.value })}
              style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, padding: "4px 8px", color: "#eee", fontSize: 13, boxSizing: "border-box" }} />
          </label>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [mat, setMat] = useState(PRESETS.standard);
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState("visual");
  const [jsonText, setJsonText] = useState("");
  const containerRef = useRef(null);
  const [containerW, setContainerW] = useState(600);

  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      for (const e of entries) setContainerW(e.contentRect.width);
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const selectedZone = mat.zones.find(z => z.id === selected);

  const updateZone = (id, updates) => {
    setMat(m => ({ ...m, zones: m.zones.map(z => z.id === id ? (typeof updates === "object" && !updates.id ? { ...z, ...updates } : updates) : z) }));
  };

  const addZone = () => {
    const ci = mat.zones.length % COLORS.length;
    const nz = { id: `zone_${++idCounter}`, label: "New Zone", x: 40, y: 40, w: 20, h: 20, color: COLORS[ci], border: BORDERS[ci] };
    setMat(m => ({ ...m, zones: [...m.zones, nz] }));
    setSelected(nz.id);
  };

  const deleteZone = (id) => {
    setMat(m => ({ ...m, zones: m.zones.filter(z => z.id !== id) }));
    setSelected(null);
  };

  const exportJson = () => {
    const out = {
      name: mat.name,
      aspectRatio: `${mat.aspectRatio[0]}:${mat.aspectRatio[1]}`,
      background: mat.bg,
      zones: mat.zones.map(z => ({
        id: z.id, label: z.label,
        x: Math.round(z.x * 10) / 10, y: Math.round(z.y * 10) / 10,
        w: Math.round(z.w * 10) / 10, h: Math.round(z.h * 10) / 10,
        color: z.color, border: z.border,
      }))
    };
    return JSON.stringify(out, null, 2);
  };

  const importJson = (txt) => {
    try {
      const obj = JSON.parse(txt);
      const ar = obj.aspectRatio?.split(":").map(Number) || [3, 2];
      setMat({
        name: obj.name || "Imported",
        aspectRatio: ar,
        bg: obj.background || "#1a3a1a",
        zones: (obj.zones || []).map(z => ({
          id: z.id, label: z.label, x: z.x, y: z.y, w: z.w, h: z.h,
          color: z.color || "#2d5a3d", border: z.border || "#4a8a5a",
        }))
      });
      setSelected(null);
    } catch (e) { /* ignore bad json */ }
  };

  const isNarrow = containerW < 640;

  return (
    <div ref={containerRef} style={{ background: "#111", minHeight: "100vh", color: "#eee", fontFamily: "'Inter', system-ui, sans-serif", padding: 16 }}>
      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: -0.5 }}>Playmat Editor</h1>
        <p style={{ margin: "4px 0 0", color: "#666", fontSize: 12 }}>
          Fixed aspect ratio · percentage-based zones · uniform scaling
        </p>
      </div>

      {/* Preset bar */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ color: "#666", fontSize: 11, marginRight: 4 }}>PRESETS</span>
        {Object.entries(PRESETS).map(([k, v]) => (
          <button key={k} onClick={() => { setMat(v); setSelected(null); }}
            style={{ background: mat.name === v.name ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, padding: "4px 12px", color: "#ccc", fontSize: 12, cursor: "pointer" }}>
            {v.name}
          </button>
        ))}
        <span style={{ color: "#444", margin: "0 4px" }}>|</span>
        <span style={{ color: "#666", fontSize: 11, marginRight: 4 }}>RATIO</span>
        {[[3,2,"3:2"],[16,9,"16:9"],[4,3,"4:3"]].map(([w,h,l]) => (
          <button key={l} onClick={() => setMat(m => ({ ...m, aspectRatio: [w, h] }))}
            style={{ background: mat.aspectRatio[0] === w && mat.aspectRatio[1] === h ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, padding: "4px 10px", color: "#ccc", fontSize: 12, cursor: "pointer" }}>
            {l}
          </button>
        ))}
      </div>

      {/* Main layout */}
      <div style={{ display: "flex", flexDirection: isNarrow ? "column" : "row", gap: 12 }}>
        {/* Canvas */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <PlaymatCanvas
            mat={mat}
            selected={selected}
            onSelect={setSelected}
            scale={containerW * (isNarrow ? 1 : 0.68)}
            onMove={(id, x, y) => updateZone(id, { x, y })}
            onResize={(id, w, h) => updateZone(id, { w, h })}
          />
        </div>

        {/* Side panel */}
        <div style={{ width: isNarrow ? "100%" : 240, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={addZone}
            style={{ width: "100%", background: "rgba(80,160,120,0.2)", border: "1px solid rgba(80,160,120,0.3)", borderRadius: 6, padding: "8px 0", color: "#6dba8a", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            + Add Zone
          </button>

          {selectedZone && (
            <ZoneEditor
              zone={selectedZone}
              onChange={(z) => updateZone(selected, z)}
              onDelete={() => deleteZone(selected)}
            />
          )}

          {/* Zone list */}
          <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 1, marginTop: 4 }}>
            Zones ({mat.zones.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 180, overflowY: "auto" }}>
            {mat.zones.map(z => (
              <div key={z.id} onClick={() => setSelected(z.id)}
                style={{
                  padding: "5px 8px", borderRadius: 4, cursor: "pointer", fontSize: 12,
                  background: selected === z.id ? "rgba(255,255,255,0.08)" : "transparent",
                  border: `1px solid ${selected === z.id ? "rgba(255,255,255,0.15)" : "transparent"}`,
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: z.color, border: `1px solid ${z.border}`, flexShrink: 0 }} />
                <span style={{ color: "#bbb" }}>{z.label}</span>
                <span style={{ color: "#555", marginLeft: "auto", fontSize: 10 }}>{z.id}</span>
              </div>
            ))}
          </div>

          {/* Tabs: Visual/JSON */}
          <div style={{ display: "flex", gap: 2, marginTop: 8 }}>
            {["visual", "json"].map(t => (
              <button key={t} onClick={() => { setTab(t); if (t === "json") setJsonText(exportJson()); }}
                style={{ flex: 1, padding: "5px 0", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, cursor: "pointer", borderRadius: 4, border: "1px solid rgba(255,255,255,0.1)", background: tab === t ? "rgba(255,255,255,0.08)" : "transparent", color: tab === t ? "#ddd" : "#666" }}>
                {t}
              </button>
            ))}
          </div>
          {tab === "json" && (
            <div>
              <textarea
                value={jsonText}
                onChange={e => setJsonText(e.target.value)}
                spellCheck={false}
                style={{ width: "100%", height: 180, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: 8, color: "#9ddbaa", fontSize: 10, fontFamily: "monospace", resize: "vertical", boxSizing: "border-box" }}
              />
              <button onClick={() => importJson(jsonText)}
                style={{ width: "100%", marginTop: 4, background: "rgba(80,120,160,0.2)", border: "1px solid rgba(80,120,160,0.3)", borderRadius: 4, padding: "6px 0", color: "#8ab8db", fontSize: 12, cursor: "pointer" }}>
                Import JSON
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}