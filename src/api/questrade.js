
// /api/questrade — Self-contained with auto token refresh
// Stores refreshed token in Vercel env via Vercel API

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

// In-memory token cache (lives for duration of serverless instance)
let qtToken = null;
let qtApiUrl = null;
let qtRefreshToken = null;
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
  qtRefreshToken = data.refresh_token; // Save the NEW token for next time
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
  const token = process.env.QUESTRADE_TOKEN;
  if (!token) throw new Error("QUESTRADE_TOKEN not set in Vercel environment variables");
  await qtAuth(token);
  authenticated = true;
}

// ── Update token in Vercel env automatically ──────────────────
async function saveNewTokenToVercel(newToken) {
  const vercelToken = process.env.VERCEL_ACCESS_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;
  if (!vercelToken || !projectId) return; // Skip if not configured

  try {
    const url = `https://api.vercel.com/v10/projects/${projectId}/env${teamId ? `?teamId=${teamId}` : ""}`;
    // Get existing env vars to find the ID of QUESTRADE_TOKEN
    const listRes = await fetch(url, {
      headers: { Authorization: `Bearer ${vercelToken}` }
    });
    const listData = await listRes.json();
    const envVar = listData.envs?.find(e => e.key === "QUESTRADE_TOKEN");
    if (!envVar) return;

    // Update it with new token
    await fetch(`https://api.vercel.com/v10/projects/${projectId}/env/${envVar.id}${teamId ? `?teamId=${teamId}` : ""}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${vercelToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ value: newToken })
    });
  } catch {} // Silent fail — token update is best-effort
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

    // After successful auth, save new refresh token to Vercel for next time
    if (qtRefreshToken && qtRefreshToken !== process.env.QUESTRADE_TOKEN) {
      saveNewTokenToVercel(qtRefreshToken); // fire and forget
    }

    if (action === "auth") {
      return res.status(200).json({
        success: true,
        message: "Questrade connected",
        newTokenSaved: !!qtRefreshToken,
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
