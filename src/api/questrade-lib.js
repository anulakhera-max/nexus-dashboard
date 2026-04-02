// questrade.js — Questrade API integration for NEXUS
// Provides: live stock prices, options chains, account balance, positions

const QT_AUTH_URL = "https://login.questrade.com/oauth2/token";
let qtToken = null;
let qtApiUrl = null;
let tokenExpiry = null;

// ── Authenticate with Questrade ───────────────────────────────
export async function qtAuth(refreshToken) {
  try {
    const res = await fetch(`${QT_AUTH_URL}?grant_type=refresh_token&refresh_token=${refreshToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Auth failed: ${res.status} — ${err}`);
    }
    const data = await res.json();
    qtToken = data.access_token;
    qtApiUrl = data.api_server; // e.g. https://api01.iq.questrade.com/
    tokenExpiry = Date.now() + (data.expires_in * 1000);
    return { success: true, apiServer: qtApiUrl, expiresIn: data.expires_in };
  } catch (err) {
    throw new Error(`Questrade auth error: ${err.message}`);
  }
}

// ── Questrade API call helper ─────────────────────────────────
async function qtCall(path) {
  if (!qtToken || !qtApiUrl) throw new Error("Not authenticated with Questrade");
  const res = await fetch(`${qtApiUrl}v1/${path}`, {
    headers: { "Authorization": `Bearer ${qtToken}` }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Questrade API error ${res.status}: ${err}`);
  }
  return await res.json();
}

// ── Get live quote for a symbol ───────────────────────────────
export async function getQuote(symbol) {
  // First search for the symbol ID
  const search = await qtCall(`symbols/search?prefix=${symbol}&offset=0`);
  const equity = search.symbols?.find(s =>
    s.symbol === symbol &&
    (s.listingExchange === "NYSE" || s.listingExchange === "NASDAQ" ||
     s.listingExchange === "TSX" || s.listingExchange === "TSXV")
  ) || search.symbols?.[0];

  if (!equity) throw new Error(`Symbol not found: ${symbol}`);

  const symbolId = equity.symbolId;
  const quote = await qtCall(`markets/quotes/${symbolId}`);
  const q = quote.quotes?.[0];

  return {
    symbol: q.symbol,
    lastPrice: q.lastTradePrice || q.lastTradePriceTrHrs,
    bidPrice: q.bidPrice,
    askPrice: q.askPrice,
    volume: q.volume,
    openPrice: q.openPrice,
    highPrice52w: equity.highPrice52w || 0,
    lowPrice52w: equity.lowPrice52w,
    symbolId,
    exchange: equity.listingExchange,
    description: equity.description,
  };
}

// ── Get options chain for a symbol ───────────────────────────
export async function getOptionsChain(symbolId, expiryDate) {
  const chain = await qtCall(`symbols/${symbolId}/options`);
  const options = chain.optionChain || [];

  // Filter by expiry if provided
  let filtered = options;
  if (expiryDate) {
    filtered = options.filter(o =>
      o.expiryDate?.startsWith(expiryDate) ||
      new Date(o.expiryDate).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }) === expiryDate
    );
  }

  return filtered.slice(0, 5).map(exp => ({
    expiryDate: exp.expiryDate,
    chainPerRoot: exp.chainPerRoot?.slice(0, 10) || [],
  }));
}

// ── Get options quotes for specific contracts ─────────────────
export async function getOptionsQuotes(optionIds) {
  if (!optionIds?.length) return [];
  const ids = optionIds.slice(0, 10).join(",");
  const data = await qtCall(`markets/quotes/options?optionIds=${ids}`);
  return (data.optionQuotes || []).map(o => ({
    symbol: o.symbol,
    lastPrice: o.lastTradePrice,
    bidPrice: o.bidPrice,
    askPrice: o.askPrice,
    openInterest: o.openInterest,
    volume: o.volume,
    impliedVolatility: o.volatility,
    delta: o.delta,
    gamma: o.gamma,
    theta: o.theta,
    vega: o.vega,
    optionType: o.optionType,
    strikePrice: o.strikePrice,
    expiryDate: o.expiryDate,
  }));
}

// ── Get account balance ───────────────────────────────────────
export async function getAccountBalance() {
  const accounts = await qtCall("accounts");
  const account = accounts.accounts?.[0];
  if (!account) throw new Error("No accounts found");

  const balances = await qtCall(`accounts/${account.number}/balances`);
  const cad = balances.combinedBalances?.find(b => b.currency === "CAD");
  const usd = balances.combinedBalances?.find(b => b.currency === "USD");

  return {
    accountNumber: account.number,
    accountType: account.type,
    status: account.status,
    CAD: {
      cash: cad?.cash || 0,
      marketValue: cad?.marketValue || 0,
      totalEquity: cad?.totalEquity || 0,
      buyingPower: cad?.buyingPower || 0,
    },
    USD: {
      cash: usd?.cash || 0,
      marketValue: usd?.marketValue || 0,
      totalEquity: usd?.totalEquity || 0,
      buyingPower: usd?.buyingPower || 0,
    },
  };
}

// ── Get open positions ────────────────────────────────────────
export async function getPositions() {
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
    closedPnL: p.closedPnl,
    totalCost: p.totalCost,
    isRealTime: p.isRealTime,
  }));
}

// ── Get best strikes near current price ───────────────────────
export async function getBestStrikes(symbol, direction, expiryDate) {
  try {
    const quote = await getQuote(symbol);
    const currentPrice = quote.lastPrice;
    const chain = await getOptionsChain(quote.symbolId, expiryDate);

    // Find strikes near ATM (at the money)
    const allStrikes = [];
    for (const exp of chain) {
      for (const root of exp.chainPerRoot || []) {
        for (const strike of root.chainPerStrikePrice || []) {
          const optionType = direction === "CALL" ? "Call" : "Put";
          const contracts = strike.callSymbolId || strike.putSymbolId
            ? [{ type: optionType, symbolId: direction === "CALL" ? strike.callSymbolId : strike.putSymbolId, strikePrice: strike.strikePrice }]
            : [];
          allStrikes.push(...contracts);
        }
      }
    }

    // Sort by proximity to current price
    const sorted = allStrikes
      .filter(s => s.symbolId)
      .sort((a, b) => Math.abs(a.strikePrice - currentPrice) - Math.abs(b.strikePrice - currentPrice))
      .slice(0, 5);

    // Get live quotes for these options
    const optionIds = sorted.map(s => s.symbolId).filter(Boolean);
    const quotes = optionIds.length ? await getOptionsQuotes(optionIds) : [];

    return {
      currentPrice,
      symbol: quote.symbol,
      exchange: quote.exchange,
      strikes: quotes.map(q => ({
        strike: q.strikePrice,
        type: q.optionType,
        bid: q.bidPrice,
        ask: q.askPrice,
        last: q.lastPrice,
        iv: q.impliedVolatility,
        delta: q.delta,
        volume: q.volume,
        openInterest: q.openInterest,
        expiry: q.expiryDate,
      }))
    };
  } catch (err) {
    return { error: err.message, symbol };
  }
}
