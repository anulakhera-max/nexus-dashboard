// /api/predict
// Returns commodity price predictions based on active global events
// Axl calls this to get forward-looking price intelligence
//
// GET /api/predict                        — all commodity predictions
// GET /api/predict?commodity=wheat        — specific commodity
// GET /api/predict?direction=up           — only rising commodities
// GET /api/predict?region=middleeast      — commodities affected by region

import { NEXUS_EVENTS, callClaude, parseJSON, corsHeaders, validateApiKey } from "./_shared.js";

let cachedPredictions = null;
let cacheDate = null;

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    return res.status(200).set(corsHeaders).end();
  }

  if (!validateApiKey(req)) {
    return res.status(401).json({ error: "Unauthorized. Include x-nexus-key header." });
  }

  try {
    Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));

    const today = new Date().toDateString();
    const force = req.query.force === "true";
    const { commodity, direction, region } = req.query;

    // Use cache if same day
    if (!cachedPredictions || cacheDate !== today || force) {
      const eventsCtx = NEXUS_EVENTS
        .slice(0, 10)
        .map(e => `[${e.severity.toUpperCase()}] ${e.title} (${e.location}): ${e.commodities.join(", ")}`)
        .join("\n");

      const prompt = `You are NEXUS, a global commodity intelligence AI. Based on these active world events:

${eventsCtx}

Generate comprehensive commodity price predictions. Return ONLY JSON:
{
  "summary": {
    "topRisingCommodity": "name",
    "topFallingCommodity": "name",
    "priceIndex": 72,
    "mostAtRiskRegion": "region",
    "overallMarketSentiment": "bullish|bearish|mixed"
  },
  "predictions": [
    {
      "commodity": "name",
      "category": "energy|metals|agriculture|chemicals|shipping",
      "direction": "up|down|neutral",
      "change30d": "+X%",
      "change90d": "+X%",
      "confidence": "high|medium|low",
      "currentPressure": "high|medium|low",
      "primaryDriver": "brief driver",
      "drivingEvent": "which NEXUS event causes this",
      "sourceCountries": ["Country (share%)"],
      "alternativeSources": ["Country"],
      "affectedRegions": ["region"],
      "affectedSectors": ["sector"],
      "peakRiskDate": "date or timeframe"
    }
  ]
}

Include 15 commodities covering: crude oil, natural gas, wheat, corn, soybeans, copper, iron ore, gold, lithium, shipping rates, aluminum, rice, coal, rare earths, lumber. Be specific with percentages.`;

      const text = await callClaude(prompt, 1100);
      const parsed = parseJSON(text);
      if (!parsed || !parsed.predictions) throw new Error("Failed to generate predictions.");

      cachedPredictions = parsed;
      cacheDate = today;
    }

    let predictions = [...(cachedPredictions.predictions || [])];

    // Apply filters
    if (commodity) {
      predictions = predictions.filter(p =>
        p.commodity.toLowerCase().includes(commodity.toLowerCase())
      );
    }
    if (direction) {
      predictions = predictions.filter(p => p.direction === direction);
    }
    if (region) {
      predictions = predictions.filter(p =>
        p.affectedRegions?.some(r => r.toLowerCase().includes(region.toLowerCase()))
      );
    }

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      generatedAt: cacheDate,
      filters: { commodity: commodity || null, direction: direction || null, region: region || null },
      summary: cachedPredictions.summary,
      totalPredictions: predictions.length,
      predictions,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
