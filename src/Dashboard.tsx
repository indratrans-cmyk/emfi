import { useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";

const S = {
  bg:       "#030806",
  surface:  "#0c1810",
  card:     "#0f1e12",
  border:   "#1a3325",
  text:     "#ddeee5",
  muted:    "#6a9478",
  dim:      "#374f3f",
  primary:  "#00e56b",
  danger:   "#ff4444",
  warning:  "#ffb230",
};

interface DashboardData {
  registered: boolean;
  guardEnabled: boolean;
  telegramLinked: boolean;
  emailLinked: boolean;
  registeredAt: number | null;
  totalAlerts: number;
  criticalAlerts: number;
  highAlerts: number;
  recentAlerts: Array<{
    pattern_name: string;
    severity: string;
    loss_probability: number;
    details: string;
    created_at: number;
  }>;
}

function severityColor(s: string): string {
  return { critical: S.danger, high: S.warning, medium: "#ffdd57", low: S.primary }[s] ?? S.muted;
}
function severityEmoji(s: string): string {
  return { critical: "🔴", high: "🟠", medium: "🟡", low: "🟢" }[s] ?? "⚪";
}

function timeAgo(ts: number): string {
  const d = Math.floor((Date.now() / 1000 - ts) / 86400);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  return `${d} days ago`;
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "4px 12px", borderRadius: 100,
      background: ok ? "rgba(0,229,107,0.08)" : "rgba(255,68,68,0.08)",
      border: `1px solid ${ok ? "rgba(0,229,107,0.2)" : "rgba(255,68,68,0.2)"}`,
      fontSize: 12, fontWeight: 600, color: ok ? S.primary : S.danger,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: ok ? S.primary : S.danger, display: "inline-block" }} />
      {label}
    </div>
  );
}

function StatCard({ value, label, color }: { value: string | number; label: string; color?: string }) {
  return (
    <div style={{
      background: S.surface, border: `1px solid ${S.border}`, borderRadius: 10,
      padding: "16px 20px", textAlign: "center",
    }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: color ?? S.primary, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 12, color: S.muted, marginTop: 4 }}>{label}</div>
    </div>
  );
}

