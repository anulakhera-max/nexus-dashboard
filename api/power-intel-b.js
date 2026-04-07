// /api/power-intel — Full Geopolitical + Market Intelligence Engine
// Sections: Profiles, Network, Scenarios, AI Ecosystem, Mining, Pharma, Penny Stocks

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-nexus-key",
  "Content-Type": "application/json",
};

function validateApiKey(req) {
  const key = req.headers["x-nexus-key"] || req.query?.["x-nexus-key"];
  return key === (process.env.NEXUS_API_KEY || "nexus-axl-agent-key");
}

async function callClaude(prompt, maxTokens = 1400) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
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

let cache = null;
let cacheTime = null;
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

// ── Fetch from GDELT ──────────────────────────────────────────
async function fetchGDELT(query, days = 7) {
  try {
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=6&format=json&timespan=${days}d&sort=hybridrel`;
    const res = await fetch(url, { headers: { "User-Agent": "NEXUS/1.0" }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.articles || []).map(a => a.title).filter(Boolean);
  } catch { return []; }
}

// ── Fetch Reddit ──────────────────────────────────────────────
async function fetchReddit(subreddit, limit = 8) {
  try {
    const res = await fetch(`https://www.reddit.com/r/${subreddit}/hot.json?limit=${limit}`, {
      headers: { "User-Agent": "NEXUS/1.0" }, signal: AbortSignal.timeout(4000)
    });
    const data = await res.json();
    return (data?.data?.children || []).map(p =>
      `[r/${subreddit}] ${p.data.title} (↑${p.data.score} 💬${p.data.num_comments})`
    );
  } catch { return []; }
}

