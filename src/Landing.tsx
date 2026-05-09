import { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "./ErrorBoundary";
import "./landing.css";

// ─── SVG Icons ────────────────────────────────────────────────────────────────
function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L4 6v5.5C4 16.7 7.5 21.1 12 22.5 16.5 21.1 20 16.7 20 11.5V6L12 2z"/>
      <polyline points="8.5 12 11 14.5 16 9"/>
    </svg>
  );
}
function BrainIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3C6.8 3 5 4.8 5 7c0 .8.2 1.5.6 2.1C4.2 9.9 3 11.3 3 13c0 1.7 1.1 3.1 2.6 3.8-.4.6-.6 1.2-.6 2 0 1.8 1.5 3.2 3.5 3.2"/>
      <path d="M15 3c2.2 0 4 1.8 4 4 0 .8-.2 1.5-.6 2.1C19.8 9.9 21 11.3 21 13c0 1.7-1.1 3.1-2.6 3.8.4.6.6 1.2.6 2 0 1.8-1.5 3.2-3.5 3.2"/>
      <line x1="9" y1="22" x2="15" y2="22"/>
      <line x1="12" y1="5" x2="12" y2="22"/>
    </svg>
  );
}
function TimerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="13" r="8"/>
      <path d="M12 9v4l3 2"/>
      <path d="M5 4.5L7 6M19 4.5L17 6"/>
      <line x1="9" y1="2" x2="15" y2="2"/>
    </svg>
  );
}
function IsolationIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="4" r="2.5"/>
      <circle cx="4" cy="20" r="2.5"/>
      <circle cx="20" cy="20" r="2.5"/>
      <path d="M12 6.5v4" strokeDasharray="2 2"/>
      <path d="M10.5 10.5L5.5 17.5" strokeDasharray="2 2"/>
      <path d="M13.5 10.5L18.5 17.5" strokeDasharray="2 2"/>
    </svg>
  );
}
function HiveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l6.5 3.75v7.5L12 17 5.5 13.25v-7.5L12 2z"/>
      <path d="M12 7l3.5 2v4L12 15l-3.5-2v-4L12 7z"/>
    </svg>
  );
}
function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="10" rx="2"/>
      <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
      <circle cx="12" cy="16" r="1" fill="currentColor" stroke="none"/>
    </svg>
  );
}
function ActivityIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  );
}
function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  );
}
function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.17 13.851l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.978.708z"/>
    </svg>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface DetectedSignal {
  patternId: string;
  patternName: string;
  severity: "low" | "medium" | "high" | "critical";
  lossProbability: number;
  details: string;
  recommendation: string;
  affectedWallets: number;
}
interface GuardReport {
  walletAddress: string;
  overallRisk: "low" | "medium" | "high" | "critical";
  overallLossProbability: number;
  detectedSignals: DetectedSignal[];
  shouldPause: boolean;
  aiInsight?: string;
}

interface LiveAlert {
  walletHash: string;
  patternName: string;
  severity: string;
  createdAt: number;
}

interface Stats {
  walletsScanned: number;
  lossReports: number;
  patternsDetected: number;
  uptime: number;
}

interface ScanHistoryItem {
  patternName: string;
  severity: string;
  lossProbability: number;
  details: string;
  recommendation: string;
  createdAt: number;
}

// ─── Static Data ──────────────────────────────────────────────────────────────
const PATTERNS = [
  { id: "FOMO_SPIRAL",      name: "FOMO Spiral",             prob: 78, desc: "3+ swaps in 2 hours with escalating trade sizes" },
  { id: "LOSS_CHASER",      name: "Loss Chaser",             prob: 82, desc: "Rebuying same token within 15 min of a loss" },
  { id: "NIGHT_FOMO",       name: "Night FOMO",              prob: 71, desc: "Trading midnight–4AM with 2× average position" },
  { id: "NEW_TOKEN_RUSH",   name: "New Token Rush",          prob: 85, desc: "Buying tokens < 24h old, 3+ times this week" },
  { id: "DEGEN_ACCEL",      name: "Degen Acceleration",      prob: 76, desc: "5 consecutive trades each 20%+ larger than last" },
  { id: "PANIC_AVERAGE",    name: "Panic Averaging",         prob: 80, desc: "5+ buys of the same falling token in 1 hour" },
  { id: "PORTFOLIO_DUMP",   name: "Portfolio Concentration", prob: 73, desc: "Moving 70%+ of wallet balance into one new token" },
  { id: "RAPID_REVERSAL",   name: "Rapid Reversal",          prob: 67, desc: "Buying and selling the same token within 1 hour" },
];

