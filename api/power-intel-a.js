const corsHeaders = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type,x-nexus-key","Content-Type":"application/json"};

function validateApiKey(req) {
  const key = req.headers["x-nexus-key"] || req.query?.["x-nexus-key"];
  return key === (process.env.NEXUS_API_KEY || "nexus-axl-agent-key");
}

async function callClaude(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {"Content-Type":"application/json","x-api-key":process.env.ANTHROPIC_API_KEY||process.env.VITE_ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01"},
    body: JSON.stringify({model:"claude-sonnet-4-6",max_tokens:600,messages:[{role:"user",content:prompt}]}),
    signal: AbortSignal.timeout(8000),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content?.[0]?.text || "";
}

let cache = null, cacheTime = null;
const TTL = 4*60*60*1000;

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { Object.entries(corsHeaders).forEach(([k,v])=>res.setHeader(k,v)); return res.status(200).end(); }
  Object.entries(corsHeaders).forEach(([k,v])=>res.setHeader(k,v));
  if (!validateApiKey(req)) return res.status(401).json({error:"Unauthorized."});
  const force = req.query.force === "true";
  const now = Date.now();
  if (cache && cacheTime && (now-cacheTime)<TTL && !force) return res.status(200).json({...cache,cached:true});
  try {
    const today = new Date().toLocaleDateString("en-CA",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
    const text = await callClaude(
      "NEXUS Power Intel. Today: "+today+". Context: Trump tariffs, Israel-Iran tensions, Fed holding, Burry bearish NVDA, Buffett bullish real assets.\n\nFill exactly:\nTRUMP_SIGNAL=BULLISH or BEARISH or MIXED\nTRUMP_NEXT_MOVE=\nTRUMP_PLAY=\nTRUMP_DIRECTION=CALL or PUT\nNETANYAHU_DESPERATION=LOW or MEDIUM or HIGH or CRITICAL\nNETANYAHU_PLAY=\nNETANYAHU_DIRECTION=CALL or PUT\nPUTIN_DESPERATION=LOW or MEDIUM or HIGH or CRITICAL\nPUTIN_PLAY=\nPUTIN_DIRECTION=CALL or PUT\nSCENARIO_A_NAME=\nSCENARIO_A_PROBABILITY=\nSCENARIO_A_PLAY=\nSCENARIO_A_DIRECTION=CALL or PUT\nSCENARIO_A_EXPIRY=\nSCENARIO_B_NAME=\nSCENARIO_B_PROBABILITY=\nSCENARIO_B_PLAY=\nSCENARIO_B_DIRECTION=CALL or PUT\nSCENARIO_B_EXPIRY=\nSCENARIO_C_NAME=\nSCENARIO_C_PROBABILITY=\nSCENARIO_C_PLAY=\nSCENARIO_C_DIRECTION=CALL or PUT\nSCENARIO_C_EXPIRY=\nTOP_PLAY_TICKER=\nTOP_PLAY_DIRECTION=CALL or PUT\nTOP_PLAY_EXPIRY=\nTOP_PLAY_THESIS=\nNETWORK_RISING=\nNETWORK_FALLING="
    );
    const g = (k) => { const m = text.match(new RegExp(k+"=([^\n]+")); return m?m[1].trim():""; };
    const result = {
      success:true,part:"A",timestamp:new Date().toISOString(),cached:false,
      profiles:{
        trump:{marketSignal:g("TRUMP_SIGNAL"),nextMove:g("TRUMP_NEXT_MOVE"),coreDriver:"",vanityTrigger:"",announcementPattern:"",currentPlay:"",signalReason:""},
        netanyahu:{coreDriver:"",survivalPlay:"",trumpLeverage:"",nextMove:"",marketSignal:"",signalReason:""},
        putin:{coreDriver:"",economicPressure:"",iranConnection:"",sanctionsPlay:"",nextMove:"",marketSignal:"",signalReason:""},
        xi:{coreDriver:"",taiwanTimeline:"",trumpTradePlay:"",nextMove:"",marketSignal:"",signalReason:""},
        kushner:{keyInvestments:"",saudiPlay:"",benefitingFrom:"",watchSectors:""},
        trumpFamily:{watchList:""},
      },
      network:{connections:[g("NETWORK_RISING"),g("NETWORK_FALLING")].filter(Boolean),iranWarThesis:"",russiaSanctionsThesis:"",netanyahuSurvivalThesis:""},
      scenarios:["A","B","C"].map(L=>({
        name:g("SCENARIO_"+L+"_NAME"),probability:g("SCENARIO_"+L+"_PROBABILITY"),trigger:"",weeks:["","","",""],
        plays:[{ticker:g("SCENARIO_"+L+"_PLAY"),direction:g("SCENARIO_"+L+"_DIRECTION").includes("PUT")?"PUT":"CALL",expiry:g("SCENARIO_"+L+"_EXPIRY"),reason:""}].filter(p=>p.ticker),
      })),
      topPlay:{ticker:g("TOP_PLAY_TICKER"),direction:g("TOP_PLAY_DIRECTION").includes("PUT")?"PUT":"CALL",expiry:g("TOP_PLAY_EXPIRY"),confidence:"HIGH",thesis:g("TOP_PLAY_THESIS")},
      psychology:{
        trump:{trigger:g("TRUMP_NEXT_MOVE"),play:g("TRUMP_PLAY"),direction:g("TRUMP_DIRECTION").includes("PUT")?"PUT":"CALL",expiry:"",confidence:"HIGH",window:""},
        netanyahu:{desperation:g("NETANYAHU_DESPERATION"),play:g("NETANYAHU_PLAY"),direction:g("NETANYAHU_DIRECTION").includes("PUT")?"PUT":"CALL",trigger:"",expiry:""},
        putin:{desperation:g("PUTIN_DESPERATION"),play:g("PUTIN_PLAY"),direction:g("PUTIN_DIRECTION").includes("PUT")?"PUT":"CALL",trigger:"",expiry:""},
        networkRising:g("NETWORK_RISING"),networkFalling:g("NETWORK_FALLING"),timingEdge:"",
      },
      community:{topDD:{ticker:"",direction:"",thesis:"",upvotes:""},consensus:{ticker:"",direction:""},contrarian:{signal:"",ticker:""}},
      probabilityScores:[],riseFallPairs:[],
      highestConviction:{ticker:g("TOP_PLAY_TICKER"),direction:g("TOP_PLAY_DIRECTION").includes("PUT")?"PUT":"CALL",expiry:g("TOP_PLAY_EXPIRY"),signals:"Geopolitical+Macro+Whale",probability:"72%",thesis:g("TOP_PLAY_THESIS")},
    };
    cache=result; cacheTime=now;
    return res.status(200).json(result);
  } catch(err) { return res.status(500).json({error:err.message}); }
}
