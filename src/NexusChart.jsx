import { useEffect, useRef, useState } from "react";
export default function NexusChart({ ticker = "NVDA", height = 400 }) {
  const chartRef = useRef(null);
  const chartInst = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  useEffect(() => {
    let destroyed = false;
    async function init() {
      setLoading(true); setError(null);
      try {
        if (!window.LightweightCharts) {
          await new Promise((res, rej) => {
            const s = document.createElement("script");
            s.src = "https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js";
            s.onload = res; s.onerror = rej;
            document.head.appendChild(s);
          });
        }
        if (destroyed || !chartRef.current) return;
        const LC = window.LightweightCharts;
        const chart = LC.createChart(chartRef.current, {
          width: chartRef.current.clientWidth, height,
          layout: { background: { color: "#0a0a0f" }, textColor: "#e2e8f0" },
          grid: { vertLines: { color: "#1a1a2e" }, horzLines: { color: "#1a1a2e" } },
          rightPriceScale: { borderColor: "#2d2d44" },
          timeScale: { borderColor: "#2d2d44", timeVisible: true },
        });
        chartInst.current = chart;
        const cs = chart.addCandlestickSeries({ upColor: "#00ff88", downColor: "#ff4444", borderVisible: false, wickUpColor: "#00ff88", wickDownColor: "#ff4444" });
        const vs = chart.addHistogramSeries({ color: "#26a69a", priceFormat: { type: "volume" }, priceScaleId: "vol", scaleMargins: { top: 0.85, bottom: 0 } });
        chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
        const end = Math.floor(Date.now() / 1000);
        const start = end - 90 * 86400;
        const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/" + ticker + "?interval=1d&period1=" + start + "&period2=" + end, { headers: { "User-Agent": "Mozilla/5.0" } });
        const d = await r.json();
        const result = d && d.chart && d.chart.result && d.chart.result[0];
        if (!result) throw new Error("No data for " + ticker);
        const ts = result.timestamp || [];
        const q = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
        const candles = ts.map((t, i) => ({ time: t, open: +((q.open[i]||0).toFixed(2)), high: +((q.high[i]||0).toFixed(2)), low: +((q.low[i]||0).toFixed(2)), close: +((q.close[i]||0).toFixed(2)), volume: q.volume[i]||0 })).filter(c => c.open > 0);
        cs.setData(candles);
        const avgVol = candles.reduce((s, c) => s + c.volume, 0) / candles.length;
        vs.setData(candles.map(c => ({ time: c.time, value: c.volume, color: c.volume > avgVol * 1.5 ? "rgba(0,212,255,0.7)" : c.close >= c.open ? "rgba(0,255,136,0.3)" : "rgba(255,68,68,0.3)" })));
        const markers = [];
        for (let i = 1; i < candles.length; i++) {
          const c = candles[i]; const vr = avgVol > 0 ? c.volume / avgVol : 1; const pm = Math.abs((c.close - c.open) / c.open * 100);
          if (vr > 2 && pm < 1) markers.push({ time: c.time, position: "belowBar", color: "#00d4ff", shape: "arrowUp", text: "DARK POOL", size: 1 });
          else if (vr > 2.5 && pm > 3) markers.push({ time: c.time, position: c.close > c.open ? "belowBar" : "aboveBar", color: c.close > c.open ? "#00ff88" : "#ff4444", shape: c.close > c.open ? "arrowUp" : "arrowDown", text: "INST", size: 1 });
        }
        cs.setMarkers(markers);
        chart.timeScale().fitContent();
        const l = candles[candles.length - 1]; const pv = candles[candles.length - 2];
        const chg = pv ? +((l.close - pv.close) / pv.close * 100).toFixed(2) : 0;
        const vr2 = +(l.volume / avgVol).toFixed(2);
        setInfo({ price: l.close, change: chg, volRatio: vr2, signal: vr2 > 2 && Math.abs(chg) < 1 ? "ACCUMULATION" : vr2 > 3 ? "INSTITUTIONAL" : vr2 > 2 && chg < -1.5 ? "DISTRIBUTION" : "NORMAL" });
        const ro = new ResizeObserver(() => { if (chartRef.current && chart) chart.applyOptions({ width: chartRef.current.clientWidth }); });
        ro.observe(chartRef.current);
        if (!destroyed) setLoading(false);
      } catch(e) { if (!destroyed) { setError(e.message); setLoading(false); } }
    }
    init();
    return () => { destroyed = true; if (chartInst.current) { chartInst.current.remove(); chartInst.current = null; } };
  }, [ticker]);
  const sc = info && info.signal === "ACCUMULATION" ? "#00d4ff" : info && info.signal === "INSTITUTIONAL" ? "#ffd700" : info && info.signal === "DISTRIBUTION" ? "#ff4444" : "#666";
  return (
    <div style={{ background: "#0a0a0f", borderRadius: "12px", border: "1px solid #2d2d44", overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid #1a1a2e", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <span style={{ color: "#00d4ff", fontWeight: 700, fontSize: "15px", fontFamily: "monospace" }}>{ticker}</span>
          {info && <span style={{ color: "#e2e8f0", fontSize: "14px", fontWeight: 600 }}>${info.price.toFixed(2)}</span>}
          {info && <span style={{ color: info.change >= 0 ? "#00ff88" : "#ff4444", fontSize: "13px" }}>{info.change >= 0 ? "+" : ""}{info.change}%</span>}
        </div>
        {info && <span style={{ background: sc + "22", color: sc, border: "1px solid " + sc, borderRadius: "6px", padding: "3px 8px", fontSize: "11px", fontWeight: 700, fontFamily: "monospace" }}>{info.signal} {info.volRatio}x VOL</span>}
      </div>
      <div style={{ position: "relative" }}>
        {(loading || error) && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0f", zIndex: 10, height: height + "px" }}>
          {loading && <span style={{ color: "#00d4ff", fontFamily: "monospace", fontSize: "13px" }}>LOADING {ticker}...</span>}
          {error && <span style={{ color: "#ff4444", fontFamily: "monospace", fontSize: "12px" }}>Error: {error}</span>}
        </div>}
        <div ref={chartRef} style={{ width: "100%", height: height + "px" }} />
      </div>
      <div style={{ padding: "6px 16px", borderTop: "1px solid #1a1a2e", display: "flex", gap: "16px", fontSize: "10px", fontFamily: "monospace", color: "#555" }}>
        <span style={{ color: "#00d4ff" }}>&#8593; DARK POOL = stealth accumulation</span>
        <span style={{ color: "#00ff88" }}>&#8593; INST = institutional bull</span>
        <span style={{ color: "#ff4444" }}>&#8595; INST = distribution</span>
      </div>
    </div>
  );
}