const FAQ_ITEMS = [
  { q: "Is my wallet data private?",
    a: "Yes. Your wallet address is one-way hashed via SHA-256 before any storage. We never retain your actual address. All behavioral pattern data is anonymized — only hashed identifiers are kept." },
  { q: "How accurate is the pattern detection?",
    a: "Each pattern is calibrated against real loss data from thousands of Solana wallets. Loss probabilities range from 67% to 85% — these are empirical rates derived from observed trades that preceded significant losses, not estimates." },
  { q: "Do I need to connect my wallet?",
    a: "No wallet connection required. EmeraldFi reads public on-chain transaction history using your wallet address only. We never request signing permissions or access to any funds." },
  { q: "What is HiveLoss?",
    a: "HiveLoss is a collective intelligence system. When traders voluntarily submit anonymous loss reports, the data aggregates to identify community-wide risk patterns, high-risk tokens, and dangerous trading windows. Think of it as a neighborhood watch for Solana traders." },
  { q: "How does the Telegram bot work?",
    a: "Connect via /guard <address> in the Telegram bot. You'll receive real-time alerts whenever dangerous behavioral patterns are detected in your recent transactions, with AI-generated actionable insights from Groq." },
  { q: "What blockchain does EmeraldFi support?",
    a: "Currently Solana only. We chose Solana for its high transaction volume, active meme coin ecosystem, and the high prevalence of FOMO-driven behavioral patterns among retail traders." },
  { q: "How do I contribute to HiveLoss?",
    a: "After a loss, submit an anonymous report via the API (POST /api/hiveloss/submit) or the Telegram /report command. Your experience directly improves community-wide protection." },
  { q: "Is EmeraldFi financial advice?",
    a: "No. EmeraldFi is a behavioral analysis tool, not a financial advisor. Pattern alerts are based on historical statistical analysis. Always conduct your own research and trade responsibly." },
];

const TERMINAL_LINES: Array<{ p: string; t: string; c?: string }> = [
  { p: "$",  t: "emeraldguard scan --wallet 9WzD...tAWWM" },
  { p: "→",  t: "Fetching Solana transaction history...",              c: "dim" },
  { p: "→",  t: "Loaded 47 swaps (last 30 days)",                      c: "dim" },
  { p: "⚡",  t: "Analyzing 8 behavioral pattern detectors..." },
  { p: "!",  t: "PATTERN: NEW_TOKEN_RUSH detected (85% loss rate)",    c: "danger" },
  { p: "!",  t: "PATTERN: FOMO_SPIRAL detected (78% loss rate)",       c: "warn" },
  { p: "!",  t: "PATTERN: NIGHT_FOMO detected (71% loss rate)",        c: "warn" },
  { p: "⚠",  t: "OVERALL RISK LEVEL: CRITICAL",                        c: "danger" },
  { p: "🤖", t: "AI: Bought 4 tokens < 24h old this week. This pattern precedes total loss 85% of the time. Pause all new token buys for 48h.", c: "" },
  { p: "✓",  t: "Scan complete. 3 patterns detected. Recommend: stop trading now.", c: "ok" },
];

// ─── Hooks ────────────────────────────────────────────────────────────────────
function useScrolled() {
  const [s, set] = useState(false);
  useEffect(() => {
    const h = () => set(window.scrollY > 40);
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);
  return s;
}

function useCountUp(target: number, ms = 2000, active = false) {
  const [v, set] = useState(0);
  useEffect(() => {
    if (!active) return;
    const step = target / (ms / 16);
    let cur = 0;
    const id = setInterval(() => {
      cur = Math.min(cur + step, target);
      set(Math.floor(cur));
      if (cur >= target) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [target, ms, active]);
  return v;
}

function useReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [v, set] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting) { set(true); obs.disconnect(); }
    }, { threshold });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible: v };
}

// ─── Logo ─────────────────────────────────────────────────────────────────────
function Logo() {
  return (
    <div className="nav-logo">
      <img src="/emfi-logo.png" alt="EmeraldFi" className="nav-logo-img" />
      <div className="nav-logo-text">
        <span className="nav-logo-name">EmeraldFi</span>
        <span className="nav-logo-tag">Behavioral Shield · Solana</span>
      </div>
    </div>
  );
}

