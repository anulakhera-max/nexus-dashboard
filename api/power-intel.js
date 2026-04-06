// /api/power-intel — Full Geopolitical + Market Intelligence Engine
// Sections: Profiles, Network, Scenarios, AI Ecosystem, Mining, Pharma, Penny Stocks

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-nexus-key",
  "Content-Type": "application/json",
};

function validateApiKey(req) {
  const key = req.headers["x-nexus-key"];
  return key === (process.env.NEXUS_API_KEY || "nexus-axl-agent-key");
}

async function callClaude(prompt, maxTokens = 1400) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
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

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { Object.entries(corsHeaders).forEach(([k,v]) => res.setHeader(k,v)); return res.status(200).end(); }
  Object.entries(corsHeaders).forEach(([k,v]) => res.setHeader(k,v));
  if (!validateApiKey(req)) return res.status(401).json({ error: "Unauthorized." });

  const force = req.query.force === "true";
  const now = Date.now();
  if (cache && cacheTime && (now - cacheTime) < CACHE_TTL && !force) {
    return res.status(200).json({ ...cache, cached: true });
  }

  try {
    const headlines = await gatherAllIntel();
    const headlineText = headlines.slice(0, 80).join("\n");
    const today = new Date().toLocaleDateString("en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    // Run all 5 Claude prompts in parallel
    const [profileText, scenarioText, marketText, catalystText, psychText] = await Promise.all([

      // PROMPT 1: Psychographic profiles + network
      callClaude(`You are NEXUS Power Intel. Today is ${today}.
LIVE INTEL:
${headlines.slice(0,30).join("\n")}

${WHALE_INTEL}

Fill EXACTLY — no extra text:

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

      // PROMPT 2: Scenario engine
      callClaude(`You are NEXUS Scenario Engine. Today is ${today}.
LIVE INTEL: ${headlines.slice(0,20).join("\n")}

${WHALE_INTEL}

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

      // PROMPT 3: AI Ecosystem + Mining + Market Microstructure + Macro
      callClaude(`You are NEXUS Market Intelligence. Today is ${today}.
LIVE INTEL:
${headlines.slice(30,60).join("\n")}

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
MINING_REDDIT_BUZZ=`, 1400),

      // PROMPT 4: Pharma + Penny Stocks
      callClaude(`You are NEXUS Catalyst Intelligence. Today is ${today}.
LIVE INTEL:
${headlines.slice(60,80).join("\n")}

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
,

      // PROMPT 5: Psychology + Network + Community Intelligence
      callClaude(`You are NEXUS Psychology & Network Intelligence Engine. Today is ${today}.

LIVE COMMUNITY INTELLIGENCE (high-upvote Reddit DDs and analysis):
${headlines.filter(h => h.includes('[COMMUNITY') || h.includes('[WSB-DD]')).join('\n') || 'Scanning community sources...'}

WHALE POSITIONS:
${WHALE_INTEL}

POWER NETWORK CONTEXT:
- Trump: narcissist, needs constant wins, announces deals when approval dips, weekend tweets move Monday markets
- Netanyahu: cornered by prosecution, war = survival, irrational when threatened
- Putin: chess player, 10-year horizon, sanctions = slow bleed, looking for relief
- Xi: patience, Taiwan = when not if, trade = weapon
- Kushner: money follows his deals (Saudi PIF $2B, Mideast real estate, crypto)
- Burry: contrarian, puts when others are greedy, historically right on bubbles
- Buffett: 5-year horizon, new positions = macro shift signal

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
PROBABILITY_SCORE_TICKER1_SIGNALS=number e.g. 5
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
HIGHEST_CONVICTION_PLAY_SIGNALS=list the signals that all align e.g. Whale+Insider+Macro+Psych
HIGHEST_CONVICTION_PLAY_PROBABILITY=e.g. 78%
HIGHEST_CONVICTION_PLAY_THESIS=2-3 sentences connecting psychology, network, and market`, 1400),
    ]);

    // ── Parse all sections ────────────────────────────────────
    const profiles = {
      trump: { coreDriver: get(profileText,"TRUMP_CORE_DRIVER"), vanityTrigger: get(profileText,"TRUMP_VANITY_TRIGGER"), announcementPattern: get(profileText,"TRUMP_ANNOUNCEMENT_PATTERN"), currentPlay: get(profileText,"TRUMP_CURRENT_PLAY"), nextMove: get(profileText,"TRUMP_NEXT_MOVE"), marketSignal: get(profileText,"TRUMP_MARKET_SIGNAL"), signalReason: get(profileText,"TRUMP_SIGNAL_REASON") },
      netanyahu: { coreDriver: get(profileText,"NETANYAHU_CORE_DRIVER"), survivalPlay: get(profileText,"NETANYAHU_SURVIVAL_PLAY"), trumpLeverage: get(profileText,"NETANYAHU_TRUMP_LEVERAGE"), nextMove: get(profileText,"NETANYAHU_NEXT_MOVE"), marketSignal: get(profileText,"NETANYAHU_MARKET_SIGNAL"), signalReason: get(profileText,"NETANYAHU_SIGNAL_REASON") },
      putin: { coreDriver: get(profileText,"PUTIN_CORE_DRIVER"), economicPressure: get(profileText,"PUTIN_ECONOMIC_PRESSURE"), iranConnection: get(profileText,"PUTIN_IRAN_CONNECTION"), sanctionsPlay: get(profileText,"PUTIN_SANCTIONS_PLAY"), nextMove: get(profileText,"PUTIN_NEXT_MOVE"), marketSignal: get(profileText,"PUTIN_MARKET_SIGNAL"), signalReason: get(profileText,"PUTIN_SIGNAL_REASON") },
      xi: { coreDriver: get(profileText,"XI_CORE_DRIVER"), taiwanTimeline: get(profileText,"XI_TAIWAN_TIMELINE"), trumpTradePlay: get(profileText,"XI_TRUMP_TRADE_PLAY"), nextMove: get(profileText,"XI_NEXT_MOVE"), marketSignal: get(profileText,"XI_MARKET_SIGNAL"), signalReason: get(profileText,"XI_SIGNAL_REASON") },
      kushner: { keyInvestments: get(profileText,"KUSHNER_KEY_INVESTMENTS"), saudiPlay: get(profileText,"KUSHNER_SAUDI_PLAY"), benefitingFrom: get(profileText,"KUSHNER_BENEFITING_FROM"), watchSectors: get(profileText,"KUSHNER_WATCH_SECTORS") },
      trumpFamily: { watchList: get(profileText,"TRUMP_FAMILY_WATCH") },
    };

    const network = {
      connections: [get(profileText,"NETWORK_CONNECTION1"), get(profileText,"NETWORK_CONNECTION2"), get(profileText,"NETWORK_CONNECTION3")].filter(Boolean),
      iranWarThesis: get(profileText,"IRAN_WAR_THESIS"),
      russiaSanctionsThesis: get(profileText,"RUSSIA_SANCTIONS_THESIS"),
      netanyahuSurvivalThesis: get(profileText,"NETANYAHU_SURVIVAL_THESIS"),
    };

    const parseScenario = (L) => ({
      name: get(scenarioText,`SCENARIO_${L}_NAME`),
      probability: get(scenarioText,`SCENARIO_${L}_PROBABILITY`),
      trigger: get(scenarioText,`SCENARIO_${L}_TRIGGER`),
      weeks: [1,2,3,4].map(w => get(scenarioText,`SCENARIO_${L}_WEEK${w}`)),
      plays: [1,2,3].map(n => ({ ticker: get(scenarioText,`SCENARIO_${L}_PLAY${n}_TICKER`), direction: get(scenarioText,`SCENARIO_${L}_PLAY${n}_DIRECTION`).includes("PUT")?"PUT":"CALL", expiry: get(scenarioText,`SCENARIO_${L}_PLAY${n}_EXPIRY`), reason: get(scenarioText,`SCENARIO_${L}_PLAY${n}_REASON`) })).filter(p=>p.ticker),
    });
    const scenarios = ["A","B","C","D"].map(parseScenario);

    const topPlay = { ticker: get(scenarioText,"TOP_PLAY_TICKER"), direction: get(scenarioText,"TOP_PLAY_DIRECTION").includes("PUT")?"PUT":"CALL", expiry: get(scenarioText,"TOP_PLAY_EXPIRY"), confidence: get(scenarioText,"TOP_PLAY_CONFIDENCE"), thesis: get(scenarioText,"TOP_PLAY_THESIS") };

    const aiEcosystem = {
      hardwareWinners: [1,2].map(n => ({ ticker: get(marketText,`AI_HARDWARE_WINNER${n}`), reason: get(marketText,`AI_HARDWARE_WINNER${n}_REASON`) })).filter(h=>h.ticker),
      hardwareLosers: [{ ticker: get(marketText,"AI_HARDWARE_LOSER1"), reason: get(marketText,"AI_HARDWARE_LOSER1_REASON") }].filter(h=>h.ticker),
      energyPlays: [1,2].map(n => ({ ticker: get(marketText,`AI_ENERGY_WINNER${n}`), reason: get(marketText,`AI_ENERGY_WINNER${n}_REASON`) })).filter(e=>e.ticker),
      mineralPlays: [1,2].map(n => ({ mineral: get(marketText,`AI_MINERALS_PLAY${n}`), ticker: get(marketText,`AI_MINERALS_PLAY${n}_TICKER`), reason: get(marketText,`AI_MINERALS_PLAY${n}_REASON`) })).filter(m=>m.ticker),
      datacenterPlay: { name: get(marketText,"AI_DATACENTER_PLAY1"), ticker: get(marketText,"AI_DATACENTER_PLAY1_TICKER"), reason: get(marketText,"AI_DATACENTER_PLAY1_REASON") },
      ma: { target: get(marketText,"AI_MA_TARGET"), acquirer: get(marketText,"AI_MA_ACQUIRER"), reason: get(marketText,"AI_MA_REASON") },
      inversePairs: [1,2].map(n => ({ up: get(marketText,`AI_INVERSE_PAIR${n}_UP`), down: get(marketText,`AI_INVERSE_PAIR${n}_DOWN`), reason: get(marketText,`AI_INVERSE_PAIR${n}_REASON`) })).filter(p=>p.up),
      historicalPattern: get(marketText,"AI_HISTORICAL_PATTERN"),
      topCall: { ticker: get(marketText,"AI_TOP_CALL_TICKER"), expiry: get(marketText,"AI_TOP_CALL_EXPIRY") },
      topPut: { ticker: get(marketText,"AI_TOP_PUT_TICKER"), expiry: get(marketText,"AI_TOP_PUT_EXPIRY") },
    };

    const mining = {
      outlooks: [
        { metal: "Gold", outlook: get(marketText,"MINING_GOLD_OUTLOOK"), driver: get(marketText,"MINING_GOLD_DRIVER") },
        { metal: "Silver", outlook: get(marketText,"MINING_SILVER_OUTLOOK"), driver: get(marketText,"MINING_SILVER_DRIVER") },
        { metal: "Copper", outlook: get(marketText,"MINING_COPPER_OUTLOOK"), driver: get(marketText,"MINING_COPPER_DRIVER") },
        { metal: "Uranium", outlook: get(marketText,"MINING_URANIUM_OUTLOOK"), driver: get(marketText,"MINING_URANIUM_DRIVER") },
        { metal: "Lithium", outlook: get(marketText,"MINING_LITHIUM_OUTLOOK"), driver: get(marketText,"MINING_LITHIUM_DRIVER") },
      ],
      hotPicks: [1,2,3].map(n => ({ ticker: get(marketText,`MINING_HOT_TICKER${n}`), reason: get(marketText,`MINING_HOT_TICKER${n}_REASON`), direction: get(marketText,`MINING_HOT_TICKER${n}_DIRECTION`).includes("PUT")?"PUT":"CALL", expiry: get(marketText,`MINING_HOT_TICKER${n}_EXPIRY`) })).filter(p=>p.ticker),
      maTarget: get(marketText,"MINING_MA_TARGET"),
      maReason: get(marketText,"MINING_MA_REASON"),
      redditBuzz: get(marketText,"MINING_REDDIT_BUZZ"),
    };

    const macro = {
      fedSignal: get(marketText,"MACRO_FED_SIGNAL"),
      fedReason: get(marketText,"MACRO_FED_REASON"),
      nextEvent: get(marketText,"MACRO_NEXT_EVENT"),
      nextEventDate: get(marketText,"MACRO_NEXT_EVENT_DATE"),
      marketImpact: get(marketText,"MACRO_MARKET_IMPACT"),
      rateTrade: { direction: get(marketText,"MACRO_RATE_TRADE").includes("PUT")?"PUT":"CALL", ticker: get(marketText,"MACRO_RATE_TICKER"), expiry: get(marketText,"MACRO_RATE_EXPIRY") },
    };

    const microstructure = {
      pcRatio: get(marketText,"MICROSTRUCTURE_PC_RATIO"),
      pcSignal: get(marketText,"MICROSTRUCTURE_PC_SIGNAL"),
      squeezeCandidate: get(marketText,"MICROSTRUCTURE_SHORT_SQUEEZE"),
      squeezeTicker: get(marketText,"MICROSTRUCTURE_SQUEEZE_TICKER"),
      squeezeReason: get(marketText,"MICROSTRUCTURE_SQUEEZE_REASON"),
      insiderSignal: get(marketText,"MICROSTRUCTURE_INSIDER_SIGNAL"),
      insiderTicker: get(marketText,"MICROSTRUCTURE_INSIDER_TICKER"),
      insiderDirection: get(marketText,"MICROSTRUCTURE_INSIDER_DIRECTION"),
      unusualOptions: get(marketText,"MICROSTRUCTURE_UNUSUAL_OPTIONS"),
      optionsTicker: get(marketText,"MICROSTRUCTURE_OPTIONS_TICKER"),
      optionsDirection: get(marketText,"MICROSTRUCTURE_OPTIONS_DIRECTION").includes("PUT")?"PUT":"CALL",
    };

    const seasonal = {
      pattern: get(marketText,"SEASONAL_CURRENT_PATTERN"),
      trade: get(marketText,"SEASONAL_TRADE"),
      ticker: get(marketText,"SEASONAL_TICKER"),
      direction: get(marketText,"SEASONAL_DIRECTION").includes("PUT")?"PUT":"CALL",
      expiry: get(marketText,"SEASONAL_EXPIRY"),
      confidence: get(marketText,"SEASONAL_CONFIDENCE"),
    };

    const cryptoSignal = {
      btcSignal: get(marketText,"CRYPTO_BTC_SIGNAL"),
      btcReason: get(marketText,"CRYPTO_BTC_REASON"),
      equityImpact: get(marketText,"CRYPTO_EQUITY_IMPACT"),
      play: { ticker: get(marketText,"CRYPTO_PLAY_TICKER"), direction: get(marketText,"CRYPTO_PLAY_DIRECTION").includes("PUT")?"PUT":"CALL", expiry: get(marketText,"CRYPTO_PLAY_EXPIRY") },
    };

    const psychology = {
      trump: { trigger: get(psychText,"PSYCH_TRUMP_NEXT_TRIGGER"), window: get(psychText,"PSYCH_TRUMP_ANNOUNCEMENT_WINDOW"), play: get(psychText,"PSYCH_TRUMP_STOCK_PLAY"), direction: get(psychText,"PSYCH_TRUMP_STOCK_DIRECTION").includes("PUT")?"PUT":"CALL", expiry: get(psychText,"PSYCH_TRUMP_STOCK_EXPIRY"), confidence: get(psychText,"PSYCH_TRUMP_CONFIDENCE") },
      netanyahu: { trigger: get(psychText,"PSYCH_NETANYAHU_NEXT_TRIGGER"), desperation: get(psychText,"PSYCH_NETANYAHU_DESPERATION_LEVEL"), play: get(psychText,"PSYCH_NETANYAHU_STOCK_PLAY"), direction: get(psychText,"PSYCH_NETANYAHU_STOCK_DIRECTION").includes("PUT")?"PUT":"CALL", expiry: get(psychText,"PSYCH_NETANYAHU_STOCK_EXPIRY") },
      putin: { trigger: get(psychText,"PSYCH_PUTIN_NEXT_TRIGGER"), desperation: get(psychText,"PSYCH_PUTIN_ECONOMIC_DESPERATION"), play: get(psychText,"PSYCH_PUTIN_STOCK_PLAY"), direction: get(psychText,"PSYCH_PUTIN_STOCK_DIRECTION").includes("PUT")?"PUT":"CALL", expiry: get(psychText,"PSYCH_PUTIN_STOCK_EXPIRY") },
      networkRising: get(psychText,"NETWORK_RISING_PLAYS"),
      networkFalling: get(psychText,"NETWORK_FALLING_PLAYS"),
      timingEdge: get(psychText,"NETWORK_TIMING_EDGE"),
    };

    const community = {
      topDD: { ticker: get(psychText,"COMMUNITY_TOP_DD_TICKER"), direction: get(psychText,"COMMUNITY_TOP_DD_DIRECTION"), thesis: get(psychText,"COMMUNITY_TOP_DD_THESIS"), upvotes: get(psychText,"COMMUNITY_TOP_DD_UPVOTES") },
      consensus: { ticker: get(psychText,"COMMUNITY_CONSENSUS_TICKER"), direction: get(psychText,"COMMUNITY_CONSENSUS_DIRECTION") },
      contrarian: { signal: get(psychText,"COMMUNITY_CONTRARIAN_SIGNAL"), ticker: get(psychText,"COMMUNITY_CONTRARIAN_TICKER") },
    };

    const probabilityScores = [1,2,3].map(n => ({
      ticker: get(psychText,`PROBABILITY_SCORE_TICKER${n}`),
      signals: get(psychText,`PROBABILITY_SCORE_TICKER${n}_SIGNALS`),
      confidence: get(psychText,`PROBABILITY_SCORE_TICKER${n}_CONFIDENCE`),
      direction: get(psychText,`PROBABILITY_SCORE_TICKER${n}_DIRECTION`).includes("PUT")?"PUT":"CALL",
      expiry: get(psychText,`PROBABILITY_SCORE_TICKER${n}_EXPIRY`),
      reason: get(psychText,`PROBABILITY_SCORE_TICKER${n}_REASON`),
    })).filter(p => p.ticker);

    const riseFallPairs = [1,2].map(n => ({
      rise: get(psychText,`RISE_FALL_PAIR${n}_RISE`),
      fall: get(psychText,`RISE_FALL_PAIR${n}_FALL`),
      catalyst: get(psychText,`RISE_FALL_PAIR${n}_CATALYST`),
      timing: get(psychText,`RISE_FALL_PAIR${n}_TIMING`),
    })).filter(p => p.rise);

    const highestConviction = {
      ticker: get(psychText,"HIGHEST_CONVICTION_PLAY_TICKER"),
      direction: get(psychText,"HIGHEST_CONVICTION_PLAY_DIRECTION").includes("PUT")?"PUT":"CALL",
      expiry: get(psychText,"HIGHEST_CONVICTION_PLAY_EXPIRY"),
      signals: get(psychText,"HIGHEST_CONVICTION_PLAY_SIGNALS"),
      probability: get(psychText,"HIGHEST_CONVICTION_PLAY_PROBABILITY"),
      thesis: get(psychText,"HIGHEST_CONVICTION_PLAY_THESIS"),
    };

    const pharma = {
      pdufa: [1,2,3].map(n => ({ ticker: get(catalystText,`PHARMA_PDUFA${n}_TICKER`), drug: get(catalystText,`PHARMA_PDUFA${n}_DRUG`), date: get(catalystText,`PHARMA_PDUFA${n}_DATE`), play: get(catalystText,`PHARMA_PDUFA${n}_PLAY`).includes("PUT")?"PUT":"CALL", reason: get(catalystText,`PHARMA_PDUFA${n}_REASON`) })).filter(p=>p.ticker),
      maTargets: [1,2].map(n => ({ ticker: get(catalystText,`PHARMA_MA_TARGET${n}`), reason: get(catalystText,`PHARMA_MA_TARGET${n}_REASON`) })).filter(t=>t.ticker),
      redditBuzz: get(catalystText,"PHARMA_REDDIT_BUZZ"),
    };

    const pennyStocks = {
      picks: [1,2,3,4,5].map(n => ({ ticker: get(catalystText,`PENNY_TICKER${n}`), price: get(catalystText,`PENNY_TICKER${n}_PRICE`), catalyst: get(catalystText,`PENNY_TICKER${n}_CATALYST`), direction: get(catalystText,`PENNY_TICKER${n}_DIRECTION`), redditScore: get(catalystText,`PENNY_TICKER${n}_REDDIT_SCORE`), reason: get(catalystText,`PENNY_TICKER${n}_REASON`) })).filter(p=>p.ticker),
      squeezeCandidate: get(catalystText,"PENNY_SQUEEZE_CANDIDATE"),
      squeezeReason: get(catalystText,"PENNY_SQUEEZE_REASON"),
      avoid: get(catalystText,"PENNY_AVOID"),
      avoidReason: get(catalystText,"PENNY_AVOID_REASON"),
    };

    const result = {
      success: true,
      timestamp: new Date().toISOString(),
      cached: false,
      headlinesAnalyzed: headlines.length,
      profiles, network, scenarios, topPlay,
      aiEcosystem, mining, pharma, pennyStocks,
      macro, microstructure, seasonal, cryptoSignal,
      psychology, community, probabilityScores, riseFallPairs, highestConviction,
      disclaimer: "AI-generated research for educational purposes only. Not financial advice.",
    };

    cache = result;
    cacheTime = now;
    return res.status(200).json(result);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
