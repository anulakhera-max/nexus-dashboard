// /api/power-intel-b — Single Claude call for free tier (under 10s)
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

let cacheB = null;
let cacheTimeB = null;
const CACHE_TTL = 4 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { Object.entries(corsHeaders).forEach(([k,v]) => res.setHeader(k,v)); return res.status(200).end(); }
  Object.entries(corsHeaders).forEach(([k,v]) => res.setHeader(k,v));
  if (!validateApiKey(req)) return res.status(401).json({ error: "Unauthorized." });

  const force = req.query.force === "true";
  const now = Date.now();
  if (cacheB && cacheTimeB && (now - cacheTimeB) < CACHE_TTL && !force) {
    return res.status(200).json({ ...cacheB, cached: true });
  }

  try {
    const today = new Date().toLocaleDateString("en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    const text = await callClaude(
      "You are NEXUS Market Intelligence. Today is " + today + ".\n\n" +
      "CONTEXT: AI capex boom (NVDA/AMD leading), gold at highs, copper bullish (AI data centers), tariffs disrupting supply chains, Fed holding rates.\n\n" +
      "Fill EXACTLY — no commentary:\n\n" +
      "AI_HARDWARE_WINNER1=\nAI_HARDWARE_WINNER1_REASON=\nAI_HARDWARE_WINNER2=\nAI_HARDWARE_WINNER2_REASON=\n" +
      "AI_HARDWARE_LOSER1=\nAI_HARDWARE_LOSER1_REASON=\n" +
      "AI_ENERGY_WINNER1=\nAI_ENERGY_WINNER1_REASON=\nAI_ENERGY_WINNER2=\nAI_ENERGY_WINNER2_REASON=\n" +
      "AI_TOP_CALL_TICKER=\nAI_TOP_CALL_EXPIRY=\nAI_TOP_PUT_TICKER=\nAI_TOP_PUT_EXPIRY=\n" +
      "MINING_GOLD_OUTLOOK=BULLISH or BEARISH\nMINING_GOLD_DRIVER=\n" +
      "MINING_SILVER_OUTLOOK=BULLISH or BEARISH\nMINING_SILVER_DRIVER=\n" +
      "MINING_COPPER_OUTLOOK=BULLISH or BEARISH\nMINING_COPPER_DRIVER=\n" +
      "MINING_URANIUM_OUTLOOK=BULLISH or BEARISH\nMINING_URANIUM_DRIVER=\n" +
      "MINING_LITHIUM_OUTLOOK=BULLISH or BEARISH\nMINING_LITHIUM_DRIVER=\n" +
      "MINING_HOT_TICKER1=\nMINING_HOT_TICKER1_REASON=\nMINING_HOT_TICKER1_DIRECTION=CALL or PUT\nMINING_HOT_TICKER1_EXPIRY=\n" +
      "MINING_HOT_TICKER2=\nMINING_HOT_TICKER2_REASON=\nMINING_HOT_TICKER2_DIRECTION=CALL or PUT\nMINING_HOT_TICKER2_EXPIRY=\n" +
      "MACRO_FED_SIGNAL=HAWKISH or DOVISH or NEUTRAL\nMACRO_FED_REASON=\nMACRO_NEXT_EVENT=\nMACRO_NEXT_EVENT_DATE=\nMACRO_MARKET_IMPACT=\n" +
      "MACRO_RATE_TRADE=CALL or PUT\nMACRO_RATE_TICKER=\nMACRO_RATE_EXPIRY=\n" +
      "CRYPTO_BTC_SIGNAL=BULLISH or BEARISH or NEUTRAL\nCRYPTO_BTC_REASON=\nCRYPTO_EQUITY_IMPACT=\nCRYPTO_PLAY_TICKER=\nCRYPTO_PLAY_DIRECTION=CALL or PUT\nCRYPTO_PLAY_EXPIRY=\n" +
      "PHARMA_PDUFA1_TICKER=\nPHARMA_PDUFA1_DRUG=\nPHARMA_PDUFA1_DATE=\nPHARMA_PDUFA1_PLAY=CALL or PUT\nPHARMA_PDUFA1_REASON=\n" +
      "PENNY_TICKER1=\nPENNY_TICKER1_CATALYST=\nPENNY_TICKER1_DIRECTION=CALL or PUT or STOCK\nPENNY_TICKER1_REASON=\n" +
      "PENNY_TICKER2=\nPENNY_TICKER2_CATALYST=\nPENNY_TICKER2_DIRECTION=CALL or PUT or STOCK\nPENNY_TICKER2_REASON=\n" +
      "PENNY_TICKER3=\nPENNY_TICKER3_CATALYST=\nPENNY_TICKER3_DIRECTION=CALL or PUT or STOCK\nPENNY_TICKER3_REASON=",
      1000
    );

    const g = (key) => { const m = text.match(new RegExp(key + "=([^\n]+")); return m ? m[1].trim() : ""; };

    const result = {
      success: true, part: "B", timestamp: new Date().toISOString(), cached: false,
      aiEcosystem: {
        hardwareWinners: [1,2].map(n => ({ ticker: g("AI_HARDWARE_WINNER" + n), reason: g("AI_HARDWARE_WINNER" + n + "_REASON") })).filter(h => h.ticker),
        hardwareLosers: [{ ticker: g("AI_HARDWARE_LOSER1"), reason: g("AI_HARDWARE_LOSER1_REASON") }].filter(h => h.ticker),
        energyPlays: [1,2].map(n => ({ ticker: g("AI_ENERGY_WINNER" + n), reason: g("AI_ENERGY_WINNER" + n + "_REASON") })).filter(e => e.ticker),
        mineralPlays: [], datacenterPlay: {}, ma: {}, inversePairs: [], historicalPattern: "",
        topCall: { ticker: g("AI_TOP_CALL_TICKER"), expiry: g("AI_TOP_CALL_EXPIRY") },
        topPut: { ticker: g("AI_TOP_PUT_TICKER"), expiry: g("AI_TOP_PUT_EXPIRY") },
      },
      mining: {
        outlooks: ["Gold","Silver","Copper","Uranium","Lithium"].map(m => ({
          metal: m, outlook: g("MINING_" + m.toUpperCase() + "_OUTLOOK"), driver: g("MINING_" + m.toUpperCase() + "_DRIVER")
        })),
        hotPicks: [1,2].map(n => ({
          ticker: g("MINING_HOT_TICKER" + n), reason: g("MINING_HOT_TICKER" + n + "_REASON"),
          direction: g("MINING_HOT_TICKER" + n + "_DIRECTION").includes("PUT") ? "PUT" : "CALL",
          expiry: g("MINING_HOT_TICKER" + n + "_EXPIRY"),
        })).filter(p => p.ticker),
        maTarget: "", maReason: "", redditBuzz: "",
      },
      macro: {
        fedSignal: g("MACRO_FED_SIGNAL"), fedReason: g("MACRO_FED_REASON"),
        nextEvent: g("MACRO_NEXT_EVENT"), nextEventDate: g("MACRO_NEXT_EVENT_DATE"),
        marketImpact: g("MACRO_MARKET_IMPACT"),
        rateTrade: { direction: g("MACRO_RATE_TRADE").includes("PUT") ? "PUT" : "CALL", ticker: g("MACRO_RATE_TICKER"), expiry: g("MACRO_RATE_EXPIRY") },
      },
      cryptoSignal: {
        btcSignal: g("CRYPTO_BTC_SIGNAL"), btcReason: g("CRYPTO_BTC_REASON"),
        equityImpact: g("CRYPTO_EQUITY_IMPACT"),
        play: { ticker: g("CRYPTO_PLAY_TICKER"), direction: g("CRYPTO_PLAY_DIRECTION").includes("PUT") ? "PUT" : "CALL", expiry: g("CRYPTO_PLAY_EXPIRY") },
      },
      pharma: {
        pdufa: [{ ticker: g("PHARMA_PDUFA1_TICKER"), drug: g("PHARMA_PDUFA1_DRUG"), date: g("PHARMA_PDUFA1_DATE"), play: g("PHARMA_PDUFA1_PLAY").includes("PUT") ? "PUT" : "CALL", reason: g("PHARMA_PDUFA1_REASON") }].filter(p => p.ticker),
        maTargets: [], redditBuzz: "",
      },
      pennyStocks: {
        picks: [1,2,3].map(n => ({
          ticker: g("PENNY_TICKER" + n), catalyst: g("PENNY_TICKER" + n + "_CATALYST"),
          direction: g("PENNY_TICKER" + n + "_DIRECTION"), reason: g("PENNY_TICKER" + n + "_REASON"),
        })).filter(p => p.ticker),
        squeezeCandidate: "", squeezeReason: "", avoid: "", avoidReason: "",
      },
      microstructure: { pcRatio: "", pcSignal: "", squeezeTicker: "", squeezeReason: "", insiderSignal: "", insiderTicker: "", insiderDirection: "", unusualOptions: "", optionsTicker: "", optionsDirection: "CALL" },
      seasonal: { pattern: "", trade: "", ticker: "", direction: "CALL", expiry: "", confidence: "" },
    };

    cacheB = result; cacheTimeB = now;
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
