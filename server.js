import express from "express";
const app = express();
app.use(express.json());

// ── CORS ──────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-nexus-key");
  if (req.method === "OPTIONS") return res.status(200).end();
  next();
});

// ── AUTH ──────────────────────────────────────────────────────
const validateKey = (req, res, next) => {
  const key = req.headers["x-nexus-key"] || req.query["x-nexus-key"];
  if (key !== (process.env.NEXUS_API_KEY || "nexus-axl-agent-key")) return res.status(401).json({ error: "Unauthorized" });
  next();
};

// ── HEALTH ────────────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString(), pipeline: !!getCache("data-layer") }));

// ── CLAUDE ────────────────────────────────────────────────────
async function callClaude(prompt, maxTokens = 1000) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content?.[0]?.text || "";
}

// ── EDGE CONFIG ───────────────────────────────────────────────
async function edgeGet(key) {
  try {
    const edgeUrl = process.env.EDGE_CONFIG;
    const token = process.env.VERCEL_ACCESS_TOKEN;
    if (!edgeUrl || !token) return null;
    const match = edgeUrl.match(/ecfg_[a-zA-Z0-9]+/);
    if (!match) return null;
    const res = await fetch(`https://api.vercel.com/v1/edge-config/${match[0]}/item/${key}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const data = await res.json();
    return data.value || null;
  } catch { return null; }
}

async function edgeSet(key, value) {
  try {
    const edgeUrl = process.env.EDGE_CONFIG;
    const token = process.env.VERCEL_ACCESS_TOKEN;
    if (!edgeUrl || !token) return false;
    const match = edgeUrl.match(/ecfg_[a-zA-Z0-9]+/);
    if (!match) return false;
    const res = await fetch(`https://api.vercel.com/v1/edge-config/${match[0]}/items`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ operation: "upsert", key, value }] }),
    });
    return res.ok;
  } catch { return false; }
}

// ── DATA FETCHERS ─────────────────────────────────────────────
async function fetchGDELT(query) {
  try {
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=8&format=json&timespan=3d&sort=hybridrel`;
    const res = await fetch(url, { headers: { "User-Agent": "NEXUS/1.0" }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.articles || []).map(a => a.title).filter(Boolean);
  } catch { return []; }
}

async function fetchReddit(sub, limit = 6) {
  try {
    const res = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=${limit}`, { headers: { "User-Agent": "NEXUS/1.0" }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data?.children || []).map(p => `[${sub.toUpperCase()}] ${p.data.title}`);
  } catch { return []; }
}

// ── EARNINGS CALENDAR ────────────────────────────────────────
async function fetchEarningsCalendar() {
  try {
    // Key tickers to always check earnings for
    const watchTickers = [
      "AAPL","MSFT","NVDA","GOOGL","AMZN","META","TSLA","AMD","INTC","PLTR",
      "CRM","ORCL","NFLX","UBER","COIN","MSTR","GME","AMC","SPY","QQQ",
      "XOM","CVX","LMT","RTX","NOC","GLD","GDX","FCX","NEM","USO",
      "TLT","HYG","XLE","XLF","XLK","ARKK","SQQQ","TQQQ","VIX","UVXY"
    ];

    // Yahoo Finance earnings calendar - free, no key needed
    const today = new Date();
    const oneWeekOut = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const fmt = (d) => d.toISOString().split("T")[0];

    const url = `https://query1.finance.yahoo.com/v1/finance/earning_dates?symbol=AAPL&startDate=${fmt(today)}&endDate=${fmt(oneWeekOut)}`;

    // Fetch earnings for top movers using Yahoo screener
    const screenerUrl = "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=true&scrIds=upcoming_earnings&count=50&start=0";
    const res = await fetch(screenerUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000)
    });

    if (!res.ok) throw new Error("Yahoo screener failed");
    const data = await res.json();
    const quotes = data?.finance?.result?.[0]?.quotes || [];

    const earningsThisWeek = quotes
      .filter(q => {
        const eps = q.earningsTimestamp;
        if (!eps) return false;
        const earningsDate = new Date(eps * 1000);
        const daysOut = (earningsDate - today) / (1000 * 60 * 60 * 24);
        return daysOut >= -1 && daysOut <= 7;
      })
      .map(q => ({
        ticker: q.symbol,
        name: q.shortName || q.longName || q.symbol,
        earningsDate: new Date(q.earningsTimestamp * 1000).toLocaleDateString("en-CA"),
        daysOut: Math.round((new Date(q.earningsTimestamp * 1000) - today) / (1000 * 60 * 60 * 24)),
        estimatedEPS: q.epsForward || null,
        marketCap: q.marketCap || null,
      }))
      .sort((a, b) => a.daysOut - b.daysOut)
      .slice(0, 20);

    return earningsThisWeek;
  } catch (e) {
    // Fallback: hardcoded known upcoming earnings (update weekly)
    const today = new Date();
    // Hardcoded Q2 2026 earnings dates — update quarterly
    const earningsDates = [
      { ticker: "GOOGL", name: "Alphabet", earningsDate: "2026-04-29" },
      { ticker: "AMD", name: "Advanced Micro Devices", earningsDate: "2026-04-29" },
      { ticker: "META", name: "Meta Platforms", earningsDate: "2026-04-30" },
      { ticker: "MSFT", name: "Microsoft", earningsDate: "2026-04-30" },
      { ticker: "AMZN", name: "Amazon", earningsDate: "2026-05-01" },
      { ticker: "AAPL", name: "Apple", earningsDate: "2026-05-01" },
      { ticker: "PLTR", name: "Palantir", earningsDate: "2026-05-05" },
      { ticker: "UBER", name: "Uber", earningsDate: "2026-05-07" },
      { ticker: "COIN", name: "Coinbase", earningsDate: "2026-05-08" },
      { ticker: "NVDA", name: "NVIDIA", earningsDate: "2026-05-28" },
      { ticker: "CRM", name: "Salesforce", earningsDate: "2026-05-28" },
      { ticker: "COST", name: "Costco", earningsDate: "2026-05-29" },
      { ticker: "AVGO", name: "Broadcom", earningsDate: "2026-06-05" },
      { ticker: "GME", name: "GameStop", earningsDate: "2026-06-10" },
    ];
    const hardcoded = earningsDates.map(e => ({
      ...e,
      daysOut: Math.round((new Date(e.earningsDate) - today) / 86400000)
    })).filter(e => e.daysOut >= -1 && e.daysOut <= 30);
    return hardcoded;
  }
}

// ── CACHE ─────────────────────────────────────────────────────
const caches = {};
const CACHE_TTL = 4 * 60 * 60 * 1000;
function getCache(key) { const c = caches[key]; if (c && (Date.now() - c.time) < CACHE_TTL) return c.data; return null; }
function setCache(key, data) { caches[key] = { data, time: Date.now() }; }

// ── QUESTRADE STATE ───────────────────────────────────────────
let qtToken = null, qtApiUrl = null, qtTokenTime = null;
const TOKEN_TTL = 25 * 60 * 1000;

async function qtAuth(refreshToken) {
  const r = await fetch(`https://login.questrade.com/oauth2/token?grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`, { method: "POST" });
  if (!r.ok) throw new Error("Questrade auth failed: " + r.status);
  const data = await r.json();
  qtToken = data.access_token; qtApiUrl = data.api_server; qtTokenTime = Date.now();
  if (data.refresh_token) edgeSet("questrade_refresh_token", data.refresh_token).catch(() => {});
  return data;
}

