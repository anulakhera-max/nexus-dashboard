// /api/intelligence
// Multi-source market intelligence engine
// Scrapes CNBC, WSJ, Reddit, tracks whales, earnings, sentiment
// Identifies stocks/commodities likely to move 9%+ or -9% in either direction
//
// GET /api/intelligence — full intelligence report
// GET /api/intelligence?force=true — force refresh

import { callClaude, corsHeaders, validateApiKey, getUpcomingFridays } from "./_shared.js";

// ── Cache ─────────────────────────────────────────────────────
let cache = null;
let cacheTime = null;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// ── Get next 4 Fridays ────────────────────────────────────────
function getNext4Fridays() {
  const fridays = [];
  const now = new Date();
  const day = now.getDay();
  const daysToFriday = day === 5 ? 7 : (5 - day + 7) % 7 || 7;
  for (let i = 0; i < 4; i++) {
    const f = new Date(now);
    f.setDate(now.getDate() + daysToFriday + (i * 7));
    fridays.push(f.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }));
  }
  return fridays;
}

// ── Fetch RSS/news from public sources ───────────────────────
async function fetchNewsSource(url, sourceName) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "NEXUS-Intelligence/1.0" },
      signal: AbortSignal.timeout(6000),
    });
    const text = await res.text();
    // Extract titles from RSS XML
    const titles = [];
    const matches = text.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/gi);
    for (const m of matches) {
      const title = (m[1] || m[2] || "").trim();
      if (title && title.length > 20 && !title.toLowerCase().includes("rss")) {
        titles.push(title);
      }
    }
    return titles.slice(0, 8).map(t => `[${sourceName}] ${t}`);
  } catch { return []; }
}

