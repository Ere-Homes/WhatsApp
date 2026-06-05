"use client";
import { useEffect, useState } from "react";
import { Icon, IC, PageHead, downloadCSV, downloadText } from "@/lib/ui";
import { USAGE, INVOICES } from "@/lib/fixtures";

const TWILIO_BILLING = "https://console.twilio.com/us1/billing/manage-billing/billing-overview";

export default function Billing() {
  const monthTotalFixture = USAGE.reduce((a, u) => a + u.count * u.rate, 0);
  const [balance, setBalance] = useState("$642.18");
  const [monthTotal, setMonthTotal] = useState(monthTotalFixture);

  // Live Twilio balance + spend when configured; otherwise the seeded numbers.
  useEffect(() => {
    fetch("/api/billing?days=30")
      .then((r) => r.json())
      .then((d) => {
        if (d?.balance) setBalance(`${d.balance.currency === "USD" ? "$" : d.balance.currency + " "}${parseFloat(d.balance.balance).toFixed(2)}`);
        if (d?.spend && typeof d.spend.total === "number" && d.spend.total > 0) setMonthTotal(d.spend.total);
      })
      .catch(() => {});
  }, []);

  const convCount = USAGE.reduce((a, u) => a + u.count, 0);

  const exportStatement = () => {
    const rows: (string | number)[][] = [["Category", "Count", "Rate (USD)", "Cost (USD)"]];
    USAGE.forEach((u) => rows.push([u.cat, u.count, u.rate.toFixed(4), (u.count * u.rate).toFixed(2)]));
    rows.push(["Total", "", "", monthTotalFixture.toFixed(2)]);
    rows.push([]);
    rows.push(["Invoice", "Date", "Amount (USD)", "Status"]);
    INVOICES.forEach((i) => rows.push([i.id, i.date, i.amount.toFixed(2), "Paid"]));
    downloadCSV("ere-billing-statement.csv", rows);
  };

  const downloadInvoice = (inv: typeof INVOICES[number]) => {
    const lines = [
      "ERE Homes — WhatsApp messaging invoice",
      "",
      `Invoice:  ${inv.id}`,
      `Date:     ${inv.date}`,
      `Status:   Paid`,
      `Amount:   $${inv.amount.toFixed(2)} USD`,
      "",
      "Billed to: ERE Homes Real Estate Brokers, Dubai, UAE",
      "Payment:   Visa •••• 4417",
      "",
      "Charges for WhatsApp Business conversations (marketing, utility,",
      "service and authentication) via Twilio for the billing period.",
    ];
    downloadText(`${inv.id}.txt`, lines.join("\n"));
  };

  return (
    <div className="page"><div className="maxw">
      <PageHead title="Billing & usage" sub="WhatsApp conversation charges, payment method and invoices for this Twilio project.">
        <button className="btn btn-sec" onClick={exportStatement}><Icon d={IC.dl} s={15} />Download statement</button>
        <a className="btn btn-primary" href={TWILIO_BILLING} target="_blank" rel="noreferrer"><Icon d={IC.plus} s={16} />Add funds</a>
      </PageHead>

      <div className="kpis k4">
        <div className="kpi"><div className="kl">Account balance</div><div className="kv">{balance}</div><div className="ks">auto-recharge on</div></div>
        <div className="kpi"><div className="kl">This month</div><div className="kv">${monthTotal.toFixed(2)}</div><div className="ks">1–5 Jun 2026</div></div>
        <div className="kpi"><div className="kl">Conversations</div><div className="kv">{convCount.toLocaleString()}</div><div className="ks">billable this period</div></div>
        <div className="kpi"><div className="kl">Next invoice</div><div className="kv">01 Jul</div></div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><div className="card-t">Usage this period</div><div className="card-meta">By conversation category</div></div>
          <table className="ttable flush">
            <thead><tr><th>Category</th><th>Count</th><th>Rate</th><th style={{ textAlign: "right" }}>Cost</th></tr></thead>
            <tbody>
              {USAGE.map((u) => (
                <tr key={u.cat} className="norow">
                  <td>{u.cat}</td>
                  <td className="tcol-muted">{u.count.toLocaleString()}</td>
                  <td className="tcol-muted mono">${u.rate.toFixed(4)}</td>
                  <td style={{ textAlign: "right" }} className="mono">${(u.count * u.rate).toFixed(2)}</td>
                </tr>
              ))}
              <tr className="totalrow"><td colSpan={3}>Total</td><td style={{ textAlign: "right" }} className="mono">${monthTotalFixture.toFixed(2)}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-head"><div className="card-t">Payment method</div></div>
          <div className="paycard">
            <div className="pc-row"><span className="pc-brand"><Icon d={IC.card} s={18} /> Visa</span><span className="mono">•••• 4417</span></div>
            <div className="pc-meta">Expires 09 / 28 · Karim Rahimi</div>
          </div>
          <div className="recharge">
            <div className="rc-row"><span>Auto-recharge</span><span className="pill-on">On</span></div>
            <div className="rc-meta">When balance falls below $100, add $500 automatically.</div>
            <a className="btn btn-sec btn-sm" style={{ marginTop: 12 }} href={TWILIO_BILLING} target="_blank" rel="noreferrer">Edit settings</a>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><div className="card-t">Invoices</div></div>
        <table className="ttable flush">
          <thead><tr><th>Invoice</th><th>Date</th><th>Amount</th><th>Status</th><th style={{ textAlign: "right" }}></th></tr></thead>
          <tbody>
            {INVOICES.map((inv) => (
              <tr key={inv.id} className="norow">
                <td className="mono">{inv.id}</td>
                <td className="tcol-muted">{inv.date}</td>
                <td className="mono">${inv.amount.toFixed(2)}</td>
                <td><span className="badge" style={{ color: "#fff", background: "var(--green-dot)", borderColor: "var(--green-dot)" }}><span className="bd" style={{ background: "rgba(255,255,255,.9)" }} />Paid</span></td>
                <td style={{ textAlign: "right" }}><a className="card-link" href="#" onClick={(e) => { e.preventDefault(); downloadInvoice(inv); }}>PDF</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div></div>
  );
}
