// /api/questrade — Bulletproof token management + options chain support
// Token priority: Edge Config (most recent) → env var (fallback)
// After every successful auth, new token saved to Edge Config immediately

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

// ── Edge Config ───────────────────────────────────────────────
async function edgeGet(key) {
  try {
    const edgeUrl = process.env.EDGE_CONFIG;
    const token = process.env.VERCEL_ACCESS_TOKEN;
    if (!edgeUrl || !token) return null;
    const match = edgeUrl.match(/ecfg_[a-zA-Z0-9]+/);
    if (!match) return null;
    const res = await fetch(
      `https://api.vercel.com/v1/edge-config/${match[0]}/item/${key}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.value || null;
  } catch { return null; }
}

async function edgeSet(key, value) {
  try {
    const edgeUrl = process.env.EDGE_CONFIG;
    const token = process.env.VERCEL_ACCESS_TOKEN;
    if (!edgeUrl || !token) return false;
    const match = edgeUrl.match(/ecfg_[a-zA-Z0-9]+/);
    if (!match) return false;
    const res = await fetch(
      `https://api.vercel.com/v1/edge-config/${match[0]}/items`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ operation: "upsert", key, value }] }),
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) {
      const txt = await res.text();
      console.error("Edge Config save failed:", res.status, txt);
      return false;
    }
    return true;
  } catch (e) {
    console.error("Edge Config save error:", e.message);
    return false;
  }
}

// ── Questrade auth — always fresh per request ─────────────────
let qtToken = null;
let qtApiUrl = null;
let qtTokenTime = null;
const TOKEN_TTL = 25 * 60 * 1000; // 25 min (Questrade tokens last 30 min)

async function qtAuth(refreshToken) {
  const res = await fetch(
    `https://login.questrade.com/oauth2/token?grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
    { method: "POST", signal: AbortSignal.timeout(10000) }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Questrade auth failed: ${res.status} — ${text}`);
  }
  const data = await res.json();
  qtToken = data.access_token;
  qtApiUrl = data.api_server;
  qtTokenTime = Date.now();

  // Save new refresh token to Edge Config — await it so it actually saves
  if (data.refresh_token) {
    const saved = await edgeSet("questrade_refresh_token", data.refresh_token);
    console.log("Token saved to Edge Config:", saved, "new token prefix:", data.refresh_token.slice(0, 8));
  }
  return data;
}

async function ensureAuth() {
  // Re-auth if token expired or missing
  const tokenFresh = qtToken && qtApiUrl && qtTokenTime && (Date.now() - qtTokenTime) < TOKEN_TTL;
  if (tokenFresh) return;

  // Try Edge Config first (most recently rotated token)
  const edgeToken = await edgeGet("questrade_refresh_token");
  const envToken = process.env.QUESTRADE_TOKEN;

  // Try Edge Config token first
  if (edgeToken) {
    try {
      await qtAuth(edgeToken);
      return;
    } catch (e) {
      // Edge token failed, try env var
      console.log("Edge token failed, trying env token:", e.message);
    }
  }

  // Fall back to env var token
  if (envToken) {
    await qtAuth(envToken);
    return;
  }

  throw new Error("No valid Questrade token. Update QUESTRADE_TOKEN in Vercel env vars.");
}