// ── Fetch Reddit via public JSON API ─────────────────────────
async function fetchReddit(subreddit, limit = 10) {
  try {
    const url = `https://www.reddit.com/r/${subreddit}/hot.json?limit=${limit}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "NEXUS-Intelligence/1.0" },
      signal: AbortSignal.timeout(6000),
    });
    const data = await res.json();
    return (data?.data?.children || [])
      .map(p => `[r/${subreddit}] ${p.data.title} (score:${p.data.score}, comments:${p.data.num_comments})`)
      .filter(t => t.length > 30);
  } catch { return []; }
}

// ── Fetch SEC 13F filings for whale tracking ─────────────────
async function fetchWhaleActivity() {
  try {
    // SEC EDGAR full-text search for recent 13F filings
    const url = "https://efts.sec.gov/LATEST/search-index?q=%2213F%22&dateRange=custom&startdt=" +
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] +
      "&enddt=" + new Date().toISOString().split("T")[0] +
      "&forms=13F-HR";
    const res = await fetch(url, {
      headers: { "User-Agent": "NEXUS/1.0 contact@nexus.ai" },
      signal: AbortSignal.timeout(6000),
    });
    const data = await res.json();
    const filings = (data?.hits?.hits || []).slice(0, 5)
      .map(h => `[SEC 13F] ${h._source?.entity_name || "Unknown"} filed position update`);
    return filings;
  } catch { return ["[SEC] 13F filing data temporarily unavailable"]; }
}

// ── Fetch earnings calendar from public source ────────────────
async function fetchEarningsCalendar() {
  try {
    // Use Alpha Vantage free earnings calendar (no key needed for this endpoint)
    const url = "https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&horizon=3month&apikey=demo";
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const text = await res.text();
    // Parse CSV response
    const lines = text.split("\n").slice(1, 15); // skip header, get next 14
    return lines
      .filter(l => l.trim())
      .map(l => {
        const [symbol, name, date, , estimate] = l.split(",");
        return `[EARNINGS] ${symbol} (${name?.trim()}) reports ${date?.trim()} — EPS est: ${estimate?.trim() || "N/A"}`;
      })
      .filter(l => l.includes("EARNINGS] ") && l.length > 30);
  } catch { return []; }
}

// ── Main intelligence gathering ───────────────────────────────
async function gatherIntelligence() {
  const [
    cnbc, wsj, reddit_wsb, reddit_investing, reddit_options,
    whales, earnings,
  ] = await Promise.allSettled([
    fetchNewsSource("https://feeds.nbcnews.com/nbcnews/public/business", "CNBC"),
    fetchNewsSource("https://feeds.a.dj.com/rss/RSSMarketsMain.xml", "WSJ"),
    fetchReddit("wallstreetbets", 15),
    fetchReddit("investing", 10),
    fetchReddit("options", 10),
    fetchWhaleActivity(),
    fetchEarningsCalendar(),
  ]);

  const allHeadlines = [
    ...(cnbc.value || []),
    ...(wsj.value || []),
    ...(reddit_wsb.value || []),
    ...(reddit_investing.value || []),
    ...(reddit_options.value || []),
    ...(whales.value || []),
    ...(earnings.value || []),
  ];

  return allHeadlines;
}

// ── Main handler ──────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    return res.status(200).set(corsHeaders).end();
  }
  if (!validateApiKey(req)) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));

  const force = req.query.force === "true";
  const now = Date.now();

  if (cache && cacheTime && (now - cacheTime) < CACHE_TTL && !force) {
    return res.status(200).json({ ...cache, cached: true });
  }

  try {
    const fridays = getNext4Fridays();
    const headlines = await gatherIntelligence();
    const headlineText = headlines.slice(0, 60).join("\n");

    const today = new Date().toLocaleDateString("en-CA", {
      weekday: "long", year: "numeric", month: "long", day: "numeric"
    });

    const prompt = `You are NEXUS, an elite quantitative options intelligence AI. Today is ${today}.

You have access to the following live market intelligence gathered right now:

${headlineText}

KEY WHALE TARGETS TO MONITOR:
- Michael Burry (Scion Asset Management) — known for massive contrarian bets, 13F filings
- Michael Saylor (MicroStrategy/MSTR) — Bitcoin maximalist, major BTC holder
- Cathie Wood (ARK Invest) — daily buy/sell disclosures, disruptive tech focus
- Warren Buffett (Berkshire) — large position changes signal major moves
- Ryan Cohen — activist investor, targets struggling retailers

AVAILABLE EXPIRY DATES: ${fridays.join(", ")}
Choose the best expiry for each pick — can be any of these 4 Fridays.
Use a longer expiry (3-4 weeks) when the catalyst needs time to play out.
Use a shorter expiry (1-2 weeks) when the move is imminent.

TASK: Identify exactly 5 stocks OR commodities most likely to move +9% OR -9% (in either direction) based on:
1. News catalysts from the headlines above
2. Reddit retail sentiment and unusual activity
3. Upcoming earnings that historically cause 9%+ moves
4. Whale position changes or announcements
5. Market anomalies, unusual options flow, or sentiment extremes
6. Technical breakout or breakdown setups
7. Macro events (Fed, CPI, geopolitical) impacting specific sectors

UNIVERSE: NYSE, NASDAQ, TSX stocks + Gold (GLD/GC), Oil (USO/CL), Natural Gas (UNG)

For each pick fill in this EXACT template. No other text before or after.

PICK1_TICKER=
PICK1_NAME=
PICK1_EXCHANGE=
PICK1_DIRECTION=CALL or PUT
PICK1_EXPIRY=
PICK1_MOVE=estimated % move e.g. +12% or -15%
PICK1_CATALYST=primary reason in one line
PICK1_SOURCE=where signal came from e.g. Reddit WSB / Earnings / Whale / News
PICK1_CONFIDENCE=HIGH or MEDIUM
PICK1_URGENCY=THIS WEEK or NEXT WEEK or 2-4 WEEKS

PICK2_TICKER=
PICK2_NAME=
PICK2_EXCHANGE=
PICK2_DIRECTION=CALL or PUT
PICK2_EXPIRY=
PICK2_MOVE=
PICK2_CATALYST=
PICK2_SOURCE=
PICK2_CONFIDENCE=HIGH or MEDIUM
PICK2_URGENCY=THIS WEEK or NEXT WEEK or 2-4 WEEKS

PICK3_TICKER=
PICK3_NAME=
PICK3_EXCHANGE=
PICK3_DIRECTION=CALL or PUT
PICK3_EXPIRY=
PICK3_MOVE=
PICK3_CATALYST=
PICK3_SOURCE=
PICK3_CONFIDENCE=HIGH or MEDIUM
PICK3_URGENCY=THIS WEEK or NEXT WEEK or 2-4 WEEKS

PICK4_TICKER=
PICK4_NAME=
PICK4_EXCHANGE=
PICK4_DIRECTION=CALL or PUT
PICK4_EXPIRY=
PICK4_MOVE=
PICK4_CATALYST=
PICK4_SOURCE=
PICK4_CONFIDENCE=HIGH or MEDIUM
PICK4_URGENCY=THIS WEEK or NEXT WEEK or 2-4 WEEKS

PICK5_TICKER=
PICK5_NAME=
PICK5_EXCHANGE=
PICK5_DIRECTION=CALL or PUT
PICK5_EXPIRY=
PICK5_MOVE=
PICK5_CATALYST=
PICK5_SOURCE=
PICK5_CONFIDENCE=HIGH or MEDIUM
PICK5_URGENCY=THIS WEEK or NEXT WEEK or 2-4 WEEKS`;

    const text = await callClaude(prompt, 1400);

    // Parse template response
    const picks = [];
    for (let i = 1; i <= 5; i++) {
      const get = (key) => {
        const match = text.match(new RegExp(`PICK${i}_${key}=(.+)`));
        return match ? match[1].trim() : "";
      };
      const ticker = get("TICKER");
      if (!ticker) continue;
      picks.push({
        rank: i,
        ticker,
        name: get("NAME"),
        exchange: get("EXCHANGE"),
        direction: get("DIRECTION").includes("PUT") ? "PUT" : "CALL",
        expiry: get("EXPIRY"),
        estimatedMove: get("MOVE"),
        catalyst: get("CATALYST"),
        source: get("SOURCE"),
        confidence: get("CONFIDENCE"),
        urgency: get("URGENCY"),
      });
    }

    const result = {
      success: true,
      timestamp: new Date().toISOString(),
      cached: false,
      availableExpiries: fridays,
      sourcesMonitored: ["CNBC", "WSJ", "r/wallstreetbets", "r/investing", "r/options", "SEC 13F", "Earnings Calendar"],
      whalesTracked: ["Michael Burry", "Michael Saylor", "Cathie Wood", "Warren Buffett", "Ryan Cohen"],
      headlinesAnalyzed: headlines.length,
      picks,
      disclaimer: "AI-generated research for educational purposes only. Not financial advice.",
    };

    cache = result;
    cacheTime = now;

    return res.status(200).json(result);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
