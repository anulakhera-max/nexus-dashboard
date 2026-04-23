import { useState, useEffect } from "react";

// W10: Earnings Calendar — fully dynamic, auto-updates every year
// Fetches live earnings dates from Yahoo Finance for all watched tickers
// No hardcoded dates — works forever

const NEXUS_URL = import.meta.env.VITE_NEXUS_URL;
const NEXUS_KEY = import.meta.env.VITE_NEXUS_API_KEY;

const WATCH_TICKERS = [
  { ticker:"NVDA",  name:"Nvidia"        },
  { ticker:"AAPL",  name:"Apple"         },
  { ticker:"MSFT",  name:"Microsoft"     },
  { ticker:"GOOGL", name:"Alphabet"      },
  { ticker:"META",  name:"Meta"          },
  { ticker:"AMZN",  name:"Amazon"        },
  { ticker:"TSLA",  name:"Tesla"         },
  { ticker:"AMD",   name:"AMD"           },
  { ticker:"PLTR",  name:"Palantir"      },
  { ticker:"COIN",  name:"Coinbase"      },
  { ticker:"MSTR",  name:"MicroStrategy" },
  { ticker:"SOFI",  name:"SoFi"         },
  { ticker:"IONQ",  name:"IonQ"         },
  { ticker:"RKLB",  name:"Rocket Lab"   },
  { ticker:"MARA",  name:"Marathon Digital"},
  { ticker:"QQQ",   name:"Nasdaq ETF"   },
  { ticker:"SPY",   name:"S&P 500 ETF"  },
  { ticker:"NUE",   name:"Nucor"        },
];

function daysUntil(ts) {
  if (!ts) return null;
  const now = new Date(); now.setHours(0,0,0,0);
  const d = new Date(ts * 1000); d.setHours(0,0,0,0);
  return Math.round((d - now) / 86400000);
}

function fmt(ts) {
  if (!ts) return "TBD";
  const d = new Date(ts * 1000);
  return d.toLocaleDateString("en-CA", { year:"numeric", month:"short", day:"numeric" });
}

function getRisk(days) {
  if (days === null) return { label:"TBD", color:"#444" };
  if (days < 0) return { label:"REPORTED", color:"#333" };
  if (days === 0) return { label:"TODAY !", color:"#ff0000" };
  if (days <= 3) return { label:"< 3 DAYS", color:"#ff4444" };
  if (days <= 7) return { label:"THIS WEEK", color:"#ff6600" };
  if (days <= 14) return { label:"NEXT WEEK", color:"#ffd700" };
  if (days <= 30) return { label:days+"d away", color:"#00d4ff" };
  return { label:days+"d away", color:"#555" };
}

function getAdvice(days) {
  if (days === null) return null;
  if (days < 0) return null;
  if (days === 0) return { type:"danger", msg:"TODAY — do NOT buy options, IV crush after close" };
  if (days <= 2) return { type:"danger", msg:"DANGER — IV crush imminent, exit all options NOW" };
  if (days <= 5) return { type:"warn", msg:"EXIT WINDOW — sell options before earnings, keep gains" };
  if (days <= 10) return { type:"good", msg:"OPTIMAL ENTRY — buy now, ride IV expansion into earnings" };
  if (days <= 21) return { type:"info", msg:"Early entry — IV building, watch dark pool for signals" };
  return { type:"info", msg:"Far out — monitor, set alert for 10-day mark" };
}