async function ensureQtAuth() {
  if (qtToken && qtApiUrl && qtTokenTime && (Date.now() - qtTokenTime) < TOKEN_TTL) return;
  const edgeToken = await edgeGet("questrade_refresh_token");
  const envToken = process.env.QUESTRADE_TOKEN;
  if (edgeToken) { try { await qtAuth(edgeToken); return; } catch {} }
  if (envToken) { await qtAuth(envToken); return; }
  throw new Error("No valid Questrade token");
}

async function qtCall(path) {
  const r = await fetch(qtApiUrl + "v1/" + path, { headers: { Authorization: "Bearer " + qtToken } });
  if (!r.ok) { if (r.status === 401) qtToken = null; throw new Error("QT " + r.status); }
  return r.json();
}

async function qtGetPrice(symbol) {
  try {
    await ensureQtAuth();
    const search = await qtCall("symbols/search?prefix=" + encodeURIComponent(symbol) + "&offset=0");
    const eq = search.symbols?.find(s => s.symbol === symbol.toUpperCase()) || search.symbols?.[0];
    if (!eq) return null;
    const quote = await qtCall("markets/quotes/" + eq.symbolId);
    const q = quote.quotes?.[0];
    return { symbol: q.symbol, lastPrice: q.lastTradePrice || 0, symbolId: eq.symbolId };
  } catch { return null; }
}

async function qtGetChain(symbol, direction, symbolId) {
  try {
    await ensureQtAuth();
    let sid = symbolId;
    let currentPrice = 0;
    if (!sid) {
      const search = await qtCall("symbols/search?prefix=" + encodeURIComponent(symbol) + "&offset=0");
      const eq = search.symbols?.find(s => s.symbol === symbol.toUpperCase()) || search.symbols?.[0];
      if (!eq) return null;
      sid = eq.symbolId;
    }
    const quoteData = await qtCall("markets/quotes/" + sid);
    currentPrice = quoteData.quotes?.[0]?.lastTradePrice || 0;
    const chain = await qtCall("symbols/" + sid + "/options");
    const exp = chain.optionChain?.[0];
    if (!exp) return null;
    const optionType = direction === "PUT" ? "Put" : "Call";
    const buffer = currentPrice * 0.15;
    const body = JSON.stringify({ filters: [{ optionType, underlyingId: sid, expiryDate: exp.expiryDate, minstrikePrice: Math.floor(currentPrice - buffer), maxstrikePrice: Math.ceil(currentPrice + buffer) }] });
    const quotesRes = await fetch(qtApiUrl + "v1/markets/quotes/options", { method: "POST", headers: { Authorization: "Bearer " + qtToken, "Content-Type": "application/json" }, body });
    const quotesData = await quotesRes.json();
    const atm = (quotesData.optionQuotes || [])
      .filter(o => o.bidPrice > 0 || o.lastTradePrice > 0)
      .sort((a, b) => Math.abs(a.strikePrice - currentPrice) - Math.abs(b.strikePrice - currentPrice))[0];
    if (!atm) return null;
    return { strike: atm.strikePrice, bid: atm.bidPrice || 0, ask: atm.askPrice || 0, expiry: exp.expiryDate, iv: atm.volatility || 0, delta: atm.delta || 0, currentPrice };
  } catch { return null; }
}

