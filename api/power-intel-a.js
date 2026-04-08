// /api/power-intel-a — Single Claude call for free tier (under 10s)
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

async function callClaude(prompt, maxTokens = 900) {
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
    signal: AbortSignal.timeout(25000),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content?.[0]?.text || "";
}

let cacheA = null;
let cacheTimeA = null;
const CACHE_TTL = 4 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { Object.entries(corsHeaders).forEach(([k,v]) => res.setHeader(k,v)); return res.status(200).end(); }
  Object.entries(corsHeaders).forEach(([k,v]) => res.setHeader(k,v));
  if (!validateApiKey(req)) return res.status(401).json({ error: "Unauthorized." });

  const force = req.query.force === "true";
  const now = Date.now();
  if (cacheA && cacheTimeA && (now - cacheTimeA) < CACHE_TTL && !force) {
    return res.status(200).json({ ...cacheA, cached: true });
  }

  try {
    const today = new Date().toLocaleDateString("en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    const text = await callClaude(
      "You are NEXUS Power Intel. Today is " + today + ".\n\n" +
      "CONTEXT: Trump tariffs escalating, Israel-Iran tensions, Fed holding, Burry bearish AI (NVDA/PLTR puts), Buffett bullish real assets (NUE/LEN/DHI).\n\n" +
      "Fill EXACTLY — no commentary:\n\n" +
      "TRUMP_CORE_DRIVER=\nTRUMP_NEXT_MOVE=\nTRUMP_MARKET_SIGNAL=BULLISH or BEARISH or MIXED\nTRUMP_SIGNAL_REASON=\n" +
      "NETANYAHU_CORE_DRIVER=\nNETANYAHU_NEXT_MOVE=\nNETANYAHU_MARKET_SIGNAL=BULLISH or BEARISH or MIXED\nNETANYAHU_SIGNAL_REASON=\n" +
      "PUTIN_CORE_DRIVER=\nPUTIN_NEXT_MOVE=\nPUTIN_MARKET_SIGNAL=BULLISH or BEARISH or MIXED\nPUTIN_SIGNAL_REASON=\n" +
      "XI_CORE_DRIVER=\nXI_NEXT_MOVE=\nXI_MARKET_SIGNAL=BULLISH or BEARISH or MIXED\nXI_SIGNAL_REASON=\n" +
      "KUSHNER_WATCH_SECTORS=\nTRUMP_FAMILY_WATCH=\n" +
      "NETWORK_CONNECTION1=\nNETWORK_CONNECTION2=\n" +
      "SCENARIO_A_NAME=\nSCENARIO_A_PROBABILITY=\nSCENARIO_A_TRIGGER=\nSCENARIO_A_WEEK1=\nSCENARIO_A_WEEK2=\nSCENARIO_A_WEEK3=\nSCENARIO_A_WEEK4=\n" +
      "SCENARIO_A_PLAY1_TICKER=\nSCENARIO_A_PLAY1_DIRECTION=CALL or PUT\nSCENARIO_A_PLAY1_EXPIRY=\nSCENARIO_A_PLAY1_REASON=\n" +
      "SCENARIO_A_PLAY2_TICKER=\nSCENARIO_A_PLAY2_DIRECTION=CALL or PUT\nSCENARIO_A_PLAY2_EXPIRY=\nSCENARIO_A_PLAY2_REASON=\n" +
      "SCENARIO_B_NAME=\nSCENARIO_B_PROBABILITY=\nSCENARIO_B_TRIGGER=\nSCENARIO_B_WEEK1=\nSCENARIO_B_WEEK2=\nSCENARIO_B_WEEK3=\nSCENARIO_B_WEEK4=\n" +
      "SCENARIO_B_PLAY1_TICKER=\nSCENARIO_B_PLAY1_DIRECTION=CALL or PUT\nSCENARIO_B_PLAY1_EXPIRY=\nSCENARIO_B_PLAY1_REASON=\n" +
      "SCENARIO_B_PLAY2_TICKER=\nSCENARIO_B_PLAY2_DIRECTION=CALL or PUT\nSCENARIO_B_PLAY2_EXPIRY=\nSCENARIO_B_PLAY2_REASON=\n" +
      "SCENARIO_C_NAME=\nSCENARIO_C_PROBABILITY=\nSCENARIO_C_TRIGGER=\nSCENARIO_C_WEEK1=\nSCENARIO_C_WEEK2=\nSCENARIO_C_WEEK3=\nSCENARIO_C_WEEK4=\n" +
      "SCENARIO_C_PLAY1_TICKER=\nSCENARIO_C_PLAY1_DIRECTION=CALL or PUT\nSCENARIO_C_PLAY1_EXPIRY=\nSCENARIO_C_PLAY1_REASON=\n" +
      "SCENARIO_C_PLAY2_TICKER=\nSCENARIO_C_PLAY2_DIRECTION=CALL or PUT\nSCENARIO_C_PLAY2_EXPIRY=\nSCENARIO_C_PLAY2_REASON=\n" +
      "TOP_PLAY_TICKER=\nTOP_PLAY_DIRECTION=CALL or PUT\nTOP_PLAY_EXPIRY=\nTOP_PLAY_CONFIDENCE=HIGH or MEDIUM\nTOP_PLAY_THESIS=\n" +
      "PSYCH_TRUMP_NEXT_TRIGGER=\nPSYCH_TRUMP_STOCK_PLAY=\nPSYCH_TRUMP_STOCK_DIRECTION=CALL or PUT\nPSYCH_TRUMP_STOCK_EXPIRY=\n" +
      "PSYCH_NETANYAHU_DESPERATION_LEVEL=LOW or MEDIUM or HIGH or CRITICAL\nPSYCH_NETANYAHU_STOCK_PLAY=\nPSYCH_NETANYAHU_STOCK_DIRECTION=CALL or PUT\n" +
      "PSYCH_PUTIN_ECONOMIC_DESPERATION=LOW or MEDIUM or HIGH or CRITICAL\nPSYCH_PUTIN_STOCK_PLAY=\nPSYCH_PUTIN_STOCK_DIRECTION=CALL or PUT\n" +
      "NETWORK_RISING_PLAYS=\nNETWORK_FALLING_PLAYS=\nNETWORK_TIMING_EDGE=\n" +
      "HIGHEST_CONVICTION_PLAY_TICKER=\nHIGHEST_CONVICTION_PLAY_DIRECTION=CALL or PUT\nHIGHEST_CONVICTION_PLAY_EXPIRY=\nHIGHEST_CONVICTION_PLAY_PROBABILITY=\nHIGHEST_CONVICTION_PLAY_THESIS=",
      1200
    );

    const g = (key) => { const m = text.match(new RegExp(key + "=([^\n]+")); return m ? m[1].trim() : ""; };

    const parseScenario = (L) => ({
      name: g("SCENARIO_" + L + "_NAME"), probability: g("SCENARIO_" + L + "_PROBABILITY"),
      trigger: g("SCENARIO_" + L + "_TRIGGER"),
      weeks: [1,2,3,4].map(w => g("SCENARIO_" + L + "_WEEK" + w)),
      plays: [1,2].map(n => ({
        ticker: g("SCENARIO_" + L + "_PLAY" + n + "_TICKER"),
        direction: g("SCENARIO_" + L + "_PLAY" + n + "_DIRECTION").includes("PUT") ? "PUT" : "CALL",
        expiry: g("SCENARIO_" + L + "_PLAY" + n + "_EXPIRY"),
        reason: g("SCENARIO_" + L + "_PLAY" + n + "_REASON"),
      })).filter(p => p.ticker),
    });

    const result = {
      success: true, part: "A", timestamp: new Date().toISOString(), cached: false,
      profiles: {
        trump: { coreDriver: g("TRUMP_CORE_DRIVER"), nextMove: g("TRUMP_NEXT_MOVE"), marketSignal: g("TRUMP_MARKET_SIGNAL"), signalReason: g("TRUMP_SIGNAL_REASON") },
        netanyahu: { coreDriver: g("NETANYAHU_CORE_DRIVER"), nextMove: g("NETANYAHU_NEXT_MOVE"), marketSignal: g("NETANYAHU_MARKET_SIGNAL"), signalReason: g("NETANYAHU_SIGNAL_REASON") },
        putin: { coreDriver: g("PUTIN_CORE_DRIVER"), nextMove: g("PUTIN_NEXT_MOVE"), marketSignal: g("PUTIN_MARKET_SIGNAL"), signalReason: g("PUTIN_SIGNAL_REASON") },
        xi: { coreDriver: g("XI_CORE_DRIVER"), nextMove: g("XI_NEXT_MOVE"), marketSignal: g("XI_MARKET_SIGNAL"), signalReason: g("XI_SIGNAL_REASON") },
        kushner: { watchSectors: g("KUSHNER_WATCH_SECTORS") },
        trumpFamily: { watchList: g("TRUMP_FAMILY_WATCH") },
      },
      network: {
        connections: [g("NETWORK_CONNECTION1"), g("NETWORK_CONNECTION2")].filter(Boolean),
        iranWarThesis: "", russiaSanctionsThesis: "", netanyahuSurvivalThesis: "",
      },
      scenarios: ["A","B","C"].map(parseScenario),
      topPlay: {
        ticker: g("TOP_PLAY_TICKER"),
        direction: g("TOP_PLAY_DIRECTION").includes("PUT") ? "PUT" : "CALL",
        expiry: g("TOP_PLAY_EXPIRY"),
        confidence: g("TOP_PLAY_CONFIDENCE"),
        thesis: g("TOP_PLAY_THESIS"),
      },
      psychology: {
        trump: { trigger: g("PSYCH_TRUMP_NEXT_TRIGGER"), play: g("PSYCH_TRUMP_STOCK_PLAY"), direction: g("PSYCH_TRUMP_STOCK_DIRECTION").includes("PUT") ? "PUT" : "CALL", expiry: g("PSYCH_TRUMP_STOCK_EXPIRY") },
        netanyahu: { desperation: g("PSYCH_NETANYAHU_DESPERATION_LEVEL"), play: g("PSYCH_NETANYAHU_STOCK_PLAY"), direction: g("PSYCH_NETANYAHU_STOCK_DIRECTION").includes("PUT") ? "PUT" : "CALL" },
        putin: { desperation: g("PSYCH_PUTIN_ECONOMIC_DESPERATION"), play: g("PSYCH_PUTIN_STOCK_PLAY"), direction: g("PSYCH_PUTIN_STOCK_DIRECTION").includes("PUT") ? "PUT" : "CALL" },
        networkRising: g("NETWORK_RISING_PLAYS"),
        networkFalling: g("NETWORK_FALLING_PLAYS"),
        timingEdge: g("NETWORK_TIMING_EDGE"),
      },
      community: { topDD: { ticker: "", direction: "", thesis: "", upvotes: "" }, consensus: { ticker: "", direction: "" }, contrarian: { signal: "", ticker: "" } },
      probabilityScores: [],
      riseFallPairs: [],
      highestConviction: {
        ticker: g("HIGHEST_CONVICTION_PLAY_TICKER"),
        direction: g("HIGHEST_CONVICTION_PLAY_DIRECTION").includes("PUT") ? "PUT" : "CALL",
        expiry: g("HIGHEST_CONVICTION_PLAY_EXPIRY"),
        probability: g("HIGHEST_CONVICTION_PLAY_PROBABILITY"),
        thesis: g("HIGHEST_CONVICTION_PLAY_THESIS"),
      },
    };

    cacheA = result; cacheTimeA = now;
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
