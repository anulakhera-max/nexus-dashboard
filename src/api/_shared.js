// Shared data and utilities for all NEXUS API endpoints

export const NEXUS_EVENTS = [
  { id: 1, category: "conflict", severity: "critical", title: "Russia-Ukraine War — Ongoing Offensive Operations", location: "Eastern Ukraine / Black Sea Region", summary: "Continued missile strikes on energy infrastructure. Black Sea grain corridor under pressure. European energy markets on edge.", commodities: ["Natural Gas", "Wheat", "Sunflower Oil", "Steel"], region: "europe" },
  { id: 2, category: "conflict", severity: "critical", title: "Middle East — Multi-Front Tensions Escalate", location: "Israel / Gaza / Red Sea", summary: "Houthi attacks disrupting Red Sea shipping. Suez Canal traffic at 5-year low. Insurance premiums spiking 200%+.", commodities: ["Crude Oil", "LNG", "Container Shipping", "Aluminum"], region: "middleeast" },
  { id: 3, category: "weather", severity: "high", title: "El Niño — Severe Drought Across Southern Asia", location: "India, Thailand, Vietnam, Philippines", summary: "Rice paddy yields projected down 18%. Water reservoirs critically low. Power generation from hydro dropping sharply.", commodities: ["Rice", "Palm Oil", "Rubber", "Electricity"], region: "asia" },
  { id: 4, category: "diplomatic", severity: "high", title: "US-China Tech War — Semiconductor Export Controls", location: "Global / Taiwan Strait", summary: "CHIPS Act restrictions on advanced node chips. China retaliation via rare earth export limits. Taiwan remains flashpoint.", commodities: ["Semiconductors", "Gallium", "Germanium", "Cobalt"], region: "asia" },
  { id: 5, category: "weather", severity: "critical", title: "Amazon Basin — Record Drought & Wildfires", location: "Brazil, Bolivia, Peru", summary: "Amazon River at historic lows. Soybean and coffee harvest forecasts reduced 22%. Wildfire smoke impacting air quality.", commodities: ["Soybeans", "Coffee", "Beef", "Timber"], region: "latam" },
  { id: 6, category: "economic", severity: "high", title: "Panama Canal — Drought Reduces Capacity 36%", location: "Panama / Pacific Routes", summary: "Canal capacity down 36%. LNG tankers rerouting via Cape Horn adding 20+ days. Freight costs surging.", commodities: ["LNG", "Grain", "Coal", "Auto Parts"], region: "latam" },
  { id: 7, category: "diplomatic", severity: "medium", title: "BRICS Expansion — De-Dollarization Push", location: "Global / Emerging Markets", summary: "Saudi Arabia, UAE, Ethiopia joining BRICS. New currency settlement frameworks challenge USD dominance in commodity trade.", commodities: ["Gold", "Oil", "Grain Futures", "USD"], region: "global" },
  { id: 8, category: "tech", severity: "medium", title: "AI Data Center Boom — Power Grid Strain", location: "USA, Europe, Southeast Asia", summary: "Hyperscaler capex reaching $200B+. Power grid constraints in key markets. Copper demand projections revised upward 40%.", commodities: ["Copper", "Electricity", "Natural Gas", "Water"], region: "northamerica" },
  { id: 9, category: "weather", severity: "high", title: "European Winter — Gas Storage Below Average", location: "Germany, France, UK, Netherlands", summary: "Cold snap incoming with storage 8% below 5-year average. LNG spot prices rising. Industrial curtailments possible.", commodities: ["Natural Gas", "LNG", "Coal", "Electricity"], region: "europe" },
  { id: 10, category: "economic", severity: "high", title: "China Property Crisis — Steel Demand Collapse", location: "China / Global Commodities", summary: "Steel demand projections cut 12%. Iron ore futures tumbling. Construction slowdown rippling through global supply chains.", commodities: ["Iron Ore", "Steel", "Copper", "Nickel"], region: "asia" },
  { id: 11, category: "health", severity: "medium", title: "Avian Flu H5N1 — Global Poultry Disruption", location: "USA, Europe, Asia", summary: "Over 90M birds culled globally. Egg prices up 65% YoY. Dairy cattle infections expanding in North America.", commodities: ["Poultry", "Eggs", "Feed Grain", "Milk"], region: "global" },
  { id: 12, category: "conflict", severity: "high", title: "Sudan Civil War — Grain Belt Devastation", location: "Sudan, South Sudan", summary: "Agricultural regions destroyed. 18M facing famine. Nile River access disputed. Aid convoys blocked.", commodities: ["Wheat", "Sorghum", "Aid Logistics", "Humanitarian Supply"], region: "africa" },
];

// Get upcoming Fridays for options expiry
export function getUpcomingFridays() {
  const now = new Date();
  const day = now.getDay();
  const daysToFriday = day === 5 ? 7 : (5 - day + 7) % 7 || 7;
  const first = new Date(now); first.setDate(now.getDate() + daysToFriday);
  const second = new Date(first); second.setDate(first.getDate() + 7);
  const fmt = (d) => d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
  return { first: fmt(first), second: fmt(second) };
}

// Call Claude API from the backend (uses server-side API key)
export async function callClaude(prompt, maxTokens = 900) {
  const apiKey = process.env.VITE_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set in environment variables.");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
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

export function parseJSON(text) {
  const m = text.match(/[\[{][\s\S]*[\]}]/);
  try { return m ? JSON.parse(m[0]) : null; } catch { return null; }
}

// CORS headers for all responses
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-nexus-key",
  "Content-Type": "application/json",
};

// Simple API key auth for Axl
export function validateApiKey(req) {
  const key = req.headers["x-nexus-key"];
  const validKey = process.env.NEXUS_API_KEY || "nexus-axl-agent-key";
  return key === validKey;
}
