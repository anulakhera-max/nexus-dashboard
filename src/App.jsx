import { useState, useEffect, useCallback } from "react";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

const seedEvents = [
  { id: 1, category: "conflict", severity: "critical", title: "Russia-Ukraine War — Ongoing Offensive Operations", location: "Eastern Ukraine / Black Sea Region", summary: "Continued missile strikes on energy infrastructure. Black Sea grain corridor under pressure. European energy markets on edge.", commodities: ["Natural Gas", "Wheat", "Sunflower Oil", "Steel"], region: "europe" },
  { id: 2, category: "conflict", severity: "critical", title: "Middle East — Multi-Front Tensions Escalate", location: "Israel / Gaza / Red Sea", summary: "Houthi attacks disrupting Red Sea shipping. Suez Canal traffic at 5-year low. Insurance premiums spiking 200%+.", commodities: ["Crude Oil", "LNG", "Container Shipping", "Aluminum"], region: "middleeast" },
  { id: 3, category: "weather", severity: "high", title: "El Niño — Severe Drought Across Southern Asia", location: "India, Thailand, Vietnam, Philippines", summary: "Rice paddy yields projected down 18%. Water reservoirs critically low. Power generation from hydro dropping sharply.", commodities: ["Rice", "Palm Oil", "Rubber", "Electricity"], region: "asia" },
  { id: 4, category: "diplomatic", severity: "high", title: "US-China Tech War — Semiconductor Export Controls", location: "Global / Taiwan Strait", summary: "CHIPS Act restrictions on advanced node chips. China retaliation via rare earth export limits. Taiwan remains flashpoint.", commodities: ["Semiconductors", "Gallium", "Germanium", "Cobalt"], region: "asia" },
  { id: 5, category: "weather", severity: "critical", title: "Amazon Basin — Record Drought & Wildfires", location: "Brazil, Bolivia, Peru", summary: "Amazon River at historic lows. Soybean and coffee harvest forecasts reduced 22%. Wildfire smoke impacting air quality.", commodities: ["Soybeans", "Coffee", "Beef", "Timber"], region: "latam" },
  { id: 6, category: "economic", severity: "high", title: "Panama Canal — Drought Reduces Capacity 36%", location: "Panama / Pacific Routes", summary: "Canal capacity down 36%. LNG tankers rerouting via Cape Horn adding 20+ days. Freight costs surging.", commodities: ["LNG", "Grain", "Coal", "Auto Parts"], region: "latam" },
  { id: 7, category: "diplomatic", severity: "medium", title: "BRICS Expansion — De-Dollarization Push", location: "Global / Emerging Markets", summary: "Saudi Arabia, UAE, Ethiopia joining BRICS. New currency settlement frameworks challenge USD dominance in commodity trade.", commodities: ["Gold", "Oil", "Grain Futures", "USD"], region: "global" },
  { id: 8, category: "tech", severity: "medium", title: "AI Data Center Boom — Power Grid Strain", location: "USA, Europe, Southeast Asia", summary: "Hyperscaler capex reaching $200B+. Power grid constraints in key markets. Copper demand projections revised upward 40%.", commodities: ["Copper", "Electricity", "Natural Gas", "Water"], region: "northamerica" },
  { id: 9, category: "weather", severity: "high", title: "European Winter — Gas Storage Below Average", location: "Germany, France, UK, Netherlands", summary: "Cold snap incoming with storage 8% below 5-year average. LNG spot prices rising. Industrial curtailments possible.", commodities: ["Natural Gas", "LNG", "Coal", "Electricity"], region: "europe" },
  { id: 10, category: "economic", severity: "high", title: "China Property Crisis — Steel Demand Collapse", location: "China / Global Commodities", summary: "Steel demand projections cut 12%. Iron ore futures tumbling. Construction slowdown rippling through global supply chains.", commodities: ["Iron Ore", "Steel", "Copper", "Nickel"], region: "asia" },
  { id: 11, category: "health", severity: "medium", title: "Avian Flu H5N1 — Global Poultry Disruption", location: "USA, Europe, Asia", summary: "Over 90M birds culled globally. Egg prices up 65% YoY. Dairy cattle infections expanding in North America.", commodities: ["Poultry", "Eggs", "Feed Grain", "Milk"], region: "global" },
  { id: 12, category: "conflict", severity: "high", title: "Sudan Civil War — Grain Belt Devastation", location: "Sudan, South Sudan", summary: "Agricultural regions destroyed. 18M facing famine. Nile River access disputed. Aid convoys blocked.", commodities: ["Wheat", "Sorghum", "Aid Logistics", "Humanitarian Supply"], region: "africa" },
];

