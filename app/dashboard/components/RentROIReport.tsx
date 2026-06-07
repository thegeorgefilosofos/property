'use client';

import { useRef, useState } from 'react';

interface ReportProps {
  propertyName: string;
  propertyAddress: string;
  propertyType: string;
  calc: any;
  airbnbCalc?: any;
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

export default function RentROIReport({ propertyName, propertyAddress, propertyType, calc, airbnbCalc, scen, bench, ownerAge, constructionType, floor, electronic }: ReportProps) {
  const [printing, setPrinting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const handlePrint = async () => {
    setPrinting(true);
    // Open print dialog with custom styles
    const printWindow = window.open('', '_blank', 'width=900,height=700');
if (!printWindow) { 
  alert('Επίτρεψε τα popups: πάτα το εικονίδιο 🔒 στη γραμμή διευθύνσεων → Pop-ups → Allow');
  setPrinting(false); 
  return; 
}

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Property OS — ${propertyName}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Inter', sans-serif; background: #fff; color: #1a1a2e; font-size: 11px; line-height: 1.5; }
          .page { padding: 32px; max-width: 794px; margin: 0 auto; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #0C3DA5; }
          .logo { font-size: 20px; font-weight: 800; color: #0C3DA5; letter-spacing: -0.5px; }
          .logo span { color: #D4AF42; }
          .meta { text-align: right; font-size: 10px; color: #666; }
          .title { font-size: 16px; font-weight: 700; color: #1a1a2e; margin-bottom: 2px; }
          .subtitle { font-size: 11px; color: #666; }
          .section { margin-bottom: 20px; }
          .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #0C3DA5; margin-bottom: 10px; padding-bottom: 4px; border-bottom: 1px solid #e8e8f0; }
          .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
          .kpi-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }
          .kpi { background: #f8f8ff; border: 1px solid #e8e8f0; border-radius: 8px; padding: 10px 12px; }
          .kpi-value { font-size: 16px; font-weight: 700; font-family: monospace; margin-bottom: 2px; }
          .kpi-label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.1em; color: #666; }
          .positive { color: #16a34a; }
          .negative { color: #dc2626; }
          .warning { color: #d97706; }
          .accent { color: #0C3DA5; }
          .gold { color: #D4AF42; }
          .row { display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid #f0f0f8; }
          .row-label { color: #555; }
          .row-value { font-weight: 600; font-family: monospace; }
          .row-value.bold { font-weight: 700; font-size: 13px; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 9px; font-weight: 700; }
          .badge-good { background: #dcfce7; color: #16a34a; }
          .badge-warn { background: #fef3c7; color: #d97706; }
          .badge-bad { background: #fee2e2; color: #dc2626; }
          .score-big { font-size: 48px; font-weight: 800; font-family: monospace; text-align: center; padding: 16px; }
          .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
          .info-box { background: #f0f4ff; border: 1px solid #c7d7ff; border-radius: 6px; padding: 8px 12px; font-size: 10px; color: #0C3DA5; margin-top: 8px; }
          .warning-box { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 6px; padding: 8px 12px; font-size: 10px; color: #92400e; margin-top: 8px; }
          .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e8e8f0; display: flex; justify-content: space-between; font-size: 9px; color: #999; }
          .watermark { text-align: center; font-size: 9px; color: #ccc; margin-top: 8px; }
          @media print { .page { padding: 20px; } }
          .scenario-box { border-radius: 8px; padding: 12px; }
          .sell-box { background: #fff5f5; border: 1px solid #fca5a5; }
          .hold-box { background: #f0fdf4; border: 1px solid #86efac; }
          .box-title { font-size: 11px; font-weight: 700; margin-bottom: 8px; }
        </style>
      </head>
      <body>
        <div class="page">
          <!-- Header -->
          <div class="header">
            <div>
              <div class="logo">Property <span>OS</span></div>
              <div style="font-size:10px;color:#666;margin-top:2px;">Επαγγελματικό Εργαλείο Ανάλυσης Ακινήτων</div>
            </div>
            <div class="meta">
              <div style="font-weight:600;color:#1a1a2e;font-size:13px;">${propertyName}</div>
              <div>${propertyAddress}</div>
              <div>${propertyType}</div>
              <div style="margin-top:4px;">Ημερομηνία: ${today}</div>
            </div>
          </div>

          <!-- Score + Top KPIs -->
          <div class="section">
            <div class="section-title">Συνολική Αξιολόγηση</div>
            <div style="display:grid;grid-template-columns:auto 1fr;gap:20px;align-items:center;margin-bottom:16px;">
              <div style="text-align:center;padding:12px 20px;background:#f8f8ff;border-radius:10px;border:1px solid #e8e8f0;">
                <div class="score-big ${calc.totalScore>=70?'positive':calc.totalScore>=50?'warning':'negative'}" style="font-size:40px;padding:8px;">${calc.totalScore}</div>
                <div style="font-size:10px;font-weight:700;color:${calc.totalScore>=70?'#16a34a':calc.totalScore>=50?'#d97706':'#dc2626'}">${calc.scoreLabel}</div>
                <div style="font-size:8px;color:#999;">βαθμολογία / 100</div>
              </div>
              <div class="kpi-grid" style="margin-bottom:0;">
                <div class="kpi"><div class="kpi-value ${calc.grossYield>=5?'positive':calc.grossYield>=3?'warning':'negative'}">${fp(calc.grossYield)}</div><div class="kpi-label">Μεικτή Απόδοση</div></div>
                <div class="kpi"><div class="kpi-value ${calc.netYield>=3?'positive':calc.netYield>=1.5?'warning':'negative'}">${fp(calc.netYield)}</div><div class="kpi-label">Καθαρή Απόδοση</div></div>
                <div class="kpi"><div class="kpi-value accent">${fp(calc.capRate)}</div><div class="kpi-label">Κεφαλαιακή Απόδοση</div></div>
                <div class="kpi"><div class="kpi-value ${calc.afterTax>0?'positive':'negative'}">${fe(calc.afterTax/12)}</div><div class="kpi-label">Καθαρό / Μήνα</div></div>
              </div>
            </div>
          </div>

          <!-- P&L -->
          <div class="section">
            <div class="section-title">Ετήσια Κατάσταση Αποτελεσμάτων Χρήσης (P&L)</div>
            <div class="two-col">
              <div>
                <div class="row"><span class="row-label">Ακαθάριστο Ενοίκιο</span><span class="row-value positive">${fe(calc.annual)}</span></div>
                ${calc.reduction>0?`<div class="row"><span class="row-label">Έκπτωση Ηλεκτρονικής Πληρωμής</span><span class="row-value" style="color:#2563eb;">-${fe(calc.reduction)}</span></div>`:''}
                <div class="row"><span class="row-label">Δαπάνες Ακινήτου</span><span class="row-value warning">-${fe(calc.totalExp)}</span></div>
                <div class="row"><span class="row-label">Καθαρό Εισόδημα (προ φόρου)</span><span class="row-value accent bold">${fe(calc.netIncome)}</span></div>
                <div class="row"><span class="row-label">Φόρος Εισοδήματος</span><span class="row-value negative">-${fe(calc.tax)}</span></div>
                <div class="row"><span class="row-label">Καθαρό Εισόδημα (μετά φόρου)</span><span class="row-value ${calc.afterTax>=0?'positive':'negative'} bold">${fe(calc.afterTax)}</span></div>
                <div class="row"><span class="row-label">Καθαρό / Μήνα</span><span class="row-value ${calc.afterTax>=0?'positive':'negative'} bold">${fe(calc.afterTax/12)}</span></div>
              </div>
              <div>
                <div class="kpi-grid-3" style="margin-bottom:10px;">
                  <div class="kpi"><div class="kpi-value accent">${fp(calc.grossYield)}</div><div class="kpi-label">Gross Yield</div></div>
                  <div class="kpi"><div class="kpi-value positive">${fp(calc.netYield)}</div><div class="kpi-label">Net Yield</div></div>
                  <div class="kpi"><div class="kpi-value gold">${calc.payback>0?calc.payback.toFixed(1)+' χρ':'—'}</div><div class="kpi-label">Απόσβεση</div></div>
                </div>
                <div class="kpi"><div class="kpi-value accent">${fp(calc.trueYield)}</div><div class="kpi-label">Πραγματική Απόδοση (με κόστη απόκτησης)</div></div>
                <div class="info-box" style="margin-top:10px;">Πραγματικός Φ.Σ.: ${fp(calc.effectiveRate)} | Breakeven: ${fe(calc.breakeven)}/μήνα</div>
                ${electronic?`<div class="info-box">Εξοικονόμηση ηλεκτρονικής πληρωμής: <strong>${fe(calc.electronicSaving)}</strong>/έτος</div>`:''}
              </div>
            </div>
          </div>

          <!-- Market Benchmarks -->
          ${bench?`
          <div class="section">
            <div class="section-title">Σύγκριση με Αγορά — ${bench.market_label}</div>
            <div class="kpi-grid">
              <div class="kpi">
                <div class="kpi-value ${calc.grossYield>=parseFloat(bench.market_gross)?'positive':'warning'}">${fp(calc.grossYield)}</div>
                <div class="kpi-label">Gross Yield σου</div>
                <div style="font-size:9px;color:#999;">Benchmark: ${bench.market_gross}%</div>
              </div>
              <div class="kpi">
                <div class="kpi-value ${calc.netYield>=parseFloat(bench.target_net)?'positive':'warning'}">${fp(calc.netYield)}</div>
                <div class="kpi-label">Net Yield σου</div>
                <div style="font-size:9px;color:#999;">Στόχος: >${bench.target_net}%</div>
              </div>
              <div class="kpi">
                <div class="kpi-value ${calc.netYield>parseFloat(bench.euribor)?'positive':'negative'}">+${fp(Math.max(calc.netYield-parseFloat(bench.euribor),0))}</div>
                <div class="kpi-label">vs EURIBOR</div>
                <div style="font-size:9px;color:#999;">EURIBOR ${bench.euribor}%</div>
              </div>
              <div class="kpi">
                <div class="kpi-value ${calc.netYield>=parseFloat(bench.etf_return)?'positive':'negative'}">${calc.netYield>=parseFloat(bench.etf_return)?'Νικά ETF':'Κάτω ETF'}</div>
                <div class="kpi-label">vs ETF</div>
                <div style="font-size:9px;color:#999;">Benchmark ${bench.etf_return}%/έτος</div>
              </div>
            </div>
          </div>`:''}

          <!-- Loan if exists -->
          ${calc.loanBal>0?`
          <div class="section">
            <div class="section-title">Ανάλυση Δανείου</div>
            <div class="kpi-grid">
              <div class="kpi"><div class="kpi-value ${calc.DSCR>=1.25?'positive':calc.DSCR>=1?'warning':'negative'}">${calc.DSCR.toFixed(2)}x</div><div class="kpi-label">DSCR — Κάλυψη Δανείου</div></div>
              <div class="kpi"><div class="kpi-value ${calc.LTV<=60?'positive':calc.LTV<=80?'warning':'negative'}">${fp(calc.LTV)}</div><div class="kpi-label">LTV — Δάνειο / Αξία</div></div>
              <div class="kpi"><div class="kpi-value positive">${fe(calc.equity)}</div><div class="kpi-label">Ίδια Κεφάλαια (Equity)</div></div>
              <div class="kpi"><div class="kpi-value ${calc.cfDebt>0?'positive':'negative'}">${fe(calc.cfDebt/12)}/μήνα</div><div class="kpi-label">Ταμειακή Ροή μετά Δάνειο</div></div>
            </div>
          </div>`:''}

          <!-- Scenario -->
          ${scen?`
          <div class="section">
            <div class="section-title">Σενάρια και Προβλέψεις</div>
            <div class="two-col">
              <div class="scenario-box sell-box">
                <div class="box-title negative">Πώληση Τώρα</div>
                <div class="row"><span class="row-label">Αξία Πώλησης</span><span class="row-value">${fe(calc.myVal)}</span></div>
                <div class="row"><span class="row-label">Μετά έξοδα</span><span class="row-value warning bold">${fe(scen.sellNow)}</span></div>
              </div>
              <div class="scenario-box hold-box">
                <div class="box-title positive">Κράτα & Νοίκιαζε</div>
                <div class="row"><span class="row-label">Σύνολο Ενοικίων</span><span class="row-value positive">${fe(scen.rentTotal)}</span></div>
                <div class="row"><span class="row-label">Αξία σε χρόνια</span><span class="row-value positive">${fe(scen.futVal)}</span></div>
                <div class="row"><span class="row-label">Συνολική Απόδοση</span><span class="row-value positive bold">${fe(scen.total)}</span></div>
              </div>
            </div>
            <div class="kpi-grid" style="margin-top:12px;">
              <div class="kpi"><div class="kpi-value accent">${fp(scen.cagr)}</div><div class="kpi-label">CAGR Αξίας</div></div>
              <div class="kpi"><div class="kpi-value gold">${fp(scen.irr)}</div><div class="kpi-label">IRR (Εσωτερικό Ποσοστό Απόδοσης)</div></div>
              <div class="kpi"><div class="kpi-value ${scen.mcPositive>=70?'positive':scen.mcPositive>=50?'warning':'negative'}">${scen.mcPositive.toFixed(0)}%</div><div class="kpi-label">Πιθανότητα Κέρδους (Monte Carlo)</div></div>
              <div class="kpi"><div class="kpi-value positive">${fe(scen.mcP50)}</div><div class="kpi-label">Πιθανότερη Απόδοση (P50)</div></div>
            </div>
          </div>`:''}

          <!-- Footer -->
          <div class="footer">
            <div>Property OS — Επαγγελματικό Εργαλείο Ανάλυσης Ακινήτων</div>
            <div>${today}</div>
          </div>
          <div class="watermark">⚠️ Το παρόν έγγραφο αποτελεί εκτίμηση και όχι επίσημη φορολογική ή επενδυτική συμβουλή. Συμβουλευτείτε λογιστή ή χρηματοοικονομικό σύμβουλο.</div>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
      setPrinting(false);
    }, 800);
  };

  return (
    <button onClick={handlePrint} disabled={printing}
      style={{
        display:'flex',alignItems:'center',gap:'8px',
        background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',
        borderRadius:'8px',padding:'8px 16px',cursor:'pointer',
        fontSize:'12px',fontWeight:600,color:'var(--text-primary)',
        fontFamily:'Inter,sans-serif',opacity:printing?0.7:1,
        transition:'all 0.2s',
      }}
      onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor='var(--accent)';(e.currentTarget as HTMLButtonElement).style.color='var(--accent)';}}
      onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.borderColor='var(--border-subtle)';(e.currentTarget as HTMLButtonElement).style.color='var(--text-primary)';}}>
      {printing?'⏳ Εκτύπωση...':'📄 Export PDF Report'}
    </button>
  );
}
