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
    const res = await fetch(url, { headers: { "User-Agent": "NEXUS/1.0" }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.articles || []).map(a => a.title).filter(Boolean);
  } catch { return []; }
}

// ── Fetch Reddit ──────────────────────────────────────────────
async function fetchReddit(subreddit, limit = 8) {
  try {
    const res = await fetch(`https://www.reddit.com/r/${subreddit}/hot.json?limit=${limit}`, {
      headers: { "User-Agent": "NEXUS/1.0" }, signal: AbortSignal.timeout(6000)
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
    const res = await fetch(url, { headers: { "User-Agent": "NEXUS/1.0 nexus@nexus.ai" }, signal: AbortSignal.timeout(6000) });
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
      headers: { "User-Agent": "NEXUS/1.0" }, signal: AbortSignal.timeout(6000)
    });
    const fedText = await fedRes.text();
    const fedTitles = [...fedText.matchAll(/<title>([^<]+)<\/title>/g)].slice(1,6).map(m => `[FED] ${m[1]}`);
    results.push(...fedTitles);
  } catch {}

  try {
    // EIA energy inventory
    const eiaRes = await fetch("https://www.eia.gov/rss/todayinenergy.xml", {
      headers: { "User-Agent": "NEXUS/1.0" }, signal: AbortSignal.timeout(6000)
    });
    const eiaText = await eiaRes.text();
    const eiaTitles = [...eiaText.matchAll(/<title>([^<]+)<\/title>/g)].slice(1,5).map(m => `[EIA] ${m[1]}`);
    results.push(...eiaTitles);
  } catch {}

  try {
    // Upcoming economic events from public calendar
    const calRes = await fetch("https://api.gdeltproject.org/api/v2/doc/doc?query=federal+reserve+interest+rates+CPI+inflation&mode=artlist&maxrecords=5&format=json&timespan=3d", {
      headers: { "User-Agent": "NEXUS/1.0" }, signal: AbortSignal.timeout(6000)
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
      headers: { "User-Agent": "NEXUS/1.0" }, signal: AbortSignal.timeout(6000)
    });
    const data = await res.json();
    (data.articles||[]).forEach(a => results.push(`[SENTIMENT] ${a.title}`));
  } catch {}

  try {
    // Analyst upgrades/downgrades news
    const res2 = await fetch("https://api.gdeltproject.org/api/v2/doc/doc?query=analyst+upgrade+downgrade+price+target+stock&mode=artlist&maxrecords=8&format=json&timespan=2d", {
      headers: { "User-Agent": "NEXUS/1.0" }, signal: AbortSignal.timeout(6000)
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
      const res = await fetch(url, { headers: { "User-Agent": "NEXUS/1.0" }, signal: AbortSignal.timeout(6000) });
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

let cacheA = null;
let cacheTimeA = null;
const CACHE_TTL_A = 4 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { Object.entries(corsHeaders).forEach(([k,v]) => res.setHeader(k,v)); return res.status(200).end(); }
  Object.entries(corsHeaders).forEach(([k,v]) => res.setHeader(k,v));
  if (!validateApiKey(req)) return res.status(401).json({ error: "Unauthorized." });

  const force = req.query.force === "true";
  const now = Date.now();
  if (cacheA && cacheTimeA && (now - cacheTimeA) < CACHE_TTL_A && !force) {
    return res.status(200).json({ ...cacheA, cached: true });
  }

  try {
    // Fetch limited headlines — faster than full scan
    const headlines = await Promise.allSettled([
      fetchGDELT("Trump executive order market tariffs"),
      fetchGDELT("Netanyahu Iran war military"),
      fetchGDELT("Putin Russia sanctions economy"),
      fetchGDELT("Kushner investment deal fund"),
      fetchGDELT("Trump family stocks investment"),
      fetchReddit("wallstreetbets", 8),
      fetchReddit("investing", 6),
      fetchReddit("SecurityAnalysis", 5),
      fetch13FLatest(),
    ]);
    const headlineList = headlines.map(r => r.status === "fulfilled" ? r.value : []).flat();
    const today = new Date().toLocaleDateString("en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    const [profileText, scenarioText, psychText] = await Promise.all([

      callClaude(`You are NEXUS Power Intel. Today is ${today}.
LIVE INTEL:
${headlineList.slice(0,20).join("\n")}

${WHALE_INTEL}

Fill EXACTLY:

TRUMP_CORE_DRIVER=
TRUMP_VANITY_TRIGGER=
TRUMP_ANNOUNCEMENT_PATTERN=
TRUMP_CURRENT_PLAY=
TRUMP_NEXT_MOVE=
TRUMP_MARKET_SIGNAL=BULLISH or BEARISH or MIXED
TRUMP_SIGNAL_REASON=

NETANYAHU_CORE_DRIVER=
NETANYAHU_SURVIVAL_PLAY=
NETANYAHU_TRUMP_LEVERAGE=
NETANYAHU_NEXT_MOVE=
NETANYAHU_MARKET_SIGNAL=BULLISH or BEARISH or MIXED
NETANYAHU_SIGNAL_REASON=

PUTIN_CORE_DRIVER=
PUTIN_ECONOMIC_PRESSURE=
PUTIN_IRAN_CONNECTION=
PUTIN_SANCTIONS_PLAY=
PUTIN_NEXT_MOVE=
PUTIN_MARKET_SIGNAL=BULLISH or BEARISH or MIXED
PUTIN_SIGNAL_REASON=

XI_CORE_DRIVER=
XI_TAIWAN_TIMELINE=
XI_TRUMP_TRADE_PLAY=
XI_NEXT_MOVE=
XI_MARKET_SIGNAL=BULLISH or BEARISH or MIXED
XI_SIGNAL_REASON=

KUSHNER_KEY_INVESTMENTS=
KUSHNER_SAUDI_PLAY=
KUSHNER_BENEFITING_FROM=
KUSHNER_WATCH_SECTORS=

TRUMP_FAMILY_WATCH=

NETWORK_CONNECTION1=
NETWORK_CONNECTION2=
NETWORK_CONNECTION3=

IRAN_WAR_THESIS=
RUSSIA_SANCTIONS_THESIS=
NETANYAHU_SURVIVAL_THESIS=`, 1400),

      callClaude(`You are NEXUS Scenario Engine. Today is ${today}.
LIVE INTEL: ${headlineList.slice(0,15).join("\n")}

Fill EXACTLY:

SCENARIO_A_NAME=
SCENARIO_A_PROBABILITY=
SCENARIO_A_TRIGGER=
SCENARIO_A_WEEK1=
SCENARIO_A_WEEK2=
SCENARIO_A_WEEK3=
SCENARIO_A_WEEK4=
SCENARIO_A_PLAY1_TICKER=
SCENARIO_A_PLAY1_DIRECTION=CALL or PUT
SCENARIO_A_PLAY1_EXPIRY=
SCENARIO_A_PLAY1_REASON=
SCENARIO_A_PLAY2_TICKER=
SCENARIO_A_PLAY2_DIRECTION=CALL or PUT
SCENARIO_A_PLAY2_EXPIRY=
SCENARIO_A_PLAY2_REASON=
SCENARIO_A_PLAY3_TICKER=
SCENARIO_A_PLAY3_DIRECTION=CALL or PUT
SCENARIO_A_PLAY3_EXPIRY=
SCENARIO_A_PLAY3_REASON=

SCENARIO_B_NAME=
SCENARIO_B_PROBABILITY=
SCENARIO_B_TRIGGER=
SCENARIO_B_WEEK1=
SCENARIO_B_WEEK2=
SCENARIO_B_WEEK3=
SCENARIO_B_WEEK4=
SCENARIO_B_PLAY1_TICKER=
SCENARIO_B_PLAY1_DIRECTION=CALL or PUT
SCENARIO_B_PLAY1_EXPIRY=
SCENARIO_B_PLAY1_REASON=
SCENARIO_B_PLAY2_TICKER=
SCENARIO_B_PLAY2_DIRECTION=CALL or PUT
SCENARIO_B_PLAY2_EXPIRY=
SCENARIO_B_PLAY2_REASON=
SCENARIO_B_PLAY3_TICKER=
SCENARIO_B_PLAY3_DIRECTION=CALL or PUT
SCENARIO_B_PLAY3_EXPIRY=
SCENARIO_B_PLAY3_REASON=

SCENARIO_C_NAME=
SCENARIO_C_PROBABILITY=
SCENARIO_C_TRIGGER=
SCENARIO_C_WEEK1=
SCENARIO_C_WEEK2=
SCENARIO_C_WEEK3=
SCENARIO_C_WEEK4=
SCENARIO_C_PLAY1_TICKER=
SCENARIO_C_PLAY1_DIRECTION=CALL or PUT
SCENARIO_C_PLAY1_EXPIRY=
SCENARIO_C_PLAY1_REASON=
SCENARIO_C_PLAY2_TICKER=
SCENARIO_C_PLAY2_DIRECTION=CALL or PUT
SCENARIO_C_PLAY2_EXPIRY=
SCENARIO_C_PLAY2_REASON=
SCENARIO_C_PLAY3_TICKER=
SCENARIO_C_PLAY3_DIRECTION=CALL or PUT
SCENARIO_C_PLAY3_EXPIRY=
SCENARIO_C_PLAY3_REASON=

SCENARIO_D_NAME=
SCENARIO_D_PROBABILITY=
SCENARIO_D_TRIGGER=
SCENARIO_D_WEEK1=
SCENARIO_D_WEEK2=
SCENARIO_D_WEEK3=
SCENARIO_D_WEEK4=
SCENARIO_D_PLAY1_TICKER=
SCENARIO_D_PLAY1_DIRECTION=CALL or PUT
SCENARIO_D_PLAY1_EXPIRY=
SCENARIO_D_PLAY1_REASON=
SCENARIO_D_PLAY2_TICKER=
SCENARIO_D_PLAY2_DIRECTION=CALL or PUT
SCENARIO_D_PLAY2_EXPIRY=
SCENARIO_D_PLAY2_REASON=
SCENARIO_D_PLAY3_TICKER=
SCENARIO_D_PLAY3_DIRECTION=CALL or PUT
SCENARIO_D_PLAY3_EXPIRY=
SCENARIO_D_PLAY3_REASON=

TOP_PLAY_TICKER=
TOP_PLAY_DIRECTION=CALL or PUT
TOP_PLAY_EXPIRY=
TOP_PLAY_CONFIDENCE=HIGH or MEDIUM
TOP_PLAY_THESIS=`, 1400),

      callClaude(`You are NEXUS Psychology Engine. Today is ${today}.
${WHALE_INTEL}
COMMUNITY: ${headlineList.filter(h => h.includes('[COMMUNITY') || h.includes('[WSB')).slice(0,10).join("\n") || "Scanning..."}

Fill EXACTLY:

PSYCH_TRUMP_NEXT_TRIGGER=
PSYCH_TRUMP_ANNOUNCEMENT_WINDOW=
PSYCH_TRUMP_STOCK_PLAY=
PSYCH_TRUMP_STOCK_DIRECTION=CALL or PUT
PSYCH_TRUMP_STOCK_EXPIRY=
PSYCH_TRUMP_CONFIDENCE=HIGH or MEDIUM

PSYCH_NETANYAHU_NEXT_TRIGGER=
PSYCH_NETANYAHU_DESPERATION_LEVEL=LOW or MEDIUM or HIGH or CRITICAL
PSYCH_NETANYAHU_STOCK_PLAY=
PSYCH_NETANYAHU_STOCK_DIRECTION=CALL or PUT
PSYCH_NETANYAHU_STOCK_EXPIRY=

PSYCH_PUTIN_NEXT_TRIGGER=
PSYCH_PUTIN_ECONOMIC_DESPERATION=LOW or MEDIUM or HIGH or CRITICAL
PSYCH_PUTIN_STOCK_PLAY=
PSYCH_PUTIN_STOCK_DIRECTION=CALL or PUT
PSYCH_PUTIN_STOCK_EXPIRY=

NETWORK_RISING_PLAYS=
NETWORK_FALLING_PLAYS=
NETWORK_TIMING_EDGE=

COMMUNITY_TOP_DD_TICKER=
COMMUNITY_TOP_DD_DIRECTION=CALL or PUT or LONG
COMMUNITY_TOP_DD_THESIS=
COMMUNITY_TOP_DD_UPVOTES=
COMMUNITY_CONSENSUS_TICKER=
COMMUNITY_CONSENSUS_DIRECTION=CALL or PUT or LONG
COMMUNITY_CONTRARIAN_SIGNAL=
COMMUNITY_CONTRARIAN_TICKER=

PROBABILITY_SCORE_TICKER1=
PROBABILITY_SCORE_TICKER1_SIGNALS=
PROBABILITY_SCORE_TICKER1_CONFIDENCE=
PROBABILITY_SCORE_TICKER1_DIRECTION=CALL or PUT
PROBABILITY_SCORE_TICKER1_EXPIRY=
PROBABILITY_SCORE_TICKER1_REASON=

PROBABILITY_SCORE_TICKER2=
PROBABILITY_SCORE_TICKER2_SIGNALS=
PROBABILITY_SCORE_TICKER2_CONFIDENCE=
PROBABILITY_SCORE_TICKER2_DIRECTION=CALL or PUT
PROBABILITY_SCORE_TICKER2_EXPIRY=
PROBABILITY_SCORE_TICKER2_REASON=

PROBABILITY_SCORE_TICKER3=
PROBABILITY_SCORE_TICKER3_SIGNALS=
PROBABILITY_SCORE_TICKER3_CONFIDENCE=
PROBABILITY_SCORE_TICKER3_DIRECTION=CALL or PUT
PROBABILITY_SCORE_TICKER3_EXPIRY=
PROBABILITY_SCORE_TICKER3_REASON=

RISE_FALL_PAIR1_RISE=
RISE_FALL_PAIR1_FALL=
RISE_FALL_PAIR1_CATALYST=
RISE_FALL_PAIR1_TIMING=

RISE_FALL_PAIR2_RISE=
RISE_FALL_PAIR2_FALL=
RISE_FALL_PAIR2_CATALYST=
RISE_FALL_PAIR2_TIMING=

HIGHEST_CONVICTION_PLAY_TICKER=
HIGHEST_CONVICTION_PLAY_DIRECTION=CALL or PUT
HIGHEST_CONVICTION_PLAY_EXPIRY=
HIGHEST_CONVICTION_PLAY_SIGNALS=
HIGHEST_CONVICTION_PLAY_PROBABILITY=
HIGHEST_CONVICTION_PLAY_THESIS=`, 1400),
    ]);

    const g = (text, key) => { const m = text.match(new RegExp(`${key}=([^\n]+)`)); return m ? m[1].trim() : ""; };

    const profiles = {
      trump: { coreDriver: g(profileText,"TRUMP_CORE_DRIVER"), vanityTrigger: g(profileText,"TRUMP_VANITY_TRIGGER"), announcementPattern: g(profileText,"TRUMP_ANNOUNCEMENT_PATTERN"), currentPlay: g(profileText,"TRUMP_CURRENT_PLAY"), nextMove: g(profileText,"TRUMP_NEXT_MOVE"), marketSignal: g(profileText,"TRUMP_MARKET_SIGNAL"), signalReason: g(profileText,"TRUMP_SIGNAL_REASON") },
      netanyahu: { coreDriver: g(profileText,"NETANYAHU_CORE_DRIVER"), survivalPlay: g(profileText,"NETANYAHU_SURVIVAL_PLAY"), trumpLeverage: g(profileText,"NETANYAHU_TRUMP_LEVERAGE"), nextMove: g(profileText,"NETANYAHU_NEXT_MOVE"), marketSignal: g(profileText,"NETANYAHU_MARKET_SIGNAL"), signalReason: g(profileText,"NETANYAHU_SIGNAL_REASON") },
      putin: { coreDriver: g(profileText,"PUTIN_CORE_DRIVER"), economicPressure: g(profileText,"PUTIN_ECONOMIC_PRESSURE"), iranConnection: g(profileText,"PUTIN_IRAN_CONNECTION"), sanctionsPlay: g(profileText,"PUTIN_SANCTIONS_PLAY"), nextMove: g(profileText,"PUTIN_NEXT_MOVE"), marketSignal: g(profileText,"PUTIN_MARKET_SIGNAL"), signalReason: g(profileText,"PUTIN_SIGNAL_REASON") },
      xi: { coreDriver: g(profileText,"XI_CORE_DRIVER"), taiwanTimeline: g(profileText,"XI_TAIWAN_TIMELINE"), trumpTradePlay: g(profileText,"XI_TRUMP_TRADE_PLAY"), nextMove: g(profileText,"XI_NEXT_MOVE"), marketSignal: g(profileText,"XI_MARKET_SIGNAL"), signalReason: g(profileText,"XI_SIGNAL_REASON") },
      kushner: { keyInvestments: g(profileText,"KUSHNER_KEY_INVESTMENTS"), saudiPlay: g(profileText,"KUSHNER_SAUDI_PLAY"), benefitingFrom: g(profileText,"KUSHNER_BENEFITING_FROM"), watchSectors: g(profileText,"KUSHNER_WATCH_SECTORS") },
      trumpFamily: { watchList: g(profileText,"TRUMP_FAMILY_WATCH") },
    };

    const network = {
      connections: [g(profileText,"NETWORK_CONNECTION1"), g(profileText,"NETWORK_CONNECTION2"), g(profileText,"NETWORK_CONNECTION3")].filter(Boolean),
      iranWarThesis: g(profileText,"IRAN_WAR_THESIS"),
      russiaSanctionsThesis: g(profileText,"RUSSIA_SANCTIONS_THESIS"),
      netanyahuSurvivalThesis: g(profileText,"NETANYAHU_SURVIVAL_THESIS"),
    };

    const parseScenario = (L) => ({
      name: g(scenarioText,`SCENARIO_${L}_NAME`), probability: g(scenarioText,`SCENARIO_${L}_PROBABILITY`),
      trigger: g(scenarioText,`SCENARIO_${L}_TRIGGER`),
      weeks: [1,2,3,4].map(w => g(scenarioText,`SCENARIO_${L}_WEEK${w}`)),
      plays: [1,2,3].map(n => ({ ticker: g(scenarioText,`SCENARIO_${L}_PLAY${n}_TICKER`), direction: g(scenarioText,`SCENARIO_${L}_PLAY${n}_DIRECTION`).includes("PUT")?"PUT":"CALL", expiry: g(scenarioText,`SCENARIO_${L}_PLAY${n}_EXPIRY`), reason: g(scenarioText,`SCENARIO_${L}_PLAY${n}_REASON`) })).filter(p=>p.ticker),
    });
    const scenarios = ["A","B","C","D"].map(parseScenario);
    const topPlay = { ticker: g(scenarioText,"TOP_PLAY_TICKER"), direction: g(scenarioText,"TOP_PLAY_DIRECTION").includes("PUT")?"PUT":"CALL", expiry: g(scenarioText,"TOP_PLAY_EXPIRY"), confidence: g(scenarioText,"TOP_PLAY_CONFIDENCE"), thesis: g(scenarioText,"TOP_PLAY_THESIS") };

    const psychology = {
      trump: { trigger: g(psychText,"PSYCH_TRUMP_NEXT_TRIGGER"), window: g(psychText,"PSYCH_TRUMP_ANNOUNCEMENT_WINDOW"), play: g(psychText,"PSYCH_TRUMP_STOCK_PLAY"), direction: g(psychText,"PSYCH_TRUMP_STOCK_DIRECTION").includes("PUT")?"PUT":"CALL", expiry: g(psychText,"PSYCH_TRUMP_STOCK_EXPIRY"), confidence: g(psychText,"PSYCH_TRUMP_CONFIDENCE") },
      netanyahu: { trigger: g(psychText,"PSYCH_NETANYAHU_NEXT_TRIGGER"), desperation: g(psychText,"PSYCH_NETANYAHU_DESPERATION_LEVEL"), play: g(psychText,"PSYCH_NETANYAHU_STOCK_PLAY"), direction: g(psychText,"PSYCH_NETANYAHU_STOCK_DIRECTION").includes("PUT")?"PUT":"CALL", expiry: g(psychText,"PSYCH_NETANYAHU_STOCK_EXPIRY") },
      putin: { trigger: g(psychText,"PSYCH_PUTIN_NEXT_TRIGGER"), desperation: g(psychText,"PSYCH_PUTIN_ECONOMIC_DESPERATION"), play: g(psychText,"PSYCH_PUTIN_STOCK_PLAY"), direction: g(psychText,"PSYCH_PUTIN_STOCK_DIRECTION").includes("PUT")?"PUT":"CALL", expiry: g(psychText,"PSYCH_PUTIN_STOCK_EXPIRY") },
      networkRising: g(psychText,"NETWORK_RISING_PLAYS"), networkFalling: g(psychText,"NETWORK_FALLING_PLAYS"), timingEdge: g(psychText,"NETWORK_TIMING_EDGE"),
    };
    const community = {
      topDD: { ticker: g(psychText,"COMMUNITY_TOP_DD_TICKER"), direction: g(psychText,"COMMUNITY_TOP_DD_DIRECTION"), thesis: g(psychText,"COMMUNITY_TOP_DD_THESIS"), upvotes: g(psychText,"COMMUNITY_TOP_DD_UPVOTES") },
      consensus: { ticker: g(psychText,"COMMUNITY_CONSENSUS_TICKER"), direction: g(psychText,"COMMUNITY_CONSENSUS_DIRECTION") },
      contrarian: { signal: g(psychText,"COMMUNITY_CONTRARIAN_SIGNAL"), ticker: g(psychText,"COMMUNITY_CONTRARIAN_TICKER") },
    };
    const probabilityScores = [1,2,3].map(n => ({ ticker: g(psychText,`PROBABILITY_SCORE_TICKER${n}`), signals: g(psychText,`PROBABILITY_SCORE_TICKER${n}_SIGNALS`), confidence: g(psychText,`PROBABILITY_SCORE_TICKER${n}_CONFIDENCE`), direction: g(psychText,`PROBABILITY_SCORE_TICKER${n}_DIRECTION`).includes("PUT")?"PUT":"CALL", expiry: g(psychText,`PROBABILITY_SCORE_TICKER${n}_EXPIRY`), reason: g(psychText,`PROBABILITY_SCORE_TICKER${n}_REASON`) })).filter(p=>p.ticker);
    const riseFallPairs = [1,2].map(n => ({ rise: g(psychText,`RISE_FALL_PAIR${n}_RISE`), fall: g(psychText,`RISE_FALL_PAIR${n}_FALL`), catalyst: g(psychText,`RISE_FALL_PAIR${n}_CATALYST`), timing: g(psychText,`RISE_FALL_PAIR${n}_TIMING`) })).filter(p=>p.rise);
    const highestConviction = { ticker: g(psychText,"HIGHEST_CONVICTION_PLAY_TICKER"), direction: g(psychText,"HIGHEST_CONVICTION_PLAY_DIRECTION").includes("PUT")?"PUT":"CALL", expiry: g(psychText,"HIGHEST_CONVICTION_PLAY_EXPIRY"), signals: g(psychText,"HIGHEST_CONVICTION_PLAY_SIGNALS"), probability: g(psychText,"HIGHEST_CONVICTION_PLAY_PROBABILITY"), thesis: g(psychText,"HIGHEST_CONVICTION_PLAY_THESIS") };

    const result = { success: true, part: "A", timestamp: new Date().toISOString(), cached: false, profiles, network, scenarios, topPlay, psychology, community, probabilityScores, riseFallPairs, highestConviction };
    cacheA = result; cacheTimeA = now;
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
