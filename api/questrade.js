// /api/questrade — With Vercel Edge Config token persistence
// Token auto-saves after each auth so it survives serverless restarts

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-nexus-key",
  "Content-Type": "application/json",
};

function validateApiKey(req) {
  const key = req.headers["x-nexus-key"];
  const validKey = process.env.NEXUS_API_KEY || "nexus-axl-agent-key";
  return key === validKey;
}

// ── Edge Config token storage ─────────────────────────────────
async function edgeGet(key) {
  try {
    const edgeUrl = process.env.EDGE_CONFIG;
    if (!edgeUrl) return null;
    const token = process.env.VERCEL_ACCESS_TOKEN;
    // Parse the Edge Config ID from the connection string
    const match = edgeUrl.match(/ecfg_[a-zA-Z0-9]+/);
    if (!match) return null;
    const configId = match[0];
    const res = await fetch(`https://api.vercel.com/v1/edge-config/${configId}/item/${key}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.value || null;
  } catch { return null; }
}

async function edgeSet(key, value) {
  try {
    const edgeUrl = process.env.EDGE_CONFIG;
    const token = process.env.VERCEL_ACCESS_TOKEN;
    if (!edgeUrl || !token) return;
    const match = edgeUrl.match(/ecfg_[a-zA-Z0-9]+/);
    if (!match) return;
    const configId = match[0];
    await fetch(`https://api.vercel.com/v1/edge-config/${configId}/items`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        items: [{ operation: "upsert", key, value }]
      })
    });
  } catch {}
}

// ── Questrade auth ────────────────────────────────────────────
let qtToken = null;
let qtApiUrl = null;
let authenticated = false;

async function qtAuth(refreshToken) {
  const res = await fetch(
    `https://login.questrade.com/oauth2/token?grant_type=refresh_token&refresh_token=${refreshToken}`,
    { method: "POST" }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Questrade auth failed: ${res.status} — ${text}`);
  }
  const data = await res.json();
  qtToken = data.access_token;
  qtApiUrl = data.api_server;
  // Save new refresh token to Edge Config immediately
  if (data.refresh_token) {
    await edgeSet("questrade_refresh_token", data.refresh_token);
  }
  return data;
}

async function qtCall(path) {
  const res = await fetch(`${qtApiUrl}v1/${path}`, {
    headers: { Authorization: `Bearer ${qtToken}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Questrade ${res.status}: ${await res.text()}`);
  return res.json();
}

async function ensureAuth() {
  if (authenticated && qtToken && qtApiUrl) return;
  // Try Edge Config first (most recent token), fall back to env var
  const edgeToken = await edgeGet("questrade_refresh_token");
  const envToken = process.env.QUESTRADE_TOKEN;
  const tokenToUse = edgeToken || envToken;
  if (!tokenToUse) throw new Error("No Questrade token found. Set QUESTRADE_TOKEN in Vercel env vars.");
  await qtAuth(tokenToUse);
  authenticated = true;
}

async function getQuote(symbol) {
  const search = await qtCall(`symbols/search?prefix=${symbol}&offset=0`);
  const equity = search.symbols?.find(s =>
    s.symbol === symbol &&
    ["NYSE","NASDAQ","TSX","TSXV"].includes(s.listingExchange)
  ) || search.symbols?.[0];
  if (!equity) throw new Error(`Symbol not found: ${symbol}`);
  const quote = await qtCall(`markets/quotes/${equity.symbolId}`);
  const q = quote.quotes?.[0];
  return {
    symbol: q.symbol,
    lastPrice: q.lastTradePrice || q.lastTradePriceTrHrs,
    bidPrice: q.bidPrice,
    askPrice: q.askPrice,
    volume: q.volume,
    openPrice: q.openPrice,
    highPrice52w: equity.highPrice52w || 0,
    lowPrice52w: equity.lowPrice52w || 0,
    symbolId: equity.symbolId,
    exchange: equity.listingExchange,
    description: equity.description,
  };
}

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

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).end();
  }
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
  if (!validateApiKey(req)) {
    return res.status(401).json({ error: "Unauthorized. Include x-nexus-key header." });
  }

  const { action, symbol, picks } = req.query;

  try {
    await ensureAuth();

    if (action === "auth") {
      const savedToken = await edgeGet("questrade_refresh_token");
      return res.status(200).json({
        success: true,
        message: "Questrade connected",
        tokenSource: savedToken ? "EdgeConfig" : "env"
      });
    }
    if (action === "balance") {
      const balance = await getAccountBalance();
      return res.status(200).json({ success: true, balance });
    }
    if (action === "positions") {
      const positions = await getPositions();
      return res.status(200).json({ success: true, positions });
    }
    if (action === "quote") {
      if (!symbol) return res.status(400).json({ error: "symbol required" });
      const quote = await getQuote(symbol.toUpperCase());
      return res.status(200).json({ success: true, quote });
    }
    if (action === "enrich") {
      if (!picks) return res.status(400).json({ error: "picks required" });
      const tickers = picks.split(",").map(t => t.trim().toUpperCase()).slice(0, 5);
      const results = await Promise.allSettled(tickers.map(t => getQuote(t)));
      const quotes = results.map((r, i) => ({
        ticker: tickers[i],
        quote: r.status === "fulfilled" ? r.value : null,
        error: r.status === "rejected" ? r.reason?.message : null,
      }));
      return res.status(200).json({ success: true, quotes });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
    if (err.message.includes("401") || err.message.includes("auth")) authenticated = false;
    return res.status(500).json({ error: err.message });
  }
}
