// gdelt.js — Real-time global events from GDELT
// GDELT monitors world news in 65 languages, updated every 15 minutes
// No API key needed — completely free

const GDELT_BASE = "https://api.gdeltproject.org/api/v2";

// Cache to avoid hammering GDELT (refreshes every 15 min)
let eventsCache = null;
let cacheTime = null;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// ── Keyword maps for categorization ──────────────────────────
const CATEGORY_KEYWORDS = {
  conflict: ["war", "attack", "missile", "military", "troops", "bombing", "fighting", "killed", "airstrike", "assault", "rebel", "ceasefire", "invasion", "combat", "weapons"],
  weather: ["hurricane", "earthquake", "flood", "drought", "wildfire", "typhoon", "storm", "tsunami", "cyclone", "tornado", "volcano", "disaster", "climate", "fire"],
  diplomatic: ["sanctions", "treaty", "summit", "negotiation", "diplomat", "ambassador", "tariff", "trade war", "alliance", "agreement", "talks", "bilateral", "G7", "G20", "NATO", "UN"],
  economic: ["recession", "inflation", "gdp", "market crash", "bank", "debt", "oil price", "supply chain", "shortage", "exports", "imports", "currency", "fed", "interest rate"],
  tech: ["semiconductor", "AI", "chip", "cyber", "hack", "data center", "5G", "quantum", "satellite", "SpaceX", "nvidia", "taiwan semiconductor"],
  health: ["outbreak", "epidemic", "pandemic", "virus", "disease", "WHO", "vaccine", "infection", "pathogen", "flu", "covid", "mpox"],
};

const SEVERITY_KEYWORDS = {
  critical: ["war", "invasion", "nuclear", "catastrophic", "emergency", "crisis", "collapse", "explosion", "massacre", "famine"],
  high: ["attack", "conflict", "sanctions", "shortage", "recession", "strike", "protest", "missile", "flooding", "wildfire"],
  medium: ["tension", "concern", "warning", "disruption", "decline", "slowdown", "dispute", "demonstration"],
};

// Commodity keywords — what each event affects
const COMMODITY_MAP = {
  conflict: ["Crude Oil", "Natural Gas", "Gold", "Shipping"],
  weather: ["Wheat", "Corn", "Soybeans", "Coffee", "Natural Gas"],
  diplomatic: ["Gold", "USD", "Oil", "Semiconductors"],
  economic: ["Crude Oil", "Copper", "Steel", "USD"],
  tech: ["Semiconductors", "Rare Earths", "Copper", "Lithium"],
  health: ["Poultry", "Pharmaceuticals", "Feed Grain", "PPE"],
};

const REGION_MAP = {
  "united states": "northamerica", "canada": "northamerica", "mexico": "northamerica",
  "russia": "europe", "ukraine": "europe", "germany": "europe", "france": "europe", "uk": "europe", "britain": "europe", "europe": "europe",
  "china": "asia", "japan": "asia", "india": "asia", "korea": "asia", "taiwan": "asia", "asia": "asia",
  "israel": "middleeast", "iran": "middleeast", "saudi": "middleeast", "iraq": "middleeast", "syria": "middleeast", "gaza": "middleeast", "yemen": "middleeast",
  "brazil": "latam", "argentina": "latam", "venezuela": "latam", "colombia": "latam",
  "nigeria": "africa", "ethiopia": "africa", "sudan": "africa", "congo": "africa", "south africa": "africa",
};

function categorize(text) {
  const lower = text.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) return cat;
  }
  return "economic"; // default
}

function getSeverity(text) {
  const lower = text.toLowerCase();
  for (const [sev, keywords] of Object.entries(SEVERITY_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) return sev;
  }
  return "medium";
}

function getRegion(text) {
  const lower = text.toLowerCase();
  for (const [place, region] of Object.entries(REGION_MAP)) {
    if (lower.includes(place)) return region;
  }
  return "global";
}

function getLocation(text) {
  // Extract likely location from title
  const regions = Object.keys(REGION_MAP);
  const lower = text.toLowerCase();
  for (const place of regions) {
    if (lower.includes(place)) {
      return place.charAt(0).toUpperCase() + place.slice(1);
    }
  }
  return "Global";
}

