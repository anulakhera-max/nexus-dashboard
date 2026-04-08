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

// Estimate cost: ~$3 per 1M input tokens, ~$15 per 1M output tokens (Sonnet)
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
        const res = await fetch(`${nexusUrl}/api/intelligence${force ? "?force=true" : ""}`, {
          headers: { "x-nexus-key": nexusKey }
        });
        const data = await res.json();
        if (data.success) { picks = data.picks; meta = data; }
        else throw new Error(data.error || "API error");
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
      const text = await callClaude(`Country sourcing intelligence. Return ONLY JSON:\n{"hotspots":[{"country":"name","risk":"critical|high|medium","exports":["item (share%)"],"activeEvent":"event","priceImpact":"impact","alternatives":["country"]}]}\nCover: Russia,Ukraine,China,Saudi Arabia,Brazil,DRC,Australia,Iran,India,Taiwan.`, 700);
      setSourcesData(parseJSON(text)); setSourcesLoaded(true); trackCall(300, 700);
    } catch {}
    setLoadingTab(false);
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
  useEffect(() => { connectQuestrade(); }, []);

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
            <button style={{ ...S.tab(tab === "options", true), animation: tab !== "options" ? "goldGlow 3s infinite" : "none" }} onClick={() => handleTab("options")}>
              ★ OPTIONS PICKS
            </button>
            <button style={{ ...S.tab(tab === "intel", true), color: tab === "intel" ? "#b24fff" : "#4a6d8c", borderBottom: tab === "intel" ? "2px solid #b24fff" : "2px solid transparent", animation: tab !== "intel" ? "none" : "none" }} onClick={() => handleTab("intel")}>
              ⬡ INTEL PICKS
            </button>
            <button style={{ ...S.tab(tab === "power", true), color: tab === "power" ? "#ff6b35" : "#4a6d8c", borderBottom: tab === "power" ? "2px solid #ff6b35" : "2px solid transparent" }} onClick={() => handleTab("power")}>
              ◈ POWER INTEL
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

            {/* INTEL PICKS TAB */}
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