function Dashboard() {
  const [addr,    setAddr]    = useState("");
  const [input,   setInput]   = useState("");
  const [data,    setData]    = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [wsConn,  setWsConn]  = useState(false);
  const [liveAlert, setLiveAlert] = useState<string | null>(null);

  const load = useCallback(async (a: string) => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res  = await fetch(`/api/dashboard?address=${encodeURIComponent(a)}`);
      const json = await res.json() as { success: boolean; data?: DashboardData; error?: string };
      if (json.success && json.data) setData(json.data);
      else setError(json.error ?? "Failed to load dashboard");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  // WebSocket subscription for live alerts
  useEffect(() => {
    if (!addr) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws?address=${addr}`);
    ws.onopen  = () => setWsConn(true);
    ws.onclose = () => setWsConn(false);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as { type: string; data?: { overallRisk: string } };
        if (msg.type === "scan_complete" && msg.data) {
          setLiveAlert(`New scan: ${msg.data.overallRisk.toUpperCase()} risk detected`);
          load(addr);
          setTimeout(() => setLiveAlert(null), 8000);
        }
      } catch { /* ignore */ }
    };
    return () => ws.close();
  }, [addr, load]);

  const submit = () => {
    const a = input.trim();
    if (!a) return;
    setAddr(a);
    load(a);
  };

  return (
    <div style={{ background: S.bg, minHeight: "100vh", color: S.text, fontFamily: "'Outfit', system-ui, sans-serif" }}>

      {/* Nav */}
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 24px", height: 60, borderBottom: `1px solid ${S.border}`,
        background: "rgba(3,8,6,0.95)", position: "sticky", top: 0, zIndex: 100,
      }}>
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <img src="/emfi-logo.png" style={{ height: 40, width: "auto" }} alt="EmeraldFi" />
          <span style={{ color: S.muted, fontSize: 13 }}>/ Dashboard</span>
        </a>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {addr && (
            <div style={{
              display: "flex", alignItems: "center", gap: 6, fontSize: 12,
              color: wsConn ? S.primary : S.muted,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: wsConn ? S.primary : S.muted, animation: wsConn ? "blink 2s infinite" : "none", display: "inline-block" }} />
              {wsConn ? "Live" : "Disconnected"}
            </div>
          )}
          <a href="/" style={{ color: S.primary, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>← Home</a>
        </div>
      </nav>

      <div style={{ maxWidth: 820, margin: "0 auto", padding: "32px 20px" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 6px" }}>Wallet Dashboard</h1>
          <p style={{ color: S.muted, margin: 0, fontSize: 14 }}>Monitor your wallet's EmeraldGuard status and alert history.</p>
        </div>

        {/* Search */}
        <div style={{ display: "flex", gap: 10, marginBottom: 32 }}>
          <input
            type="text"
            placeholder="Enter your Solana wallet address..."
            value={input}
            onChange={e => setInput(e.currentTarget.value)}
            onKeyDown={e => e.key === "Enter" && submit()}
            style={{
              flex: 1, background: S.surface, border: `1px solid ${S.border}`, borderRadius: 8,
              padding: "11px 16px", color: S.text, fontSize: 14, outline: "none",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          />
          <button
            onClick={submit}
            disabled={loading}
            style={{
              background: S.primary, color: "#030806", border: "none", borderRadius: 8,
              padding: "11px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            {loading ? "Loading…" : "View Dashboard"}
          </button>
        </div>

        {/* Live alert banner */}
        {liveAlert && (
          <div style={{
            background: "rgba(255,178,48,0.1)", border: `1px solid rgba(255,178,48,0.3)`,
            borderRadius: 8, padding: "10px 16px", marginBottom: 20, color: S.warning,
            display: "flex", alignItems: "center", gap: 8, fontSize: 14,
          }}>
            🔔 {liveAlert}
          </div>
        )}

        {error && (
          <div style={{ background: "rgba(255,68,68,0.08)", border: `1px solid rgba(255,68,68,0.2)`, borderRadius: 8, padding: "12px 16px", color: S.danger, fontSize: 14 }}>
            {error}
          </div>
        )}

        {data && (
          <>
            {/* Status row */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
              <StatusBadge ok={data.registered}     label="Registered" />
              <StatusBadge ok={data.guardEnabled}   label="Guard Active" />
              <StatusBadge ok={data.telegramLinked} label="Telegram Linked" />
              <StatusBadge ok={data.emailLinked}    label="Email Alerts" />
            </div>

            {/* Stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 28 }}>
              <StatCard value={data.totalAlerts}    label="Total Alerts" />
              <StatCard value={data.criticalAlerts} label="Critical Alerts" color={data.criticalAlerts > 0 ? S.danger : S.primary} />
              <StatCard value={data.highAlerts}     label="High Risk Alerts" color={data.highAlerts > 0 ? S.warning : S.primary} />
            </div>

            {/* Alerts list */}
            <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: `1px solid ${S.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>Recent Alerts</span>
                <span style={{ fontSize: 12, color: S.muted }}>{data.recentAlerts.length} records</span>
              </div>

              {data.recentAlerts.length === 0 ? (
                <div style={{ padding: "32px 20px", textAlign: "center", color: S.muted, fontSize: 14 }}>
                  ✅ No alerts found. Your wallet is clean.
                </div>
              ) : (
                data.recentAlerts.map((a, i) => (
                  <div key={i} style={{
                    display: "grid", gridTemplateColumns: "auto 1fr auto",
                    gap: 12, alignItems: "start", padding: "14px 20px",
                    borderBottom: i < data.recentAlerts.length - 1 ? `1px solid ${S.border}` : "none",
                  }}>
                    <span style={{ fontSize: 16, marginTop: 1 }}>{severityEmoji(a.severity)}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: severityColor(a.severity), marginBottom: 2 }}>
                        {a.pattern_name}
                      </div>
                      <div style={{ fontSize: 12, color: S.muted, lineHeight: 1.5 }}>{a.details}</div>
                    </div>
                    <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <div style={{ fontSize: 12, color: S.muted }}>{timeAgo(a.created_at)}</div>
                      <div style={{ fontSize: 11, color: S.dim, marginTop: 2 }}>
                        {(a.loss_probability * 100).toFixed(0)}% risk
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Register prompt */}
            {!data.registered && (
              <div style={{
                marginTop: 20, background: "rgba(0,229,107,0.05)", border: `1px solid rgba(0,229,107,0.15)`,
                borderRadius: 10, padding: "16px 20px",
              }}>
                <div style={{ fontWeight: 600, marginBottom: 4, color: S.primary }}>Enable Hourly Monitoring</div>
                <div style={{ fontSize: 13, color: S.muted, lineHeight: 1.6 }}>
                  Register your wallet via Telegram bot to receive automatic hourly alerts.
                  Use <code style={{ background: S.card, padding: "1px 6px", borderRadius: 4 }}>/register {addr.slice(0, 8)}...</code> in{" "}
                  <a href="https://t.me/EmeraldFinancesol_bot" target="_blank" rel="noopener noreferrer" style={{ color: S.primary }}>@EmeraldFinancesol_bot</a>
                </div>
              </div>
            )}
          </>
        )}

        {!addr && !loading && (
          <div style={{ textAlign: "center", padding: "48px 20px", color: S.muted }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🛡️</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: S.text, marginBottom: 6 }}>Enter your wallet to see monitoring status</div>
            <div style={{ fontSize: 13 }}>View alert history, guard status, and live connection</div>
          </div>
        )}

      </div>

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${S.bg}; }
        @keyframes blink { 0%,100%{opacity:1}50%{opacity:0.3} }
        input:focus { border-color: ${S.primary} !important; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: ${S.bg}; }
        ::-webkit-scrollbar-thumb { background: ${S.border}; border-radius: 3px; }
      `}</style>
    </div>
  );
}

const root = createRoot(document.body);
root.render(<Dashboard />);