// ── Fetch from GDELT ──────────────────────────────────────────
async function fetchGDELT() {
  // GDELT GEO 2.0 API — top global news themes last 24 hours
  // Returns articles about conflict, economics, disasters etc.
  const queries = [
    // Conflicts and wars
    "war OR conflict OR military attack OR invasion",
    // Economic disruptions
    "oil price OR supply chain OR sanctions OR trade war OR recession",
    // Weather disasters
    "earthquake OR hurricane OR flood OR wildfire OR drought",
    // Diplomatic events
    "summit OR sanctions OR trade deal OR NATO OR UN Security Council",
    // Tech/supply
    "semiconductor shortage OR chip war OR cyber attack",
  ];

  const allArticles = [];

  for (const q of queries) {
    try {
      const encoded = encodeURIComponent(q);
      const url = `${GDELT_BASE}/doc/doc?query=${encoded}&mode=artlist&maxrecords=5&format=json&timespan=1d&sort=hybridrel`;

      const res = await fetch(url, {
        headers: { "User-Agent": "NEXUS-Intelligence/1.0" },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) continue;
      const data = await res.json();
      if (data.articles) allArticles.push(...data.articles);
    } catch {}
  }

  return allArticles;
}

// ── Convert GDELT articles to NEXUS events ────────────────────
function articlesToEvents(articles) {
  // Deduplicate by title similarity
  const seen = new Set();
  const events = [];
  let id = 1;

  for (const article of articles) {
    const title = article.title || "";
    if (!title || title.length < 20) continue;

    // Simple dedup — skip if very similar title seen
    const key = title.slice(0, 40).toLowerCase().replace(/[^a-z]/g, "");
    if (seen.has(key)) continue;
    seen.add(key);

    const category = categorize(title);
    const severity = getSeverity(title);
    const region = getRegion(title);
    const location = getLocation(title);
    const commodities = COMMODITY_MAP[category] || ["Commodities"];

    events.push({
      id: id++,
      category,
      severity,
      title: title.slice(0, 120),
      location,
      summary: article.seendescription || article.title || "Developing story. Check sources for latest updates.",
      commodities: commodities.slice(0, 4),
      region,
      source: article.domain || "GDELT",
      url: article.url || null,
      publishedAt: article.seendate || new Date().toISOString(),
      live: true,
    });

    if (events.length >= 20) break;
  }

  return events;
}

// ── Main export: get live events ──────────────────────────────
export async function getLiveEvents(filters = {}) {
  const now = Date.now();

  // Use cache if fresh
  if (eventsCache && cacheTime && (now - cacheTime) < CACHE_TTL) {
    let events = [...eventsCache];
    if (filters.severity) events = events.filter(e => e.severity === filters.severity);
    if (filters.category) events = events.filter(e => e.category === filters.category);
    if (filters.region)   events = events.filter(e => e.region === filters.region);
    return { events, cached: true, lastUpdated: new Date(cacheTime).toISOString() };
  }

  // Fetch fresh from GDELT
  try {
    const articles = await fetchGDELT();
    let events = articlesToEvents(articles);

    // If GDELT returns nothing useful, fall back to seed events
    if (events.length < 3) {
      console.warn("GDELT returned insufficient data, using seed events as fallback");
      const { NEXUS_EVENTS } = await import("./_shared.js");
      events = NEXUS_EVENTS;
    }

    // Sort by severity
    const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    events.sort((a, b) => (sevOrder[a.severity] || 3) - (sevOrder[b.severity] || 3));

    eventsCache = events;
    cacheTime = now;

    let filtered = [...events];
    if (filters.severity) filtered = filtered.filter(e => e.severity === filters.severity);
    if (filters.category) filtered = filtered.filter(e => e.category === filters.category);
    if (filters.region)   filtered = filtered.filter(e => e.region === filters.region);

    return {
      events: filtered,
      cached: false,
      lastUpdated: new Date().toISOString(),
      source: "GDELT Global Event Database",
      nextRefresh: new Date(now + CACHE_TTL).toISOString(),
    };

  } catch (err) {
    // Fallback to seed events if GDELT is down
    const { NEXUS_EVENTS } = await import("./_shared.js");
    return {
      events: NEXUS_EVENTS,
      cached: false,
      lastUpdated: new Date().toISOString(),
      source: "Seed data (GDELT unavailable)",
      error: err.message,
    };
  }
}

export function getCacheStatus() {
  return {
    hasCached: !!eventsCache,
    cacheAge: cacheTime ? Math.round((Date.now() - cacheTime) / 1000) + "s" : "none",
    eventCount: eventsCache?.length || 0,
    nextRefresh: cacheTime ? new Date(cacheTime + CACHE_TTL).toISOString() : "now",
  };
}
