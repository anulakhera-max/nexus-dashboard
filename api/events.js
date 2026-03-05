// /api/events
// Returns LIVE global events from GDELT — updated every 15 minutes
// Falls back to seed data if GDELT is unavailable
//
// GET /api/events                    — all live events
// GET /api/events?severity=critical  — filter by severity
// GET /api/events?category=conflict  — filter by category
// GET /api/events?region=middleeast  — filter by region
// GET /api/events?status=true        — check cache status only

import { getLiveEvents, getCacheStatus } from "./gdelt.js";
import { corsHeaders, validateApiKey } from "./_shared.js";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    return res.status(200).set(corsHeaders).end();
  }

  if (!validateApiKey(req)) {
    return res.status(401).json({ error: "Unauthorized. Include x-nexus-key header." });
  }

  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));

  // Cache status check
  if (req.query.status === "true") {
    return res.status(200).json({ success: true, cache: getCacheStatus() });
  }

  try {
    const { severity, category, region } = req.query;
    const result = await getLiveEvents({ severity, category, region });

    const stats = {
      total: result.events.length,
      critical: result.events.filter(e => e.severity === "critical").length,
      high: result.events.filter(e => e.severity === "high").length,
      medium: result.events.filter(e => e.severity === "medium").length,
      byCategory: result.events.reduce((acc, e) => { acc[e.category] = (acc[e.category] || 0) + 1; return acc; }, {}),
      byRegion: result.events.reduce((acc, e) => { acc[e.region] = (acc[e.region] || 0) + 1; return acc; }, {}),
    };

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      source: result.source || "GDELT Global Event Database",
      cached: result.cached,
      lastUpdated: result.lastUpdated,
      nextRefresh: result.nextRefresh,
      refreshInterval: "15 minutes",
      stats,
      events: result.events,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
