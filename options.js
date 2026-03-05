// /api/options
// Returns today's aggressive options picks for Questrade
// Axl calls this each morning to get the daily picks
//
// GET /api/options             — get today's picks (generates fresh if new day)
// GET /api/options?force=true  — force regenerate regardless of cache

import { NEXUS_EVENTS, callClaude, parseJSON, getUpcomingFridays, corsHeaders, validateApiKey } from "./_shared.js";

// In-memory cache (resets on cold start, good enough for daily picks)
let cachedPicks = null;
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

    // Return cached picks if same day and not forced
    if (cachedPicks && cacheDate === today && !force) {
      return res.status(200).json({
        success: true,
        timestamp: new Date().toISOString(),
        cached: true,
        generatedAt: cacheDate,
        picks: cachedPicks,
      });
    }

    const fridays = getUpcomingFridays();
    const evCtx = NEXUS_EVENTS
      .filter(e => ["critical", "high"].includes(e.severity))
      .slice(0, 8)
      .map(e => `[${e.category.toUpperCase()}] ${e.title} (${e.location}): ${e.summary} — affects: ${e.commodities.join(", ")}`)
      .join("\n");

    const todayStr = new Date().toLocaleDateString("en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    const prompt = `You are an aggressive options trading AI for a Canadian Questrade trader. Today is ${todayStr}.

Active high-impact global events:
${evCtx}

Generate exactly 5 aggressive, event-driven options picks for stocks on NYSE, NASDAQ, or TSX. Prioritize maximum return potential.

Rules:
- Aggressive OTM or ATM options with high leverage
- Expiry: ${fridays.first} OR ${fridays.second} at 3:30 PM ET
- Mix calls AND puts based on event direction
- Only liquid well-known tickers available on Questrade
- Each pick directly driven by one listed event
- Target 100-500%+ return potential
- Include at least 1 TSX stock
- Rank by highest expected return

Return ONLY valid JSON array:
[{"rank":1,"ticker":"SYMBOL","companyName":"Full Name","exchange":"NYSE|NASDAQ|TSX","sector":"Sector","type":"CALL|PUT","strike":"$XXX","expiry":"${fridays.first} or ${fridays.second}","premium":"$X.XX-$X.XX","targetReturn":"+XXX%","catalystDate":"Date or Ongoing","confidence":"HIGH|MEDIUM|LOW","thesis":"2-3 sentence explanation","eventTrigger":"Which event and how it drives this trade","riskNote":"Main risk in one sentence"}]`;

    const text = await callClaude(prompt, 1200);
    const picks = parseJSON(text);

    if (!Array.isArray(picks) || picks.length === 0) {
      throw new Error("Failed to generate valid picks. Try again.");
    }

    // Cache the result
    cachedPicks = picks;
    cacheDate = today;

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      cached: false,
      generatedAt: today,
      expiryDates: fridays,
      closingTime: "3:30 PM ET",
      markets: ["NYSE", "NASDAQ", "TSX"],
      riskProfile: "Aggressive",
      disclaimer: "AI-generated picks for educational purposes only. Not financial advice. Options trading involves risk of total loss.",
      picks,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
