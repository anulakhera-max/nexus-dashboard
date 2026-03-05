// /api/events
// Returns all active global events tracked by NEXUS
// Axl calls this to get situational awareness of current world events
//
// GET /api/events              — all events
// GET /api/events?severity=critical  — filter by severity
// GET /api/events?category=conflict  — filter by category
// GET /api/events?region=middleeast  — filter by region

import { NEXUS_EVENTS, corsHeaders, validateApiKey } from "./_shared.js";

export default function handler(req, res) {
  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.status(200).set(corsHeaders).end();
  }

  // Auth check
  if (!validateApiKey(req)) {
    return res.status(401).json({ error: "Unauthorized. Include x-nexus-key header." });
  }

  try {
    let events = [...NEXUS_EVENTS];

    // Apply filters from query params
    const { severity, category, region } = req.query;
    if (severity) events = events.filter(e => e.severity === severity);
    if (category) events = events.filter(e => e.category === category);
    if (region) events = events.filter(e => e.region === region);

    // Build summary stats
    const stats = {
      total: events.length,
      critical: events.filter(e => e.severity === "critical").length,
      high: events.filter(e => e.severity === "high").length,
      byCategory: events.reduce((acc, e) => { acc[e.category] = (acc[e.category] || 0) + 1; return acc; }, {}),
      byRegion: events.reduce((acc, e) => { acc[e.region] = (acc[e.region] || 0) + 1; return acc; }, {}),
    };

    Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      stats,
      events,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