// ════════════════════════════════════════════════════════════════
// ── STAGE 1: DATA GATHER ─────────────────────────────────────
// ════════════════════════════════════════════════════════════════
app.get("/api/data-gather", validateKey, async (req, res) => {
  try {
    const force = req.query.force === "true";
    const cached = getCache("data-layer");
    if (cached && !force) return res.json({ success: true, cached: true, timestamp: cached.timestamp, summary: cached.summary });

    // Pull watchlist
    const wlRaw = await edgeGet("nexus_watchlist").catch(() => null);
    const watchlist = wlRaw ? (typeof wlRaw === "string" ? JSON.parse(wlRaw) : wlRaw) : { individuals: [], stocks: [] };
    const watchPeople = (watchlist.individuals || []).map(i => i.name).filter(Boolean);
    const watchTickers = (watchlist.stocks || []).map(s => s.ticker).filter(Boolean);

    // Fetch all data in parallel (including earnings calendar)
    const [geo, econ, market, ai, mining, wsb, options, pennies, earningsData] = await Promise.all([
      fetchGDELT("geopolitical conflict war sanctions oil Trump Netanyahu Putin Xi"),
      fetchGDELT("economic tariff inflation fed rate market earnings"),
      fetchGDELT("stock market options unusual activity insider buying"),
      fetchGDELT("AI nvidia semiconductor data center energy supply chain"),
      fetchGDELT("gold silver copper uranium mining commodities"),
      fetchReddit("wallstreetbets", 10),
      fetchReddit("options", 8),
      fetchReddit("pennystocks", 6),
      fetchEarningsCalendar(),
    ]);

    // Fetch watchlist people news
    const watchPeopleNews = watchPeople.length > 0
      ? await fetchGDELT(watchPeople.slice(0, 4).join(" OR ") + " trade investment stock")
      : [];

    // Fetch watchlist ticker prices from Questrade
    const watchPrices = {};
    if (watchTickers.length > 0) {
      const priceResults = await Promise.allSettled(watchTickers.slice(0, 5).map(t => qtGetPrice(t)));
      priceResults.forEach((r, i) => { if (r.status === "fulfilled" && r.value) watchPrices[watchTickers[i]] = r.value; });
    }

    // Whale intel (hardcoded latest 13F + known positions)
    const whaleIntel = [
      "Burry Q4 2025: PLTR PUTS ($8.9M), NVDA PUTS ($2.3M) — bearish AI hardware",
      "Buffett Q4 2025: NUE new position, LEN new position, DHI new position — bullish real assets/homebuilders",
      "Saylor: Continuous BTC accumulation, now 444,262 BTC — long crypto",
      "Cathie Wood: TSLA COIN ROKU — long disruptive tech despite drawdown",
      "Ryan Cohen: GME BBBY ATER — activist retail positions",
      "Druckenmiller: Gold large position — macro hedge against dollar weakness",
    ];

    // Live earnings calendar from Yahoo Finance
    const earningsContext = earningsData.length > 0
      ? earningsData.map(e => `${e.ticker} (${e.name}) earnings in ${e.daysOut} days (${e.earningsDate}) — HIGH VOLATILITY EXPECTED`)
      : [
        "NVDA earnings: Next cycle May 2026 — post-earnings IV crush risk",
        "AAPL earnings: May 2026 — services revenue key",
        "META earnings: Apr 30 2026 — AI capex guidance critical",
        "GOOGL earnings: Apr 29 2026 — cloud growth vs AI spend",
        "AMZN earnings: May 1 2026 — AWS margins + retail",
        "MSFT earnings: Apr 30 2026 — Azure AI revenue",
      ];
    const earningsThisWeek = earningsData.filter(e => e.daysOut >= 0 && e.daysOut <= 5);

    // Macro context
    const macroContext = [
      "Fed funds rate: 4.25-4.50% — holding, next meeting May 7 2026",
      "VIX: Elevated 25-35 range — geopolitical uncertainty premium",
      "DXY: Strong dollar — headwind for commodities, tailwind for imports",
      "10Y yield: 4.3-4.6% range — rate cut hopes fragile",
      "Gold: Near ATH above $3000 — safe haven demand + central bank buying",
      "Oil: Volatile $70-90 — OPEC cuts + Middle East risk premium",
      "BTC: Consolidating $80-95K range — institutional accumulation",
    ];

    // Compile all headlines
    const allHeadlines = [...geo, ...econ, ...market, ...ai, ...mining, ...wsb, ...options, ...pennies, ...watchPeopleNews];

    const dataLayer = {
      timestamp: new Date().toISOString(),
      headlines: { geo, econ, market, ai, mining, wsb, options, pennies, watchPeopleNews },
      allHeadlines: allHeadlines.slice(0, 60),
      whaleIntel,
      earningsContext,
      macroContext,
      watchlist: { people: watchPeople, tickers: watchTickers, prices: watchPrices },
      earnings: earningsData,
      earningsThisWeek: earningsData.filter(e => e.daysOut >= 0 && e.daysOut <= 5),
      summary: {
        totalHeadlines: allHeadlines.length,
        watchPeople: watchPeople.length,
        watchTickers: watchTickers.length,
        hasQtPrices: Object.keys(watchPrices).length,
        earningsThisWeek: earningsData.filter(e => e.daysOut >= 0 && e.daysOut <= 5).length,
      }
    };

    setCache("data-layer", dataLayer);
    res.json({ success: true, cached: false, timestamp: dataLayer.timestamp, summary: dataLayer.summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════════
// ── STAGE 2A: POWER INTEL A (reads data layer) ────────────────
// ════════════════════════════════════════════════════════════════
app.get("/api/power-intel-a", validateKey, async (req, res) => {
  try {
    const cached = getCache("power-intel-a");
    if (cached && req.query.force !== "true") return res.json({ ...cached, cached: true });

    // Read from data layer if available, else fetch own data
    const dl = getCache("data-layer");
    const headlines = dl ? dl.allHeadlines : await Promise.all([
      fetchGDELT("Trump Netanyahu Putin Xi tariffs geopolitical war"),
      fetchGDELT("insider buying whale Burry Buffett 13F position"),
      fetchReddit("wallstreetbets", 6),
    ]).then(r => r.flat());

    const whale = dl ? dl.whaleIntel.join("\n") : "Burry bearish AI (NVDA/PLTR puts). Buffett bullish real assets (NUE/LEN/DHI).";
    const watchCtx = dl ? (dl.watchlist.people.length ? "WATCH INDIVIDUALS: " + dl.watchlist.people.join(", ") + "\n" : "") + (dl.watchlist.tickers.length ? "WATCH STOCKS: " + dl.watchlist.tickers.join(", ") + "\n" : "") : "";
    const today = new Date().toLocaleDateString("en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    const [profileText, scenarioText, psychText] = await Promise.all([
      callClaude(
        "NEXUS Power Intel. Today: " + today + ".\nINTEL: " + headlines.slice(0, 15).join(" | ") + "\n" +
        "WHALES: " + whale + "\n" + watchCtx + "\nFill EXACTLY:\n" +
        "TRUMP_CORE_DRIVER=\nTRUMP_VANITY_TRIGGER=\nTRUMP_NEXT_MOVE=\nTRUMP_MARKET_SIGNAL=BULLISH or BEARISH or MIXED\nTRUMP_SIGNAL_REASON=\n" +
        "NETANYAHU_CORE_DRIVER=\nNETANYAHU_DESPERATION=LOW or MEDIUM or HIGH or CRITICAL\nNETANYAHU_NEXT_MOVE=\nNETANYAHU_MARKET_SIGNAL=BULLISH or BEARISH or MIXED\n" +
        "PUTIN_CORE_DRIVER=\nPUTIN_ECONOMIC_PRESSURE=\nPUTIN_NEXT_MOVE=\nPUTIN_MARKET_SIGNAL=BULLISH or BEARISH or MIXED\n" +
        "XI_CORE_DRIVER=\nXI_TAIWAN_TIMELINE=\nXI_NEXT_MOVE=\nXI_MARKET_SIGNAL=BULLISH or BEARISH or MIXED\n" +
        "KUSHNER_KEY_INVESTMENTS=\nKUSHNER_WATCH_SECTORS=\nTRUMP_FAMILY_WATCH=\n" +
        "NETWORK_CONNECTION1=\nNETWORK_CONNECTION2=\nNETWORK_CONNECTION3=\n" +
        "IRAN_WAR_THESIS=\nRUSSIA_SANCTIONS_THESIS=\nNETANYAHU_SURVIVAL_THESIS=", 1000),
      callClaude(
        "NEXUS Scenario Engine. Today: " + today + ".\nCONTEXT: " + headlines.slice(0, 12).join(" | ") + "\n\nFill EXACTLY:\n" +
        ["A","B","C","D"].map(L =>
          `SCENARIO_${L}_NAME=\nSCENARIO_${L}_PROBABILITY=\nSCENARIO_${L}_TRIGGER=\n` +
          `SCENARIO_${L}_WEEK1=\nSCENARIO_${L}_WEEK2=\nSCENARIO_${L}_WEEK3=\nSCENARIO_${L}_WEEK4=\n` +
          `SCENARIO_${L}_PLAY1_TICKER=\nSCENARIO_${L}_PLAY1_DIRECTION=CALL or PUT\nSCENARIO_${L}_PLAY1_EXPIRY=\nSCENARIO_${L}_PLAY1_REASON=\n` +
          `SCENARIO_${L}_PLAY2_TICKER=\nSCENARIO_${L}_PLAY2_DIRECTION=CALL or PUT\nSCENARIO_${L}_PLAY2_EXPIRY=\nSCENARIO_${L}_PLAY2_REASON=`
        ).join("\n") +
        "\nTOP_PLAY_TICKER=\nTOP_PLAY_DIRECTION=CALL or PUT\nTOP_PLAY_EXPIRY=\nTOP_PLAY_CONFIDENCE=HIGH or MEDIUM\nTOP_PLAY_THESIS=", 1400),
      callClaude(
        "NEXUS Psychology Engine. Today: " + today + ".\nCONTEXT: " + headlines.slice(0, 10).join(" | ") + "\n\nFill EXACTLY:\n" +
        "PSYCH_TRUMP_NEXT_TRIGGER=\nPSYCH_TRUMP_STOCK_PLAY=\nPSYCH_TRUMP_STOCK_DIRECTION=CALL or PUT\nPSYCH_TRUMP_STOCK_EXPIRY=\nPSYCH_TRUMP_CONFIDENCE=HIGH or MEDIUM\n" +
        "PSYCH_NETANYAHU_DESPERATION_LEVEL=LOW or MEDIUM or HIGH or CRITICAL\nPSYCH_NETANYAHU_STOCK_PLAY=\nPSYCH_NETANYAHU_STOCK_DIRECTION=CALL or PUT\n" +
        "PSYCH_PUTIN_ECONOMIC_DESPERATION=LOW or MEDIUM or HIGH or CRITICAL\nPSYCH_PUTIN_STOCK_PLAY=\nPSYCH_PUTIN_STOCK_DIRECTION=CALL or PUT\n" +
        "NETWORK_RISING_PLAYS=\nNETWORK_FALLING_PLAYS=\nNETWORK_TIMING_EDGE=\n" +
        "HIGHEST_CONVICTION_PLAY_TICKER=\nHIGHEST_CONVICTION_PLAY_DIRECTION=CALL or PUT\nHIGHEST_CONVICTION_PLAY_EXPIRY=\nHIGHEST_CONVICTION_PLAY_SIGNALS=\nHIGHEST_CONVICTION_PLAY_PROBABILITY=\nHIGHEST_CONVICTION_PLAY_THESIS=", 900),
    ]);

    const g = (text, key) => { const m = text.match(new RegExp(key + "=([^\n]+)")); return m ? m[1].trim() : ""; };
    const parseScenario = (L) => ({
      name: g(scenarioText, "SCENARIO_"+L+"_NAME"), probability: g(scenarioText, "SCENARIO_"+L+"_PROBABILITY"),
      trigger: g(scenarioText, "SCENARIO_"+L+"_TRIGGER"),
      weeks: [1,2,3,4].map(w => g(scenarioText, "SCENARIO_"+L+"_WEEK"+w)),
      plays: [1,2].map(n => ({
        ticker: g(scenarioText, "SCENARIO_"+L+"_PLAY"+n+"_TICKER"),
        direction: g(scenarioText, "SCENARIO_"+L+"_PLAY"+n+"_DIRECTION").includes("PUT") ? "PUT" : "CALL",
        expiry: g(scenarioText, "SCENARIO_"+L+"_PLAY"+n+"_EXPIRY"),
        reason: g(scenarioText, "SCENARIO_"+L+"_PLAY"+n+"_REASON"),
      })).filter(p => p.ticker),
    });

    const result = {
      success: true, part: "A", timestamp: new Date().toISOString(), cached: false,
      dataLayerUsed: !!dl,
      profiles: {
        trump: { coreDriver: g(profileText,"TRUMP_CORE_DRIVER"), vanityTrigger: g(profileText,"TRUMP_VANITY_TRIGGER"), nextMove: g(profileText,"TRUMP_NEXT_MOVE"), marketSignal: g(profileText,"TRUMP_MARKET_SIGNAL"), signalReason: g(profileText,"TRUMP_SIGNAL_REASON") },
        netanyahu: { coreDriver: g(profileText,"NETANYAHU_CORE_DRIVER"), survivalPlay: g(profileText,"NETANYAHU_DESPERATION"), nextMove: g(profileText,"NETANYAHU_NEXT_MOVE"), marketSignal: g(profileText,"NETANYAHU_MARKET_SIGNAL") },
        putin: { coreDriver: g(profileText,"PUTIN_CORE_DRIVER"), economicPressure: g(profileText,"PUTIN_ECONOMIC_PRESSURE"), nextMove: g(profileText,"PUTIN_NEXT_MOVE"), marketSignal: g(profileText,"PUTIN_MARKET_SIGNAL") },
        xi: { coreDriver: g(profileText,"XI_CORE_DRIVER"), taiwanTimeline: g(profileText,"XI_TAIWAN_TIMELINE"), nextMove: g(profileText,"XI_NEXT_MOVE"), marketSignal: g(profileText,"XI_MARKET_SIGNAL") },
        kushner: { keyInvestments: g(profileText,"KUSHNER_KEY_INVESTMENTS"), watchSectors: g(profileText,"KUSHNER_WATCH_SECTORS") },
        trumpFamily: { watchList: g(profileText,"TRUMP_FAMILY_WATCH") },
      },
      network: {
        connections: [g(profileText,"NETWORK_CONNECTION1"), g(profileText,"NETWORK_CONNECTION2"), g(profileText,"NETWORK_CONNECTION3")].filter(Boolean),
        iranWarThesis: g(profileText,"IRAN_WAR_THESIS"), russiaSanctionsThesis: g(profileText,"RUSSIA_SANCTIONS_THESIS"), netanyahuSurvivalThesis: g(profileText,"NETANYAHU_SURVIVAL_THESIS"),
      },
      scenarios: ["A","B","C","D"].map(parseScenario),
      topPlay: { ticker: g(scenarioText,"TOP_PLAY_TICKER"), direction: g(scenarioText,"TOP_PLAY_DIRECTION").includes("PUT")?"PUT":"CALL", expiry: g(scenarioText,"TOP_PLAY_EXPIRY"), confidence: g(scenarioText,"TOP_PLAY_CONFIDENCE"), thesis: g(scenarioText,"TOP_PLAY_THESIS") },
      psychology: {
        trump: { trigger: g(psychText,"PSYCH_TRUMP_NEXT_TRIGGER"), play: g(psychText,"PSYCH_TRUMP_STOCK_PLAY"), direction: g(psychText,"PSYCH_TRUMP_STOCK_DIRECTION").includes("PUT")?"PUT":"CALL", expiry: g(psychText,"PSYCH_TRUMP_STOCK_EXPIRY"), confidence: g(psychText,"PSYCH_TRUMP_CONFIDENCE") },
        netanyahu: { desperation: g(psychText,"PSYCH_NETANYAHU_DESPERATION_LEVEL"), play: g(psychText,"PSYCH_NETANYAHU_STOCK_PLAY"), direction: g(psychText,"PSYCH_NETANYAHU_STOCK_DIRECTION").includes("PUT")?"PUT":"CALL" },
        putin: { desperation: g(psychText,"PSYCH_PUTIN_ECONOMIC_DESPERATION"), play: g(psychText,"PSYCH_PUTIN_STOCK_PLAY"), direction: g(psychText,"PSYCH_PUTIN_STOCK_DIRECTION").includes("PUT")?"PUT":"CALL" },
        networkRising: g(psychText,"NETWORK_RISING_PLAYS"), networkFalling: g(psychText,"NETWORK_FALLING_PLAYS"), timingEdge: g(psychText,"NETWORK_TIMING_EDGE"),
      },
      community: { topDD:{ticker:"",direction:"",thesis:"",upvotes:""}, consensus:{ticker:"",direction:""}, contrarian:{signal:"",ticker:""} },
      probabilityScores: [], riseFallPairs: [],
      highestConviction: {
        ticker: g(psychText,"HIGHEST_CONVICTION_PLAY_TICKER"), direction: g(psychText,"HIGHEST_CONVICTION_PLAY_DIRECTION").includes("PUT")?"PUT":"CALL",
        expiry: g(psychText,"HIGHEST_CONVICTION_PLAY_EXPIRY"), signals: g(psychText,"HIGHEST_CONVICTION_PLAY_SIGNALS"),
        probability: g(psychText,"HIGHEST_CONVICTION_PLAY_PROBABILITY"), thesis: g(psychText,"HIGHEST_CONVICTION_PLAY_THESIS"),
      },
    };
    setCache("power-intel-a", result);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════
// ── STAGE 2B: POWER INTEL B (reads data layer) ────────────────
// ════════════════════════════════════════════════════════════════
app.get("/api/power-intel-b", validateKey, async (req, res) => {
  try {
    const cached = getCache("power-intel-b");
    if (cached && req.query.force !== "true") return res.json({ ...cached, cached: true });

    const dl = getCache("data-layer");
    const aiHeadlines = dl ? [...dl.headlines.ai, ...dl.headlines.market] : await fetchGDELT("AI nvidia data center semiconductor energy power");
    const miningHeadlines = dl ? dl.headlines.mining : await fetchGDELT("gold silver copper uranium mining");
    const pharmaHeadlines = dl ? dl.headlines.econ : await fetchGDELT("FDA biotech pharma drug approval clinical trial");
    const macro = dl ? dl.macroContext : [];
    const earnings = dl ? dl.earningsContext : [];
    const today = new Date().toLocaleDateString("en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    const contextBlock = [...macro, ...earnings].join("\n");

    const [marketText, catalystText] = await Promise.all([
      callClaude(
        "NEXUS Market Intelligence. Today: " + today + ".\nINTEL: " + [...aiHeadlines, ...miningHeadlines].slice(0, 20).join(" | ") + "\n" +
        (contextBlock ? "MACRO + EARNINGS: " + contextBlock + "\n" : "") + "\nFill EXACTLY:\n" +
        "AI_HARDWARE_WINNER1=\nAI_HARDWARE_WINNER1_REASON=\nAI_HARDWARE_WINNER2=\nAI_HARDWARE_WINNER2_REASON=\nAI_HARDWARE_LOSER1=\nAI_HARDWARE_LOSER1_REASON=\n" +
        "AI_ENERGY_WINNER1=\nAI_ENERGY_WINNER1_REASON=\nAI_ENERGY_WINNER2=\nAI_ENERGY_WINNER2_REASON=\n" +
        "AI_TOP_CALL_TICKER=\nAI_TOP_CALL_EXPIRY=\nAI_TOP_PUT_TICKER=\nAI_TOP_PUT_EXPIRY=\n" +
        "MINING_GOLD_OUTLOOK=BULLISH or BEARISH\nMINING_GOLD_DRIVER=\nMINING_SILVER_OUTLOOK=BULLISH or BEARISH\nMINING_SILVER_DRIVER=\n" +
        "MINING_COPPER_OUTLOOK=BULLISH or BEARISH\nMINING_COPPER_DRIVER=\nMINING_URANIUM_OUTLOOK=BULLISH or BEARISH\nMINING_URANIUM_DRIVER=\nMINING_LITHIUM_OUTLOOK=BULLISH or BEARISH\nMINING_LITHIUM_DRIVER=\n" +
        "MINING_HOT_TICKER1=\nMINING_HOT_TICKER1_REASON=\nMINING_HOT_TICKER1_DIRECTION=CALL or PUT\nMINING_HOT_TICKER1_EXPIRY=\n" +
        "MINING_HOT_TICKER2=\nMINING_HOT_TICKER2_REASON=\nMINING_HOT_TICKER2_DIRECTION=CALL or PUT\nMINING_HOT_TICKER2_EXPIRY=\n" +
        "MINING_HOT_TICKER3=\nMINING_HOT_TICKER3_REASON=\nMINING_HOT_TICKER3_DIRECTION=CALL or PUT\nMINING_HOT_TICKER3_EXPIRY=\n" +
        "MACRO_FED_SIGNAL=HAWKISH or DOVISH or NEUTRAL\nMACRO_FED_REASON=\nMACRO_NEXT_EVENT=\nMACRO_NEXT_EVENT_DATE=\nMACRO_MARKET_IMPACT=\n" +
        "MACRO_RATE_TRADE=CALL or PUT\nMACRO_RATE_TICKER=\nMACRO_RATE_EXPIRY=\n" +
        "CRYPTO_BTC_SIGNAL=BULLISH or BEARISH or NEUTRAL\nCRYPTO_BTC_REASON=\nCRYPTO_EQUITY_IMPACT=\nCRYPTO_PLAY_TICKER=\nCRYPTO_PLAY_DIRECTION=CALL or PUT\nCRYPTO_PLAY_EXPIRY=", 1400),
      callClaude(
        "NEXUS Catalyst Intelligence. Today: " + today + ".\nINTEL: " + pharmaHeadlines.slice(0, 12).join(" | ") + "\n" +
        (earnings.length ? "EARNINGS CALENDAR: " + earnings.join(" | ") + "\n" : "") + "\nFill EXACTLY:\n" +
        "PHARMA_PDUFA1_TICKER=\nPHARMA_PDUFA1_DRUG=\nPHARMA_PDUFA1_DATE=\nPHARMA_PDUFA1_PLAY=CALL or PUT\nPHARMA_PDUFA1_REASON=\n" +
        "PHARMA_PDUFA2_TICKER=\nPHARMA_PDUFA2_DRUG=\nPHARMA_PDUFA2_DATE=\nPHARMA_PDUFA2_PLAY=CALL or PUT\nPHARMA_PDUFA2_REASON=\n" +
        "PENNY_TICKER1=\nPENNY_TICKER1_CATALYST=\nPENNY_TICKER1_DIRECTION=CALL or PUT or STOCK\nPENNY_TICKER1_REASON=\n" +
        "PENNY_TICKER2=\nPENNY_TICKER2_CATALYST=\nPENNY_TICKER2_DIRECTION=CALL or PUT or STOCK\nPENNY_TICKER2_REASON=\n" +
        "PENNY_TICKER3=\nPENNY_TICKER3_CATALYST=\nPENNY_TICKER3_DIRECTION=CALL or PUT or STOCK\nPENNY_TICKER3_REASON=\n" +
        "PENNY_SQUEEZE_CANDIDATE=\nPENNY_AVOID=", 900),
    ]);

    const g = (text, key) => { const m = text.match(new RegExp(key + "=([^\n]+)")); return m ? m[1].trim() : ""; };
    const result = {
      success: true, part: "B", timestamp: new Date().toISOString(), cached: false, dataLayerUsed: !!dl,
      aiEcosystem: {
        hardwareWinners: [1,2].map(n => ({ ticker: g(marketText,"AI_HARDWARE_WINNER"+n), reason: g(marketText,"AI_HARDWARE_WINNER"+n+"_REASON") })).filter(h=>h.ticker),
        hardwareLosers: [{ ticker: g(marketText,"AI_HARDWARE_LOSER1"), reason: g(marketText,"AI_HARDWARE_LOSER1_REASON") }].filter(h=>h.ticker),
        energyPlays: [1,2].map(n => ({ ticker: g(marketText,"AI_ENERGY_WINNER"+n), reason: g(marketText,"AI_ENERGY_WINNER"+n+"_REASON") })).filter(e=>e.ticker),
        mineralPlays: [], datacenterPlay: {}, ma: {}, inversePairs: [], historicalPattern: "",
        topCall: { ticker: g(marketText,"AI_TOP_CALL_TICKER"), expiry: g(marketText,"AI_TOP_CALL_EXPIRY") },
        topPut: { ticker: g(marketText,"AI_TOP_PUT_TICKER"), expiry: g(marketText,"AI_TOP_PUT_EXPIRY") },
      },
      mining: {
        outlooks: ["Gold","Silver","Copper","Uranium","Lithium"].map(m => ({ metal: m, outlook: g(marketText,"MINING_"+m.toUpperCase()+"_OUTLOOK"), driver: g(marketText,"MINING_"+m.toUpperCase()+"_DRIVER") })),
        hotPicks: [1,2,3].map(n => ({ ticker: g(marketText,"MINING_HOT_TICKER"+n), reason: g(marketText,"MINING_HOT_TICKER"+n+"_REASON"), direction: g(marketText,"MINING_HOT_TICKER"+n+"_DIRECTION").includes("PUT")?"PUT":"CALL", expiry: g(marketText,"MINING_HOT_TICKER"+n+"_EXPIRY") })).filter(p=>p.ticker),
        maTarget: "", maReason: "", redditBuzz: "",
      },
      macro: { fedSignal: g(marketText,"MACRO_FED_SIGNAL"), fedReason: g(marketText,"MACRO_FED_REASON"), nextEvent: g(marketText,"MACRO_NEXT_EVENT"), nextEventDate: g(marketText,"MACRO_NEXT_EVENT_DATE"), marketImpact: g(marketText,"MACRO_MARKET_IMPACT"), rateTrade: { direction: g(marketText,"MACRO_RATE_TRADE").includes("PUT")?"PUT":"CALL", ticker: g(marketText,"MACRO_RATE_TICKER"), expiry: g(marketText,"MACRO_RATE_EXPIRY") } },
      cryptoSignal: { btcSignal: g(marketText,"CRYPTO_BTC_SIGNAL"), btcReason: g(marketText,"CRYPTO_BTC_REASON"), equityImpact: g(marketText,"CRYPTO_EQUITY_IMPACT"), play: { ticker: g(marketText,"CRYPTO_PLAY_TICKER"), direction: g(marketText,"CRYPTO_PLAY_DIRECTION").includes("PUT")?"PUT":"CALL", expiry: g(marketText,"CRYPTO_PLAY_EXPIRY") } },
      pharma: { pdufa: [1,2].map(n => ({ ticker: g(catalystText,"PHARMA_PDUFA"+n+"_TICKER"), drug: g(catalystText,"PHARMA_PDUFA"+n+"_DRUG"), date: g(catalystText,"PHARMA_PDUFA"+n+"_DATE"), play: g(catalystText,"PHARMA_PDUFA"+n+"_PLAY").includes("PUT")?"PUT":"CALL", reason: g(catalystText,"PHARMA_PDUFA"+n+"_REASON") })).filter(p=>p.ticker), maTargets: [], redditBuzz: "" },
      pennyStocks: { picks: [1,2,3].map(n => ({ ticker: g(catalystText,"PENNY_TICKER"+n), catalyst: g(catalystText,"PENNY_TICKER"+n+"_CATALYST"), direction: g(catalystText,"PENNY_TICKER"+n+"_DIRECTION"), reason: g(catalystText,"PENNY_TICKER"+n+"_REASON") })).filter(p=>p.ticker), squeezeCandidate: g(catalystText,"PENNY_SQUEEZE_CANDIDATE"), squeezeReason: "", avoid: g(catalystText,"PENNY_AVOID"), avoidReason: "" },
      microstructure: { pcRatio:"",pcSignal:"",squeezeTicker:"",squeezeReason:"",insiderSignal:"",insiderTicker:"",insiderDirection:"",unusualOptions:"",optionsTicker:"",optionsDirection:"CALL" },
      seasonal: { pattern:"",trade:"",ticker:"",direction:"CALL",expiry:"",confidence:"" },
    };
    setCache("power-intel-b", result);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════
// ── STAGE 3A: INTEL PICKS (27→9, reads data layer + power intel)
// ════════════════════════════════════════════════════════════════
app.get("/api/intelligence", validateKey, async (req, res) => {
  try {
    const cached = getCache("intelligence");
    if (cached && req.query.force !== "true") return res.json({ ...cached, cached: true });

    const dl = getCache("data-layer");
    const powerA = getCache("power-intel-a");
    const powerB = getCache("power-intel-b");

    // Build headlines from data layer or fetch fresh
    const headlines = dl ? [...dl.headlines.wsb, ...dl.headlines.options, ...dl.headlines.market, ...dl.headlines.geo].slice(0, 25)
      : await Promise.all([fetchGDELT("stock market earnings FDA biotech options unusual"), fetchReddit("wallstreetbets", 8), fetchReddit("options", 6)]).then(r => r.flat());

    // Build power intel context
    let powerContext = "";
    if (powerA) {
      const top = powerA.topPlay;
      const conv = powerA.highestConviction;
      const scens = (powerA.scenarios || []).filter(s => s.name && s.probability).slice(0, 3);
      if (top?.ticker) powerContext += "TOP MACRO PLAY: " + top.ticker + " " + top.direction + " exp " + top.expiry + " — " + top.thesis + "\n";
      if (conv?.ticker) powerContext += "HIGHEST CONVICTION: " + conv.ticker + " " + conv.direction + " " + conv.probability + " — " + conv.thesis + "\n";
      if (scens.length) powerContext += "ACTIVE SCENARIOS: " + scens.map(s => s.name + " (" + s.probability + ")").join(" | ") + "\n";
      const psych = powerA.psychology;
      if (psych?.trump?.play) powerContext += "PSYCH: Trump→" + psych.trump.play + " " + psych.trump.direction + "\n";
      if (psych?.netanyahu?.play) powerContext += "PSYCH: Netanyahu desperation=" + psych.netanyahu.desperation + "→" + psych.netanyahu.play + " " + psych.netanyahu.direction + "\n";
      const nets = (powerA.network?.connections || []).filter(Boolean).slice(0, 2);
      if (nets.length) powerContext += "NETWORK: " + nets.join(" | ") + "\n";
    }
    if (powerB) {
      const ai = powerB.aiEcosystem;
      const macro = powerB.macro;
      if (ai?.topCall?.ticker) powerContext += "AI CALL: " + ai.topCall.ticker + " " + ai.topCall.expiry + "\n";
      if (ai?.topPut?.ticker) powerContext += "AI PUT: " + ai.topPut.ticker + " " + ai.topPut.expiry + "\n";
      if (macro?.fedSignal) powerContext += "FED: " + macro.fedSignal + " — " + macro.fedReason + "\n";
      const mining = powerB.mining?.hotPicks || [];
      if (mining.length) powerContext += "MINING: " + mining.map(p => p.ticker + " " + p.direction).join(", ") + "\n";
    }

    const wl = dl?.watchlist;
    const watchCtx = wl ? (wl.tickers.length ? "WATCH STOCKS (priority): " + wl.tickers.join(", ") + "\n" : "") + (wl.people.length ? "WATCH INDIVIDUALS: " + wl.people.join(", ") + "\n" : "") : "";
    const whaleCtx = dl ? dl.whaleIntel.slice(0, 3).join("\n") : "Burry bearish NVDA/PLTR, Buffett bullish NUE/LEN/DHI, Saylor long BTC.";
    const earningsCtx = dl ? dl.earningsContext.slice(0, 4).join("\n") : "";

    const today = new Date().toLocaleDateString("en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const fridays = [];
    const now = new Date();
    const daysToFri = (5 - now.getDay() + 7) % 7 || 7;
    for (let i = 0; i < 4; i++) {
      const f = new Date(now);
      f.setDate(now.getDate() + daysToFri + i * 7);
      fridays.push(f.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }));
    }

    // Stage 1 of 2: Generate 27 candidates
    const candidateText = await callClaude(
      "NEXUS Pipeline Stage 1. Today: " + today + ".\n\n" +
      (powerContext ? "MACRO INTELLIGENCE:\n" + powerContext + "\n" : "") +
      "LIVE INTEL:\n" + headlines.slice(0,15).join("\n") + "\n\n" +
      "WHALES: " + whaleCtx.slice(0,200) + "\n\n" +
      watchCtx +
      "List 27 stock/ETF tickers likely to move 10%+ up or down this month. Format each line EXACTLY as: TICKER CALL or PUT then one sentence reason. Example: NVDA PUT Burry positioned bearish on AI hardware. Start immediately, no preamble.",
      1400
    );

    // Parse 27 candidates — flexible parsing
    const candidateLines = candidateText.split("\n").filter(l => l.trim());
    const candidates = [];
    for (const line of candidateLines) {
      const match = line.match(/([A-Z]{1,6})\s+(CALL|PUT)\s+(.+)/);
      if (match) candidates.push({ ticker: match[1], direction: match[2], reason: match[3].trim() });
      if (candidates.length >= 27) break;
    }

    // Fallback if parsing fails — use known high-conviction names
    if (candidates.length < 5) {
      const fallbacks = [
        {ticker:"NVDA",direction:"PUT",reason:"Burry positioned bearish, China tariff risk, AI hardware slowdown"},
        {ticker:"GLD",direction:"CALL",reason:"Gold at highs, safe haven demand, Fed holding rates"},
        {ticker:"XOM",direction:"CALL",reason:"Oil elevated, Middle East risk premium, Buffett real asset thesis"},
        {ticker:"LMT",direction:"CALL",reason:"Defense spending surge, geopolitical escalation, direct beneficiary"},
        {ticker:"PLTR",direction:"PUT",reason:"Burry bearish, high valuation, government contract uncertainty"},
        {ticker:"QQQ",direction:"PUT",reason:"Tech multiple compression, rate hike risk, stagflation scenario"},
        {ticker:"USO",direction:"CALL",reason:"Oil supply shock, Hormuz risk, OPEC cuts sustained"},
        {ticker:"TLT",direction:"PUT",reason:"Fed holding, rate hike probability rising, bond bear market"},
        {ticker:"FCX",direction:"CALL",reason:"Copper demand AI data centers plus EV, supply constrained"},
        {ticker:"CEG",direction:"CALL",reason:"Nuclear power AI data center demand, 24/7 clean energy PPAs"},
      ];
      candidates.push(...fallbacks.filter(f => !candidates.find(c => c.ticker === f.ticker)));
    }

    // Stage 2 of 2: Score and narrow to 9, pick top 5 for display
    const pickFields = (n) => [
      `PICK${n}_TICKER=`, `PICK${n}_NAME=`, `PICK${n}_EXCHANGE=`,
      `PICK${n}_DIRECTION=CALL or PUT`, `PICK${n}_EXPIRY=`,
      `PICK${n}_MOVE=`, `PICK${n}_CATALYST=`, `PICK${n}_SOURCE=`,
      `PICK${n}_CONFIDENCE=HIGH or MEDIUM`, `PICK${n}_URGENCY=THIS WEEK or NEXT WEEK or 2-4 WEEKS`,
      `PICK${n}_SCORE=1-100`
    ].join("\n");

    const scoringText = await callClaude(
      "NEXUS Pipeline Stage 2. Today: " + today + ".\n\n" +
      "CANDIDATES:\n" + candidates.slice(0,20).map(c => c.ticker + " " + c.direction + " — " + c.reason).join("\n") + "\n\n" +
      (powerContext ? "MACRO CONTEXT:\n" + powerContext.slice(0,500) + "\n\n" : "") +
      "EARNINGS SOON (score boost): " + (dl?.earningsThisWeek?.length ? dl.earningsThisWeek.map(e => e.ticker + "+" + e.daysOut + "d").join(" ") : "none") + "\n" +
      "Score each on catalyst, whale, macro, earnings timing. Output TOP 5. Fill EXACTLY:\n\n" +
      [1,2,3,4,5].map(pickFields).join("\n\n"),
      1400
    );

    const picks = [];
    for (let i = 1; i <= 5; i++) {
      const g = (key) => { const m = scoringText.match(new RegExp(`PICK${i}_${key}=(.+)`)); return m ? m[1].trim() : ""; };
      const ticker = g("TICKER");
      if (!ticker) continue;
      picks.push({
        rank: i, ticker, name: g("NAME"), exchange: g("EXCHANGE"),
        direction: g("DIRECTION").includes("PUT") ? "PUT" : "CALL",
        expiry: g("EXPIRY"), estimatedMove: g("MOVE"),
        catalyst: g("CATALYST"), source: g("SOURCE"),
        confidence: g("CONFIDENCE") || "MEDIUM",
        urgency: g("URGENCY") || "NEXT WEEK",
        score: parseInt(g("SCORE")) || 0,
      });
    }

    const result = { success: true, picks, candidates: candidates.length, timestamp: new Date().toISOString(), dataLayerUsed: !!dl, powerIntelUsed: !!(powerA || powerB) };
    setCache("intelligence", result);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Commodity/invalid ticker → valid ETF mapping
const TICKER_MAP = {
  "OIL": "USO", "CRUDE": "USO", "WTI": "USO", "BRENT": "USO",
  "GOLD": "GLD", "SILVER": "SLV", "COPPER": "COPX",
  "NATGAS": "UNG", "GAS": "UNG", "NATURALGAS": "UNG",
  "WHEAT": "WEAT", "CORN": "CORN", "SOYBEAN": "SOYB",
  "BITCOIN": "IBIT", "BTC": "IBIT", "CRYPTO": "IBIT",
  "BONDS": "TLT", "TREASURY": "TLT",
  "DOLLAR": "UUP", "DXY": "UUP",
  "VIX": "UVXY", "VOLATILITY": "UVXY",
  "DEFENSE": "ITA", "AEROSPACE": "ITA",
  "ENERGY": "XLE", "OIL_SECTOR": "XLE",
  "TECH": "QQQ", "NASDAQ": "QQQ",
  "SP500": "SPY", "MARKET": "SPY",
  "URANIUM": "URA", "NUCLEAR": "NLR",
  "LITHIUM": "LIT", "COBALT": "COBF",
  "MINING": "GDX", "GOLDMINERS": "GDX",
};

function normalizeTicker(ticker) {
  if (!ticker) return ticker;
  const upper = ticker.toUpperCase().replace(/[^A-Z]/g, "");
  return TICKER_MAP[upper] || upper;
}

// ════════════════════════════════════════════════════════════════
// ── STAGE 3B: TRADES (top 3 with live QT validation) ─────────
// ════════════════════════════════════════════════════════════════
app.get("/api/trades", validateKey, async (req, res) => {
  try {
    const cached = getCache("trades");
    if (cached && req.query.force !== "true") return res.json({ ...cached, cached: true });

    const intel = getCache("intelligence");
    const powerA = getCache("power-intel-a");
    if (!intel?.picks?.length) return res.status(400).json({ error: "Run Intel Picks first to generate trade candidates" });

    const top3 = intel.picks.slice(0, 3).map(p => ({ ...p, ticker: normalizeTicker(p.ticker) }));
    const today = new Date().toLocaleDateString("en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    // Get live QT chain for each of the 3 trades in parallel
    const chainResults = await Promise.allSettled(
      top3.map(pick => qtGetChain(pick.ticker, pick.direction))
    );

    // Build detailed analysis for each trade
    const tradeAnalysisText = await callClaude(
      "NEXUS Final Trade Analysis. Today: " + today + ".\n\n" +
      "TOP 3 PICKS FROM SCORING ENGINE:\n" +
      top3.map((p, i) => `${i+1}. ${p.ticker} ${p.direction} — Catalyst: ${p.catalyst} — Score: ${p.score}`).join("\n") + "\n\n" +
      (powerA ? "MACRO THESIS:\n" + (powerA.topPlay?.thesis || "") + "\n" + (powerA.highestConviction?.thesis || "") + "\n\n" : "") +
      "For each trade provide EXACTLY — be decisive, give real numbers:\n" +
      [1,2,3].map(n =>
        `TRADE${n}_ENTRY_THESIS=\nTRADE${n}_TARGET_PCT=example +65%\nTRADE${n}_STOP_PCT=example -30%\nTRADE${n}_HEDGE_TICKER=\nTRADE${n}_HEDGE_DIRECTION=CALL or PUT\nTRADE${n}_HEDGE_REASON=\nTRADE${n}_PROBABILITY=express as range like 65-75% based on signal convergence\nTRADE${n}_TIMING=\nTRADE${n}_RISK_FACTORS=`
      ).join("\n"),
      900
    );

    const g = (key) => { const m = tradeAnalysisText.match(new RegExp(key + "=([^\n]+)")); return m ? m[1].trim() : ""; };

    const trades = top3.map((pick, i) => {
      const n = i + 1;
      const chain = chainResults[i].status === "fulfilled" ? chainResults[i].value : null;
      return {
        rank: n,
        ticker: pick.ticker,
        direction: pick.direction,
        name: pick.name,
        catalyst: pick.catalyst,
        score: pick.score,
        urgency: pick.urgency,
        // Live Questrade data
        currentPrice: chain?.currentPrice || null,
        strike: chain?.strike || null,
        bid: chain?.bid || null,
        ask: chain?.ask || null,
        mid: chain ? Math.round((chain.bid + chain.ask) / 2 * 100) / 100 : null,
        expiry: chain?.expiry || pick.expiry,
        iv: chain?.iv || null,
        delta: chain?.delta || null,
        qtValidated: !!chain,
        // Claude analysis
        thesis: g("TRADE" + n + "_ENTRY_THESIS"),
        targetPct: g("TRADE" + n + "_TARGET_PCT"),
        stopPct: g("TRADE" + n + "_STOP_PCT"),
        hedge: { ticker: g("TRADE" + n + "_HEDGE_TICKER"), direction: g("TRADE" + n + "_HEDGE_DIRECTION"), reason: g("TRADE" + n + "_HEDGE_REASON") },
        probability: g("TRADE" + n + "_PROBABILITY"),
        timing: g("TRADE" + n + "_TIMING"),
        riskFactors: g("TRADE" + n + "_RISK_FACTORS"),
      };
    });

    const result = { success: true, trades, timestamp: new Date().toISOString(), disclaimer: "For research only. Always verify on Questrade before trading." };
    setCache("trades", result);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── /api/earnings ────────────────────────────────────────────
app.get("/api/earnings", validateKey, async (req, res) => {
  try {
    const dl = getCache("data-layer");
    if (dl?.earnings) return res.json({ success: true, earnings: dl.earnings, cached: true });
    const earnings = await fetchEarningsCalendar();
    res.json({ success: true, earnings, cached: false });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════════
// ── PIPELINE STATUS ───────────────────────────────────────────
// ════════════════════════════════════════════════════════════════
app.get("/api/pipeline-status", validateKey, async (req, res) => {
  const dl = getCache("data-layer");
  const pA = getCache("power-intel-a");
  const pB = getCache("power-intel-b");
  const intel = getCache("intelligence");
  const trades = getCache("trades");
  res.json({
    success: true,
    stages: {
      dataLayer: { ready: !!dl, timestamp: dl?.timestamp, summary: dl?.summary, earningsThisWeek: dl?.earningsThisWeek?.map(e => e.ticker + " +" + e.daysOut + "d") },
      powerIntelA: { ready: !!pA, timestamp: pA?.timestamp, topPlay: pA?.topPlay?.ticker },
      powerIntelB: { ready: !!pB, timestamp: pB?.timestamp, fedSignal: pB?.macro?.fedSignal },
      intelPicks: { ready: !!intel, timestamp: intel?.timestamp, picks: intel?.picks?.length, candidates: intel?.candidates },
      trades: { ready: !!trades, timestamp: trades?.timestamp, count: trades?.trades?.length },
    }
  });
});

// ════════════════════════════════════════════════════════════════
// ── REMAINING ENDPOINTS (events, sources, watchlist, questrade)
// ════════════════════════════════════════════════════════════════
app.get("/api/events", validateKey, async (req, res) => {
  try {
    const cached = getCache("events");
    if (cached && req.query.force !== "true") return res.json({ ...cached, cached: true });
    const dl = getCache("data-layer");
    const headlines = dl ? [...dl.headlines.geo, ...dl.headlines.econ, ...dl.headlines.ai].slice(0, 20)
      : await Promise.all([fetchGDELT("geopolitical conflict war sanctions oil"), fetchGDELT("economic tariff inflation fed rate market"), fetchGDELT("technology AI semiconductor supply chain")]).then(r => r.flat());
    const text = await callClaude(
      "You are NEXUS events intelligence. Analyze these headlines and return ONLY JSON:\n" +
      headlines.join("\n") + "\n\n" +
      '{"events":[{"id":1,"category":"conflict|economic|diplomatic|tech|weather|health","severity":"critical|high|medium","title":"","location":"","summary":"","commodities":[""],"region":""}]}' +
      "\nReturn 8 events.", 800);
    let events;
    try { const clean = text.replace(/```json|```/g, "").trim(); const parsed = JSON.parse(clean); events = parsed.events || parsed; } catch { events = []; }
    const result = { success: true, events, timestamp: new Date().toISOString() };
    setCache("events", result);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/sources", validateKey, async (req, res) => {
  try {
    const cached = getCache("sources");
    if (cached && req.query.force !== "true") return res.json({ ...cached, cached: true });
    const text = await callClaude(
      "Return ONLY a JSON array of 10 commodity hotspot countries. No markdown.\n" +
      "[{\"country\":\"Russia\",\"risk\":\"critical\",\"exports\":[\"Oil (12%)\"],\"activeEvent\":\"Ukraine war\",\"priceImpact\":\"+25%\",\"alternatives\":[\"Saudi Arabia\"]}]\n" +
      "Cover: Russia, Ukraine, China, Saudi Arabia, Brazil, DRC, Australia, Iran, India, Taiwan.", 900);
    let hotspots;
    try {
      let clean = text.trim().replace(/^```json\s*/,"").replace(/^```\s*/,"").replace(/\s*```$/,"").trim();
      if (clean.startsWith("[")) hotspots = JSON.parse(clean);
      else { const obj = JSON.parse(clean); hotspots = obj.hotspots || obj; }
    } catch { hotspots = []; }
    const result = { success: true, hotspots, timestamp: new Date().toISOString() };
    setCache("sources", result);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/watchlist", validateKey, async (req, res) => {
  try {
    const data = await edgeGet("nexus_watchlist");
    const watchlist = data ? (typeof data === "string" ? JSON.parse(data) : data) : { individuals: [], stocks: [] };
    res.json({ success: true, watchlist });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/watchlist", validateKey, async (req, res) => {
  try {
    const { watchlist } = req.body;
    if (!watchlist) return res.status(400).json({ error: "watchlist required" });
    await edgeSet("nexus_watchlist", JSON.stringify(watchlist));
    res.json({ success: true, watchlist });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/watchlist/scan", validateKey, async (req, res) => {
  try {
    const data = await edgeGet("nexus_watchlist");
    const watchlist = data ? (typeof data === "string" ? JSON.parse(data) : data) : { individuals: [], stocks: [] };
    const all = [...(watchlist.individuals || []), ...(watchlist.stocks || [])];
    if (!all.length) return res.json({ success: true, results: [] });
    const batch = all.slice(0, 8);
    const newsResults = await Promise.allSettled(batch.map(async (item) => {
      const name = item.name || item.ticker || item;
      const articles = await fetchGDELT(name + " stock trade investment news");
      return { id: item.id || name, name: item.name || item.ticker || item, type: item.type || "individual", ticker: item.ticker || null, articles: articles.slice(0, 4), signal: articles.length > 2 ? "ACTIVE" : articles.length > 0 ? "MENTION" : "QUIET", lastUpdated: new Date().toISOString() };
    }));
    res.json({ success: true, results: newsResults.filter(r => r.status === "fulfilled").map(r => r.value), timestamp: new Date().toISOString() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/api/questrade", validateKey, async (req, res) => {
  try {
    const { action, symbol, direction, expiry } = req.query;
    await ensureQtAuth();
    if (action === "auth") return res.json({ success: true, message: "Connected", apiServer: qtApiUrl });
    if (action === "balance") {
      const accounts = await qtCall("accounts");
      const acct = accounts.accounts?.[0];
      const balances = await qtCall("accounts/" + acct.number + "/balances");
      const cad = balances.combinedBalances?.find(b => b.currency === "CAD");
      const usd = balances.combinedBalances?.find(b => b.currency === "USD");
      return res.json({ success: true, balance: { accountNumber: acct.number, CAD: { cash: cad?.cash||0, totalEquity: cad?.totalEquity||0, buyingPower: cad?.buyingPower||0 }, USD: { cash: usd?.cash||0, totalEquity: usd?.totalEquity||0, buyingPower: usd?.buyingPower||0 } } });
    }
    if (action === "quote" && symbol) {
      const data = await qtGetPrice(symbol);
      if (!data) throw new Error("Symbol not found");
      return res.json({ success: true, quote: data });
    }
    if (action === "chain" && symbol) {
      const chain = await qtGetChain(symbol, direction || "CALL");
      if (!chain) throw new Error("No options chain found");
      return res.json({ success: true, ...chain });
    }
    if (action === "token-status") {
      const edgeTok = await edgeGet("questrade_refresh_token");
      return res.json({ success: true, edgeConfigHasToken: !!edgeTok, qtConnected: !!qtToken });
    }
    res.status(400).json({ error: "Unknown action: " + action });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log("NEXUS Pipeline API running on port " + PORT));
