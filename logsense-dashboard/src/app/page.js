"use client";

import { useEffect, useState, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from "recharts";
import { AlertTriangle, Activity, Zap, Brain, Shield, Radio, ChevronDown, ChevronUp, Sparkles } from "lucide-react";

const API = "http://localhost:8000";

function safeNum(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function computeHealthScore(requests, errors, latency) {
  const req = safeNum(requests);
  const err = safeNum(errors);
  const lat = safeNum(latency);
  if (req === 0) return 100;
  const errorRate    = err / req;
  const latencyScore = Math.max(0, 100 - lat / 5);
  const errorScore   = Math.max(0, 100 - errorRate * 200);
  return Math.round(latencyScore * 0.4 + errorScore * 0.6);
}

function healthColor(score) {
  if (score >= 80) return "#10b981";
  if (score >= 50) return "#f59e0b";
  return "#ef4444";
}

function generateLocalAnalysis(data, alerts) {
  if (!data || data.length === 0)
    return "No metrics data yet. Start the log generator — the first analysis will appear within 10 seconds.";

  const totalReq  = data.reduce((a, b) => a + safeNum(b.requests), 0);
  const totalErr  = data.reduce((a, b) => a + safeNum(b.errors), 0);
  const lats      = data.map(d => safeNum(d.latency)).filter(x => x > 0);
  const avgLat    = lats.length ? lats.reduce((a, b) => a + b, 0) / lats.length : 0;
  const errorRate = totalReq > 0 ? totalErr / totalReq : 0;

  const svcMap = {};
  data.forEach(d => {
    const svc = d.service;
    if (!svcMap[svc]) svcMap[svc] = { req: 0, err: 0, lats: [] };
    svcMap[svc].req += safeNum(d.requests);
    svcMap[svc].err += safeNum(d.errors);
    svcMap[svc].lats.push(safeNum(d.latency));
  });

  const svcStats = Object.entries(svcMap).map(([name, m]) => {
    const al   = m.lats.filter(x => x > 0);
    const avgL = al.length ? al.reduce((a, b) => a + b, 0) / al.length : 0;
    return { name, errorRate: m.req > 0 ? m.err / m.req : 0, avgLat: avgL, score: computeHealthScore(m.req, m.err, avgL) };
  });

  const worstSvc     = [...svcStats].sort((a, b) => a.score - b.score)[0];
  const anomalyCount = alerts.filter(a => a.type === "ANOMALY").length;
  const highErrCount = alerts.filter(a => a.type === "HIGH_ERROR").length;
  const highLatCount = alerts.filter(a => a.type === "HIGH_LATENCY").length;

  const lines = [];

  if (errorRate > 0.5)
    lines.push(`🔴 System is CRITICAL — ${(errorRate * 100).toFixed(0)}% of all requests are failing. Immediate intervention required.`);
  else if (errorRate > 0.3)
    lines.push(`🟡 System is DEGRADED — error rate is ${(errorRate * 100).toFixed(0)}%, above the 30% alert threshold.`);
  else if (errorRate > 0.1)
    lines.push(`🟠 System health is FAIR — error rate of ${(errorRate * 100).toFixed(0)}% is elevated but sub-critical.`);
  else
    lines.push(`🟢 System health is GOOD — overall error rate is ${(errorRate * 100).toFixed(0)}%, within acceptable bounds.`);

  if (worstSvc) {
    lines.push(worstSvc.score < 50
      ? `⚠️ ${worstSvc.name} is most at-risk (score ${worstSvc.score}/100) — ${(worstSvc.errorRate * 100).toFixed(0)}% errors, ${worstSvc.avgLat.toFixed(0)}ms avg latency.`
      : `📊 ${worstSvc.name} is the weakest service (score ${worstSvc.score}/100), still within acceptable range.`
    );
  }

  if (avgLat > 400)
    lines.push(`🐢 Average latency is critically high at ${avgLat.toFixed(0)}ms — suspects: DB bottleneck, CPU saturation, or downstream timeout.`);
  else if (avgLat > 250)
    lines.push(`⏱️ Average latency of ${avgLat.toFixed(0)}ms is elevated. Profile /checkout or /payment — they're typically the slowest.`);

  if (anomalyCount > 0)
    lines.push(`ML anomaly detector fired ${anomalyCount} time(s). Possible causes: memory leak, traffic spike, or upstream dependency failure.`);

  if (highErrCount > 0 && worstSvc)
    lines.push(`Action: Inspect ${worstSvc.name} logs in the Live Stream below. Check recent deployments for breaking changes.`);
  else if (highLatCount > 0)
    lines.push(`Action: Profile slow services — latency spikes often trace to N+1 DB queries or connection pool exhaustion.`);
  else if (errorRate < 0.1 && avgLat < 200)
    lines.push(`No immediate action needed. Pipeline and consumer workers are performing well.`);
  else
    lines.push(`Monitor for 2–3 more minutes. If error rate stays above 30%, restart the affected service or scale Kafka consumers.`);

  return lines.join("\n\n");
}

function KpiCard({ icon, label, value, sub, accent }) {
  return (
    <div style={{ ...S.card, borderTop: `3px solid ${accent}` }}>
      <div style={{ color: accent, fontSize: 28 }}>{icon}</div>
      <div>
        <p style={S.cardLabel}>{label}</p>
        <h2 style={{ margin: 0, fontSize: 28, fontFamily: "'JetBrains Mono', monospace" }}>{String(value)}</h2>
        {sub && <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>{sub}</p>}
      </div>
    </div>
  );
}

function ServiceHealth({ data }) {
  const svcMap = {};
  data.forEach(d => {
    const svc = d.service;
    if (!svcMap[svc]) svcMap[svc] = { requests: 0, errors: 0, lats: [] };
    svcMap[svc].requests += safeNum(d.requests);
    svcMap[svc].errors   += safeNum(d.errors);
    svcMap[svc].lats.push(safeNum(d.latency));
  });

  return (
    <div style={S.panel}>
      <h2 style={S.panelTitle}><Shield size={16} style={{ marginRight: 6 }} />Service Health Scores</h2>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {Object.entries(svcMap).map(([svc, m]) => {
          const validLats = m.lats.filter(x => x > 0);
          const avgLat    = validLats.length ? validLats.reduce((a, b) => a + b, 0) / validLats.length : 0;
          const score     = computeHealthScore(m.requests, m.errors, avgLat);
          const color     = healthColor(score);
          return (
            <div key={svc} style={{ ...S.healthCard, borderColor: color }}>
              <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1 }}>{svc}</div>
              <div style={{ fontSize: 42, fontWeight: 800, color, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.1 }}>
                {String(score)}
              </div>
              <div style={{ fontSize: 11, color }}>
                {score >= 80 ? "● Healthy" : score >= 50 ? "◐ Degraded" : "○ Critical"}
              </div>
              <div style={{ fontSize: 10, color: "#475569", marginTop: 4 }}>
                {String(m.requests)} reqs · {String(m.errors)} errs · {String(Math.round(avgLat))}ms
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LiveLogFeed({ logs }) {
  const feedRef = useRef(null);

  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  const levelStyle = {
    ERROR: { bg: "#3b0a0a", border: "#ef4444", badge: "#ef4444", text: "#fff" },
    WARN:  { bg: "#3b2000", border: "#f59e0b", badge: "#f59e0b", text: "#000" },
    INFO:  { bg: "#0a1628", border: "#3b82f6", badge: "#3b82f6", text: "#fff" },
  };

  return (
    <div style={S.panel}>
      <h2 style={S.panelTitle}><Radio size={16} style={{ marginRight: 6 }} />Live Log Stream</h2>
      <div ref={feedRef} style={S.logFeed}>
        {logs.length === 0 && (
          <div style={{ color: "#475569", padding: 8, fontSize: 12 }}>Waiting for logs…</div>
        )}
        {logs.map((log, i) => {
          const lv = levelStyle[log.log_level] || levelStyle.INFO;
          return (
            <div key={i} style={{ ...S.logEntry, background: lv.bg, borderLeft: `3px solid ${lv.border}` }}>
              <span style={{ background: lv.badge, color: lv.text, fontSize: 9, padding: "1px 6px", borderRadius: 3, fontWeight: 700, marginRight: 8, flexShrink: 0 }}>
                {log.log_level || "INFO"}
              </span>
              <span style={{ color: "#64748b", marginRight: 8, flexShrink: 0 }}>[{log.service_name}]</span>
              <span style={{ color: "#cbd5e1", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {log.message}
              </span>
              <span style={{ color: "#334155", marginLeft: 12, fontSize: 10, flexShrink: 0 }}>
                {log.endpoint} · {log.latency_ms}ms
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AIInsightPanel({ data, alerts }) {
  const [summary, setSummary]   = useState("");
  const [loading, setLoading]   = useState(false);
  const [expanded, setExpanded] = useState(true);
  const hasRun                  = useRef(false);

  const runAnalysis = () => {
    setLoading(true);
    setSummary("");
    setTimeout(() => {
      setSummary(generateLocalAnalysis(data, alerts));
      setLoading(false);
    }, 700);
  };

  useEffect(() => {
    if (data.length > 0 && !hasRun.current) {
      hasRun.current = true;
      runAnalysis();
    }
  }, [data]);

  return (
    <div style={{ ...S.panel, borderLeft: "3px solid #8b5cf6" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={S.panelTitle}>
          <Brain size={16} style={{ marginRight: 6 }} />
          AI System Analyst
          <span style={{ fontSize: 10, color: "#8b5cf6", marginLeft: 8, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
            rule-based · offline
          </span>
        </h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={runAnalysis} disabled={loading} style={S.aiBtn}>
            <Sparkles size={12} style={{ marginRight: 4 }} />
            {loading ? "Analyzing…" : "Refresh"}
          </button>
          <button onClick={() => setExpanded(e => !e)} style={S.ghostBtn}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>
      {expanded && (
        <div style={S.aiBox}>
          {loading ? (
            <div style={{ color: "#8b5cf6", fontSize: 13 }}>
              ● ● ●
              <span style={{ color: "#475569", marginLeft: 10 }}>Analyzing system state…</span>
            </div>
          ) : (
            <p style={{ margin: 0, color: "#cbd5e1", lineHeight: 1.9, fontSize: 13, whiteSpace: "pre-wrap" }}>
              {summary || "Click Refresh to run analysis."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function AlertsPanel({ alerts }) {
  const grouped = {};
  alerts.forEach(a => {
    if (!grouped[a.type]) grouped[a.type] = [];
    grouped[a.type].push(a);
  });

  const typeStyle = {
    HIGH_ERROR:   { color: "#ef4444", icon: "🔴" },
    HIGH_LATENCY: { color: "#f59e0b", icon: "🟡" },
    ANOMALY:      { color: "#a78bfa", icon: "🔮" },
  };

  return (
    <div style={S.panel}>
      <h2 style={S.panelTitle}><AlertTriangle size={16} style={{ marginRight: 6 }} />Alert Intelligence</h2>
      {Object.keys(grouped).length === 0
        ? <p style={{ color: "#475569", fontSize: 13 }}>✓ All systems nominal</p>
        : Object.entries(grouped).map(([type, items]) => {
            const ts = typeStyle[type] || { color: "#94a3b8", icon: "⚪" };
            return (
              <div key={type} style={{ marginBottom: 14 }}>
                <div style={{ color: ts.color, fontWeight: 700, marginBottom: 6, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>
                  {ts.icon} {type} ({items.length})
                </div>
                {items.map((a, i) => (
                  <div key={i} style={{ ...S.alertItem, borderLeft: `3px solid ${ts.color}` }}>
                    <span style={{ color: "#64748b", flexShrink: 0 }}>{a.service}</span>
                    <span style={{ color: "#e2e8f0", marginLeft: 8, flex: 1 }}>{a.message}</span>
                    <span style={{ color: "#334155", marginLeft: 8, fontSize: 10, flexShrink: 0 }}>
                      {a.time ? String(a.time).slice(11, 19) : ""}
                    </span>
                  </div>
                ))}
              </div>
            );
          })
      }
    </div>
  );
}

export default function Dashboard() {
  const [data, setData]         = useState([]);
  const [alerts, setAlerts]     = useState([]);
  const [liveLogs, setLiveLogs] = useState([]);
  const [clock, setClock] = useState("");

  useEffect(() => {
    const tick = () => {
      const d  = new Date();
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      const ss = String(d.getSeconds()).padStart(2, "0");
      setClock(`${hh}:${mm}:${ss}`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const go = async () => {
      try { const r = await fetch(`${API}/metrics`); const j = await r.json(); if (Array.isArray(j)) setData(j); } catch {}
    };
    go();
    const iv = setInterval(go, 3000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const go = async () => {
      try { const r = await fetch(`${API}/alerts`); const j = await r.json(); if (Array.isArray(j)) setAlerts(j); } catch {}
    };
    go();
    const iv = setInterval(go, 5000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const go = async () => {
      try { const r = await fetch(`${API}/logs/recent`); const j = await r.json(); if (Array.isArray(j)) setLiveLogs(j); } catch {}
    };
    go();
    const iv = setInterval(go, 2000);
    return () => clearInterval(iv);
  }, []);

  const totalRequests = data.reduce((a, b) => a + safeNum(b.requests), 0);
  const totalErrors   = data.reduce((a, b) => a + safeNum(b.errors), 0);
  const validLats     = data.map(d => safeNum(d.latency)).filter(x => x > 0);
  const avgLatency    = validLats.length
    ? (validLats.reduce((a, b) => a + b, 0) / validLats.length).toFixed(1)
    : "0.0";
  const errorRate = totalRequests > 0
    ? ((totalErrors / totalRequests) * 100).toFixed(1)
    : "0.0";

  return (
    <div style={S.page}>

      {/* Header */}
      <div style={S.header}>
        <div>
          <h1 style={S.title}>LOGSENSE</h1>
          <p style={S.subtitle}>Distributed Log Analytics &amp; Observability Platform</p>
        </div>
        <div style={S.pill}>
          <span style={S.dot} />
          {clock ? `Live · ${clock}` : "Live"}
        </div>
      </div>

      {/* KPIs */}
      <div style={S.kpiRow}>
        <KpiCard icon={<Activity size={24} />}      label="Total Requests" value={String(totalRequests)} sub="last window"               accent="#3b82f6" />
        <KpiCard icon={<AlertTriangle size={24} />} label="Total Errors"   value={String(totalErrors)}   sub={`${errorRate}% error rate`} accent="#ef4444" />
        <KpiCard icon={<Zap size={24} />}           label="Avg Latency"    value={`${avgLatency}ms`}      sub="across services"            accent="#f59e0b" />
        <KpiCard icon={<Shield size={24} />}        label="Active Alerts"  value={String(alerts.length)} sub="grouped by type"             accent="#8b5cf6" />
      </div>

      <AIInsightPanel data={data} alerts={alerts} />

      {data.length > 0 && <ServiceHealth data={data} />}

      <div style={S.splitRow}>
        <div style={{ ...S.panel, flex: 2, minWidth: 0 }}>
          <h2 style={S.panelTitle}><Activity size={16} style={{ marginRight: 6 }} />Service Metrics Timeline</h2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data}>
              <CartesianGrid stroke="#1e293b" />
              <XAxis dataKey="service" stroke="#475569" tick={{ fontSize: 11 }} />
              <YAxis stroke="#475569" tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#94a3b8" }}
              />
              <Line dataKey="latency"  stroke="#f59e0b" strokeWidth={2} dot={false} name="Latency ms" />
              <Line dataKey="requests" stroke="#3b82f6" strokeWidth={2} dot={false} name="Requests"   />
              <Line dataKey="errors"   stroke="#ef4444" strokeWidth={2} dot={false} name="Errors"     />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", gap: 20, marginTop: 10 }}>
            {[["#f59e0b","Latency (ms)"], ["#3b82f6","Requests"], ["#ef4444","Errors"]].map(([c, l]) => (
              <span key={l} style={{ fontSize: 11, color: "#64748b" }}>
                <span style={{ color: c }}>─ </span>{l}
              </span>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <AlertsPanel alerts={alerts} />
        </div>
      </div>

      <LiveLogFeed logs={liveLogs} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Syne:wght@700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #020817; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 4px; }
      `}</style>
    </div>
  );
}

const S = {
  page:      { padding: "24px 32px", background: "#020817", minHeight: "100vh", color: "#f1f5f9", fontFamily: "'JetBrains Mono', monospace" },
  header:    { display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 28, borderBottom: "1px solid #0f172a", paddingBottom: 20 },
  title:     { margin: 0, fontSize: 32, fontFamily: "'Syne', sans-serif", fontWeight: 800, letterSpacing: 6, background: "linear-gradient(90deg,#3b82f6,#8b5cf6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
  subtitle:  { margin: "4px 0 0", color: "#334155", fontSize: 12, letterSpacing: 1 },
  pill:      { background: "#0f172a", border: "1px solid #1e293b", borderRadius: 20, padding: "6px 14px", fontSize: 11, color: "#94a3b8", display: "flex", alignItems: "center", gap: 6 },
  dot:       { width: 8, height: 8, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 6px #10b981", flexShrink: 0, display: "inline-block" },
  kpiRow:    { display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" },
  card:      { flex: 1, minWidth: 160, background: "#0f172a", padding: "18px 20px", borderRadius: 10, display: "flex", alignItems: "center", gap: 14, border: "1px solid #1e293b" },
  cardLabel: { margin: 0, color: "#475569", fontSize: 10, textTransform: "uppercase", letterSpacing: 1 },
  panel:     { background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, padding: "20px", marginBottom: 16 },
  panelTitle:{ margin: "0 0 16px", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, color: "#64748b", display: "flex", alignItems: "center" },
  splitRow:  { display: "flex", gap: 16, marginBottom: 16 },
  healthCard:{ background: "#020817", border: "1px solid", borderRadius: 10, padding: "16px 20px", minWidth: 140, textAlign: "center" },
  logFeed:   { height: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 },
  logEntry:  { display: "flex", alignItems: "center", padding: "6px 10px", borderRadius: 4, fontSize: 11 },
  aiBox:     { background: "#020817", border: "1px solid #1e2a4a", borderRadius: 8, padding: "16px 20px", minHeight: 80, fontSize: 13 },
  aiBtn:     { background: "linear-gradient(135deg,#4f46e5,#7c3aed)", border: "none", borderRadius: 6, color: "white", padding: "6px 14px", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", fontFamily: "'JetBrains Mono',monospace" },
  ghostBtn:  { background: "transparent", border: "1px solid #1e293b", borderRadius: 6, color: "#64748b", padding: "6px 10px", cursor: "pointer" },
  alertItem: { display: "flex", alignItems: "center", padding: "7px 12px", background: "#020817", borderRadius: 4, marginBottom: 4, fontSize: 11 },
};