async function qtCall(path) {
  const res = await fetch(`${qtApiUrl}v1/${path}`, {
    headers: { Authorization: `Bearer ${qtToken}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const text = await res.text();
    // If 401, force re-auth next call
    if (res.status === 401) { qtToken = null; qtTokenTime = null; }
    throw new Error(`Questrade ${res.status}: ${text}`);
  }
  return res.json();
}

// ── Symbol search ─────────────────────────────────────────────
async function searchSymbol(symbol) {
  const data = await qtCall(`symbols/search?prefix=${encodeURIComponent(symbol)}&offset=0`);
  const equity = data.symbols?.find(s =>
    s.symbol === symbol.toUpperCase() &&
    ["NYSE", "NASDAQ", "TSX", "TSXV", "ARCA", "BATS"].includes(s.listingExchange)
  ) || data.symbols?.[0];
  if (!equity) throw new Error(`Symbol not found: ${symbol}`);
  return equity;
}

// ── Live quote ────────────────────────────────────────────────
async function getQuote(symbol) {
  const equity = await searchSymbol(symbol);
  const data = await qtCall(`markets/quotes/${equity.symbolId}`);
  const q = data.quotes?.[0];
  if (!q) throw new Error(`No quote for ${symbol}`);
  return {
    symbol: q.symbol,
    symbolId: equity.symbolId,
    lastPrice: q.lastTradePrice || q.lastTradePriceTrHrs || 0,
    bidPrice: q.bidPrice || 0,
    askPrice: q.askPrice || 0,
    volume: q.volume || 0,
    openPrice: q.openPrice || 0,
    highPrice52w: equity.highPrice52w || 0,
    lowPrice52w: equity.lowPrice52w || 0,
    exchange: equity.listingExchange,
    description: equity.description,
    currency: equity.currency || "USD",
  };
}

// ── Options chain ─────────────────────────────────────────────
async function getOptionsChain(symbolId, expiryFilter) {
  // Correct Questrade endpoint: GET /v1/symbols/{id}/options
  const data = await qtCall(`symbols/${symbolId}/options`);
  const chain = data.optionChain || [];

  // Filter by expiry if provided
  let filtered = chain;
  if (expiryFilter) {
    filtered = chain.filter(exp =>
      exp.expiryDate?.includes(expiryFilter)
    );
    if (filtered.length === 0) filtered = chain.slice(0, 4);
  } else {
    filtered = chain.slice(0, 4); // next 4 expiries
  }

  return filtered.map(exp => ({
    expiryDate: exp.expiryDate,
    multiplier: exp.multiplier || 100,
    strikes: (exp.chainPerRoot?.[0]?.chainPerStrikePrice || []).map(s => ({
      strikePrice: s.strikePrice,
      callSymbolId: s.callSymbolId,
      putSymbolId: s.putSymbolId,
    }))
  }));
}

// Get option quotes with Greeks via POST /v1/markets/quotes/options
async function getOptionQuotesWithGreeks(underlyingId, expiryDate, optionType, minStrike, maxStrike) {
  const body = {
    filters: [{
      optionType: optionType, // "Call" or "Put"
      underlyingId: underlyingId,
      expiryDate: expiryDate,
      minstrikePrice: minStrike,
      maxstrikePrice: maxStrike,
    }]
  };
  const res = await fetch(`${qtApiUrl}v1/markets/quotes/options`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${qtToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Options quotes error ${res.status}: ${text}`);
  }
  const data = await res.json();
  return (data.optionQuotes || []).map(o => ({
    symbol: o.symbol,
    symbolId: o.symbolId,
    strikePrice: o.strikePrice,
    expiryDate: o.expiryDate,
    optionType: o.optionType,
    lastPrice: o.lastTradePriceTrHrs || o.lastTradePrice || 0,
    bidPrice: o.bidPrice || 0,
    askPrice: o.askPrice || 0,
    openInterest: o.openInterest || 0,
    volume: o.volume || 0,
    impliedVolatility: o.volatility || 0,
    delta: o.delta || 0,
    gamma: o.gamma || 0,
    theta: o.theta || 0,
    vega: o.vega || 0,
  }));
}

// ── Options quotes for specific contracts ─────────────────────
async function getOptionsQuotes(optionIds) {
  if (!optionIds?.length) return [];
  const ids = optionIds.slice(0, 20).join(",");
  const data = await qtCall(`markets/quotes/options?optionIds=${ids}`);
  return (data.optionQuotes || []).map(o => ({
    symbolId: o.symbolId,
    symbol: o.symbol,
    strikePrice: o.strikePrice,
    expiryDate: o.expiryDate,
    optionType: o.optionType, // Call or Put
    lastPrice: o.lastTradePrice || 0,
    bidPrice: o.bidPrice || 0,
    askPrice: o.askPrice || 0,
    openInterest: o.openInterest || 0,
    volume: o.volume || 0,
    impliedVolatility: o.volatility || 0,
    delta: o.delta || 0,
    gamma: o.gamma || 0,
    theta: o.theta || 0,
    vega: o.vega || 0,
  }));
}

// ── Best strikes near ATM ─────────────────────────────────────
async function getBestStrikes(symbol, direction, expiryHint) {
  const quote = await getQuote(symbol);
  const currentPrice = quote.lastPrice;
  const optionType = direction === "PUT" ? "Put" : "Call";

  // Step 1: Get option chain to find expiry dates and strike range
  const chain = await getOptionsChain(quote.symbolId, expiryHint);
  if (!chain.length) throw new Error(`No options chain for ${symbol}`);

  // Use first available expiry
  const exp = chain[0];
  const expiryDate = exp.expiryDate;

  // Find strikes within 15% of current price
  const buffer = currentPrice * 0.15;
  const minStrike = Math.floor(currentPrice - buffer);
  const maxStrike = Math.ceil(currentPrice + buffer);

  // Step 2: Get real quotes with Greeks via POST endpoint
  const quotes = await getOptionQuotesWithGreeks(
    quote.symbolId,
    expiryDate,
    optionType,
    minStrike,
    maxStrike
  );

  // Sort by proximity to ATM
  const sorted = quotes
    .filter(q => q.bidPrice > 0 || q.lastPrice > 0)
    .sort((a, b) => Math.abs(a.strikePrice - currentPrice) - Math.abs(b.strikePrice - currentPrice))
    .slice(0, 8);

  // Also get all available expiries for reference
  const expiries = chain.map(e => e.expiryDate);

  return {
    symbol: quote.symbol,
    currentPrice,
    exchange: quote.exchange,
    currency: quote.currency,
    direction: optionType,
    expiryDate,
    availableExpiries: expiries,
    strikes: sorted,
  };
}

// ── Account balance ───────────────────────────────────────────
async function getAccountBalance() {
  const accounts = await qtCall("accounts");
  const account = accounts.accounts?.[0];
  if (!account) throw new Error("No accounts found");
  const balances = await qtCall(`accounts/${account.number}/balances`);
  const cad = balances.combinedBalances?.find(b => b.currency === "CAD");
  const usd = balances.combinedBalances?.find(b => b.currency === "USD");
  return {
    accountNumber: account.number,
    accountType: account.type,
    CAD: { cash: cad?.cash || 0, marketValue: cad?.marketValue || 0, totalEquity: cad?.totalEquity || 0, buyingPower: cad?.buyingPower || 0 },
    USD: { cash: usd?.cash || 0, marketValue: usd?.marketValue || 0, totalEquity: usd?.totalEquity || 0, buyingPower: usd?.buyingPower || 0 },
  };
}

// ── Positions ─────────────────────────────────────────────────
async function getPositions() {
  const accounts = await qtCall("accounts");
  const account = accounts.accounts?.[0];
  if (!account) throw new Error("No accounts found");
  const pos = await qtCall(`accounts/${account.number}/positions`);
  return (pos.positions || []).map(p => ({
    symbol: p.symbol,
    quantity: p.openQuantity,
    currentPrice: p.currentPrice,
    currentValue: p.currentMarketValue,
    averageEntryPrice: p.averageEntryPrice,
    openPnL: p.openPnl,
    totalCost: p.totalCost,
  }));
}

// ── Enrich picks with live quotes ─────────────────────────────
async function enrichPicks(tickers) {
  const results = await Promise.allSettled(
    tickers.split(",").map(t => t.trim().toUpperCase()).slice(0, 5).map(t => getQuote(t))
  );
  return results.map((r, i) => ({
    ticker: tickers.split(",")[i]?.trim().toUpperCase(),
    quote: r.status === "fulfilled" ? r.value : null,
    error: r.status === "rejected" ? r.reason?.message : null,
  }));
}

// ── Main handler ──────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).end();
  }
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));

  if (!validateApiKey(req)) {
    return res.status(401).json({ error: "Unauthorized. Include x-nexus-key header." });
  }

  const { action, symbol, direction, expiry, picks } = req.query;

  try {
    await ensureAuth();

    switch (action) {

      case "auth": {
        const saved = await edgeGet("questrade_refresh_token");
        return res.status(200).json({
          success: true,
          message: "Questrade connected",
          tokenSource: saved ? "EdgeConfig" : "EnvVar",
          apiServer: qtApiUrl,
        });
      }

      case "balance": {
        const balance = await getAccountBalance();
        return res.status(200).json({ success: true, balance });
      }

      case "positions": {
        const positions = await getPositions();
        return res.status(200).json({ success: true, positions });
      }

      case "quote": {
        if (!symbol) return res.status(400).json({ error: "symbol required" });
        const quote = await getQuote(symbol.toUpperCase());
        return res.status(200).json({ success: true, quote });
      }

      // Real options chain with live strikes, premiums, Greeks
      case "chain": {
        if (!symbol) return res.status(400).json({ error: "symbol required" });
        const dir = (direction || "CALL").toUpperCase();
        const data = await getBestStrikes(symbol.toUpperCase(), dir, expiry);
        return res.status(200).json({ success: true, ...data });
      }

      // Enrich multiple picks with live stock prices
      case "enrich": {
        if (!picks) return res.status(400).json({ error: "picks required" });
        const quotes = await enrichPicks(picks);
        return res.status(200).json({ success: true, quotes });
      }

      case "token-status": {
        const edgeTok = await edgeGet("questrade_refresh_token");
        const envTok = process.env.QUESTRADE_TOKEN;
        return res.status(200).json({
          success: true,
          edgeConfigHasToken: !!edgeTok,
          edgeTokenPrefix: edgeTok ? edgeTok.slice(0, 8) + "..." : null,
          envTokenPrefix: envTok ? envTok.slice(0, 8) + "..." : null,
          edgeConfigUrl: !!process.env.EDGE_CONFIG,
          vercelToken: !!process.env.VERCEL_ACCESS_TOKEN,
          qtConnected: !!qtToken,
          tokenAge: qtTokenTime ? Math.round((Date.now() - qtTokenTime) / 1000) + "s" : "none",
        });
      }

      default:
        return res.status(400).json({
          error: `Unknown action: ${action}`,
          available: ["auth", "balance", "positions", "quote", "chain", "enrich", "token-status"]
        });
    }

  } catch (err) {
    if (err.message.includes("401") || err.message.includes("auth failed")) {
      qtToken = null;
      qtTokenTime = null;
    }
    return res.status(500).json({ error: err.message });
  }
}
