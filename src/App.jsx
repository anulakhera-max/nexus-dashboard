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

// NEXUS v3.1 — Earnings Calendar // Estimate cost: ~$3 per 1M input tokens, ~$15 per 1M output tokens (Sonnet)
function estimateCost(promptLen, maxTokens) {
  const inputTokens = Math.ceil(promptLen / 4);
  const outputTokens = maxTokens;
  return (inputTokens * 0.000003) + (outputTokens * 0.000015);
}

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
  if (!text) return null;
  var clean = text.trim();
  if (clean.indexOf("json") === 0) clean = clean.slice(4);
  clean = clean.replace(/^[\s\S]*?\[/, "[").replace(/\}[\s\S]*$/, "}");
  try { return JSON.parse(clean); } catch {}
  var a = clean.indexOf("[");
  var b = clean.lastIndexOf("]");
  if (a >= 0 && b > a) { try { return JSON.parse(clean.slice(a, b+1)); } catch {} }
  var c = clean.indexOf("{");
  var d = clean.lastIndexOf("}");
  if (c >= 0 && d > c) { try { return JSON.parse(clean.slice(c, d+1)); } catch {} }
  return null;
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
  contentArea: { flex: 1, overflowY: "auto", padding: 16, minHeight: 0 },
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
  const [watchlist, setWatchlist] = useState({ individuals: [], stocks: [] });
  const [trades, setTrades] = useState(null);
  const [trackerData, setTrackerData] = useState(null);
  const [showTracker, setShowTracker] = useState(false);
  const [trackerInput, setTrackerInput] = useState({});
  const [loadingTracker, setLoadingTracker] = useState(false);
  const [loadingTrades, setLoadingTrades] = useState(false);
  const [tradesError, setTradesError] = useState(null);
  const [pipelineStatus, setPipelineStatus] = useState(null);
  const [earnings, setEarnings] = useState([]);
  const [unusualFlow, setUnusualFlow] = useState(null);
  const [movers, setMovers] = useState(null);
  const [warRipple, setWarRipple] = useState(null);
  const [loadingWar, setLoadingWar] = useState(false);
  const [warError, setWarError] = useState(null);
  const [newsBias, setNewsBias] = useState(null);
  const [loadingBias, setLoadingBias] = useState(false);
  const [biasError, setBiasError] = useState(null);
  const [earningsDive, setEarningsDive] = useState({});
  const [loadingDive, setLoadingDive] = useState({});
  const [diveSearch, setDiveSearch] = useState("");
  const [rippleChain, setRippleChain] = useState(null);
  const [loadingRipple, setLoadingRipple] = useState(false);
  const [rippleInput, setRippleInput] = useState("");
  const [patternMemory, setPatternMemory] = useState(null);
  const [loadingPattern, setLoadingPattern] = useState(false);
  const [allianceData, setAllianceData] = useState(null);
  const [loadingAlliance, setLoadingAlliance] = useState(false);
  const [chartPatterns, setChartPatterns] = useState(null);
  const [loadingPatterns, setLoadingPatterns] = useState(false);
  const [patternTicker, setPatternTicker] = useState("");
  const [paperBook, setPaperBook] = useState(null);
  const [loadingPaper, setLoadingPaper] = useState(false);
  const [paperFilter, setPaperFilter] = useState("all");
  const [insiderData, setInsiderData] = useState(null);
  const [loadingInsider, setLoadingInsider] = useState(false);
  const [loadingFlow, setLoadingFlow] = useState(false);
  const [flowError, setFlowError] = useState(null);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineStage, setPipelineStage] = useState("");
  const [watchResults, setWatchResults] = useState([]);
  const [loadingWatch, setLoadingWatch] = useState(false);
  const [watchInput, setWatchInput] = useState({ name: "", ticker: "", type: "individual" });
  const [loadingTab, setLoadingTab] = useState(false);
  const [clock, setClock] = useState("");
  const [tickerItems, setTickerItems] = useState([]);
  const [apiError, setApiError] = useState(null);
  const [optionsPicks, setOptionsPicks] = useState(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [optionsError, setOptionsError] = useState(null);
  const [lastGenerated, setLastGenerated] = useState(null);
  const [selectedExpiry, setSelectedExpiry] = useState("both");
  const [intelPicks, setIntelPicks] = useState(null);
  const [loadingIntel, setLoadingIntel] = useState(false);
  const [intelError, setIntelError] = useState(null);
  const [intelMeta, setIntelMeta] = useState(null);
  const [powerIntel, setPowerIntel] = useState(null);
  const [loadingPower, setLoadingPower] = useState(false);
  const [powerError, setPowerError] = useState(null);

  // Questrade live data
  const [qtBalance, setQtBalance] = useState(null);
  const [qtQuotes, setQtQuotes] = useState({});
  const [qtChains, setQtChains] = useState({});
  const [loadingChain, setLoadingChain] = useState({});
  const [qtConnected, setQtConnected] = useState(false);
  const [qtLoading, setQtLoading] = useState(false);

  // Credit usage counter
  const [sessionCalls, setSessionCalls] = useState(0);
  const [sessionCost, setSessionCost] = useState(0);
  // Hard cache flags — tabs never reload unless manually refreshed
  const [predictionsLoaded, setPredictionsLoaded] = useState(false);
  const [supplyLoaded, setSupplyLoaded] = useState(false);
  const [sourcesLoaded, setSourcesLoaded] = useState(false);

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
    const evCtx = events.filter(e => ["critical","high"].includes(e.severity)).slice(0, 5)
      .map(e => `${e.title} (${e.location}): affects ${e.commodities.slice(0,2).join(", ")}`).join("\n");
    const today = new Date().toLocaleDateString("en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    // Ask Claude to fill in a strict template — no JSON parsing needed
    const prompt = "You are an aggressive options trading AI. Today is " + today + ".\nCurrent global events: " + evCtx + "\n\nFill in this EXACT template for 5 options picks. Replace every VALUE in caps. Do not add any other text before or after.\n\nPICK1_TICKER=VALUE\nPICK1_COMPANY=VALUE\nPICK1_EXCHANGE=VALUE\nPICK1_SECTOR=VALUE\nPICK1_TYPE=CALL or PUT\nPICK1_STRIKE=$VALUE\nPICK1_EXPIRY=" + fridays.first + "\nPICK1_PREMIUM=$VALUE-$VALUE\nPICK1_RETURN=+VALUE%\nPICK1_CONFIDENCE=HIGH or MEDIUM or LOW\nPICK1_CATALYST=VALUE\nPICK1_THESIS=VALUE\nPICK1_TRIGGER=VALUE\nPICK1_RISK=VALUE\n\nPICK2_TICKER=VALUE\nPICK2_COMPANY=VALUE\nPICK2_EXCHANGE=VALUE\nPICK2_SECTOR=VALUE\nPICK2_TYPE=CALL or PUT\nPICK2_STRIKE=$VALUE\nPICK2_EXPIRY=" + fridays.first + "\nPICK2_PREMIUM=$VALUE-$VALUE\nPICK2_RETURN=+VALUE%\nPICK2_CONFIDENCE=HIGH or MEDIUM or LOW\nPICK2_CATALYST=VALUE\nPICK2_THESIS=VALUE\nPICK2_TRIGGER=VALUE\nPICK2_RISK=VALUE\n\nPICK3_TICKER=VALUE\nPICK3_COMPANY=VALUE\nPICK3_EXCHANGE=VALUE\nPICK3_SECTOR=VALUE\nPICK3_TYPE=CALL or PUT\nPICK3_STRIKE=$VALUE\nPICK3_EXPIRY=" + fridays.second + "\nPICK3_PREMIUM=$VALUE-$VALUE\nPICK3_RETURN=+VALUE%\nPICK3_CONFIDENCE=HIGH or MEDIUM or LOW\nPICK3_CATALYST=VALUE\nPICK3_THESIS=VALUE\nPICK3_TRIGGER=VALUE\nPICK3_RISK=VALUE\n\nPICK4_TICKER=VALUE\nPICK4_COMPANY=VALUE\nPICK4_EXCHANGE=VALUE\nPICK4_SECTOR=VALUE\nPICK4_TYPE=CALL or PUT\nPICK4_STRIKE=$VALUE\nPICK4_EXPIRY=" + fridays.second + "\nPICK4_PREMIUM=$VALUE-$VALUE\nPICK4_RETURN=+VALUE%\nPICK4_CONFIDENCE=HIGH or MEDIUM or LOW\nPICK4_CATALYST=VALUE\nPICK4_THESIS=VALUE\nPICK4_TRIGGER=VALUE\nPICK4_RISK=VALUE\n\nPICK5_TICKER=VALUE\nPICK5_COMPANY=VALUE\nPICK5_EXCHANGE=VALUE\nPICK5_SECTOR=VALUE\nPICK5_TYPE=CALL or PUT\nPICK5_STRIKE=$VALUE\nPICK5_EXPIRY=" + fridays.second + "\nPICK5_PREMIUM=$VALUE-$VALUE\nPICK5_RETURN=+VALUE%\nPICK5_CONFIDENCE=HIGH or MEDIUM or LOW\nPICK5_CATALYST=VALUE\nPICK5_THESIS=VALUE\nPICK5_TRIGGER=VALUE\nPICK5_RISK=VALUE"

    try {
      const text = await callClaude(prompt, 1400);

      // Parse the template format — extremely reliable
      const picks = [];
      for (let i = 1; i <= 5; i++) {
        const get = (key) => {
          const match = text.match(new RegExp(`PICK${i}_${key}=(.+)`));
          return match ? match[1].trim() : "";
        };
        const ticker = get("TICKER");
        if (!ticker || ticker === "VALUE") continue;
        picks.push({
          rank: i,
          ticker,
          companyName: get("COMPANY"),
          exchange: get("EXCHANGE"),
          sector: get("SECTOR"),
          type: get("TYPE").includes("PUT") ? "PUT" : "CALL",
          strike: get("STRIKE"),
          expiry: get("EXPIRY"),
          premium: get("PREMIUM"),
          targetReturn: get("RETURN"),
          confidence: get("CONFIDENCE").includes("HIGH") ? "HIGH" : get("CONFIDENCE").includes("LOW") ? "LOW" : "MEDIUM",
          catalystDate: get("CATALYST"),
          thesis: get("THESIS"),
          eventTrigger: get("TRIGGER"),
          riskNote: get("RISK"),
        });
      }

      if (picks.length > 0) {
        setOptionsPicks(picks); saveOptions(picks); setLastGenerated(new Date()); trackCall(900, 1400); enrichPicksWithLiveData(picks);
      } else {
        throw new Error("No picks found in response. Please try again.");
      }
    } catch (err) { setOptionsError(err.message); }
    setLoadingOptions(false);
  };

  const generateIntelPicks = async (force = false) => {
    if (loadingIntel) return;
    setLoadingIntel(true); setIntelError(null);
    const nexusUrl = import.meta.env.VITE_NEXUS_URL;
    const nexusKey = import.meta.env.VITE_NEXUS_API_KEY;
    try {
      let picks, meta;
      if (nexusUrl && nexusKey) {
        // Use backend API with real data sources
        const controller = new AbortController();
        const tmo = setTimeout(() => controller.abort(), 25000);
        let res2;
        try {
          res2 = await fetch(nexusUrl + "/api/intelligence" + (force ? "?force=true" : ""), {
            headers: { "x-nexus-key": nexusKey }, signal: controller.signal
          });
        } catch (fe) {
          if (fe.name === "AbortError") throw new Error("Timed out — try again in a moment");
          throw fe;
        } finally { clearTimeout(tmo); }
        const rawText = await res2.text();
        if (!rawText || rawText.startsWith("<")) throw new Error("Server timed out — try again");
        const data = JSON.parse(rawText);
        if (data.success && data.picks?.length > 0) { picks = data.picks; meta = data; }
        else throw new Error(data.error || "No picks returned — try again");
      } else {
        // Fallback: call Claude directly from browser
        const evCtx = events.filter(e => ["critical","high"].includes(e.severity)).slice(0, 5)
          .map(e => `${e.title}: ${e.summary}`).join("\n");
        const fridays = getUpcomingFridays();
        const today = new Date().toLocaleDateString("en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
        // Get next 4 fridays
        const allFridays = [];
        const now = new Date();
        const day = now.getDay();
        const daysToFri = day === 5 ? 7 : (5 - day + 7) % 7 || 7;
        for (let i = 0; i < 4; i++) {
          const f = new Date(now); f.setDate(now.getDate() + daysToFri + (i * 7));
          allFridays.push(f.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }));
        }
        const prompt = "You are NEXUS market intelligence AI. Today is " + today + ".\n\nCurrent global events driving markets:\n" + evCtx + "\n\nMonitor these key sources mentally: CNBC, WSJ, Bloomberg, Reddit WSB/investing/options, SEC 13F filings, earnings calendar.\nTrack these whales: Michael Burry, Michael Saylor (MSTR/BTC), Cathie Wood (ARK), Warren Buffett, Ryan Cohen.\n\nAvailable expiries (choose best fit per pick): ${allFridays.join(\", \")}\nUse longer expiry when catalyst needs 2-4 weeks. Use shorter when move is imminent this week.\n\nIdentify 5 stocks/commodities most likely to move +9% OR -9% (either direction) based on earnings, sentiment, whale activity, news catalysts, Reddit unusual activity, and macro events.\n\nFill in EXACTLY:\n\nPICK1_TICKER=\nPICK1_NAME=\nPICK1_EXCHANGE=\nPICK1_DIRECTION=CALL or PUT\nPICK1_EXPIRY=\nPICK1_MOVE=e.g. +14%\nPICK1_CATALYST=one line reason\nPICK1_SOURCE=Reddit/Earnings/Whale/News/Macro\nPICK1_CONFIDENCE=HIGH or MEDIUM\nPICK1_URGENCY=THIS WEEK or NEXT WEEK or 2-4 WEEKS\n\nPICK2_TICKER=\nPICK2_NAME=\nPICK2_EXCHANGE=\nPICK2_DIRECTION=CALL or PUT\nPICK2_EXPIRY=\nPICK2_MOVE=\nPICK2_CATALYST=\nPICK2_SOURCE=\nPICK2_CONFIDENCE=HIGH or MEDIUM\nPICK2_URGENCY=THIS WEEK or NEXT WEEK or 2-4 WEEKS\n\nPICK3_TICKER=\nPICK3_NAME=\nPICK3_EXCHANGE=\nPICK3_DIRECTION=CALL or PUT\nPICK3_EXPIRY=\nPICK3_MOVE=\nPICK3_CATALYST=\nPICK3_SOURCE=\nPICK3_CONFIDENCE=HIGH or MEDIUM\nPICK3_URGENCY=THIS WEEK or NEXT WEEK or 2-4 WEEKS\n\nPICK4_TICKER=\nPICK4_NAME=\nPICK4_EXCHANGE=\nPICK4_DIRECTION=CALL or PUT\nPICK4_EXPIRY=\nPICK4_MOVE=\nPICK4_CATALYST=\nPICK4_SOURCE=\nPICK4_CONFIDENCE=HIGH or MEDIUM\nPICK4_URGENCY=THIS WEEK or NEXT WEEK or 2-4 WEEKS\n\nPICK5_TICKER=\nPICK5_NAME=\nPICK5_EXCHANGE=\nPICK5_DIRECTION=CALL or PUT\nPICK5_EXPIRY=\nPICK5_MOVE=\nPICK5_CATALYST=\nPICK5_SOURCE=\nPICK5_CONFIDENCE=HIGH or MEDIUM\nPICK5_URGENCY=THIS WEEK or NEXT WEEK or 2-4 WEEKS"

        const text = await callClaude(prompt, 1400);
        picks = [];
        for (let i = 1; i <= 5; i++) {
          const get = (key) => { const m = text.match(new RegExp(`PICK${i}_${key}=(.+)`)); return m ? m[1].trim() : ""; };
          const ticker = get("TICKER");
          if (!ticker) continue;
          picks.push({ rank: i, ticker, name: get("NAME"), exchange: get("EXCHANGE"), direction: get("DIRECTION").includes("PUT") ? "PUT" : "CALL", expiry: get("EXPIRY"), estimatedMove: get("MOVE"), catalyst: get("CATALYST"), source: get("SOURCE"), confidence: get("CONFIDENCE"), urgency: get("URGENCY") });
        }
        meta = { sourcesMonitored: ["CNBC","WSJ","Reddit WSB","r/investing","r/options","SEC 13F","Earnings"], whalesTracked: ["Michael Burry","Michael Saylor","Cathie Wood","Warren Buffett","Ryan Cohen"], headlinesAnalyzed: "AI synthesized" };
      }
      if (picks && picks.length > 0) { setIntelPicks(picks); setIntelMeta(meta); trackCall(1200, 1400); enrichPicksWithLiveData(picks); }
      else throw new Error("No picks generated. Please try again.");
    } catch (err) { setIntelError(err.message); }
    setLoadingIntel(false);
  };

  const analyzeEvent = useCallback(async (ev) => {
    setSelected(ev); setLoading(true); setAnalysisHtml(null); setApiError(null);
    const prompt = `You are NEXUS, a global intelligence AI. Analyze this world event:\n\nEvent: ${ev.title}\nLocation: ${ev.location}\nCategory: ${ev.category} | Severity: ${ev.severity}\nSummary: ${ev.summary}\nAffected Commodities: ${ev.commodities.join(", ")}\n\nUse ### headers for each section:\n\n### INTEL BRIEF\n2-3 sentences with specific figures.\n\n### CRITICAL SHORTAGES\n3-4 items running short with % estimates.\n\n### SOURCE ANALYSIS\nItem → Primary Countries (share%) → Alternatives → Key Companies\n\n### PRICE PREDICTIONS (30-90 days)\nCommodityName | UP/DOWN | +X% or -X% | High/Med/Low confidence\n\n### SUPPLY CHAIN RISK\nKey sectors disrupted, 2-3 sentences.\n\n### INVESTMENT IMPLICATIONS\nSpecific sectors/ETFs rising or falling.`;
    try { const text = await callClaude(prompt, 850); setAnalysisHtml(text); trackCall(600, 850); }
    catch (err) { setApiError(err.message); }
    setLoading(false);
  }, []);

  // Don't auto-load analysis on mount — wait for user to click an event
  // useEffect(() => { analyzeEvent(events[0]); }, []);

  const runQuery = async () => {
    if (!query.trim() || loading) return;
    setLoading(true); setAnalysisHtml(null); setApiError(null);
    const ctx = events.map(e => `[${e.category.toUpperCase()}] ${e.title} (${e.location}): ${e.commodities.join(", ")}`).join("\n");
    const prompt = `NEXUS global intelligence query: "${query}"\n\nActive events:\n${ctx}\n\nAnalyze with ### headers. Include percentages, named countries/companies, price predictions (Commodity | UP/DOWN | ±X% | Confidence), and actionable insights.`;
    try { const text = await callClaude(prompt, 900); setAnalysisHtml(text); }
    catch (err) { setApiError(err.message); }
    setLoading(false);
  };

  const [liveSource, setLiveSource] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Fetch live events from GDELT via NEXUS API
  const fetchLiveEvents = async () => {
    const nexusUrl = import.meta.env.VITE_NEXUS_URL;
    const nexusKey = import.meta.env.VITE_NEXUS_API_KEY;
    if (!nexusUrl || !nexusKey) return; // skip if not configured
    try {
      const res = await fetch(`${nexusUrl}/api/events`, {
        headers: { "x-nexus-key": nexusKey }
      });
      const data = await res.json();
      if (data.success && data.events?.length > 0) {
        setEvents(data.events);
        setLiveSource(data.source);
        setLastUpdated(data.lastUpdated);
      }
    } catch {}
  };

  // Load live events on mount and every 15 minutes
  useEffect(() => {
    fetchLiveEvents();
    const iv = setInterval(fetchLiveEvents, 15 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  const scanEvents = async () => {
    setScanning(true);
    await fetchLiveEvents();
    setScanning(false);
  };

  const loadPredictions = async (force = false) => {
    if (predictionsLoaded && !force) return;
    if (predictions) return; setLoadingTab(true);
    try {
      const ctx = events.slice(0, 8).map(e => `${e.title}: ${e.commodities.join(", ")}`).join("\n");
      const text = await callClaude("Events:\n" + ctx + "\n\nReturn ONLY JSON:\n{\"topCommodity\":\"name\",\"topReason\":\"reason\",\"priceIndex\":\"72\",\"topRegion\":\"region\",\"regionReason\":\"reason\",\"alerts\":\"5\",\"items\":[{\"commodity\":\"name\",\"direction\":\"up\",\"change\":\"+8%\",\"confidence\":\"high\",\"driver\":\"driver\",\"source\":\"country\",\"timeframe\":\"45 days\"}]}\nInclude 10 items.", 700);
      setPredictions(parseJSON(text)); setPredictionsLoaded(true); trackCall(500, 700);
    } catch {}
    setLoadingTab(false);
  };

  const loadSupply = async (force = false) => {
    if (supplyLoaded && !force) return;
    if (supplyData) return; setLoadingTab(true);
    try {
      const crit = events.filter(e => ["critical","high"].includes(e.severity)).slice(0, 5);
      const text = await callClaude("Events:\n" + crit.map(e => e.title + ": " + e.summary).join("\n") + "\n\nReturn ONLY JSON:\n{\"chains\":[{\"item\":\"item\",\"risk\":\"critical|high|medium\",\"shortage\":\"X%\",\"primarySources\":[\"Country (60%)\"],\"alternatives\":[\"Country\"],\"companies\":[\"Company\"],\"priceImpact\":\"+X%\",\"sectors\":[\"Sector\"],\"timeToShortage\":\"X weeks\"}]}\nInclude 7 items.", 700);
      setSupplyData(parseJSON(text)); setSupplyLoaded(true); trackCall(400, 700);
    } catch {}
    setLoadingTab(false);
  };

  const loadSources = async (force = false) => {
    if (sourcesLoaded && !force) return;
    if (sourcesData) return; setLoadingTab(true);
    try {
      const res = await fetch(nexusUrl + "/api/sources?force=true", {
        headers: { "x-nexus-key": nexusKey }
      });
      const data = await res.json();
      if (data.success && data.hotspots?.length > 0) {
        setSourcesData({ hotspots: data.hotspots });
        setSourcesLoaded(true);
        trackCall(300, 700);
      }
    } catch {}
    setLoadingTab(false);
  };

  // ── Pipeline functions ───────────────────────────────────────
  const runFullPipeline = async () => {
    if (pipelineRunning) return;
    setPipelineRunning(true); setPipelineStage("Gathering data..."); setTradesError(null);
    try {
      // Stage 1: Data gather
      setPipelineStage("Stage 1/4 — Gathering all data sources...");
      await fetch(nexusUrl + "/api/data-gather?force=true", { headers: { "x-nexus-key": nexusKey } });

      // Stage 2: Power Intel A + B in parallel
      setPipelineStage("Stage 2/4 — Running Power Intel analysis...");
      await Promise.all([
        fetch(nexusUrl + "/api/power-intel-a?force=true", { headers: { "x-nexus-key": nexusKey } }),
        fetch(nexusUrl + "/api/power-intel-b?force=true", { headers: { "x-nexus-key": nexusKey } }),
      ]);

      // Stage 3: Intel Picks (27→9→3)
      setPipelineStage("Stage 3/4 — Scoring 27 candidates → narrowing to 9...");
      const intelRes = await fetch(nexusUrl + "/api/intelligence?force=true", { headers: { "x-nexus-key": nexusKey } });
      const intelData = await intelRes.json();
      if (intelData.success) setIntelPicks(intelData.picks || []);

      // Stage 4: Final 3 trades with live QT validation
      setPipelineStage("Stage 4/4 — Generating top 3 trades with live Questrade data...");
      const tradesRes = await fetch(nexusUrl + "/api/trades?force=true", { headers: { "x-nexus-key": nexusKey } });
      const tradesData = await tradesRes.json();
      if (tradesData.success) {
        setTrades(tradesData);
        handleTab("trades");
        // Auto-log trades to tracker
        if (tradesData.trades?.length > 0) {
          autoLogTrades(tradesData.trades).catch(() => {});
        }
      }
      else setTradesError(tradesData.error || "Trades failed");
    } catch (err) { setTradesError(err.message); }
    setPipelineRunning(false); setPipelineStage("");
  };

  const loadTrades = async (force = false) => {
    setLoadingTrades(true); setTradesError(null);
    try {
      const res = await fetch(nexusUrl + "/api/trades" + (force ? "?force=true" : ""), { headers: { "x-nexus-key": nexusKey } });
      const data = await res.json();
      if (data.success) setTrades(data);
      else setTradesError(data.error || "Failed to load trades");
    } catch (err) { setTradesError(err.message); }
    setLoadingTrades(false);
  };

  // ── Pick Tracker functions ───────────────────────────────────
  const loadTrackerData = async () => {
    setLoadingTracker(true);
    try {
      const res = await fetch(nexusUrl + "/api/tracker", { headers: { "x-nexus-key": nexusKey } });
      const data = await res.json();
      if (data.success) setTrackerData(data);
    } catch {}
    setLoadingTracker(false);
  };

  const autoLogTrades = async (tradeList) => {
    try {
      const res = await fetch(nexusUrl + "/api/tracker/log", {
        method: "POST",
        headers: { "x-nexus-key": nexusKey, "Content-Type": "application/json" },
        body: JSON.stringify({ trades: tradeList })
      });
      const data = await res.json();
      if (data.success) {
        // Refresh tracker data
        await loadTrackerData();
      }
      return data;
    } catch (err) { return { error: err.message }; }
  };

  const updateOutcome = async (id, outcome, exitPrice, notes) => {
    try {
      const res = await fetch(nexusUrl + "/api/tracker/outcome", {
        method: "POST",
        headers: { "x-nexus-key": nexusKey, "Content-Type": "application/json" },
        body: JSON.stringify({ id, outcome, exitPrice: exitPrice ? parseFloat(exitPrice) : null, notes })
      });
      const data = await res.json();
      if (data.success) await loadTrackerData();
    } catch {}
  };

  // Keep backward compat
  const loadTrackedPicks = loadTrackerData;
  const trackedPicks = trackerData?.picks || [];

  const updatePickOutcome = (id, exitPrice, outcome, notes) => {
    const updated = trackedPicks.map(p => {
      if (p.id !== id) return p;
      const pnlPct = p.entryPrice && exitPrice ? Math.round(((exitPrice - p.entryPrice) / p.entryPrice) * 100) : null;
      return { ...p, exitPrice, exitDate: new Date().toISOString(), outcome, pnlPct, notes };
    });
    setTrackedPicks(updated);
    saveTrackedPicks(updated);
  };

  const loadInsiderFilings = async (force = false) => {
    setLoadingInsider(true);
    try {
      const res = await fetch(nexusUrl + "/api/insider-filings" + (force ? "?force=true" : ""), { headers: { "x-nexus-key": nexusKey } });
      const data = await res.json();
      if (data.success) setInsiderData(data);
    } catch {}
    setLoadingInsider(false);
  };

  const loadPaperBook = async () => {
    setLoadingPaper(true);
    try {
      const res = await fetch(nexusUrl + "/api/paper-trade/book", { headers: { "x-nexus-key": nexusKey } });
      const data = await res.json();
      if (data.success) setPaperBook(data);
    } catch {}
    setLoadingPaper(false);
  };

  const loadChartPatterns = async (tickers, force = false) => {
    setLoadingPatterns(true);
    try {
      const url = nexusUrl + "/api/chart-patterns" + (tickers ? "?tickers=" + encodeURIComponent(tickers) : "") + (force ? (tickers ? "&" : "?") + "force=true" : "");
      const res = await fetch(url, { headers: { "x-nexus-key": nexusKey } });
      const data = await res.json();
      if (data.success) setChartPatterns(data);
    } catch {}
    setLoadingPatterns(false);
  };

  const loadAlliance = async (force = false) => {
    setLoadingAlliance(true);
    try {
      const res = await fetch(nexusUrl + "/api/alliance-detect" + (force ? "?force=true" : ""), { headers: { "x-nexus-key": nexusKey } });
      const data = await res.json();
      if (data.success) setAllianceData(data);
    } catch {}
    setLoadingAlliance(false);
  };

  const loadPatternMemory = async (force = false) => {
    setLoadingPattern(true);
    try {
      const res = await fetch(nexusUrl + "/api/pattern-memory" + (force ? "?force=true" : ""), { headers: { "x-nexus-key": nexusKey } });
      const data = await res.json();
      if (data.success) setPatternMemory(data);
    } catch {}
    setLoadingPattern(false);
  };

  const loadRippleChain = async (event, force = false) => {
    setLoadingRipple(true);
    try {
      const url = nexusUrl + "/api/ripple-chain" + (event ? "?event=" + encodeURIComponent(event) : "?event=auto") + (force ? "&force=true" : "");
      const res = await fetch(url, { headers: { "x-nexus-key": nexusKey } });
      const data = await res.json();
      if (data.success) setRippleChain(data);
    } catch {}
    setLoadingRipple(false);
  };

  const loadEarningsDive = async (ticker, force = false) => {
    const t = ticker.toUpperCase();
    setLoadingDive(prev => ({ ...prev, [t]: true }));
    try {
      const res = await fetch(nexusUrl + "/api/earnings-dive?ticker=" + t + (force ? "&force=true" : ""), { headers: { "x-nexus-key": nexusKey } });
      const data = await res.json();
      if (data.success) setEarningsDive(prev => ({ ...prev, [t]: data }));
    } catch {}
    setLoadingDive(prev => ({ ...prev, [t]: false }));
  };

  const loadNewsBias = async (force = false) => {
    setLoadingBias(true); setBiasError(null);
    try {
      const res = await fetch(nexusUrl + "/api/news-bias" + (force ? "?force=true" : ""), { headers: { "x-nexus-key": nexusKey } });
      const data = await res.json();
      if (data.success) setNewsBias(data);
      else setBiasError(data.error || "Failed");
    } catch (err) { setBiasError(err.message); }
    setLoadingBias(false);
  };

  const loadWarRipple = async (force = false) => {
    setLoadingWar(true); setWarError(null);
    try {
      const res = await fetch(nexusUrl + "/api/war-ripple" + (force ? "?force=true" : ""), { headers: { "x-nexus-key": nexusKey } });
      const data = await res.json();
      if (data.success) setWarRipple(data);
      else setWarError(data.error || "Failed");
    } catch (err) { setWarError(err.message); }
    setLoadingWar(false);
  };

  const loadMovers = async () => {
    try {
      const res = await fetch(nexusUrl + "/api/movers", { headers: { "x-nexus-key": nexusKey } });
      const data = await res.json();
      if (data.success) setMovers(data);
    } catch {}
  };

  const loadUnusualFlow = async (force = false) => {
    setLoadingFlow(true); setFlowError(null);
    try {
      const res = await fetch(nexusUrl + "/api/unusual-flow" + (force ? "?force=true" : ""), { headers: { "x-nexus-key": nexusKey } });
      const data = await res.json();
      if (data.success) setUnusualFlow(data);
      else setFlowError(data.error || "Failed");
    } catch (err) { setFlowError(err.message); }
    setLoadingFlow(false);
  };

  const loadEarnings = async () => {
    try {
      const res = await fetch(nexusUrl + "/api/earnings", { headers: { "x-nexus-key": nexusKey } });
      const data = await res.json();
      if (data.success) setEarnings(data.earnings || []);
    } catch {}
  };

  
  const loadPipelineStatus = async () => {
    try {
      const res = await fetch(nexusUrl + "/api/pipeline-status", { headers: { "x-nexus-key": nexusKey } });
      const data = await res.json();
      if (data.success) setPipelineStatus(data.stages);
    } catch {}
  };

  // ── Watchlist functions ──────────────────────────────────────
  const loadWatchlist = async () => {
    try {
      const res = await fetch(nexusUrl + "/api/watchlist", { headers: { "x-nexus-key": nexusKey } });
      const data = await res.json();
      if (data.success) setWatchlist(data.watchlist);
    } catch {}
  };

  const saveWatchlist = async (updated) => {
    try {
      await fetch(nexusUrl + "/api/watchlist", {
        method: "POST",
        headers: { "x-nexus-key": nexusKey, "Content-Type": "application/json" },
        body: JSON.stringify({ watchlist: updated })
      });
    } catch {}
  };

  const addToWatchlist = async () => {
    const { name, ticker, type } = watchInput;
    if (!name && !ticker) return;
    const item = { id: Date.now(), name: name || ticker, ticker: ticker || null, type, addedAt: new Date().toISOString() };
    const updated = type === "stock"
      ? { ...watchlist, stocks: [...(watchlist.stocks || []), item] }
      : { ...watchlist, individuals: [...(watchlist.individuals || []), item] };
    setWatchlist(updated);
    setWatchInput({ name: "", ticker: "", type: "individual" });
    await saveWatchlist(updated);
  };

  const removeFromWatchlist = async (id, type) => {
    const updated = type === "stock"
      ? { ...watchlist, stocks: (watchlist.stocks || []).filter(s => s.id !== id) }
      : { ...watchlist, individuals: (watchlist.individuals || []).filter(i => i.id !== id) };
    setWatchlist(updated);
    await saveWatchlist(updated);
  };

  const scanWatchlist = async () => {
    setLoadingWatch(true);
    try {
      const res = await fetch(nexusUrl + "/api/watchlist/scan", { headers: { "x-nexus-key": nexusKey } });
      const data = await res.json();
      if (data.success) setWatchResults(data.results);
    } catch {}
    setLoadingWatch(false);
  };

  // ── Questrade API helpers ──────────────────────────────────
  const nexusUrl = import.meta.env.VITE_NEXUS_URL || "https://nexus-dashboard-blue.vercel.app";
  const nexusKey = import.meta.env.VITE_NEXUS_API_KEY || "nexus-axl-agent-key";

  const qtFetch = async (action, params = {}) => {
    if (!nexusUrl || !nexusKey) return null;
    const qs = new URLSearchParams({ action, ...params }).toString();
    try {
      const res = await fetch(`${nexusUrl}/api/questrade?${qs}`, {
        headers: { "x-nexus-key": nexusKey }
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); }
      catch { throw new Error(`Server error: ${text.slice(0, 80)}`); }
      if (!data.success) throw new Error(data.error || "Questrade error");
      return data;
    } catch (err) {
      console.error("qtFetch error:", action, err.message);
      throw err;
    }
  };

  const [qtError, setQtError] = useState(null);

  const connectQuestrade = async () => {
    setQtLoading(true);
    setQtError(null);
    // Check env vars first
    if (!nexusUrl || nexusUrl === "undefined") {
      setQtError("VITE_NEXUS_URL not set");
      setQtLoading(false);
      return;
    }
    if (!nexusKey || nexusKey === "undefined") {
      setQtError("VITE_NEXUS_API_KEY not set");
      setQtLoading(false);
      return;
    }
    try {
      const authData = await qtFetch("auth");
      if (!authData) { setQtError("qtFetch returned null — env vars missing"); setQtLoading(false); return; }
      const balData = await qtFetch("balance");
      if (balData?.balance) {
        setQtBalance(balData.balance);
        setQtConnected(true);
      } else {
        setQtError("Balance data missing from response");
      }
    } catch (err) {
      setQtError(err.message);
    }
    setQtLoading(false);
  };

  const enrichPicksWithLiveData = async (picks) => {
    if (!qtConnected || !picks?.length) return;
    try {
      // Step 1: Get live stock prices for all picks
      const tickers = picks.map(p => p.ticker).join(",");
      const data = await qtFetch("enrich", { picks: tickers });
      const quoteMap = {};
      data.quotes.forEach(q => { if (q.quote) quoteMap[q.ticker] = q.quote; });
      setQtQuotes(prev => ({ ...prev, ...quoteMap }));

      // Step 2: Fetch real options chain for each pick
      for (const pick of picks.slice(0, 3)) { // top 3 to save API calls
        if (!pick.ticker || !pick.direction) continue;
        setLoadingChain(prev => ({ ...prev, [pick.ticker]: true }));
        try {
          const chainData = await qtFetch("chain", {
            symbol: pick.ticker,
            direction: pick.direction === "PUT" ? "PUT" : "CALL",
          });
          if (chainData?.strikes?.length > 0) {
            setQtChains(prev => ({ ...prev, [pick.ticker]: chainData }));
          }
        } catch (err) {
          console.error("Chain error for", pick.ticker, err.message);
        } finally {
          setLoadingChain(prev => ({ ...prev, [pick.ticker]: false }));
        }
      }
    } catch (err) {
      console.error("Enrich error:", err.message);
    }
  };

  // Fetch chain for a single ticker on demand
  const fetchChain = async (ticker, direction) => {
    if (!qtConnected || !ticker) return;
    setLoadingChain(prev => ({ ...prev, [ticker]: true }));
    try {
      const chainData = await qtFetch("chain", { symbol: ticker, direction: direction || "CALL" });
      if (chainData?.strikes?.length > 0) {
        setQtChains(prev => ({ ...prev, [ticker]: chainData }));
      }
    } catch (err) {
      console.error("Chain fetch error:", err.message);
    } finally {
      setLoadingChain(prev => ({ ...prev, [ticker]: false }));
    }
  };

  // Auto-connect Questrade on load
  useEffect(() => { connectQuestrade(); loadWatchlist(); loadPipelineStatus(); loadTrackerData(); loadEarnings(); loadMovers(); }, []);

  const generatePowerIntel = async (force = false) => {
    if (loadingPower) return;
    setLoadingPower(true); setPowerError(null);
    try {
      if (nexusUrl && nexusKey) {
        const qs = force ? "?force=true" : "";
        // Call both endpoints in parallel — each under 10s
        const [resA, resB] = await Promise.all([
          fetch(`${nexusUrl}/api/power-intel-a${qs}`, { headers: { "x-nexus-key": nexusKey } }),
          fetch(`${nexusUrl}/api/power-intel-b${qs}`, { headers: { "x-nexus-key": nexusKey } }),
        ]);
        const [textA, textB] = await Promise.all([resA.text(), resB.text()]);
        let dataA, dataB;
        try { dataA = JSON.parse(textA); } catch { throw new Error("Power Intel A error — check Vercel logs"); }
        try { dataB = JSON.parse(textB); } catch { throw new Error("Power Intel B error — check Vercel logs"); }
        if (!dataA.success) throw new Error(dataA.error || "Power Intel A failed");
        if (!dataB.success) throw new Error(dataB.error || "Power Intel B failed");
        // Merge both results
        const merged = { ...dataA, ...dataB, success: true, timestamp: new Date().toISOString() };
        setPowerIntel(merged); trackCall(4000, 5600);
      } else {
        throw new Error("NEXUS API not configured");
      }
    } catch (err) { setPowerError(err.message); }
    setLoadingPower(false);
  };

  const trackCall = (promptLen, maxTokens) => {
    const cost = estimateCost(promptLen, maxTokens);
    setSessionCalls(c => c + 1);
    setSessionCost(c => c + cost);
  };

  const handleTab = (t) => {
    setTab(t);
    // Hard cache — only load once per session, never reload automatically
    if (t === "predictions" && !predictionsLoaded) loadPredictions();
    if (t === "intel" && !intelPicks) generateIntelPicks();
    if (t === "power" && !powerIntel) generatePowerIntel();
    if (t === "supply" && !supplyLoaded) loadSupply();
    if (t === "sources" && !sourcesLoaded) loadSources();
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
          <span><span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: liveSource ? "#39ff14" : "#ffb800", marginRight: 4, animation: "pulseDot 2s infinite" }} />{liveSource ? "GDELT LIVE" : "SEED DATA"}</span>
          <span style={{ fontFamily: "monospace", fontSize: 10, color: sessionCost > 0.05 ? "#ff2d55" : "#4a6d8c", background: "rgba(0,0,0,0.4)", padding: "2px 8px", borderRadius: 2, border: `1px solid ${sessionCost > 0.05 ? "#ff2d5544" : "#1a3a5c"}` }}>
            ⚡ {sessionCalls} calls · ~${sessionCost.toFixed(4)} used
          </span>
          {qtConnected && qtBalance && (
            <span style={{ fontFamily: "monospace", fontSize: 10, color: "#39ff14", background: "rgba(0,0,0,0.4)", padding: "2px 8px", borderRadius: 2, border: "1px solid #39ff1444" }}>
              🏦 CAD ${qtBalance.CAD.totalEquity.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · USD ${qtBalance.USD.totalEquity.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          )}
          {!qtConnected && !qtLoading && !qtError && (
            <span style={{ fontFamily: "monospace", fontSize: 10, color: "#4a6d8c", background: "rgba(0,0,0,0.4)", padding: "2px 8px", borderRadius: 2, border: "1px solid #1a3a5c", cursor: "pointer" }} onClick={connectQuestrade}>
              🏦 Connect Questrade
            </span>
          )}
          {qtLoading && (
            <span style={{ fontFamily: "monospace", fontSize: 10, color: "#ffb800", background: "rgba(0,0,0,0.4)", padding: "2px 8px", borderRadius: 2, border: "1px solid #ffb80044" }}>
              🏦 Connecting...
            </span>
          )}
          {qtError && !qtLoading && (
            <span style={{ fontFamily: "monospace", fontSize: 10, color: "#ff2d55", background: "rgba(0,0,0,0.4)", padding: "2px 8px", borderRadius: 2, border: "1px solid #ff2d5544", cursor: "pointer", maxWidth: 300 }} onClick={connectQuestrade} title={qtError}>
              🏦 QT Error: {qtError.slice(0, 40)}{qtError.length > 40 ? "..." : ""}
            </span>
          )}
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

            <button style={{ ...S.tab(tab === "intel", true), color: tab === "intel" ? "#b24fff" : "#4a6d8c", borderBottom: tab === "intel" ? "2px solid #b24fff" : "2px solid transparent", animation: tab !== "intel" ? "none" : "none" }} onClick={() => handleTab("intel")}>
              ⬡ INTEL PICKS
            </button>
            <button style={{ ...S.tab(tab === "power", true), color: tab === "power" ? "#ff6b35" : "#4a6d8c", borderBottom: tab === "power" ? "2px solid #ff6b35" : "2px solid transparent" }} onClick={() => handleTab("power")}>
              ◈ POWER INTEL
            </button>
            <button style={{ background: tab === "watch" ? "rgba(0,212,255,0.15)" : "transparent", color: tab === "watch" ? "#00d4ff" : "#4a6d8c", border: tab === "watch" ? "1px solid rgba(0,212,255,0.4)" : "1px solid transparent", borderRadius: 3, padding: "7px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 2, cursor: "pointer", fontFamily: "monospace", transition: "all 0.2s" }} onClick={() => handleTab("watch")}>
              WATCHLIST
            </button>
            <button style={{ background: tab === "trades" ? "rgba(255,45,85,0.15)" : "transparent", color: tab === "trades" ? "#ff2d55" : "#4a6d8c", border: tab === "trades" ? "1px solid rgba(255,45,85,0.5)" : "1px solid transparent", borderRadius: 3, padding: "7px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 2, cursor: "pointer", fontFamily: "monospace", transition: "all 0.2s" }} onClick={() => handleTab("trades")}>
              TRADES
            </button>
            <button style={{ background: tab === "flow" ? "rgba(178,79,255,0.15)" : "transparent", color: tab === "flow" ? "#b24fff" : "#4a6d8c", border: tab === "flow" ? "1px solid rgba(178,79,255,0.5)" : "1px solid transparent", borderRadius: 3, padding: "7px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 2, cursor: "pointer", fontFamily: "monospace", transition: "all 0.2s" }} onClick={() => { handleTab("flow"); if (!unusualFlow) loadUnusualFlow(); }}>
              ⚡ FLOW
            </button>
            <button style={{ background: tab === "war" ? "rgba(255,60,0,0.15)" : "transparent", color: tab === "war" ? "#ff3c00" : "#4a6d8c", border: tab === "war" ? "1px solid rgba(255,60,0,0.5)" : "1px solid transparent", borderRadius: 3, padding: "7px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 2, cursor: "pointer", fontFamily: "monospace", transition: "all 0.2s" }} onClick={() => { handleTab("war"); if (!warRipple) loadWarRipple(); }}>
              ☢ WAR
            </button>
            <button style={{ background: tab === "bias" ? "rgba(255,184,0,0.15)" : "transparent", color: tab === "bias" ? "#ffb800" : "#4a6d8c", border: tab === "bias" ? "1px solid rgba(255,184,0,0.5)" : "1px solid transparent", borderRadius: 3, padding: "7px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 2, cursor: "pointer", fontFamily: "monospace", transition: "all 0.2s" }} onClick={() => { handleTab("bias"); if (!newsBias) loadNewsBias(); }}>
              🔍 BIAS
            </button>
            <button style={{ background: tab === "earnings" ? "rgba(0,212,255,0.15)" : "transparent", color: tab === "earnings" ? "#00d4ff" : "#4a6d8c", border: tab === "earnings" ? "1px solid rgba(0,212,255,0.5)" : "1px solid transparent", borderRadius: 3, padding: "7px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 2, cursor: "pointer", fontFamily: "monospace", transition: "all 0.2s" }} onClick={() => handleTab("earnings")}>
              📊 EARNINGS
            </button>
            <button style={{ background: tab === "ripple" ? "rgba(0,255,136,0.15)" : "transparent", color: tab === "ripple" ? "#00ff88" : "#4a6d8c", border: tab === "ripple" ? "1px solid rgba(0,255,136,0.5)" : "1px solid transparent", borderRadius: 3, padding: "7px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 2, cursor: "pointer", fontFamily: "monospace", transition: "all 0.2s" }} onClick={() => handleTab("ripple")}>
              🌊 RIPPLE
            </button>
            <button style={{ background: tab === "pattern" ? "rgba(255,215,0,0.15)" : "transparent", color: tab === "pattern" ? "#ffd700" : "#4a6d8c", border: tab === "pattern" ? "1px solid rgba(255,215,0,0.5)" : "1px solid transparent", borderRadius: 3, padding: "7px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 2, cursor: "pointer", fontFamily: "monospace", transition: "all 0.2s" }} onClick={() => { handleTab("pattern"); if (!patternMemory) loadPatternMemory(); }}>
              🧠 PATTERN
            </button>
            <button style={{ background: tab === "alliance" ? "rgba(255,100,0,0.15)" : "transparent", color: tab === "alliance" ? "#ff6400" : "#4a6d8c", border: tab === "alliance" ? "1px solid rgba(255,100,0,0.5)" : "1px solid transparent", borderRadius: 3, padding: "7px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 2, cursor: "pointer", fontFamily: "monospace", transition: "all 0.2s" }} onClick={() => { handleTab("alliance"); if (!allianceData) loadAlliance(); }}>
              🕵 ALLIANCE
            </button>
            <button style={{ background: tab === "chart" ? "rgba(100,200,255,0.15)" : "transparent", color: tab === "chart" ? "#64c8ff" : "#4a6d8c", border: tab === "chart" ? "1px solid rgba(100,200,255,0.5)" : "1px solid transparent", borderRadius: 3, padding: "7px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 2, cursor: "pointer", fontFamily: "monospace", transition: "all 0.2s" }} onClick={() => { handleTab("chart"); if (!chartPatterns) loadChartPatterns(""); }}>
              📈 CHART
            </button>
            <button style={{ background: tab === "paper" ? "rgba(0,255,200,0.15)" : "transparent", color: tab === "paper" ? "#00ffc8" : "#4a6d8c", border: tab === "paper" ? "1px solid rgba(0,255,200,0.5)" : "1px solid transparent", borderRadius: 3, padding: "7px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 2, cursor: "pointer", fontFamily: "monospace", transition: "all 0.2s" }} onClick={() => { handleTab("paper"); if (!paperBook) loadPaperBook(); }}>
              📋 PAPER
            </button>
            <button style={{ background: tab === "insider" ? "rgba(255,140,0,0.15)" : "transparent", color: tab === "insider" ? "#ff8c00" : "#4a6d8c", border: tab === "insider" ? "1px solid rgba(255,140,0,0.5)" : "1px solid transparent", borderRadius: 3, padding: "7px 14px", fontSize: 11, fontWeight: 700, letterSpacing: 2, cursor: "pointer", fontFamily: "monospace", transition: "all 0.2s" }} onClick={() => { handleTab("insider"); if (!insiderData) loadInsiderFilings(); }}>
              🔎 INSIDER
            </button>
          </div>

          {/* Pipeline run button + status */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
            <button onClick={runFullPipeline} disabled={pipelineRunning} style={{ background: pipelineRunning ? "#1a2d47" : "linear-gradient(135deg,#7b0000,#ff2d55)", color: pipelineRunning ? "#4a6d8c" : "#fff", border: "none", borderRadius: 3, padding: "7px 18px", fontSize: 11, fontWeight: 700, letterSpacing: 2, cursor: pipelineRunning ? "not-allowed" : "pointer", fontFamily: "monospace", flexShrink: 0 }}>
              {pipelineRunning ? pipelineStage : "◎ RUN PIPELINE"}
            </button>
            {pipelineStatus && (
              <div style={{ display: "flex", gap: 5, fontSize: 9, fontFamily: "monospace", flexWrap: "wrap" }}>
                {[["DATA", pipelineStatus.dataLayer?.ready], ["PWR-A", pipelineStatus.powerIntelA?.ready], ["PWR-B", pipelineStatus.powerIntelB?.ready], ["PICKS", pipelineStatus.intelPicks?.ready], ["TRADES", pipelineStatus.trades?.ready]].map(([label, ready]) => (
                  <span key={label} style={{ padding: "2px 6px", borderRadius: 2, background: ready ? "rgba(57,255,20,0.1)" : "rgba(74,109,140,0.1)", color: ready ? "#39ff14" : "#4a6d8c", border: `1px solid ${ready ? "rgba(57,255,20,0.3)" : "rgba(74,109,140,0.2)"}` }}>{label}</span>
                ))}
                {pipelineStatus.dataLayer?.topGainer && <span style={{ color: "#39ff14", fontSize: 9 }}>↑{pipelineStatus.dataLayer.topGainer}</span>}
                {pipelineStatus.dataLayer?.topLoser && <span style={{ color: "#ff2d55", fontSize: 9 }}>↓{pipelineStatus.dataLayer.topLoser}</span>}
              </div>
            )}
          </div>

          {/* Daily movers strip */}
          {movers && Array.isArray(movers.gainers) && Array.isArray(movers.losers) && (movers.gainers.length > 0 || movers.losers.length > 0) && (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", padding: "4px 0 4px", alignItems: "center", borderBottom: "1px solid rgba(26,45,71,0.6)", marginBottom: 4 }}>
              <span style={{ fontFamily: "monospace", fontSize: 9, color: "#39ff14", letterSpacing: 2, flexShrink: 0 }}>TOP GAIN:</span>
              {(movers.gainers || []).slice(0, 5).map(g => (
                <span key={g.ticker} style={{ fontFamily: "monospace", fontSize: 9, padding: "1px 6px", borderRadius: 2, background: "rgba(57,255,20,0.1)", color: "#39ff14", border: "1px solid rgba(57,255,20,0.25)" }}>
                  {g.ticker} +{g.changePct != null ? Number(g.changePct).toFixed(1) : "?"}% {g.volRatio > 2 ? g.volRatio + "x" : ""}
                </span>
              ))}
              <span style={{ fontFamily: "monospace", fontSize: 9, color: "#ff2d55", letterSpacing: 2, flexShrink: 0, marginLeft: 8 }}>TOP LOSS:</span>
              {(movers.losers || []).slice(0, 5).map(l => (
                <span key={l.ticker} style={{ fontFamily: "monospace", fontSize: 9, padding: "1px 6px", borderRadius: 2, background: "rgba(255,45,85,0.1)", color: "#ff2d55", border: "1px solid rgba(255,45,85,0.25)" }}>
                  {l.ticker} {l.changePct != null ? Number(l.changePct).toFixed(1) : "?"}%
                </span>
              ))}
            </div>
          )}
          {/* Earnings strip */}
          {earnings.filter(e => e.daysOut >= 0 && e.daysOut <= 30).length > 0 && (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", padding: "4px 0 6px", alignItems: "center" }}>
              <span style={{ fontFamily: "monospace", fontSize: 9, color: "#ffb800", letterSpacing: 2, flexShrink: 0 }}>EARNINGS:</span>
              {earnings.filter(e => e.daysOut >= 0 && e.daysOut <= 30).slice(0, 10).map(e => (
                <span key={e.ticker} style={{ fontFamily: "monospace", fontSize: 9, padding: "2px 6px", borderRadius: 2, background: e.daysOut <= 5 ? "rgba(255,45,85,0.15)" : "rgba(255,184,0,0.1)", color: e.daysOut <= 5 ? "#ff2d55" : "#ffb800", border: `1px solid ${e.daysOut <= 5 ? "rgba(255,45,85,0.4)" : "rgba(255,184,0,0.3)"}` }}>
                  {e.ticker} +{e.daysOut}d
                </span>
              ))}
            </div>
          )}

          <div style={S.contentArea}>

            {/* EVENTS */}
            {tab === "events" && (
              <>
                {/* Daily Movers Analysis */}
                {movers && Array.isArray(movers.gainers) && Array.isArray(movers.losers) && (movers.gainers.length > 0 || movers.losers.length > 0) && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontFamily: "monospace", fontSize: 10, color: "#4a6d8c", letterSpacing: 3, marginBottom: 10 }}>TODAY'S MARKET MOVERS — VOLUME ANALYSIS</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      {/* Gainers */}
                      <div>
                        <div style={{ fontFamily: "monospace", fontSize: 9, color: "#39ff14", letterSpacing: 2, marginBottom: 6 }}>TOP GAINERS</div>
                        {(movers.gainers || []).map((g, i) => (
                          <div key={i} style={{ background: "#080f1a", border: "1px solid rgba(57,255,20,0.15)", borderRadius: 3, padding: "8px 10px", marginBottom: 6 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#39ff14" }}>{g.ticker}</span>
                              <span style={{ fontFamily: "monospace", fontSize: 12, color: "#39ff14" }}>+{g.changePct != null ? Number(g.changePct).toFixed(1) : "?"}%</span>
                            </div>
                            <div style={{ fontSize: 10, color: "#8aabb8", marginTop: 2 }}>{g.name}</div>
                            <div style={{ display: "flex", gap: 10, marginTop: 4, fontSize: 9, fontFamily: "monospace" }}>
                              <span style={{ color: g.volRatio > 3 ? "#ffd700" : "#4a6d8c" }}>Vol: {g.volRatio}x avg {g.volRatio > 3 ? "⚡" : ""}</span>
                              {g.sector && <span style={{ color: "#4a6d8c" }}>{g.sector}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* Losers */}
                      <div>
                        <div style={{ fontFamily: "monospace", fontSize: 9, color: "#ff2d55", letterSpacing: 2, marginBottom: 6 }}>TOP LOSERS</div>
                        {(movers.losers || []).map((l, i) => (
                          <div key={i} style={{ background: "#080f1a", border: "1px solid rgba(255,45,85,0.15)", borderRadius: 3, padding: "8px 10px", marginBottom: 6 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#ff2d55" }}>{l.ticker}</span>
                              <span style={{ fontFamily: "monospace", fontSize: 12, color: "#ff2d55" }}>{l.changePct != null ? Number(l.changePct).toFixed(1) : "?"}%</span>
                            </div>
                            <div style={{ fontSize: 10, color: "#8aabb8", marginTop: 2 }}>{l.name}</div>
                            <div style={{ display: "flex", gap: 10, marginTop: 4, fontSize: 9, fontFamily: "monospace" }}>
                              <span style={{ color: l.volRatio > 3 ? "#ffd700" : "#4a6d8c" }}>Vol: {l.volRatio}x avg {l.volRatio > 3 ? "⚡" : ""}</span>
                              {l.sector && <span style={{ color: "#4a6d8c" }}>{l.sector}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
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

            
            {tab === "intel" && (
              <div>
                {/* Header */}
                <div style={{ background: "linear-gradient(135deg,rgba(178,79,255,0.15),rgba(178,79,255,0.04))", border: "1px solid rgba(178,79,255,0.3)", borderRadius: 4, padding: "14px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#b24fff", letterSpacing: 3, marginBottom: 4 }}>⬡ MULTI-SOURCE INTELLIGENCE PICKS</div>
                    <div style={{ fontSize: 11, color: "#8aabb8", marginBottom: 4 }}>
                      Scanning: <span style={{ color: "#b24fff" }}>CNBC · WSJ · Reddit WSB · r/investing · r/options · SEC 13F · Earnings</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#8aabb8" }}>
                      Tracking: <span style={{ color: "#ff6b35" }}>Burry · Saylor · Cathie Wood · Buffett · Ryan Cohen</span>
                    </div>
                    {intelMeta && <div style={{ fontSize: 10, color: "#4a6d8c", fontFamily: "monospace", marginTop: 4 }}>{intelMeta.headlinesAnalyzed} headlines analyzed · Up to 4 weekly expiries · ±9% move threshold (up or down)</div>}
                  </div>
                  <button onClick={() => generateIntelPicks(true)} disabled={loadingIntel} style={{ background: loadingIntel ? "#1a2d47" : "linear-gradient(135deg,#6a0dad,#b24fff)", color: loadingIntel ? "#4a6d8c" : "#fff", border: "none", borderRadius: 3, padding: "9px 18px", fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", cursor: loadingIntel ? "not-allowed" : "pointer", fontFamily: "monospace" }}>
                    {loadingIntel ? "SCANNING..." : intelPicks ? "⟳ REFRESH" : "⬡ SCAN NOW"}
                  </button>
                </div>

                {loadingIntel && <Spinner label="SCANNING CNBC · WSJ · REDDIT · SEC · EARNINGS..." />}

                {intelError && !loadingIntel && (
                  <div style={{ padding: 14, background: "rgba(178,79,255,0.08)", border: "1px solid rgba(178,79,255,0.3)", borderRadius: 3, fontFamily: "monospace", fontSize: 11, color: "#b24fff", marginBottom: 12 }}>⚠ {intelError}</div>
                )}

                {!intelPicks && !loadingIntel && !intelError && (
                  <div style={{ textAlign: "center", padding: 60 }}>
                    <div style={{ fontSize: 48, marginBottom: 16, color: "#b24fff" }}>⬡</div>
                    <div style={{ fontFamily: "monospace", fontSize: 14, color: "#b24fff", marginBottom: 8, letterSpacing: 3 }}>MULTI-SOURCE INTELLIGENCE</div>
                    <div style={{ fontSize: 12, color: "#4a6d8c", lineHeight: 1.8, maxWidth: 460, margin: "0 auto 24px" }}>
                      Scans CNBC, WSJ, Reddit threads, SEC whale filings, and earnings calendars. Identifies stocks and commodities likely to move +9% or -9% with CALL or PUT and best expiry up to 4 Fridays out.
                    </div>
                    <button onClick={() => generateIntelPicks(false)} style={{ background: "linear-gradient(135deg,#6a0dad,#b24fff)", color: "#fff", border: "none", borderRadius: 3, padding: "12px 32px", fontSize: 14, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", cursor: "pointer", fontFamily: "monospace" }}>
                      ⬡ SCAN ALL SOURCES NOW
                    </button>
                  </div>
                )}

                {intelPicks && !loadingIntel && (
                  <div>
                    {intelPicks.map((pick, i) => (
                      <IntelPickCard key={i} pick={pick} i={i} qtConnected={qtConnected} qtQuotes={qtQuotes} qtChains={qtChains} loadingChain={loadingChain} fetchChain={fetchChain} />
                    ))}
                  <div style={{ padding: "12px 16px", background: "rgba(178,79,255,0.04)", border: "1px solid rgba(178,79,255,0.15)", borderRadius: 3, marginTop: 6 }}>
                    <div style={{ fontSize: 10, color: "#4a6d8c", lineHeight: 1.8 }}>
                      <span style={{ color: "#b24fff" }}>⚠ RESEARCH ONLY:</span> Intelligence picks are AI-synthesized from public sources for educational purposes. Not financial advice. Always verify on Questrade before trading. Options can expire worthless.
                    </div>
                  </div>
                </div>
                )}
              </div>
            )}

            {/* POWER INTEL TAB */}
            {tab === "power" && (
              <div>
                {/* Header */}
                <div style={{ background: "linear-gradient(135deg,rgba(255,107,53,0.15),rgba(255,107,53,0.04))", border: "1px solid rgba(255,107,53,0.3)", borderRadius: 4, padding: "14px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#ff6b35", letterSpacing: 3, marginBottom: 4 }}>◈ POWER NETWORK INTELLIGENCE</div>
                    <div style={{ fontSize: 11, color: "#8aabb8" }}>Profiling: <span style={{ color: "#ff6b35" }}>Trump · Netanyahu · Putin · Xi · Kushner · Trump Family</span></div>
                    <div style={{ fontSize: 10, color: "#4a6d8c", fontFamily: "monospace", marginTop: 4 }}>Psychographic analysis · Scenario engine · 4-week predictions · Power network mapping</div>
                  </div>
                  <button onClick={() => generatePowerIntel(true)} disabled={loadingPower} style={{ background: loadingPower ? "#1a2d47" : "linear-gradient(135deg,#8b2500,#ff6b35)", color: loadingPower ? "#4a6d8c" : "#fff", border: "none", borderRadius: 3, padding: "9px 18px", fontSize: 12, fontWeight: 700, letterSpacing: 2, cursor: loadingPower ? "not-allowed" : "pointer", fontFamily: "monospace" }}>
                    {loadingPower ? "ANALYZING..." : powerIntel ? "⟳ REFRESH" : "◈ ANALYZE NOW"}
                  </button>
                </div>

                {loadingPower && <div style={{ textAlign: "center", padding: 40, color: "#ff6b35", fontFamily: "monospace", fontSize: 12 }}>◈ Running psychographic analysis on world leaders...<br/>Building scenario engine...<br/>Mapping power network...<br/><br/>This takes 20-30 seconds.</div>}

                {powerError && !loadingPower && (
                  <div style={{ padding: 14, background: "rgba(255,107,53,0.08)", border: "1px solid rgba(255,107,53,0.3)", borderRadius: 3, fontFamily: "monospace", fontSize: 11, color: "#ff6b35" }}>⚠ {powerError}</div>
                )}

                {!powerIntel && !loadingPower && !powerError && (
                  <div style={{ textAlign: "center", padding: 60 }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>◈</div>
                    <div style={{ fontFamily: "monospace", fontSize: 14, color: "#ff6b35", marginBottom: 8, letterSpacing: 3 }}>POWER NETWORK ENGINE</div>
                    <div style={{ fontSize: 12, color: "#4a6d8c", lineHeight: 1.8, maxWidth: 500, margin: "0 auto 24px" }}>Psychoanalyzes Trump, Netanyahu, Putin, Xi, Kushner. Maps their hidden connections. Runs 4 geopolitical scenarios with weekly predictions. Generates specific options plays from each scenario.</div>
                    <button onClick={() => generatePowerIntel(false)} style={{ background: "linear-gradient(135deg,#8b2500,#ff6b35)", color: "#fff", border: "none", borderRadius: 3, padding: "12px 32px", fontSize: 14, fontWeight: 700, letterSpacing: 2, cursor: "pointer", fontFamily: "monospace" }}>
                      ◈ ACTIVATE POWER INTEL
                    </button>
                  </div>
                )}

                {powerIntel && !loadingPower && (() => {
                  const { profiles, network, scenarios, topPlay, aiEcosystem, mining, pharma, pennyStocks, macro, microstructure, seasonal, cryptoSignal, psychology, community, probabilityScores, riseFallPairs, highestConviction } = powerIntel;
                  const sigCol = (s) => s === "BULLISH" ? "#39ff14" : s === "BEARISH" ? "#ff2d55" : "#ffb800";
                  const dirCol = (d) => d === "CALL" ? "#39ff14" : d === "PUT" ? "#ff2d55" : "#00d4ff";

                  return (
                    <div>
                      {/* TOP PLAY THIS WEEK */}
                      {topPlay?.ticker && (
                        <div style={{ background: "linear-gradient(135deg,rgba(255,107,53,0.2),rgba(255,45,85,0.1))", border: "2px solid #ff6b35", borderRadius: 4, padding: 16, marginBottom: 20 }}>
                          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#ff6b35", letterSpacing: 3, marginBottom: 8 }}>⚡ TOP PLAY THIS WEEK — POWER DRIVEN</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
                            <div style={{ fontFamily: "monospace", fontSize: 32, fontWeight: 900, color: "#e8f4ff" }}>{topPlay.ticker}</div>
                            <div style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 900, color: topPlay.direction === "CALL" ? "#39ff14" : "#ff2d55" }}>{topPlay.direction}</div>
                            <div style={{ textAlign: "center" }}>
                              <div style={{ fontSize: 9, color: "#4a6d8c", fontFamily: "monospace" }}>EXPIRY</div>
                              <div style={{ fontSize: 13, color: "#ffb800", fontFamily: "monospace", fontWeight: 700 }}>{topPlay.expiry}</div>
                            </div>
                            <div style={{ textAlign: "center" }}>
                              <div style={{ fontSize: 9, color: "#4a6d8c", fontFamily: "monospace" }}>CONFIDENCE</div>
                              <div style={{ fontSize: 13, color: topPlay.confidence === "HIGH" ? "#ff2d55" : "#ffb800", fontFamily: "monospace", fontWeight: 700 }}>{topPlay.confidence}</div>
                            </div>
                            <div style={{ flex: 1, fontSize: 11, color: "#c8dff0", lineHeight: 1.6 }}>{topPlay.thesis}</div>
                          </div>
                        </div>
                      )}

                      {/* WHALE NETWORK */}
                      <div style={{ marginBottom: 20 }}>
                        <div style={{ fontFamily: "monospace", fontSize: 10, color: "#00d4ff", letterSpacing: 3, marginBottom: 12 }}>🐋 WHALE NETWORK — 13F INTELLIGENCE</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 10, marginBottom: 12 }}>
                          {/* Burry */}
                          <div style={{ background: "#080f1a", border: "1px solid rgba(255,45,85,0.3)", borderRadius: 4, padding: 14 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                              <div style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "#ff2d55" }}>🐻 MICHAEL BURRY — Q3 2025</div>
                              <div style={{ fontSize: 9, color: "#4a6d8c", fontFamily: "monospace" }}>$1.38B</div>
                            </div>
                            {[{t:"PLTR",d:"PUT",r:"300x+ sales — AI bubble"},{t:"NVDA",d:"PUT",r:"AI hardware overvalued"},{t:"PFE",d:"CALL",r:"Pharma recovery"},{t:"HAL",d:"CALL",r:"Energy services"}].map((p,i) => (
                              <div key={i} style={{ display:"flex", gap:8, alignItems:"center", marginBottom:5 }}>
                                <span style={{ fontFamily:"monospace", fontSize:13, fontWeight:900, color:"#e8f4ff", minWidth:45 }}>{p.t}</span>
                                <span style={{ fontSize:10, fontWeight:700, color:p.d==="PUT"?"#ff2d55":"#39ff14", fontFamily:"monospace", padding:"1px 6px", background:p.d==="PUT"?"#ff2d5511":"#39ff1411", borderRadius:2 }}>{p.d}</span>
                                <span style={{ fontSize:10, color:"#8aabb8" }}>{p.r}</span>
                              </div>
                            ))}
                            <div style={{ marginTop:8, fontSize:9, color:"#ff2d55", fontStyle:"italic" }}>Called: 2008 crash, 2021 meme bubble, 2022 correction</div>
                          </div>
                          {/* Buffett */}
                          <div style={{ background: "#080f1a", border: "1px solid rgba(57,255,20,0.3)", borderRadius: 4, padding: 14 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                              <div style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "#39ff14" }}>📈 WARREN BUFFETT — Q4 2025</div>
                              <div style={{ fontSize: 9, color: "#4a6d8c", fontFamily: "monospace" }}>$274B</div>
                            </div>
                            {[{t:"AAPL",d:"LONG",r:"Core forever hold"},{t:"AXP",d:"LONG",r:"Premium consumer"},{t:"BAC",d:"LONG",r:"Rate normalization"},{t:"NUE+LEN",d:"NEW",r:"Steel + homebuilders"}].map((p,i) => (
                              <div key={i} style={{ display:"flex", gap:8, alignItems:"center", marginBottom:5 }}>
                                <span style={{ fontFamily:"monospace", fontSize:13, fontWeight:900, color:"#e8f4ff", minWidth:55 }}>{p.t}</span>
                                <span style={{ fontSize:10, fontWeight:700, color:p.d==="NEW"?"#ffb800":"#39ff14", fontFamily:"monospace", padding:"1px 6px", background:p.d==="NEW"?"#ffb80011":"#39ff1411", borderRadius:2 }}>{p.d}</span>
                                <span style={{ fontSize:10, color:"#8aabb8" }}>{p.r}</span>
                              </div>
                            ))}
                            <div style={{ marginTop:8, fontSize:9, color:"#39ff14", fontStyle:"italic" }}>New Q1 2025: Homebuilders = rates dropping signal</div>
                          </div>
                        </div>
                        {/* Convergence signal */}
                        <div style={{ background: "linear-gradient(135deg,rgba(0,212,255,0.08),rgba(255,107,53,0.05))", border: "1px solid rgba(0,212,255,0.25)", borderRadius: 4, padding: 14, marginBottom: 10 }}>
                          <div style={{ fontSize: 10, color: "#00d4ff", fontFamily: "monospace", marginBottom: 8 }}>⚡ CURRENT CONVERGENCE SIGNAL</div>
                          <div style={{ fontSize: 11, color: "#c8dff0", lineHeight: 1.6 }}>
                            Burry <span style={{ color:"#ff2d55", fontWeight:700 }}>BEARISH AI</span> (NVDA/PLTR puts) + Buffett <span style={{ color:"#39ff14", fontWeight:700 }}>BULLISH HOUSING</span> (LEN/DHI) + Energy recovery
                          </div>
                          <div style={{ fontSize: 11, color: "#ffb800", marginTop: 8, fontFamily: "monospace" }}>
                            → ROTATE: Out of AI/tech overvaluation → Into housing, energy, pharma
                          </div>
                          <div style={{ display:"flex", gap:16, marginTop:10, flexWrap:"wrap" }}>
                            {[{label:"AVOID",tickers:"NVDA, PLTR, SMCI, ARM",col:"#ff2d55"},{label:"BUY",tickers:"DHI, LEN, NUE, PFE, HAL",col:"#39ff14"},{label:"WATCH",tickers:"DJT, MSTR, COIN",col:"#ffb800"}].map((g,i) => (
                              <div key={i}>
                                <div style={{ fontSize:9, color:"#4a6d8c", fontFamily:"monospace" }}>{g.label}</div>
                                <div style={{ fontSize:11, fontWeight:700, color:g.col, fontFamily:"monospace" }}>{g.tickers}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                        {/* 13F timing edge */}
                        <div style={{ fontSize: 10, color: "#4a6d8c", padding: "8px 12px", background: "rgba(0,0,0,0.3)", borderRadius: 3, fontFamily: "monospace" }}>
                          📅 13F Filing dates: Feb 14 · May 15 · Aug 14 · Nov 14 — Market moves WHEN filings released. Source: 13f.info
                        </div>
                      </div>


                      {/* HIGHEST CONVICTION PLAY */}
                      {highestConviction?.ticker && (
                        <div style={{ background: "linear-gradient(135deg,rgba(57,255,20,0.15),rgba(0,212,255,0.08))", border: "2px solid #39ff14", borderRadius: 4, padding: 16, marginBottom: 20 }}>
                          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#39ff14", letterSpacing: 3, marginBottom: 10 }}>🎯 HIGHEST CONVICTION PLAY — MULTI-SIGNAL CONVERGENCE</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
                            <div style={{ fontFamily: "monospace", fontSize: 36, fontWeight: 900, color: "#e8f4ff" }}>{highestConviction.ticker}</div>
                            <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 900, color: highestConviction.direction === "CALL" ? "#39ff14" : "#ff2d55" }}>{highestConviction.direction}</div>
                            <div style={{ textAlign: "center" }}>
                              <div style={{ fontSize: 9, color: "#4a6d8c", fontFamily: "monospace" }}>EXPIRY</div>
                              <div style={{ fontSize: 14, color: "#ffb800", fontFamily: "monospace", fontWeight: 700 }}>{highestConviction.expiry}</div>
                            </div>
                            <div style={{ textAlign: "center" }}>
                              <div style={{ fontSize: 9, color: "#4a6d8c", fontFamily: "monospace" }}>PROBABILITY</div>
                              <div style={{ fontSize: 20, fontWeight: 900, color: "#39ff14", fontFamily: "monospace" }}>{highestConviction.probability}</div>
                            </div>
                            <div style={{ flex: 1, minWidth: 200 }}>
                              <div style={{ fontSize: 10, color: "#39ff14", fontFamily: "monospace", marginBottom: 4 }}>CONVERGING SIGNALS: {highestConviction.signals}</div>
                              <div style={{ fontSize: 11, color: "#c8dff0", lineHeight: 1.6 }}>{highestConviction.thesis}</div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* PROBABILITY SCORES */}
                      {probabilityScores?.length > 0 && (
                        <div style={{ marginBottom: 20 }}>
                          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#00d4ff", letterSpacing: 3, marginBottom: 12 }}>📊 PROBABILITY SCORES — SIGNAL CONVERGENCE</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
                            {probabilityScores.map((p,i) => {
                              const confNum = parseInt(p.confidence) || 50;
                              const col = confNum >= 75 ? "#39ff14" : confNum >= 65 ? "#ffb800" : "#8aabb8";
                              return (
                                <div key={i} style={{ background: "#080f1a", border: `1px solid ${col}44`, borderRadius: 4, padding: 14 }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                    <div style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 900, color: "#e8f4ff" }}>{p.ticker}</div>
                                    <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 900, color: col }}>{p.confidence}</div>
                                  </div>
                                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: p.direction === "CALL" ? "#39ff14" : "#ff2d55", fontFamily: "monospace" }}>{p.direction}</span>
                                    <span style={{ fontSize: 10, color: "#ffb800", fontFamily: "monospace" }}>{p.expiry}</span>
                                    <span style={{ fontSize: 10, color: "#4a6d8c", fontFamily: "monospace" }}>{p.signals} signals</span>
                                  </div>
                                  <div style={{ fontSize: 10, color: "#8aabb8", lineHeight: 1.4 }}>{p.reason}</div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* RISE/FALL PAIRS */}
                      {riseFallPairs?.length > 0 && (
                        <div style={{ marginBottom: 20 }}>
                          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#ffb800", letterSpacing: 3, marginBottom: 12 }}>↕ RISE/FALL PAIRS — MATHEMATICAL INVERSE RELATIONSHIPS</div>
                          {riseFallPairs.map((p,i) => (
                            <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 14px", background: "#080f1a", border: "1px solid #1a3a5c", borderRadius: 4, marginBottom: 8, flexWrap: "wrap" }}>
                              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                <span style={{ fontSize: 10, color: "#4a6d8c", fontFamily: "monospace" }}>▲ RISES</span>
                                <span style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 900, color: "#39ff14" }}>{p.rise}</span>
                              </div>
                              <span style={{ color: "#4a6d8c", fontSize: 16 }}>⟵→</span>
                              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                <span style={{ fontSize: 10, color: "#4a6d8c", fontFamily: "monospace" }}>▼ FALLS</span>
                                <span style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 900, color: "#ff2d55" }}>{p.fall}</span>
                              </div>
                              <span style={{ flex: 1, fontSize: 11, color: "#8aabb8" }}>{p.catalyst}</span>
                              <span style={{ fontSize: 10, color: "#ffb800", fontFamily: "monospace" }}>⏱ {p.timing}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* PSYCHOLOGY PLAYS */}
                      {psychology && (
                        <div style={{ marginBottom: 20 }}>
                          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#b24fff", letterSpacing: 3, marginBottom: 12 }}>🧠 PSYCHOLOGY-DRIVEN PLAYS</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 10 }}>
                            {psychology.trump?.trigger && (
                              <div style={{ background: "#080f1a", border: "1px solid rgba(255,107,53,0.3)", borderRadius: 4, padding: 14 }}>
                                <div style={{ fontSize: 10, color: "#ff6b35", fontFamily: "monospace", marginBottom: 8 }}>🇺🇸 TRUMP PSYCHOLOGICAL PLAY</div>
                                <div style={{ fontSize: 11, color: "#c8dff0", marginBottom: 6 }}><span style={{ color: "#4a6d8c" }}>Trigger:</span> {psychology.trump.trigger}</div>
                                <div style={{ fontSize: 11, color: "#c8dff0", marginBottom: 8 }}><span style={{ color: "#4a6d8c" }}>Window:</span> {psychology.trump.window}</div>
                                {psychology.trump.play && <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 10px", background: `${psychology.trump.direction === "CALL" ? "#39ff1411" : "#ff2d5511"}`, borderRadius: 3 }}>
                                  <span style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 900, color: "#e8f4ff" }}>{psychology.trump.play}</span>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: psychology.trump.direction === "CALL" ? "#39ff14" : "#ff2d55", fontFamily: "monospace" }}>{psychology.trump.direction}</span>
                                  <span style={{ fontSize: 10, color: "#ffb800", fontFamily: "monospace" }}>{psychology.trump.expiry}</span>
                                  <span style={{ fontSize: 9, color: psychology.trump.confidence === "HIGH" ? "#ff2d55" : "#ffb800", fontFamily: "monospace" }}>{psychology.trump.confidence}</span>
                                </div>}
                              </div>
                            )}
                            {psychology.netanyahu?.trigger && (
                              <div style={{ background: "#080f1a", border: "1px solid rgba(255,45,85,0.3)", borderRadius: 4, padding: 14 }}>
                                <div style={{ fontSize: 10, color: "#ff2d55", fontFamily: "monospace", marginBottom: 8 }}>🇮🇱 NETANYAHU DESPERATION INDEX</div>
                                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                                  <span style={{ fontSize: 10, color: "#4a6d8c", fontFamily: "monospace" }}>DESPERATION:</span>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: psychology.netanyahu.desperation === "CRITICAL" ? "#ff2d55" : psychology.netanyahu.desperation === "HIGH" ? "#ffb800" : "#39ff14", fontFamily: "monospace" }}>{psychology.netanyahu.desperation}</span>
                                </div>
                                <div style={{ fontSize: 11, color: "#c8dff0", marginBottom: 8 }}>{psychology.netanyahu.trigger}</div>
                                {psychology.netanyahu.play && <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 10px", background: "#39ff1411", borderRadius: 3 }}>
                                  <span style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 900, color: "#e8f4ff" }}>{psychology.netanyahu.play}</span>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: psychology.netanyahu.direction === "CALL" ? "#39ff14" : "#ff2d55", fontFamily: "monospace" }}>{psychology.netanyahu.direction}</span>
                                  <span style={{ fontSize: 10, color: "#ffb800", fontFamily: "monospace" }}>{psychology.netanyahu.expiry}</span>
                                </div>}
                              </div>
                            )}
                            {psychology.putin?.trigger && (
                              <div style={{ background: "#080f1a", border: "1px solid rgba(24,95,165,0.3)", borderRadius: 4, padding: 14 }}>
                                <div style={{ fontSize: 10, color: "#00d4ff", fontFamily: "monospace", marginBottom: 8 }}>🇷🇺 PUTIN ECONOMIC DESPERATION</div>
                                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                                  <span style={{ fontSize: 10, color: "#4a6d8c", fontFamily: "monospace" }}>PRESSURE:</span>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: psychology.putin.desperation === "CRITICAL" ? "#ff2d55" : "#ffb800", fontFamily: "monospace" }}>{psychology.putin.desperation}</span>
                                </div>
                                <div style={{ fontSize: 11, color: "#c8dff0", marginBottom: 8 }}>{psychology.putin.trigger}</div>
                                {psychology.putin.play && <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 10px", background: "#39ff1411", borderRadius: 3 }}>
                                  <span style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 900, color: "#e8f4ff" }}>{psychology.putin.play}</span>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: psychology.putin.direction === "CALL" ? "#39ff14" : "#ff2d55", fontFamily: "monospace" }}>{psychology.putin.direction}</span>
                                  <span style={{ fontSize: 10, color: "#ffb800", fontFamily: "monospace" }}>{psychology.putin.expiry}</span>
                                </div>}
                              </div>
                            )}
                          </div>
                          {psychology.timingEdge && <div style={{ marginTop: 10, padding: "10px 14px", background: "rgba(178,79,255,0.06)", border: "1px solid rgba(178,79,255,0.2)", borderRadius: 3, fontSize: 11, color: "#b24fff" }}>⏱ TIMING EDGE: {psychology.timingEdge}</div>}
                        </div>
                      )}

                      {/* COMMUNITY INTELLIGENCE */}
                      {community && (community.topDD?.ticker || community.consensus?.ticker) && (
                        <div style={{ marginBottom: 20 }}>
                          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#39ff14", letterSpacing: 3, marginBottom: 12 }}>👥 COMMUNITY INTELLIGENCE — PEER-VALIDATED ANALYSIS</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 10 }}>
                            {community.topDD?.ticker && (
                              <div style={{ background: "#080f1a", border: "1px solid rgba(57,255,20,0.25)", borderRadius: 4, padding: 14 }}>
                                <div style={{ fontSize: 10, color: "#39ff14", fontFamily: "monospace", marginBottom: 8 }}>🔥 TOP DD — MOST UPVOTED</div>
                                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                                  <span style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 900, color: "#e8f4ff" }}>{community.topDD.ticker}</span>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: community.topDD.direction === "CALL" || community.topDD.direction === "LONG" ? "#39ff14" : "#ff2d55", fontFamily: "monospace" }}>{community.topDD.direction}</span>
                                  {community.topDD.upvotes && <span style={{ fontSize: 10, color: "#b24fff", fontFamily: "monospace" }}>↑{community.topDD.upvotes}</span>}
                                </div>
                                <div style={{ fontSize: 11, color: "#8aabb8", lineHeight: 1.5 }}>{community.topDD.thesis}</div>
                              </div>
                            )}
                            {community.consensus?.ticker && (
                              <div style={{ background: "#080f1a", border: "1px solid rgba(57,255,20,0.2)", borderRadius: 4, padding: 14 }}>
                                <div style={{ fontSize: 10, color: "#4a6d8c", fontFamily: "monospace", marginBottom: 8 }}>📊 COMMUNITY CONSENSUS</div>
                                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                                  <span style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 900, color: "#e8f4ff" }}>{community.consensus.ticker}</span>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: community.consensus.direction === "CALL" || community.consensus.direction === "LONG" ? "#39ff14" : "#ff2d55", fontFamily: "monospace" }}>{community.consensus.direction}</span>
                                </div>
                                {community.contrarian?.signal && (
                                  <div style={{ marginTop: 8, padding: "6px 10px", background: "rgba(255,184,0,0.08)", border: "1px solid rgba(255,184,0,0.2)", borderRadius: 3 }}>
                                    <div style={{ fontSize: 9, color: "#ffb800", fontFamily: "monospace", marginBottom: 3 }}>⚠ CONTRARIAN SIGNAL</div>
                                    <div style={{ fontSize: 10, color: "#8aabb8" }}>{community.contrarian.signal}</div>
                                    {community.contrarian.ticker && <div style={{ fontSize: 11, fontWeight: 700, color: "#ffb800", fontFamily: "monospace", marginTop: 4 }}>{community.contrarian.ticker}</div>}
                                  </div>
                                )}
                              </div>
                            )}
                            {psychology.networkRising && (
                              <div style={{ background: "#080f1a", border: "1px solid #1a3a5c", borderRadius: 4, padding: 14 }}>
                                <div style={{ fontSize: 10, color: "#4a6d8c", fontFamily: "monospace", marginBottom: 8 }}>↕ NETWORK FLOWS</div>
                                <div style={{ fontSize: 10, color: "#4a6d8c", marginBottom: 3 }}>▲ RISING</div>
                                <div style={{ fontSize: 11, color: "#39ff14", fontFamily: "monospace", marginBottom: 8 }}>{psychology.networkRising}</div>
                                <div style={{ fontSize: 10, color: "#4a6d8c", marginBottom: 3 }}>▼ FALLING</div>
                                <div style={{ fontSize: 11, color: "#ff2d55", fontFamily: "monospace" }}>{psychology.networkFalling}</div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* PSYCHOGRAPHIC PROFILES */}
                      <div style={{ fontFamily: "monospace", fontSize: 10, color: "#ff6b35", letterSpacing: 3, marginBottom: 12 }}>◈ PSYCHOGRAPHIC PROFILES</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12, marginBottom: 20 }}>
                        {[
                          { name: "DONALD TRUMP", emoji: "🇺🇸", data: profiles.trump, fields: [["Core Driver", "coreDriver"], ["Vanity Trigger", "vanityTrigger"], ["Announcement Pattern", "announcementPattern"], ["Current Play", "currentPlay"], ["Next Move", "nextMoveProbability"]] },
                          { name: "BENJAMIN NETANYAHU", emoji: "🇮🇱", data: profiles.netanyahu, fields: [["Core Driver", "coreDriver"], ["Survival Play", "survivalPlay"], ["Trump Leverage", "trumpLeverage"], ["Next Move", "nextMove"]] },
                          { name: "VLADIMIR PUTIN", emoji: "🇷🇺", data: profiles.putin, fields: [["Core Driver", "coreDriver"], ["Economic Pressure", "economicPressure"], ["Iran Connection", "iranConnection"], ["Sanctions Play", "sanctionsPlay"]] },
                          { name: "XI JINPING", emoji: "🇨🇳", data: profiles.xi, fields: [["Core Driver", "coreDriver"], ["Taiwan Timeline", "taiwanTimeline"], ["Trade Play", "trumpTradePlay"], ["Next Move", "nextMove"]] },
                        ].map((p, i) => p.data && (
                          <div key={i} style={{ background: "#080f1a", border: "1px solid rgba(255,107,53,0.25)", borderRadius: 4, padding: 14 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                              <div style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "#ff6b35" }}>{p.emoji} {p.name}</div>
                              {p.data.marketSignal && (
                                <div style={{ fontSize: 10, fontWeight: 700, color: sigCol(p.data.marketSignal), fontFamily: "monospace", padding: "2px 8px", background: `${sigCol(p.data.marketSignal)}11`, border: `1px solid ${sigCol(p.data.marketSignal)}44`, borderRadius: 2 }}>
                                  {p.data.marketSignal}
                                </div>
                              )}
                            </div>
                            {p.fields.map(([label, key], j) => p.data[key] && (
                              <div key={j} style={{ marginBottom: 6 }}>
                                <div style={{ fontSize: 9, color: "#4a6d8c", fontFamily: "monospace" }}>{label.toUpperCase()}</div>
                                <div style={{ fontSize: 11, color: "#c8dff0", lineHeight: 1.4 }}>{p.data[key]}</div>
                              </div>
                            ))}
                            {p.data.signalReason && <div style={{ marginTop: 8, fontSize: 10, color: sigCol(p.data.marketSignal), fontStyle: "italic" }}>{p.data.signalReason}</div>}
                          </div>
                        ))}
                      </div>

                      {/* KUSHNER + TRUMP FAMILY */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                        {profiles.kushner && (
                          <div style={{ background: "#080f1a", border: "1px solid rgba(255,184,0,0.25)", borderRadius: 4, padding: 14 }}>
                            <div style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "#ffb800", marginBottom: 10 }}>💰 JARED KUSHNER</div>
                            {[["Key Investments", "keyInvestments"], ["Saudi PIF Play", "saudiPlay"], ["Benefiting From", "benefitingFrom"], ["Watch Sectors", "watchSectors"]].map(([label, key], j) => profiles.kushner[key] && (
                              <div key={j} style={{ marginBottom: 6 }}>
                                <div style={{ fontSize: 9, color: "#4a6d8c", fontFamily: "monospace" }}>{label.toUpperCase()}</div>
                                <div style={{ fontSize: 11, color: "#c8dff0" }}>{profiles.kushner[key]}</div>
                              </div>
                            ))}
                          </div>
                        )}
                        {profiles.trumpFamily && (
                          <div style={{ background: "#080f1a", border: "1px solid rgba(255,184,0,0.25)", borderRadius: 4, padding: 14 }}>
                            <div style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "#ffb800", marginBottom: 10 }}>🏛️ TRUMP FAMILY WATCH</div>
                            <div style={{ fontSize: 9, color: "#4a6d8c", fontFamily: "monospace", marginBottom: 4 }}>STOCKS/SECTORS SINCE NOV 2024</div>
                            <div style={{ fontSize: 11, color: "#c8dff0", lineHeight: 1.6 }}>{profiles.trumpFamily.watchList}</div>
                          </div>
                        )}
                      </div>

                      {/* NETWORK CONNECTIONS */}
                      {network && (
                        <div style={{ background: "#080f1a", border: "1px solid rgba(255,107,53,0.25)", borderRadius: 4, padding: 14, marginBottom: 20 }}>
                          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#ff6b35", letterSpacing: 3, marginBottom: 12 }}>◈ HIDDEN POWER CONNECTIONS</div>
                          {[network.connection1, network.connection2, network.connection3].filter(Boolean).map((c, i) => (
                            <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                              <div style={{ color: "#ff6b35", fontFamily: "monospace", fontSize: 12, flexShrink: 0 }}>⟶</div>
                              <div style={{ fontSize: 11, color: "#c8dff0", lineHeight: 1.5 }}>{c}</div>
                            </div>
                          ))}
                          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
                            {[["🛢️ IRAN WAR THESIS", network.iranWarThesis], ["🇷🇺 RUSSIA SANCTIONS THESIS", network.russiaSanctionsThesis], ["⚖️ NETANYAHU SURVIVAL THESIS", network.netanyahuSurvivalThesis]].map(([title, text], i) => text && (
                              <div key={i} style={{ padding: 12, background: "rgba(255,107,53,0.05)", border: "1px solid rgba(255,107,53,0.15)", borderRadius: 3 }}>
                                <div style={{ fontFamily: "monospace", fontSize: 10, color: "#ff6b35", marginBottom: 6 }}>{title}</div>
                                <div style={{ fontSize: 11, color: "#8aabb8", lineHeight: 1.6 }}>{text}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* SCENARIO ENGINE */}
                      <div style={{ fontFamily: "monospace", fontSize: 10, color: "#ff6b35", letterSpacing: 3, marginBottom: 12 }}>◈ 4-WEEK SCENARIO ENGINE</div>
                      {scenarios.filter(s => s.name).map((sc, si) => (
                        <div key={si} style={{ background: "#080f1a", border: "1px solid rgba(255,107,53,0.2)", borderLeft: "4px solid #ff6b35", borderRadius: 4, padding: 16, marginBottom: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                            <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#ff6b35" }}>
                              {String.fromCharCode(65+si)}. {sc.name}
                            </div>
                            <div style={{ fontFamily: "monospace", fontSize: 12, color: "#ffb800", padding: "2px 10px", background: "rgba(255,184,0,0.1)", border: "1px solid rgba(255,184,0,0.3)", borderRadius: 2 }}>
                              {sc.probability} probability
                            </div>
                          </div>
                          <div style={{ fontSize: 11, color: "#4a6d8c", marginBottom: 10 }}>TRIGGER: {sc.trigger}</div>
                          {/* Weekly timeline */}
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 14 }}>
                            {sc.weeks.map((w, wi) => w && (
                              <div key={wi} style={{ padding: 8, background: "rgba(255,107,53,0.05)", border: "1px solid rgba(255,107,53,0.15)", borderRadius: 3 }}>
                                <div style={{ fontSize: 9, color: "#ff6b35", fontFamily: "monospace", marginBottom: 4 }}>WEEK {wi+1}</div>
                                <div style={{ fontSize: 10, color: "#c8dff0", lineHeight: 1.4 }}>{w}</div>
                              </div>
                            ))}
                          </div>
                          {/* Plays */}
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {sc.plays.map((p, pi) => (
                              <div key={pi} style={{ flex: 1, minWidth: 160, padding: 10, background: `${p.direction === "CALL" ? "#39ff1411" : "#ff2d5511"}`, border: `1px solid ${p.direction === "CALL" ? "#39ff1444" : "#ff2d5544"}`, borderRadius: 3 }}>
                                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                                  <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 900, color: "#e8f4ff" }}>{p.ticker}</div>
                                  <div style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: p.direction === "CALL" ? "#39ff14" : "#ff2d55" }}>{p.direction}</div>
                                  <div style={{ fontFamily: "monospace", fontSize: 10, color: "#ffb800" }}>{p.expiry}</div>
                                </div>
                                <div style={{ fontSize: 10, color: "#8aabb8", lineHeight: 1.4 }}>{p.reason}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}


                      {/* AI ECOSYSTEM */}
                      {aiEcosystem && (
                        <div style={{ marginBottom: 20 }}>
                          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#00d4ff", letterSpacing: 3, marginBottom: 12 }}>🤖 AI ECOSYSTEM INTELLIGENCE</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 10, marginBottom: 12 }}>
                            {/* Hardware Winners */}
                            <div style={{ background: "#080f1a", border: "1px solid rgba(0,212,255,0.2)", borderRadius: 4, padding: 12 }}>
                              <div style={{ fontSize: 10, color: "#00d4ff", fontFamily: "monospace", marginBottom: 8 }}>⚡ HARDWARE WINNERS</div>
                              {aiEcosystem.hardwareWinners?.map((h,i) => h.ticker && <div key={i} style={{ marginBottom: 6 }}><span style={{ color: "#39ff14", fontFamily: "monospace", fontWeight: 700 }}>{h.ticker}</span><span style={{ fontSize: 10, color: "#8aabb8", marginLeft: 8 }}>{h.reason}</span></div>)}
                              {aiEcosystem.hardwareLosers?.map((h,i) => h.ticker && <div key={i} style={{ marginBottom: 6 }}><span style={{ color: "#ff2d55", fontFamily: "monospace", fontWeight: 700 }}>↓{h.ticker}</span><span style={{ fontSize: 10, color: "#8aabb8", marginLeft: 8 }}>{h.reason}</span></div>)}
                            </div>
                            {/* Energy + Data Centers */}
                            <div style={{ background: "#080f1a", border: "1px solid rgba(0,212,255,0.2)", borderRadius: 4, padding: 12 }}>
                              <div style={{ fontSize: 10, color: "#00d4ff", fontFamily: "monospace", marginBottom: 8 }}>⚡ ENERGY + DATA CENTERS</div>
                              {aiEcosystem.energyPlays?.map((e,i) => e.ticker && <div key={i} style={{ marginBottom: 6 }}><span style={{ color: "#39ff14", fontFamily: "monospace", fontWeight: 700 }}>{e.ticker}</span><span style={{ fontSize: 10, color: "#8aabb8", marginLeft: 8 }}>{e.reason}</span></div>)}
                              {aiEcosystem.datacenterPlay?.ticker && <div style={{ marginBottom: 6 }}><span style={{ color: "#ffb800", fontFamily: "monospace", fontWeight: 700 }}>{aiEcosystem.datacenterPlay.ticker}</span><span style={{ fontSize: 10, color: "#8aabb8", marginLeft: 8 }}>{aiEcosystem.datacenterPlay.reason}</span></div>}
                            </div>
                            {/* Minerals */}
                            <div style={{ background: "#080f1a", border: "1px solid rgba(0,212,255,0.2)", borderRadius: 4, padding: 12 }}>
                              <div style={{ fontSize: 10, color: "#00d4ff", fontFamily: "monospace", marginBottom: 8 }}>⛏ CRITICAL MINERALS</div>
                              {aiEcosystem.mineralPlays?.map((m,i) => m.ticker && <div key={i} style={{ marginBottom: 6 }}><span style={{ color: "#ffb800", fontFamily: "monospace", fontWeight: 700 }}>{m.mineral}</span><span style={{ color: "#39ff14", fontFamily: "monospace", marginLeft: 6 }}>{m.ticker}</span><span style={{ fontSize: 10, color: "#8aabb8", marginLeft: 8 }}>{m.reason}</span></div>)}
                            </div>
                          </div>
                          {/* Inverse pairs */}
                          {aiEcosystem.inversePairs?.length > 0 && (
                            <div style={{ background: "#080f1a", border: "1px solid rgba(0,212,255,0.15)", borderRadius: 4, padding: 12, marginBottom: 10 }}>
                              <div style={{ fontSize: 10, color: "#00d4ff", fontFamily: "monospace", marginBottom: 8 }}>↕ INVERSE PAIRS — When one rises the other falls</div>
                              {aiEcosystem.inversePairs.map((p,i) => <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 6 }}>
                                <span style={{ color: "#39ff14", fontFamily: "monospace", fontWeight: 700 }}>▲{p.up}</span>
                                <span style={{ color: "#4a6d8c" }}>→</span>
                                <span style={{ color: "#ff2d55", fontFamily: "monospace", fontWeight: 700 }}>▼{p.down}</span>
                                <span style={{ fontSize: 10, color: "#8aabb8" }}>{p.reason}</span>
                              </div>)}
                            </div>
                          )}
                          {aiEcosystem.historicalPattern && <div style={{ fontSize: 10, color: "#4a6d8c", fontStyle: "italic", padding: "8px 12px", background: "rgba(0,212,255,0.03)", borderRadius: 3 }}>📊 Historical Pattern: {aiEcosystem.historicalPattern}</div>}
                          {/* AI top plays */}
                          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                            {aiEcosystem.topCall?.ticker && <div style={{ flex:1, padding: 10, background: "#39ff1411", border: "1px solid #39ff1444", borderRadius: 3 }}><div style={{ fontSize: 9, color: "#4a6d8c", fontFamily: "monospace" }}>AI TOP CALL</div><div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 900, color: "#39ff14" }}>{aiEcosystem.topCall.ticker}</div><div style={{ fontSize: 10, color: "#ffb800" }}>{aiEcosystem.topCall.expiry}</div></div>}
                            {aiEcosystem.topPut?.ticker && <div style={{ flex:1, padding: 10, background: "#ff2d5511", border: "1px solid #ff2d5544", borderRadius: 3 }}><div style={{ fontSize: 9, color: "#4a6d8c", fontFamily: "monospace" }}>AI TOP PUT</div><div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 900, color: "#ff2d55" }}>{aiEcosystem.topPut.ticker}</div><div style={{ fontSize: 10, color: "#ffb800" }}>{aiEcosystem.topPut.expiry}</div></div>}
                            {aiEcosystem.ma?.target && <div style={{ flex:2, padding: 10, background: "rgba(255,184,0,0.08)", border: "1px solid rgba(255,184,0,0.3)", borderRadius: 3 }}><div style={{ fontSize: 9, color: "#4a6d8c", fontFamily: "monospace" }}>M&A WATCH</div><div style={{ fontSize: 12, fontWeight: 700, color: "#ffb800", fontFamily: "monospace" }}>{aiEcosystem.ma.acquirer} → {aiEcosystem.ma.target}</div><div style={{ fontSize: 10, color: "#8aabb8" }}>{aiEcosystem.ma.reason}</div></div>}
                          </div>
                        </div>
                      )}

                      {/* MINING */}
                      {mining && (
                        <div style={{ marginBottom: 20 }}>
                          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#ffb800", letterSpacing: 3, marginBottom: 12 }}>⛏️ MINING INTELLIGENCE</div>
                          {/* Metal outlooks */}
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                            {mining.outlooks?.filter(o=>o.metal).map((o,i) => (
                              <div key={i} style={{ padding: "6px 12px", background: `${sigCol(o.outlook)}11`, border: `1px solid ${sigCol(o.outlook)}33`, borderRadius: 3, minWidth: 100 }}>
                                <div style={{ fontSize: 10, fontFamily: "monospace", fontWeight: 700, color: sigCol(o.outlook) }}>{o.metal}</div>
                                <div style={{ fontSize: 9, color: sigCol(o.outlook) }}>{o.outlook}</div>
                                <div style={{ fontSize: 9, color: "#4a6d8c", marginTop: 2 }}>{o.driver}</div>
                              </div>
                            ))}
                          </div>
                          {/* Hot mining picks */}
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 8, marginBottom: 10 }}>
                            {mining.hotPicks?.map((p,i) => (
                              <div key={i} style={{ background: "#080f1a", border: `1px solid ${dirCol(p.direction)}33`, borderLeft: `3px solid ${dirCol(p.direction)}`, borderRadius: 3, padding: 10 }}>
                                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                                  <span style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 900, color: "#e8f4ff" }}>{p.ticker}</span>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: dirCol(p.direction), fontFamily: "monospace" }}>{p.direction}</span>
                                  <span style={{ fontSize: 10, color: "#ffb800", fontFamily: "monospace" }}>{p.expiry}</span>
                                </div>
                                <div style={{ fontSize: 10, color: "#8aabb8", lineHeight: 1.4 }}>{p.reason}</div>
                              </div>
                            ))}
                          </div>
                          {mining.maTarget && <div style={{ fontSize: 11, color: "#ffb800", padding: "8px 12px", background: "rgba(255,184,0,0.06)", borderRadius: 3 }}>🎯 M&A Target: <strong>{mining.maTarget}</strong> — {mining.maReason}</div>}
                          {mining.redditBuzz && <div style={{ fontSize: 10, color: "#b24fff", marginTop: 6, fontStyle: "italic" }}>Reddit Buzz: {mining.redditBuzz}</div>}
                        </div>
                      )}

                      {/* PHARMA */}
                      {pharma && (
                        <div style={{ marginBottom: 20 }}>
                          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#39ff14", letterSpacing: 3, marginBottom: 12 }}>💊 PHARMA CATALYST WATCH</div>
                          {pharma.pdufa?.length > 0 && (
                            <div style={{ marginBottom: 12 }}>
                              <div style={{ fontSize: 10, color: "#4a6d8c", fontFamily: "monospace", marginBottom: 8 }}>FDA PDUFA DATES</div>
                              {pharma.pdufa.map((p,i) => (
                                <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", padding: "8px 12px", background: "#080f1a", border: `1px solid ${dirCol(p.play)}33`, borderRadius: 3, marginBottom: 6, flexWrap: "wrap" }}>
                                  <span style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 900, color: "#e8f4ff", minWidth: 60 }}>{p.ticker}</span>
                                  <span style={{ fontSize: 11, color: "#c8dff0", flex: 1 }}>{p.drug}</span>
                                  <span style={{ fontSize: 10, color: "#ffb800", fontFamily: "monospace" }}>📅 {p.date}</span>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: dirCol(p.play), fontFamily: "monospace", padding: "2px 8px", background: `${dirCol(p.play)}11`, border: `1px solid ${dirCol(p.play)}44`, borderRadius: 2 }}>{p.play}</span>
                                  <span style={{ fontSize: 10, color: "#8aabb8", flex: 2 }}>{p.reason}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {pharma.maTargets?.length > 0 && (
                            <div style={{ marginBottom: 8 }}>
                              <div style={{ fontSize: 10, color: "#4a6d8c", fontFamily: "monospace", marginBottom: 6 }}>M&A ACQUISITION TARGETS</div>
                              {pharma.maTargets.map((t,i) => <div key={i} style={{ fontSize: 11, color: "#c8dff0", marginBottom: 4 }}>🎯 <strong style={{ color: "#ffb800" }}>{t.ticker}</strong> — {t.reason}</div>)}
                            </div>
                          )}
                          {pharma.redditBuzz && <div style={{ fontSize: 10, color: "#b24fff", fontStyle: "italic" }}>Reddit Buzz: {pharma.redditBuzz}</div>}
                        </div>
                      )}

                      {/* PENNY STOCKS */}
                      {pennyStocks && (
                        <div style={{ marginBottom: 20 }}>
                          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#ff2d55", letterSpacing: 3, marginBottom: 12 }}>🎯 PENNY STOCK RADAR</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 8, marginBottom: 10 }}>
                            {pennyStocks.picks?.map((p,i) => (
                              <div key={i} style={{ background: "#080f1a", border: `1px solid ${dirCol(p.direction)}33`, borderRadius: 4, padding: 12 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                  <div>
                                    <span style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 900, color: "#e8f4ff" }}>{p.ticker}</span>
                                    {p.price && <span style={{ fontSize: 11, color: "#ffb800", marginLeft: 8, fontFamily: "monospace" }}>${p.price}</span>}
                                  </div>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: dirCol(p.direction), fontFamily: "monospace", padding: "2px 6px", background: `${dirCol(p.direction)}11`, border: `1px solid ${dirCol(p.direction)}44`, borderRadius: 2 }}>{p.direction}</span>
                                </div>
                                <div style={{ fontSize: 10, color: "#ff2d55", fontFamily: "monospace", marginBottom: 4 }}>⚡ {p.catalyst}</div>
                                <div style={{ fontSize: 10, color: "#8aabb8", lineHeight: 1.4 }}>{p.reason}</div>
                                {p.redditScore && <div style={{ fontSize: 9, color: "#b24fff", marginTop: 4, fontFamily: "monospace" }}>Reddit: {p.redditScore}</div>}
                              </div>
                            ))}
                          </div>
                          <div style={{ display: "flex", gap: 10 }}>
                            {pennyStocks.squeezeCandidate && <div style={{ flex:1, padding: 10, background: "rgba(255,45,85,0.08)", border: "1px solid rgba(255,45,85,0.3)", borderRadius: 3 }}><div style={{ fontSize: 9, color: "#ff2d55", fontFamily: "monospace", marginBottom: 4 }}>🚀 SQUEEZE CANDIDATE</div><div style={{ fontFamily: "monospace", fontWeight: 700, color: "#e8f4ff" }}>{pennyStocks.squeezeCandidate}</div><div style={{ fontSize: 10, color: "#8aabb8" }}>{pennyStocks.squeezeReason}</div></div>}
                            {pennyStocks.avoid && <div style={{ flex:1, padding: 10, background: "rgba(255,184,0,0.06)", border: "1px solid rgba(255,184,0,0.3)", borderRadius: 3 }}><div style={{ fontSize: 9, color: "#ffb800", fontFamily: "monospace", marginBottom: 4 }}>⚠ AVOID</div><div style={{ fontFamily: "monospace", fontWeight: 700, color: "#e8f4ff" }}>{pennyStocks.avoid}</div><div style={{ fontSize: 10, color: "#8aabb8" }}>{pennyStocks.avoidReason}</div></div>}
                          </div>
                        </div>
                      )}


                      {/* MACRO & FED */}
                      {macro && macro.nextEvent && (
                        <div style={{ marginBottom: 20 }}>
                          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#ff6b35", letterSpacing: 3, marginBottom: 12 }}>📅 MACRO CALENDAR & FED SIGNALS</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 10 }}>
                            <div style={{ background: "#080f1a", border: `1px solid ${macro.fedSignal === "DOVISH" ? "#39ff1444" : macro.fedSignal === "HAWKISH" ? "#ff2d5544" : "#1a3a5c"}`, borderRadius: 4, padding: 14 }}>
                              <div style={{ fontSize: 9, color: "#4a6d8c", fontFamily: "monospace", marginBottom: 6 }}>FED SIGNAL</div>
                              <div style={{ fontSize: 16, fontWeight: 900, color: macro.fedSignal === "DOVISH" ? "#39ff14" : macro.fedSignal === "HAWKISH" ? "#ff2d55" : "#ffb800", fontFamily: "monospace", marginBottom: 6 }}>{macro.fedSignal}</div>
                              <div style={{ fontSize: 11, color: "#c8dff0", lineHeight: 1.5 }}>{macro.fedReason}</div>
                            </div>
                            <div style={{ background: "#080f1a", border: "1px solid #1a3a5c", borderRadius: 4, padding: 14 }}>
                              <div style={{ fontSize: 9, color: "#4a6d8c", fontFamily: "monospace", marginBottom: 6 }}>NEXT MARKET EVENT</div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: "#ffb800", fontFamily: "monospace" }}>{macro.nextEvent}</div>
                              <div style={{ fontSize: 11, color: "#4a6d8c", fontFamily: "monospace", marginTop: 4 }}>{macro.nextEventDate}</div>
                              <div style={{ fontSize: 11, color: "#c8dff0", marginTop: 6 }}>{macro.marketImpact}</div>
                            </div>
                            {macro.rateTrade?.ticker && (
                              <div style={{ background: `${macro.rateTrade.direction === "CALL" ? "#39ff1411" : "#ff2d5511"}`, border: `1px solid ${macro.rateTrade.direction === "CALL" ? "#39ff1444" : "#ff2d5544"}`, borderRadius: 4, padding: 14 }}>
                                <div style={{ fontSize: 9, color: "#4a6d8c", fontFamily: "monospace", marginBottom: 6 }}>MACRO RATE TRADE</div>
                                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                  <span style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 900, color: "#e8f4ff" }}>{macro.rateTrade.ticker}</span>
                                  <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: macro.rateTrade.direction === "CALL" ? "#39ff14" : "#ff2d55" }}>{macro.rateTrade.direction}</span>
                                  <span style={{ fontFamily: "monospace", fontSize: 11, color: "#ffb800" }}>{macro.rateTrade.expiry}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* MARKET MICROSTRUCTURE */}
                      {microstructure && (microstructure.squeezeTicker || microstructure.insiderTicker || microstructure.optionsTicker) && (
                        <div style={{ marginBottom: 20 }}>
                          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#00d4ff", letterSpacing: 3, marginBottom: 12 }}>⚡ MARKET MICROSTRUCTURE SIGNALS</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
                            {microstructure.pcRatio && (
                              <div style={{ background: "#080f1a", border: `1px solid ${microstructure.pcSignal === "BEARISH" ? "#ff2d5544" : "#39ff1444"}`, borderRadius: 4, padding: 12 }}>
                                <div style={{ fontSize: 9, color: "#4a6d8c", fontFamily: "monospace", marginBottom: 4 }}>PUT/CALL RATIO</div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: microstructure.pcSignal === "BEARISH" ? "#ff2d55" : "#39ff14", fontFamily: "monospace" }}>{microstructure.pcRatio}</div>
                                <div style={{ fontSize: 10, color: "#8aabb8", marginTop: 4 }}>{microstructure.pcSignal} signal</div>
                              </div>
                            )}
                            {microstructure.squeezeTicker && (
                              <div style={{ background: "#080f1a", border: "1px solid rgba(255,45,85,0.3)", borderRadius: 4, padding: 12 }}>
                                <div style={{ fontSize: 9, color: "#ff2d55", fontFamily: "monospace", marginBottom: 4 }}>🚀 SHORT SQUEEZE WATCH</div>
                                <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 900, color: "#e8f4ff" }}>{microstructure.squeezeTicker}</div>
                                <div style={{ fontSize: 10, color: "#8aabb8", marginTop: 4 }}>{microstructure.squeezeReason}</div>
                              </div>
                            )}
                            {microstructure.insiderTicker && (
                              <div style={{ background: "#080f1a", border: `1px solid ${microstructure.insiderDirection === "BULLISH" ? "#39ff1444" : "#ff2d5544"}`, borderRadius: 4, padding: 12 }}>
                                <div style={{ fontSize: 9, color: "#ffb800", fontFamily: "monospace", marginBottom: 4 }}>👤 INSIDER SIGNAL</div>
                                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                  <span style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 900, color: "#e8f4ff" }}>{microstructure.insiderTicker}</span>
                                  <span style={{ fontSize: 10, color: microstructure.insiderDirection === "BULLISH" ? "#39ff14" : "#ff2d55", fontFamily: "monospace" }}>{microstructure.insiderDirection}</span>
                                </div>
                                <div style={{ fontSize: 10, color: "#8aabb8", marginTop: 4 }}>{microstructure.insiderSignal}</div>
                              </div>
                            )}
                            {microstructure.optionsTicker && (
                              <div style={{ background: `${microstructure.optionsDirection === "CALL" ? "#39ff1411" : "#ff2d5511"}`, border: `1px solid ${microstructure.optionsDirection === "CALL" ? "#39ff1444" : "#ff2d5544"}`, borderRadius: 4, padding: 12 }}>
                                <div style={{ fontSize: 9, color: "#00d4ff", fontFamily: "monospace", marginBottom: 4 }}>⚡ UNUSUAL OPTIONS FLOW</div>
                                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                  <span style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 900, color: "#e8f4ff" }}>{microstructure.optionsTicker}</span>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: microstructure.optionsDirection === "CALL" ? "#39ff14" : "#ff2d55", fontFamily: "monospace" }}>{microstructure.optionsDirection}</span>
                                </div>
                                <div style={{ fontSize: 10, color: "#8aabb8", marginTop: 4 }}>{microstructure.unusualOptions}</div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* SEASONAL + CRYPTO */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                        {seasonal && seasonal.pattern && (
                          <div style={{ background: "#080f1a", border: "1px solid rgba(57,255,20,0.25)", borderRadius: 4, padding: 14 }}>
                            <div style={{ fontFamily: "monospace", fontSize: 10, color: "#39ff14", letterSpacing: 2, marginBottom: 10 }}>📊 SEASONAL PATTERN</div>
                            <div style={{ fontSize: 11, color: "#c8dff0", lineHeight: 1.6, marginBottom: 10 }}>{seasonal.pattern}</div>
                            {seasonal.ticker && (
                              <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 10px", background: `${seasonal.direction === "CALL" ? "#39ff1411" : "#ff2d5511"}`, borderRadius: 3 }}>
                                <span style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 900, color: "#e8f4ff" }}>{seasonal.ticker}</span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: seasonal.direction === "CALL" ? "#39ff14" : "#ff2d55", fontFamily: "monospace" }}>{seasonal.direction}</span>
                                <span style={{ fontSize: 10, color: "#ffb800", fontFamily: "monospace" }}>{seasonal.expiry}</span>
                                <span style={{ fontSize: 9, color: seasonal.confidence === "HIGH" ? "#ff2d55" : "#ffb800", fontFamily: "monospace" }}>{seasonal.confidence}</span>
                              </div>
                            )}
                          </div>
                        )}
                        {cryptoSignal && cryptoSignal.btcSignal && (
                          <div style={{ background: "#080f1a", border: "1px solid rgba(178,79,255,0.25)", borderRadius: 4, padding: 14 }}>
                            <div style={{ fontFamily: "monospace", fontSize: 10, color: "#b24fff", letterSpacing: 2, marginBottom: 10 }}>₿ CRYPTO → EQUITY SIGNAL</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: cryptoSignal.btcSignal === "BULLISH" ? "#39ff14" : cryptoSignal.btcSignal === "BEARISH" ? "#ff2d55" : "#ffb800", fontFamily: "monospace", marginBottom: 6 }}>BTC {cryptoSignal.btcSignal}</div>
                            <div style={{ fontSize: 11, color: "#8aabb8", marginBottom: 8 }}>{cryptoSignal.btcReason}</div>
                            <div style={{ fontSize: 11, color: "#c8dff0", marginBottom: 8 }}>{cryptoSignal.equityImpact}</div>
                            {cryptoSignal.play?.ticker && (
                              <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 10px", background: `${cryptoSignal.play.direction === "CALL" ? "#39ff1411" : "#ff2d5511"}`, borderRadius: 3 }}>
                                <span style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 900, color: "#e8f4ff" }}>{cryptoSignal.play.ticker}</span>
                                <span style={{ fontSize: 10, fontWeight: 700, color: cryptoSignal.play.direction === "CALL" ? "#39ff14" : "#ff2d55", fontFamily: "monospace" }}>{cryptoSignal.play.direction}</span>
                                <span style={{ fontSize: 10, color: "#ffb800", fontFamily: "monospace" }}>{cryptoSignal.play.expiry}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div style={{ padding: "12px 16px", background: "rgba(255,107,53,0.04)", border: "1px solid rgba(255,107,53,0.15)", borderRadius: 3, marginTop: 6 }}>
                        <div style={{ fontSize: 10, color: "#4a6d8c", lineHeight: 1.8 }}>
                          <span style={{ color: "#ff6b35" }}>⚠ IMPORTANT:</span> Power Intel analysis is AI-synthesized geopolitical research for educational purposes only. Psychographic profiles are analytical models, not definitive statements of intent. Not financial advice. Always verify on Questrade before trading.
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL */}
            {/* TRADES TAB */}
            {tab === "trades" && (
              <div style={{ height: "100%", overflowY: "auto", paddingBottom: 40 }}>
                <div style={{ background: "linear-gradient(135deg,rgba(255,45,85,0.1),rgba(255,45,85,0.03))", border: "1px solid rgba(255,45,85,0.3)", borderRadius: 4, padding: "14px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#ff2d55", letterSpacing: 3, marginBottom: 4 }}>◎ TOP 3 TRADE EXECUTION</div>
                    <div style={{ fontSize: 11, color: "#8aabb8" }}>Final output of the pipeline — 27 candidates → 9 scored → 3 validated with live Questrade data</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={runFullPipeline} disabled={pipelineRunning} style={{ background: pipelineRunning ? "#1a2d47" : "linear-gradient(135deg,#7b0000,#ff2d55)", color: pipelineRunning ? "#4a6d8c" : "#fff", border: "none", borderRadius: 3, padding: "9px 16px", fontSize: 11, fontWeight: 700, letterSpacing: 2, cursor: pipelineRunning ? "not-allowed" : "pointer", fontFamily: "monospace" }}>
                      {pipelineRunning ? pipelineStage : "◎ RUN PIPELINE"}
                    </button>
                    <button onClick={() => loadTrades(true)} disabled={loadingTrades} style={{ background: "rgba(255,45,85,0.1)", border: "1px solid rgba(255,45,85,0.4)", color: "#ff2d55", borderRadius: 3, padding: "9px 16px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "monospace" }}>
                      ⟳ REFRESH
                    </button>
                    {trades?.trades && <span style={{ fontFamily: "monospace", fontSize: 9, padding: "4px 10px", background: "rgba(57,255,20,0.1)", border: "1px solid rgba(57,255,20,0.3)", color: "#39ff14", borderRadius: 3 }}>✓ AUTO-LOGGED</span>}
                  </div>
                </div>

                {tradesError && <div style={{ padding: 12, background: "rgba(255,45,85,0.1)", border: "1px solid rgba(255,45,85,0.3)", borderRadius: 4, color: "#ff6b8a", fontSize: 12, fontFamily: "monospace", marginBottom: 16 }}>⚠ {tradesError}</div>}

                {!trades && !loadingTrades && !tradesError && (
                  <div style={{ textAlign: "center", padding: 60 }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>◎</div>
                    <div style={{ fontFamily: "monospace", fontSize: 14, color: "#ff2d55", letterSpacing: 3, marginBottom: 8 }}>NO TRADES GENERATED</div>
                    <div style={{ fontSize: 12, color: "#4a6d8c", marginBottom: 24 }}>Run the full pipeline to generate your top 3 validated trades</div>
                    <button onClick={runFullPipeline} style={{ background: "linear-gradient(135deg,#7b0000,#ff2d55)", color: "#fff", border: "none", borderRadius: 3, padding: "12px 28px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "monospace", letterSpacing: 2 }}>◎ RUN FULL PIPELINE</button>
                  </div>
                )}

                {trades?.trades && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {trades.trades.map((trade, i) => (
                      <div key={i} style={{ background: "#080f1a", border: "1px solid rgba(255,45,85,0.3)", borderRadius: 6, padding: 20 }}>
                        {/* Trade header */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ fontFamily: "monospace", fontSize: 24, fontWeight: 700, color: trade.direction === "CALL" ? "#39ff14" : "#ff2d55" }}>{trade.ticker}</div>
                            <div>
                              <span style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 700, color: trade.direction === "CALL" ? "#39ff14" : "#ff2d55", background: trade.direction === "CALL" ? "rgba(57,255,20,0.1)" : "rgba(255,45,85,0.1)", padding: "3px 10px", borderRadius: 3, marginRight: 6 }}>{trade.direction}</span>
                              <span style={{ fontSize: 11, fontFamily: "monospace", color: "#8aabb8" }}>Score: {trade.score}/100</span>
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontFamily: "monospace", fontSize: 11, color: "#ffd700", marginBottom: 2 }}>PROBABILITY</div>
                            <div style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 700, color: "#ffd700" }}>{trade.probability}</div>
                          </div>
                        </div>

                        {/* Live QT data */}
                        {trade.qtValidated ? (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, marginBottom: 14, background: "rgba(0,212,255,0.05)", border: "1px solid rgba(0,212,255,0.2)", borderRadius: 4, padding: 12 }}>
                            {[["CURRENT", "$" + (trade.currentPrice?.toFixed(2) || "—")], ["STRIKE", "$" + (trade.strike?.toFixed(0) || "—")], ["BID", "$" + (trade.bid?.toFixed(2) || "—")], ["ASK", "$" + (trade.ask?.toFixed(2) || "—")], ["MID", "$" + (trade.mid?.toFixed(2) || "—")]].map(([label, val]) => (
                              <div key={label} style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 9, fontFamily: "monospace", color: "#4a6d8c", marginBottom: 3 }}>{label}</div>
                                <div style={{ fontSize: 13, fontFamily: "monospace", color: "#00d4ff", fontWeight: 700 }}>{val}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: 10, color: "#4a6d8c", fontFamily: "monospace", marginBottom: 14 }}>⚠ Live QT data unavailable — connect Questrade to see real strikes</div>
                        )}

                        {/* Expiry + timing */}
                        <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 11, fontFamily: "monospace" }}>
                          <span style={{ color: "#8aabb8" }}>EXPIRY: <span style={{ color: "#e8f4ff" }}>{trade.expiry || "—"}</span></span>
                          <span style={{ color: "#8aabb8" }}>TIMING: <span style={{ color: "#e8f4ff" }}>{trade.timing || trade.urgency}</span></span>
                          {trade.iv ? <span style={{ color: "#8aabb8" }}>IV: <span style={{ color: "#ffb800" }}>{(trade.iv * 100).toFixed(0)}%</span></span> : null}
                          {trade.delta ? <span style={{ color: "#8aabb8" }}>DELTA: <span style={{ color: "#e8f4ff" }}>{trade.delta?.toFixed(2)}</span></span> : null}
                        </div>

                        {/* Thesis */}
                        <div style={{ fontSize: 12, color: "#c8dce8", lineHeight: 1.6, marginBottom: 12, paddingLeft: 10, borderLeft: "2px solid rgba(255,45,85,0.4)" }}>{trade.thesis || trade.catalyst}</div>

                        {/* Target / Stop */}
                        <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                          <div style={{ flex: 1, background: "rgba(57,255,20,0.05)", border: "1px solid rgba(57,255,20,0.2)", borderRadius: 3, padding: "8px 12px" }}>
                            <div style={{ fontSize: 9, fontFamily: "monospace", color: "#39ff14", marginBottom: 3 }}>TARGET</div>
                            <div style={{ fontSize: 16, fontFamily: "monospace", color: "#39ff14", fontWeight: 700 }}>{trade.targetPct || "+65%"}</div>
                          </div>
                          <div style={{ flex: 1, background: "rgba(255,45,85,0.05)", border: "1px solid rgba(255,45,85,0.2)", borderRadius: 3, padding: "8px 12px" }}>
                            <div style={{ fontSize: 9, fontFamily: "monospace", color: "#ff2d55", marginBottom: 3 }}>STOP</div>
                            <div style={{ fontSize: 16, fontFamily: "monospace", color: "#ff2d55", fontWeight: 700 }}>{trade.stopPct || "-35%"}</div>
                          </div>
                          {trade.hedge?.ticker && (
                            <div style={{ flex: 2, background: "rgba(255,184,0,0.05)", border: "1px solid rgba(255,184,0,0.2)", borderRadius: 3, padding: "8px 12px" }}>
                              <div style={{ fontSize: 9, fontFamily: "monospace", color: "#ffb800", marginBottom: 3 }}>HEDGE</div>
                              <div style={{ fontSize: 13, fontFamily: "monospace", color: "#ffb800", fontWeight: 700 }}>{trade.hedge.ticker} {trade.hedge.direction}</div>
                              <div style={{ fontSize: 10, color: "#8aabb8" }}>{trade.hedge.reason}</div>
                            </div>
                          )}
                        </div>

                        {/* Risk factors */}
                        {trade.riskFactors && <div style={{ fontSize: 10, color: "#4a6d8c", fontFamily: "monospace", padding: "6px 10px", background: "rgba(255,45,85,0.04)", borderRadius: 3 }}>⚠ RISKS: {trade.riskFactors}</div>}
                      </div>
                    ))}

                    <div style={{ fontSize: 10, color: "#4a6d8c", textAlign: "center", padding: "8px", lineHeight: 1.6 }}>
                      {trades.disclaimer} | Generated: {new Date(trades.timestamp).toLocaleString()}
                    </div>


                  </div>
                )}

                {/* PICK TRACKER */}
                <div style={{ marginTop: 24 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, cursor: "pointer" }} onClick={() => { setShowTracker(!showTracker); if (!trackerData) loadTrackerData(); }}>
                    <div style={{ fontFamily: "monospace", fontSize: 11, color: "#ffb800", letterSpacing: 3 }}>📋 PICK TRACKER ({trackerData?.stats?.total || trackedPicks.length} logged)</div>
                    <div style={{ fontSize: 11, color: "#4a6d8c", display: "flex", gap: 8, alignItems: "center" }}>
                      {trackerData?.stats && <>
                        <span style={{ color: "#39ff14" }}>{trackerData.stats.wins}W</span>
                        <span style={{ color: "#ff2d55" }}>{trackerData.stats.losses}L</span>
                        <span style={{ color: "#ffb800" }}>{trackerData.stats.open} OPEN</span>
                        {trackerData.stats.winRate !== null && <span style={{ color: "#ffd700", fontWeight: 700 }}>{trackerData.stats.winRate}% WR</span>}
                        {trackerData.stats.avgPnl !== null && <span style={{ color: trackerData.stats.avgPnl >= 0 ? "#39ff14" : "#ff2d55" }}>avg {trackerData.stats.avgPnl >= 0 ? "+" : ""}{trackerData.stats.avgPnl}%</span>}
                      </>}
                      <span>{showTracker ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {showTracker && (
                    <div>
                      {/* Analytics */}
                      {trackerData?.stats && trackerData.stats.closed >= 3 && (
                        <div style={{ background: "rgba(255,184,0,0.05)", border: "1px solid rgba(255,184,0,0.2)", borderRadius: 4, padding: 12, marginBottom: 12 }}>
                          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#ffb800", letterSpacing: 2, marginBottom: 10 }}>📊 PERFORMANCE ANALYTICS</div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                            <div style={{ background: "#080f1a", borderRadius: 3, padding: "8px 10px" }}>
                              <div style={{ fontSize: 9, fontFamily: "monospace", color: "#4a6d8c", marginBottom: 3 }}>CALL WIN RATE</div>
                              <div style={{ fontSize: 16, fontFamily: "monospace", fontWeight: 700, color: (trackerData.stats.callWinRate || 0) >= 50 ? "#39ff14" : "#ff2d55" }}>{trackerData.stats.callWinRate !== null ? trackerData.stats.callWinRate + "%" : "—"}</div>
                            </div>
                            <div style={{ background: "#080f1a", borderRadius: 3, padding: "8px 10px" }}>
                              <div style={{ fontSize: 9, fontFamily: "monospace", color: "#4a6d8c", marginBottom: 3 }}>PUT WIN RATE</div>
                              <div style={{ fontSize: 16, fontFamily: "monospace", fontWeight: 700, color: (trackerData.stats.putWinRate || 0) >= 50 ? "#39ff14" : "#ff2d55" }}>{trackerData.stats.putWinRate !== null ? trackerData.stats.putWinRate + "%" : "—"}</div>
                            </div>
                          </div>
                          {trackerData.stats.weights && (
                            <div style={{ fontSize: 10, color: "#8aabb8", lineHeight: 1.8, borderTop: "1px solid rgba(255,184,0,0.1)", paddingTop: 8 }}>
                              <div style={{ color: "#ffb800", fontFamily: "monospace", fontSize: 9, marginBottom: 4 }}>PIPELINE FEEDBACK ACTIVE</div>
                              {trackerData.stats.weights.bestUrgency && <div>Best timing: <span style={{ color: "#e8f4ff" }}>{trackerData.stats.weights.bestUrgency}</span></div>}
                              {trackerData.stats.weights.bestSector && <div>Best sector: <span style={{ color: "#39ff14" }}>{trackerData.stats.weights.bestSector}</span></div>}
                              {trackerData.stats.weights.worstSector && <div>Avoid sector: <span style={{ color: "#ff2d55" }}>{trackerData.stats.weights.worstSector}</span></div>}
                            </div>
                          )}
                        </div>
                      )}
                      {trackedPicks.length === 0 && !loadingTracker && (
                        <div style={{ fontSize: 11, color: "#4a6d8c", fontStyle: "italic", padding: 12 }}>No picks logged yet. Run the pipeline — trades auto-log after every run.</div>
                      )}
                      {loadingTracker && <div style={{ fontSize: 11, color: "#4a6d8c", padding: 12 }}>Loading tracker...</div>}
                      {trackedPicks.map((pick) => (
                        <div key={pick.id} style={{ background: "#080f1a", border: `1px solid ${pick.outcome === "WIN" ? "rgba(57,255,20,0.3)" : pick.outcome === "LOSS" ? "rgba(255,45,85,0.3)" : "rgba(74,109,140,0.3)"}`, borderRadius: 4, padding: 12, marginBottom: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <span style={{ fontFamily: "monospace", fontSize: 15, fontWeight: 700, color: pick.direction === "CALL" ? "#39ff14" : "#ff2d55" }}>{pick.ticker}</span>
                              <span style={{ fontFamily: "monospace", fontSize: 10, color: pick.direction === "CALL" ? "#39ff14" : "#ff2d55" }}>{pick.direction}</span>
                              {pick.strike && <span style={{ fontSize: 10, color: "#8aabb8", fontFamily: "monospace" }}>${pick.strike} strike</span>}
                              <span style={{ fontSize: 10, color: "#4a6d8c", fontFamily: "monospace" }}>exp {pick.expiry}</span>
                              <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 2, background: pick.outcome === "WIN" ? "rgba(57,255,20,0.1)" : pick.outcome === "LOSS" ? "rgba(255,45,85,0.1)" : "rgba(255,184,0,0.1)", color: pick.outcome === "WIN" ? "#39ff14" : pick.outcome === "LOSS" ? "#ff2d55" : "#ffb800", fontFamily: "monospace" }}>{pick.outcome}</span>
                              {pick.pnlPct !== null && <span style={{ fontSize: 11, fontWeight: 700, color: pick.pnlPct >= 0 ? "#39ff14" : "#ff2d55", fontFamily: "monospace" }}>{pick.pnlPct >= 0 ? "+" : ""}{pick.pnlPct}%</span>}
                            </div>
                            <div style={{ fontSize: 10, color: "#4a6d8c", fontFamily: "monospace" }}>{new Date(pick.entryDate).toLocaleDateString()}</div>
                          </div>
                          {pick.thesis && <div style={{ fontSize: 10, color: "#8aabb8", marginTop: 6, lineHeight: 1.5 }}>{pick.thesis.slice(0, 120)}{pick.thesis.length > 120 ? "..." : ""}</div>}
                          {pick.entryPrice && <div style={{ fontSize: 10, color: "#4a6d8c", marginTop: 4, fontFamily: "monospace" }}>Entry: ${pick.entryPrice} · Target: {pick.targetPct} · Stop: {pick.stopPct}</div>}
                          {pick.outcome === "OPEN" && (
                            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                              <input placeholder="Exit price" style={{ background: "#0d1829", border: "1px solid #1a3a5c", color: "#e8f4ff", borderRadius: 3, padding: "4px 8px", fontSize: 11, fontFamily: "monospace", width: 90, outline: "none" }}
                                onChange={e => setTrackerInput(p => ({...p, [pick.id]: {...p[pick.id], exitPrice: parseFloat(e.target.value)}}))} />
                              <input placeholder="Notes" style={{ background: "#0d1829", border: "1px solid #1a3a5c", color: "#e8f4ff", borderRadius: 3, padding: "4px 8px", fontSize: 11, fontFamily: "monospace", flex: 1, minWidth: 100, outline: "none" }}
                                onChange={e => setTrackerInput(p => ({...p, [pick.id]: {...p[pick.id], notes: e.target.value}}))} />
                              <button onClick={() => updateOutcome(pick.id, "WIN", trackerInput[pick.id]?.exitPrice, trackerInput[pick.id]?.notes || "")} style={{ background: "rgba(57,255,20,0.1)", border: "1px solid rgba(57,255,20,0.3)", color: "#39ff14", borderRadius: 3, padding: "4px 12px", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "monospace" }}>WIN</button>
                              <button onClick={() => updateOutcome(pick.id, "LOSS", trackerInput[pick.id]?.exitPrice, trackerInput[pick.id]?.notes || "")} style={{ background: "rgba(255,45,85,0.1)", border: "1px solid rgba(255,45,85,0.3)", color: "#ff2d55", borderRadius: 3, padding: "4px 12px", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "monospace" }}>LOSS</button>
                              <button onClick={() => updateOutcome(pick.id, "SCRATCH", trackerInput[pick.id]?.exitPrice, trackerInput[pick.id]?.notes || "")} style={{ background: "rgba(74,109,140,0.1)", border: "1px solid rgba(74,109,140,0.3)", color: "#8aabb8", borderRadius: 3, padding: "4px 12px", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "monospace" }}>SCRATCH</button>
                            </div>
                          )}
                        </div>
                      ))}

                    </div>
                  )}
                </div>
              </div>
            )}

            {/* UNUSUAL FLOW TAB */}
            {tab === "flow" && (
              <div style={{ height: "100%", overflowY: "auto", paddingBottom: 40 }}>
                <div style={{ background: "linear-gradient(135deg,rgba(178,79,255,0.1),rgba(178,79,255,0.03))", border: "1px solid rgba(178,79,255,0.3)", borderRadius: 4, padding: "14px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#b24fff", letterSpacing: 3, marginBottom: 4 }}>⚡ UNUSUAL OPTIONS FLOW</div>
                    <div style={{ fontSize: 11, color: "#8aabb8" }}>Smart money detector — Vol/OI ratio spikes signal institutional positioning</div>
                  </div>
                  <button onClick={() => loadUnusualFlow(true)} disabled={loadingFlow} style={{ background: loadingFlow ? "#1a2d47" : "rgba(178,79,255,0.15)", border: "1px solid rgba(178,79,255,0.4)", color: loadingFlow ? "#4a6d8c" : "#b24fff", borderRadius: 3, padding: "9px 18px", fontSize: 11, fontWeight: 700, cursor: loadingFlow ? "not-allowed" : "pointer", fontFamily: "monospace" }}>
                    {loadingFlow ? "SCANNING..." : "⚡ SCAN FLOW"}
                  </button>
                </div>

                {flowError && <div style={{ padding: 12, background: "rgba(178,79,255,0.1)", border: "1px solid rgba(178,79,255,0.3)", borderRadius: 4, color: "#b24fff", fontSize: 12, fontFamily: "monospace", marginBottom: 16 }}>⚠ {flowError}</div>}

                {!unusualFlow && !loadingFlow && (
                  <div style={{ textAlign: "center", padding: 60 }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>⚡</div>
                    <div style={{ fontFamily: "monospace", fontSize: 14, color: "#b24fff", letterSpacing: 3, marginBottom: 8 }}>NO FLOW DATA</div>
                    <div style={{ fontSize: 12, color: "#4a6d8c", marginBottom: 24 }}>Scan for unusual options activity across your watchlist and core tickers</div>
                    <button onClick={() => loadUnusualFlow(true)} style={{ background: "rgba(178,79,255,0.15)", border: "1px solid rgba(178,79,255,0.4)", color: "#b24fff", borderRadius: 3, padding: "12px 28px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "monospace", letterSpacing: 2 }}>⚡ SCAN NOW</button>
                  </div>
                )}

                {unusualFlow && (
                  <div>
                    {/* Summary banner */}
                    <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
                      {[["TICKERS SCANNED", unusualFlow.tickersScanned], ["SIGNALS FOUND", unusualFlow.signals?.length || 0], ["QT POWERED", unusualFlow.qtPowered ? "YES" : "GDELT"]].map(([label, val]) => (
                        <div key={label} style={{ flex: 1, minWidth: 100, background: "#080f1a", border: "1px solid rgba(178,79,255,0.2)", borderRadius: 4, padding: "8px 12px", textAlign: "center" }}>
                          <div style={{ fontFamily: "monospace", fontSize: 9, color: "#4a6d8c", marginBottom: 4 }}>{label}</div>
                          <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700, color: "#b24fff" }}>{val}</div>
                        </div>
                      ))}
                    </div>

                    {/* Claude interpretation */}
                    {unusualFlow.interpretation && (
                      <div style={{ background: "#080f1a", border: "1px solid rgba(178,79,255,0.3)", borderRadius: 6, padding: 16, marginBottom: 16 }}>
                        <div style={{ fontFamily: "monospace", fontSize: 10, color: "#b24fff", letterSpacing: 3, marginBottom: 12 }}>SMART MONEY INTERPRETATION</div>
                        <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                          <div style={{ flex: 1, background: unusualFlow.interpretation.marketBias === "BULLISH" ? "rgba(57,255,20,0.05)" : unusualFlow.interpretation.marketBias === "BEARISH" ? "rgba(255,45,85,0.05)" : "rgba(74,109,140,0.05)", border: `1px solid ${unusualFlow.interpretation.marketBias === "BULLISH" ? "rgba(57,255,20,0.2)" : unusualFlow.interpretation.marketBias === "BEARISH" ? "rgba(255,45,85,0.2)" : "rgba(74,109,140,0.2)"}`, borderRadius: 4, padding: "8px 12px" }}>
                            <div style={{ fontFamily: "monospace", fontSize: 9, color: "#4a6d8c", marginBottom: 4 }}>MARKET BIAS</div>
                            <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700, color: unusualFlow.interpretation.marketBias === "BULLISH" ? "#39ff14" : unusualFlow.interpretation.marketBias === "BEARISH" ? "#ff2d55" : "#ffb800" }}>{unusualFlow.interpretation.marketBias}</div>
                          </div>
                        </div>
                        {unusualFlow.interpretation.smartMoneySummary && (
                          <div style={{ fontSize: 12, color: "#c8dce8", lineHeight: 1.6, marginBottom: 10, paddingLeft: 10, borderLeft: "2px solid rgba(178,79,255,0.4)" }}>{unusualFlow.interpretation.smartMoneySummary}</div>
                        )}
                        {unusualFlow.interpretation.topSignal?.ticker && (
                          <div style={{ background: "rgba(178,79,255,0.05)", borderRadius: 4, padding: "10px 12px", marginBottom: 8 }}>
                            <div style={{ fontFamily: "monospace", fontSize: 10, color: "#b24fff", marginBottom: 6 }}>TOP SIGNAL</div>
                            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 4 }}>
                              <span style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700, color: unusualFlow.interpretation.topSignal.direction === "BULLISH" ? "#39ff14" : "#ff2d55" }}>{unusualFlow.interpretation.topSignal.ticker}</span>
                              <span style={{ fontFamily: "monospace", fontSize: 10, padding: "2px 8px", borderRadius: 2, background: unusualFlow.interpretation.topSignal.direction === "BULLISH" ? "rgba(57,255,20,0.1)" : "rgba(255,45,85,0.1)", color: unusualFlow.interpretation.topSignal.direction === "BULLISH" ? "#39ff14" : "#ff2d55" }}>{unusualFlow.interpretation.topSignal.direction}</span>
                              <span style={{ fontSize: 10, color: "#ffb800", fontFamily: "monospace" }}>{unusualFlow.interpretation.topSignal.urgency}</span>
                            </div>
                            <div style={{ fontSize: 11, color: "#8aabb8" }}>{unusualFlow.interpretation.topSignal.thesis}</div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Raw signals */}
                    {unusualFlow.signals?.length > 0 && (
                      <div>
                        <div style={{ fontFamily: "monospace", fontSize: 10, color: "#4a6d8c", letterSpacing: 3, marginBottom: 10 }}>RAW SIGNALS ({unusualFlow.signals.length})</div>
                        {unusualFlow.signals.map((s, i) => (
                          <div key={i} style={{ background: "#080f1a", border: `1px solid ${s.sentiment === "BULLISH" ? "rgba(57,255,20,0.2)" : s.sentiment === "BEARISH" ? "rgba(255,45,85,0.2)" : "rgba(74,109,140,0.2)"}`, borderRadius: 4, padding: 12, marginBottom: 8, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                            <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700, color: s.optionType === "CALL" ? "#39ff14" : "#ff2d55", minWidth: 60 }}>{s.ticker}</div>
                            <span style={{ fontFamily: "monospace", fontSize: 10, padding: "2px 8px", borderRadius: 2, background: s.optionType === "CALL" ? "rgba(57,255,20,0.1)" : "rgba(255,45,85,0.1)", color: s.optionType === "CALL" ? "#39ff14" : "#ff2d55" }}>{s.optionType}</span>
                            {s.volOiRatio && <span style={{ fontFamily: "monospace", fontSize: 11, color: "#ffd700" }}>Vol/OI: {s.volOiRatio}x</span>}
                            {s.strikePrice && <span style={{ fontFamily: "monospace", fontSize: 11, color: "#8aabb8" }}>${s.strikePrice} strike</span>}
                            {s.expiry && <span style={{ fontFamily: "monospace", fontSize: 10, color: "#4a6d8c" }}>exp {s.expiry}</span>}
                            {s.premium && <span style={{ fontFamily: "monospace", fontSize: 11, color: "#ffb800" }}>${Math.round(s.premium/1000)}K premium</span>}
                            <span style={{ fontFamily: "monospace", fontSize: 10, padding: "2px 6px", borderRadius: 2, background: s.sentiment === "BULLISH" ? "rgba(57,255,20,0.1)" : s.sentiment === "BEARISH" ? "rgba(255,45,85,0.1)" : "rgba(74,109,140,0.1)", color: s.sentiment === "BULLISH" ? "#39ff14" : s.sentiment === "BEARISH" ? "#ff2d55" : "#8aabb8", marginLeft: "auto" }}>{s.sentiment}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ fontSize: 10, color: "#4a6d8c", marginTop: 12, fontFamily: "monospace" }}>
                      Scanned: {new Date(unusualFlow.timestamp).toLocaleString()} · Vol/OI threshold: 3x+ · Min premium: $10K · {unusualFlow.qtPowered ? "Powered by Questrade live data" : "Powered by GDELT signals (connect Questrade for live data)"}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* INSIDER FILINGS TAB */}
            {tab === "insider" && (
              <div style={{ height: "100%", overflowY: "auto", paddingBottom: 40 }}>
                <div style={{ background: "linear-gradient(135deg,rgba(255,140,0,0.08),rgba(255,140,0,0.02))", border: "1px solid rgba(255,140,0,0.3)", borderRadius: 4, padding: "14px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#ff8c00", letterSpacing: 3, marginBottom: 4 }}>🔎 SEC FORM 4 INSIDER DETECTOR</div>
                    <div style={{ fontSize: 11, color: "#8aabb8" }}>When CEOs and CFOs buy their own stock — the strongest signal in the market. SEC Form 4 filings analyzed in real time.</div>
                  </div>
                  <button onClick={() => loadInsiderFilings(true)} disabled={loadingInsider} style={{ background: loadingInsider ? "#1a2d47" : "rgba(255,140,0,0.15)", border: "1px solid rgba(255,140,0,0.4)", color: loadingInsider ? "#4a6d8c" : "#ff8c00", borderRadius: 3, padding: "9px 18px", fontSize: 11, fontWeight: 700, cursor: loadingInsider ? "not-allowed" : "pointer", fontFamily: "monospace" }}>
                    {loadingInsider ? "SCANNING..." : "🔎 SCAN INSIDERS"}
                  </button>
                </div>

                {!insiderData && !loadingInsider && (
                  <div style={{ textAlign: "center", padding: 60 }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>🔎</div>
                    <div style={{ fontFamily: "monospace", fontSize: 14, color: "#ff8c00", letterSpacing: 3, marginBottom: 8 }}>SEC FORM 4 INSIDER TRACKER</div>
                    <div style={{ fontSize: 12, color: "#4a6d8c", marginBottom: 24 }}>Scans SEC EDGAR and Yahoo Finance for insider buying and selling activity across your watchlist and key tickers</div>
                    <button onClick={() => loadInsiderFilings(true)} style={{ background: "rgba(255,140,0,0.15)", border: "1px solid rgba(255,140,0,0.4)", color: "#ff8c00", borderRadius: 3, padding: "12px 28px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "monospace", letterSpacing: 2 }}>🔎 SCAN NOW</button>
                  </div>
                )}

                {insiderData && (
                  <div>
                    {/* Summary */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 14 }}>
                      {[
                        ["TICKERS SCANNED", insiderData.tickersScanned, "#ff8c00"],
                        ["STRONG BUYS", insiderData.strongBuys?.length || 0, "#39ff14"],
                        ["INSIDER SELLS", insiderData.sells?.length || 0, "#ff2d55"],
                        ["OVERALL SENTIMENT", insiderData.interpretation?.overallSentiment || "—", insiderData.interpretation?.overallSentiment === "BULLISH" ? "#39ff14" : insiderData.interpretation?.overallSentiment === "BEARISH" ? "#ff2d55" : "#ffb800"],
                      ].map(([label, val, color]) => (
                        <div key={label} style={{ background: "#080f1a", border: "1px solid rgba(255,140,0,0.15)", borderRadius: 4, padding: "8px 10px", textAlign: "center" }}>
                          <div style={{ fontFamily: "monospace", fontSize: 8, color: "#4a6d8c", marginBottom: 3 }}>{label}</div>
                          <div style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color }}>{val}</div>
                        </div>
                      ))}
                    </div>

                    {/* Claude interpretation */}
                    {insiderData.interpretation && (
                      <div style={{ background: "#080f1a", border: "1px solid rgba(255,140,0,0.25)", borderRadius: 6, padding: 14, marginBottom: 14 }}>
                        <div style={{ fontFamily: "monospace", fontSize: 10, color: "#ff8c00", letterSpacing: 2, marginBottom: 10 }}>INSIDER INTELLIGENCE ANALYSIS</div>

                        {insiderData.interpretation.bestTrade && (
                          <div style={{ background: "rgba(255,140,0,0.08)", border: "1px solid rgba(255,140,0,0.3)", borderRadius: 4, padding: "10px 12px", marginBottom: 10 }}>
                            <div style={{ fontFamily: "monospace", fontSize: 9, color: "#ff8c00", marginBottom: 4 }}>BEST INSIDER TRADE</div>
                            <div style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: "#ffd700" }}>{insiderData.interpretation.bestTrade}</div>
                          </div>
                        )}

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                          {insiderData.interpretation.topBuy?.ticker && (
                            <div style={{ background: "rgba(57,255,20,0.05)", border: "1px solid rgba(57,255,20,0.2)", borderRadius: 4, padding: 10 }}>
                              <div style={{ fontFamily: "monospace", fontSize: 9, color: "#39ff14", marginBottom: 4 }}>TOP INSIDER BUY</div>
                              <div style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: "#39ff14", marginBottom: 4 }}>{insiderData.interpretation.topBuy.ticker}</div>
                              <div style={{ fontSize: 10, color: "#8aabb8", marginBottom: 3 }}>{insiderData.interpretation.topBuy.signal}</div>
                              {insiderData.interpretation.topBuy.urgency && <div style={{ fontFamily: "monospace", fontSize: 9, color: "#ffb800" }}>{insiderData.interpretation.topBuy.urgency}</div>}
                            </div>
                          )}
                          {insiderData.interpretation.topSell?.ticker && (
                            <div style={{ background: "rgba(255,45,85,0.05)", border: "1px solid rgba(255,45,85,0.2)", borderRadius: 4, padding: 10 }}>
                              <div style={{ fontFamily: "monospace", fontSize: 9, color: "#ff2d55", marginBottom: 4 }}>TOP INSIDER SELL</div>
                              <div style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: "#ff2d55", marginBottom: 4 }}>{insiderData.interpretation.topSell.ticker}</div>
                              <div style={{ fontSize: 10, color: "#8aabb8" }}>{insiderData.interpretation.topSell.signal}</div>
                            </div>
                          )}
                        </div>

                        {insiderData.interpretation.contrarianInsight && (
                          <div style={{ fontSize: 11, color: "#c8dce8", lineHeight: 1.6, paddingLeft: 10, borderLeft: "2px solid rgba(255,140,0,0.4)" }}>
                            {insiderData.interpretation.contrarianInsight}
                          </div>
                        )}
                        {insiderData.interpretation.clusterBuy && (
                          <div style={{ marginTop: 8, fontSize: 11, color: "#39ff14" }}>CLUSTER BUY: {insiderData.interpretation.clusterBuy}</div>
                        )}
                        {insiderData.interpretation.clusterSell && (
                          <div style={{ marginTop: 4, fontSize: 11, color: "#ff2d55" }}>CLUSTER SELL: {insiderData.interpretation.clusterSell}</div>
                        )}
                      </div>
                    )}

                    {/* Strong buy signals */}
                    {insiderData.strongBuys?.length > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontFamily: "monospace", fontSize: 10, color: "#39ff14", letterSpacing: 3, marginBottom: 8 }}>INSIDER BUY SIGNALS → PIPELINE (3x boost)</div>
                        {insiderData.strongBuys.map((d, i) => (
                          <div key={i} style={{ background: "rgba(57,255,20,0.04)", border: "1px solid rgba(57,255,20,0.2)", borderRadius: 4, padding: 12, marginBottom: 8 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <span style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700, color: "#39ff14" }}>{d.ticker}</span>
                                <span style={{ fontFamily: "monospace", fontSize: 10, padding: "2px 8px", borderRadius: 2, background: d.signal === "STRONG_BUY" ? "rgba(57,255,20,0.15)" : "rgba(57,255,20,0.08)", color: "#39ff14" }}>{d.signal.replace("_", " ")}</span>
                              </div>
                              <div style={{ display: "flex", gap: 6 }}>
                                <span style={{ fontFamily: "monospace", fontSize: 9, color: "#39ff14" }}>{d.execBuys} exec buy{d.execBuys !== 1 ? "s" : ""}</span>
                                <span style={{ fontFamily: "monospace", fontSize: 9, color: "#4a6d8c" }}>{d.recentBuys} total</span>
                              </div>
                            </div>
                            {d.biggestBuy && (
                              <div style={{ fontSize: 11, color: "#8aabb8" }}>
                                Biggest: {d.biggestBuy.name} ({d.biggestBuy.relation}) — {d.biggestBuy.shares?.toLocaleString()} shares
                                {d.biggestBuy.value > 0 && " ($" + Math.round(d.biggestBuy.value / 1000) + "K)"}
                                {d.biggestBuy.date && " on " + d.biggestBuy.date}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Sell signals */}
                    {insiderData.sells?.length > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontFamily: "monospace", fontSize: 10, color: "#ff2d55", letterSpacing: 3, marginBottom: 8 }}>INSIDER SELL SIGNALS (score reduced 40%)</div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {insiderData.sells.map(d => (
                            <div key={d.ticker} style={{ background: "rgba(255,45,85,0.05)", border: "1px solid rgba(255,45,85,0.2)", borderRadius: 4, padding: "8px 12px" }}>
                              <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#ff2d55" }}>{d.ticker}</div>
                              <div style={{ fontFamily: "monospace", fontSize: 9, color: "#4a6d8c" }}>{d.recentSells} recent sells</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Full table */}
                    <div style={{ fontFamily: "monospace", fontSize: 10, color: "#ff8c00", letterSpacing: 3, marginBottom: 8 }}>ALL INSIDER ACTIVITY</div>
                    {insiderData.insiderData?.map((d, i) => (
                      <div key={i} style={{ background: "#080f1a", border: `1px solid ${d.signal === "STRONG_BUY" || d.signal === "BUY" ? "rgba(57,255,20,0.15)" : d.signal === "SELL" ? "rgba(255,45,85,0.15)" : "rgba(74,109,140,0.1)"}`, borderRadius: 4, padding: 10, marginBottom: 6 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: d.signal.includes("BUY") ? "#39ff14" : d.signal === "SELL" ? "#ff2d55" : "#8aabb8" }}>{d.ticker}</span>
                            <span style={{ fontFamily: "monospace", fontSize: 9, color: "#4a6d8c" }}>{d.recentBuys}B / {d.recentSells}S</span>
                            {d.execBuys > 0 && <span style={{ fontFamily: "monospace", fontSize: 9, color: "#ffd700" }}>{d.execBuys} exec</span>}
                          </div>
                          <span style={{ fontFamily: "monospace", fontSize: 9, padding: "1px 6px", borderRadius: 2, background: d.signal.includes("BUY") ? "rgba(57,255,20,0.1)" : d.signal === "SELL" ? "rgba(255,45,85,0.1)" : "rgba(74,109,140,0.1)", color: d.signal.includes("BUY") ? "#39ff14" : d.signal === "SELL" ? "#ff2d55" : "#8aabb8" }}>{d.signal.replace("_", " ")}</span>
                        </div>
                      </div>
                    ))}

                    <div style={{ fontSize: 9, color: "#4a6d8c", fontFamily: "monospace", marginTop: 8 }}>
                      Scanned: {new Date(insiderData.timestamp).toLocaleString()} · Sources: SEC EDGAR + Yahoo Finance · Insider buy signals injected into pipeline (3x boost)
                      <button onClick={() => loadInsiderFilings(true)} style={{ marginLeft: 8, background: "none", border: "none", color: "#4a6d8c", cursor: "pointer", fontSize: 9, fontFamily: "monospace" }}>⟳ refresh</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* PAPER TRADING TAB */}
            {tab === "paper" && (
              <div style={{ height: "100%", overflowY: "auto", paddingBottom: 40 }}>
                <div style={{ background: "linear-gradient(135deg,rgba(0,255,200,0.08),rgba(0,255,200,0.02))", border: "1px solid rgba(0,255,200,0.3)", borderRadius: 4, padding: "14px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#00ffc8", letterSpacing: 3, marginBottom: 4 }}>📋 PAPER TRADING SIMULATION</div>
                    <div style={{ fontSize: 11, color: "#8aabb8" }}>3-tier track record — Tier 1: Final 3 picks · Tier 2: Top 9 · Tier 3: All 27 candidates · Auto-logged every pipeline run</div>
                  </div>
                  <button onClick={loadPaperBook} disabled={loadingPaper} style={{ background: loadingPaper ? "#1a2d47" : "rgba(0,255,200,0.15)", border: "1px solid rgba(0,255,200,0.4)", color: loadingPaper ? "#4a6d8c" : "#00ffc8", borderRadius: 3, padding: "9px 18px", fontSize: 11, fontWeight: 700, cursor: loadingPaper ? "not-allowed" : "pointer", fontFamily: "monospace" }}>
                    {loadingPaper ? "LOADING..." : "⟳ REFRESH"}
                  </button>
                </div>

                {!paperBook && !loadingPaper && (
                  <div style={{ textAlign: "center", padding: 60 }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
                    <div style={{ fontFamily: "monospace", fontSize: 14, color: "#00ffc8", letterSpacing: 3, marginBottom: 8 }}>PAPER TRADING BOOK</div>
                    <div style={{ fontSize: 12, color: "#4a6d8c", marginBottom: 8 }}>Automatically logs all 27 pipeline candidates after every run</div>
                    <div style={{ fontSize: 11, color: "#4a6d8c", marginBottom: 24 }}>Run the pipeline to start building your verified track record</div>
                    <button onClick={loadPaperBook} style={{ background: "rgba(0,255,200,0.15)", border: "1px solid rgba(0,255,200,0.4)", color: "#00ffc8", borderRadius: 3, padding: "12px 28px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "monospace", letterSpacing: 2 }}>📋 LOAD BOOK</button>
                  </div>
                )}

                {paperBook && (
                  <div>
                    {/* Stats summary */}
                    {paperBook.stats && (
                      <div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 12 }}>
                          {[
                            ["TOTAL TRADES", paperBook.stats.totalTrades, "#00ffc8"],
                            ["OPEN", paperBook.stats.openTrades, "#ffb800"],
                            ["CLOSED", paperBook.stats.closedTrades, "#8aabb8"],
                            ["OVERALL WIN%", paperBook.stats.overallWinRate !== null ? paperBook.stats.overallWinRate + "%" : "—", paperBook.stats.overallWinRate >= 70 ? "#39ff14" : paperBook.stats.overallWinRate >= 50 ? "#ffb800" : "#ff2d55"],
                          ].map(([label, val, color]) => (
                            <div key={label} style={{ background: "#080f1a", border: "1px solid rgba(0,255,200,0.15)", borderRadius: 4, padding: "8px 10px", textAlign: "center" }}>
                              <div style={{ fontFamily: "monospace", fontSize: 8, color: "#4a6d8c", marginBottom: 3 }}>{label}</div>
                              <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700, color }}>{val}</div>
                            </div>
                          ))}
                        </div>

                        {/* Tier win rates */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                          {[["TIER 1 WIN% (Final 3)", paperBook.stats.tier1WinRate, "#39ff14"], ["TIER 2 WIN% (Top 9)", paperBook.stats.tier2WinRate, "#00ffc8"], ["TIER 3 WIN% (All 27)", paperBook.stats.tier3WinRate, "#8aabb8"]].map(([label, val, color]) => (
                            <div key={label} style={{ background: "#080f1a", border: "1px solid rgba(0,255,200,0.1)", borderRadius: 4, padding: "8px 10px", textAlign: "center" }}>
                              <div style={{ fontFamily: "monospace", fontSize: 8, color: "#4a6d8c", marginBottom: 3 }}>{label}</div>
                              <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700, color: color }}>{val !== null ? val + "%" : "—"}</div>
                            </div>
                          ))}
                        </div>

                        {/* Trajectory */}
                        {(paperBook.stats.last10WinRate !== null || paperBook.stats.last20WinRate !== null) && (
                          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                            {[["LAST 10 WIN%", paperBook.stats.last10WinRate], ["LAST 20 WIN%", paperBook.stats.last20WinRate], ["CALL WIN%", paperBook.stats.byDirection?.call], ["PUT WIN%", paperBook.stats.byDirection?.put]].map(([label, val]) => val !== null && (
                              <div key={label} style={{ flex: 1, background: "#080f1a", border: "1px solid rgba(0,255,200,0.1)", borderRadius: 4, padding: "6px 10px", textAlign: "center" }}>
                                <div style={{ fontFamily: "monospace", fontSize: 8, color: "#4a6d8c", marginBottom: 2 }}>{label}</div>
                                <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: val >= 70 ? "#39ff14" : val >= 50 ? "#ffb800" : "#ff2d55" }}>{val}%</div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Signal performance */}
                        {paperBook.stats.signalPerformance?.length > 0 && (
                          <div style={{ background: "#080f1a", border: "1px solid rgba(0,255,200,0.15)", borderRadius: 4, padding: 12, marginBottom: 12 }}>
                            <div style={{ fontFamily: "monospace", fontSize: 9, color: "#00ffc8", letterSpacing: 2, marginBottom: 8 }}>SIGNAL WIN RATES — WHAT'S ACTUALLY WORKING</div>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {paperBook.stats.signalPerformance.map(s => (
                                <div key={s.signal} style={{ background: s.winRate >= 70 ? "rgba(57,255,20,0.08)" : s.winRate >= 50 ? "rgba(255,184,0,0.08)" : "rgba(255,45,85,0.08)", border: `1px solid ${s.winRate >= 70 ? "rgba(57,255,20,0.2)" : s.winRate >= 50 ? "rgba(255,184,0,0.2)" : "rgba(255,45,85,0.2)"}`, borderRadius: 3, padding: "4px 10px", textAlign: "center" }}>
                                  <div style={{ fontFamily: "monospace", fontSize: 8, color: "#4a6d8c" }}>{s.signal}</div>
                                  <div style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: s.winRate >= 70 ? "#39ff14" : s.winRate >= 50 ? "#ffb800" : "#ff2d55" }}>{s.winRate}%</div>
                                  <div style={{ fontFamily: "monospace", fontSize: 8, color: "#4a6d8c" }}>{s.total} trades</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Filter */}
                    <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                      {[["all", "ALL"], ["1", "TIER 1"], ["2", "TIER 2"], ["3", "TIER 3"], ["OPEN", "OPEN"], ["WIN", "WINS"], ["LOSS", "LOSSES"]].map(([val, label]) => (
                        <button key={val} onClick={() => setPaperFilter(val)} style={{ background: paperFilter === val ? "rgba(0,255,200,0.15)" : "transparent", border: `1px solid ${paperFilter === val ? "rgba(0,255,200,0.4)" : "rgba(74,109,140,0.3)"}`, color: paperFilter === val ? "#00ffc8" : "#4a6d8c", borderRadius: 3, padding: "4px 10px", fontSize: 9, fontWeight: 700, cursor: "pointer", fontFamily: "monospace" }}>{label}</button>
                      ))}
                    </div>

                    {/* Trade list */}
                    {(paperBook.trades || [])
                      .filter(t => paperFilter === "all" ? true : paperFilter === "1" ? t.tier === 1 : paperFilter === "2" ? t.tier === 2 : paperFilter === "3" ? t.tier === 3 : t.outcome === paperFilter || (!t.outcome && paperFilter === "OPEN"))
                      .slice(0, 50)
                      .map((t, i) => (
                      <div key={i} style={{ background: "#080f1a", border: `1px solid ${t.outcome === "WIN" ? "rgba(57,255,20,0.2)" : t.outcome === "LOSS" ? "rgba(255,45,85,0.2)" : t.outcome === "SCRATCH" ? "rgba(74,109,140,0.2)" : "rgba(0,255,200,0.1)"}`, borderRadius: 4, padding: 10, marginBottom: 6 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: t.direction === "CALL" ? "#39ff14" : "#ff2d55" }}>{t.ticker}</span>
                            <span style={{ fontFamily: "monospace", fontSize: 9, padding: "1px 5px", borderRadius: 2, background: t.direction === "CALL" ? "rgba(57,255,20,0.1)" : "rgba(255,45,85,0.1)", color: t.direction === "CALL" ? "#39ff14" : "#ff2d55" }}>{t.direction}</span>
                            <span style={{ fontFamily: "monospace", fontSize: 9, padding: "1px 5px", borderRadius: 2, background: t.tier === 1 ? "rgba(255,215,0,0.15)" : t.tier === 2 ? "rgba(0,255,200,0.08)" : "rgba(74,109,140,0.1)", color: t.tier === 1 ? "#ffd700" : t.tier === 2 ? "#00ffc8" : "#4a6d8c" }}>T{t.tier}</span>
                            <span style={{ fontSize: 9, color: "#4a6d8c", fontFamily: "monospace" }}>{t.sector}</span>
                          </div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            {t.entryStockPrice && <span style={{ fontFamily: "monospace", fontSize: 9, color: "#4a6d8c" }}>Entry: ${t.entryStockPrice?.toFixed(2)}</span>}
                            {t.stockMovePct !== null && t.stockMovePct !== undefined && <span style={{ fontFamily: "monospace", fontSize: 9, color: t.stockMovePct >= 0 ? "#39ff14" : "#ff2d55" }}>Stock: {t.stockMovePct >= 0 ? "+" : ""}{t.stockMovePct}%</span>}
                            {t.estimatedPnl !== null && t.estimatedPnl !== undefined && <span style={{ fontFamily: "monospace", fontSize: 10, color: t.estimatedPnl >= 0 ? "#39ff14" : "#ff2d55" }}>Est: {t.estimatedPnl >= 0 ? "+" : ""}{t.estimatedPnl}%</span>}
                            <span style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, color: t.outcome === "WIN" ? "#39ff14" : t.outcome === "LOSS" ? "#ff2d55" : t.outcome === "SCRATCH" ? "#8aabb8" : "#00ffc8" }}>{t.outcome || "OPEN"}</span>
                            {t.pnlPct !== null && t.pnlPct !== undefined && <span style={{ fontFamily: "monospace", fontSize: 10, color: t.pnlPct >= 0 ? "#39ff14" : "#ff2d55" }}>{t.pnlPct >= 0 ? "+" : ""}{t.pnlPct}%</span>}
                          </div>
                        </div>
                        <div style={{ fontSize: 9, color: "#4a6d8c", marginTop: 4, display: "flex", gap: 10 }}>
                          <span>{new Date(t.entryDate).toLocaleDateString()}</span>
                          {t.urgency && <span>{t.urgency}</span>}
                          {t.score && <span>Score: {Math.round(t.score)}</span>}
                          {t.thesis && <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.thesis.slice(0, 60)}</span>}
                        </div>
                      </div>
                    ))}

                    {paperBook.trades?.length === 0 && (
                      <div style={{ textAlign: "center", padding: 40, color: "#4a6d8c", fontSize: 11, fontFamily: "monospace" }}>No paper trades yet. Run the pipeline to start building your track record.</div>
                    )}

                    <div style={{ fontSize: 9, color: "#4a6d8c", fontFamily: "monospace", marginTop: 8 }}>
                      {paperBook.trades?.length} total trades in book · Auto-logged every pipeline run · Auto-outcome checked on refresh
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* CHART PATTERNS TAB */}
            {tab === "chart" && (
              <div style={{ height: "100%", overflowY: "auto", paddingBottom: 40 }}>
                <div style={{ background: "linear-gradient(135deg,rgba(100,200,255,0.08),rgba(100,200,255,0.02))", border: "1px solid rgba(100,200,255,0.3)", borderRadius: 4, padding: "14px 16px", marginBottom: 16 }}>
                  <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#64c8ff", letterSpacing: 3, marginBottom: 4 }}>📈 CHART PATTERN RECOGNITION</div>
                  <div style={{ fontSize: 11, color: "#8aabb8", marginBottom: 12 }}>RSI · MACD · Double Bottom/Top · Bull/Bear Flag · Volume Spike · Moving Average signals</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input value={patternTicker} onChange={e => setPatternTicker(e.target.value.toUpperCase())} placeholder="Tickers (e.g. NVDA,AAPL,TSLA) or leave blank for auto" style={{ background: "#0d1829", border: "1px solid rgba(100,200,255,0.3)", color: "#e8f4ff", borderRadius: 3, padding: "8px 12px", fontSize: 12, fontFamily: "monospace", flex: 1, outline: "none" }} onKeyDown={e => { if (e.key === "Enter") loadChartPatterns(patternTicker, true); }} />
                    <button onClick={() => loadChartPatterns(patternTicker, true)} disabled={loadingPatterns} style={{ background: loadingPatterns ? "#1a2d47" : "rgba(100,200,255,0.15)", border: "1px solid rgba(100,200,255,0.4)", color: loadingPatterns ? "#4a6d8c" : "#64c8ff", borderRadius: 3, padding: "8px 18px", fontSize: 11, fontWeight: 700, cursor: loadingPatterns ? "not-allowed" : "pointer", fontFamily: "monospace" }}>
                      {loadingPatterns ? "SCANNING..." : "📈 SCAN"}
                    </button>
                  </div>
                </div>

                {!chartPatterns && !loadingPatterns && (
                  <div style={{ textAlign: "center", padding: 60 }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>📈</div>
                    <div style={{ fontFamily: "monospace", fontSize: 14, color: "#64c8ff", letterSpacing: 3, marginBottom: 8 }}>CHART PATTERN SCANNER</div>
                    <div style={{ fontSize: 12, color: "#4a6d8c", marginBottom: 24 }}>Auto-scans your watchlist + earnings stocks + today's movers for classical technical patterns</div>
                    <button onClick={() => loadChartPatterns("", true)} style={{ background: "rgba(100,200,255,0.15)", border: "1px solid rgba(100,200,255,0.4)", color: "#64c8ff", borderRadius: 3, padding: "12px 28px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "monospace", letterSpacing: 2 }}>📈 AUTO-SCAN NOW</button>
                  </div>
                )}

                {chartPatterns && (
                  <div>
                    {/* Summary */}
                    <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                      <div style={{ background: "#080f1a", border: "1px solid rgba(100,200,255,0.2)", borderRadius: 4, padding: "8px 14px" }}>
                        <div style={{ fontFamily: "monospace", fontSize: 9, color: "#4a6d8c", marginBottom: 2 }}>TICKERS SCANNED</div>
                        <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700, color: "#64c8ff" }}>{chartPatterns.tickersScanned}</div>
                      </div>
                      <div style={{ background: "#080f1a", border: "1px solid rgba(57,255,20,0.2)", borderRadius: 4, padding: "8px 14px" }}>
                        <div style={{ fontFamily: "monospace", fontSize: 9, color: "#4a6d8c", marginBottom: 2 }}>BULLISH SETUPS</div>
                        <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700, color: "#39ff14" }}>{chartPatterns.tickers?.filter(t => t.bullishCount >= 2).length || 0}</div>
                      </div>
                      <div style={{ background: "#080f1a", border: "1px solid rgba(255,45,85,0.2)", borderRadius: 4, padding: "8px 14px" }}>
                        <div style={{ fontFamily: "monospace", fontSize: 9, color: "#4a6d8c", marginBottom: 2 }}>BEARISH SETUPS</div>
                        <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700, color: "#ff2d55" }}>{chartPatterns.tickers?.filter(t => t.bearishCount >= 2).length || 0}</div>
                      </div>
                      <div style={{ background: "#080f1a", border: "1px solid rgba(100,200,255,0.2)", borderRadius: 4, padding: "8px 14px" }}>
                        <div style={{ fontFamily: "monospace", fontSize: 9, color: "#4a6d8c", marginBottom: 2 }}>PIPELINE SIGNALS</div>
                        <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700, color: "#64c8ff" }}>{chartPatterns.patternSignals?.length || 0}</div>
                      </div>
                    </div>

                    {/* High conviction signals */}
                    {chartPatterns.patternSignals?.filter(s => s.strength === "HIGH").length > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontFamily: "monospace", fontSize: 10, color: "#64c8ff", letterSpacing: 3, marginBottom: 8 }}>HIGH CONVICTION TECHNICAL SIGNALS → PIPELINE</div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {chartPatterns.patternSignals.filter(s => s.strength === "HIGH").map((s, i) => (
                            <div key={i} style={{ background: s.direction === "CALL" ? "rgba(57,255,20,0.08)" : "rgba(255,45,85,0.08)", border: `1px solid ${s.direction === "CALL" ? "rgba(57,255,20,0.3)" : "rgba(255,45,85,0.3)"}`, borderRadius: 4, padding: "8px 12px" }}>
                              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 3 }}>
                                <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: s.direction === "CALL" ? "#39ff14" : "#ff2d55" }}>{s.ticker}</span>
                                <span style={{ fontFamily: "monospace", fontSize: 9, padding: "1px 6px", borderRadius: 2, background: s.direction === "CALL" ? "rgba(57,255,20,0.1)" : "rgba(255,45,85,0.1)", color: s.direction === "CALL" ? "#39ff14" : "#ff2d55" }}>{s.direction}</span>
                              </div>
                              <div style={{ fontSize: 10, color: "#8aabb8" }}>{s.reason}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* All ticker results */}
                    <div style={{ fontFamily: "monospace", fontSize: 10, color: "#64c8ff", letterSpacing: 3, marginBottom: 10 }}>ALL TICKER SCANS</div>
                    {chartPatterns.tickers?.map((t, i) => (
                      <div key={i} style={{ background: "#080f1a", border: `1px solid ${t.bullishCount >= 2 ? "rgba(57,255,20,0.2)" : t.bearishCount >= 2 ? "rgba(255,45,85,0.2)" : "rgba(74,109,140,0.15)"}`, borderRadius: 4, padding: 12, marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: t.patterns?.length > 0 ? 8 : 0 }}>
                          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            <span style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: t.bullishCount > t.bearishCount ? "#39ff14" : t.bearishCount > t.bullishCount ? "#ff2d55" : "#64c8ff" }}>{t.ticker}</span>
                            {t.currentPrice && <span style={{ fontFamily: "monospace", fontSize: 11, color: "#e8f4ff" }}>${t.currentPrice}</span>}
                            {t.dayChange !== null && <span style={{ fontFamily: "monospace", fontSize: 10, color: t.dayChange >= 0 ? "#39ff14" : "#ff2d55" }}>{t.dayChange >= 0 ? "+" : ""}{t.dayChange}%</span>}
                          </div>
                          <div style={{ display: "flex", gap: 6 }}>
                            {t.bullishCount > 0 && <span style={{ fontFamily: "monospace", fontSize: 9, padding: "2px 7px", borderRadius: 2, background: "rgba(57,255,20,0.1)", color: "#39ff14" }}>{t.bullishCount} BULL</span>}
                            {t.bearishCount > 0 && <span style={{ fontFamily: "monospace", fontSize: 9, padding: "2px 7px", borderRadius: 2, background: "rgba(255,45,85,0.1)", color: "#ff2d55" }}>{t.bearishCount} BEAR</span>}
                          </div>
                        </div>
                        {t.patterns?.length > 0 && (
                          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                            {t.patterns.map((p, j) => (
                              <div key={j} style={{ fontSize: 9, fontFamily: "monospace", padding: "2px 7px", borderRadius: 2, background: p.signal === "BULLISH" ? "rgba(57,255,20,0.08)" : p.signal === "BEARISH" ? "rgba(255,45,85,0.08)" : "rgba(74,109,140,0.1)", color: p.signal === "BULLISH" ? "#39ff14" : p.signal === "BEARISH" ? "#ff2d55" : "#64c8ff", border: `1px solid ${p.signal === "BULLISH" ? "rgba(57,255,20,0.2)" : p.signal === "BEARISH" ? "rgba(255,45,85,0.2)" : "rgba(74,109,140,0.2)"}` }} title={p.description}>
                                {p.pattern} {p.strength === "HIGH" ? "★" : ""}
                              </div>
                            ))}
                          </div>
                        )}
                        {t.patterns?.length === 0 && <div style={{ fontSize: 10, color: "#4a6d8c" }}>No significant patterns detected</div>}
                      </div>
                    ))}

                    <div style={{ fontSize: 9, color: "#4a6d8c", fontFamily: "monospace", marginTop: 8 }}>
                      Scanned: {new Date(chartPatterns.timestamp).toLocaleString()} · Pattern signals injected into pipeline (2x boost for HIGH strength)
                      <button onClick={() => loadChartPatterns(patternTicker, true)} style={{ marginLeft: 8, background: "none", border: "none", color: "#4a6d8c", cursor: "pointer", fontSize: 9, fontFamily: "monospace" }}>⟳ refresh</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ALLIANCE DETECTION TAB */}
            {tab === "alliance" && (
              <div style={{ height: "100%", overflowY: "auto", paddingBottom: 40 }}>
                <div style={{ background: "linear-gradient(135deg,rgba(255,100,0,0.08),rgba(255,100,0,0.02))", border: "1px solid rgba(255,100,0,0.3)", borderRadius: 4, padding: "14px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#ff6400", letterSpacing: 3, marginBottom: 4 }}>🕵 ALLIANCE DETECTION</div>
                    <div style={{ fontSize: 11, color: "#8aabb8" }}>Identifies coordinated moves between hedge funds, brokers, analysts — detects manufactured consensus and real institutional conviction</div>
                  </div>
                  <button onClick={() => loadAlliance(true)} disabled={loadingAlliance} style={{ background: loadingAlliance ? "#1a2d47" : "rgba(255,100,0,0.15)", border: "1px solid rgba(255,100,0,0.4)", color: loadingAlliance ? "#4a6d8c" : "#ff6400", borderRadius: 3, padding: "9px 18px", fontSize: 11, fontWeight: 700, cursor: loadingAlliance ? "not-allowed" : "pointer", fontFamily: "monospace" }}>
                    {loadingAlliance ? "SCANNING..." : "🕵 DETECT ALLIANCES"}
                  </button>
                </div>

                {!allianceData && !loadingAlliance && (
                  <div style={{ textAlign: "center", padding: 60 }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>🕵</div>
                    <div style={{ fontFamily: "monospace", fontSize: 14, color: "#ff6400", letterSpacing: 3, marginBottom: 8 }}>ALLIANCE DETECTOR</div>
                    <div style={{ fontSize: 12, color: "#4a6d8c", marginBottom: 24 }}>Scans for coordinated institutional moves, manufactured consensus, short squeezes, and frontrun opportunities</div>
                    <button onClick={() => loadAlliance(true)} style={{ background: "rgba(255,100,0,0.15)", border: "1px solid rgba(255,100,0,0.4)", color: "#ff6400", borderRadius: 3, padding: "12px 28px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "monospace", letterSpacing: 2 }}>🕵 SCAN NOW</button>
                  </div>
                )}

                {allianceData && (
                  <div>
                    {/* Risk banner */}
                    <div style={{ background: allianceData.allianceRiskLevel === "CRITICAL" ? "rgba(255,45,85,0.1)" : allianceData.allianceRiskLevel === "HIGH" ? "rgba(255,100,0,0.1)" : "rgba(255,184,0,0.05)", border: `1px solid ${allianceData.allianceRiskLevel === "CRITICAL" ? "rgba(255,45,85,0.4)" : allianceData.allianceRiskLevel === "HIGH" ? "rgba(255,100,0,0.4)" : "rgba(255,184,0,0.2)"}`, borderRadius: 4, padding: "10px 14px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontFamily: "monospace", fontSize: 11, color: "#8aabb8" }}>ALLIANCE RISK LEVEL — {allianceData.headlinesAnalyzed} headlines scanned</span>
                      <span style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700, color: allianceData.allianceRiskLevel === "CRITICAL" ? "#ff2d55" : allianceData.allianceRiskLevel === "HIGH" ? "#ff6400" : "#ffb800" }}>{allianceData.allianceRiskLevel}</span>
                    </div>

                    {/* Cluster detection */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                      {[
                        { label: "UPGRADE CLUSTER", data: allianceData.upgradeCluster, color: "#39ff14" },
                        { label: "DOWNGRADE CLUSTER", data: allianceData.downgradeCluster, color: "#ff2d55" },
                      ].map(({ label, data, color }) => (
                        <div key={label} style={{ background: "#080f1a", border: `1px solid ${data?.detected ? color + "30" : "rgba(74,109,140,0.2)"}`, borderRadius: 4, padding: 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ fontFamily: "monospace", fontSize: 9, color: "#4a6d8c" }}>{label}</span>
                            <span style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, color: data?.detected ? color : "#39ff14" }}>{data?.detected ? "DETECTED ⚠" : "NONE ✓"}</span>
                          </div>
                          {data?.tickers?.length > 0 && <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 4 }}>{data.tickers.map(t => <span key={t} style={{ fontFamily: "monospace", fontSize: 9, padding: "1px 5px", borderRadius: 2, background: color + "15", color }}>{t}</span>)}</div>}
                          {data?.firms && <div style={{ fontSize: 10, color: "#8aabb8", marginBottom: 3 }}>{data.firms}</div>}
                          {data?.motive && <div style={{ fontSize: 9, color: "#4a6d8c", fontStyle: "italic" }}>{data.motive}</div>}
                        </div>
                      ))}
                    </div>

                    {/* Hedge fund + short seller */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                      {allianceData.hedgeFundAlliance?.detected && (
                        <div style={{ background: "#080f1a", border: "1px solid rgba(178,79,255,0.3)", borderRadius: 4, padding: 10 }}>
                          <div style={{ fontFamily: "monospace", fontSize: 9, color: "#b24fff", marginBottom: 6 }}>HEDGE FUND ALLIANCE ⚠</div>
                          <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#e8f4ff", marginBottom: 4 }}>{allianceData.hedgeFundAlliance.targetTicker}</div>
                          <div style={{ fontSize: 9, fontFamily: "monospace", color: "#b24fff", marginBottom: 3 }}>STRATEGY: {allianceData.hedgeFundAlliance.strategy?.toUpperCase()}</div>
                          <div style={{ fontSize: 10, color: "#8aabb8" }}>{allianceData.hedgeFundAlliance.parties}</div>
                        </div>
                      )}
                      {allianceData.shortSellerCoordination?.detected && (
                        <div style={{ background: "#080f1a", border: "1px solid rgba(255,45,85,0.3)", borderRadius: 4, padding: 10 }}>
                          <div style={{ fontFamily: "monospace", fontSize: 9, color: "#ff2d55", marginBottom: 6 }}>SHORT SELLER COORDINATION ⚠</div>
                          <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#ff2d55", marginBottom: 4 }}>{allianceData.shortSellerCoordination.target}</div>
                          <div style={{ fontSize: 10, color: "#8aabb8" }}>{allianceData.shortSellerCoordination.parties}</div>
                        </div>
                      )}
                    </div>

                    {/* Manufactured vs Real */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                      {allianceData.manufacturedConsensus?.detected && (
                        <div style={{ background: "rgba(255,45,85,0.05)", border: "1px solid rgba(255,45,85,0.2)", borderRadius: 4, padding: 10 }}>
                          <div style={{ fontFamily: "monospace", fontSize: 9, color: "#ff2d55", marginBottom: 6 }}>⚠ MANUFACTURED CONSENSUS</div>
                          <div style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: "#ff2d55", marginBottom: 4 }}>{allianceData.manufacturedConsensus.ticker}</div>
                          <div style={{ fontSize: 10, color: "#8aabb8" }}>{allianceData.manufacturedConsensus.evidence}</div>
                        </div>
                      )}
                      {allianceData.realConviction?.ticker && (
                        <div style={{ background: "rgba(57,255,20,0.05)", border: "1px solid rgba(57,255,20,0.2)", borderRadius: 4, padding: 10 }}>
                          <div style={{ fontFamily: "monospace", fontSize: 9, color: "#39ff14", marginBottom: 6 }}>✓ REAL INSTITUTIONAL CONVICTION</div>
                          <div style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: "#39ff14", marginBottom: 4 }}>{allianceData.realConviction.ticker}</div>
                          <div style={{ fontSize: 10, color: "#8aabb8" }}>{allianceData.realConviction.evidence}</div>
                        </div>
                      )}
                    </div>

                    {/* Special signals */}
                    {(allianceData.darkPoolSignal || allianceData.activistSignal || allianceData.mergerArbitrageSignal) && (
                      <div style={{ background: "#080f1a", border: "1px solid rgba(255,100,0,0.2)", borderRadius: 4, padding: 12, marginBottom: 14 }}>
                        <div style={{ fontFamily: "monospace", fontSize: 10, color: "#ff6400", letterSpacing: 2, marginBottom: 8 }}>SPECIAL SITUATION SIGNALS</div>
                        {allianceData.darkPoolSignal && <div style={{ fontSize: 11, color: "#8aabb8", marginBottom: 6 }}>🌑 DARK POOL: {allianceData.darkPoolSignal}</div>}
                        {allianceData.activistSignal && <div style={{ fontSize: 11, color: "#8aabb8", marginBottom: 6 }}>⚡ ACTIVIST: {allianceData.activistSignal}</div>}
                        {allianceData.mergerArbitrageSignal && <div style={{ fontSize: 11, color: "#8aabb8" }}>🤝 M&A: {allianceData.mergerArbitrageSignal}</div>}
                      </div>
                    )}

                    {/* Trading opportunities */}
                    <div style={{ fontFamily: "monospace", fontSize: 10, color: "#ff6400", letterSpacing: 3, marginBottom: 10 }}>INSTITUTIONAL TRADING OPPORTUNITIES</div>

                    {allianceData.frontrunOpportunity?.ticker && (
                      <div style={{ background: "rgba(57,255,20,0.05)", border: "2px solid rgba(57,255,20,0.3)", borderRadius: 6, padding: 12, marginBottom: 10 }}>
                        <div style={{ fontFamily: "monospace", fontSize: 10, color: "#39ff14", letterSpacing: 2, marginBottom: 6 }}>🚀 FRONTRUN OPPORTUNITY</div>
                        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
                          <span style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700, color: allianceData.frontrunOpportunity.direction === "CALL" ? "#39ff14" : "#ff2d55" }}>{allianceData.frontrunOpportunity.ticker}</span>
                          <span style={{ fontFamily: "monospace", fontSize: 10, padding: "2px 8px", borderRadius: 2, background: allianceData.frontrunOpportunity.direction === "CALL" ? "rgba(57,255,20,0.1)" : "rgba(255,45,85,0.1)", color: allianceData.frontrunOpportunity.direction === "CALL" ? "#39ff14" : "#ff2d55" }}>{allianceData.frontrunOpportunity.direction}</span>
                          <span style={{ fontFamily: "monospace", fontSize: 9, color: "#ffb800" }}>{allianceData.frontrunOpportunity.timing}</span>
                          <span style={{ fontFamily: "monospace", fontSize: 9, color: allianceData.frontrunOpportunity.confidence === "HIGH" ? "#39ff14" : "#ffb800" }}>{allianceData.frontrunOpportunity.confidence}</span>
                        </div>
                        <div style={{ fontSize: 11, color: "#c8dce8" }}>{allianceData.frontrunOpportunity.description}</div>
                      </div>
                    )}

                    {allianceData.squeezeSetup?.ticker && (
                      <div style={{ background: "rgba(255,45,85,0.05)", border: "1px solid rgba(255,45,85,0.3)", borderRadius: 4, padding: 12, marginBottom: 10 }}>
                        <div style={{ fontFamily: "monospace", fontSize: 10, color: "#ff2d55", letterSpacing: 2, marginBottom: 6 }}>⚡ SHORT SQUEEZE SETUP</div>
                        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
                          <span style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700, color: "#ff2d55" }}>{allianceData.squeezeSetup.ticker}</span>
                          <span style={{ fontFamily: "monospace", fontSize: 11, color: "#ffb800" }}>{allianceData.squeezeSetup.probability} probability</span>
                        </div>
                        <div style={{ fontSize: 11, color: "#c8dce8" }}>{allianceData.squeezeSetup.description}</div>
                      </div>
                    )}

                    {allianceData.pumpDumpCycle?.detected && (
                      <div style={{ background: "rgba(255,184,0,0.05)", border: "1px solid rgba(255,184,0,0.3)", borderRadius: 4, padding: 12, marginBottom: 10 }}>
                        <div style={{ fontFamily: "monospace", fontSize: 10, color: "#ffb800", letterSpacing: 2, marginBottom: 6 }}>⚠ PUMP & DUMP CYCLE DETECTED</div>
                        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
                          <span style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700, color: "#ffb800" }}>{allianceData.pumpDumpCycle.ticker}</span>
                          <span style={{ fontFamily: "monospace", fontSize: 10, padding: "2px 8px", borderRadius: 2, background: "rgba(255,184,0,0.1)", color: "#ffb800" }}>STAGE: {allianceData.pumpDumpCycle.stage?.toUpperCase()}</span>
                        </div>
                        <div style={{ fontSize: 11, color: "#c8dce8" }}>{allianceData.pumpDumpCycle.description}</div>
                      </div>
                    )}

                    {allianceData.insiderPattern?.ticker && (
                      <div style={{ background: "rgba(178,79,255,0.05)", border: "1px solid rgba(178,79,255,0.2)", borderRadius: 4, padding: 12, marginBottom: 10 }}>
                        <div style={{ fontFamily: "monospace", fontSize: 10, color: "#b24fff", letterSpacing: 2, marginBottom: 6 }}>🔍 INSIDER PATTERN</div>
                        <div style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: "#b24fff", marginBottom: 4 }}>{allianceData.insiderPattern.ticker}</div>
                        <div style={{ fontSize: 11, color: "#c8dce8", marginBottom: 4 }}>{allianceData.insiderPattern.description}</div>
                        <div style={{ fontSize: 10, color: "#8aabb8" }}>{allianceData.insiderPattern.evidence}</div>
                      </div>
                    )}

                    {/* Safest play + avoid */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                      {allianceData.safestPlay?.play && (
                        <div style={{ background: "rgba(57,255,20,0.04)", border: "1px solid rgba(57,255,20,0.2)", borderRadius: 4, padding: 10 }}>
                          <div style={{ fontFamily: "monospace", fontSize: 9, color: "#39ff14", marginBottom: 4 }}>SAFEST PLAY</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#e8f4ff", marginBottom: 4 }}>{allianceData.safestPlay.play}</div>
                          <div style={{ fontSize: 10, color: "#8aabb8" }}>{allianceData.safestPlay.reasoning}</div>
                        </div>
                      )}
                      {allianceData.avoidCompletely?.length > 0 && (
                        <div style={{ background: "rgba(255,45,85,0.04)", border: "1px solid rgba(255,45,85,0.2)", borderRadius: 4, padding: 10 }}>
                          <div style={{ fontFamily: "monospace", fontSize: 9, color: "#ff2d55", marginBottom: 4 }}>AVOID COMPLETELY</div>
                          <div style={{ display: "flex", gap: 4, flexWrap: "nowrap", overflowX: "auto", paddingBottom: 4, scrollbarWidth: "thin", scrollbarColor: "#1a2d47 transparent" }}>{allianceData.avoidCompletely.map(t => <span key={t} style={{ fontFamily: "monospace", fontSize: 10, padding: "1px 6px", borderRadius: 2, background: "rgba(255,45,85,0.1)", color: "#ff2d55" }}>{t}</span>)}</div>
                        </div>
                      )}
                    </div>

                    {/* Institutional flow predictions */}
                    {allianceData.institutionalFlow?.day7 && (
                      <div style={{ background: "#080f1a", border: "1px solid rgba(255,100,0,0.15)", borderRadius: 4, padding: 12, marginBottom: 12 }}>
                        <div style={{ fontFamily: "monospace", fontSize: 10, color: "#ff6400", letterSpacing: 2, marginBottom: 8 }}>INSTITUTIONAL MONEY FLOW PREDICTIONS</div>
                        {[["7 DAYS", allianceData.institutionalFlow.day7], ["14 DAYS", allianceData.institutionalFlow.day14], ["21 DAYS", allianceData.institutionalFlow.day21]].filter(([,v]) => v).map(([label, val]) => (
                          <div key={label} style={{ marginBottom: 6 }}>
                            <span style={{ fontFamily: "monospace", fontSize: 9, color: "#4a6d8c", marginRight: 8 }}>{label}:</span>
                            <span style={{ fontSize: 11, color: "#c8dce8" }}>{val}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ fontSize: 9, color: "#4a6d8c", fontFamily: "monospace" }}>
                      Scanned: {new Date(allianceData.timestamp).toLocaleString()} · Alliance signals injected into pipeline scoring
                      <button onClick={() => loadAlliance(true)} style={{ marginLeft: 8, background: "none", border: "none", color: "#4a6d8c", cursor: "pointer", fontSize: 9, fontFamily: "monospace" }}>⟳ refresh</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* PATTERN MEMORY TAB */}
            {tab === "pattern" && (
              <div style={{ height: "100%", overflowY: "auto", paddingBottom: 40 }}>
                <div style={{ background: "linear-gradient(135deg,rgba(255,215,0,0.08),rgba(255,215,0,0.02))", border: "1px solid rgba(255,215,0,0.3)", borderRadius: 4, padding: "14px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#ffd700", letterSpacing: 3, marginBottom: 4 }}>🧠 PATTERN MEMORY</div>
                    <div style={{ fontSize: 11, color: "#8aabb8" }}>Learns from YOUR win/loss history — identifies recurring setups, feeds patterns back into pipeline scoring</div>
                  </div>
                  <button onClick={() => loadPatternMemory(true)} disabled={loadingPattern} style={{ background: loadingPattern ? "#1a2d47" : "rgba(255,215,0,0.15)", border: "1px solid rgba(255,215,0,0.4)", color: loadingPattern ? "#4a6d8c" : "#ffd700", borderRadius: 3, padding: "9px 18px", fontSize: 11, fontWeight: 700, cursor: loadingPattern ? "not-allowed" : "pointer", fontFamily: "monospace" }}>
                    {loadingPattern ? "ANALYZING..." : "🧠 ANALYZE PATTERNS"}
                  </button>
                </div>

                {!patternMemory && !loadingPattern && (
                  <div style={{ textAlign: "center", padding: 60 }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>🧠</div>
                    <div style={{ fontFamily: "monospace", fontSize: 14, color: "#ffd700", letterSpacing: 3, marginBottom: 8 }}>PATTERN MEMORY ENGINE</div>
                    <div style={{ fontSize: 12, color: "#4a6d8c", marginBottom: 8 }}>Analyzes your complete pick history to find recurring winning setups</div>
                    <div style={{ fontSize: 11, color: "#4a6d8c", marginBottom: 24 }}>Needs 5+ logged picks. Run the pipeline daily and log outcomes to build memory.</div>
                    <button onClick={() => loadPatternMemory(true)} style={{ background: "rgba(255,215,0,0.15)", border: "1px solid rgba(255,215,0,0.4)", color: "#ffd700", borderRadius: 3, padding: "12px 28px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "monospace", letterSpacing: 2 }}>🧠 ANALYZE NOW</button>
                  </div>
                )}

                {patternMemory && (
                  <div>
                    {/* Not enough data yet */}
                    {patternMemory.message && (
                      <div style={{ background: "rgba(255,215,0,0.05)", border: "1px solid rgba(255,215,0,0.2)", borderRadius: 4, padding: 16, textAlign: "center" }}>
                        <div style={{ fontFamily: "monospace", fontSize: 12, color: "#ffd700", marginBottom: 6 }}>{patternMemory.message}</div>
                        <div style={{ fontSize: 11, color: "#4a6d8c" }}>{patternMemory.picksLogged} picks logged so far. Keep running the pipeline and logging outcomes.</div>
                      </div>
                    )}

                    {/* Summary stats */}
                    {patternMemory.summary && (
                      <div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 14 }}>
                          {[
                            ["OVERALL WIN RATE", patternMemory.summary.overallWinRate !== null ? patternMemory.summary.overallWinRate + "%" : "—", patternMemory.summary.overallWinRate >= 60 ? "#39ff14" : patternMemory.summary.overallWinRate >= 40 ? "#ffb800" : "#ff2d55"],
                            ["RECENT WIN RATE", patternMemory.summary.recentWinRate !== null ? patternMemory.summary.recentWinRate + "%" : "—", patternMemory.summary.recentWinRate >= 60 ? "#39ff14" : "#ffb800"],
                            ["CALL WIN RATE", patternMemory.summary.callWinRate !== null ? patternMemory.summary.callWinRate + "%" : "—", "#39ff14"],
                            ["PUT WIN RATE", patternMemory.summary.putWinRate !== null ? patternMemory.summary.putWinRate + "%" : "—", "#ff2d55"],
                          ].map(([label, val, color]) => (
                            <div key={label} style={{ background: "#080f1a", border: "1px solid rgba(255,215,0,0.15)", borderRadius: 4, padding: "8px 10px", textAlign: "center" }}>
                              <div style={{ fontFamily: "monospace", fontSize: 8, color: "#4a6d8c", marginBottom: 4 }}>{label}</div>
                              <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700, color }}>{val}</div>
                            </div>
                          ))}
                        </div>

                        {/* Score correlation */}
                        {patternMemory.summary.avgWinScore && (
                          <div style={{ background: "#080f1a", border: "1px solid rgba(255,215,0,0.15)", borderRadius: 4, padding: 10, marginBottom: 14, display: "flex", gap: 20 }}>
                            <div><div style={{ fontFamily: "monospace", fontSize: 9, color: "#4a6d8c", marginBottom: 3 }}>AVG WIN SCORE</div><div style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: "#39ff14" }}>{patternMemory.summary.avgWinScore}</div></div>
                            <div><div style={{ fontFamily: "monospace", fontSize: 9, color: "#4a6d8c", marginBottom: 3 }}>AVG LOSS SCORE</div><div style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: "#ff2d55" }}>{patternMemory.summary.avgLossScore}</div></div>
                            <div style={{ fontSize: 11, color: "#8aabb8", alignSelf: "center" }}>Picks scoring above {patternMemory.summary.avgWinScore} win significantly more often</div>
                          </div>
                        )}

                        {/* Sector win rates */}
                        {patternMemory.sectorWinRates?.length > 0 && (
                          <div style={{ marginBottom: 14 }}>
                            <div style={{ fontFamily: "monospace", fontSize: 10, color: "#ffd700", letterSpacing: 2, marginBottom: 8 }}>SECTOR WIN RATES</div>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {patternMemory.sectorWinRates.map(s => (
                                <div key={s.sector} style={{ background: "#080f1a", border: `1px solid ${s.winRate >= 60 ? "rgba(57,255,20,0.2)" : s.winRate >= 40 ? "rgba(255,184,0,0.2)" : "rgba(255,45,85,0.2)"}`, borderRadius: 3, padding: "6px 10px", textAlign: "center" }}>
                                  <div style={{ fontFamily: "monospace", fontSize: 8, color: "#4a6d8c", marginBottom: 2 }}>{s.sector}</div>
                                  <div style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: s.winRate >= 60 ? "#39ff14" : s.winRate >= 40 ? "#ffb800" : "#ff2d55" }}>{s.winRate}%</div>
                                  <div style={{ fontFamily: "monospace", fontSize: 8, color: "#4a6d8c" }}>{s.wins}/{s.total}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Winning patterns */}
                        {patternMemory.patterns?.winningSetup1?.description && (
                          <div style={{ marginBottom: 14 }}>
                            <div style={{ fontFamily: "monospace", fontSize: 10, color: "#ffd700", letterSpacing: 2, marginBottom: 8 }}>RECURRING WINNING SETUPS</div>
                            {[patternMemory.patterns.winningSetup1, patternMemory.patterns.winningSetup2].filter(s => s?.description).map((setup, i) => (
                              <div key={i} style={{ background: "rgba(57,255,20,0.04)", border: "1px solid rgba(57,255,20,0.2)", borderRadius: 4, padding: 12, marginBottom: 8 }}>
                                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                                  <span style={{ fontFamily: "monospace", fontSize: 9, color: "#4a6d8c" }}>SETUP {i+1}</span>
                                  <span style={{ fontFamily: "monospace", fontSize: 9, padding: "1px 6px", borderRadius: 2, background: setup.confidence === "HIGH" ? "rgba(57,255,20,0.1)" : "rgba(255,184,0,0.1)", color: setup.confidence === "HIGH" ? "#39ff14" : "#ffb800" }}>{setup.confidence}</span>
                                </div>
                                <div style={{ fontSize: 11, color: "#c8dce8", lineHeight: 1.6, marginBottom: 6 }}>{setup.description}</div>
                                {setup.tickers?.length > 0 && (
                                  <div style={{ display: "flex", gap: 4, flexWrap: "nowrap", overflowX: "auto", paddingBottom: 4, scrollbarWidth: "thin", scrollbarColor: "#1a2d47 transparent" }}>
                                    <span style={{ fontFamily: "monospace", fontSize: 9, color: "#4a6d8c" }}>NOW:</span>
                                    {setup.tickers.map(t => <span key={t} style={{ fontFamily: "monospace", fontSize: 9, padding: "1px 6px", borderRadius: 2, background: "rgba(57,255,20,0.1)", color: "#39ff14" }}>{t}</span>)}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Losing patterns to avoid */}
                        {patternMemory.patterns?.losingPattern1 && (
                          <div style={{ marginBottom: 14 }}>
                            <div style={{ fontFamily: "monospace", fontSize: 10, color: "#ff2d55", letterSpacing: 2, marginBottom: 8 }}>PATTERNS TO AVOID</div>
                            {[patternMemory.patterns.losingPattern1, patternMemory.patterns.losingPattern2].filter(Boolean).map((p, i) => (
                              <div key={i} style={{ background: "rgba(255,45,85,0.04)", border: "1px solid rgba(255,45,85,0.2)", borderRadius: 4, padding: 10, marginBottom: 6 }}>
                                <span style={{ fontFamily: "monospace", fontSize: 9, color: "#ff2d55", marginRight: 8 }}>AVOID {i+1}</span>
                                <span style={{ fontSize: 11, color: "#c8dce8" }}>{p}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Recommendations */}
                        {patternMemory.recommendations && (
                          <div style={{ background: "rgba(255,215,0,0.05)", border: "1px solid rgba(255,215,0,0.2)", borderRadius: 6, padding: 14, marginBottom: 14 }}>
                            <div style={{ fontFamily: "monospace", fontSize: 10, color: "#ffd700", letterSpacing: 2, marginBottom: 12 }}>🧠 PIPELINE FEEDBACK ACTIVE — PATTERN WEIGHTS</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                              {[["BEST SECTOR", patternMemory.recommendations.bestSector], ["BEST DIRECTION", patternMemory.recommendations.bestDirection], ["BEST URGENCY", patternMemory.recommendations.bestUrgency]].map(([label, val]) => val && (
                                <div key={label} style={{ textAlign: "center" }}>
                                  <div style={{ fontFamily: "monospace", fontSize: 8, color: "#4a6d8c", marginBottom: 3 }}>{label}</div>
                                  <div style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "#ffd700" }}>{val}</div>
                                </div>
                              ))}
                            </div>
                            {patternMemory.recommendations.nextBestSetup && (
                              <div style={{ marginBottom: 10 }}>
                                <div style={{ fontFamily: "monospace", fontSize: 9, color: "#ffd700", marginBottom: 4 }}>NEXT IDEAL SETUP</div>
                                <div style={{ fontSize: 11, color: "#c8dce8", lineHeight: 1.6 }}>{patternMemory.recommendations.nextBestSetup}</div>
                              </div>
                            )}
                            {patternMemory.recommendations.nextBestTickers?.length > 0 && (
                              <div style={{ marginBottom: 10 }}>
                                <div style={{ fontFamily: "monospace", fontSize: 9, color: "#ffd700", marginBottom: 4 }}>TICKERS MATCHING IDEAL SETUP</div>
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                  {patternMemory.recommendations.nextBestTickers.map(t => <span key={t} style={{ fontFamily: "monospace", fontSize: 11, padding: "2px 8px", borderRadius: 2, background: "rgba(255,215,0,0.1)", color: "#ffd700" }}>{t}</span>)}
                                </div>
                              </div>
                            )}
                            {patternMemory.recommendations.accuracyEstimate && (
                              <div style={{ fontFamily: "monospace", fontSize: 11, color: "#39ff14", marginBottom: 6 }}>ACCURACY ESTIMATE: {patternMemory.recommendations.accuracyEstimate}</div>
                            )}
                            {patternMemory.recommendations.improvementSuggestion && (
                              <div style={{ fontSize: 11, color: "#ffb800" }}>💡 {patternMemory.recommendations.improvementSuggestion}</div>
                            )}
                          </div>
                        )}

                        {/* Human + seasonal patterns */}
                        {(patternMemory.recommendations?.humanPattern || patternMemory.recommendations?.seasonalPattern) && (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                            {patternMemory.recommendations.humanPattern && (
                              <div style={{ background: "#080f1a", border: "1px solid rgba(178,79,255,0.2)", borderRadius: 4, padding: 10 }}>
                                <div style={{ fontFamily: "monospace", fontSize: 9, color: "#b24fff", marginBottom: 4 }}>HUMAN BEHAVIORAL PATTERN</div>
                                <div style={{ fontSize: 11, color: "#c8dce8" }}>{patternMemory.recommendations.humanPattern}</div>
                              </div>
                            )}
                            {patternMemory.recommendations.seasonalPattern && (
                              <div style={{ background: "#080f1a", border: "1px solid rgba(0,212,255,0.2)", borderRadius: 4, padding: 10 }}>
                                <div style={{ fontFamily: "monospace", fontSize: 9, color: "#00d4ff", marginBottom: 4 }}>SEASONAL / CYCLE PATTERN</div>
                                <div style={{ fontSize: 11, color: "#c8dce8" }}>{patternMemory.recommendations.seasonalPattern}</div>
                              </div>
                            )}
                          </div>
                        )}

                        <div style={{ fontSize: 9, color: "#4a6d8c", fontFamily: "monospace" }}>
                          Analyzed: {new Date(patternMemory.timestamp).toLocaleString()} · Pattern weights injected into pipeline (4x boost for matching setups)
                          <button onClick={() => loadPatternMemory(true)} style={{ marginLeft: 8, background: "none", border: "none", color: "#4a6d8c", cursor: "pointer", fontSize: 9, fontFamily: "monospace" }}>⟳ refresh</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* RIPPLE CHAIN TAB */}
            {tab === "ripple" && (
              <div style={{ height: "100%", overflowY: "auto", paddingBottom: 40 }}>
                <div style={{ background: "linear-gradient(135deg,rgba(0,255,136,0.08),rgba(0,255,136,0.02))", border: "1px solid rgba(0,255,136,0.3)", borderRadius: 4, padding: "14px 16px", marginBottom: 16 }}>
                  <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#00ff88", letterSpacing: 3, marginBottom: 4 }}>🌊 RIPPLE CHAIN ENGINE</div>
                  <div style={{ fontSize: 11, color: "#8aabb8", marginBottom: 12 }}>Any event → full domino chain → historical pattern matching → 7/14/21 day predictions → contrarian plays</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input value={rippleInput} onChange={e => setRippleInput(e.target.value)} placeholder="Enter event (e.g. 'Fed raises rates') or leave blank for auto-detect" style={{ background: "#0d1829", border: "1px solid rgba(0,255,136,0.3)", color: "#e8f4ff", borderRadius: 3, padding: "8px 12px", fontSize: 12, fontFamily: "monospace", flex: 1, outline: "none" }} onKeyDown={e => { if (e.key === "Enter") loadRippleChain(rippleInput, true); }} />
                    <button onClick={() => loadRippleChain(rippleInput, true)} disabled={loadingRipple} style={{ background: loadingRipple ? "#1a2d47" : "rgba(0,255,136,0.15)", border: "1px solid rgba(0,255,136,0.4)", color: loadingRipple ? "#4a6d8c" : "#00ff88", borderRadius: 3, padding: "8px 18px", fontSize: 11, fontWeight: 700, cursor: loadingRipple ? "not-allowed" : "pointer", fontFamily: "monospace" }}>
                      {loadingRipple ? "MAPPING..." : "🌊 MAP CHAIN"}
                    </button>
                  </div>
                </div>

                {!rippleChain && !loadingRipple && (
                  <div style={{ textAlign: "center", padding: 60 }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>🌊</div>
                    <div style={{ fontFamily: "monospace", fontSize: 14, color: "#00ff88", letterSpacing: 3, marginBottom: 8 }}>DOMINO CHAIN MAPPER</div>
                    <div style={{ fontSize: 12, color: "#4a6d8c", marginBottom: 24 }}>Enter any event or click below for auto-detect from today's headlines</div>
                    <button onClick={() => loadRippleChain("", true)} style={{ background: "rgba(0,255,136,0.15)", border: "1px solid rgba(0,255,136,0.4)", color: "#00ff88", borderRadius: 3, padding: "12px 28px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "monospace", letterSpacing: 2 }}>🌊 AUTO-DETECT & MAP</button>
                  </div>
                )}

                {rippleChain && (
                  <div>
                    {/* Event header */}
                    <div style={{ background: "#080f1a", border: "1px solid rgba(0,255,136,0.3)", borderRadius: 6, padding: 14, marginBottom: 16 }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                        <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#00ff88" }}>{rippleChain.eventAnalyzed}</span>
                        {rippleChain.eventType && <span style={{ fontFamily: "monospace", fontSize: 9, padding: "2px 8px", borderRadius: 2, background: "rgba(0,255,136,0.1)", color: "#00ff88" }}>{rippleChain.eventType.toUpperCase()}</span>}
                        {rippleChain.eventSeverity && <span style={{ fontFamily: "monospace", fontSize: 9, padding: "2px 8px", borderRadius: 2, background: rippleChain.eventSeverity === "systemic" ? "rgba(255,45,85,0.15)" : "rgba(255,184,0,0.1)", color: rippleChain.eventSeverity === "systemic" ? "#ff2d55" : "#ffb800" }}>{rippleChain.eventSeverity.toUpperCase()}</span>}
                      </div>
                    </div>

                    {/* Domino chain */}
                    <div style={{ fontFamily: "monospace", fontSize: 10, color: "#00ff88", letterSpacing: 3, marginBottom: 10 }}>DOMINO CHAIN — TIMEFRAME BY TIMEFRAME</div>
                    {rippleChain.chain?.map((c, i) => (
                      <div key={i} style={{ background: "#080f1a", border: "1px solid rgba(0,255,136,0.1)", borderRadius: 4, padding: 12, marginBottom: 8, borderLeft: "3px solid " + (i === 0 ? "#ff2d55" : i === 1 ? "#ffb800" : i === 2 ? "#00d4ff" : "#00ff88") }}>
                        <div style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, color: i === 0 ? "#ff2d55" : i === 1 ? "#ffb800" : i === 2 ? "#00d4ff" : "#00ff88", marginBottom: 6 }}>{c.timeframe}</div>
                        <div style={{ fontSize: 11, color: "#c8dce8", lineHeight: 1.6, marginBottom: 8 }}>{c.description}</div>
                        <div style={{ display: "flex", gap: 16 }}>
                          {c.stocksUp?.length > 0 && <div><div style={{ fontSize: 9, fontFamily: "monospace", color: "#39ff14", marginBottom: 3 }}>CALLS →</div><div style={{ display: "flex", gap: 4 }}>{c.stocksUp.map(t => <span key={t} style={{ fontFamily: "monospace", fontSize: 10, padding: "1px 6px", borderRadius: 2, background: "rgba(57,255,20,0.1)", color: "#39ff14" }}>{t}</span>)}</div></div>}
                          {c.stocksDown?.length > 0 && <div><div style={{ fontSize: 9, fontFamily: "monospace", color: "#ff2d55", marginBottom: 3 }}>PUTS →</div><div style={{ display: "flex", gap: 4 }}>{c.stocksDown.map(t => <span key={t} style={{ fontFamily: "monospace", fontSize: 10, padding: "1px 6px", borderRadius: 2, background: "rgba(255,45,85,0.1)", color: "#ff2d55" }}>{t}</span>)}</div></div>}
                        </div>
                      </div>
                    ))}

                    {/* Surprises */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                      {rippleChain.unexpectedWinner && <div style={{ background: "rgba(57,255,20,0.05)", border: "1px solid rgba(57,255,20,0.2)", borderRadius: 4, padding: 10 }}><div style={{ fontFamily: "monospace", fontSize: 9, color: "#39ff14", marginBottom: 4 }}>UNEXPECTED WINNER</div><div style={{ fontSize: 11, color: "#c8dce8" }}>{rippleChain.unexpectedWinner}</div></div>}
                      {rippleChain.unexpectedLoser && <div style={{ background: "rgba(255,45,85,0.05)", border: "1px solid rgba(255,45,85,0.2)", borderRadius: 4, padding: 10 }}><div style={{ fontFamily: "monospace", fontSize: 9, color: "#ff2d55", marginBottom: 4 }}>UNEXPECTED LOSER</div><div style={{ fontSize: 11, color: "#c8dce8" }}>{rippleChain.unexpectedLoser}</div></div>}
                    </div>

                    {/* Feedback loop + circuit breaker */}
                    {(rippleChain.feedbackLoop || rippleChain.circuitBreaker) && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                        {rippleChain.feedbackLoop && <div style={{ background: "#080f1a", border: "1px solid rgba(255,60,0,0.2)", borderRadius: 4, padding: 10 }}><div style={{ fontFamily: "monospace", fontSize: 9, color: "#ff3c00", marginBottom: 4 }}>FEEDBACK LOOP</div><div style={{ fontSize: 11, color: "#c8dce8" }}>{rippleChain.feedbackLoop}</div></div>}
                        {rippleChain.circuitBreaker && <div style={{ background: "#080f1a", border: "1px solid rgba(57,255,20,0.2)", borderRadius: 4, padding: 10 }}><div style={{ fontFamily: "monospace", fontSize: 9, color: "#39ff14", marginBottom: 4 }}>CIRCUIT BREAKER</div><div style={{ fontSize: 11, color: "#c8dce8" }}>{rippleChain.circuitBreaker}</div></div>}
                      </div>
                    )}

                    {/* Highest conviction */}
                    {rippleChain.highestConvictionPlay && (
                      <div style={{ background: "rgba(0,255,136,0.05)", border: "2px solid rgba(0,255,136,0.3)", borderRadius: 6, padding: 12, marginBottom: 14 }}>
                        <div style={{ fontFamily: "monospace", fontSize: 10, color: "#00ff88", letterSpacing: 2, marginBottom: 6 }}>🌊 HIGHEST CONVICTION RIPPLE PLAY</div>
                        <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700, color: "#00ff88" }}>{rippleChain.highestConvictionPlay}</div>
                      </div>
                    )}

                    {/* Historical pattern */}
                    <div style={{ fontFamily: "monospace", fontSize: 10, color: "#00ff88", letterSpacing: 3, marginBottom: 10 }}>HISTORICAL PATTERN MATCHING</div>
                    <div style={{ background: "#080f1a", border: "1px solid rgba(0,255,136,0.15)", borderRadius: 4, padding: 14, marginBottom: 14 }}>
                      {rippleChain.historicalAnalogue && <div style={{ marginBottom: 8 }}><span style={{ fontFamily: "monospace", fontSize: 10, color: "#00ff88" }}>ANALOGUE: </span><span style={{ fontSize: 12, color: "#e8f4ff" }}>{rippleChain.historicalAnalogue}</span>{rippleChain.patternRepeatProbability && <span style={{ fontFamily: "monospace", fontSize: 10, color: "#ffb800", marginLeft: 8 }}>{rippleChain.patternRepeatProbability} repeat chance</span>}</div>}
                      {rippleChain.whatHappenedThen && <div style={{ fontSize: 11, color: "#8aabb8", lineHeight: 1.6, marginBottom: 8 }}>{rippleChain.whatHappenedThen}</div>}
                      {rippleChain.keyDifference && <div style={{ fontSize: 11, color: "#ffb800", marginBottom: 6 }}>KEY DIFFERENCE: {rippleChain.keyDifference}</div>}
                      {rippleChain.naturalPattern && <div style={{ fontSize: 11, color: "#8aabb8" }}>NATURAL CYCLE: {rippleChain.naturalPattern}</div>}
                    </div>

                    {/* Psychology */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
                      {[["SMART MONEY", rippleChain.smartMoneyMove, "#39ff14"], ["RETAIL TRAP", rippleChain.retailTrap, "#ff2d55"], ["CONTRARIAN", rippleChain.contrarianView, "#b24fff"]].map(([label, val, color]) => val ? (
                        <div key={label} style={{ background: "#080f1a", border: `1px solid ${color}25`, borderRadius: 4, padding: 10 }}>
                          <div style={{ fontFamily: "monospace", fontSize: 9, color, marginBottom: 4 }}>{label}</div>
                          <div style={{ fontSize: 10, color: "#c8dce8", lineHeight: 1.5 }}>{val}</div>
                        </div>
                      ) : null)}
                    </div>

                    {/* Predictions */}
                    {rippleChain.predictions && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
                        {[["7 DAYS", rippleChain.predictions.day7], ["14 DAYS", rippleChain.predictions.day14], ["21 DAYS", rippleChain.predictions.day21]].map(([label, val]) => val ? (
                          <div key={label} style={{ background: "rgba(0,255,136,0.04)", border: "1px solid rgba(0,255,136,0.15)", borderRadius: 4, padding: "8px 10px", textAlign: "center" }}>
                            <div style={{ fontFamily: "monospace", fontSize: 9, color: "#4a6d8c", marginBottom: 4 }}>{label}</div>
                            <div style={{ fontSize: 10, color: "#e8f4ff" }}>{val}</div>
                          </div>
                        ) : null)}
                      </div>
                    )}

                    <div style={{ fontSize: 9, color: "#4a6d8c", fontFamily: "monospace" }}>
                      Generated: {new Date(rippleChain.timestamp).toLocaleString()} · Ripple signals injected into pipeline scoring (1.5x boost)
                      <button onClick={() => loadRippleChain(rippleInput, true)} style={{ marginLeft: 8, background: "none", border: "none", color: "#4a6d8c", cursor: "pointer", fontSize: 9, fontFamily: "monospace" }}>⟳ refresh</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* EARNINGS DEEP DIVE TAB */}
            {tab === "earnings" && (
              <div style={{ height: "100%", overflowY: "auto", paddingBottom: 40 }}>
                <div style={{ background: "linear-gradient(135deg,rgba(0,212,255,0.1),rgba(0,212,255,0.03))", border: "1px solid rgba(0,212,255,0.3)", borderRadius: 4, padding: "14px 16px", marginBottom: 16 }}>
                  <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#00d4ff", letterSpacing: 3, marginBottom: 4 }}>📊 EARNINGS DEEP DIVE</div>
                  <div style={{ fontSize: 11, color: "#8aabb8", marginBottom: 12 }}>4-week pre-earnings research — analyst consensus, Reddit sentiment, historical patterns, 7/14/21 day predictions</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input value={diveSearch} onChange={e => setDiveSearch(e.target.value.toUpperCase())} placeholder="Enter ticker (e.g. NVDA)" style={{ background: "#0d1829", border: "1px solid rgba(0,212,255,0.3)", color: "#e8f4ff", borderRadius: 3, padding: "8px 12px", fontSize: 12, fontFamily: "monospace", flex: 1, outline: "none" }} onKeyDown={e => { if (e.key === "Enter" && diveSearch) loadEarningsDive(diveSearch, true); }} />
                    <button onClick={() => diveSearch && loadEarningsDive(diveSearch, true)} disabled={!diveSearch || loadingDive[diveSearch]} style={{ background: "rgba(0,212,255,0.15)", border: "1px solid rgba(0,212,255,0.4)", color: "#00d4ff", borderRadius: 3, padding: "8px 18px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "monospace" }}>
                      {loadingDive[diveSearch] ? "ANALYZING..." : "📊 DIVE"}
                    </button>
                  </div>
                  {/* Quick access buttons for earnings calendar stocks */}
                  {earnings.filter(e => e.daysOut >= 0 && e.daysOut <= 30).length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                      <span style={{ fontFamily: "monospace", fontSize: 9, color: "#4a6d8c", alignSelf: "center" }}>QUICK:</span>
                      {earnings.filter(e => e.daysOut >= 0 && e.daysOut <= 30).map(e => (
                        <button key={e.ticker} onClick={() => { setDiveSearch(e.ticker); loadEarningsDive(e.ticker); }} style={{ fontFamily: "monospace", fontSize: 9, padding: "2px 8px", borderRadius: 2, background: e.daysOut <= 7 ? "rgba(255,45,85,0.1)" : "rgba(0,212,255,0.08)", color: e.daysOut <= 7 ? "#ff2d55" : "#00d4ff", border: `1px solid ${e.daysOut <= 7 ? "rgba(255,45,85,0.3)" : "rgba(0,212,255,0.2)"}`, cursor: "pointer" }}>
                          {e.ticker} +{e.daysOut}d
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Dive results */}
                {Object.entries(earningsDive).map(([ticker, dive]) => (
                  <div key={ticker} style={{ background: "#080f1a", border: "1px solid rgba(0,212,255,0.2)", borderRadius: 6, padding: 16, marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                      <div>
                        <span style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 700, color: "#00d4ff", marginRight: 12 }}>{ticker}</span>
                        {dive.currentPrice && <span style={{ fontFamily: "monospace", fontSize: 13, color: "#e8f4ff" }}>${dive.currentPrice?.toFixed(2)}</span>}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        {dive.earningsDate && <div style={{ fontFamily: "monospace", fontSize: 10, color: "#ffb800" }}>EARNINGS: {dive.earningsDate}</div>}
                        {dive.daysToEarnings && <div style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: parseInt(dive.daysToEarnings) <= 7 ? "#ff2d55" : "#ffb800" }}>{dive.daysToEarnings} days away</div>}
                      </div>
                    </div>

                    {/* Key metrics row */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 12 }}>
                      {[
                        ["CONSENSUS", dive.analystConsensus, dive.analystConsensus === "BUY" ? "#39ff14" : dive.analystConsensus === "SELL" ? "#ff2d55" : "#ffb800"],
                        ["PRICE TARGET", dive.analystPriceTarget, "#00d4ff"],
                        ["BEAT PROB", dive.beatProbability, "#39ff14"],
                        ["MISS PROB", dive.missProbability, "#ff2d55"],
                      ].map(([label, val, color]) => (
                        <div key={label} style={{ background: "rgba(0,212,255,0.05)", border: "1px solid rgba(0,212,255,0.1)", borderRadius: 3, padding: "6px 8px", textAlign: "center" }}>
                          <div style={{ fontFamily: "monospace", fontSize: 8, color: "#4a6d8c", marginBottom: 3 }}>{label}</div>
                          <div style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: color || "#e8f4ff" }}>{val || "—"}</div>
                        </div>
                      ))}
                    </div>

                    {/* Market expectation + key metric */}
                    {dive.marketExpectation && <div style={{ fontSize: 11, color: "#c8dce8", marginBottom: 8, paddingLeft: 10, borderLeft: "2px solid rgba(0,212,255,0.3)", lineHeight: 1.6 }}>{dive.marketExpectation}</div>}
                    {dive.keyMetric && <div style={{ fontSize: 10, fontFamily: "monospace", color: "#ffb800", marginBottom: 10 }}>KEY METRIC: {dive.keyMetric}</div>}

                    {/* Historical pattern */}
                    {dive.historicalPattern && (
                      <div style={{ background: "rgba(178,79,255,0.05)", border: "1px solid rgba(178,79,255,0.2)", borderRadius: 3, padding: "8px 10px", marginBottom: 10 }}>
                        <div style={{ fontFamily: "monospace", fontSize: 9, color: "#b24fff", marginBottom: 4 }}>HISTORICAL PATTERN</div>
                        <div style={{ fontSize: 11, color: "#c8dce8" }}>{dive.historicalPattern}</div>
                        {dive.postEarningsMoveSize && <div style={{ fontFamily: "monospace", fontSize: 10, color: dive.postEarningsDirection === "up" ? "#39ff14" : "#ff2d55", marginTop: 4 }}>Typical move: {dive.postEarningsDirection?.toUpperCase()} {dive.postEarningsMoveSize}</div>}
                      </div>
                    )}

                    {/* Sentiment */}
                    {dive.sentiment && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
                        {[["REDDIT", dive.sentiment.reddit, dive.sentiment.reddit?.includes("bullish") ? "#39ff14" : dive.sentiment.reddit?.includes("bearish") ? "#ff2d55" : "#ffb800"],
                          ["INSTITUTIONS", dive.sentiment.institutionalPositioning, dive.sentiment.institutionalPositioning === "accumulating" ? "#39ff14" : dive.sentiment.institutionalPositioning === "distributing" ? "#ff2d55" : "#ffb800"],
                          ["OPTIONS BIAS", dive.sentiment.optionsBias, dive.sentiment.optionsBias === "calls" ? "#39ff14" : dive.sentiment.optionsBias === "puts" ? "#ff2d55" : "#ffb800"],
                        ].map(([label, val, color]) => (
                          <div key={label} style={{ background: "#080f1a", border: "1px solid #1a2d47", borderRadius: 3, padding: "6px 8px", textAlign: "center" }}>
                            <div style={{ fontFamily: "monospace", fontSize: 8, color: "#4a6d8c", marginBottom: 3 }}>{label}</div>
                            <div style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, color: color || "#8aabb8" }}>{val || "—"}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Predictions */}
                    {dive.predictions && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
                        {[["7 DAYS", dive.predictions.day7], ["14 DAYS", dive.predictions.day14], ["21 DAYS", dive.predictions.day21]].map(([label, pred]) => (
                          <div key={label} style={{ background: "rgba(0,212,255,0.03)", border: "1px solid rgba(0,212,255,0.1)", borderRadius: 3, padding: "6px 8px", textAlign: "center" }}>
                            <div style={{ fontFamily: "monospace", fontSize: 8, color: "#4a6d8c", marginBottom: 3 }}>{label}</div>
                            <div style={{ fontSize: 10, color: "#e8f4ff" }}>{pred || "—"}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Trade recommendation */}
                    {dive.trade?.thesis && (
                      <div style={{ background: dive.trade.direction === "CALL" ? "rgba(57,255,20,0.05)" : "rgba(255,45,85,0.05)", border: `1px solid ${dive.trade.direction === "CALL" ? "rgba(57,255,20,0.3)" : "rgba(255,45,85,0.3)"}`, borderRadius: 4, padding: 12 }}>
                        <div style={{ fontFamily: "monospace", fontSize: 10, color: dive.trade.direction === "CALL" ? "#39ff14" : "#ff2d55", letterSpacing: 2, marginBottom: 6 }}>EARNINGS TRADE RECOMMENDATION</div>
                        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
                          <span style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700, color: dive.trade.direction === "CALL" ? "#39ff14" : "#ff2d55" }}>{ticker} {dive.trade.direction}</span>
                          {dive.trade.expiry && <span style={{ fontSize: 11, color: "#8aabb8", fontFamily: "monospace" }}>exp {dive.trade.expiry}</span>}
                          <span style={{ fontFamily: "monospace", fontSize: 10, padding: "2px 8px", borderRadius: 2, background: dive.trade.confidence === "HIGH" ? "rgba(57,255,20,0.1)" : "rgba(255,184,0,0.1)", color: dive.trade.confidence === "HIGH" ? "#39ff14" : "#ffb800" }}>{dive.trade.confidence}</span>
                        </div>
                        <div style={{ fontSize: 11, color: "#c8dce8", lineHeight: 1.6, marginBottom: 6 }}>{dive.trade.thesis}</div>
                        {dive.trade.risk && <div style={{ fontSize: 10, color: "#ff2d55", fontFamily: "monospace" }}>⚠ RISK: {dive.trade.risk}</div>}
                      </div>
                    )}

                    {/* Domino stocks */}
                    {dive.predictions?.dominoStocks && (
                      <div style={{ marginTop: 10, fontSize: 10, color: "#8aabb8", fontFamily: "monospace" }}>
                        DOMINO STOCKS when {ticker} reports: {dive.predictions.dominoStocks}
                      </div>
                    )}

                    <div style={{ fontSize: 9, color: "#4a6d8c", marginTop: 8, fontFamily: "monospace" }}>
                      Generated: {new Date(dive.timestamp).toLocaleString()}
                      <button onClick={() => loadEarningsDive(ticker, true)} style={{ marginLeft: 8, background: "none", border: "none", color: "#4a6d8c", cursor: "pointer", fontSize: 9, fontFamily: "monospace" }}>⟳ refresh</button>
                    </div>
                  </div>
                ))}

                {Object.keys(earningsDive).length === 0 && !Object.values(loadingDive).some(Boolean) && (
                  <div style={{ textAlign: "center", padding: 40, color: "#4a6d8c", fontSize: 11, fontFamily: "monospace" }}>Enter a ticker above or click a quick-access earnings stock to start deep dive analysis</div>
                )}
              </div>
            )}

            {/* NEWS BIAS TAB */}
            {tab === "bias" && (
              <div style={{ height: "100%", overflowY: "auto", paddingBottom: 40 }}>
                <div style={{ background: "linear-gradient(135deg,rgba(255,184,0,0.1),rgba(255,184,0,0.03))", border: "1px solid rgba(255,184,0,0.3)", borderRadius: 4, padding: "14px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#ffb800", letterSpacing: 3, marginBottom: 4 }}>🔍 NEWS BIAS FILTER</div>
                    <div style={{ fontSize: 11, color: "#8aabb8" }}>Detects pumping, coordinated narratives, arms-length relationships, staged alliances</div>
                  </div>
                  <button onClick={() => loadNewsBias(true)} disabled={loadingBias} style={{ background: loadingBias ? "#1a2d47" : "rgba(255,184,0,0.15)", border: "1px solid rgba(255,184,0,0.4)", color: loadingBias ? "#4a6d8c" : "#ffb800", borderRadius: 3, padding: "9px 18px", fontSize: 11, fontWeight: 700, cursor: loadingBias ? "not-allowed" : "pointer", fontFamily: "monospace" }}>
                    {loadingBias ? "SCANNING..." : "🔍 SCAN BIAS"}
                  </button>
                </div>

                {biasError && <div style={{ padding: 12, background: "rgba(255,184,0,0.1)", border: "1px solid rgba(255,184,0,0.3)", borderRadius: 4, color: "#ffb800", fontSize: 12, fontFamily: "monospace", marginBottom: 16 }}>⚠ {biasError}</div>}

                {!newsBias && !loadingBias && (
                  <div style={{ textAlign: "center", padding: 60 }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
                    <div style={{ fontFamily: "monospace", fontSize: 14, color: "#ffb800", letterSpacing: 3, marginBottom: 8 }}>NEWS BIAS DETECTOR</div>
                    <div style={{ fontSize: 12, color: "#4a6d8c", marginBottom: 24 }}>Analyzes headlines from CNN, BBC, CNBC, Bloomberg, Reddit to detect manipulation, pumping, coordinated narratives, and staged alliances</div>
                    <button onClick={() => loadNewsBias(true)} style={{ background: "rgba(255,184,0,0.15)", border: "1px solid rgba(255,184,0,0.4)", color: "#ffb800", borderRadius: 3, padding: "12px 28px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "monospace", letterSpacing: 2 }}>🔍 SCAN NOW</button>
                  </div>
                )}

                {newsBias && (
                  <div>
                    {/* Manipulation risk banner */}
                    <div style={{ background: newsBias.manipulationRisk === "CRITICAL" ? "rgba(255,45,85,0.1)" : newsBias.manipulationRisk === "HIGH" ? "rgba(255,60,0,0.1)" : newsBias.manipulationRisk === "MEDIUM" ? "rgba(255,184,0,0.1)" : "rgba(57,255,20,0.05)", border: `1px solid ${newsBias.manipulationRisk === "CRITICAL" ? "rgba(255,45,85,0.4)" : newsBias.manipulationRisk === "HIGH" ? "rgba(255,60,0,0.4)" : newsBias.manipulationRisk === "MEDIUM" ? "rgba(255,184,0,0.4)" : "rgba(57,255,20,0.2)"}`, borderRadius: 4, padding: "10px 14px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontFamily: "monospace", fontSize: 11, color: "#8aabb8" }}>MANIPULATION RISK — {newsBias.headlinesAnalyzed} headlines scanned</span>
                      <span style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700, color: newsBias.manipulationRisk === "CRITICAL" ? "#ff2d55" : newsBias.manipulationRisk === "HIGH" ? "#ff3c00" : newsBias.manipulationRisk === "MEDIUM" ? "#ffb800" : "#39ff14" }}>{newsBias.manipulationRisk}</span>
                    </div>

                    {/* Alert cards */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                      {[
                        { label: "PUMP DETECTED", value: newsBias.pumpDetected, tickers: newsBias.pumpTickers, evidence: newsBias.pumpEvidence, color: "#ff2d55" },
                        { label: "DUMP DETECTED", value: newsBias.dumpDetected, tickers: newsBias.dumpTickers, evidence: newsBias.dumpEvidence, color: "#ff3c00" },
                        { label: "COORDINATED NARRATIVE", value: newsBias.coordinatedNarrative, detail: newsBias.narrativeTheme, evidence: newsBias.narrativeEvidence, color: "#ffb800" },
                        { label: "ALLIANCE DETECTED", value: newsBias.allianceDetected, detail: newsBias.allianceParties, evidence: newsBias.allianceEvidence, color: "#b24fff" },
                      ].map(({ label, value, tickers, detail, evidence, color }) => (
                        <div key={label} style={{ background: "#080f1a", border: `1px solid ${value ? color + "40" : "rgba(74,109,140,0.2)"}`, borderRadius: 4, padding: 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ fontFamily: "monospace", fontSize: 9, color: "#4a6d8c" }}>{label}</span>
                            <span style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, color: value ? color : "#39ff14" }}>{value ? "YES ⚠" : "NO ✓"}</span>
                          </div>
                          {tickers?.length > 0 && <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 4 }}>{tickers.map(t => <span key={t} style={{ fontFamily: "monospace", fontSize: 9, padding: "1px 5px", borderRadius: 2, background: color + "15", color }}>{t}</span>)}</div>}
                          {(detail || evidence) && <div style={{ fontSize: 10, color: "#8aabb8", lineHeight: 1.5 }}>{detail || evidence}</div>}
                        </div>
                      ))}
                    </div>

                    {/* Bias direction */}
                    <div style={{ background: "#080f1a", border: "1px solid rgba(255,184,0,0.2)", borderRadius: 4, padding: 12, marginBottom: 12 }}>
                      <div style={{ fontFamily: "monospace", fontSize: 10, color: "#ffb800", letterSpacing: 2, marginBottom: 8 }}>MARKET BIAS ANALYSIS</div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: newsBias.mostBiasedDirection === "bullish" ? "#39ff14" : newsBias.mostBiasedDirection === "bearish" ? "#ff2d55" : "#ffb800" }}>{newsBias.mostBiasedDirection?.toUpperCase()}</span>
                        <span style={{ fontSize: 11, color: "#8aabb8" }}>{newsBias.biasReasoning}</span>
                      </div>
                      {newsBias.contrarianPlay && (
                        <div style={{ padding: "8px 10px", background: "rgba(57,255,20,0.05)", border: "1px solid rgba(57,255,20,0.2)", borderRadius: 3 }}>
                          <div style={{ fontFamily: "monospace", fontSize: 9, color: "#39ff14", marginBottom: 4 }}>CONTRARIAN PLAY</div>
                          <div style={{ fontSize: 11, color: "#c8dce8" }}>{newsBias.contrarianPlay}</div>
                        </div>
                      )}
                    </div>

                    {/* Real vs fake signals */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                      {newsBias.realSignal?.ticker && (
                        <div style={{ background: "rgba(57,255,20,0.05)", border: "1px solid rgba(57,255,20,0.2)", borderRadius: 4, padding: 10 }}>
                          <div style={{ fontFamily: "monospace", fontSize: 9, color: "#39ff14", marginBottom: 6 }}>✓ GENUINE SIGNAL</div>
                          <div style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: "#39ff14", marginBottom: 4 }}>{newsBias.realSignal.ticker}</div>
                          <div style={{ fontSize: 10, color: "#8aabb8" }}>{newsBias.realSignal.reason}</div>
                        </div>
                      )}
                      {newsBias.fakeSignal?.ticker && (
                        <div style={{ background: "rgba(255,45,85,0.05)", border: "1px solid rgba(255,45,85,0.2)", borderRadius: 4, padding: 10 }}>
                          <div style={{ fontFamily: "monospace", fontSize: 9, color: "#ff2d55", marginBottom: 6 }}>⚠ MANUFACTURED SIGNAL</div>
                          <div style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: "#ff2d55", marginBottom: 4 }}>{newsBias.fakeSignal.ticker}</div>
                          <div style={{ fontSize: 10, color: "#8aabb8" }}>{newsBias.fakeSignal.reason}</div>
                        </div>
                      )}
                    </div>

                    {/* Analyst/social manipulation */}
                    {(newsBias.analystConflict || newsBias.brokerPump || newsBias.socialManipulation) && (
                      <div style={{ background: "#080f1a", border: "1px solid rgba(255,60,0,0.2)", borderRadius: 4, padding: 12, marginBottom: 12 }}>
                        <div style={{ fontFamily: "monospace", fontSize: 10, color: "#ff3c00", letterSpacing: 2, marginBottom: 8 }}>CONFLICT OF INTEREST FLAGS</div>
                        {newsBias.analystConflict && <div style={{ fontSize: 11, color: "#ffb800", marginBottom: 4 }}>⚠ ANALYST CONFLICT: {newsBias.analystConflictDetail}</div>}
                        {newsBias.brokerPump && <div style={{ fontSize: 11, color: "#ffb800", marginBottom: 4 }}>⚠ BROKER PUMP: {newsBias.brokerPumpDetail}</div>}
                        {newsBias.socialManipulation && <div style={{ fontSize: 11, color: "#ffb800", marginBottom: 4 }}>⚠ SOCIAL MANIPULATION: {newsBias.socialManipulationDetail}</div>}
                        {newsBias.hedgeFundSignal && <div style={{ fontSize: 11, color: "#8aabb8" }}>HF SIGNAL: {newsBias.hedgeFundSignal}</div>}
                      </div>
                    )}

                    {/* Trusted vs avoid */}
                    {(newsBias.trustedSignals || newsBias.avoidSignals) && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                        {newsBias.trustedSignals && (
                          <div style={{ background: "#080f1a", border: "1px solid rgba(57,255,20,0.15)", borderRadius: 4, padding: 10 }}>
                            <div style={{ fontFamily: "monospace", fontSize: 9, color: "#39ff14", marginBottom: 6 }}>TRUST THESE</div>
                            <div style={{ fontSize: 10, color: "#c8dce8", lineHeight: 1.6 }}>{newsBias.trustedSignals}</div>
                          </div>
                        )}
                        {newsBias.avoidSignals && (
                          <div style={{ background: "#080f1a", border: "1px solid rgba(255,45,85,0.15)", borderRadius: 4, padding: 10 }}>
                            <div style={{ fontFamily: "monospace", fontSize: 9, color: "#ff2d55", marginBottom: 6 }}>AVOID THESE</div>
                            <div style={{ fontSize: 10, color: "#c8dce8", lineHeight: 1.6 }}>{newsBias.avoidSignals}</div>
                          </div>
                        )}
                      </div>
                    )}

                    <div style={{ fontSize: 10, color: "#4a6d8c", fontFamily: "monospace" }}>
                      Scanned: {new Date(newsBias.timestamp).toLocaleString()} · Bias signals injected into pipeline (pumped tickers -50% score, genuine signals +boost)
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* WAR RIPPLE TAB */}
            {tab === "war" && (
              <div style={{ height: "100%", overflowY: "auto", paddingBottom: 40 }}>
                <div style={{ background: "linear-gradient(135deg,rgba(255,60,0,0.1),rgba(255,60,0,0.03))", border: "1px solid rgba(255,60,0,0.3)", borderRadius: 4, padding: "14px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#ff3c00", letterSpacing: 3, marginBottom: 4 }}>☢ WAR RIPPLE ENGINE</div>
                    <div style={{ fontSize: 11, color: "#8aabb8" }}>Iran-Israel-US conflict → full economic cascade → 7/14/21 day predictions</div>
                  </div>
                  <button onClick={() => loadWarRipple(true)} disabled={loadingWar} style={{ background: loadingWar ? "#1a2d47" : "rgba(255,60,0,0.15)", border: "1px solid rgba(255,60,0,0.4)", color: loadingWar ? "#4a6d8c" : "#ff3c00", borderRadius: 3, padding: "9px 18px", fontSize: 11, fontWeight: 700, cursor: loadingWar ? "not-allowed" : "pointer", fontFamily: "monospace" }}>
                    {loadingWar ? "ANALYZING..." : "☢ ANALYZE NOW"}
                  </button>
                </div>

                {warError && <div style={{ padding: 12, background: "rgba(255,60,0,0.1)", border: "1px solid rgba(255,60,0,0.3)", borderRadius: 4, color: "#ff6b35", fontSize: 12, fontFamily: "monospace", marginBottom: 16 }}>⚠ {warError}</div>}

                {!warRipple && !loadingWar && (
                  <div style={{ textAlign: "center", padding: 60 }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>☢</div>
                    <div style={{ fontFamily: "monospace", fontSize: 14, color: "#ff3c00", letterSpacing: 3, marginBottom: 8 }}>WAR RIPPLE ANALYSIS</div>
                    <div style={{ fontSize: 12, color: "#4a6d8c", marginBottom: 24 }}>Maps the full economic cascade from the Iran-Israel-US conflict to specific stocks with 7/14/21 day predictions</div>
                    <button onClick={() => loadWarRipple(true)} style={{ background: "rgba(255,60,0,0.15)", border: "1px solid rgba(255,60,0,0.4)", color: "#ff3c00", borderRadius: 3, padding: "12px 28px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "monospace", letterSpacing: 2 }}>☢ ANALYZE WAR RIPPLE</button>
                  </div>
                )}

                {warRipple && (
                  <div>
                    {/* War status header */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 16 }}>
                      {[
                        ["WAR STATUS", warRipple.warStatus?.toUpperCase(), warRipple.warStatus === "escalating" ? "#ff2d55" : warRipple.warStatus === "de-escalating" ? "#39ff14" : "#ffb800"],
                        ["HORMUZ", warRipple.hormuz?.status?.toUpperCase(), warRipple.hormuz?.status === "closed" ? "#ff2d55" : warRipple.hormuz?.status === "threatened" ? "#ffb800" : "#39ff14"],
                        ["OIL TREND", warRipple.oil?.direction?.toUpperCase(), warRipple.oil?.direction === "rising" ? "#ff2d55" : warRipple.oil?.direction === "falling" ? "#39ff14" : "#ffb800"],
                        ["CLOSURE RISK", warRipple.hormuz?.closureProbability, "#ff3c00"],
                      ].map(([label, val, color]) => (
                        <div key={label} style={{ background: "#080f1a", border: "1px solid rgba(255,60,0,0.2)", borderRadius: 4, padding: "8px 10px", textAlign: "center" }}>
                          <div style={{ fontFamily: "monospace", fontSize: 9, color: "#4a6d8c", marginBottom: 4 }}>{label}</div>
                          <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color }}>{val || "—"}</div>
                        </div>
                      ))}
                    </div>

                    {/* Who needs this war */}
                    {warRipple.warGoodForPower && (
                      <div style={{ background: "#080f1a", border: "1px solid rgba(255,60,0,0.3)", borderRadius: 4, padding: 14, marginBottom: 14 }}>
                        <div style={{ fontFamily: "monospace", fontSize: 10, color: "#ff3c00", letterSpacing: 2, marginBottom: 8 }}>☢ WHO NEEDS THIS WAR</div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "#e8f4ff", marginBottom: 6 }}>{warRipple.warGoodForPower}</div>
                        <div style={{ fontSize: 11, color: "#8aabb8", lineHeight: 1.6 }}>{warRipple.warSurvivalThesis}</div>
                      </div>
                    )}

                    {/* Objectives */}
                    {warRipple.objectives && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                        {[["🇮🇷 IRAN", warRipple.objectives.iran], ["🇮🇱 ISRAEL", warRipple.objectives.israel], ["🇺🇸 US", warRipple.objectives.us], ["🇷🇺 RUSSIA", warRipple.objectives.russia]].filter(([,v]) => v).map(([label, val]) => (
                          <div key={label} style={{ background: "#080f1a", border: "1px solid #1a2d47", borderRadius: 4, padding: "8px 12px" }}>
                            <div style={{ fontFamily: "monospace", fontSize: 9, color: "#4a6d8c", marginBottom: 4 }}>{label} OBJECTIVE</div>
                            <div style={{ fontSize: 11, color: "#c8dce8", lineHeight: 1.5 }}>{val}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Oil predictions */}
                    <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                      {[["7-DAY OIL TARGET", warRipple.oil?.target7d], ["21-DAY OIL TARGET", warRipple.oil?.target21d]].filter(([,v]) => v).map(([label, val]) => (
                        <div key={label} style={{ flex: 1, minWidth: 120, background: "#080f1a", border: "1px solid rgba(255,184,0,0.2)", borderRadius: 4, padding: "8px 12px", textAlign: "center" }}>
                          <div style={{ fontFamily: "monospace", fontSize: 9, color: "#4a6d8c", marginBottom: 4 }}>{label}</div>
                          <div style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 700, color: "#ffb800" }}>{val}</div>
                        </div>
                      ))}
                    </div>

                    {/* Ripple layers */}
                    {warRipple.rippleLayers?.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontFamily: "monospace", fontSize: 10, color: "#ff3c00", letterSpacing: 3, marginBottom: 10 }}>ECONOMIC CASCADE — LAYER BY LAYER</div>
                        {warRipple.rippleLayers.map((layer, i) => (
                          <div key={i} style={{ background: "#080f1a", border: "1px solid rgba(255,60,0,0.15)", borderRadius: 4, padding: 12, marginBottom: 8 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                              <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "#ff3c00" }}>LAYER {layer.layer} — {layer.event}</span>
                              <span style={{ fontFamily: "monospace", fontSize: 9, color: "#4a6d8c" }}>{layer.timing}</span>
                            </div>
                            <div style={{ display: "flex", gap: 12 }}>
                              {layer.stocksUp?.length > 0 && (
                                <div>
                                  <div style={{ fontSize: 9, fontFamily: "monospace", color: "#39ff14", marginBottom: 3 }}>CALLS →</div>
                                  <div style={{ display: "flex", gap: 4, flexWrap: "nowrap", overflowX: "auto", paddingBottom: 4, scrollbarWidth: "thin", scrollbarColor: "#1a2d47 transparent" }}>
                                    {layer.stocksUp.map(t => <span key={t} style={{ fontFamily: "monospace", fontSize: 10, padding: "1px 6px", borderRadius: 2, background: "rgba(57,255,20,0.1)", color: "#39ff14" }}>{t}</span>)}
                                  </div>
                                </div>
                              )}
                              {layer.stocksDown?.length > 0 && (
                                <div>
                                  <div style={{ fontSize: 9, fontFamily: "monospace", color: "#ff2d55", marginBottom: 3 }}>PUTS →</div>
                                  <div style={{ display: "flex", gap: 4, flexWrap: "nowrap", overflowX: "auto", paddingBottom: 4, scrollbarWidth: "thin", scrollbarColor: "#1a2d47 transparent" }}>
                                    {layer.stocksDown.map(t => <span key={t} style={{ fontFamily: "monospace", fontSize: 10, padding: "1px 6px", borderRadius: 2, background: "rgba(255,45,85,0.1)", color: "#ff2d55" }}>{t}</span>)}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Highest conviction */}
                    {warRipple.highestConviction?.ticker && (
                      <div style={{ background: "rgba(255,60,0,0.08)", border: "2px solid rgba(255,60,0,0.4)", borderRadius: 6, padding: 14, marginBottom: 16 }}>
                        <div style={{ fontFamily: "monospace", fontSize: 10, color: "#ff3c00", letterSpacing: 2, marginBottom: 8 }}>☢ HIGHEST CONVICTION WAR PLAY</div>
                        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
                          <span style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 700, color: warRipple.highestConviction.direction === "CALL" ? "#39ff14" : "#ff2d55" }}>{warRipple.highestConviction.ticker}</span>
                          <span style={{ fontFamily: "monospace", fontSize: 11, padding: "3px 10px", borderRadius: 3, background: warRipple.highestConviction.direction === "CALL" ? "rgba(57,255,20,0.1)" : "rgba(255,45,85,0.1)", color: warRipple.highestConviction.direction === "CALL" ? "#39ff14" : "#ff2d55" }}>{warRipple.highestConviction.direction}</span>
                        </div>
                        <div style={{ fontSize: 12, color: "#c8dce8", lineHeight: 1.6 }}>{warRipple.highestConviction.reason}</div>
                      </div>
                    )}

                    {/* 7/14/21 predictions */}
                    {warRipple.predictions && (
                      <div>
                        <div style={{ fontFamily: "monospace", fontSize: 10, color: "#ff3c00", letterSpacing: 3, marginBottom: 10 }}>STRUCTURED PREDICTIONS</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                          {[["7 DAYS", warRipple.predictions.day7], ["14 DAYS", warRipple.predictions.day14], ["21 DAYS", warRipple.predictions.day21]].map(([label, pred]) => (
                            <div key={label} style={{ background: "#080f1a", border: "1px solid rgba(255,60,0,0.2)", borderRadius: 4, padding: 10 }}>
                              <div style={{ fontFamily: "monospace", fontSize: 10, color: "#ff3c00", marginBottom: 8 }}>{label}</div>
                              <div style={{ fontSize: 9, fontFamily: "monospace", color: "#4a6d8c", marginBottom: 2 }}>OIL</div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: "#ffb800", marginBottom: 6 }}>{pred?.oilPrice || "—"}</div>
                              <div style={{ fontSize: 9, fontFamily: "monospace", color: "#4a6d8c", marginBottom: 2 }}>SPY</div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: pred?.spyDirection === "up" ? "#39ff14" : pred?.spyDirection === "down" ? "#ff2d55" : "#ffb800", marginBottom: 6 }}>{pred?.spyDirection?.toUpperCase()} {pred?.spyTarget}</div>
                              <div style={{ fontSize: 9, fontFamily: "monospace", color: "#4a6d8c", marginBottom: 2 }}>BEST PLAY</div>
                              <div style={{ fontSize: 11, color: "#e8f4ff", marginBottom: 4 }}>{pred?.bestPlay || "—"}</div>
                              <div style={{ fontSize: 9, fontFamily: "monospace", color: pred?.confidence === "HIGH" ? "#39ff14" : pred?.confidence === "MEDIUM" ? "#ffb800" : "#4a6d8c" }}>{pred?.confidence}</div>
                            </div>
                          ))}
                        </div>

                        {/* Scenario probabilities */}
                        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                          {[["ESCALATION", warRipple.predictions.scenarioProbabilities?.escalation, "#ff2d55"], ["DE-ESCALATION", warRipple.predictions.scenarioProbabilities?.deescalation, "#39ff14"], ["BLACK SWAN", warRipple.predictions.scenarioProbabilities?.blackSwan, "#b24fff"]].map(([label, prob, color]) => (
                            <div key={label} style={{ flex: 1, background: "#080f1a", border: `1px solid ${color}30`, borderRadius: 4, padding: "8px 10px", textAlign: "center" }}>
                              <div style={{ fontFamily: "monospace", fontSize: 9, color: "#4a6d8c", marginBottom: 4 }}>{label}</div>
                              <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700, color }}>{prob || "—"}</div>
                            </div>
                          ))}
                        </div>

                        {/* Domino chain */}
                        {warRipple.predictions.dominoChain && (
                          <div style={{ background: "#080f1a", border: "1px solid rgba(255,60,0,0.2)", borderRadius: 4, padding: 12 }}>
                            <div style={{ fontFamily: "monospace", fontSize: 9, color: "#ff3c00", letterSpacing: 2, marginBottom: 6 }}>DOMINO CHAIN — IF ESCALATION</div>
                            <div style={{ fontSize: 11, color: "#c8dce8", lineHeight: 1.7 }}>{warRipple.predictions.dominoChain}</div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Wildcard */}
                    {warRipple.wildcard?.event && (
                      <div style={{ marginTop: 12, background: "rgba(178,79,255,0.05)", border: "1px solid rgba(178,79,255,0.2)", borderRadius: 4, padding: 12 }}>
                        <div style={{ fontFamily: "monospace", fontSize: 9, color: "#b24fff", letterSpacing: 2, marginBottom: 6 }}>⚡ WILDCARD EVENT</div>
                        <div style={{ fontSize: 12, color: "#e8f4ff", marginBottom: 4 }}>{warRipple.wildcard.event}</div>
                        <div style={{ fontFamily: "monospace", fontSize: 10, color: "#b24fff" }}>Probability: {warRipple.wildcard.probability}</div>
                      </div>
                    )}

                    <div style={{ fontSize: 10, color: "#4a6d8c", marginTop: 12, fontFamily: "monospace" }}>
                      Generated: {new Date(warRipple.timestamp).toLocaleString()} · War signals injected into pipeline scoring (2x boost)
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* WATCHLIST TAB */}
            {tab === "watch" && (
              <div style={{ height: "100%", overflowY: "auto", paddingBottom: 40 }}>
                {/* Header */}
                <div style={{ background: "linear-gradient(135deg,rgba(0,212,255,0.1),rgba(0,212,255,0.03))", border: "1px solid rgba(0,212,255,0.3)", borderRadius: 4, padding: "14px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#00d4ff", letterSpacing: 3, marginBottom: 4 }}>👁 INTELLIGENCE WATCHLIST</div>
                    <div style={{ fontSize: 11, color: "#8aabb8" }}>Individuals and stocks — always monitored, injected into every scan</div>
                  </div>
                  <button onClick={scanWatchlist} disabled={loadingWatch} style={{ background: loadingWatch ? "#1a2d47" : "linear-gradient(135deg,#0a3d5c,#00d4ff)", color: loadingWatch ? "#4a6d8c" : "#fff", border: "none", borderRadius: 3, padding: "9px 18px", fontSize: 12, fontWeight: 700, letterSpacing: 2, cursor: loadingWatch ? "not-allowed" : "pointer", fontFamily: "monospace" }}>
                    {loadingWatch ? "SCANNING..." : "👁 SCAN NOW"}
                  </button>
                </div>

                {/* Add item form */}
                <div style={{ background: "#080f1a", border: "1px solid #1a3a5c", borderRadius: 4, padding: 16, marginBottom: 16 }}>
                  <div style={{ fontFamily: "monospace", fontSize: 10, color: "#4a6d8c", letterSpacing: 2, marginBottom: 12 }}>ADD TO WATCHLIST</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <select value={watchInput.type} onChange={e => setWatchInput(p => ({...p, type: e.target.value}))} style={{ background: "#0d1829", border: "1px solid #1a3a5c", color: "#e8f4ff", borderRadius: 3, padding: "6px 10px", fontSize: 11, fontFamily: "monospace", cursor: "pointer" }}>
                      <option value="individual">Individual</option>
                      <option value="stock">Stock</option>
                    </select>
                    <input value={watchInput.name} onChange={e => setWatchInput(p => ({...p, name: e.target.value}))} placeholder={watchInput.type === "stock" ? "Company name" : "Person name"} style={{ background: "#0d1829", border: "1px solid #1a3a5c", color: "#e8f4ff", borderRadius: 3, padding: "6px 10px", fontSize: 11, fontFamily: "monospace", flex: 1, minWidth: 140, outline: "none" }} />
                    {watchInput.type === "stock" && <input value={watchInput.ticker} onChange={e => setWatchInput(p => ({...p, ticker: e.target.value.toUpperCase()}))} placeholder="TICKER" style={{ background: "#0d1829", border: "1px solid #1a3a5c", color: "#e8f4ff", borderRadius: 3, padding: "6px 10px", fontSize: 11, fontFamily: "monospace", width: 90, outline: "none" }} />}
                    <button onClick={addToWatchlist} style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.4)", color: "#00d4ff", borderRadius: 3, padding: "6px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "monospace" }}>+ ADD</button>
                  </div>
                </div>

                {/* Watchlist display */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                  {/* Individuals */}
                  <div>
                    <div style={{ fontFamily: "monospace", fontSize: 10, color: "#b24fff", letterSpacing: 3, marginBottom: 10 }}>👤 INDIVIDUALS ({(watchlist.individuals||[]).length})</div>
                    {(watchlist.individuals || []).length === 0 && <div style={{ fontSize: 11, color: "#4a6d8c", fontStyle: "italic" }}>No individuals added yet</div>}
                    {(watchlist.individuals || []).map(item => {
                      const result = watchResults.find(r => r.id === item.id);
                      return (
                        <div key={item.id} style={{ background: "#080f1a", border: "1px solid rgba(178,79,255,0.2)", borderRadius: 4, padding: 12, marginBottom: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: result?.articles?.length ? 8 : 0 }}>
                            <div>
                              <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 500, color: "#e8f4ff" }}>{item.name}</span>
                              {result && <span style={{ marginLeft: 8, fontSize: 9, fontFamily: "monospace", color: result.signal === "ACTIVE" ? "#ff2d55" : result.signal === "MENTION" ? "#ffb800" : "#4a6d8c", padding: "1px 6px", background: result.signal === "ACTIVE" ? "rgba(255,45,85,0.1)" : "transparent", borderRadius: 2 }}>{result.signal}</span>}
                            </div>
                            <button onClick={() => removeFromWatchlist(item.id, "individual")} style={{ background: "none", border: "none", color: "#4a6d8c", cursor: "pointer", fontSize: 14, padding: "0 4px" }}>×</button>
                          </div>
                          {result?.articles?.map((a, i) => <div key={i} style={{ fontSize: 10, color: "#8aabb8", lineHeight: 1.4, marginBottom: 3, paddingLeft: 8, borderLeft: "2px solid rgba(178,79,255,0.3)" }}>{a}</div>)}
                        </div>
                      );
                    })}
                  </div>

                  {/* Stocks */}
                  <div>
                    <div style={{ fontFamily: "monospace", fontSize: 10, color: "#39ff14", letterSpacing: 3, marginBottom: 10 }}>📈 STOCKS ({(watchlist.stocks||[]).length})</div>
                    {(watchlist.stocks || []).length === 0 && <div style={{ fontSize: 11, color: "#4a6d8c", fontStyle: "italic" }}>No stocks added yet</div>}
                    {(watchlist.stocks || []).map(item => {
                      const result = watchResults.find(r => r.id === item.id);
                      return (
                        <div key={item.id} style={{ background: "#080f1a", border: "1px solid rgba(57,255,20,0.2)", borderRadius: 4, padding: 12, marginBottom: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: result?.articles?.length ? 8 : 0 }}>
                            <div>
                              {item.ticker && <span style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: "#39ff14", marginRight: 8 }}>{item.ticker}</span>}
                              <span style={{ fontSize: 12, color: "#8aabb8" }}>{item.name}</span>
                              {result && <span style={{ marginLeft: 8, fontSize: 9, fontFamily: "monospace", color: result.signal === "ACTIVE" ? "#ff2d55" : result.signal === "MENTION" ? "#ffb800" : "#4a6d8c", padding: "1px 6px", background: result.signal === "ACTIVE" ? "rgba(255,45,85,0.1)" : "transparent", borderRadius: 2 }}>{result.signal}</span>}
                            </div>
                            <button onClick={() => removeFromWatchlist(item.id, "stock")} style={{ background: "none", border: "none", color: "#4a6d8c", cursor: "pointer", fontSize: 14, padding: "0 4px" }}>×</button>
                          </div>
                          {result?.articles?.map((a, i) => <div key={i} style={{ fontSize: 10, color: "#8aabb8", lineHeight: 1.4, marginBottom: 3, paddingLeft: 8, borderLeft: "2px solid rgba(57,255,20,0.3)" }}>{a}</div>)}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ padding: "10px 14px", background: "rgba(0,212,255,0.04)", border: "1px solid rgba(0,212,255,0.15)", borderRadius: 3, fontSize: 10, color: "#4a6d8c", lineHeight: 1.8 }}>
                  <span style={{ color: "#00d4ff" }}>👁 HOW IT WORKS:</span> Every item here is automatically injected into Power Intel and Intel Picks scans. Watched individuals trigger psychographic analysis. Watched stocks get priority signal detection. Click Scan Now for live news feed per item.
                </div>
              </div>
            )}

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


