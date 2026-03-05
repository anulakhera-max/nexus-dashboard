// /api/analyze
// Axl sends a query, NEXUS returns a full AI intelligence brief
//
// POST /api/analyze
// Body: { "query": "What commodities will rise due to Red Sea tensions?" }
// Returns: { analysis: "...", sections: {...} }

import { NEXUS_EVENTS, callClaude, corsHeaders, validateApiKey } from "./_shared.js";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    return res.status(200).set(corsHeaders).end();
  }

  if (!validateApiKey(req)) {
    return res.status(401).json({ error: "Unauthorized. Include x-nexus-key header." });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const { query, eventId } = req.body || {};

  if (!query && !eventId) {
    return res.status(400).json({ error: "Provide either 'query' (string) or 'eventId' (number) in request body." });
  }

  try {
    Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));

    const eventsCtx = NEXUS_EVENTS
      .map(e => `[${e.category.toUpperCase()}/${e.severity.toUpperCase()}] ${e.title} (${e.location}): ${e.summary} — Commodities: ${e.commodities.join(", ")}`)
      .join("\n");

    let prompt;

    if (eventId) {
      // Analyze a specific event by ID
      const event = NEXUS_EVENTS.find(e => e.id === Number(eventId));
      if (!event) return res.status(404).json({ error: `Event ID ${eventId} not found.` });

      prompt = `You are NEXUS, a global intelligence AI. Analyze this world event for commodity and market impact:

Event: ${event.title}
Location: ${event.location}
Category: ${event.category} | Severity: ${event.severity}
Summary: ${event.summary}
Affected Commodities: ${event.commodities.join(", ")}

Provide analysis in JSON format:
{
  "intelBrief": "2-3 sentences on geopolitical significance with specific figures",
  "criticalShortages": [{"item": "name", "shortage": "X%", "reason": "why"}],
  "sourceAnalysis": [{"item": "name", "primaryCountries": ["Country (share%)"], "alternatives": ["Country"], "keyCompanies": ["Company"]}],
  "pricePredictions": [{"commodity": "name", "direction": "up|down", "change": "+X%", "confidence": "high|medium|low", "timeframe": "X days"}],
  "supplyChainRisk": "2-3 sentences on disruption cascade",
  "investmentImplications": "specific sectors/ETFs rising or falling"
}`;
    } else {
      // Free-form query
      prompt = `You are NEXUS, a global intelligence AI. Answer this query based on current world events:

QUERY: "${query}"

ACTIVE GLOBAL EVENTS:
${eventsCtx}

Respond in JSON format:
{
  "queryAnswer": "Direct answer to the query in 2-3 sentences",
  "keyFindings": ["finding 1", "finding 2", "finding 3"],
  "pricePredictions": [{"commodity": "name", "direction": "up|down", "change": "+X%", "confidence": "high|medium|low", "driver": "brief reason"}],
  "affectedRegions": ["region1", "region2"],
  "affectedSectors": ["sector1", "sector2"],
  "recommendedActions": ["action 1 for trader/analyst", "action 2"],
  "riskLevel": "critical|high|medium|low",
  "timeHorizon": "immediate|short-term|medium-term"
}`;
    }

    const text = await callClaude(prompt, 900);

    // Try to parse as JSON, fall back to raw text
    let parsed = null;
    try {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    } catch {}

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      query: query || `Event analysis: ID ${eventId}`,
      analysis: parsed || text,
      rawText: text,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
