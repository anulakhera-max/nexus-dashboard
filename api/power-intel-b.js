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
      "NEXUS Market Intel. Today: "+today+". Context: AI capex boom, gold at highs, copper bullish, tariffs disrupting supply chains, Fed holding.\n\nFill exactly:\nAI_WINNER1=\nAI_WINNER1_REASON=\nAI_WINNER2=\nAI_WINNER2_REASON=\nAI_LOSER1=\nAI_LOSER1_REASON=\nAI_CALL=\nAI_CALL_EXPIRY=\nAI_PUT=\nAI_PUT_EXPIRY=\nGOLD_OUTLOOK=BULLISH or BEARISH\nGOLD_DRIVER=\nSILVER_OUTLOOK=BULLISH or BEARISH\nCOPPER_OUTLOOK=BULLISH or BEARISH\nURAN_OUTLOOK=BULLISH or BEARISH\nLITH_OUTLOOK=BULLISH or BEARISH\nMINING1=\nMINING1_DIRECTION=CALL or PUT\nMINING1_EXPIRY=\nMINING1_REASON=\nMINING2=\nMINING2_DIRECTION=CALL or PUT\nMINING2_EXPIRY=\nMINING2_REASON=\nFED_SIGNAL=HAWKISH or DOVISH or NEUTRAL\nFED_REASON=\nNEXT_EVENT=\nRATE_PLAY=\nRATE_DIRECTION=CALL or PUT\nRATE_EXPIRY=\nBTC_SIGNAL=BULLISH or BEARISH or NEUTRAL\nBTC_REASON=\nCRYPTO_PLAY=\nCRYPTO_DIRECTION=CALL or PUT\nPENNY1=\nPENNY1_CATALYST=\nPENNY1_DIRECTION=CALL or PUT or STOCK\nPENNY2=\nPENNY2_CATALYST=\nPENNY2_DIRECTION=CALL or PUT or STOCK"
    );
    const g = (k) => { const m = text.match(new RegExp(k+"=([^\n]+")); return m?m[1].trim():""; };
    const result = {
      success:true,part:"B",timestamp:new Date().toISOString(),cached:false,
      aiEcosystem:{
        hardwareWinners:[{ticker:g("AI_WINNER1"),reason:g("AI_WINNER1_REASON")},{ticker:g("AI_WINNER2"),reason:g("AI_WINNER2_REASON")}].filter(h=>h.ticker),
        hardwareLosers:[{ticker:g("AI_LOSER1"),reason:g("AI_LOSER1_REASON")}].filter(h=>h.ticker),
        energyPlays:[],mineralPlays:[],datacenterPlay:{},ma:{},
        inversePairs:[],historicalPattern:"",
        topCall:{ticker:g("AI_CALL"),expiry:g("AI_CALL_EXPIRY")},
        topPut:{ticker:g("AI_PUT"),expiry:g("AI_PUT_EXPIRY")},
      },
      mining:{
        outlooks:[
          {metal:"Gold",outlook:g("GOLD_OUTLOOK"),driver:g("GOLD_DRIVER")},
          {metal:"Silver",outlook:g("SILVER_OUTLOOK"),driver:""},
          {metal:"Copper",outlook:g("COPPER_OUTLOOK"),driver:""},
          {metal:"Uranium",outlook:g("URAN_OUTLOOK"),driver:""},
          {metal:"Lithium",outlook:g("LITH_OUTLOOK"),driver:""},
        ],
        hotPicks:[
          {ticker:g("MINING1"),direction:g("MINING1_DIRECTION").includes("PUT")?"PUT":"CALL",expiry:g("MINING1_EXPIRY"),reason:g("MINING1_REASON")},
          {ticker:g("MINING2"),direction:g("MINING2_DIRECTION").includes("PUT")?"PUT":"CALL",expiry:g("MINING2_EXPIRY"),reason:g("MINING2_REASON")},
        ].filter(p=>p.ticker),
        maTarget:"",maReason:"",redditBuzz:"",
      },
      macro:{fedSignal:g("FED_SIGNAL"),fedReason:g("FED_REASON"),nextEvent:g("NEXT_EVENT"),nextEventDate:"",marketImpact:"",rateTrade:{direction:g("RATE_DIRECTION").includes("PUT")?"PUT":"CALL",ticker:g("RATE_PLAY"),expiry:g("RATE_EXPIRY")}},
      cryptoSignal:{btcSignal:g("BTC_SIGNAL"),btcReason:g("BTC_REASON"),equityImpact:"",play:{ticker:g("CRYPTO_PLAY"),direction:g("CRYPTO_DIRECTION").includes("PUT")?"PUT":"CALL",expiry:""}},
      pharma:{pdufa:[],maTargets:[],redditBuzz:""},
      pennyStocks:{
        picks:[
          {ticker:g("PENNY1"),catalyst:g("PENNY1_CATALYST"),direction:g("PENNY1_DIRECTION"),reason:""},
          {ticker:g("PENNY2"),catalyst:g("PENNY2_CATALYST"),direction:g("PENNY2_DIRECTION"),reason:""},
        ].filter(p=>p.ticker),
        squeezeCandidate:"",squeezeReason:"",avoid:"",avoidReason:"",
      },
      microstructure:{pcRatio:"",pcSignal:"",squeezeTicker:"",squeezeReason:"",insiderSignal:"",insiderTicker:"",insiderDirection:"",unusualOptions:"",optionsTicker:"",optionsDirection:"CALL"},
      seasonal:{pattern:"",trade:"",ticker:"",direction:"CALL",expiry:"",confidence:""},
    };
    cache=result; cacheTime=now;
    return res.status(200).json(result);
  } catch(err) { return res.status(500).json({error:err.message}); }
}
