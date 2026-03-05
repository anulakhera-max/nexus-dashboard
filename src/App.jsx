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

function getUpcomingFridays() {
  const now = new Date();
  const day = now.getDay();
  const daysToFriday = day === 5 ? 7 : (5 - day + 7) % 7 || 7;
  const first = new Date(now); first.setDate(now.getDate() + daysToFriday);
  const second = new Date(first); second.setDate(first.getDate() + 7);
  const fmt = (d) => d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
  return { first: fmt(first), second: fmt(second) };
}

const OPTS_KEY = "nexus_options_picks";
const OPTS_TIME_KEY = "nexus_options_time";

function saveOptions(data) {
  try { localStorage.setItem(OPTS_KEY, JSON.stringify(data)); localStorage.setItem(OPTS_TIME_KEY, new Date().toISOString()); } catch {}
}
function loadOptions() {
  try { const r = localStorage.getItem(OPTS_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
function loadOptionsTime() {
  try { const r = localStorage.getItem(OPTS_TIME_KEY); return r ? new Date(r) : null; } catch { return null; }
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
  btnGold: (dis) => ({ background: dis ? "#1a2d47" : "linear-gradient(135deg,#b8860b,#ffd700)", color: dis ? "#4a6d8c" : "#0a0800", border: "none", borderRadius: 3, padding: "9px 18px", fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", cursor: dis ? "not-allowed" : "pointer", fontFamily: "monospace", whiteSpace: "nowrap" }),
  tabs: { display: "flex", borderBottom: "1px solid #1a2d47", background: "#080f1a", flexShrink: 0 },
  tab: (active, gold) => ({ padding: "10px 14px", cursor: "pointer", color: active ? (gold ? "#ffd700" : "#00d4ff") : "#4a6d8c", borderBottom: active ? `2px solid ${gold ? "#ffd700" : "#00d4ff"}` : "2px solid transparent", fontSize: 11, letterSpacing: 2, fontFamily: "monospace", background: active && gold ? "rgba(255,215,0,0.04)" : "none", border: "none" }),
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

function Spinner({ label = "PROCESSING..." }) {
  return (
    <div style={S.loading}>
      <div style={{ width: 180, height: 2, background: "#1a2d47", borderRadius: 1, overflow: "hidden", position: "relative" }}>
        <div style={{ position: "absolute", top: 0, height: "100%", width: "40%", background: "linear-gradient(90deg,transparent,#00d4ff,transparent)", animation: "slide 1.4s infinite" }} />
      </div>
      <div style={{ fontFamily: "monospace", fontSize: 11, color: "#4a6d8c", animation: "blink 1s step-end infinite" }}>{label}</div>
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

function OptionsPickCard({ pick, rank }) {
  const isCall = pick.type === "CALL";
  const typeColor = isCall ? "#39ff14" : "#ff2d55";
  const confColor = pick.confidence === "HIGH" ? "#ff2d55" : pick.confidence === "MEDIUM" ? "#ffb800" : "#4a6d8c";
  return (
    <div style={{ background: "#080f1a", border: `1px solid ${typeColor}33`, borderLeft: `4px solid ${typeColor}`, borderRadius: 4, padding: 16, marginBottom: 14, position: "relative" }}>
      <div style={{ position: "absolute", top: 12, right: 12, width: 28, height: 28, borderRadius: "50%", background: `${typeColor}22`, border: `1px solid ${typeColor}55`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: typeColor }}>#{rank}</div>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10, paddingRight: 40 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 900, color: "#e8f4ff" }}>{pick.ticker}</span>
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 2, fontFamily: "monospace", fontWeight: 700, background: `${typeColor}22`, color: typeColor, border: `1px solid ${typeColor}55` }}>{pick.type}</span>
            <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 2, fontFamily: "monospace", fontWeight: 700, background: `${confColor}22`, color: confColor, border: `1px solid ${confColor}55` }}>{pick.confidence} CONF</span>
          </div>
          <div style={{ fontSize: 12, color: "#8aabb8", marginBottom: 2 }}>{pick.companyName}</div>
          <div style={{ fontSize: 10, color: "#4a6d8c", fontFamily: "monospace" }}>{pick.exchange} · {pick.sector}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 12, background: "#0d1829", borderRadius: 3, padding: 10 }}>
        {[
          { label: "STRIKE", value: pick.strike, color: "#e8f4ff" },
          { label: "EXPIRY", value: pick.expiry, color: "#ffb800" },
          { label: "CLOSES", value: "3:30 PM ET", color: "#4a6d8c" },
          { label: "EST. PREMIUM", value: pick.premium, color: typeColor },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 9, color: "#4a6d8c", fontFamily: "monospace", letterSpacing: 1, marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color, fontFamily: "monospace" }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
        <div style={{ background: "#0d1829", borderRadius: 3, padding: "8px 10px", textAlign: "center" }}>
          <div style={{ fontSize: 9, color: "#4a6d8c", fontFamily: "monospace", marginBottom: 3 }}>TARGET RETURN</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#39ff14", fontFamily: "monospace" }}>{pick.targetReturn}</div>
        </div>
        <div style={{ background: "#0d1829", borderRadius: 3, padding: "8px 10px", textAlign: "center" }}>
          <div style={{ fontSize: 9, color: "#4a6d8c", fontFamily: "monospace", marginBottom: 3 }}>MAX LOSS</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#ff2d55", fontFamily: "monospace" }}>Premium</div>
        </div>
        <div style={{ background: "#0d1829", borderRadius: 3, padding: "8px 10px", textAlign: "center" }}>
          <div style={{ fontSize: 9, color: "#4a6d8c", fontFamily: "monospace", marginBottom: 3 }}>CATALYST</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#ffb800", fontFamily: "monospace" }}>{pick.catalystDate}</div>
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9, color: "#4a6d8c", fontFamily: "monospace", letterSpacing: 2, marginBottom: 5 }}>TRADE THESIS</div>
        <div style={{ fontSize: 11, lineHeight: 1.6, color: "#c8dff0" }}>{pick.thesis}</div>
      </div>

      <div style={{ background: `${typeColor}0d`, border: `1px solid ${typeColor}22`, borderRadius: 3, padding: "8px 10px", marginBottom: 10 }}>
        <div style={{ fontSize: 9, color: typeColor, fontFamily: "monospace", letterSpacing: 2, marginBottom: 4 }}>NEXUS EVENT TRIGGER</div>
        <div style={{ fontSize: 11, color: "#c8dff0", lineHeight: 1.5 }}>{pick.eventTrigger}</div>
      </div>

      <div style={{ fontSize: 10, color: "#4a6d8c", fontStyle: "italic", lineHeight: 1.5 }}>
        ⚠ Risk: {pick.riskNote} · Max loss = premium paid.
      </div>
    </div>
  );
}

export default function NexusDashboard({ user, onLogout }) {
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
  const [optionsPicks, setOptionsPicks] = useState(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [optionsError, setOptionsError] = useState(null);
  const [lastGenerated, setLastGenerated] = useState(null);
  const [selectedExpiry, setSelectedExpiry] = useState("both");

  const fridays = getUpcomingFridays();

  useEffect(() => {
    const tick = () => setClock(new Date().toUTCString().split(" ")[4] + " UTC");
    tick(); const iv = setInterval(tick, 1000); return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const items = events.flatMap(e => e.commodities.map((c, i) => ({ label: c, change: i < 2 ? `+${(Math.random()*7+1.5).toFixed(1)}%` : `-${(Math.random()*3+0.5).toFixed(1)}%`, up: i < 2 })));
    setTickerItems(items);
  }, [events]);

  // Load saved options on mount
  useEffect(() => {
    const saved = loadOptions();
    const savedTime = loadOptionsTime();
    if (saved && savedTime) { setOptionsPicks(saved); setLastGenerated(savedTime); }
  }, []);

  // Auto-generate at 8am if new day
  useEffect(() => {
    const check = () => {
      const now = new Date();
      const savedTime = loadOptionsTime();
      if (now.getHours() >= 8 && (!savedTime || savedTime.toDateString() !== now.toDateString())) {
        if (tab === "options") generateOptionsPicks();
      }
    };
    check();
    const iv = setInterval(check, 60000);
    return () => clearInterval(iv);
  }, [tab]);

  const filtered = filter === "all" ? events : events.filter(e => e.category === filter);
  const criticals = events.filter(e => e.severity === "critical").length;

  const generateOptionsPicks = async () => {
    if (loadingOptions) return;
    setLoadingOptions(true); setOptionsError(null);
    const evCtx = events.filter(e => ["critical","high"].includes(e.severity)).slice(0, 8)
      .map(e => `[${e.category.toUpperCase()}] ${e.title} (${e.location}): ${e.summary} — affects: ${e.commodities.join(", ")}`).join("\n");
    const today = new Date().toLocaleDateString("en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const prompt = `You are an aggressive options trading AI for a Canadian Questrade trader. Today is ${today}.

Active high-impact global events:
${evCtx}

Generate exactly 5 aggressive, event-driven options picks for stocks on NYSE, NASDAQ, or TSX tradeable on Questrade. Prioritize maximum return potential.

Requirements:
- Aggressive: prefer OTM options with high leverage potential
- Expiry: ${fridays.first} OR ${fridays.second} at 3:30 PM ET (choose whichever gives better risk/reward)
- Mix calls AND puts based on event direction  
- Only liquid, well-known tickers available on Questrade
- Each pick must be directly driven by one of the listed global events
- Target 100-500%+ return on aggressive moves
- Include at least 1 TSX-listed stock
- Rank by highest expected return potential

Return ONLY a valid JSON array (no other text):
[{"rank":1,"ticker":"SYMBOL","companyName":"Full Name","exchange":"NYSE or NASDAQ or TSX","sector":"Sector","type":"CALL or PUT","strike":"$XXX","expiry":"${fridays.first} or ${fridays.second}","premium":"$X.XX - $X.XX","targetReturn":"+XXX%","catalystDate":"Date or Ongoing","confidence":"HIGH or MEDIUM or LOW","thesis":"2-3 sentence explanation tied to the global event","eventTrigger":"Which event drives this and how","riskNote":"One sentence main risk"}]`;
    try {
      const text = await callClaude(prompt, 1200);
      const parsed = parseJSON(text);
      if (Array.isArray(parsed) && parsed.length > 0) {
        setOptionsPicks(parsed); saveOptions(parsed); setLastGenerated(new Date());
      } else throw new Error("AI returned unexpected format. Please try again.");
    } catch (err) { setOptionsError(err.message); }
    setLoadingOptions(false);
  };

  const analyzeEvent = useCallback(async (ev) => {
    setSelected(ev); setLoading(true); setAnalysisHtml(null); setApiError(null);
    const prompt = `You are NEXUS, a global intelligence AI. Analyze this world event:\n\nEvent: ${ev.title}\nLocation: ${ev.location}\nCategory: ${ev.category} | Severity: ${ev.severity}\nSummary: ${ev.summary}\nAffected Commodities: ${ev.commodities.join(", ")}\n\nUse ### headers for each section:\n\n### INTEL BRIEF\n2-3 sentences with specific figures.\n\n### CRITICAL SHORTAGES\n3-4 items running short with % estimates.\n\n### SOURCE ANALYSIS\nItem → Primary Countries (share%) → Alternatives → Key Companies\n\n### PRICE PREDICTIONS (30-90 days)\nCommodityName | UP/DOWN | +X% or -X% | High/Med/Low confidence\n\n### SUPPLY CHAIN RISK\nKey sectors disrupted, 2-3 sentences.\n\n### INVESTMENT IMPLICATIONS\nSpecific sectors/ETFs rising or falling.`;
    try { const text = await callClaude(prompt, 850); setAnalysisHtml(text); }
    catch (err) { setApiError(err.message); }
    setLoading(false);
  }, []);

  useEffect(() => { analyzeEvent(events[0]); }, []);

  const runQuery = async () => {
    if (!query.trim() || loading) return;
    setLoading(true); setAnalysisHtml(null); setApiError(null);
    const ctx = events.map(e => `[${e.category.toUpperCase()}] ${e.title} (${e.location}): ${e.commodities.join(", ")}`).join("\n");
    const prompt = `NEXUS global intelligence query: "${query}"\n\nActive events:\n${ctx}\n\nAnalyze with ### headers. Include percentages, named countries/companies, price predictions (Commodity | UP/DOWN | ±X% | Confidence), and actionable insights.`;
    try { const text = await callClaude(prompt, 900); setAnalysisHtml(text); }
    catch (err) { setApiError(err.message); }
    setLoading(false);
  };

  const scanEvents = async () => {
    setScanning(true);
    try {
      const text = await callClaude(`Generate 6 current 2025 world events affecting global commodities. Return ONLY JSON:\n[{"id":101,"category":"weather|conflict|diplomatic|economic|tech|health","severity":"critical|high|medium","title":"title","location":"location","summary":"2-3 sentences with data","commodities":["c1","c2","c3"],"region":"global|northamerica|europe|asia|middleeast|africa|latam"}]`, 700);
      const newEvs = parseJSON(text);
      if (Array.isArray(newEvs)) setEvents([...seedEvents, ...newEvs.map((e, i) => ({ ...e, id: 100 + i }))]);
    } catch {}
    setScanning(false);
  };

  const loadPredictions = async () => {
    if (predictions) return; setLoadingTab(true);
    try {
      const ctx = events.slice(0, 8).map(e => `${e.title}: ${e.commodities.join(", ")}`).join("\n");
      const text = await callClaude(`Events:\n${ctx}\n\nReturn ONLY JSON:\n{"topCommodity":"name","topReason":"reason","priceIndex":"72","topRegion":"region","regionReason":"reason","alerts":"5","items":[{"commodity":"name","direction":"up","change":"+8%","confidence":"high","driver":"driver","source":"country","timeframe":"45 days"}]}\nInclude 10 items.`, 700);
      setPredictions(parseJSON(text));
    } catch {}
    setLoadingTab(false);
  };

  const loadSupply = async () => {
    if (supplyData) return; setLoadingTab(true);
    try {
      const crit = events.filter(e => ["critical","high"].includes(e.severity)).slice(0, 5);
      const text = await callClaude(`Events:\n${crit.map(e => `${e.title}: ${e.summary}`).join("\n")}\n\nReturn ONLY JSON:\n{"chains":[{"item":"item","risk":"critical|high|medium","shortage":"X%","primarySources":["Country (60%)"],"alternatives":["Country"],"companies":["Company"],"priceImpact":"+X%","sectors":["Sector"],"timeToShortage":"X weeks"}]}\nInclude 7 items.`, 700);
      setSupplyData(parseJSON(text));
    } catch {}
    setLoadingTab(false);
  };

  const loadSources = async () => {
    if (sourcesData) return; setLoadingTab(true);
    try {
      const text = await callClaude(`Country sourcing intelligence. Return ONLY JSON:\n{"hotspots":[{"country":"name","risk":"critical|high|medium","exports":["item (share%)"],"activeEvent":"event","priceImpact":"impact","alternatives":["country"]}]}\nCover: Russia,Ukraine,China,Saudi Arabia,Brazil,DRC,Australia,Iran,India,Taiwan.`, 700);
      setSourcesData(parseJSON(text));
    } catch {}
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
              return clean ? <p key={ii} style={{ fontSize: 11, lineHeight: 1.6 }}>{clean}</p> : null;
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

  const filteredPicks = optionsPicks?.filter(p => {
    if (selectedExpiry === "this") return p.expiry?.includes(fridays.first.slice(0, 6));
    if (selectedExpiry === "next") return p.expiry?.includes(fridays.second.slice(0, 6));
    return true;
  });

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
        @keyframes goldGlow { 0%,100%{text-shadow:0 0 6px rgba(255,215,0,0.3)} 50%{text-shadow:0 0 14px rgba(255,215,0,0.7)} }
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
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontFamily: "monospace", fontSize: 13, color: "#00d4ff" }}>{clock}</div>
          {user && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: `${user.color}22`, border: `1px solid ${user.color}66`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: user.color }}>
                {user.avatar}
              </div>
              <div>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: "#e8f4ff", lineHeight: 1 }}>{user.displayName}</div>
                <div style={{ fontFamily: "monospace", fontSize: 9, color: "#4a6d8c", letterSpacing: 1 }}>{user.role}</div>
              </div>
              <button onClick={onLogout} style={{ background: "transparent", border: "1px solid #1a2d47", borderRadius: 3, padding: "3px 8px", fontFamily: "monospace", fontSize: 10, color: "#4a6d8c", cursor: "pointer", letterSpacing: 1 }}>
                EXIT
              </button>
            </div>
          )}
        </div>
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

            <div style={S.sectionLabel}>OPTIONS SCHEDULE</div>
            <div style={{ padding: "4px 16px 12px" }}>
              <div style={{ fontSize: 11, color: "#ffb800", fontFamily: "monospace", marginBottom: 4 }}>📅 {fridays.first}</div>
              <div style={{ fontSize: 11, color: "#ff6b35", fontFamily: "monospace", marginBottom: 8 }}>📅 {fridays.second}</div>
              <div style={{ fontSize: 10, color: "#4a6d8c", lineHeight: 1.6 }}>Closes 3:30 PM ET · Refreshes 8:00 AM daily</div>
              {lastGenerated && <div style={{ fontSize: 10, color: "#4a6d8c", fontFamily: "monospace", marginTop: 4 }}>Last: {lastGenerated.toLocaleTimeString()}</div>}
            </div>

            <div style={S.sectionLabel}>QUICK QUERIES</div>
            <div style={{ padding: "0 10px", display: "flex", flexWrap: "wrap", gap: 5 }}>
              {suggestions.map(s => (
                <button key={s} onClick={() => setQuery(s)} style={{ fontSize: 10, padding: "4px 8px", background: "#0d1829", border: "1px solid #1a2d47", borderRadius: 2, color: "#4a6d8c", cursor: "pointer", textAlign: "left", fontFamily: "monospace" }}>{s}</button>
              ))}
            </div>

            <div style={{ margin: "12px 10px 0", padding: "10px 12px", background: "rgba(255,184,0,0.05)", border: "1px solid rgba(255,184,0,0.2)", borderRadius: 3 }}>
              <div style={{ fontSize: 9, color: "#ffb800", fontFamily: "monospace", marginBottom: 4, letterSpacing: 2 }}>⚠ NOT FINANCIAL ADVICE</div>
              <div style={{ fontSize: 10, color: "#4a6d8c", lineHeight: 1.6 }}>AI picks are educational only. Options carry substantial risk of total loss. Always verify on Questrade before trading.</div>
            </div>
          </div>
        </div>

        {/* MAIN */}
        <div style={S.main}>
          <div style={S.queryBar}>
            <input style={S.input} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && runQuery()} placeholder="e.g. 'Commodity impact of Red Sea tensions' or 'Which countries face grain shortages?'" />
            <button style={S.btnSecondary} onClick={scanEvents} disabled={scanning}>{scanning ? "SCANNING..." : "⟳ SCAN"}</button>
            <button style={S.btnPrimary(loading)} onClick={runQuery} disabled={loading}>{loading ? "ANALYZING..." : "ANALYZE ▶"}</button>
          </div>

          <div style={S.tabs}>
            {[["events","EVENTS FEED"],["predictions","PRICE PREDICTIONS"],["supply","SUPPLY CHAIN"],["sources","SOURCE MAP"]].map(([t,l]) => (
              <button key={t} style={S.tab(tab === t, false)} onClick={() => handleTab(t)}>{l}</button>
            ))}
            <button style={{ ...S.tab(tab === "options", true), animation: tab !== "options" ? "goldGlow 3s infinite" : "none" }} onClick={() => handleTab("options")}>
              ★ OPTIONS PICKS
            </button>
          </div>

          <div style={S.contentArea}>

            {/* EVENTS */}
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

            {/* PREDICTIONS */}
            {tab === "predictions" && (
              <>
                {loadingTab && <Spinner />}
                {!loadingTab && predictions && (
                  <>
                    <div style={S.grid2}>
                      {[
                        { label: "HIGHEST RISK COMMODITY", value: predictions.topCommodity, sub: predictions.topReason, col: "#e8f4ff" },
                        { label: "PRICE PRESSURE INDEX", value: `${predictions.priceIndex}/100`, sub: "Global composite", col: "#ff6b35" },
                        { label: "MOST AT-RISK REGION", value: predictions.topRegion, sub: predictions.regionReason, col: "#ff2d55" },
                        { label: "SUPPLY ALERTS", value: predictions.alerts, sub: "Active disruptions", col: "#ffb800" },
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
                        <span>COMMODITY</span><span>CHANGE</span><span>CONF</span><span>DRIVER</span><span>SOURCE</span><span>TIMEFRAME</span>
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

            {/* SUPPLY */}
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

            {/* SOURCES */}
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

            {/* OPTIONS PICKS */}
            {tab === "options" && (
              <div>
                {/* Header */}
                <div style={{ background: "linear-gradient(135deg,rgba(184,134,11,0.15),rgba(255,215,0,0.04))", border: "1px solid rgba(255,215,0,0.25)", borderRadius: 4, padding: "14px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#ffd700", letterSpacing: 3, marginBottom: 4 }}>★ DAILY OPTIONS INTELLIGENCE — QUESTRADE</div>
                    <div style={{ fontSize: 11, color: "#8aabb8" }}>
                      Aggressive event-driven picks · <span style={{ color: "#ffb800" }}>NYSE · NASDAQ · TSX</span> · Expires <span style={{ color: "#ffd700" }}>{fridays.first}</span> or <span style={{ color: "#ff6b35" }}>{fridays.second}</span> at 3:30 PM ET
                    </div>
                    {lastGenerated && <div style={{ fontSize: 10, color: "#4a6d8c", fontFamily: "monospace", marginTop: 4 }}>Generated: {lastGenerated.toLocaleString()} · Auto-refreshes 8:00 AM daily</div>}
                  </div>
                  <button style={S.btnGold(loadingOptions)} onClick={generateOptionsPicks} disabled={loadingOptions}>
                    {loadingOptions ? "GENERATING..." : optionsPicks ? "⟳ REFRESH PICKS" : "★ GENERATE PICKS"}
                  </button>
                </div>

                {/* Expiry filter */}
                {optionsPicks && !loadingOptions && (
                  <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
                    {[["both","Both Fridays"],["this",`This Fri (${fridays.first})`],["next",`Next Fri (${fridays.second})`]].map(([val, label]) => (
                      <button key={val} onClick={() => setSelectedExpiry(val)} style={{ fontSize: 10, padding: "5px 12px", background: selectedExpiry === val ? "rgba(255,215,0,0.1)" : "#0d1829", border: `1px solid ${selectedExpiry === val ? "#ffd700" : "#1a2d47"}`, borderRadius: 2, color: selectedExpiry === val ? "#ffd700" : "#4a6d8c", cursor: "pointer", fontFamily: "monospace" }}>
                        {label}
                      </button>
                    ))}
                    <div style={{ marginLeft: "auto", fontSize: 10, color: "#4a6d8c", fontFamily: "monospace" }}>{filteredPicks?.length || 0} picks</div>
                  </div>
                )}

                {loadingOptions && <Spinner label="GENERATING OPTIONS INTELLIGENCE..." />}

                {optionsError && !loadingOptions && (
                  <div style={{ padding: 14, background: "rgba(255,45,85,0.08)", border: "1px solid rgba(255,45,85,0.3)", borderRadius: 3, fontFamily: "monospace", fontSize: 11, color: "#ff2d55", marginBottom: 12 }}>⚠ {optionsError}</div>
                )}

                {!optionsPicks && !loadingOptions && !optionsError && (
                  <div style={{ textAlign: "center", padding: 60 }}>
                    <div style={{ fontSize: 48, marginBottom: 16, animation: "goldGlow 2s infinite" }}>★</div>
                    <div style={{ fontFamily: "monospace", fontSize: 14, color: "#ffd700", marginBottom: 8, letterSpacing: 3 }}>DAILY OPTIONS PICKS</div>
                    <div style={{ fontSize: 12, color: "#4a6d8c", lineHeight: 1.8, maxWidth: 420, margin: "0 auto 24px" }}>
                      5 aggressive, event-driven options recommendations for Questrade — tied to active global events tracked by NEXUS. Picks auto-generate every morning at 8:00 AM.
                    </div>
                    <button style={{ ...S.btnGold(false), fontSize: 14, padding: "12px 32px" }} onClick={generateOptionsPicks}>
                      ★ GENERATE TODAY'S PICKS
                    </button>
                  </div>
                )}

                {filteredPicks && !loadingOptions && filteredPicks.map((pick, i) => (
                  <OptionsPickCard key={i} pick={pick} rank={pick.rank || i + 1} />
                ))}

                {optionsPicks && !loadingOptions && (
                  <div style={{ padding: "12px 16px", background: "rgba(255,184,0,0.04)", border: "1px solid rgba(255,184,0,0.15)", borderRadius: 3, marginTop: 6 }}>
                    <div style={{ fontSize: 10, color: "#4a6d8c", lineHeight: 1.8 }}>
                      <span style={{ color: "#ffb800" }}>⚠ IMPORTANT:</span> These AI-generated picks are for educational and informational purposes only and do not constitute financial advice. Options trading involves substantial risk including total loss of premium paid. Always verify strikes, premiums and liquidity directly on Questrade before placing any trade. Consult a licensed financial advisor before investing.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div style={S.panel}>
          <div style={S.panelHeader}>⬡ AI INTELLIGENCE BRIEF</div>
          <div style={S.panelBody}>
            {apiError && (
              <div style={{ padding: 12, background: "rgba(255,45,85,0.1)", border: "1px solid rgba(255,45,85,0.3)", borderRadius: 3, fontFamily: "monospace", fontSize: 11, color: "#ff2d55", marginBottom: 12 }}>
                ⚠ {apiError}
                {!API_KEY && <div style={{ marginTop: 8, color: "#ffb800" }}>Set VITE_ANTHROPIC_API_KEY in Vercel environment variables.</div>}
              </div>
            )}
            {!analysisHtml && !loading && !apiError && (
              <div style={{ textAlign: "center", color: "#4a6d8c", padding: 20 }}>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: "#00d4ff", marginBottom: 10 }}>NEXUS READY</div>
                <div style={{ fontSize: 11, lineHeight: 1.8 }}>Select an event or run a query to generate a live AI intelligence briefing with commodity predictions.</div>
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