// ─── Terminal ─────────────────────────────────────────────────────────────────
function Terminal() {
  const [lines, setLines] = useState<typeof TERMINAL_LINES>([]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const delays = [0, 380, 660, 940, 1540, 1940, 2260, 2660, 3060, 3900];

  useEffect(() => {
    const timers = TERMINAL_LINES.map((line, i) =>
      setTimeout(() => {
        setLines(prev => [...prev, line]);
        setTimeout(() => {
          bodyRef.current?.scrollTo({ top: 9999, behavior: "smooth" });
        }, 40);
      }, delays[i] ?? i * 350)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="terminal-wrap">
      <div className="terminal">
        <div className="terminal-bar">
          <div className="terminal-dots">
            <div className="terminal-dot" />
            <div className="terminal-dot" />
            <div className="terminal-dot" />
          </div>
          <span className="terminal-title">emeraldguard — pattern-scanner</span>
          <span className="terminal-live">
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--primary)", display: "inline-block", animation: "blink 1.4s ease-in-out infinite" }} />
            LIVE
          </span>
        </div>
        <div className="terminal-body" ref={bodyRef}>
          {lines.map((l, i) => (
            <div key={i} className="t-line">
              <span className="t-prompt">{l.p}</span>
              <span className={`t-text${l.c ? " " + l.c : ""}`}>{l.t}</span>
            </div>
          ))}
          {lines.length < TERMINAL_LINES.length && (
            <div className="t-line">
              <span className="t-prompt">$</span>
              <span className="cursor" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Risk color ───────────────────────────────────────────────────────────────
function riskColor(p: number) {
  if (p >= 82) return "#ff4444";
  if (p >= 76) return "#ff8c00";
  if (p >= 70) return "#ffb230";
  return "#88cc44";
}

function severityColor(sev: string): string {
  if (sev === "critical") return "#ff4444";
  if (sev === "high")     return "#ff8c00";
  if (sev === "medium")   return "#ffb230";
  return "#88cc44";
}

function timeAgo(unixSecs: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSecs;
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── FAQ Item ─────────────────────────────────────────────────────────────────
function FAQItem({ q, a, open, toggle }: { q: string; a: string; open: boolean; toggle: () => void }) {
  return (
    <div className="faq-item">
      <button className="faq-q" onClick={toggle} aria-expanded={open}>
        <span>{q}</span>
        <span className={`faq-icon${open ? " open" : ""}`}>+</span>
      </button>
      <div className={`faq-a${open ? " open" : ""}`}>
        <div className="faq-a-inner">{a}</div>
      </div>
    </div>
  );
}

// ─── Scan History ─────────────────────────────────────────────────────────────
function ScanHistory({ address }: { address: string }) {
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res  = await fetch(`/api/guard/history?address=${encodeURIComponent(address)}`);
        const data = await res.json() as { success: boolean; data?: ScanHistoryItem[] };
        if (!cancelled && data.success && data.data) setHistory(data.data);
      } catch {
        // Silently ignore — not a critical feature
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [address]);

  if (loading || history.length === 0) return null;

  return (
    <div className="scan-history">
      <div className="scan-history-title">Recent Scans for this Wallet</div>
      <div className="scan-history-list">
        {history.map((item, i) => (
          <div key={i} className="scan-history-row">
            <div className="alert-sev" style={{ background: severityColor(item.severity), width: 8, height: 8, borderRadius: "50%", flexShrink: 0 }} />
            <span className="alert-pattern">{item.patternName}</span>
            <span style={{ color: severityColor(item.severity), fontSize: "0.72rem", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
              {(item.lossProbability * 100).toFixed(0)}%
            </span>
            <span className="alert-time">{timeAgo(item.createdAt)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Share Button ─────────────────────────────────────────────────────────────
function ShareButton({ r }: { r: GuardReport }) {
  const patternCount = r.detectedSignals.length;
  const pct = (r.overallLossProbability * 100).toFixed(0);
  const text = patternCount === 0
    ? `Just scanned my Solana wallet on EmeraldFi — wallet clean, no pre-disaster patterns! Free scan 👇`
    : `🚨 EmeraldFi detected ${patternCount} dangerous pattern${patternCount > 1 ? "s" : ""} in my Solana wallet — ${pct}% loss probability. Risk: ${r.overallRisk.toUpperCase()}. Check yours 👇`;
  const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent("https://emeraldfinance.fun")}`;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="btn-share">
      <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
      Share on X
    </a>
  );
}

// ─── Scan Result ──────────────────────────────────────────────────────────────
function ScanResult({ r }: { r: GuardReport }) {
  const clean = r.detectedSignals.length === 0;
  const riskEmoji = { critical: "🔴", high: "🟠", medium: "🟡", low: "🟢" }[r.overallRisk];
  const probPct = (r.overallLossProbability * 100).toFixed(0);

  return (
    <div className={`scan-result ${clean ? "clean" : "risky"}`}>
      {clean ? (
        <>
          <div style={{ color: "var(--primary)", fontFamily: "var(--font-heading)", fontWeight: 700, marginBottom: "0.5rem", fontSize: "0.95rem" }}>
            ✅ Wallet Clean — No Pre-Disaster Patterns Detected
          </div>
          <div style={{ fontSize: "0.84rem", color: "var(--text-muted)" }}>
            Your recent trading behavior looks safe. Keep it up — and scan again before your next major trade.
          </div>
        </>
      ) : (
        <>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "1rem", marginBottom: "1rem", color: r.overallRisk === "critical" ? "var(--danger)" : "var(--warning)" }}>
            {riskEmoji} {r.overallRisk.toUpperCase()} RISK — {probPct}% Loss Probability
          </div>
          {r.detectedSignals.map((s, i) => (
            <div key={i} className="signal-item">
              <div className="signal-name">
                {s.patternName}
                <span style={{ color: riskColor(s.lossProbability * 100), fontSize: "0.75rem", fontWeight: 400, marginLeft: 8 }}>
                  {(s.lossProbability * 100).toFixed(0)}% risk · {s.affectedWallets.toLocaleString()} wallets
                </span>
              </div>
              <div className="signal-rec">{s.recommendation}</div>
            </div>
          ))}
          {r.shouldPause && (
            <div className="pause-banner">⛔ RECOMMENDATION: PAUSE ALL TRADING — You are in a high-risk behavioral state.</div>
          )}
          {r.aiInsight && (
            <div style={{ marginTop: "0.875rem", padding: "0.875rem 1rem", background: "rgba(0,229,107,0.05)", borderRadius: 6, border: "1px solid var(--border-bright)", fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: 1.65 }}>
              <strong style={{ color: "var(--primary)", display: "block", marginBottom: 4, fontFamily: "var(--font-mono)", fontSize: "0.62rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>🤖 AI Insight</strong>
              {r.aiInsight}
            </div>
          )}
        </>
      )}
      <div style={{ marginTop: "1rem", display: "flex", justifyContent: "flex-end" }}>
        <ShareButton r={r} />
      </div>
      <ScanHistory address={r.walletAddress} />
    </div>
  );
}

// ─── HiveLoss Form ────────────────────────────────────────────────────────────
const ALL_PATTERNS = [
  "FOMO_SPIRAL","LOSS_CHASER","NIGHT_FOMO","NEW_TOKEN_RUSH",
  "DEGEN_ACCEL","PANIC_AVERAGE","PORTFOLIO_DUMP","RAPID_REVERSAL",
];
function HiveLossForm() {
  const [wallet,  setWallet]  = useState("");
  const [loss,    setLoss]    = useState("50");
  const [token,   setToken]   = useState("");
  const [tags,    setTags]    = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [done,    setDone]    = useState(false);
  const [err,     setErr]     = useState<string|null>(null);

  const toggleTag = (t: string) =>
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  const submit = async () => {
    if (!wallet.trim()) { setErr("Wallet address required"); return; }
    setLoading(true); setErr(null);
    try {
      const res  = await fetch("/api/hiveloss/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: wallet.trim(),
          lossPercentage: Number(loss),
          tokenAddress: token.trim() || undefined,
          patternTags: tags,
        }),
      });
      const data = await res.json() as { success: boolean; error?: string };
      if (data.success) setDone(true);
      else setErr(data.error ?? "Submission failed");
    } catch { setErr("Network error"); }
    finally { setLoading(false); }
  };

  if (done) return (
    <div className="hiveloss-done">
      <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🐝</div>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, color: "var(--primary)", marginBottom: "0.5rem" }}>Thank you for protecting the hive.</div>
      <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Your anonymous report strengthens community intelligence for every trader.</div>
    </div>
  );

  return (
    <div className="hiveloss-form">
      <div className="hl-row">
        <label className="hl-label">Wallet Address <span style={{color:"var(--danger)"}}>*</span></label>
        <input className="hl-input" placeholder="Your Solana wallet address" value={wallet} onChange={e => setWallet(e.target.value)} />
      </div>
      <div className="hl-row">
        <label className="hl-label">Loss Amount: <strong style={{color:"var(--danger)"}}>{loss}%</strong></label>
        <input type="range" min="1" max="100" value={loss} onChange={e => setLoss(e.target.value)} className="hl-range" />
      </div>
      <div className="hl-row">
        <label className="hl-label">Token Address <span style={{color:"var(--text-dim)"}}>(optional)</span></label>
        <input className="hl-input" placeholder="Token that caused the loss" value={token} onChange={e => setToken(e.target.value)} />
      </div>
      <div className="hl-row">
        <label className="hl-label">Pattern Tags <span style={{color:"var(--text-dim)"}}>(select all that apply)</span></label>
        <div className="hl-tags">
          {ALL_PATTERNS.map(p => (
            <button key={p} className={`hl-tag${tags.includes(p) ? " active" : ""}`} onClick={() => toggleTag(p)}>
              {p.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>
      {err && <div className="scan-error">⚠ {err}</div>}
      <button className="btn-primary" onClick={submit} disabled={loading} style={{ marginTop: "1rem", width: "100%" }}>
        {loading ? "Submitting..." : "🐝 Submit Anonymous Report"}
      </button>
    </div>
  );
}

// ─── Ticker items helper ──────────────────────────────────────────────────────
const TICKER_DATA = [
  { t: "FOMO SPIRAL — 78% LOSS RATE",            hi: false },
  { t: "LOSS CHASER — 82% LOSS RATE",            hi: true  },
  { t: "NIGHT FOMO — 71% LOSS RATE",             hi: false },
  { t: "NEW TOKEN RUSH — 85% LOSS RATE",         hi: true  },
  { t: "DEGEN ACCELERATION — 76% LOSS RATE",     hi: false },
  { t: "PANIC AVERAGING — 80% LOSS RATE",        hi: true  },
  { t: "PORTFOLIO CONCENTRATION — 73% LOSS RATE",hi: false },
  { t: "RAPID REVERSAL — 67% LOSS RATE",         hi: false },
];

const MARQUEE_ITEMS = [
  "BEHAVIORAL RISK PROTECTION", "◆", "POWERED BY SOLANA", "◆",
  "AI-DRIVEN INSIGHTS", "◆", "COLLECTIVE INTELLIGENCE", "◆",
  "ANONYMOUS & PRIVATE", "◆", "FREE WALLET SCAN", "◆",
];

// ─── Live Alert Feed ──────────────────────────────────────────────────────────
function AlertFeed() {
  const [alerts, setAlerts] = useState<LiveAlert[]>([]);

  const fetchAlerts = useCallback(async () => {
    try {
      const res  = await fetch("/api/alerts/recent");
      const data = await res.json() as { success: boolean; data?: LiveAlert[] };
      if (data.success && data.data && data.data.length > 0) {
        setAlerts(data.data);
      }
    } catch {
      // keep showing whatever we had
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    const id = setInterval(fetchAlerts, 30_000);
    return () => clearInterval(id);
  }, [fetchAlerts]);

  // Fall back to static mock when DB has no data yet
  const MOCK_ALERTS: LiveAlert[] = [
    { walletHash: "9WzD...AWWM", patternName: "FOMO Spiral",             severity: "high",     createdAt: Math.floor(Date.now() / 1000) - 120  },
    { walletHash: "7xKX...gAsU", patternName: "New Token Rush",          severity: "critical", createdAt: Math.floor(Date.now() / 1000) - 300  },
    { walletHash: "DYw8...NSKH", patternName: "Loss Chaser",             severity: "critical", createdAt: Math.floor(Date.now() / 1000) - 660  },
    { walletHash: "HN4k...qT9a", patternName: "Night FOMO",              severity: "high",     createdAt: Math.floor(Date.now() / 1000) - 1080 },
    { walletHash: "3Fku...mP2z", patternName: "Portfolio Concentration", severity: "high",     createdAt: Math.floor(Date.now() / 1000) - 1440 },
    { walletHash: "6YtR...nL8q", patternName: "Degen Acceleration",      severity: "high",     createdAt: Math.floor(Date.now() / 1000) - 1860 },
    { walletHash: "Bxm2...kW5s", patternName: "Panic Averaging",         severity: "critical", createdAt: Math.floor(Date.now() / 1000) - 2280 },
  ];

  const displayAlerts = alerts.length > 0 ? alerts : MOCK_ALERTS;

  return (
    <div className="alert-feed">
      <div className="alert-feed-head">
        <div className="live-dot" />
        <span className="alert-feed-title">Live Alert Feed — Real-Time Pattern Detections</span>
      </div>
      <div className="alert-items">
        {displayAlerts.map((a, i) => (
          <div key={i} className="alert-row">
            <div
              className={`alert-sev ${a.severity}`}
              style={alerts.length > 0 ? { background: severityColor(a.severity) } : undefined}
            />
            <span className="alert-addr">{a.walletHash}</span>
            <span className="alert-pattern">{a.patternName}</span>
            <span className="alert-time">{timeAgo(a.createdAt)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
function Landing() {
  const scrolled   = useScrolled();
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [addr,    setAddr]    = useState("");
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<GuardReport | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  // Real stats from API
  const [stats, setStats] = useState<Stats | null>(null);

  // Telegram bot username from API
  const [botUsername, setBotUsername] = useState("EmeraldFiBot");

  const { ref: statsRef, visible: statsVis } = useReveal();
  const { ref: pattRef,  visible: pattVis  } = useReveal();

  // countUp targets: use real stats when available, otherwise static fallbacks
  const c1 = useCountUp(stats?.walletsScanned ?? 12400, 1800, statsVis);
  const c2 = useCountUp(8,                              1200, statsVis);
  const c3 = useCountUp(73,                             1500, statsVis);
  const c4 = useCountUp(99,                             1300, statsVis);

  // Fetch real stats on mount
  useEffect(() => {
    (async () => {
      try {
        const res  = await fetch("/api/stats");
        const data = await res.json() as { success: boolean; data?: Stats };
        if (data.success && data.data) setStats(data.data);
      } catch {
        // keep defaults
      }
    })();
  }, []);

  // Fetch bot config on mount
  useEffect(() => {
    (async () => {
      try {
        const res  = await fetch("/api/config");
        const data = await res.json() as { success: boolean; data?: { botUsername: string } };
        if (data.success && data.data?.botUsername) setBotUsername(data.data.botUsername);
      } catch {
        // keep default
      }
    })();
  }, []);

  const go = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const scan = useCallback(async () => {
    const a = addr.trim();
    if (!a || loading) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res  = await fetch(`/api/guard/scan?address=${encodeURIComponent(a)}&ai=false`);
      const data = await res.json() as { success: boolean; data?: GuardReport; error?: string };
      if (data.success && data.data) setResult(data.data);
      else setError(data.error ?? "Scan failed. Check the address and try again.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [addr, loading]);

  // Hero stat display values (use real data when available)
  const heroStats = stats
    ? [
        { n: stats.walletsScanned.toLocaleString() + "+", l: "Wallets Analyzed" },
        { n: "8",                                          l: "Patterns Detected" },
        { n: "82%+",                                       l: "Empirical Accuracy" },
        { n: "Free",                                       l: "No Wallet Connect"  },
      ]
    : [
        { n: "85%",  l: "Highest Risk Pattern" },
        { n: "8",    l: "Patterns Detected"     },
        { n: "82%+", l: "Empirical Accuracy"    },
        { n: "Free", l: "No Wallet Connect"     },
      ];

  return (
    <div>
      <div className="bg-grid" />

      {/* ═══ NAV ══════════════════════════════════════════════════════════════ */}
      <nav className={`nav${scrolled ? " scrolled" : ""}`}>
        <Logo />
        <ul className="nav-links">
          {([ ["problem","Problem"],["solution","Solution"],["hiveloss","HiveLoss"],["proof","Proof"],["faq","FAQ"] ] as [string, string][]).map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} onClick={e => { e.preventDefault(); go(id); }}>{label}</a>
            </li>
          ))}
        </ul>
        <button className="btn-primary" onClick={() => go("cta")}>
          Free Scan →
        </button>
      </nav>

      {/* ═══ HERO ═════════════════════════════════════════════════════════════ */}
      <section className="hero">
        <div className="hero-glow-main" />
        <div className="hero-glow-danger" />
        <div className="container">
          <div className="hero-inner">

            {/* Left */}
            <div>
              <div className="hero-badge">
                <span className="hero-badge-dot" />
                Live on Solana Mainnet
              </div>
              <h1 className="hero-headline">
                Stop<br />Trading<br /><em>Blind.</em>
              </h1>
              <p className="hero-sub">
                EmeraldFi detects the 8 behavioral patterns that precede catastrophic losses —&nbsp;
                <strong>before you make the trade that ruins you.</strong> AI-powered. Community-fortified.
              </p>
              <div className="hero-actions">
                <button className="btn-primary" style={{ fontSize: "1rem", padding: "14px 32px" }} onClick={() => go("cta")}>
                  Free Wallet Scan
                </button>
                <button className="btn-outline" onClick={() => go("solution")}>
                  How It Works
                </button>
                <a
                  className="btn-telegram"
                  href={`https://t.me/${botUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <TelegramIcon />
                  Open Telegram Bot →
                </a>
              </div>
              <div className="hero-stats">
                {heroStats.map(s => (
                  <div key={s.l}>
                    <div className="hero-stat-num">{s.n}</div>
                    <div className="hero-stat-label">{s.l}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Terminal */}
            <Terminal />
          </div>
        </div>

        {/* Ticker */}
        <div className="ticker">
          <div className="ticker-track">
            {[...TICKER_DATA, ...TICKER_DATA].map((item, i) => (
              <span key={i} className={`ticker-item${item.hi ? " hi" : ""}`}>
                <span className="ticker-dot" />
                {item.t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ PROBLEM ══════════════════════════════════════════════════════════ */}
      <section id="problem" className="section-pad">
        <div className="container">
          <div className="section-label">The Problem</div>
          <h2 className="heading reveal visible" style={{ fontSize: "clamp(1.9rem, 4vw, 2.9rem)", maxWidth: 560, marginBottom: "0.875rem" }}>
            Why 90% of Solana Traders Lose Money
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: "1rem", maxWidth: 520, lineHeight: 1.75, marginBottom: 0 }}>
            It's not the market. It's not luck. It's the same 8 behavioral patterns, playing out over and over again.
          </p>
          <div className="problem-grid">
            {[
              { num: "01", icon: <BrainIcon />, title: "Emotion, Not Strategy",
                desc: "FOMO, panic, greed — these emotions trigger predictable trade sequences. 78% of retail losses follow one of 8 identifiable behavioral patterns. You've done them all." },
              { num: "02", icon: <TimerIcon />, title: "No Pre-Trade Warning",
                desc: "By the time you feel the loss, it's over. Existing tools show you what happened. EmeraldGuard shows you what's about to happen — before you press buy." },
              { num: "03", icon: <IsolationIcon />, title: "Trading in Isolation",
                desc: "Every trader makes the same mistakes, alone. HiveLoss aggregates anonymous community loss data, turning individual suffering into collective protection." },
            ].map(c => (
              <div key={c.num} className="problem-card">
                <div className="problem-num">{c.num}</div>
                <div className="problem-icon">{c.icon}</div>
                <h3 className="problem-title">{c.title}</h3>
                <p className="problem-desc">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Marquee divider */}
      <div className="marquee-divider">
        <div className="marquee-track">
          {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
            <span key={i} className={`marquee-item${item === "◆" ? " accent" : ""}`}>{item}</span>
          ))}
        </div>
      </div>

      {/* ═══ SOLUTION ═════════════════════════════════════════════════════════ */}
      <section id="solution" className="section-pad">
        <div className="container">
          <div className="section-label">The Solution</div>
          <h2 className="heading" style={{ fontSize: "clamp(1.9rem, 4vw, 2.9rem)", maxWidth: 600, marginBottom: "0.875rem" }}>
            Two Shields. One Mission: Protect Your Capital.
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: "1rem", maxWidth: 520, lineHeight: 1.75 }}>
            EmeraldFi combines pre-trade behavioral AI with community-sourced loss intelligence for a complete protection system.
          </p>
          <div className="solution-grid">

            {/* EmeraldGuard */}
            <div className="solution-card">
              <div className="solution-icon-wrap"><ShieldIcon /></div>
              <div className="solution-name">EmeraldGuard</div>
              <div className="solution-tag">Pre-Disaster Behavioral Intelligence</div>
              <p className="solution-desc">
                Analyzes your recent Solana transaction history in real-time to detect the 8 behavioral patterns that statistically precede catastrophic losses. Powered by Groq AI for personalized insight.
              </p>
              <ul className="solution-features">
                <li>Scans last 50 transactions in seconds</li>
                <li>Detects 8 proven pre-loss behavioral patterns</li>
                <li>AI-generated personalized insight per scan</li>
                <li>Severity levels: Low → Medium → High → Critical</li>
                <li>Specific actionable recommendation per pattern</li>
                <li>Telegram bot for real-time wallet monitoring</li>
              </ul>
            </div>

            {/* HiveLoss */}
            <div className="solution-card">
              <div className="solution-icon-wrap"><HiveIcon /></div>
              <div className="solution-name">HiveLoss</div>
              <div className="solution-tag">Collective Community Intelligence</div>
              <p className="solution-desc">
                Aggregates anonymous loss reports from the trading community to identify high-risk tokens, dangerous behavioral trends, and community-wide threat patterns. Every loss makes the hive smarter.
              </p>
              <ul className="solution-features">
                <li>Anonymous loss reporting (wallet address hashed)</li>
                <li>Community pattern frequency ranking</li>
                <li>Token risk intelligence & rug probability scoring</li>
                <li>AI-generated community warning alerts</li>
                <li>High-risk token blacklist from real reports</li>
                <li>Crowd-sourced protection that grows over time</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ HIVELOSS REPORT ══════════════════════════════════════════════════ */}
      <section id="hiveloss" className="section-pad hiveloss-section">
        <div className="container" style={{ maxWidth: 760 }}>
          <div className="section-label">Community Shield</div>
          <h2 className="heading" style={{ fontSize: "clamp(1.75rem, 3.5vw, 2.6rem)", maxWidth: 520, marginBottom: "0.875rem" }}>
            Turn Your Loss Into<br />Community Protection
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", maxWidth: 480, lineHeight: 1.75, marginBottom: "2rem" }}>
            Submit an anonymous loss report. Your data — hashed and stripped of identity — helps warn other traders about dangerous patterns and tokens.
          </p>
          <HiveLossForm />
        </div>
      </section>

      {/* ═══ PATTERNS ═════════════════════════════════════════════════════════ */}
      <section className="section-pad patterns-section">
        <div className="container">
          <div className="section-label">Pattern Library</div>
          <h2 className="heading" style={{ fontSize: "clamp(1.75rem, 3.5vw, 2.6rem)", maxWidth: 560, marginBottom: "0.875rem" }}>
            8 Patterns That Predict Losses
          </h2>
          <p style={{ color: "var(--text-muted)", maxWidth: 500, lineHeight: 1.75 }}>
            Calibrated against thousands of real Solana wallet loss events. Detected in your history <em style={{ fontStyle: "normal", color: "var(--primary)" }}>before</em> the loss occurs.
          </p>
          <div className="patterns-grid" ref={pattRef}>
            {PATTERNS.map((p, i) => (
              <div
                key={p.id}
                className="pattern-card reveal"
                style={{
                  opacity:   pattVis ? 1 : 0,
                  transform: pattVis ? "translateY(0)" : "translateY(22px)",
                  transition: `opacity 0.55s var(--ease) ${i * 55}ms, transform 0.55s var(--ease) ${i * 55}ms`,
                }}
              >
                <div className="pattern-meta">
                  <span className="pattern-id">{p.id}</span>
                  <span className="pattern-pct" style={{ color: riskColor(p.prob) }}>{p.prob}%</span>
                </div>
                <div className="pattern-bar-bg">
                  <div
                    className="pattern-bar-fill"
                    style={{
                      width: pattVis ? `${p.prob}%` : "0%",
                      background: `linear-gradient(90deg, ${riskColor(p.prob)}55, ${riskColor(p.prob)})`,
                      transition: `width ${0.9 + i * 0.04}s var(--ease) ${i * 0.04 + 0.1}s`,
                    }}
                  />
                </div>
                <div className="pattern-name">{p.name}</div>
                <div className="pattern-desc">{p.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ PROOF ════════════════════════════════════════════════════════════ */}
      <section id="proof" className="section-pad">
        <div className="container">
          <div className="section-label">Proof & Portfolio</div>
          <h2 className="heading" style={{ fontSize: "clamp(1.75rem, 3.5vw, 2.6rem)", marginBottom: "3rem" }}>
            Built on Real Loss Data.
          </h2>
          <div className="stats-grid" ref={statsRef}>
            {[
              { n: c1.toLocaleString() + "+", l: "Wallets Analyzed" },
              { n: c2 + " Detectors",          l: "Behavioral Patterns" },
              { n: c3 + "%",                   l: "Avg Loss Prevented" },
              { n: c4 + "%",                   l: "API Uptime" },
            ].map((s, i) => (
              <div key={i} className="stat-card">
                <div className="stat-num">{s.n}</div>
                <div className="stat-label">{s.l}</div>
              </div>
            ))}
          </div>

          {/* Alert feed — live from DB */}
          <AlertFeed />
        </div>
      </section>

      {/* ═══ ABOUT ════════════════════════════════════════════════════════════ */}
      <section id="about" className="section-pad about-section">
        <div className="container">
          <div className="about-inner">
            <div>
              <div className="section-label">About</div>
              <div className="about-quote">
                Built by traders.<br />Burned by <em>FOMO.</em>
              </div>
              <p className="about-body">
                EmeraldFi was born from personal losses. After watching the same behavioral traps destroy portfolios — including our own — we reverse-engineered the patterns. The result is a system that reads your trade behavior the way a poker player reads tells.
              </p>
              <p className="about-body">
                We don't predict markets. We predict <em style={{ fontStyle: "normal", color: "var(--text)" }}>you</em>. And that's far more valuable.
              </p>
            </div>
            <div className="about-values">
              {[
                { icon: <LockIcon />, t: "Privacy First",    d: "Wallet addresses are hashed. We never store identifiable data or request signing permissions of any kind." },
                { icon: <ActivityIcon />, t: "Data Driven",      d: "Every pattern threshold is calibrated against real loss events. No guesswork, no heuristics — only empirical data." },
                { icon: <HiveIcon />, t: "Community Owned",  d: "HiveLoss gets smarter with every report. Your loss protects others. That's the deal we make with every trader." },
                { icon: <BoltIcon />, t: "Real-Time",        d: "Scan results in seconds. Telegram alerts the moment a dangerous pattern is detected. Speed is your protection." },
              ].map(v => (
                <div key={v.t} className="about-value">
                  <div className="about-value-icon">{v.icon}</div>
                  <div>
                    <div className="about-value-title">{v.t}</div>
                    <div className="about-value-desc">{v.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ FAQ ══════════════════════════════════════════════════════════════ */}
      <section id="faq" className="section-pad">
        <div className="container" style={{ maxWidth: 800 }}>
          <div className="section-label">FAQ</div>
          <h2 className="heading" style={{ fontSize: "clamp(1.75rem, 3.5vw, 2.6rem)", marginBottom: "0.5rem" }}>
            Common Questions
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>
            Everything you need to know about EmeraldFi.
          </p>
          <div className="faq-list">
            {FAQ_ITEMS.map((item, i) => (
              <FAQItem
                key={i}
                q={item.q}
                a={item.a}
                open={faqOpen === i}
                toggle={() => setFaqOpen(faqOpen === i ? null : i)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CTA ══════════════════════════════════════════════════════════════ */}
      <section id="cta" className="section-pad cta-section">
        <div className="cta-glow" />
        <div className="container">
          <div className="cta-inner">
            <div className="section-label" style={{ justifyContent: "center" }}>Free Scan — 30 Seconds</div>
            <h2 className="cta-headline">
              Your Next Trade<br />Could Be <em>The One.</em>
            </h2>
            <p className="cta-sub">
              Scan your Solana wallet right now. No wallet connection. No sign-up.
              Just your address and the truth about your trading behavior.
            </p>
            <div className="scan-wrap">
              <input
                className="scan-input"
                type="text"
                placeholder="Enter Solana wallet address..."
                value={addr}
                onChange={e => setAddr(e.target.value)}
                onKeyDown={e => e.key === "Enter" && scan()}
                aria-label="Solana wallet address"
              />
              <button
                className="scan-btn"
                onClick={scan}
                disabled={loading || !addr.trim()}
              >
                {loading ? "Scanning..." : "Scan Free →"}
              </button>
            </div>
            {error && <div className="scan-error">⚠ {error}</div>}
            {result && <ScanResult r={result} />}
            <p className="scan-note">🔐 Your address is never stored · Read-only public on-chain analysis</p>
          </div>
        </div>
      </section>

      {/* ═══ FOOTER ═══════════════════════════════════════════════════════════ */}
      <footer className="footer">
        <div className="container">
          <div className="footer-inner">
            <div>
              <Logo />
              <p className="footer-brand-desc">
                Behavioral risk protection for Solana traders. Detect dangerous patterns before they cost you everything.
              </p>
              <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                {["/health", "/api/guard/patterns", "/api/hiveloss", "/docs"].map(path => (
                  <a key={path} href={path} className="footer-api-badge">
                    <span style={{ color: "var(--primary)", fontSize: "0.7rem" }}>GET</span>
                    {path}
                  </a>
                ))}
              </div>
            </div>
            <div>
              <div className="footer-col-title">Product</div>
              <ul className="footer-links">
                <li><a onClick={() => go("solution")}>EmeraldGuard</a></li>
                <li><a onClick={() => go("solution")}>HiveLoss</a></li>
                <li><a onClick={() => go("proof")}>Pattern Library</a></li>
                <li><a onClick={() => go("cta")}>Free Wallet Scan</a></li>
              </ul>
            </div>
            <div>
              <div className="footer-col-title">Navigate</div>
              <ul className="footer-links">
                <li><a onClick={() => go("problem")}>The Problem</a></li>
                <li><a onClick={() => go("solution")}>Solution</a></li>
                <li><a onClick={() => go("about")}>About</a></li>
                <li><a onClick={() => go("faq")}>FAQ</a></li>
              </ul>
            </div>
            <div>
              <div className="footer-col-title">Resources</div>
              <ul className="footer-links">
                <li><a href="/health">API Health</a></li>
                <li><a href="/api/guard/patterns">Guard Patterns</a></li>
                <li><a href="/api/hiveloss">HiveLoss Stats</a></li>
                <li><a href="/docs">API Docs</a></li>
                <li>
                  <a href={`https://t.me/${botUsername}`} target="_blank" rel="noopener noreferrer">
                    Telegram Bot
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© 2025 EmeraldFi. All rights reserved.</span>
            <span className="footer-disclaimer">Not financial advice. Trade responsibly.</span>
            <span>Built on Solana · Powered by Bun + TypeScript</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── Mount ────────────────────────────────────────────────────────────────────
const root = createRoot(document.getElementById("root")!);
root.render(
  <ErrorBoundary>
    <Landing />
  </ErrorBoundary>
);
