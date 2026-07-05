'use client';

import { useState } from 'react';

interface ReportProps {
  propertyName: string;
  propertyAddress: string;
  propertyType: string;
  calc: any;
  scen?: any;
  bench?: any;
  ownerAge: string;
  constructionType: string;
  floor: string;
  electronic: boolean;
}

const fe = (n: number, d = 2) => `${n.toLocaleString('el-GR', { minimumFractionDigits: d, maximumFractionDigits: d })} €`;
const fp = (n: number, d = 2) => `${n.toFixed(d)}%`;
const today = new Date().toLocaleDateString('el-GR', { day: '2-digit', month: 'long', year: 'numeric' });

export default function RentROIReport({
  propertyName, propertyAddress, propertyType,
  calc, scen, bench, ownerAge, constructionType, floor, electronic,
}: ReportProps) {
  const [printing, setPrinting] = useState(false);

  const handlePrint = async () => {
    setPrinting(true);
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      alert('Επίτρεψε τα popups: πάτα το εικονίδιο στη γραμμή διευθύνσεων → Pop-ups → Allow');
      setPrinting(false);
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Property OS — ${propertyName}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Roboto:wght@400;500&family=Roboto+Mono:wght@500;700&display=swap" rel="stylesheet">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Roboto', sans-serif;
            background: #fff;
            color: #1a1a2e;
            font-size: 11px;
            line-height: 1.5;
          }
          .page { padding: 32px; max-width: 794px; margin: 0 auto; }

          /* Header */
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 2px solid #1a73e8;
          }
          .logo {
            font-family: 'Google Sans', sans-serif;
            font-size: 20px;
            font-weight: 700;
            color: #1a73e8;
            letter-spacing: -0.3px;
          }
          .logo span { color: var(--accent); }
          .meta { text-align: right; font-size: 10px; color: #666; font-family: 'Roboto', sans-serif; }
          .meta-title { font-family: 'Google Sans', sans-serif; font-weight: 500; color: #1a1a2e; font-size: 13px; margin-bottom: 2px; }

          /* Section */
          .section { margin-bottom: 20px; }
          .section-title {
            font-family: 'Google Sans', sans-serif;
            font-size: 10px;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #1a73e8;
            margin-bottom: 10px;
            padding-bottom: 4px;
            border-bottom: 1px solid #e8eaed;
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .section-title::before {
            content: '';
            display: inline-block;
            width: 5px;
            height: 5px;
            border-radius: 50%;
            background: var(--accent);
            flex-shrink: 0;
          }

          /* KPI grids */
          .kpi-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; margin-bottom: 14px; }
          .kpi-grid-3 { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; margin-bottom: 14px; }
          .kpi {
            background: #f8f9fa;
            border: 1px solid #e8eaed;
            border-radius: 8px;
            padding: 10px 12px;
          }
          .kpi-value {
            font-family: 'Roboto Mono', monospace;
            font-size: 15px;
            font-weight: 700;
            margin-bottom: 3px;
          }
          .kpi-label {
            font-family: 'Google Sans', sans-serif;
            font-size: 9px;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #5f6368;
          }
          .kpi-sub { font-size: 9px; color: #9aa0a6; margin-top: 2px; font-family: 'Roboto', sans-serif; }

          /* Colors */
          .positive { color: #137333; }
          .negative { color: #c5221f; }
          .warning { color: #b45309; }
          .accent { color: #1a73e8; }
          .gold { color: var(--accent); }
          .muted { color: #5f6368; }

          /* Stat rows */
          .row {
            display: flex;
            justify-content: space-between;
            padding: 7px 0;
            border-bottom: 1px solid #f1f3f4;
          }
          .row-label { color: #5f6368; font-family: 'Roboto', sans-serif; }
          .row-value { font-family: 'Roboto Mono', monospace; font-weight: 500; }
          .row-value.bold { font-weight: 700; font-size: 13px; }

          /* Two-col */
          .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

          /* Info banners */
          .info-box {
            background: #e8f0fe;
            border-left: 3px solid #1a73e8;
            border-radius: 0 6px 6px 0;
            padding: 8px 12px;
            font-size: 10px;
            color: #1a73e8;
            margin-top: 8px;
            line-height: 1.5;
            font-family: 'Roboto', sans-serif;
          }
          .warning-box {
            background: #fef7e0;
            border-left: 3px solid #b45309;
            border-radius: 0 6px 6px 0;
            padding: 8px 12px;
            font-size: 10px;
            color: #b45309;
            margin-top: 8px;
            line-height: 1.5;
            font-family: 'Roboto', sans-serif;
          }
          .success-box {
            background: #e6f4ea;
            border-left: 3px solid #137333;
            border-radius: 0 6px 6px 0;
            padding: 8px 12px;
            font-size: 10px;
            color: #137333;
            margin-top: 8px;
            line-height: 1.5;
            font-family: 'Roboto', sans-serif;
          }

          /* Score */
          .score-big {
            font-family: 'Roboto Mono', monospace;
            font-size: 48px;
            font-weight: 700;
            text-align: center;
            padding: 12px;
            line-height: 1;
          }

          /* Scenario boxes */
          .scenario-box { border-radius: 8px; padding: 12px; }
          .sell-box {
            background: #fce8e6;
            border-left: 3px solid #c5221f;
          }
          .hold-box {
            background: #e6f4ea;
            border-left: 3px solid #137333;
          }
          .box-title {
            font-family: 'Google Sans', sans-serif;
            font-size: 11px;
            font-weight: 500;
            margin-bottom: 8px;
          }

          /* Progress bar */
          .bar-track {
            height: 5px;
            background: #e8eaed;
            border-radius: 3px;
            overflow: hidden;
            margin-top: 8px;
          }
          .bar-fill {
            height: 100%;
            border-radius: 3px;
          }

          /* Score card */
          .score-card {
            display: grid;
            grid-template-columns: auto 1fr;
            gap: 20px;
            align-items: center;
            margin-bottom: 16px;
          }
          .score-block {
            text-align: center;
            padding: 12px 20px;
            background: #f8f9fa;
            border-radius: 10px;
            border: 1px solid #e8eaed;
          }

          /* Footer */
          .footer {
            margin-top: 32px;
            padding-top: 12px;
            border-top: 1px solid #e8eaed;
            display: flex;
            justify-content: space-between;
            font-size: 9px;
            color: #9aa0a6;
            font-family: 'Roboto', sans-serif;
          }
          .disclaimer {
            text-align: center;
            font-size: 9px;
            color: #9aa0a6;
            margin-top: 8px;
            font-family: 'Roboto', sans-serif;
          }

          @media print {
            .page { padding: 20px; }
          }
        </style>
      </head>
      <body>
        <div class="page">

          <!-- Header -->
          <div class="header">
            <div>
              <div class="logo">Property <span>OS</span></div>
              <div style="font-size:10px;color:#5f6368;margin-top:2px;font-family:'Roboto',sans-serif;">Επαγγελματικό Εργαλείο Ανάλυσης Ακινήτων</div>
            </div>
            <div class="meta">
              <div class="meta-title">${propertyName}</div>
              ${propertyAddress ? `<div>${propertyAddress}</div>` : ''}
              <div>${propertyType}</div>
              <div style="margin-top:4px;">${today}</div>
            </div>
          </div>

          <!-- Αξιολόγηση -->
          <div class="section">
            <div class="section-title">Συνολική Αξιολόγηση</div>
            <div class="score-card">
              <div class="score-block">
                <div class="score-big ${calc.totalScore >= 70 ? 'positive' : calc.totalScore >= 50 ? 'warning' : 'negative'}">${calc.totalScore}</div>
                <div style="font-family:'Google Sans',sans-serif;font-size:11px;font-weight:500;color:${calc.totalScore >= 70 ? '#137333' : calc.totalScore >= 50 ? '#b45309' : '#c5221f'}">${calc.scoreLabel}</div>
                <div style="font-size:9px;color:#9aa0a6;font-family:'Google Sans',sans-serif;text-transform:uppercase;letter-spacing:0.5px">βαθμολογία / 100</div>
              </div>
              <div class="kpi-grid" style="margin-bottom:0;">
                <div class="kpi">
                  <div class="kpi-value ${calc.grossYield >= 5 ? 'positive' : calc.grossYield >= 3 ? 'warning' : 'negative'}">${fp(calc.grossYield)}</div>
                  <div class="kpi-label">Μεικτή Απόδοση</div>
                </div>
                <div class="kpi">
                  <div class="kpi-value ${calc.netYield >= 3 ? 'positive' : calc.netYield >= 1.5 ? 'warning' : 'negative'}">${fp(calc.netYield)}</div>
                  <div class="kpi-label">Καθαρή Απόδοση</div>
                </div>
                <div class="kpi">
                  <div class="kpi-value accent">${fp(calc.capRate)}</div>
                  <div class="kpi-label">Κεφαλαιακή Απόδοση</div>
                </div>
                <div class="kpi">
                  <div class="kpi-value ${calc.afterTax > 0 ? 'positive' : 'negative'}">${fe(calc.afterTax / 12)}</div>
                  <div class="kpi-label">Καθαρό / Μήνα</div>
                </div>
              </div>
            </div>
          </div>

          <!-- P&L -->
          <div class="section">
            <div class="section-title">Κατάσταση Αποτελεσμάτων Χρήσης (P&L)</div>
            <div class="two-col">
              <div>
                <div class="row"><span class="row-label">Ακαθάριστο Ενοίκιο / έτος</span><span class="row-value positive">${fe(calc.annual)}</span></div>
                ${calc.reduction > 0 ? `<div class="row"><span class="row-label">Έκπτωση Ηλεκτρονικής Πληρωμής</span><span class="row-value accent">-${fe(calc.reduction)}</span></div>` : ''}
                <div class="row"><span class="row-label">Δαπάνες Ακινήτου</span><span class="row-value warning">-${fe(calc.totalExp)}</span></div>
                <div class="row"><span class="row-label">Καθαρό Εισόδημα (προ φόρου)</span><span class="row-value accent bold">${fe(calc.netIncome)}</span></div>
                <div class="row"><span class="row-label">Φόρος Εισοδήματος</span><span class="row-value negative">-${fe(calc.tax)}</span></div>
                <div class="row"><span class="row-label">Καθαρό Εισόδημα (μετά φόρου)</span><span class="row-value ${calc.afterTax >= 0 ? 'positive' : 'negative'} bold">${fe(calc.afterTax)}</span></div>
                <div class="row"><span class="row-label">Καθαρό / Μήνα</span><span class="row-value ${calc.afterTax >= 0 ? 'positive' : 'negative'} bold">${fe(calc.afterTax / 12)}</span></div>
              </div>
              <div>
                <div class="kpi-grid-3" style="margin-bottom:10px;">
                  <div class="kpi"><div class="kpi-value accent">${fp(calc.grossYield)}</div><div class="kpi-label">Gross Yield</div></div>
                  <div class="kpi"><div class="kpi-value positive">${fp(calc.netYield)}</div><div class="kpi-label">Net Yield</div></div>
                  <div class="kpi"><div class="kpi-value gold">${calc.payback > 0 ? calc.payback.toFixed(1) + ' χρ' : '—'}</div><div class="kpi-label">Απόσβεση</div></div>
                </div>
                <div class="kpi"><div class="kpi-value accent">${fp(calc.trueYield)}</div><div class="kpi-label">Πραγματική Απόδοση (με κόστη απόκτησης)</div></div>
                <div class="info-box">Πραγματικός Φ.Σ.: ${fp(calc.effectiveRate)} &nbsp;|&nbsp; Breakeven: ${fe(calc.breakeven)}/μήνα</div>
                ${electronic && calc.electronicSaving > 0 ? `<div class="success-box">Εξοικονόμηση ηλεκτρονικής πληρωμής: <strong>${fe(calc.electronicSaving)}</strong>/έτος</div>` : ''}
              </div>
            </div>
          </div>

          <!-- Benchmarks -->
          ${bench ? `
          <div class="section">
            <div class="section-title">Σύγκριση με Αγορά — ${bench.market_label}</div>
            <div class="kpi-grid">
              <div class="kpi">
                <div class="kpi-value ${calc.grossYield >= parseFloat(bench.market_gross) ? 'positive' : 'warning'}">${fp(calc.grossYield)}</div>
                <div class="kpi-label">Gross Yield σου</div>
                <div class="kpi-sub">Benchmark: ${bench.market_gross}%</div>
              </div>
              <div class="kpi">
                <div class="kpi-value ${calc.netYield >= parseFloat(bench.target_net) ? 'positive' : 'warning'}">${fp(calc.netYield)}</div>
                <div class="kpi-label">Net Yield σου</div>
                <div class="kpi-sub">Στόχος: >${bench.target_net}%</div>
              </div>
              <div class="kpi">
                <div class="kpi-value ${calc.netYield > parseFloat(bench.euribor) ? 'positive' : 'negative'}">+${fp(Math.max(calc.netYield - parseFloat(bench.euribor), 0))}</div>
                <div class="kpi-label">vs EURIBOR</div>
                <div class="kpi-sub">EURIBOR ${bench.euribor}%</div>
              </div>
              <div class="kpi">
                <div class="kpi-value ${calc.netYield >= parseFloat(bench.etf_return) ? 'positive' : 'negative'}">${calc.netYield >= parseFloat(bench.etf_return) ? 'Νικά ETF' : 'Κάτω ETF'}</div>
                <div class="kpi-label">vs ETF</div>
                <div class="kpi-sub">Benchmark ${bench.etf_return}%/έτος</div>
              </div>
            </div>
          </div>` : ''}

          <!-- Δάνειο -->
          ${calc.loanBal > 0 ? `
          <div class="section">
            <div class="section-title">Ανάλυση Δανείου</div>
            <div class="kpi-grid">
              <div class="kpi">
                <div class="kpi-value ${calc.DSCR >= 1.25 ? 'positive' : calc.DSCR >= 1 ? 'warning' : 'negative'}">${calc.DSCR.toFixed(2)}x</div>
                <div class="kpi-label">DSCR — Κάλυψη Δανείου</div>
              </div>
              <div class="kpi">
                <div class="kpi-value ${calc.LTV <= 60 ? 'positive' : calc.LTV <= 80 ? 'warning' : 'negative'}">${fp(calc.LTV)}</div>
                <div class="kpi-label">LTV — Δάνειο / Αξία</div>
              </div>
              <div class="kpi">
                <div class="kpi-value positive">${fe(calc.equity)}</div>
                <div class="kpi-label">Ίδια Κεφάλαια (Equity)</div>
              </div>
              <div class="kpi">
                <div class="kpi-value ${calc.cfDebt > 0 ? 'positive' : 'negative'}">${fe(calc.cfDebt / 12)}/μήνα</div>
                <div class="kpi-label">Ταμειακή Ροή μετά Δάνειο</div>
              </div>
            </div>
          </div>` : ''}

          <!-- Σενάρια -->
          ${scen ? `
          <div class="section">
            <div class="section-title">Σενάρια και Προβλέψεις</div>
            <div class="two-col" style="margin-bottom:12px;">
              <div class="scenario-box sell-box">
                <div class="box-title negative">Πώληση Τώρα</div>
                <div class="row"><span class="row-label">Αξία Πώλησης</span><span class="row-value">${fe(calc.myVal)}</span></div>
                <div class="row"><span class="row-label">Μετά έξοδα</span><span class="row-value warning bold">${fe(scen.sellNow)}</span></div>
              </div>
              <div class="scenario-box hold-box">
                <div class="box-title positive">Κράτα και Νοίκιαζε</div>
                <div class="row"><span class="row-label">Σύνολο Ενοικίων</span><span class="row-value positive">${fe(scen.rentTotal)}</span></div>
                <div class="row"><span class="row-label">Αξία σε χρόνια</span><span class="row-value positive">${fe(scen.futVal)}</span></div>
                <div class="row"><span class="row-label">Συνολική Απόδοση</span><span class="row-value positive bold">${fe(scen.total)}</span></div>
              </div>
            </div>
            <div class="kpi-grid">
              <div class="kpi"><div class="kpi-value accent">${fp(scen.cagr)}</div><div class="kpi-label">CAGR Αξίας</div></div>
              <div class="kpi"><div class="kpi-value gold">${fp(scen.irr)}</div><div class="kpi-label">IRR</div></div>
              <div class="kpi">
                <div class="kpi-value ${scen.mcPositive >= 70 ? 'positive' : scen.mcPositive >= 50 ? 'warning' : 'negative'}">${scen.mcPositive.toFixed(0)}%</div>
                <div class="kpi-label">Πιθανότητα Κέρδους (Monte Carlo)</div>
              </div>
              <div class="kpi"><div class="kpi-value positive">${fe(scen.mcP50)}</div><div class="kpi-label">Πιθανότερη Απόδοση (P50)</div></div>
            </div>
            <div class="bar-track">
              <div class="bar-fill" style="width:${scen.mcPositive}%;background:${scen.mcPositive >= 70 ? '#137333' : scen.mcPositive >= 50 ? '#b45309' : '#c5221f'};"></div>
            </div>
          </div>` : ''}

          <!-- Footer -->
          <div class="footer">
            <div>Property OS — Επαγγελματικό Εργαλείο Ανάλυσης Ακινήτων</div>
            <div>${today}</div>
          </div>
          <div class="disclaimer">
            Το παρόν έγγραφο αποτελεί εκτίμηση και όχι επίσημη φορολογική ή επενδυτική συμβουλή. Συμβουλευτείτε λογιστή ή χρηματοοικονομικό σύμβουλο.
          </div>

        </div>
      </body>
      </html>
    `);

    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
      setPrinting(false);
    }, 1000);
  };

  return (
    <button
      onClick={handlePrint}
      disabled={printing}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        borderRadius: 20,
        padding: '8px 18px',
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 500,
        color: 'var(--text-secondary)',
        fontFamily: "'Google Sans', sans-serif",
        opacity: printing ? 0.7 : 1,
        transition: 'all 0.2s',
      }}
      onMouseEnter={e => {
        const b = e.currentTarget as HTMLButtonElement;
        b.style.borderColor = 'var(--accent)';
        b.style.color = 'var(--accent)';
      }}
      onMouseLeave={e => {
        const b = e.currentTarget as HTMLButtonElement;
        b.style.borderColor = 'var(--border-default)';
        b.style.color = 'var(--text-secondary)';
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 6 2 18 2 18 9" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <rect x="6" y="14" width="12" height="8" />
      </svg>
      {printing ? 'Εκτύπωση...' : 'Εξαγωγή PDF'}
    </button>
  );
}