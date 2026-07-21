'use client';

import { useState } from 'react';
import { useReportBranding } from '@/lib/reportBranding';
import {
  reportHead, reportHeader, reportSection, reportRow, reportKpi, reportDisclaimer, openReport,
  rEsc, rEur, rSigned, rPct,
} from './reportPdf';

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
  userId?: string;
}

export default function RentROIReport({
  propertyName, propertyAddress, propertyType,
  calc, scen, bench, ownerAge, constructionType, floor, electronic, userId,
}: ReportProps) {
  const [printing, setPrinting] = useState(false);
  const branding = useReportBranding(userId);

  const handlePrint = () => {
    setPrinting(true);

    const sub = [propertyAddress, propertyType].filter(Boolean).map(x => rEsc(String(x))).join(' · ');

    // ── Συνολική αξιολόγηση ──────────────────────────────────────────────
    const scoreBlock =
      reportSection('Συνολική αξιολόγηση')
      + `<div class="kpis">`
      + reportKpi('Μεικτή απόδοση', rPct(calc.grossYield))
      + reportKpi('Καθαρή απόδοση', rPct(calc.netYield))
      + reportKpi('Κεφαλαιακή απόδοση', rPct(calc.capRate))
      + reportKpi('Καθαρό / μήνα', rSigned(calc.afterTax / 12))
      + `</div>`
      + `<div class="note">Συνολική βαθμολογία <strong class="tnum">${rEsc(String(calc.totalScore))} / 100</strong> · ${rEsc(calc.scoreLabel)}</div>`;

    // ── Κατάσταση αποτελεσμάτων χρήσης (P&L) ─────────────────────────────
    const plRows =
      reportRow('Ακαθάριστο ενοίκιο / έτος', rEur(calc.annual))
      + (calc.reduction > 0 ? reportRow('Έκπτωση ηλεκτρονικής πληρωμής', rSigned(-calc.reduction)) : '')
      + reportRow('Δαπάνες ακινήτου', rSigned(-calc.totalExp))
      + reportRow('Καθαρό εισόδημα (προ φόρου)', rSigned(calc.netIncome), 'sub')
      + reportRow('Φόρος εισοδήματος', rSigned(-calc.tax))
      + reportRow('Καθαρό εισόδημα (μετά φόρου)', rSigned(calc.afterTax), 'result');
    const plBlock =
      reportSection('Κατάσταση αποτελεσμάτων χρήσης (P&L)')
      + `<table><tbody>${plRows}</tbody></table>`
      + `<div class="kpis" style="margin-top:14px">`
      + reportKpi('Απόσβεση', calc.payback > 0 ? `${calc.payback.toLocaleString('el-GR', { maximumFractionDigits: 1 })} χρ` : '—')
      + reportKpi('Πραγματική απόδοση (με κόστη απόκτησης)', rPct(calc.trueYield))
      + reportKpi('Πραγματικός φορ. συντελεστής', rPct(calc.effectiveRate))
      + reportKpi('Breakeven / μήνα', rEur(calc.breakeven))
      + `</div>`
      + (electronic && calc.electronicSaving > 0
        ? `<div class="note">Εξοικονόμηση ηλεκτρονικής πληρωμής <strong class="tnum">${rEsc(rEur(calc.electronicSaving))}</strong> / έτος</div>`
        : '');

    // ── Σύγκριση με την αγορά ─────────────────────────────────────────────
    const bpct = (v: unknown) => `${Number(v ?? 0).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
    const benchBlock = bench
      ? reportSection(`Σύγκριση με τον δείκτη αγοράς · ${bench.market_label}`)
        + `<table><thead><tr><th>Δείκτης</th><th class="n">Δικό σου</th><th class="np">Αναφορά</th></tr></thead><tbody>`
        + `<tr><td>Μεικτή απόδοση</td><td class="n">${rEsc(rPct(calc.grossYield))}</td><td class="np">Αγορά ${rEsc(bpct(bench.market_gross))}</td></tr>`
        + `<tr><td>Καθαρή απόδοση</td><td class="n">${rEsc(rPct(calc.netYield))}</td><td class="np">Στόχος &gt; ${rEsc(bpct(bench.target_net))}</td></tr>`
        + `<tr><td>Απόδοση έναντι του δείκτη Euribor</td><td class="n">+${rEsc(rPct(Math.max(calc.netYield - parseFloat(bench.euribor), 0)))}</td><td class="np">Euribor ${rEsc(bpct(bench.euribor))}</td></tr>`
        + `<tr><td>Σύγκριση με ETF</td><td class="n">${rEsc(calc.netYield >= parseFloat(bench.etf_return) ? 'Νικά ETF' : 'Κάτω ETF')}</td><td class="np">ETF ${rEsc(bpct(bench.etf_return))}/έτος</td></tr>`
        + `</tbody></table>`
      : '';

    // ── Ανάλυση δανείου ───────────────────────────────────────────────────
    const loanBlock = calc.loanBal > 0
      ? reportSection('Ανάλυση δανείου')
        + `<div class="kpis">`
        + reportKpi('DSCR · κάλυψη δανείου', `${calc.DSCR.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`)
        + reportKpi('LTV · δάνειο / αξία', rPct(calc.LTV))
        + reportKpi('Ίδια κεφάλαια', rEur(calc.equity))
        + reportKpi('Ταμειακή ροή / μήνα', rSigned(calc.cfDebt / 12))
        + `</div>`
      : '';

    // ── Σενάρια και προβλέψεις ────────────────────────────────────────────
    const scenBlock = scen
      ? reportSection('Σενάρια και προβλέψεις')
        + `<table><tbody>`
        + reportRow('Πώληση τώρα', '', 'sub')
        + reportRow('Αξία πώλησης', rEur(calc.myVal))
        + reportRow('Μετά έξοδα', rEur(scen.sellNow))
        + reportRow('Κράτα και νοίκιαζε', '', 'sub')
        + reportRow('Σύνολο ενοικίων', rEur(scen.rentTotal))
        + reportRow('Αξία σε χρόνια', rEur(scen.futVal))
        + reportRow('Συνολική απόδοση', rSigned(scen.total), 'result')
        + `</tbody></table>`
        + `<div class="kpis" style="margin-top:14px">`
        + reportKpi('CAGR αξίας', rPct(scen.cagr))
        + reportKpi('Μέση ετήσια απόδοση', rPct(scen.irr))
        + reportKpi('Πιθανότητα κέρδους (Monte Carlo)', rPct(scen.mcPositive))
        + reportKpi('Πιθανότερη απόδοση (P50)', rSigned(scen.mcP50))
        + `</div>`
      : '';

    const html =
      reportHead(`Ανάλυση απόδοσης · ${propertyName}`)
      + `<body><div class="page">`
      + reportHeader(branding, 'Ανάλυση απόδοσης ακινήτου')
      + `<h1>${rEsc(propertyName)}</h1>`
      + (sub ? `<div class="sub">${sub}</div>` : '')
      + scoreBlock
      + plBlock
      + benchBlock
      + loanBlock
      + scenBlock
      + reportDisclaimer('Το παρόν έγγραφο αποτελεί εκτίμηση και όχι επίσημη φορολογική ή επενδυτική συμβουλή. Συμβουλευτείτε λογιστή ή χρηματοοικονομικό σύμβουλο.', branding)
      + `</div></body></html>`;

    openReport(html);
    setTimeout(() => setPrinting(false), 600);
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
        borderRadius: 100,
        padding: '8px 18px',
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 700,
        color: 'var(--text-secondary)',
        fontFamily: "'Inter', sans-serif",
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
      {printing ? 'Εκτύπωση…' : 'Εξαγωγή PDF'}
    </button>
  );
}