export default function EarningsCalendar() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("upcoming");
  const [selected, setSelected] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  async function fetchAll() {
    setLoading(true); setError(null);
    try {
      const results = await Promise.all(
        WATCH_TICKERS.map(async ({ ticker, name }) => {
          try {
            // Yahoo Finance quote endpoint returns earnings date
            const r = await fetch(
              "https://query1.finance.yahoo.com/v8/finance/chart/" + ticker + "?interval=1d&range=1d",
              { headers: { "User-Agent": "Mozilla/5.0" } }
            );
            const d = await r.json();
            const m = d?.chart?.result?.[0]?.meta;
            if (!m) return null;
            const prev = m.chartPreviousClose || m.regularMarketPrice;
            const earningsTs = m.earningsTimestamp || m.earningsTimestampStart || null;
            const earningsEnd = m.earningsTimestampEnd || null;
            const days = daysUntil(earningsTs);
            return {
              ticker, name,
              price: m.regularMarketPrice,
              change: prev ? +((m.regularMarketPrice - prev) / prev * 100).toFixed(2) : 0,
              earningsTs, earningsEnd,
              earningsDate: fmt(earningsTs),
              earningsDateEnd: fmt(earningsEnd),
              daysUntil: days,
              risk: getRisk(days),
              advice: getAdvice(days),
              confirmed: !!m.earningsTimestamp,
            };
          } catch(e) { return null; }
        })
      );
      const valid = results
        .filter(Boolean)
        .filter(r => r.earningsTs)
        .sort((a, b) => {
          if (a.daysUntil === null) return 1;
          if (b.daysUntil === null) return -1;
          return a.daysUntil - b.daysUntil;
        });
      setData(valid);
      setLastFetch(new Date().toLocaleTimeString());
    } catch(e) {
      setError(e.message);
    }
    setLoading(false);
  }

  useEffect(() => { fetchAll(); }, []);

  const filtered = data.filter(e => {
    if (filter === "upcoming") return e.daysUntil !== null && e.daysUntil >= 0;
    if (filter === "week") return e.daysUntil !== null && e.daysUntil >= 0 && e.daysUntil <= 7;
    if (filter === "danger") return e.daysUntil !== null && e.daysUntil >= 0 && e.daysUntil <= 3;
    if (filter === "optimal") return e.daysUntil !== null && e.daysUntil >= 5 && e.daysUntil <= 14;
    return true;
  });

  const dangerCount = data.filter(e => e.daysUntil !== null && e.daysUntil >= 0 && e.daysUntil <= 3).length;
  const weekCount   = data.filter(e => e.daysUntil !== null && e.daysUntil >= 0 && e.daysUntil <= 7).length;
  const optimalCount= data.filter(e => e.daysUntil !== null && e.daysUntil >= 5 && e.daysUntil <= 14).length;

  return (
    <div style={{ padding:"16px", display:"flex", flexDirection:"column", gap:"16px" }}>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:"8px" }}>
        <div>
          <div style={{ color:"#00d4ff", fontFamily:"monospace", fontWeight:700, fontSize:"18px" }}>EARNINGS CALENDAR</div>
          <div style={{ color:"#666", fontSize:"12px", fontFamily:"monospace" }}>
            Live from Yahoo Finance · Auto-updates every year · {lastFetch ? "Last fetch: " + lastFetch : "Loading..."}
          </div>
        </div>
        <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
          {dangerCount > 0 && (
            <div style={{ background:"rgba(255,68,68,0.15)", border:"1px solid #ff4444", borderRadius:"8px", padding:"6px 12px", color:"#ff4444", fontSize:"12px", fontFamily:"monospace", fontWeight:700 }}>
              ⚠️ {dangerCount} EARNINGS ≤ 3 DAYS
            </div>
          )}
          <button onClick={fetchAll} style={{ background:"rgba(0,212,255,0.1)", color:"#00d4ff", border:"1px solid #00d4ff", borderRadius:"6px", padding:"6px 12px", fontSize:"12px", fontFamily:"monospace", cursor:"pointer" }}>
            🔄 REFRESH
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display:"flex", gap:"8px", flexWrap:"wrap" }}>
        {[
          ["upcoming", "Upcoming (" + data.filter(e=>e.daysUntil>=0).length + ")"],
          ["week",    "This Week (" + weekCount + ")"],
          ["danger",  "Danger (" + dangerCount + ")"],
          ["optimal", "Optimal Entry (" + optimalCount + ")"],
          ["all",     "All"],
        ].map(([val,label]) => (
          <button key={val} onClick={()=>setFilter(val)} style={{ background:filter===val?"rgba(0,212,255,0.2)":"rgba(255,255,255,0.05)", color:filter===val?"#00d4ff":"#888", border:filter===val?"1px solid #00d4ff":"1px solid #333", borderRadius:"6px", padding:"5px 12px", fontSize:"12px", fontFamily:"monospace", cursor:"pointer", fontWeight:filter===val?700:400 }}>
            {label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && <div style={{color:"#ff4444",fontFamily:"monospace",fontSize:"12px"}}>Error: {error}</div>}

      {/* Loading */}
      {loading && (
        <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
          {[1,2,3,4,5].map(i => (
            <div key={i} style={{ background:"rgba(255,255,255,0.02)", border:"1px solid #1a1a2e", borderRadius:"10px", padding:"14px 16px", height:"48px", animation:"pulse 1.5s ease-in-out infinite" }} />
          ))}
        </div>
      )}

      {/* Calendar rows */}
      {!loading && (
        <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
          {filtered.map(e => {
            const isSelected = selected === e.ticker;
            const borderColor = e.daysUntil !== null && e.daysUntil <= 3 && e.daysUntil >= 0 ? "rgba(255,68,68,0.4)" :
                                e.daysUntil !== null && e.daysUntil <= 7 && e.daysUntil >= 0 ? "rgba(255,165,0,0.3)" :
                                e.daysUntil !== null && e.daysUntil <= 14 && e.daysUntil >= 0 ? "rgba(255,215,0,0.2)" :
                                isSelected ? "#00d4ff" : "#1a1a2e";
            return (
              <div key={e.ticker} onClick={()=>setSelected(isSelected?null:e.ticker)}
                style={{ background:isSelected?"rgba(0,212,255,0.06)":"rgba(255,255,255,0.02)", border:"1px solid "+borderColor, borderRadius:"10px", padding:"12px 16px", cursor:"pointer" }}>

                {/* Main row */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:"8px" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:"12px" }}>
                    <span style={{ color:"#00d4ff", fontFamily:"monospace", fontWeight:700, fontSize:"15px", minWidth:"52px" }}>{e.ticker}</span>
                    <span style={{ color:"#888", fontSize:"13px" }}>{e.name}</span>
                    {!e.confirmed && <span style={{ color:"#444", fontSize:"10px", fontFamily:"monospace", border:"1px solid #333", borderRadius:"4px", padding:"1px 5px" }}>EST</span>}
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:"12px", flexWrap:"wrap" }}>
                    {e.price && <span style={{ color:"#e2e8f0", fontSize:"13px", fontFamily:"monospace" }}>${e.price.toFixed(2)}</span>}
                    {e.change !== undefined && <span style={{ color:e.change>=0?"#00ff88":"#ff4444", fontSize:"12px", fontFamily:"monospace" }}>{e.change>=0?"+":""}{e.change}%</span>}
                    <span style={{ color:e.risk.color, fontSize:"12px", fontFamily:"monospace", fontWeight:700 }}>{e.risk.label}</span>
                    <span style={{ color:"#555", fontSize:"12px", minWidth:"110px", textAlign:"right" }}>{e.earningsDate}</span>
                  </div>
                </div>

                {/* Advice badge */}
                {e.advice && (
                  <div style={{ marginTop:"8px", fontSize:"11px", fontFamily:"monospace",
                    color: e.advice.type==="danger"?"#ff4444":e.advice.type==="warn"?"#ff6600":e.advice.type==="good"?"#00ff88":"#00d4ff",
                    background: e.advice.type==="danger"?"rgba(255,68,68,0.08)":e.advice.type==="warn"?"rgba(255,102,0,0.08)":e.advice.type==="good"?"rgba(0,255,136,0.08)":"rgba(0,212,255,0.08)",
                    borderRadius:"4px", padding:"4px 8px" }}>
                    {e.advice.type==="danger"?"⚠️":e.advice.type==="warn"?"📊":e.advice.type==="good"?"✅":"ℹ️"} {e.advice.msg}
                  </div>
                )}

                {/* Expanded */}
                {isSelected && (
                  <div style={{ marginTop:"12px", paddingTop:"12px", borderTop:"1px solid #1a1a2e", display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:"10px" }}>
                    <div style={{ background:"rgba(0,255,136,0.05)", borderRadius:"8px", padding:"10px" }}>
                      <div style={{ color:"#00ff88", fontSize:"11px", fontFamily:"monospace", fontWeight:700, marginBottom:"6px" }}>BULL STRATEGY</div>
                      <div style={{ color:"#e2e8f0", fontSize:"12px" }}>Buy CALL 7-14 days before</div>
                      <div style={{ color:"#888", fontSize:"11px", marginTop:"4px" }}>Ride IV expansion, EXIT before report</div>
                      <div style={{ color:"#00ff88", fontSize:"11px", marginTop:"4px", fontFamily:"monospace" }}>Max $1.80 premium</div>
                    </div>
                    <div style={{ background:"rgba(255,68,68,0.05)", borderRadius:"8px", padding:"10px" }}>
                      <div style={{ color:"#ff4444", fontSize:"11px", fontFamily:"monospace", fontWeight:700, marginBottom:"6px" }}>IV CRUSH TRAP</div>
                      <div style={{ color:"#e2e8f0", fontSize:"12px" }}>Options lose 30-70% after report</div>
                      <div style={{ color:"#888", fontSize:"11px", marginTop:"4px" }}>Even right direction = losing trade</div>
                      <div style={{ color:"#ff4444", fontSize:"11px", marginTop:"4px", fontFamily:"monospace" }}>Never hold through earnings</div>
                    </div>
                    <div style={{ background:"rgba(0,212,255,0.05)", borderRadius:"8px", padding:"10px" }}>
                      <div style={{ color:"#00d4ff", fontSize:"11px", fontFamily:"monospace", fontWeight:700, marginBottom:"6px" }}>ORACLE SIGNAL</div>
                      <div style={{ color:"#e2e8f0", fontSize:"12px" }}>{e.daysUntil !== null ? e.daysUntil + " days until report" : "Date TBD"}</div>
                      <div style={{ color:"#888", fontSize:"11px", marginTop:"4px" }}>Window: {e.earningsDate}{e.earningsDateEnd && e.earningsDateEnd!=="TBD" ? " – " + e.earningsDateEnd : ""}</div>
                      <div style={{ color:"#00d4ff", fontSize:"11px", marginTop:"4px", fontFamily:"monospace" }}>Watch insider flow 30d prior</div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && !loading && (
            <div style={{ color:"#555", fontFamily:"monospace", fontSize:"13px", padding:"20px", textAlign:"center" }}>
              No earnings found for this filter — try "All"
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div style={{ display:"flex", gap:"16px", flexWrap:"wrap", fontSize:"11px", fontFamily:"monospace", color:"#555", borderTop:"1px solid #1a1a2e", paddingTop:"12px" }}>
        <span style={{color:"#ff4444"}}>■ 0-3 days: IV crush danger</span>
        <span style={{color:"#ff6600"}}>■ 4-7 days: Exit window</span>
        <span style={{color:"#ffd700"}}>■ 8-14 days: Optimal entry</span>
        <span style={{color:"#00d4ff"}}>■ 15-30 days: Early watch</span>
        <span style={{color:"#555"}}>EST = estimated (Yahoo Finance)</span>
      </div>
    </div>
  );
}