// ── Fetch SEC 8-K filings ─────────────────────────────────────
async function fetchSEC8K() {
  try {
    const date = new Date(Date.now() - 7 * 864e5).toISOString().split("T")[0];
    const url = `https://efts.sec.gov/LATEST/search-index?q=%228-K%22&dateRange=custom&startdt=${date}&forms=8-K`;
    const res = await fetch(url, { headers: { "User-Agent": "NEXUS/1.0 nexus@nexus.ai" }, signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    return (data?.hits?.hits || []).slice(0, 8).map(h =>
      `[8-K] ${h._source?.entity_name}: ${h._source?.file_date}`
    );
  } catch { return []; }
}

// ── Fetch 13F latest filings ─────────────────────────────────
async function fetch13FLatest() {
  try {
    const res = await fetch("https://13f.info/newest", {
      headers: { "User-Agent": "NEXUS/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    const html = await res.text();
    // Extract manager + period from table rows
    const matches = [...html.matchAll(/manager\/[^"]+">([^<]+)<\/a[\s\S]*?13f\/[^"]+">([^<]+)<\/a/g)];
    return matches.slice(0, 15).map(m => `[13F NEW] ${m[1]?.trim()} filed ${m[2]?.trim()}`).filter(Boolean);
  } catch { return ["[13F] Latest filings temporarily unavailable"]; }
}

// Baked-in whale intelligence from 13f.info analysis
const WHALE_INTEL = `
WHALE 13F POSITIONS (from 13f.info):

MICHAEL BURRY Q3 2025 ($1.38B):
- PLTR PUTS: Palantir 300x+ sales = bubble. Bearish.
- NVDA PUTS: AI bubble thesis. Bearish on AI hardware.
- PFE CALLS: Pfizer beaten down recovery. Bullish pharma.
- HAL CALLS: Halliburton energy services. Bullish energy.
- TRACK RECORD: Called 2008 housing crash, 2021 meme bubble, 2022 correction.
- WHEN BURRY BUYS PUTS = bubble about to burst. Follow his sectors.

WARREN BUFFETT Q4 2025 ($274B):
- Core forever: AAPL, AXP, BAC, KO (high conviction unchanged)
- NEW Q1 2025: NUE (Nucor Steel), LEN, DHI, LEN-B (homebuilders)
- SIGNAL: Steel + homebuilders = betting rates drop, housing recovers.
- WHEN BUFFETT BUYS NEW = 3-5 year macro trend starting.

CONVERGENCE HISTORY (multiple whales same direction = strongest signal):
- Q2 2023: Burry $1.7B SPY/QQQ puts → market corrected 10%+ (2-3 month lag)
- Q3 2020: Buffett buys CVX → energy rallied 60%+ over 18 months
- Q1 2025: Buffett buys homebuilders → housing sector momentum confirmed

CURRENT WHALE SIGNAL:
Burry BEARISH AI (NVDA/PLTR puts) + Buffett BULLISH housing (LEN/DHI) + Energy
= ROTATE: Out of AI/tech overvaluation → Into housing, energy, pharma recovery

NETWORK MAP (13F positions + political connections):
- Kushner $2B Saudi PIF fund → Middle East deals → energy/REIT sector catalyst
- Trump family crypto since Nov 2024 → crypto-friendly policy → BTC stocks, MSTR, COIN
- Netanyahu conflict → LMT, RTX, NOC, KTOS defense contracts rising
- Burry NVDA puts correct → AMD, SMCI, ARM, PLTR all crash together
- Buffett homebuilders → DHI, LEN, TOL, NVR follow Berkshire money

TIMING EDGE:
- 13F filed 45 days after quarter (Feb 14, May 15, Aug 14, Nov 14)
- Market moves WHEN FILINGS RELEASED not when positions taken
- Play: Buy options confirming Burry's put thesis direction
`;

// ── Fetch free macro/market data ─────────────────────────────
async function fetchMacroData() {
  const results = [];
  try {
    // Fed calendar and statements from FRED RSS
    const fedRes = await fetch("https://feeds.federalreserve.gov/feeds/press_monetary.xml", {
      headers: { "User-Agent": "NEXUS/1.0" }, signal: AbortSignal.timeout(4000)
    });
    const fedText = await fedRes.text();
    const fedTitles = [...fedText.matchAll(/<title>([^<]+)<\/title>/g)].slice(1,6).map(m => `[FED] ${m[1]}`);
    results.push(...fedTitles);
  } catch {}

  try {
    // EIA energy inventory
    const eiaRes = await fetch("https://www.eia.gov/rss/todayinenergy.xml", {
      headers: { "User-Agent": "NEXUS/1.0" }, signal: AbortSignal.timeout(4000)
    });
    const eiaText = await eiaRes.text();
    const eiaTitles = [...eiaText.matchAll(/<title>([^<]+)<\/title>/g)].slice(1,5).map(m => `[EIA] ${m[1]}`);
    results.push(...eiaTitles);
  } catch {}

  try {
    // Upcoming economic events from public calendar
    const calRes = await fetch("https://api.gdeltproject.org/api/v2/doc/doc?query=federal+reserve+interest+rates+CPI+inflation&mode=artlist&maxrecords=5&format=json&timespan=3d", {
      headers: { "User-Agent": "NEXUS/1.0" }, signal: AbortSignal.timeout(4000)
    });
    const calData = await calRes.json();
    const calTitles = (calData.articles||[]).map(a => `[MACRO] ${a.title}`);
    results.push(...calTitles);
  } catch {}

  return results;
}

async function fetchSentimentSignals() {
  const results = [];
  try {
    // Stocktwits public trending via GDELT proxy
    const res = await fetch("https://api.gdeltproject.org/api/v2/doc/doc?query=stock+market+sentiment+rally+crash+options&mode=artlist&maxrecords=8&format=json&timespan=2d", {
      headers: { "User-Agent": "NEXUS/1.0" }, signal: AbortSignal.timeout(4000)
    });
    const data = await res.json();
    (data.articles||[]).forEach(a => results.push(`[SENTIMENT] ${a.title}`));
  } catch {}

  try {
    // Analyst upgrades/downgrades news
    const res2 = await fetch("https://api.gdeltproject.org/api/v2/doc/doc?query=analyst+upgrade+downgrade+price+target+stock&mode=artlist&maxrecords=8&format=json&timespan=2d", {
      headers: { "User-Agent": "NEXUS/1.0" }, signal: AbortSignal.timeout(4000)
    });
    const data2 = await res2.json();
    (data2.articles||[]).forEach(a => results.push(`[ANALYST] ${a.title}`));
  } catch {}

  return results;
}

async function fetchPhysicalSignals() {
  const results = [];
  const queries = [
    ["shipping freight Baltic dry index supply chain", "SHIPPING"],
    ["insider buying selling SEC Form 4 executive", "INSIDER"],
    ["short squeeze short interest high borrow rate", "SHORT"],
    ["bitcoin crypto on-chain whale exchange", "CRYPTO"],
    ["options unusual activity call put volume spike", "OPTIONS-FLOW"],
  ];
  await Promise.allSettled(queries.map(async ([q, label]) => {
    try {
      const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=artlist&maxrecords=4&format=json&timespan=3d`;
      const res = await fetch(url, { headers: { "User-Agent": "NEXUS/1.0" }, signal: AbortSignal.timeout(4000) });
      const data = await res.json();
      (data.articles||[]).forEach(a => results.push(`[${label}] ${a.title}`));
    } catch {}
  }));
  return results;
}

async function fetchHistoricalContext() {
  // Static historical intelligence — always included as context
  return [
    "[SEASONAL] Q2 earnings season: stocks historically move 8-12% on report day",
    "[SEASONAL] Pre-earnings drift: stock moves direction of beat 65% in 2 weeks prior",
    "[SEASONAL] VIX above 30 = buy signal historically (fear peak = market bottom)",
    "[SEASONAL] Quad witching (3rd Friday Mar/Jun/Sep/Dec) = elevated volatility",
    "[SEASONAL] January effect: small caps outperform in Jan historically",
    "[CYCLE] Presidential year 4 historically bullish: S&P up avg 12% election year",
    "[CYCLE] Midterm year historically weakest then strongest recovery Q4-Q1",
    "[YIELD] 2s10s inversion preceding recession by avg 12-18 months historically",
    "[YIELD] Rate cuts cycle: financials lag, then utilities, then growth stocks lead",
    "[SECTOR] Rising oil: energy CALLs, airline PUTs, consumer staples defensive",
    "[SECTOR] Rising rates: bank CALLs, bond PUTs, tech/growth PUTs",
    "[SECTOR] Falling rates: housing CALLs, utility CALLs, growth stock CALLs",
    "[CRYPTO] BTC leads NASDAQ by 48-72 hours at trend inflection points",
    "[CRYPTO] Stablecoin minting spike = dry powder entering = bullish signal",
    "[CRYPTO] BTC to NASDAQ correlation breaking down = risk-off signal",
    "[INSIDER] Executive cluster buy (3+ insiders same week) = 73% accuracy bullish",
    "[INSIDER] Mass insider selling ahead of earnings = bearish flag",
    "[OPTIONS] Put/call ratio above 1.2 = extreme fear = contrarian buy signal",
    "[OPTIONS] Unusual call volume 10x+ average = institutional positioning ahead",
    "[SHORT] Short interest above 20% + catalyst = squeeze potential",
  ];
}

// ── Gather all intelligence ───────────────────────────────────
async function gatherAllIntel() {
  const results = await Promise.allSettled([
    // Power figures
    fetchGDELT("Trump executive order market tariffs"),
    fetchGDELT("Netanyahu Iran war military"),
    fetchGDELT("Putin Russia sanctions economy"),
    fetchGDELT("Kushner investment deal fund"),
    fetchGDELT("Trump family stocks investment"),
    // AI Ecosystem
    fetchGDELT("AI data center nvidia partnership acquisition"),
    fetchGDELT("semiconductor chip energy power grid AI"),
    fetchGDELT("lithium cobalt rare earth mining AI"),
    // Mining
    fetchGDELT("gold silver copper mining announcement"),
    fetchGDELT("uranium lithium junior mining discovery"),
    fetchGDELT("mining merger acquisition takeover"),
    // Pharma
    fetchGDELT("FDA approval PDUFA drug biotech"),
    fetchGDELT("clinical trial phase 3 results biotech"),
    fetchGDELT("pharma merger acquisition buyout"),
    // Reddit
    fetchReddit("wallstreetbets", 10),
    fetchReddit("pennystocks", 10),
    fetchReddit("investing", 8),
    fetchReddit("biotech", 8),
    fetchReddit("MiningStocks", 6),
    fetchReddit("UraniumSqueeze", 6),
    fetchReddit("AIstocks", 6),
    fetchReddit("options", 8),
    fetchReddit("SecurityAnalysis", 6),
    fetchReddit("stocks", 8),
    // SEC filings
    fetchSEC8K(),
    // 13F whale filings
    fetch13FLatest(),
    // NEW: Macro, sentiment, physical, historical
    fetchMacroData(),
    fetchSentimentSignals(),
    fetchPhysicalSignals(),
    fetchHistoricalContext(),
  ]);

  return results.map(r => r.status === "fulfilled" ? r.value : []).flat();
}

// ── Parse template helper ─────────────────────────────────────
function get(text, key) {
  const match = text.match(new RegExp(`${key}=([^\\n]+)`));
  return match ? match[1].trim() : "";
}

function getMulti(text, key, count) {
  const items = [];
  for (let i = 1; i <= count; i++) {
    const val = get(text, `${key}${i}`);
    if (val) items.push(val);
  }
  return items;
}

let cacheB = null;
let cacheTimeB = null;
const CACHE_TTL_B = 4 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { Object.entries(corsHeaders).forEach(([k,v]) => res.setHeader(k,v)); return res.status(200).end(); }
  Object.entries(corsHeaders).forEach(([k,v]) => res.setHeader(k,v));
  if (!validateApiKey(req)) return res.status(401).json({ error: "Unauthorized." });

  const force = req.query.force === "true";
  const now = Date.now();
  if (cacheB && cacheTimeB && (now - cacheTimeB) < CACHE_TTL_B && !force) {
    return res.status(200).json({ ...cacheB, cached: true });
  }

  try {
    // Fast fetch — 3 sources only, 4s timeout each
    const headlines = await Promise.allSettled([
      fetchGDELT("AI mining pharma biotech FDA stocks"),
      fetchReddit("pennystocks", 6),
      fetchReddit("options", 6),
    ]);
    const headlineList = headlines.map(r => r.status === "fulfilled" ? r.value : []).flat();
    const today = new Date().toLocaleDateString("en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    const [marketText, catalystText] = await Promise.all([

      callClaude(`You are NEXUS Market Intelligence. Today is ${today}.
LIVE INTEL:
${headlineList.slice(0,40).join("\n")}

Fill EXACTLY:

AI_HARDWARE_WINNER1=
AI_HARDWARE_WINNER1_REASON=
AI_HARDWARE_WINNER2=
AI_HARDWARE_WINNER2_REASON=
AI_HARDWARE_LOSER1=
AI_HARDWARE_LOSER1_REASON=
AI_ENERGY_WINNER1=
AI_ENERGY_WINNER1_REASON=
AI_ENERGY_WINNER2=
AI_ENERGY_WINNER2_REASON=
AI_MINERALS_PLAY1=
AI_MINERALS_PLAY1_TICKER=
AI_MINERALS_PLAY1_REASON=
AI_MINERALS_PLAY2=
AI_MINERALS_PLAY2_TICKER=
AI_MINERALS_PLAY2_REASON=
AI_DATACENTER_PLAY1=
AI_DATACENTER_PLAY1_TICKER=
AI_DATACENTER_PLAY1_REASON=
AI_MA_TARGET=
AI_MA_ACQUIRER=
AI_MA_REASON=
AI_INVERSE_PAIR1_UP=
AI_INVERSE_PAIR1_DOWN=
AI_INVERSE_PAIR1_REASON=
AI_INVERSE_PAIR2_UP=
AI_INVERSE_PAIR2_DOWN=
AI_INVERSE_PAIR2_REASON=
AI_HISTORICAL_PATTERN=
AI_TOP_CALL_TICKER=
AI_TOP_CALL_EXPIRY=
AI_TOP_PUT_TICKER=
AI_TOP_PUT_EXPIRY=

MINING_GOLD_OUTLOOK=BULLISH or BEARISH
MINING_GOLD_DRIVER=
MINING_SILVER_OUTLOOK=BULLISH or BEARISH
MINING_SILVER_DRIVER=
MINING_COPPER_OUTLOOK=BULLISH or BEARISH
MINING_COPPER_DRIVER=
MINING_URANIUM_OUTLOOK=BULLISH or BEARISH
MINING_URANIUM_DRIVER=
MINING_LITHIUM_OUTLOOK=BULLISH or BEARISH
MINING_LITHIUM_DRIVER=
MINING_HOT_TICKER1=
MINING_HOT_TICKER1_REASON=
MINING_HOT_TICKER1_DIRECTION=CALL or PUT
MINING_HOT_TICKER1_EXPIRY=
MINING_HOT_TICKER2=
MINING_HOT_TICKER2_REASON=
MINING_HOT_TICKER2_DIRECTION=CALL or PUT
MINING_HOT_TICKER2_EXPIRY=
MINING_HOT_TICKER3=
MINING_HOT_TICKER3_REASON=
MINING_HOT_TICKER3_DIRECTION=CALL or PUT
MINING_HOT_TICKER3_EXPIRY=
MINING_MA_TARGET=
MINING_MA_REASON=
MINING_REDDIT_BUZZ=

MACRO_FED_SIGNAL=HAWKISH or DOVISH or NEUTRAL
MACRO_FED_REASON=
MACRO_NEXT_EVENT=
MACRO_NEXT_EVENT_DATE=
MACRO_MARKET_IMPACT=
MACRO_RATE_TRADE=CALL or PUT
MACRO_RATE_TICKER=
MACRO_RATE_EXPIRY=

MICROSTRUCTURE_PC_RATIO=HIGH or LOW or NEUTRAL
MICROSTRUCTURE_PC_SIGNAL=BEARISH or BULLISH or NEUTRAL
MICROSTRUCTURE_SHORT_SQUEEZE=
MICROSTRUCTURE_SQUEEZE_TICKER=
MICROSTRUCTURE_SQUEEZE_REASON=
MICROSTRUCTURE_INSIDER_SIGNAL=
MICROSTRUCTURE_INSIDER_TICKER=
MICROSTRUCTURE_INSIDER_DIRECTION=BULLISH or BEARISH
MICROSTRUCTURE_UNUSUAL_OPTIONS=
MICROSTRUCTURE_OPTIONS_TICKER=
MICROSTRUCTURE_OPTIONS_DIRECTION=CALL or PUT

SEASONAL_CURRENT_PATTERN=
SEASONAL_TRADE=
SEASONAL_TICKER=
SEASONAL_DIRECTION=CALL or PUT
SEASONAL_EXPIRY=
SEASONAL_CONFIDENCE=HIGH or MEDIUM

CRYPTO_BTC_SIGNAL=BULLISH or BEARISH or NEUTRAL
CRYPTO_BTC_REASON=
CRYPTO_EQUITY_IMPACT=
CRYPTO_PLAY_TICKER=
CRYPTO_PLAY_DIRECTION=CALL or PUT
CRYPTO_PLAY_EXPIRY=`, 1400),

      callClaude(`You are NEXUS Catalyst Intelligence. Today is ${today}.
LIVE INTEL:
${headlineList.slice(40,80).join("\n")}

Fill EXACTLY:

PHARMA_PDUFA1_TICKER=
PHARMA_PDUFA1_DRUG=
PHARMA_PDUFA1_DATE=
PHARMA_PDUFA1_PLAY=CALL or PUT
PHARMA_PDUFA1_REASON=
PHARMA_PDUFA2_TICKER=
PHARMA_PDUFA2_DRUG=
PHARMA_PDUFA2_DATE=
PHARMA_PDUFA2_PLAY=CALL or PUT
PHARMA_PDUFA2_REASON=
PHARMA_PDUFA3_TICKER=
PHARMA_PDUFA3_DRUG=
PHARMA_PDUFA3_DATE=
PHARMA_PDUFA3_PLAY=CALL or PUT
PHARMA_PDUFA3_REASON=
PHARMA_MA_TARGET1=
PHARMA_MA_TARGET1_REASON=
PHARMA_MA_TARGET2=
PHARMA_MA_TARGET2_REASON=
PHARMA_REDDIT_BUZZ=

PENNY_TICKER1=
PENNY_TICKER1_PRICE=
PENNY_TICKER1_CATALYST=
PENNY_TICKER1_DIRECTION=CALL or PUT or STOCK
PENNY_TICKER1_REDDIT_SCORE=
PENNY_TICKER1_REASON=
PENNY_TICKER2=
PENNY_TICKER2_PRICE=
PENNY_TICKER2_CATALYST=
PENNY_TICKER2_DIRECTION=CALL or PUT or STOCK
PENNY_TICKER2_REDDIT_SCORE=
PENNY_TICKER2_REASON=
PENNY_TICKER3=
PENNY_TICKER3_PRICE=
PENNY_TICKER3_CATALYST=
PENNY_TICKER3_DIRECTION=CALL or PUT or STOCK
PENNY_TICKER3_REDDIT_SCORE=
PENNY_TICKER3_REASON=
PENNY_TICKER4=
PENNY_TICKER4_PRICE=
PENNY_TICKER4_CATALYST=
PENNY_TICKER4_DIRECTION=CALL or PUT or STOCK
PENNY_TICKER4_REDDIT_SCORE=
PENNY_TICKER4_REASON=
PENNY_TICKER5=
PENNY_TICKER5_PRICE=
PENNY_TICKER5_CATALYST=
PENNY_TICKER5_DIRECTION=CALL or PUT or STOCK
PENNY_TICKER5_REDDIT_SCORE=
PENNY_TICKER5_REASON=
PENNY_SQUEEZE_CANDIDATE=
PENNY_SQUEEZE_REASON=
PENNY_AVOID=
PENNY_AVOID_REASON=`, 1400),
    ]);

    const g = (text, key) => { const m = text.match(new RegExp(`${key}=([^\n]+)`)); return m ? m[1].trim() : ""; };

    const aiEcosystem = {
      hardwareWinners: [1,2].map(n => ({ ticker: g(marketText,`AI_HARDWARE_WINNER${n}`), reason: g(marketText,`AI_HARDWARE_WINNER${n}_REASON`) })).filter(h=>h.ticker),
      hardwareLosers: [{ ticker: g(marketText,"AI_HARDWARE_LOSER1"), reason: g(marketText,"AI_HARDWARE_LOSER1_REASON") }].filter(h=>h.ticker),
      energyPlays: [1,2].map(n => ({ ticker: g(marketText,`AI_ENERGY_WINNER${n}`), reason: g(marketText,`AI_ENERGY_WINNER${n}_REASON`) })).filter(e=>e.ticker),
      mineralPlays: [1,2].map(n => ({ mineral: g(marketText,`AI_MINERALS_PLAY${n}`), ticker: g(marketText,`AI_MINERALS_PLAY${n}_TICKER`), reason: g(marketText,`AI_MINERALS_PLAY${n}_REASON`) })).filter(m=>m.ticker),
      datacenterPlay: { name: g(marketText,"AI_DATACENTER_PLAY1"), ticker: g(marketText,"AI_DATACENTER_PLAY1_TICKER"), reason: g(marketText,"AI_DATACENTER_PLAY1_REASON") },
      ma: { target: g(marketText,"AI_MA_TARGET"), acquirer: g(marketText,"AI_MA_ACQUIRER"), reason: g(marketText,"AI_MA_REASON") },
      inversePairs: [1,2].map(n => ({ up: g(marketText,`AI_INVERSE_PAIR${n}_UP`), down: g(marketText,`AI_INVERSE_PAIR${n}_DOWN`), reason: g(marketText,`AI_INVERSE_PAIR${n}_REASON`) })).filter(p=>p.up),
      historicalPattern: g(marketText,"AI_HISTORICAL_PATTERN"),
      topCall: { ticker: g(marketText,"AI_TOP_CALL_TICKER"), expiry: g(marketText,"AI_TOP_CALL_EXPIRY") },
      topPut: { ticker: g(marketText,"AI_TOP_PUT_TICKER"), expiry: g(marketText,"AI_TOP_PUT_EXPIRY") },
    };
    const mining = {
      outlooks: ["Gold","Silver","Copper","Uranium","Lithium"].map(metal => ({ metal, outlook: g(marketText,`MINING_${metal.toUpperCase()}_OUTLOOK`), driver: g(marketText,`MINING_${metal.toUpperCase()}_DRIVER`) })),
      hotPicks: [1,2,3].map(n => ({ ticker: g(marketText,`MINING_HOT_TICKER${n}`), reason: g(marketText,`MINING_HOT_TICKER${n}_REASON`), direction: g(marketText,`MINING_HOT_TICKER${n}_DIRECTION`).includes("PUT")?"PUT":"CALL", expiry: g(marketText,`MINING_HOT_TICKER${n}_EXPIRY`) })).filter(p=>p.ticker),
      maTarget: g(marketText,"MINING_MA_TARGET"), maReason: g(marketText,"MINING_MA_REASON"), redditBuzz: g(marketText,"MINING_REDDIT_BUZZ"),
    };
    const macro = { fedSignal: g(marketText,"MACRO_FED_SIGNAL"), fedReason: g(marketText,"MACRO_FED_REASON"), nextEvent: g(marketText,"MACRO_NEXT_EVENT"), nextEventDate: g(marketText,"MACRO_NEXT_EVENT_DATE"), marketImpact: g(marketText,"MACRO_MARKET_IMPACT"), rateTrade: { direction: g(marketText,"MACRO_RATE_TRADE").includes("PUT")?"PUT":"CALL", ticker: g(marketText,"MACRO_RATE_TICKER"), expiry: g(marketText,"MACRO_RATE_EXPIRY") } };
    const microstructure = { pcRatio: g(marketText,"MICROSTRUCTURE_PC_RATIO"), pcSignal: g(marketText,"MICROSTRUCTURE_PC_SIGNAL"), squeezeCandidate: g(marketText,"MICROSTRUCTURE_SHORT_SQUEEZE"), squeezeTicker: g(marketText,"MICROSTRUCTURE_SQUEEZE_TICKER"), squeezeReason: g(marketText,"MICROSTRUCTURE_SQUEEZE_REASON"), insiderSignal: g(marketText,"MICROSTRUCTURE_INSIDER_SIGNAL"), insiderTicker: g(marketText,"MICROSTRUCTURE_INSIDER_TICKER"), insiderDirection: g(marketText,"MICROSTRUCTURE_INSIDER_DIRECTION"), unusualOptions: g(marketText,"MICROSTRUCTURE_UNUSUAL_OPTIONS"), optionsTicker: g(marketText,"MICROSTRUCTURE_OPTIONS_TICKER"), optionsDirection: g(marketText,"MICROSTRUCTURE_OPTIONS_DIRECTION").includes("PUT")?"PUT":"CALL" };
    const seasonal = { pattern: g(marketText,"SEASONAL_CURRENT_PATTERN"), trade: g(marketText,"SEASONAL_TRADE"), ticker: g(marketText,"SEASONAL_TICKER"), direction: g(marketText,"SEASONAL_DIRECTION").includes("PUT")?"PUT":"CALL", expiry: g(marketText,"SEASONAL_EXPIRY"), confidence: g(marketText,"SEASONAL_CONFIDENCE") };
    const cryptoSignal = { btcSignal: g(marketText,"CRYPTO_BTC_SIGNAL"), btcReason: g(marketText,"CRYPTO_BTC_REASON"), equityImpact: g(marketText,"CRYPTO_EQUITY_IMPACT"), play: { ticker: g(marketText,"CRYPTO_PLAY_TICKER"), direction: g(marketText,"CRYPTO_PLAY_DIRECTION").includes("PUT")?"PUT":"CALL", expiry: g(marketText,"CRYPTO_PLAY_EXPIRY") } };
    const pharma = { pdufa: [1,2,3].map(n => ({ ticker: g(catalystText,`PHARMA_PDUFA${n}_TICKER`), drug: g(catalystText,`PHARMA_PDUFA${n}_DRUG`), date: g(catalystText,`PHARMA_PDUFA${n}_DATE`), play: g(catalystText,`PHARMA_PDUFA${n}_PLAY`).includes("PUT")?"PUT":"CALL", reason: g(catalystText,`PHARMA_PDUFA${n}_REASON`) })).filter(p=>p.ticker), maTargets: [1,2].map(n => ({ ticker: g(catalystText,`PHARMA_MA_TARGET${n}`), reason: g(catalystText,`PHARMA_MA_TARGET${n}_REASON`) })).filter(t=>t.ticker), redditBuzz: g(catalystText,"PHARMA_REDDIT_BUZZ") };
    const pennyStocks = { picks: [1,2,3,4,5].map(n => ({ ticker: g(catalystText,`PENNY_TICKER${n}`), price: g(catalystText,`PENNY_TICKER${n}_PRICE`), catalyst: g(catalystText,`PENNY_TICKER${n}_CATALYST`), direction: g(catalystText,`PENNY_TICKER${n}_DIRECTION`), redditScore: g(catalystText,`PENNY_TICKER${n}_REDDIT_SCORE`), reason: g(catalystText,`PENNY_TICKER${n}_REASON`) })).filter(p=>p.ticker), squeezeCandidate: g(catalystText,"PENNY_SQUEEZE_CANDIDATE"), squeezeReason: g(catalystText,"PENNY_SQUEEZE_REASON"), avoid: g(catalystText,"PENNY_AVOID"), avoidReason: g(catalystText,"PENNY_AVOID_REASON") };

    const result = { success: true, part: "B", timestamp: new Date().toISOString(), cached: false, aiEcosystem, mining, pharma, pennyStocks, macro, microstructure, seasonal, cryptoSignal };
    cacheB = result; cacheTimeB = now;
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
