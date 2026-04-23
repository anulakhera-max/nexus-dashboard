import { useState } from "react";
import NexusChart from "./NexusChart";
const TICKERS = ["NVDA","AAPL","PLTR","TSLA","AMD","META","MSFT","COIN","QQQ","SPY"];
export default function ChartsTab() {
  const [sel, setSel] = useState("NVDA");
  const [custom, setCustom] = useState("");
  return (
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        {TICKERS.map(t => (
          <button key={t} onClick={() => setSel(t)} style={{ background: sel===t?"rgba(0,212,255,0.2)":"rgba(255,255,255,0.05)", color: sel===t?"#00d4ff":"#888", border: sel===t?"1px solid #00d4ff":"1px solid #333", borderRadius: "6px", padding: "5px 12px", fontSize: "12px", fontFamily: "monospace", cursor: "pointer", fontWeight: sel===t?700:400 }}>{t}</button>
        ))}
        <input value={custom} onChange={e=>setCustom(e.target.value.toUpperCase())} placeholder="TICKER" style={{ background: "#111", border: "1px solid #333", color: "#e2e8f0", borderRadius: "6px", padding: "5px 10px", fontSize: "12px", fontFamily: "monospace", width: "80px" }} />
        <button onClick={()=>{if(custom.length>0)setSel(custom);}} style={{ background: "rgba(0,212,255,0.1)", color: "#00d4ff", border: "1px solid #00d4ff", borderRadius: "6px", padding: "5px 12px", fontSize: "12px", fontFamily: "monospace", cursor: "pointer" }}>CHART</button>
      </div>
      <NexusChart ticker={sel} height={420} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        {["QQQ","SPY"].map(t => <div key={t} onClick={()=>setSel(t)} style={{cursor:"pointer"}}><NexusChart ticker={t} height={200} /></div>)}
      </div>
    </div>
  );
}