const catColors = { weather: "#00d4ff", conflict: "#ff2d55", diplomatic: "#ffb800", tech: "#b24fff", economic: "#39ff14", health: "#ff6b35" };
const catLabels = { weather: "🌊 WEATHER", conflict: "⚔ CONFLICT", diplomatic: "🏛 DIPLOMATIC", economic: "💹 ECONOMIC", tech: "⚡ TECH", health: "🧬 HEALTH" };
const sevColors = { critical: "#ff2d55", high: "#ffb800", medium: "#00d4ff", low: "#39ff14" };

async function callClaude(prompt, maxTokens = 900) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content?.[0]?.text || "";
}

function parseJSON(text) {
  const m = text.match(/[\[{][\s\S]*[\]}]/);
  try { return m ? JSON.parse(m[0]) : null; } catch { return null; }
}

const S = {
  app: { fontFamily: "'Segoe UI', sans-serif", background: "#03060d", color: "#c8dff0", height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" },
  topbar: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", background: "linear-gradient(90deg,#020a14,#03101f,#020a14)", borderBottom: "1px solid #1a2d47", flexShrink: 0 },
  logo: { fontFamily: "monospace", fontWeight: 900, fontSize: 22, letterSpacing: 6, color: "#00d4ff", textShadow: "0 0 20px rgba(0,212,255,0.4)" },
  body: { display: "flex", flex: 1, overflow: "hidden" },
  sidebar: { width: 250, background: "#080f1a", borderRight: "1px solid #1a2d47", display: "flex", flexDirection: "column", overflow: "hidden", flexShrink: 0 },
  sideScroll: { overflowY: "auto", flex: 1, padding: "12px 0" },
  sectionLabel: { fontSize: 10, letterSpacing: 4, textTransform: "uppercase", color: "#4a6d8c", padding: "12px 16px 6px", fontFamily: "monospace" },
  filterBtn: (active) => ({ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 16px", background: active ? "rgba(0,212,255,0.07)" : "transparent", border: "none", borderLeft: active ? "2px solid #00d4ff" : "2px solid transparent", color: active ? "#00d4ff" : "#4a6d8c", fontSize: 12, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }),
  main: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  queryBar: { display: "flex", gap: 10, padding: "12px 16px", background: "#080f1a", borderBottom: "1px solid #1a2d47", flexShrink: 0 },
  input: { flex: 1, background: "#0d1829", border: "1px solid #1a2d47", borderRadius: 3, padding: "9px 14px", color: "#e8f4ff", fontSize: 12, fontFamily: "monospace", outline: "none" },
  btnPrimary: (dis) => ({ background: dis ? "#1a2d47" : "#00d4ff", color: dis ? "#4a6d8c" : "#03060d", border: "none", borderRadius: 3, padding: "9px 18px", fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", cursor: dis ? "not-allowed" : "pointer", fontFamily: "monospace", whiteSpace: "nowrap" }),
  btnSecondary: { background: "transparent", color: "#ff6b35", border: "1px solid #ff6b35", borderRadius: 3, padding: "9px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", cursor: "pointer", fontFamily: "monospace" },
  tabs: { display: "flex", borderBottom: "1px solid #1a2d47", background: "#080f1a", flexShrink: 0 },
  tab: (active) => ({ padding: "10px 16px", cursor: "pointer", color: active ? "#00d4ff" : "#4a6d8c", borderBottom: active ? "2px solid #00d4ff" : "2px solid transparent", fontSize: 11, letterSpacing: 2, fontFamily: "monospace", background: "none", border: "none", borderBottom: active ? "2px solid #00d4ff" : "2px solid transparent" }),
  contentArea: { flex: 1, overflowY: "auto", padding: 16 },
  card: (cat, sel) => ({ background: sel ? "#0d1829" : "#080f1a", border: `1px solid ${sel ? "#00d4ff" : "#1a2d47"}`, borderLeft: `3px solid ${catColors[cat] || "#4a6d8c"}`, borderRadius: 4, padding: 14, cursor: "pointer", marginBottom: 10 }),
  badge: (sev) => ({ fontSize: 9, padding: "2px 7px", borderRadius: 2, fontFamily: "monospace", fontWeight: 700, background: `${sevColors[sev]}22`, color: sevColors[sev], border: `1px solid ${sevColors[sev]}55` }),
  tag: (hot) => ({ fontSize: 10, padding: "2px 8px", background: "#0d1829", border: `1px solid ${hot ? "#ff2d5544" : "#1a2d47"}`, borderRadius: 2, color: hot ? "#ff2d55" : "#4a6d8c", fontFamily: "monospace" }),
  panel: { width: 320, background: "#080f1a", borderLeft: "1px solid #1a2d47", display: "flex", flexDirection: "column", overflow: "hidden", flexShrink: 0 },
  panelHeader: { padding: "12px 16px", background: "#0d1829", borderBottom: "1px solid #1a2d47", fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: "#00d4ff", fontFamily: "monospace", flexShrink: 0 },
  panelBody: { flex: 1, overflowY: "auto", padding: 14 },
  loading: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, gap: 10 },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 },
  insightCard: { background: "#0d1829", border: "1px solid #1a2d47", borderRadius: 3, padding: 12 },
  ticker: { borderTop: "1px solid #1a2d47", background: "#0d1829", height: 28, display: "flex", alignItems: "center", overflow: "hidden", flexShrink: 0 },
};

function Spinner() {
  return (
    <div style={S.loading}>
      <div style={{ width: 180, height: 2, background: "#1a2d47", borderRadius: 1, overflow: "hidden", position: "relative" }}>
        <div style={{ position: "absolute", top: 0, height: "100%", width: "40%", background: "linear-gradient(90deg,transparent,#00d4ff,transparent)", animation: "slide 1.4s infinite" }} />
      </div>
      <div style={{ fontFamily: "monospace", fontSize: 11, color: "#4a6d8c", animation: "blink 1s step-end infinite" }}>PROCESSING...</div>
    </div>
  );
}

function EventCard({ event, selected, onClick }) {
  return (
    <div style={S.card(event.category, selected)} onClick={onClick}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: 3, color: catColors[event.category], fontFamily: "monospace", marginBottom: 3 }}>{catLabels[event.category]}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#e8f4ff", lineHeight: 1.3 }}>{event.title}</div>
        </div>
        <span style={S.badge(event.severity)}>{event.severity.toUpperCase()}</span>
      </div>
      <div style={{ fontSize: 10, color: "#4a6d8c", fontFamily: "monospace", marginBottom: 6 }}>📍 {event.location}</div>
      <div style={{ fontSize: 11, color: "#c8dff0", lineHeight: 1.5, marginBottom: 8 }}>{event.summary}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {event.commodities.map((c, i) => <span key={c} style={S.tag(i < 2)}>{c}</span>)}
      </div>
    </div>
  );
}

function AnalysisSection({ title, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, letterSpacing: 3, color: "#00d4ff", fontFamily: "monospace", borderBottom: "1px solid #1a2d47", paddingBottom: 5, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

export default function NexusDashboard() {
  const [events, setEvents] = useState(seedEvents);
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState("events");
  const [query, setQuery] = useState("");
  const [analysisHtml, setAnalysisHtml] = useState(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [predictions, setPredictions] = useState(null);
  const [supplyData, setSupplyData] = useState(null);
  const [sourcesData, setSourcesData] = useState(null);
  const [loadingTab, setLoadingTab] = useState(false);
  const [clock, setClock] = useState("");
  const [tickerItems, setTickerItems] = useState([]);
  const [apiError, setApiError] = useState(null);

  useEffect(() => {
    const tick = () => setClock(new Date().toUTCString().split(" ")[4] + " UTC");
    tick(); const iv = setInterval(tick, 1000); return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const items = events.flatMap(e => e.commodities.map((c, i) => ({ label: c, change: i < 2 ? `+${(Math.random()*7+1.5).toFixed(1)}%` : `-${(Math.random()*3+0.5).toFixed(1)}%`, up: i < 2 })));
    setTickerItems(items);
  }, [events]);

  const filtered = filter === "all" ? events : events.filter(e => e.category === filter);
  const criticals = events.filter(e => e.severity === "critical").length;

  const analyzeEvent = useCallback(async (ev) => {
    setSelected(ev); setLoading(true); setAnalysisHtml(null); setApiError(null);
    const prompt = `You are NEXUS, a global intelligence AI. Analyze this world event for commodity/market impact:

Event: ${ev.title}
Location: ${ev.location}
Category: ${ev.category} | Severity: ${ev.severity}
Summary: ${ev.summary}
Affected Commodities: ${ev.commodities.join(", ")}

Respond with these sections (use ### header before each):

### INTEL BRIEF
2-3 sentences on geopolitical/economic significance with specific figures.

### CRITICAL SHORTAGES
3-4 specific items running short due to this event with % estimates.

### SOURCE ANALYSIS
For each shortage: Item → Primary Countries (share%) → Alternative Suppliers → Key Companies

### PRICE PREDICTIONS (30-90 days)
Format each line: CommodityName | UP/DOWN | +X% or -X% | High/Med/Low confidence
List 4-5 commodities with realistic numbers.

### SUPPLY CHAIN RISK
Key sectors disrupted and cascade effects in 2-3 sentences.

### INVESTMENT IMPLICATIONS
Specific sectors/ETFs likely to rise or fall. Be concise and specific.`;
    try {
      const text = await callClaude(prompt, 850);
      setAnalysisHtml(text);
    } catch (err) {
      setApiError(err.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { analyzeEvent(events[0]); }, []);

  const runQuery = async () => {
    if (!query.trim() || loading) return;
    setLoading(true); setAnalysisHtml(null); setApiError(null);
    const ctx = events.map(e => `[${e.category.toUpperCase()}/${e.severity.toUpperCase()}] ${e.title} (${e.location}): ${e.commodities.join(", ")}`).join("\n");
    const prompt = `You are NEXUS, a global intelligence AI. Answer this query based on current world events:\n\nQUERY: "${query}"\n\nACTIVE GLOBAL EVENTS:\n${ctx}\n\nProvide comprehensive intelligence analysis with ### headers. Include specific percentages, named source countries/companies, price predictions (Commodity | UP/DOWN | ±X% | Confidence), supply chain cascade effects, and actionable insights.`;
    try {
      const text = await callClaude(prompt, 900);
      setAnalysisHtml(text);
    } catch (err) {
      setApiError(err.message);
    }
    setLoading(false);
  };

  const scanEvents = async () => {
    setScanning(true);
    try {
      const prompt = `Generate a JSON array of 6 current world events (2025) affecting global commodities. Return ONLY valid JSON:\n[{"id":101,"category":"weather|conflict|diplomatic|economic|tech|health","severity":"critical|high|medium","title":"title","location":"location","summary":"2-3 sentences with specific data","commodities":["c1","c2","c3"],"region":"global|northamerica|europe|asia|middleeast|africa|latam"}]`;
      const text = await callClaude(prompt, 700);
      const newEvs = parseJSON(text);
      if (Array.isArray(newEvs)) setEvents([...seedEvents, ...newEvs.map((e, i) => ({ ...e, id: 100 + i }))]);
    } catch (err) { console.error(err); }
    setScanning(false);
  };

  const loadPredictions = async () => {
    if (predictions) return;
    setLoadingTab(true);
    try {
      const ctx = events.slice(0, 8).map(e => `${e.title}: ${e.commodities.join(", ")}`).join("\n");
      const prompt = `Based on these active world events:\n${ctx}\n\nReturn ONLY JSON:\n{"topCommodity":"name","topReason":"reason","priceIndex":"72","topRegion":"Middle East","regionReason":"reason","alerts":"5","items":[{"commodity":"name","direction":"up","change":"+8%","confidence":"high","driver":"brief driver","source":"country","timeframe":"45 days"}]}\nInclude 10 commodity items, realistic mix of up/down.`;
      const text = await callClaude(prompt, 700);
      setPredictions(parseJSON(text));
    } catch (err) { console.error(err); }
    setLoadingTab(false);
  };

  const loadSupply = async () => {
    if (supplyData) return;
    setLoadingTab(true);
    try {
      const crit = events.filter(e => e.severity === "critical" || e.severity === "high").slice(0, 5);
      const prompt = `Based on these critical events:\n${crit.map(e => `${e.title} (${e.location}): ${e.summary}`).join("\n")}\n\nReturn ONLY JSON:\n{"chains":[{"item":"item","risk":"critical|high|medium","shortage":"X%","primarySources":["Country A (60%)"],"alternatives":["Country C"],"companies":["Company X"],"priceImpact":"+X%","sectors":["Sector A"],"timeToShortage":"X weeks"}]}\nInclude 7 items.`;
      const text = await callClaude(prompt, 700);
      setSupplyData(parseJSON(text));
    } catch (err) { console.error(err); }
    setLoadingTab(false);
  };

  const loadSources = async () => {
    if (sourcesData) return;
    setLoadingTab(true);
    try {
      const prompt = `Sourcing intelligence for key commodity-exporting countries. Return ONLY JSON:\n{"hotspots":[{"country":"name","risk":"critical|high|medium","exports":["item (share%)"],"activeEvent":"event","priceImpact":"impact","alternatives":["country"]}]}\nCover: Russia, Ukraine, China, Saudi Arabia, Brazil, DRC, Australia, Iran, India, Taiwan.`;
      const text = await callClaude(prompt, 700);
      setSourcesData(parseJSON(text));
    } catch (err) { console.error(err); }
    setLoadingTab(false);
  };

  const handleTab = (t) => {
    setTab(t);
    if (t === "predictions") loadPredictions();
    if (t === "supply") loadSupply();
    if (t === "sources") loadSources();
  };

  function renderAnalysis(text) {
    if (!text) return null;
    return text.split("###").filter(s => s.trim()).map((sec, si) => {
      const lines = sec.trim().split("\n");
      const title = lines[0].trim().replace(/^#+\s*/, "");
      const body = lines.slice(1).join("\n").trim();

      if (title.includes("PRICE PREDICTIONS")) {
        const rows = body.split("\n").filter(l => l.includes("|"));
        const extra = body.split("\n").filter(l => l.trim() && !l.includes("|"));
        return (
          <AnalysisSection key={si} title={title}>
            <div style={{ background: "#0d1829", border: "1px solid #1a2d47", borderRadius: 3, overflow: "hidden" }}>
              {rows.map((row, ri) => {
                const parts = row.split("|").map(p => p.trim().replace(/^[-*]\s*/, ""));
                const isUp = parts[1]?.toUpperCase().includes("UP") || parts[2]?.startsWith("+");
                return (
                  <div key={ri} style={{ display: "flex", justifyContent: "space-between", padding: "7px 10px", borderBottom: ri < rows.length - 1 ? "1px solid #1a2d4744" : "none" }}>
                    <span style={{ fontFamily: "monospace", fontSize: 11, color: "#c8dff0" }}>{parts[0]}</span>
                    <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: isUp ? "#ff2d55" : "#39ff14" }}>{parts[2] || parts[1]}</span>
                    <span style={{ fontFamily: "monospace", fontSize: 10, color: "#4a6d8c" }}>{parts[3] || ""}</span>
                  </div>
                );
              })}
            </div>
            {extra.map((l, i) => <p key={i} style={{ fontSize: 11, marginTop: 6, lineHeight: 1.6 }}>{l}</p>)}
          </AnalysisSection>
        );
      }

      if (title.includes("SOURCE")) {
        return (
          <AnalysisSection key={si} title={title}>
            {body.split("\n").filter(l => l.trim()).map((item, ii) => {
              const clean = item.replace(/^[-*•]\s*/, "");
              if (clean.includes("→") || clean.includes("->")) {
                const parts = clean.split(/→|->/).map(p => p.trim());
                return (
                  <div key={ii} style={{ borderBottom: "1px solid #1a2d4733", paddingBottom: 6, marginBottom: 6 }}>
                    <div style={{ fontFamily: "monospace", fontSize: 11, color: "#00d4ff" }}>{parts[0]}</div>
                    {parts.slice(1).map((p, pi) => <div key={pi} style={{ fontSize: 11, color: "#4a6d8c", paddingLeft: 10 }}>▸ {p}</div>)}
                  </div>
                );
              }
              return <p key={ii} style={{ fontSize: 11, lineHeight: 1.6 }}>{clean}</p>;
            })}
          </AnalysisSection>
        );
      }

      return (
        <AnalysisSection key={si} title={title}>
          {body.split("\n").map((line, li) => {
            const clean = line.replace(/^[-*•]\s*/, "");
            if (!clean) return null;
            if (line.match(/^[-*•]/)) return <div key={li} style={{ fontSize: 11, lineHeight: 1.7, paddingLeft: 10, borderLeft: "2px solid #1a2d47", marginBottom: 3 }}>{clean}</div>;
            return <p key={li} style={{ fontSize: 11, lineHeight: 1.7, marginBottom: 4 }}>{clean}</p>;
          })}
        </AnalysisSection>
      );
    });
  }

  const suggestions = ["Commodities rising next 30 days", "Critical global shortages", "Red Sea shipping price impact", "Rare earth supply chain risk", "Food security by region", "Oil price predictions 90 days", "Tech supply chain vulnerabilities", "Stocks that benefit from conflicts"];

  return (
    <div style={S.app}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #03060d; }
        ::-webkit-scrollbar-thumb { background: #1a2d47; border-radius: 2px; }
        @keyframes slide { from{left:-40%} to{left:110%} }
        @keyframes blink { 50%{opacity:0} }
        @keyframes tickerMove { from{transform:translateX(0)} to{transform:translateX(-50%)} }
        @keyframes pulseDot { 0%,100%{opacity:1} 50%{opacity:0.3} }
      `}</style>

      {/* TOPBAR */}
      <div style={S.topbar}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={S.logo}>NEXUS</div>
          <div style={{ fontSize: 11, color: "#4a6d8c", letterSpacing: 4, fontFamily: "monospace" }}>GLOBAL INTELLIGENCE</div>
        </div>
        <div style={{ display: "flex", gap: 20, alignItems: "center", fontFamily: "monospace", fontSize: 10, color: "#4a6d8c" }}>
          <span><span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#39ff14", marginRight: 4, animation: "pulseDot 2s infinite" }} />LIVE</span>
          <span style={{ color: "#ff2d55" }}>{criticals} CRITICAL</span>
          <span>{events.length} EVENTS TRACKED</span>
          {!API_KEY && <span style={{ color: "#ff2d55" }}>⚠ NO API KEY</span>}
        </div>
        <div style={{ fontFamily: "monospace", fontSize: 13, color: "#00d4ff" }}>{clock}</div>
      </div>

      <div style={S.body}>
        {/* SIDEBAR */}
        <div style={S.sidebar}>
          <div style={S.sideScroll}>
            <div style={S.sectionLabel}>CATEGORIES</div>
            {[["all","○","#fff","All Events"],["weather","●","#00d4ff","Weather/Climate"],["conflict","●","#ff2d55","Armed Conflicts"],["diplomatic","●","#ffb800","Diplomatic"],["economic","●","#39ff14","Economic/Trade"],["tech","●","#b24fff","Disruptive Tech"],["health","●","#ff6b35","Health/Disease"]].map(([cat,icon,col,label]) => (
              <button key={cat} style={S.filterBtn(filter === cat)} onClick={() => setFilter(cat)}>
                <span style={{ color: col }}>{icon}</span>
                <span style={{ flex: 1 }}>{label}</span>
                <span style={{ fontFamily: "monospace", fontSize: 10, background: "#1a2d47", padding: "1px 6px", borderRadius: 2 }}>
                  {cat === "all" ? events.length : events.filter(e => e.category === cat).length}
                </span>
              </button>
            ))}
            <div style={S.sectionLabel}>QUICK QUERIES</div>
            <div style={{ padding: "0 10px", display: "flex", flexWrap: "wrap", gap: 5 }}>
              {suggestions.map(s => (
                <button key={s} onClick={() => setQuery(s)} style={{ fontSize: 10, padding: "4px 8px", background: "#0d1829", border: "1px solid #1a2d47", borderRadius: 2, color: "#4a6d8c", cursor: "pointer", textAlign: "left", fontFamily: "monospace" }}>{s}</button>
              ))}
            </div>
          </div>
        </div>

        {/* MAIN */}
        <div style={S.main}>
          <div style={S.queryBar}>
            <input style={S.input} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && runQuery()} placeholder="e.g. 'Analyze commodity impact of Red Sea tensions' or 'Which countries face grain shortages?'" />
            <button style={S.btnSecondary} onClick={scanEvents} disabled={scanning}>{scanning ? "SCANNING..." : "⟳ SCAN"}</button>
            <button style={S.btnPrimary(loading)} onClick={runQuery} disabled={loading}>{loading ? "ANALYZING..." : "ANALYZE ▶"}</button>
          </div>

          <div style={S.tabs}>
            {[["events","EVENTS FEED"],["predictions","PRICE PREDICTIONS"],["supply","SUPPLY CHAIN"],["sources","SOURCE MAP"]].map(([t,l]) => (
              <button key={t} style={S.tab(tab === t)} onClick={() => handleTab(t)}>{l}</button>
            ))}
          </div>

          <div style={S.contentArea}>
            {tab === "events" && (
              <>
                {criticals > 0 && (
                  <div style={{ padding: "7px 12px", background: "rgba(255,45,85,0.08)", border: "1px solid rgba(255,45,85,0.25)", borderRadius: 3, fontFamily: "monospace", fontSize: 10, color: "#ff2d55", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ff2d55", display: "inline-block", animation: "pulseDot 1s infinite", flexShrink: 0 }} />
                    {criticals} CRITICAL EVENT{criticals > 1 ? "S" : ""} ACTIVE — Click any card for AI analysis →
                  </div>
                )}
                {filtered.map(ev => <EventCard key={ev.id} event={ev} selected={selected?.id === ev.id} onClick={() => analyzeEvent(ev)} />)}
              </>
            )}

            {tab === "predictions" && (
              <>
                {loadingTab && <Spinner />}
                {!loadingTab && predictions && (
                  <>
                    <div style={S.grid2}>
                      {[
                        { label: "HIGHEST RISK COMMODITY", value: predictions.topCommodity, sub: predictions.topReason, col: "#e8f4ff" },
                        { label: "PRICE PRESSURE INDEX", value: `${predictions.priceIndex}/100`, sub: "Global composite score", col: "#ff6b35" },
                        { label: "MOST AT-RISK REGION", value: predictions.topRegion, sub: predictions.regionReason, col: "#ff2d55" },
                        { label: "SUPPLY ALERTS", value: predictions.alerts, sub: "Critical disruptions active", col: "#ffb800" },
                      ].map(({ label, value, sub, col }) => (
                        <div key={label} style={S.insightCard}>
                          <div style={{ fontSize: 9, letterSpacing: 3, color: "#4a6d8c", fontFamily: "monospace", marginBottom: 5 }}>{label}</div>
                          <div style={{ fontSize: 20, fontWeight: 700, color: col, fontFamily: "monospace" }}>{value}</div>
                          <div style={{ fontSize: 10, color: "#4a6d8c", marginTop: 4 }}>{sub}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ background: "#080f1a", border: "1px solid #1a2d47", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 3fr 2fr 2fr", padding: "8px 10px", borderBottom: "1px solid #1a2d47", fontSize: 9, letterSpacing: 2, color: "#4a6d8c", fontFamily: "monospace" }}>
                        <span>COMMODITY</span><span>CHANGE</span><span>CONF.</span><span>DRIVER</span><span>SOURCE</span><span>TIMEFRAME</span>
                      </div>
                      {(predictions.items || []).map((item, i) => (
                        <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 3fr 2fr 2fr", padding: "7px 10px", borderBottom: i < predictions.items.length - 1 ? "1px solid #1a2d4733" : "none", fontSize: 11, fontFamily: "monospace" }}>
                          <span style={{ color: "#c8dff0" }}>{item.commodity}</span>
                          <span style={{ color: item.direction === "up" ? "#ff2d55" : "#39ff14", fontWeight: 700 }}>{item.change}</span>
                          <span style={{ color: item.confidence === "high" ? "#ff2d55" : item.confidence === "medium" ? "#ffb800" : "#4a6d8c", fontSize: 10 }}>{item.confidence}</span>
                          <span style={{ color: "#8aabb8", fontSize: 10 }}>{item.driver}</span>
                          <span style={{ color: "#ff6b35", fontSize: 10 }}>{item.source}</span>
                          <span style={{ color: "#4a6d8c", fontSize: 10 }}>{item.timeframe}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            {tab === "supply" && (
              <>
                {loadingTab && <Spinner />}
                {!loadingTab && supplyData && (supplyData.chains || []).map((chain, i) => (
                  <div key={i} style={{ background: "#080f1a", border: "1px solid #1a2d47", borderLeft: `3px solid ${chain.risk === "critical" ? "#ff2d55" : chain.risk === "high" ? "#ffb800" : "#00d4ff"}`, borderRadius: 4, padding: 14, marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 9, letterSpacing: 2, color: chain.risk === "critical" ? "#ff2d55" : "#ffb800", fontFamily: "monospace" }}>{chain.risk?.toUpperCase()} RISK</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#e8f4ff" }}>{chain.item}</div>
                      </div>
                      <span style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: "#ff2d55" }}>{chain.priceImpact}</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 9, color: "#4a6d8c", fontFamily: "monospace", marginBottom: 3 }}>PRIMARY SOURCES</div>
                        {(chain.primarySources || []).map(s => <div key={s} style={{ fontSize: 11 }}>▸ {s}</div>)}
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: "#4a6d8c", fontFamily: "monospace", marginBottom: 3 }}>ALTERNATIVES</div>
                        {(chain.alternatives || []).map(s => <div key={s} style={{ fontSize: 11, color: "#ff6b35" }}>▸ {s}</div>)}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, fontFamily: "monospace" }}>
                      <span style={{ color: "#4a6d8c" }}>SHORTAGE: </span><span style={{ color: "#ff2d55" }}>{chain.shortage}</span>
                      <span style={{ marginLeft: 16, color: "#4a6d8c" }}>ETA: </span><span style={{ color: "#ffb800" }}>{chain.timeToShortage}</span>
                    </div>
                  </div>
                ))}
              </>
            )}

            {tab === "sources" && (
              <>
                {loadingTab && <Spinner />}
                {!loadingTab && sourcesData && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {(sourcesData.hotspots || []).map((h, i) => (
                      <div key={i} style={{ background: "#080f1a", border: "1px solid #1a2d47", borderLeft: `3px solid ${h.risk === "critical" ? "#ff2d55" : h.risk === "high" ? "#ffb800" : "#00d4ff"}`, borderRadius: 4, padding: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: "#e8f4ff" }}>{h.country}</div>
                          <span style={S.badge(h.risk === "critical" ? "critical" : h.risk === "high" ? "high" : "medium")}>{h.risk?.toUpperCase()}</span>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 8 }}>
                          {(h.exports || []).map(e => <span key={e} style={S.tag(true)}>{e}</span>)}
                        </div>
                        <div style={{ fontSize: 10, color: "#ffb800", marginBottom: 4, fontFamily: "monospace" }}>{h.activeEvent}</div>
                        <div style={{ fontSize: 11, color: "#4a6d8c", marginBottom: 4 }}>{h.priceImpact}</div>
                        <div style={{ fontSize: 10, color: "#ff6b35" }}>{(h.alternatives || []).join(" | ")}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div style={S.panel}>
          <div style={S.panelHeader}>⬡ AI INTELLIGENCE BRIEF</div>
          <div style={S.panelBody}>
            {apiError && (
              <div style={{ padding: 12, background: "rgba(255,45,85,0.1)", border: "1px solid rgba(255,45,85,0.3)", borderRadius: 3, fontFamily: "monospace", fontSize: 11, color: "#ff2d55", marginBottom: 12 }}>
                ⚠ API ERROR: {apiError}
                {!API_KEY && <div style={{ marginTop: 8, color: "#ffb800" }}>Missing VITE_ANTHROPIC_API_KEY environment variable.</div>}
              </div>
            )}
            {!analysisHtml && !loading && !apiError && (
              <div style={{ textAlign: "center", color: "#4a6d8c", padding: 20 }}>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: "#00d4ff", marginBottom: 10 }}>NEXUS READY</div>
                <div style={{ fontSize: 11, lineHeight: 1.8 }}>Select an event card or type a query to generate live AI intelligence briefing with commodity price predictions.</div>
              </div>
            )}
            {loading && <Spinner />}
            {analysisHtml && !loading && <div style={{ fontSize: 11, lineHeight: 1.7 }}>{renderAnalysis(analysisHtml)}</div>}
          </div>
        </div>
      </div>

      {/* TICKER */}
      <div style={S.ticker}>
        <div style={{ fontFamily: "monospace", fontSize: 10, letterSpacing: 3, color: "#00d4ff", padding: "0 12px", borderRight: "1px solid #1a2d47", height: "100%", display: "flex", alignItems: "center", flexShrink: 0 }}>LIVE</div>
        <div style={{ flex: 1, overflow: "hidden" }}>
          <div style={{ display: "flex", animation: "tickerMove 45s linear infinite", whiteSpace: "nowrap" }}>
            {[...tickerItems, ...tickerItems].map((item, i) => (
              <span key={i} style={{ fontFamily: "monospace", fontSize: 10, padding: "0 16px", color: "#4a6d8c" }}>
                {item.label} <span style={{ color: item.up ? "#ff2d55" : "#39ff14" }}>{item.change}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
