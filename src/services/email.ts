const FROM = "EmeraldFi <alerts@emeraldfinance.fun>";

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const key = Bun.env.RESEND_API_KEY;
  if (!key || !to) return;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], subject, html }),
    });
    if (!res.ok) console.error("[Email]", res.status, await res.text());
  } catch (err) {
    console.error("[Email] Send failed:", err);
  }
}

export function buildAlertEmail(
  address: string,
  report: {
    overallRisk: string;
    overallLossProbability: number;
    detectedSignals: Array<{ patternName: string; severity: string; details: string }>;
  }
): string {
  const colors: Record<string, string> = {
    critical: "#ff4444", high: "#ffb230", medium: "#ffdd57", low: "#00e56b",
  };
  const emojis: Record<string, string> = {
    critical: "🔴", high: "🟠", medium: "🟡", low: "🟢",
  };
  const c = colors[report.overallRisk] ?? "#6a9478";
  const e = emojis[report.overallRisk] ?? "⚠️";
  const rows = report.detectedSignals.slice(0, 3).map(s => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #1a3325;font-family:system-ui,sans-serif;">
        <div style="color:#ddeee5;font-weight:600;margin-bottom:3px;">${s.patternName}</div>
        <div style="color:#6a9478;font-size:13px;">${s.details}</div>
      </td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="background:#030806;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:#0c1810;border:1px solid #1a3325;border-radius:12px;padding:28px;">
    <h2 style="color:#00e56b;margin:0 0 16px;font-family:system-ui,sans-serif;">${e} EmeraldGuard Alert</h2>
    <p style="color:#ddeee5;margin:0 0 6px;font-family:system-ui,sans-serif;">
      Wallet: <code style="background:#112015;padding:2px 8px;border-radius:4px;">${address.slice(0, 8)}...${address.slice(-4)}</code>
    </p>
    <p style="color:#ddeee5;margin:0 0 20px;font-family:system-ui,sans-serif;">
      Risk Level: <strong style="color:${c};">${report.overallRisk.toUpperCase()}</strong>
      &nbsp;·&nbsp; Loss Probability: <strong style="color:#ddeee5;">${(report.overallLossProbability * 100).toFixed(0)}%</strong>
    </p>
    <table style="width:100%;border-collapse:collapse;border:1px solid #1a3325;border-radius:8px;overflow:hidden;">
      ${rows}
    </table>
    <div style="margin-top:24px;text-align:center;">
      <a href="https://emeraldfinance.fun" style="background:#00e56b;color:#030806;padding:11px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-family:system-ui,sans-serif;">
        View Full Report →
      </a>
    </div>
    <p style="color:#374f3f;font-size:12px;text-align:center;margin-top:20px;font-family:system-ui,sans-serif;">
      EmeraldFi · <a href="https://emeraldfinance.fun" style="color:#374f3f;">emeraldfinance.fun</a>
    </p>
  </div>
</body>
</html>`;
}
