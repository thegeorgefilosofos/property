'use client';
// ═══════════════════════════════════════════════════════════════════════════
// ΑΠΟΔΟΣΕΙΣ — το εργαλείο απόδοσης ακινήτου. Καθαρό, minimal, πτυσσόμενο.
// Οδηγείται από το προφίλ: ιδιώτης → απλή εικόνα· επαγγελματίας → αναλυτικά
// εργαλεία, με διάκριση φυσικού/νομικού προσώπου όπου έχει σημασία.
// Πραγματικά δεδομένα αγοράς (lib/market/greekMarket) + μηχανή (lib/market/returns).
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/lib/supabase/client';
import { Spinner, fe, fn, T } from '@/components/Theme';
import { NumberInput, CustomSelect } from './UIComponents';
import { ChevronRight, TrendingUp, Landmark, Percent, Wallet, Building2, Layers, ArrowUpRight, Info, ShieldCheck } from 'lucide-react';
import { yields, compound, leverage, applySeries, compareInvestments, propertyTotalReturn, projectLine, yieldGrade, dealAnalysis, type LeverageResult, type YieldGrade } from '@/lib/market/returns';
import { shortTermEstimate, breakEvenOccupancy, adrReference, MAX_ST_GROSS_YIELD_WARN } from '@/lib/market/shortTerm';
import {
  REGIONS, BENCHMARKS, BENCHMARKS_ASOF, HISTORY_INDEX, HISTORY_ANCHORS, SHORT_TERM, YIELD_LEVERS, AUCTION_FACTS,
  GREECE_AVG_GROSS_YIELD, ATHENS_AVG_GROSS_YIELD, MARKET_DISCLAIMER, MARKET_DATA_ASOF, MARKET_SOURCES,
  yieldVerdict, regionByKey, estimatePropertyValue, type ShortTermStat, type YieldLever,
} from '@/lib/market/greekMarket';
import { incomeStatement, type TaxRegime } from '@/lib/accounting/statement';
import { GLOSSARY as G } from '@/lib/market/glossary';
import { useReportBranding } from '@/lib/reportBranding';
import { reportHead, reportHeader, reportSection, reportRow, reportKpi, reportDisclaimer, openReport, rEur, rSigned, rPct, rEsc } from './reportPdf';
import { generateReportPdf, pEur, pSigned, pPct, type PdfReportModel, type PdfSection, type PdfRow } from '@/lib/pdf/pdfReport';
import { issueDocument } from '@/lib/documents/issue';

// Αντιστοίχιση περιοχής → πλησιέστερη αναφορά βραχυχρόνιας (τα δεδομένα ST είναι ανά
// ευρύτερη ζώνη, όχι ανά προάστιο). Δίνει ρεαλιστικά defaults (πληρότητα/τιμή) ανά περιοχή.
const ST_ALIAS: Record<string, string> = {
  ath_center: 'ath_center', ath_kolonaki: 'ath_center', ath_north: 'ath_center', ath_west: 'ath_center',
  ath_south: 'ath_riviera', east_attica: 'ath_riviera', piraeus: 'ath_center',
  thess_center: 'thess', thess_kalamaria: 'thess',
  heraklion: 'crete', chania: 'crete',
  mykonos: 'mykonos_santorini', santorini: 'mykonos_santorini', paros_naxos: 'paros_naxos', rhodes: 'rhodes', corfu: 'rhodes',
  patras: 'thess', larissa: 'thess', volos: 'thess', ioannina: 'thess',
  // Ηπειρωτικές πόλεις → προφίλ πόλης (Θεσσαλονίκη)
  tripoli: 'thess', corinth: 'thess', pyrgos: 'thess', lamia: 'thess', chalkida: 'thess',
  trikala: 'thess', karditsa: 'thess', katerini: 'thess', veroia: 'thess', kozani: 'thess',
  kastoria: 'thess', kavala: 'thess', serres: 'thess', drama: 'thess', xanthi: 'thess',
  komotini: 'thess', alexandroupoli: 'thess', agrinio: 'thess',
  sparti: 'thess', livadeia: 'thess', edessa: 'thess', florina: 'thess', grevena: 'thess',
  karpenisi: 'crete', igoumenitsa: 'thess',
  // Τουριστικοί προορισμοί → κοντινότερο νησιωτικό/παραθαλάσσιο προφίλ
  kalamata: 'crete', nafplio: 'crete', preveza: 'crete', halkidiki: 'crete',
  zakynthos: 'rhodes', kefalonia: 'rhodes', lesvos: 'crete', chios: 'crete', samos: 'crete',
  kos: 'rhodes', syros: 'paros_naxos', rethymno: 'crete', agios_nikolaos: 'crete',
  sporades: 'rhodes', limnos: 'crete', milos_ios: 'paros_naxos', andros: 'paros_naxos', karpathos: 'rhodes',
};
const stRefFor = (regionKey: string): ShortTermStat =>
  SHORT_TERM.find(s => s.key === (ST_ALIAS[regionKey] || regionKey)) || SHORT_TERM[0];

interface Props { propertyId: string; userId: string; propertyValue?: number; profileType?: 'individual' | 'professional'; }

const fp = (n: number) => `${(isFinite(n) ? n : 0).toLocaleString('el-GR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
// Ρεαλιστικό εύρος συνολικής ετήσιας απόδοσης για πολυετείς προβολές/σύγκριση: προστατεύει
// από ακραίες τιμές λόγω μη ρεαλιστικών εισόδων (π.χ. πολύ μικρή αξία με έσοδα βραχυχρόνιας).
// Δεν επηρεάζει τους δείκτες KPI — μόνο τον ανατοκισμό στα γραφήματα/μπάρες.
const clampReturn = (r: number) => Math.max(-30, Math.min(35, isFinite(r) ? r : 0));
// Συμπαγής μορφή ευρώ (χιλ./εκατ./δισ.) για tooltips & μπάρες — ποτέ υπερχείλιση κειμένου.
const feC = (n: number) => {
  const v = isFinite(n) ? n : 0, a = Math.abs(v);
  const s = (x: number, u: string) => `${(v / x).toLocaleString('el-GR', { maximumFractionDigits: 1 })} ${u} €`;
  if (a >= 1e12) return s(1e12, 'τρισ.');
  if (a >= 1e9) return s(1e9, 'δισ.');
  if (a >= 1e6) return s(1e6, 'εκατ.');
  return fe(Math.round(v), 0);
};
// Σύντομες, ολοκληρωμένες (χωρίς συντομογραφίες) ονομασίες εναλλακτικών για τα γραφήματα.
const BENCH_SHORT: Record<string, string> = {
  deposit: 'Κατάθεση', bond: 'Ομόλογο', gold: 'Χρυσός', athex: 'Χρηματιστήριο', sp500: 'S&P 500', inflation: 'Πληθωρισμός',
};
const benchShort = (key: string, fallback: string) => BENCH_SHORT[key] || fallback;
const SANS = T.font.sans;
const card: React.CSSProperties = { position: 'relative', background: 'linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg-surface) 100%)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: '18px 20px', boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset, 0 14px 34px -20px rgba(0,0,0,0.55)' };
const titleStyle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0, fontFamily: SANS, letterSpacing: '0.1px' };
const subStyle: React.CSSProperties = { fontSize: 12, color: 'var(--text-tertiary)', margin: '2px 0 0', fontFamily: SANS };

// ── Επεξήγηση όρου (διακριτικό εικονίδιο· επαγγελματικός ορισμός) ─────────────
// Προσβάσιμο: πραγματικό κουμπί (πληκτρολόγιο + αφή), ανοίγει σε hover, εστίαση ή άγγιγμα,
// κλείνει σε Escape/έξοδο. Portal-based popover ώστε να μην «κόβεται» από scroll containers.
function TermInfo({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean }>({ top: 0, left: 0, up: false });
  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || typeof window === 'undefined') return;
    const W = 280;
    const left = Math.min(Math.max(8, r.left - 2), window.innerWidth - W - 8);
    const up = r.bottom + 130 > window.innerHeight;
    setPos({ top: up ? r.top - 8 : r.bottom + 8, left, up });
    setOpen(true);
  };
  const hide = () => setOpen(false);
  return (
    <>
      <button ref={ref} type="button" aria-label="Επεξήγηση όρου" aria-expanded={open}
        onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); open ? hide() : show(); }}
        onKeyDown={(e) => { if (e.key === 'Escape') hide(); }}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', verticalAlign: 'middle', marginLeft: 5, padding: 0, width: 16, height: 16, border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'help' }}>
        <Info size={12.5} />
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div role="tooltip" style={{ position: 'fixed', top: pos.top, left: pos.left, transform: pos.up ? 'translateY(-100%)' : 'none', width: 280, maxWidth: 'calc(100vw - 16px)', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '10px 12px', boxShadow: '0 18px 40px -22px rgba(0,0,0,0.7)', zIndex: 3000, pointerEvents: 'none' }}>
          <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-secondary)', fontFamily: SANS, lineHeight: 1.55 }}>{text}</p>
        </div>,
        document.body,
      )}
    </>
  );
}

// ── Πτυσσόμενη ενότητα (ομοιόμορφη, χωρίς μπλε πλαίσιο) ─────────────────────
function Section({ icon, title, sub, info, children, defaultOpen = false }: { icon: React.ReactNode; title: string; sub?: string; info?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={card}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} className="acc-toggle" style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 9, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', flexShrink: 0 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={titleStyle}>{title}{info && <TermInfo text={info} />}</p>
          {sub && <p style={subStyle}>{sub}</p>}
        </div>
        <ChevronRight size={17} style={{ color: 'var(--text-tertiary)', flexShrink: 0, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.18s' }} />
      </button>
      {open && <div style={{ marginTop: 16 }}>{children}</div>}
    </div>
  );
}

// ── KPI κάρτα 3D ────────────────────────────────────────────────────────────
function KPI({ label, value, sub, accent, info }: { label: string; value: string; sub?: string; accent?: boolean; info?: string }) {
  const [hot, setHot] = useState(false);
  return (
    <div onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
      style={{ background: 'linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg-surface) 100%)', border: `1px solid ${hot ? 'var(--border-accent)' : 'var(--border-subtle)'}`, borderRadius: 14, padding: '15px 16px', boxShadow: hot ? '0 16px 30px -18px rgba(0,0,0,0.6)' : '0 8px 20px -18px rgba(0,0,0,0.5)', transform: hot ? 'translateY(-3px)' : 'none', transition: 'transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease' }}>
      <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: 0, fontFamily: SANS, display: 'flex', alignItems: 'center' }}>{label}{info && <TermInfo text={info} />}</p>
      <p style={{ fontSize: 24, fontWeight: 700, color: accent && hot ? 'var(--accent)' : 'var(--text-primary)', margin: '6px 0 0', fontVariantNumeric: 'tabular-nums', fontFamily: SANS, lineHeight: 1, transition: 'color 0.16s ease' }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '4px 0 0', fontFamily: SANS }}>{sub}</p>}
    </div>
  );
}

// ── Κάρτα βαθμού απόδοσης (A–F) — μονόχρωμη· ο βαθμός, ο αριθμός και το μήκος
//    της μπάρας μεταφέρουν την ποιότητα, χωρίς περιττά χρώματα. ────────────────
function GradeCard({ grade, note }: { grade: YieldGrade; note: string }) {
  const strong = grade.grade === 'A' || grade.grade === 'B';
  return (
    <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: 16, background: 'var(--bg-elevated)', border: `1px solid ${strong ? 'var(--border-accent)' : 'var(--border-subtle)'}`, flexShrink: 0 }}>
        <span style={{ fontSize: 32, fontWeight: 700, color: strong ? 'var(--accent)' : 'var(--text-primary)', fontFamily: SANS, lineHeight: 1 }}>{grade.grade}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0, fontFamily: SANS, display: 'flex', alignItems: 'center' }}>Βαθμός απόδοσης<TermInfo text={G.grade} /></p>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>{grade.label} · {grade.score} / 100</span>
        </div>
        <div style={{ marginTop: 8, height: 6, borderRadius: 4, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
          <div style={{ width: `${Math.max(3, grade.score)}%`, height: '100%', borderRadius: 4, background: 'var(--accent)', transition: 'width 0.5s ease' }} />
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--text-tertiary)', fontFamily: SANS, lineHeight: 1.5 }}>{note}</p>
      </div>
    </div>
  );
}

// ── Μίνι μπάρα-γράφημα (ιστορικό / σύγκριση) ─────────────────────────────────
function BarRow({ label, value, max, valueLabel, tone = 'neutral', hint }: { label: string; value: number; max: number; valueLabel: string; tone?: 'accent' | 'neutral' | 'muted'; hint?: string }) {
  const pct = max > 0 ? Math.max(2, Math.min(100, (value / max) * 100)) : 0;
  const bg = tone === 'accent' ? 'var(--accent)' : tone === 'muted' ? 'var(--text-tertiary)' : 'var(--border-default)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '5px 0' }} title={hint}>
      <span style={{ width: 156, flexShrink: 0, fontSize: 12, color: 'var(--text-secondary)', fontFamily: SANS, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: bg, transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ width: 92, flexShrink: 0, textAlign: 'right', fontSize: 12, fontWeight: 600, color: tone === 'accent' ? 'var(--accent)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', fontFamily: SANS }}>{valueLabel}</span>
    </div>
  );
}

// Έξυπνο γράφημα περιοχής — premium: ομαλή καμπύλη, βάθος, διαδραστικό tooltip ανά έτος.
function AreaChart({ points }: { points: { year: number; value: number }[] }) {
  const W = 640, H = 196, padX = 18, padTop = 16, padBottom = 26;
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;
  const vals = points.map(p => p.value);
  const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1;
  const n = points.length;
  const baseY = H - padBottom;
  const X = (i: number) => padX + (i / (n - 1)) * (W - 2 * padX);
  const Y = (v: number) => padTop + (1 - (v - min) / range) * (baseY - padTop);
  const pts = points.map((p, i) => [X(i), Y(p.value)] as [number, number]);
  // Ομαλή καμπύλη (Catmull-Rom → κυβικές Bézier) — δίνει το «ζωντανό», premium αίσθημα.
  const smooth = (P: [number, number][]) => {
    let d = `M${P[0][0].toFixed(1)},${P[0][1].toFixed(1)}`;
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2, t = 0.16;
      const c1x = p1[0] + (p2[0] - p0[0]) * t, c1y = p1[1] + (p2[1] - p0[1]) * t;
      const c2x = p2[0] - (p3[0] - p1[0]) * t, c2y = p2[1] - (p3[1] - p1[1]) * t;
      d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d;
  };
  const line = smooth(pts);
  const area = `${line} L${X(n - 1).toFixed(1)},${baseY} L${X(0).toFixed(1)},${baseY} Z`;
  const marks = points.map((p, i) => ({ ...p, i, kind: p.year === HISTORY_ANCHORS.peakYear ? 'peak' : p.year === HISTORY_ANCHORS.troughYear ? 'trough' : i === n - 1 ? 'now' : '' })).filter(m => m.kind);
  const mColor: Record<string, string> = { peak: 'var(--text-tertiary)', trough: 'var(--text-tertiary)', now: 'var(--accent)' };
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * W;
    let best = 0, bd = Infinity;
    for (let i = 0; i < n; i++) { const dx = Math.abs(X(i) - vx); if (dx < bd) { bd = dx; best = i; } }
    setHover(best);
  };
  const hp = hover != null ? points[hover] : null;
  const TW = 96, TH = 34;
  const tx = hp ? Math.max(2, Math.min(W - TW - 2, X(hover!) - TW / 2)) : 0;
  const belowTop = hp ? Y(hp.value) - TH - 12 : 0;
  const ty = belowTop < 2 ? (hp ? Y(hp.value) + 14 : 0) : belowTop;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', touchAction: 'none' }} role="img" aria-label="Ιστορική διαδρομή αξίας"
      onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
      <defs>
        <linearGradient id="roiArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.34" />
          <stop offset="55%" stopColor="var(--accent)" stopOpacity="0.10" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
        <filter id="roiGlow" x="-10%" y="-30%" width="120%" height="170%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="var(--accent)" floodOpacity="0.30" />
        </filter>
      </defs>
      {/* Ελαφριά οριζόντια πλέγματα — «χρηματιστηριακό» look, χωρίς θόρυβο */}
      {[0, 0.25, 0.5, 0.75, 1].map(f => { const gy = padTop + f * (baseY - padTop); return <line key={f} x1={padX} y1={gy.toFixed(1)} x2={W - padX} y2={gy.toFixed(1)} stroke="var(--border-subtle)" strokeWidth="1" opacity="0.45" />; })}
      <path d={area} fill="url(#roiArea)" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" filter="url(#roiGlow)" />
      {marks.map(m => (
        <circle key={m.year} cx={X(m.i)} cy={Y(m.value)} r={m.kind === 'now' ? 4.4 : 3.4} fill={mColor[m.kind]} stroke="var(--bg-surface)" strokeWidth="1.8" />
      ))}
      {points.map((p, i) => (i === 0 || i === n - 1 || i === Math.floor((n - 1) / 2)) ? (
        <text key={'t' + p.year} x={X(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontSize="10" fill="var(--text-tertiary)" fontFamily="Inter, sans-serif">{p.year}</text>
      ) : null)}
      {/* Διαδραστικός δείκτης: κάθετη γραμμή, φωτεινό σημείο, tooltip έτους/τιμής */}
      {hp && (
        <g pointerEvents="none">
          <line x1={X(hover!)} y1={padTop - 4} x2={X(hover!)} y2={baseY} stroke="var(--border-default)" strokeWidth="1" strokeDasharray="3 3" />
          <circle cx={X(hover!)} cy={Y(hp.value)} r="7" fill="var(--accent)" opacity="0.16" />
          <circle cx={X(hover!)} cy={Y(hp.value)} r="4" fill="var(--accent)" stroke="var(--bg-surface)" strokeWidth="2" />
          <g transform={`translate(${tx.toFixed(1)},${ty.toFixed(1)})`}>
            <rect width={TW} height={TH} rx="8" fill="var(--bg-elevated)" stroke="var(--border-subtle)" strokeWidth="1" style={{ filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.28))' }} />
            <text x="10" y="14" fontSize="9.5" fill="var(--text-tertiary)" fontFamily="Inter, sans-serif" letterSpacing="0.2">Έτος {hp.year}</text>
            <text x="10" y="28" fontSize="12" fontWeight="600" fill="var(--text-primary)" fontFamily="Inter, sans-serif" style={{ fontVariantNumeric: 'tabular-nums' }}>{feC(hp.value)}</text>
          </g>
        </g>
      )}
    </svg>
  );
}

// Γράφημα πολλαπλών γραμμών (forward προβολή) — premium, ομαλό, με διαδραστικό tooltip.
function LineChart({ series }: { series: { label: string; color: string; points: { year: number; value: number }[] }[] }) {
  const W = 640, H = 200, padX = 18, padTop = 16, padBottom = 26;
  const [hover, setHover] = useState<number | null>(null);
  const all = series.flatMap(s => s.points.map(p => p.value));
  if (!all.length) return null;
  const max = Math.max(...all) || 1;
  const years = Math.max(1, series[0].points.length - 1);
  const baseY = H - padBottom;
  const X = (t: number) => padX + (t / years) * (W - 2 * padX);
  const Y = (v: number) => padTop + (1 - v / max) * (baseY - padTop);
  const smooth = (P: [number, number][]) => {
    let d = `M${P[0][0].toFixed(1)},${P[0][1].toFixed(1)}`;
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2, t = 0.16;
      d += ` C${(p1[0] + (p2[0] - p0[0]) * t).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) * t).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) * t).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) * t).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d;
  };
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(years, Math.round(((vx - padX) / (W - 2 * padX)) * years))));
  };
  const th = hover != null ? hover : null;
  // Πλαίσιο διαστασιολογημένο στο περιεχόμενο: πλήρεις ονομασίες (χωρίς συντομογραφίες),
  // η τιμή δεξιά, με σταθερό κενό ώστε να μην ακουμπούν ποτέ ετικέτα και ποσό.
  const rows = th != null ? series.map(s => ({ label: s.label, color: s.color, value: feC(s.points[th].value) })) : [];
  const rowW = (r: { label: string; value: string }) => 11 + 8 + 7 + r.label.length * 5.7 + 14 + r.value.length * 6.2 + 11;
  const TW = rows.length ? Math.min(200, Math.max(120, Math.ceil(Math.max(...rows.map(rowW))))) : 148;
  const TH = 16 + rows.length * 16 + 8;
  const tx = th != null ? (X(th) + 12 + TW > W - 2 ? Math.max(2, X(th) - TW - 12) : X(th) + 12) : 0;
  const ty = th != null ? padTop : 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', touchAction: 'none' }} role="img" aria-label="Προβολή απόδοσης"
      onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
      {[0, 0.25, 0.5, 0.75, 1].map(f => { const gy = padTop + f * (baseY - padTop); return <line key={f} x1={padX} y1={gy.toFixed(1)} x2={W - padX} y2={gy.toFixed(1)} stroke="var(--border-subtle)" strokeWidth="1" opacity="0.45" />; })}
      {series.map(s => (
        <path key={s.label} d={smooth(s.points.map(p => [X(p.year), Y(p.value)] as [number, number]))} fill="none" stroke={s.color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {series.map(s => { const last = s.points[s.points.length - 1]; return (<circle key={s.label + 'c'} cx={X(last.year)} cy={Y(last.value)} r="4" fill={s.color} stroke="var(--bg-surface)" strokeWidth="1.6" />); })}
      {[0, Math.round(years / 2), years].map(t => <text key={t} x={X(t)} y={H - 6} textAnchor={t === 0 ? 'start' : t === years ? 'end' : 'middle'} fontSize="10" fill="var(--text-tertiary)" fontFamily="Inter, sans-serif">{`Έτος ${t}`}</text>)}
      {th != null && (
        <g pointerEvents="none">
          <line x1={X(th)} y1={padTop - 4} x2={X(th)} y2={baseY} stroke="var(--border-default)" strokeWidth="1" strokeDasharray="3 3" />
          {series.map(s => <circle key={s.label + 'h'} cx={X(th)} cy={Y(s.points[th].value)} r="4" fill={s.color} stroke="var(--bg-surface)" strokeWidth="2" />)}
          <g transform={`translate(${tx.toFixed(1)},${ty.toFixed(1)})`}>
            <rect width={TW} height={TH} rx="8" fill="var(--bg-elevated)" stroke="var(--border-subtle)" strokeWidth="1" style={{ filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.28))' }} />
            <text x="11" y="13" fontSize="9.5" fill="var(--text-tertiary)" fontFamily="Inter, sans-serif" letterSpacing="0.2">Έτος {th}</text>
            {rows.map((r, i) => (
              <g key={r.label + 'r'} transform={`translate(11,${27 + i * 16})`}>
                <rect x="0" y="-6.5" width="8" height="3" rx="1.5" fill={r.color} />
                <text x="15" y="0" fontSize="10.5" fill="var(--text-secondary)" fontFamily="Inter, sans-serif">{r.label}</text>
                <text x={TW - 22} y="0" textAnchor="end" fontSize="11" fontWeight="600" fill="var(--text-primary)" fontFamily="Inter, sans-serif" style={{ fontVariantNumeric: 'tabular-nums' }}>{r.value}</text>
              </g>
            ))}
          </g>
        </g>
      )}
    </svg>
  );
}

// Segmented control (ομοιόμορφο)
function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div style={{ display: 'flex', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: 2, gap: 2 }}>
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)} style={{ height: 32, padding: '0 12px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontFamily: SANS, fontWeight: value === v ? 600 : 500, background: value === v ? 'var(--accent)' : 'transparent', color: value === v ? 'var(--accent-text)' : 'var(--text-secondary)', transition: 'all 0.15s' }}>{label}</button>
      ))}
    </div>
  );
}

// Κάρτα μοχλού — στο hover γίνεται accent ΜΟΝΟ ο τίτλος (καθαρή, διακριτική ένδειξη).
function LeverCard({ lever }: { lever: YieldLever }) {
  const [hot, setHot] = useState(false);
  return (
    <div onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
      style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: hot ? 'var(--accent)' : 'var(--text-primary)', margin: 0, fontFamily: SANS, transition: 'color 0.15s' }}>{lever.title}</p>
        {lever.href && <a href={lever.href} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', color: 'var(--text-tertiary)', display: 'inline-flex' }}><ArrowUpRight size={14} /></a>}
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-primary)', margin: 0, fontFamily: SANS, fontWeight: 600 }}>{lever.impact}</p>
      <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', margin: '5px 0 0', fontFamily: SANS, lineHeight: 1.55 }}>{lever.detail}</p>
      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '5px 0 0', fontFamily: SANS, lineHeight: 1.5 }}><strong style={{ color: 'var(--text-secondary)' }}>Προσοχή:</strong> {lever.risk}</p>
    </div>
  );
}

// Πλακίδιο μετρικής (IRR/NPV/DSCR) — μονόχρωμο· κόκκινο μόνο σε προβληματική τιμή,
// και αυτό διακριτικά μόνο όταν ο δείκτης/δάχτυλο ακουμπά το πλακίδιο.
function MetricTile({ label, value, info, tone }: { label: string; value: string; info?: string; tone?: 'neg' }) {
  return (
    <div className="po-fig-card" tabIndex={0} style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
      <p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.4px', fontFamily: SANS, display: 'flex', alignItems: 'center' }}>{label}{info && <TermInfo text={info} />}</p>
      <p className="po-fig" data-tone={tone === 'neg' ? 'negative' : undefined} style={{ fontSize: 20, fontWeight: 700, margin: '4px 0 0', fontFamily: SANS, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value}</p>
    </div>
  );
}

const g2: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 };
const g4: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 165px), 1fr))', gap: 12 };

export default function TabRentROI({ propertyId, userId, propertyValue, profileType = 'individual' }: Props) {
  const supabase = createClient();
  const branding = useReportBranding(userId);
  const [loading, setLoading] = useState(true);
  const [genOfficial, setGenOfficial] = useState(false);
  const pro = profileType === 'professional';

  // Καθεστώς: επαγγελματίας → φυσικό/νομικό· μίσθωση → μακροχρόνια/βραχυχρόνια.
  const [entity, setEntity] = useState<'sole' | 'company'>('sole');
  const [term, setTerm] = useState<'long' | 'short'>('long');

  // Στοιχεία (prefill από τα δεδομένα του ακινήτου, με δυνατότητα διόρθωσης).
  const [value, setValue] = useState('');
  const [rent, setRent] = useState('');
  const [opex, setOpex] = useState('');
  const [region, setRegion] = useState('ath_center');
  const [appreciation, setAppreciation] = useState('3');
  // Ξεχωριστός ορίζοντας ανά ενότητα (η αλλαγή στη μία ΔΕΝ επηρεάζει τις άλλες).
  const [histYears, setHistYears] = useState<'10' | '20'>('10');
  const [cmpYears, setCmpYears] = useState<'10' | '20'>('10');
  const [compYears, setCompYears] = useState<'10' | '20'>('10');

  // Βραχυχρόνια (ενεργά όταν term==='short'· prefill από την αναφορά της περιοχής)
  const [stOcc, setStOcc] = useState('');
  const [stAdr, setStAdr] = useState('');
  const [stClean, setStClean] = useState('45');
  const [stFee, setStFee] = useState('15');
  // Χαρακτηριστικά ακινήτου (για ρεαλιστική τιμή/νύχτα ανά μέγεθος & τύπο).
  const [pSqm, setPSqm] = useState<number | null>(null);
  const [pType, setPType] = useState<string | null>(null);
  const [pName, setPName] = useState('');
  // Δεδομένα κοινότητας (ανώνυμα aggregates ανά ΤΚ· εμφανίζονται μόνο με ≥5 ακίνητα).
  const [commStat, setCommStat] = useState<{ postal: string; count: number; median: number; p25: number; p75: number } | null>(null);

  // Εργαλεία (pro)
  const [compRate, setCompRate] = useState('5');
  const [ltv, setLtv] = useState('70');
  const [loanRate, setLoanRate] = useState('3.5');
  const [ifree, setIfree] = useState('0');
  const [savedLoan, setSavedLoan] = useState<{ amount:number; rate:number; property_value:number; loan_type:string } | null>(null);
  // Επενδυτική ανάλυση (IRR/NPV/DSCR)
  const [holdYears, setHoldYears] = useState<'5' | '10' | '20'>('10');
  const [rentGrowth, setRentGrowth] = useState('2');
  const [discountRate, setDiscountRate] = useState('8');

  const K = (s: string) => `roi_${propertyId}_${s}`;
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [pr, rc, exp, ln] = await Promise.all([
          supabase.from('user_properties').select('value,target_rent,rental_mode,sqm,prop_type,name,postal_code').eq('id', propertyId).maybeSingle(),
          supabase.from('rent_config').select('actual_rent,target_rent').eq('property_id', propertyId).maybeSingle(),
          supabase.from('expenses').select('amount').eq('property_id', propertyId),
          supabase.from('loans').select('amount,rate,property_value,loan_type,status').eq('property_id', propertyId).eq('user_id', userId).order('created_at', { ascending: false }),
        ]);
        const p: any = pr.data || {}; const c: any = rc.data || {};
        const activeLoan = (ln.data || []).find((l: any) => l.status !== 'inactive' && l.status !== 'closed');
        if (activeLoan) setSavedLoan({ amount: Number(activeLoan.amount) || 0, rate: Number(activeLoan.rate) || 0, property_value: Number(activeLoan.property_value) || 0, loan_type: activeLoan.loan_type });
        setValue(String(propertyValue || p.value || localStorage.getItem(K('value')) || ''));
        setRent(String(c.actual_rent || c.target_rent || p.target_rent || localStorage.getItem(K('rent')) || ''));
        const expSum = (exp.data || []).reduce((s: number, e: any) => s + (e.amount || 0), 0);
        setOpex(String(Math.round(expSum) || localStorage.getItem(K('opex')) || ''));
        setPSqm(p.sqm && p.sqm > 0 ? p.sqm : null);
        setPType(p.prop_type || null);
        setPName(p.name || '');
        if (p.rental_mode === 'short_term') setTerm('short');
        const savedR = localStorage.getItem(K('region'));
        if (savedR) setRegion(savedR === 'mykonos_santorini' ? 'mykonos' : savedR); // συμβατότητα με παλαιό κλειδί
        // Δεδομένα κοινότητας για τον ΤΚ του ακινήτου (ανώνυμα· μόνο με ≥5 ακίνητα).
        const postal = String(p.postal_code || '').trim();
        if (postal) {
          try {
            const { data: cs } = await supabase.rpc('community_market_stats');
            const row = (cs || []).find((r: any) => String(r.postal_code || '').trim() === postal);
            if (row && Number(row.sample_count) >= 5) {
              setCommStat({ postal, count: Number(row.sample_count), median: Number(row.median_gross_yield), p25: Number(row.p25_yield), p75: Number(row.p75_yield) });
            }
          } catch { /* λειτουργεί όταν υπάρχει αρκετό δείγμα */ }
        }
      } catch { /* keep defaults */ }
      finally { setLoading(false); }
    })();
  }, [propertyId, propertyValue]);

  // Persist ελαφριά (τοπικά) — δεν χρειάζεται νέος πίνακας.
  useEffect(() => { try { localStorage.setItem(K('value'), value); localStorage.setItem(K('rent'), rent); localStorage.setItem(K('opex'), opex); localStorage.setItem(K('region'), region); } catch { } }, [value, rent, opex, region]);

  // Prefill πληρότητας/τιμής βραχυχρόνιας από την αναφορά της περιοχής (επαναφορά όταν
  // αλλάζει η περιοχή· ο χρήστης μπορεί πάντα να διορθώσει).
  const stRef = stRefFor(region);
  // Prefill ADR κουμπωμένο στο μέγεθος & τύπο του ακινήτου (ρεαλιστικό ανά κατηγορία).
  useEffect(() => { if (loading) return; setStOcc(String(stRef.occupancy)); setStAdr(String(adrReference(stRef.adr, pSqm, pType))); }, [region, loading, pSqm, pType]); // eslint-disable-line react-hooks/exhaustive-deps

  const nVal = parseFloat(value) || 0;
  const nRent = parseFloat(rent) || 0;
  const nOpex = parseFloat(opex) || 0;
  const nAppr = parseFloat(appreciation) || 0;
  const reg = regionByKey(region);
  // Ενδεικτική αυτόματη εκτίμηση αξίας (AVM) από τη ζώνη × τετραγωνικά × τύπο.
  const estValue = useMemo(() => estimatePropertyValue(region, pSqm, pType), [region, pSqm, pType]);
  // Πρότεινε μόνο όταν υπάρχει εκτίμηση και είτε λείπει αξία είτε αποκλίνει >7% από την τρέχουσα.
  const showEstValue = estValue > 0 && (nVal <= 0 || Math.abs(nVal - estValue) / estValue > 0.07);

  // Το τέλος παρεπιδημούντων επιβαρύνει το νομικό πρόσωπο· ο ιδιώτης (≤2 ακίνητα) εξαιρείται.
  const individualPerson = !(pro && entity === 'company');
  // Κενό πεδίο → προεπιλογή περιοχής· το 0 (π.χ. μοντελοποίηση σχεδόν κενού ακινήτου) γίνεται σεβαστό.
  const occEff = Number.isFinite(parseFloat(stOcc)) ? parseFloat(stOcc) : stRef.occupancy;
  const adrEff = Number.isFinite(parseFloat(stAdr)) ? parseFloat(stAdr) : adrReference(stRef.adr, pSqm, pType);

  // Εκτίμηση βραχυχρόνιας (πληρότητα × τιμή/νύχτα − κόστη − ΤΑΚΚ − παρεπιδημούντων).
  // Το μεγάλο κλιμάκιο ΤΑΚΚ (μονοκατοικίες >80 τ.μ.) αφορά ΜΟΝΟ μονοκατοικίες/βίλες — όχι μεζονέτες.
  const isHouseType = ['house', 'villa'].includes((pType || '').toLowerCase());
  // Μερίδιο νυχτών σε υψηλή περίοδο: νησιά/τουριστικά συγκεντρώνουν τη ζήτηση στο καλοκαίρι.
  const highSeasonShare = (reg?.tags || []).some(t => t === 'island' || t === 'tourist') ? 0.85 : 0.6;
  const st = useMemo(() => shortTermEstimate({
    occupancyPct: occEff, adr: adrEff, cleaningPerStay: parseFloat(stClean) || 0,
    platformFeePct: parseFloat(stFee) || 0, sqm: pSqm, isHouse: isHouseType, highSeasonShare, propertyCount: 1, individual: individualPerson,
  }), [occEff, adrEff, stClean, stFee, pSqm, isHouseType, highSeasonShare, individualPerson]);

  // Ενοποιημένα μεγέθη: το toggle μακροχρόνια/βραχυχρόνια αλλάζει πραγματικά τα έσοδα & κόστη.
  const grossAnnual = term === 'short' ? st.grossRevenue : nRent * 12;
  const stCosts = term === 'short' ? (st.platformFees + st.cleaning + st.climateLevy + st.municipalTax) : 0;
  const effOpex = nOpex + stCosts;                 // λειτουργικά έξοδα ακινήτου + κόστη βραχυχρόνιας
  const monthlyEquiv = grossAnnual / 12;           // ισοδύναμο «μηνιαίο ενοίκιο» για τη μηχανή

  // Φόρος εισοδήματος (ίδια μηχανή με τη Λογιστική).
  const annualTax = useMemo(() => {
    if (grossAnnual <= 0) return 0;
    if (pro) {
      // Νομικό πρόσωπο: 22% + φόρος μερίσματος 5% στη διανομή (προεπιλογή: πλήρης διανομή,
      // ώστε ο φόρος να δείχνει τι φτάνει πραγματικά στον ιδιοκτήτη). Τα κόστη βραχυχρόνιας
      // εκπίπτουν ως δαπάνες της επιχείρησης.
      const stB = incomeStatement({ regime: 'business', businessForm: entity, grossIncome: grossAnnual, itemizedExpenses: effOpex, companyDistribution: entity === 'company' ? 1 : 0 });
      return stB.incomeTax + (stB.dividendTax || 0);
    }
    // Φυσικό πρόσωπο: κλίμακα ενοικίων στα μεικτά (βραχυχρόνια χωρίς υπηρεσίες = εισόδημα ακινήτου).
    const regime: TaxRegime = term === 'short' ? 'individual_shortterm' : 'individual_longterm';
    return incomeStatement({ regime, grossIncome: grossAnnual, rentsPaidViaBank: true }).incomeTax;
  }, [grossAnnual, effOpex, pro, entity, term]);

  const y = useMemo(() => yields(monthlyEquiv, nVal, effOpex, annualTax), [monthlyEquiv, nVal, effOpex, annualTax]);
  // Μη στρογγυλοποιημένη μεικτή απόδοση για τα εργαλεία μόχλευσης/IRR (ώστε NOI/DSCR/IRR να
  // συμφωνούν ακριβώς με το ενοίκιο που έδωσε ο χρήστης, χωρίς σφάλμα στρογγυλοποίησης).
  const grossYieldExact = nVal > 0 ? (grossAnnual / nVal) * 100 : 0;
  // Κρίση αγοράς: μακροχρόνια → μεικτή του ακινήτου vs μέσος αγοράς· βραχυχρόνια → μεικτή
  // βραχυχρόνιας vs τυπική βραχυχρόνια της περιοχής.
  const verdictLabel = term === 'short'
    ? (y.grossYield >= stRef.grossYield ? 'Πάνω από την τυπική βραχυχρόνια της περιοχής' : 'Κοντά στην τυπική βραχυχρόνια της περιοχής')
    : yieldVerdict(y.grossYield).label;
  // Ακριβής αντιστοίχιση προφίλ βραχυχρόνιας· τα σπασμένα νησιά (Μύκονος/Σαντορίνη) δείχνουν
  // τα κοινά τους δεδομένα αναφοράς (mykonos_santorini) αντί για γενική διατύπωση.
  const stExact = SHORT_TERM.find(s => s.key === region)
    || ((region === 'mykonos' || region === 'santorini') ? SHORT_TERM.find(s => s.key === 'mykonos_santorini') : undefined);

  // Βαθμός απόδοσης A–F. Σε μακροχρόνια η αναφορά είναι ο μέσος της περιοχής (μεικτός → −1,5
  // για καθαρό). Σε βραχυχρόνια, η αναφορά είναι καθαρή απόδοση ST στην ίδια αναλογία κόστους
  // (μεικτή ST × καθαρή/μεικτή), προσαρμοσμένη ώστε η μηχανή να τη διαβάσει σωστά.
  const grade = useMemo<YieldGrade>(() => {
    const cashPositive = (grossAnnual - effOpex - annualTax) > 0;
    if (term === 'short') {
      const ratio = st.grossRevenue > 0 ? st.netRevenue / st.grossRevenue : 0.5;
      const benchNet = stRef.grossYield * ratio;      // αναφορά καθαρής απόδοσης βραχυχρόνιας
      return yieldGrade(y.netYield, benchNet + 1.5, cashPositive);
    }
    return yieldGrade(y.netYield, reg?.grossYield ?? GREECE_AVG_GROSS_YIELD, cashPositive);
  }, [term, y.netYield, grossAnnual, effOpex, annualTax, st.grossRevenue, st.netRevenue, stRef.grossYield, reg]);

  // Ιστορική διαδρομή: πώς θα κινούνταν η αξία σου τα τελευταία 10/20 έτη.
  const hist = useMemo(() => {
    const base = HISTORY_INDEX.filter(p => p.year >= (histYears === '20' ? 2007 : 2016));
    const latest = HISTORY_INDEX[HISTORY_INDEX.length - 1].price;
    return base.map(p => ({ year: p.year, value: nVal > 0 ? Math.round(nVal * p.price / latest) : Math.round(p.price) }));
  }, [nVal, histYears]);
  const histStart = hist[0]?.value || 0;
  const histEnd = hist[hist.length - 1]?.value || 0;

  // Σύγκριση με εναλλακτικές — οι εναλλακτικές με τις ΠΡΑΓΜΑΤΙΚΕΣ ιστορικές τους αποδόσεις
  // (μέση ετήσια 10ετίας ή 20ετίας, ανάλογα με τον ορίζοντα)· το ακίνητο με τη δική σου
  // εκτίμηση (καθαρή απόδοση + ανατίμηση). Ειλικρινή δεδομένα, όχι εξομαλυμένες υποθέσεις.
  const compare = useMemo(() => {
    const totalReturn = clampReturn(propertyTotalReturn(y.netYield, nAppr));
    const retFor = (b: typeof BENCHMARKS[number]) => cmpYears === '20' ? b.ret20 : b.ret10;
    const opts = [
      { key: 'property', label: 'Το ακίνητό σου (εκτίμηση)', annualReturnPct: totalReturn },
      ...BENCHMARKS.filter(b => b.key !== 'inflation').map(b => ({ key: b.key, label: b.label, annualReturnPct: retFor(b) })),
    ];
    return compareInvestments(nVal || 100000, parseInt(cmpYears), opts);
  }, [y.netYield, nAppr, nVal, cmpYears]);
  const compMax = Math.max(...compare.map(c => c.futureValue), 1);

  // Προβολή-γραμμή (forward): πώς μεγαλώνει το ίδιο ποσό στο ακίνητο vs στην κορυφαία
  // εναλλακτική, στον επιλεγμένο ορίζοντα — για το «έξυπνο» γράφημα σύγκρισης.
  const projSeries = useMemo(() => {
    const yearsN = parseInt(cmpYears);
    const base = nVal || 100000;
    const propRate = clampReturn(propertyTotalReturn(y.netYield, nAppr));
    const topAlt = compare.find(c => c.key !== 'property');
    const series = [{ label: 'Ακίνητο', color: 'var(--accent)', points: projectLine(base, propRate, yearsN) }];
    if (topAlt) series.push({ label: benchShort(topAlt.key, topAlt.label), color: 'var(--text-tertiary)', points: projectLine(base, topAlt.annualReturnPct, yearsN) });
    return series;
  }, [cmpYears, nVal, y.netYield, nAppr, compare]);

  // Εργαλεία (pro)
  const comp = useMemo(() => compound(nVal, parseFloat(compRate) || 0, parseInt(compYears), Math.max(0, Math.round(grossAnnual - effOpex - annualTax))), [nVal, compRate, compYears, grossAnnual, effOpex, annualTax]);
  const lev: LeverageResult = useMemo(() => leverage({ price: nVal, ltvPct: parseFloat(ltv) || 0, loanRatePct: parseFloat(loanRate) || 0, loanYears: 25, grossYieldPct: grossYieldExact, opexPctOfRent: grossAnnual > 0 ? (effOpex / grossAnnual) * 100 : 20, interestFreePct: parseFloat(ifree) || 0 }), [nVal, ltv, loanRate, y.grossYield, effOpex, grossAnnual, ifree]);

  // Χρηματοοικονομική ανάλυση αγοράς-κατοχής-πώλησης (IRR/NPV/DSCR), με τα ίδια στοιχεία.
  const deal = useMemo(() => dealAnalysis({
    price: nVal, ltvPct: parseFloat(ltv) || 0, loanRatePct: parseFloat(loanRate) || 0, loanYears: 25,
    grossYieldPct: grossYieldExact, opexPctOfRent: grossAnnual > 0 ? (effOpex / grossAnnual) * 100 : 20,
    interestFreePct: parseFloat(ifree) || 0, holdYears: parseInt(holdYears), rentGrowthPct: parseFloat(rentGrowth) || 0,
    appreciationPct: nAppr, sellCostsPct: 3, discountRatePct: parseFloat(discountRate) || 0,
  }), [nVal, ltv, loanRate, y.grossYield, effOpex, grossAnnual, ifree, holdYears, rentGrowth, nAppr, discountRate]);

  // Ανάλυση ευαισθησίας (pro): απόδοση ιδίων & συνολική απόδοση σε δυσμενές/βασικό/ευνοϊκό
  // σενάριο (μεταβολή επιτοκίου & ετήσιας ανατίμησης). Δείχνει την αντοχή της επένδυσης.
  const scenarios = useMemo(() => {
    const rows: { key: string; label: string; note: string; totalReturn: number; roe: number; cashFlow: number }[] = [];
    const defs = [
      { key: 'bad', label: 'Δυσμενές', note: 'επιτόκιο +1,5% · ανατίμηση −2%', appr: -2, rate: +1.5 },
      { key: 'base', label: 'Βασικό', note: 'τρέχουσες παραδοχές', appr: 0, rate: 0 },
      { key: 'good', label: 'Ευνοϊκό', note: 'επιτόκιο −1% · ανατίμηση +2%', appr: +2, rate: -1 },
    ];
    for (const d of defs) {
      const l = leverage({ price: nVal, ltvPct: parseFloat(ltv) || 0, loanRatePct: Math.max(0, (parseFloat(loanRate) || 0) + d.rate), loanYears: 25, grossYieldPct: grossYieldExact, opexPctOfRent: grossAnnual > 0 ? (effOpex / grossAnnual) * 100 : 20, interestFreePct: parseFloat(ifree) || 0 });
      rows.push({ key: d.key, label: d.label, note: d.note, totalReturn: clampReturn(propertyTotalReturn(y.netYield, nAppr + d.appr)), roe: l.cashOnCash, cashFlow: l.cashFlow });
    }
    return rows;
  }, [nVal, ltv, loanRate, y.grossYield, y.netYield, nAppr, effOpex, grossAnnual, ifree]);

  // Πληρότητα ισοσκελισμού: το ελάχιστο ποσοστό πληρότητας ώστε η ΒΡΑΧΥΧΡΟΝΙΑ να αποδώσει
  // ό,τι και η μακροχρόνια. Το σταθερό opex (ΕΝΦΙΑ, συντήρηση) βαρύνει ΚΑΙ τους δύο τρόπους
  // εξίσου, οπότε απαλείφεται στη σύγκριση: στόχος = μεικτό ετήσιο ενοίκιο μακροχρόνιας.
  const breakEvenOcc = useMemo(() => {
    const ltGross = nRent * 12;
    if (ltGross <= 0) return null;
    return breakEvenOccupancy(ltGross, { adr: adrEff, cleaningPerStay: parseFloat(stClean) || 0, platformFeePct: parseFloat(stFee) || 0, propertyCount: 1, individual: individualPerson });
  }, [nRent, adrEff, stClean, stFee, individualPerson]);

  // Εξαγωγή επαγγελματικής αναφοράς PDF (μέσω παραθύρου εκτύπωσης· escape όλων των τιμών).
  const printReport = () => {
    const name = pName.trim() || 'Ακίνητο';
    const num2 = (n: number) => (Number.isFinite(n) ? n : 0).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    // Παράγωγα μεγέθη κατάστασης αποτελεσμάτων.
    const noi = grossAnnual - effOpex;            // καθαρά λειτουργικά έσοδα
    const afterTax = noi - annualTax;             // καθαρό αποτέλεσμα μετά τον φόρο
    const totalReturn = y.netYield + nAppr;       // ενδεικτική συνολική απόδοση

    const R = reportRow;

    const identity = [name, regimeLabel, term === 'short' ? 'Βραχυχρόνια μίσθωση' : 'Μακροχρόνια μίσθωση', reg?.label || '', pSqm ? `${pSqm} τ.μ.` : '']
      .filter(Boolean).map(x => rEsc(String(x))).join(' · ');

    // Ανάλυση εσόδων–εξόδων (ετήσια).
    const incRows = [
      R('Ακαθάριστα έσοδα (ετήσια)', rEur(grossAnnual)),
      R('Λειτουργικά έξοδα ακινήτου', rSigned(-nOpex)),
      ...(term === 'short' && stCosts > 0 ? [R('Κόστη βραχυχρόνιας (πλατφόρμα, καθαρισμός, ΤΑΚΚ, τέλος παρεπιδημούντων)', rSigned(-stCosts))] : []),
      R('Καθαρά λειτουργικά έσοδα (NOI)', rEur(noi), 'sub'),
      R('Φόρος εισοδήματος', rSigned(-annualTax)),
      R('Καθαρό αποτέλεσμα μετά τον φόρο', rEur(afterTax), 'result'),
    ].join('');

    // Δείκτες απόδοσης.
    const yieldRows = [
      R('Μεικτή απόδοση', rPct(y.grossYield)),
      R('Καθαρή απόδοση', rPct(y.netYield)),
      R('Απόδοση μετά τον φόρο', rPct(y.netYieldAfterTax)),
      R('Εκτιμώμενη ετήσια ανατίμηση', rPct(nAppr)),
      R('Ενδεικτική συνολική απόδοση (καθαρή + ανατίμηση)', rPct(totalReturn), 'sub'),
      R('Βαθμός απόδοσης', `${grade.grade} · ${grade.score}/100`, 'sub'),
    ].join('');

    const regionRows = term === 'short'
      ? [['Το ακίνητό σου', rPct(y.grossYield)], ['Τυπική βραχυχρόνια περιοχής', rPct(stRef.grossYield)], ['Μακροχρόνια στην ίδια περιοχή', rPct(reg?.grossYield || 0)]]
      : [['Το ακίνητό σου', rPct(y.grossYield)], [reg?.label || 'Περιοχή', rPct(reg?.grossYield || 0)], ['Μέσος όρος Αθήνας', rPct(ATHENS_AVG_GROSS_YIELD)], ['Εθνικός μέσος όρος', rPct(GREECE_AVG_GROSS_YIELD)]];

    // Χρηματοδότηση & μόχλευση (μόνο επαγγελματικό προφίλ).
    const finBlock = pro ? reportSection('Χρηματοδότηση & μόχλευση') + `<table><tbody>
        ${R('Ίδια κεφάλαια', rEur(deal.equity))}
        ${R('Δάνειο', rEur(deal.loan))}
        ${R('Ετήσια δόση δανείου', rEur(deal.annualDebtService))}
        ${R('Δείκτης κάλυψης χρέους (DSCR)', Number.isFinite(deal.dscr) ? num2(deal.dscr) : '∞')}
        ${R('Απόδοση ιδίων κεφαλαίων (cash-on-cash)', rPct(lev.cashOnCash))}
        ${R('Ετήσια ταμειακή ροή', rEur(lev.cashFlow))}
        ${R('Εσωτερικός βαθμός απόδοσης (IRR)', Number.isFinite(deal.irrPct) ? rPct(deal.irrPct) : '—')}
        ${R('Καθαρή παρούσα αξία (NPV)', rEur(deal.npv))}
        ${R('Πολλαπλασιαστής ιδίων κεφαλαίων', `${num2(deal.equityMultiple)}×`)}
        ${R('Ορίζοντας κατοχής', `${parseInt(holdYears)} έτη`, 'sub')}
      </tbody></table>` : '';

    // Ανάλυση ευαισθησίας (επαγγελματικό προφίλ).
    const sensBlock = pro ? reportSection('Ανάλυση ευαισθησίας') + `<table>
        <thead><tr><th>Σενάριο</th><th class="n">Συνολική απόδοση</th><th class="n">Απόδοση ιδίων</th><th class="n">Ταμειακή ροή</th></tr></thead>
        <tbody>${scenarios.map(sc => `<tr><td>${rEsc(sc.label)} <span class="muted" style="font-size:10px">${rEsc(sc.note)}</span></td><td class="n">${rEsc(rPct(sc.totalReturn))}</td><td class="n">${rEsc(rPct(sc.roe))}</td><td class="n">${rEsc(rEur(sc.cashFlow))}</td></tr>`).join('')}</tbody>
      </table>` : '';

    // Νεκρό σημείο πληρότητας (βραχυχρόνια).
    const beBlock = (term === 'short' && breakEvenOcc !== null) ? reportSection('Νεκρό σημείο πληρότητας')
        + `<div class="note">Ελάχιστη πληρότητα ώστε η βραχυχρόνια να αποδώσει όσο η μακροχρόνια στην ίδια περιοχή: <strong>${isFinite(breakEvenOcc) ? rPct(Math.min(100, breakEvenOcc)) : 'μη εφικτή'}</strong>. Εκτιμώμενη πληρότητα εργαλείου: ${rPct(occEff)} · τιμή/νύχτα ${rEsc(rEur(adrEff))}.</div>` : '';

    // Παραδοχές & μεθοδολογία.
    const asmpItems = [
      `Αξία ακινήτου: ${rEur(nVal)} (καταχώρηση ή εκτίμηση χρήστη)`,
      term === 'short' ? `Έσοδα: εκτιμώμενη πληρότητα ${rPct(occEff)} × τιμή/νύχτα ${rEur(adrEff)}` : `Έσοδα: μηνιαίο ενοίκιο ${rEur(nRent)}`,
      `Εκτιμώμενη ετήσια ανατίμηση: ${rPct(nAppr)}`,
      `Φορολογικό καθεστώς: ${regimeLabel}`,
      ...(pro ? [`Χρηματοδότηση: LTV ${rPct(parseFloat(ltv) || 0)}, επιτόκιο ${rPct(parseFloat(loanRate) || 0)}, ορίζοντας ${parseInt(holdYears)} έτη`] : []),
      `Δεδομένα αναφοράς αγοράς: ${MARKET_DATA_ASOF}`,
    ].map(t => `<li>${rEsc(t)}</li>`).join('');

    const disclaimer = `Η παρούσα αναφορά αποτελεί ενημερωτικό εργαλείο εκτίμησης. Οι υπολογισμοί βασίζονται στα στοιχεία που καταχώρησες και σε ενδεικτικά δημόσια δεδομένα αγοράς, και δεν συνιστούν επενδυτική, φορολογική ή νομική συμβουλή. Τα πραγματικά μεγέθη διαφέρουν ανά ακίνητο, όροφο, κατάσταση, θέση και συνθήκες αγοράς. Οι αποδόσεις των εναλλακτικών επενδύσεων είναι ιστορικές και δεν εγγυώνται μελλοντικά αποτελέσματα. Πριν από κάθε απόφαση, επιβεβαίωσε τα στοιχεία και συμβουλέψου εξειδικευμένο λογιστή ή σύμβουλο ακινήτων. Δεδομένα αγοράς: ${MARKET_DATA_ASOF}.`;

    const html = reportHead(`Αναφορά απόδοσης · ${name}`)
      + `<body><div class="page">`
      + reportHeader(branding, 'Αναφορά απόδοσης')
      + `<h1>Αναφορά απόδοσης ακινήτου</h1><div class="sub">${identity}</div>`
      + reportSection('Σύνοψη')
      + `<div class="kpis">`
        + reportKpi('Αξία ακινήτου', rEur(nVal))
        + reportKpi(term === 'short' ? 'Ετήσια έσοδα' : 'Μηνιαίο ενοίκιο', rEur(term === 'short' ? grossAnnual : nRent))
        + reportKpi('Καθαρή απόδοση', rPct(y.netYield))
        + reportKpi('Βαθμός απόδοσης', `${grade.grade} · ${grade.score}/100`)
      + `</div>`
      + reportSection('Ανάλυση εσόδων & εξόδων (ετήσια)') + `<table><tbody>${incRows}</tbody></table>`
      + reportSection('Δείκτες απόδοσης') + `<table><tbody>${yieldRows}</tbody></table>`
      + reportSection('Σύγκριση με την αγορά') + `<table><tbody>${regionRows.map(r => R(r[0], r[1])).join('')}</tbody></table>`
      + finBlock
      + sensBlock
      + beBlock
      + reportSection(`Σύγκριση με εναλλακτικές επενδύσεις (${cmpYears} έτη, πραγματικές αποδόσεις)`)
        + `<table><tbody>${compare.map(c => R(c.label, `${rEur(c.futureValue)} · ${rPct(c.annualReturnPct)} ετησίως`)).join('')}</tbody></table>`
      + reportSection('Παραδοχές & μεθοδολογία')
        + `<ul style="margin:4px 0 0;padding-left:18px;font-size:11.5px;color:#4b5563;line-height:1.7">${asmpItems}</ul>`
        + `<div class="note" style="font-size:10px;color:#8a8f98;margin-top:10px">Πηγές: ${MARKET_SOURCES.map(s => rEsc(s.label)).join(' · ')}</div>`
      + reportDisclaimer(disclaimer, branding)
      + `</div></body></html>`;
    openReport(html);
  };

  // Επίσημο, τραπεζικού επιπέδου true-PDF (pdfmake): αριθμός εγγράφου, QR επαλήθευσης,
  // per-page footer· καταχωρείται στο μητρώο εγγράφων ώστε να επαληθεύεται στο /verify/<id>.
  // Καθρεφτίζει το περιεχόμενο της printReport σε PdfSection[].
  const officialReport = async () => {
    if (genOfficial) return;
    setGenOfficial(true);
    try {
      const name = pName.trim() || 'Ακίνητο';
      const num2 = (n: number) => (Number.isFinite(n) ? n : 0).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const noi = grossAnnual - effOpex;            // καθαρά λειτουργικά έσοδα
      const afterTax = noi - annualTax;             // καθαρό αποτέλεσμα μετά τον φόρο
      const totalReturn = y.netYield + nAppr;       // ενδεικτική συνολική απόδοση

      const identity = [name, regimeLabel, term === 'short' ? 'Βραχυχρόνια μίσθωση' : 'Μακροχρόνια μίσθωση', reg?.label || '', pSqm ? `${pSqm} τ.μ.` : '']
        .filter(Boolean).join(' · ');

      // Σύγκριση με την αγορά (ίδιες γραμμές με την printReport).
      const regionRows: PdfRow[] = term === 'short'
        ? [
            { label: 'Το ακίνητό σου', value: pPct(y.grossYield) },
            { label: 'Τυπική βραχυχρόνια περιοχής', value: pPct(stRef.grossYield) },
            { label: 'Μακροχρόνια στην ίδια περιοχή', value: pPct(reg?.grossYield || 0) },
          ]
        : [
            { label: 'Το ακίνητό σου', value: pPct(y.grossYield) },
            { label: reg?.label || 'Περιοχή', value: pPct(reg?.grossYield || 0) },
            { label: 'Μέσος όρος Αθήνας', value: pPct(ATHENS_AVG_GROSS_YIELD) },
            { label: 'Εθνικός μέσος όρος', value: pPct(GREECE_AVG_GROSS_YIELD) },
          ];

      // Παραδοχές & μεθοδολογία.
      const asmpItems = [
        `Αξία ακινήτου: ${pEur(nVal)} (καταχώρηση ή εκτίμηση χρήστη)`,
        term === 'short' ? `Έσοδα: εκτιμώμενη πληρότητα ${pPct(occEff)} × τιμή/νύχτα ${pEur(adrEff)}` : `Έσοδα: μηνιαίο ενοίκιο ${pEur(nRent)}`,
        `Εκτιμώμενη ετήσια ανατίμηση: ${pPct(nAppr)}`,
        `Φορολογικό καθεστώς: ${regimeLabel}`,
        ...(pro ? [`Χρηματοδότηση: LTV ${pPct(parseFloat(ltv) || 0)}, επιτόκιο ${pPct(parseFloat(loanRate) || 0)}, ορίζοντας ${parseInt(holdYears)} έτη`] : []),
        `Δεδομένα αναφοράς αγοράς: ${MARKET_DATA_ASOF}`,
      ];

      const disclaimer = `Η παρούσα αναφορά αποτελεί ενημερωτικό εργαλείο εκτίμησης. Οι υπολογισμοί βασίζονται στα στοιχεία που καταχώρησες και σε ενδεικτικά δημόσια δεδομένα αγοράς, και δεν συνιστούν επενδυτική, φορολογική ή νομική συμβουλή. Τα πραγματικά μεγέθη διαφέρουν ανά ακίνητο, όροφο, κατάσταση, θέση και συνθήκες αγοράς. Οι αποδόσεις των εναλλακτικών επενδύσεων είναι ιστορικές και δεν εγγυώνται μελλοντικά αποτελέσματα. Πριν από κάθε απόφαση, επιβεβαίωσε τα στοιχεία και συμβουλέψου εξειδικευμένο λογιστή ή σύμβουλο ακινήτων. Δεδομένα αγοράς: ${MARKET_DATA_ASOF}.`;

      const sections: PdfSection[] = [
        { type: 'kpis', title: 'Σύνοψη', items: [
          { label: 'Αξία ακινήτου', value: pEur(nVal) },
          { label: term === 'short' ? 'Ετήσια έσοδα' : 'Μηνιαίο ενοίκιο', value: pEur(term === 'short' ? grossAnnual : nRent) },
          { label: 'Καθαρή απόδοση', value: pPct(y.netYield) },
          { label: 'Βαθμός απόδοσης', value: `${grade.grade} · ${grade.score}/100` },
        ] },
        { type: 'rows', title: 'Ανάλυση εσόδων & εξόδων (ετήσια)', rows: [
          { label: 'Ακαθάριστα έσοδα (ετήσια)', value: pEur(grossAnnual) },
          { label: 'Λειτουργικά έξοδα ακινήτου', value: pSigned(-nOpex) },
          ...(term === 'short' && stCosts > 0 ? [{ label: 'Κόστη βραχυχρόνιας (πλατφόρμα, καθαρισμός, ΤΑΚΚ, τέλος παρεπιδημούντων)', value: pSigned(-stCosts) }] : []),
          { label: 'Καθαρά λειτουργικά έσοδα (NOI)', value: pEur(noi), kind: 'sub' },
          { label: 'Φόρος εισοδήματος', value: pSigned(-annualTax) },
          { label: 'Καθαρό αποτέλεσμα μετά τον φόρο', value: pEur(afterTax), kind: 'result' },
        ] },
        { type: 'rows', title: 'Δείκτες απόδοσης', rows: [
          { label: 'Μεικτή απόδοση', value: pPct(y.grossYield) },
          { label: 'Καθαρή απόδοση', value: pPct(y.netYield) },
          { label: 'Απόδοση μετά τον φόρο', value: pPct(y.netYieldAfterTax) },
          { label: 'Εκτιμώμενη ετήσια ανατίμηση', value: pPct(nAppr) },
          { label: 'Ενδεικτική συνολική απόδοση (καθαρή + ανατίμηση)', value: pPct(totalReturn), kind: 'sub' },
          { label: 'Βαθμός απόδοσης', value: `${grade.grade} · ${grade.score}/100`, kind: 'sub' },
        ] },
        { type: 'rows', title: 'Σύγκριση με την αγορά', rows: regionRows },
      ];

      if (pro) {
        sections.push({ type: 'rows', title: 'Χρηματοδότηση & μόχλευση', rows: [
          { label: 'Ίδια κεφάλαια', value: pEur(deal.equity) },
          { label: 'Δάνειο', value: pEur(deal.loan) },
          { label: 'Ετήσια δόση δανείου', value: pEur(deal.annualDebtService) },
          { label: 'Δείκτης κάλυψης χρέους (DSCR)', value: Number.isFinite(deal.dscr) ? num2(deal.dscr) : '∞' },
          { label: 'Απόδοση ιδίων κεφαλαίων (cash-on-cash)', value: pPct(lev.cashOnCash) },
          { label: 'Ετήσια ταμειακή ροή', value: pEur(lev.cashFlow) },
          { label: 'Εσωτερικός βαθμός απόδοσης (IRR)', value: Number.isFinite(deal.irrPct) ? pPct(deal.irrPct) : '—' },
          { label: 'Καθαρή παρούσα αξία (NPV)', value: pEur(deal.npv) },
          { label: 'Πολλαπλασιαστής ιδίων κεφαλαίων', value: `${num2(deal.equityMultiple)}×` },
          { label: 'Ορίζοντας κατοχής', value: `${parseInt(holdYears)} έτη`, kind: 'sub' },
        ] });
        sections.push({ type: 'table', title: 'Ανάλυση ευαισθησίας',
          head: ['Σενάριο', 'Συνολική απόδοση', 'Απόδοση ιδίων', 'Ταμειακή ροή'], align: ['l', 'r', 'r', 'r'],
          rows: scenarios.map(sc => [`${sc.label} ${sc.note}`, pPct(sc.totalReturn), pPct(sc.roe), pEur(sc.cashFlow)]) });
      }

      if (term === 'short' && breakEvenOcc !== null) {
        sections.push({ type: 'note', title: 'Νεκρό σημείο πληρότητας',
          text: `Ελάχιστη πληρότητα ώστε η βραχυχρόνια να αποδώσει όσο η μακροχρόνια στην ίδια περιοχή: ${isFinite(breakEvenOcc) ? pPct(Math.min(100, breakEvenOcc)) : 'μη εφικτή'}. Εκτιμώμενη πληρότητα εργαλείου: ${pPct(occEff)} · τιμή/νύχτα ${pEur(adrEff)}.` });
      }

      sections.push({ type: 'rows', title: `Σύγκριση με εναλλακτικές επενδύσεις (${cmpYears} έτη, πραγματικές αποδόσεις)`,
        rows: compare.map(c => ({ label: c.label, value: `${pEur(c.futureValue)} · ${pPct(c.annualReturnPct)} ετησίως` })) });
      sections.push({ type: 'note', title: 'Παραδοχές & μεθοδολογία', text: asmpItems.map(t => `· ${t}`).join('\n') });
      sections.push({ type: 'note', text: `Πηγές: ${MARKET_SOURCES.map(s => s.label).join(' · ')}` });

      const issued = await issueDocument(supabase, {
        userId, docType: 'Αναφορά απόδοσης',
        subject: name,
        period: term === 'short' ? 'Βραχυχρόνια μίσθωση' : 'Μακροχρόνια μίσθωση',
        summary: { value: nVal, grossYield: y.grossYield, netYield: y.netYield, grade: grade.grade },
      });

      const model: PdfReportModel = {
        branding, docType: 'Αναφορά απόδοσης', title: 'Αναφορά απόδοσης ακινήτου',
        subtitle: identity,
        meta: { id: issued.id, issuedAt: issued.issuedAt, verifyUrl: issued.verifyUrl },
        sections, disclaimer,
      };
      await generateReportPdf(model, `Αναφορά_απόδοσης_${pName.trim() || 'ακίνητο'}`);
    } catch { alert('Η δημιουργία του επίσημου PDF απέτυχε. Δοκίμασε ξανά.'); }
    finally { setGenOfficial(false); }
  };

  if (loading) return <div style={{ padding: 40 }}><Spinner label="Φόρτωση αποδόσεων…" /></div>;

  const regimeLabel = pro ? (entity === 'company' ? 'Επιχείρηση · Νομικό πρόσωπο' : 'Επιχείρηση · Φυσικό πρόσωπο') : 'Ιδιώτης';
  const empty = term === 'short' ? (nVal <= 0 || grossAnnual <= 0) : (nVal <= 0 || nRent <= 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontFamily: SANS, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Αποδόσεις</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0', fontFamily: SANS }}>{regimeLabel} · πραγματική απόδοση του ακινήτου και σύγκριση με την αγορά.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {pro && <Seg value={entity} onChange={setEntity} options={[['sole', 'Φυσικό πρόσωπο'], ['company', 'Νομικό πρόσωπο']]} />}
          <Seg value={term} onChange={setTerm} options={[['long', 'Μακροχρόνια'], ['short', 'Βραχυχρόνια']]} />
          {!empty && (<>
            <button onClick={printReport} className="acc-toggle" style={{ height: 36, padding: '0 14px', borderRadius: 10, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 12.5, fontFamily: SANS, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <ArrowUpRight size={14} /> Αναφορά PDF
            </button>
            <button onClick={officialReport} disabled={genOfficial} className="acc-toggle" title="Επίσημο true-PDF με αριθμό εγγράφου και QR επαλήθευσης — κατάλληλο για τράπεζες, ΔΟΥ και φορείς" style={{ height: 36, padding: '0 14px', borderRadius: 10, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 12.5, fontFamily: SANS, fontWeight: 600, cursor: genOfficial ? 'wait' : 'pointer', opacity: genOfficial ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <ShieldCheck size={14} /> {genOfficial ? 'Δημιουργία…' : 'Επίσημο PDF'}
            </button>
          </>)}
        </div>
      </div>

      {/* Στοιχεία (πάντα προσβάσιμα) */}
      <div style={card}>
        <div style={g4}>
          <NumberInput label="Αξία ακινήτου" value={value} onChange={setValue} suffix="€" step={5000} />
          <NumberInput label={term === 'short' ? 'Ενοίκιο μακροχρόνιας' : 'Μηνιαίο ενοίκιο'} value={rent} onChange={setRent} suffix="€" step={50} />
          <NumberInput label="Ετήσια έξοδα" value={opex} onChange={setOpex} suffix="€" step={100} />
          <CustomSelect label="Περιοχή" value={region} onChange={setRegion} options={REGIONS.map((r, i) => ({ value: r.key, label: r.label, header: r.region !== REGIONS[i - 1]?.region ? r.region : undefined }))} />
        </div>
        {showEstValue && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12.5, fontFamily: SANS, color: 'var(--text-secondary)' }}>
            <span>Ενδεικτική εκτίμηση αξίας για την περιοχή{pSqm ? ` (${pSqm} τ.μ.)` : ''}: <strong style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fe(estValue, 0)}</strong></span>
            <TermInfo text={`Ενδεικτικός υπολογισμός: μέση τιμή ανά τετραγωνικό μέτρο στην περιοχή, επί τα τετραγωνικά και τον συντελεστή τύπου του ακινήτου. Δεν υποκαθιστά την αντικειμενική αξία ούτε την εκτίμηση πιστοποιημένου εκτιμητή. Χρησιμοποίησέ την ως αφετηρία και προσάρμοσέ την στην πραγματική κατάσταση, τον όροφο και τη θέση του ακινήτου.`} />
            <button onClick={() => setValue(String(estValue))} className="acc-toggle" style={{ height: 28, padding: '0 12px', borderRadius: 10, border: '1px solid var(--border-accent)', background: 'var(--accent-dim)', color: 'var(--accent)', fontSize: 12, fontFamily: SANS, fontWeight: 600, cursor: 'pointer' }}>Χρήση</button>
          </div>
        )}
        {term === 'short' && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', fontFamily: SANS }}>Παράμετροι βραχυχρόνιας</span>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: SANS }}>· προσυμπληρωμένες από τα δεδομένα αναφοράς της περιοχής{pSqm ? `, για ${pSqm} τ.μ.` : ''}</span>
            </div>
            <div style={g4}>
              <NumberInput label="Ετήσια πληρότητα" value={stOcc} onChange={setStOcc} suffix="%" max={100} labelInfo={<TermInfo text={G.occupancy} />} />
              <NumberInput label="Μέση τιμή ανά νύχτα" value={stAdr} onChange={setStAdr} suffix="€" step={5} labelInfo={<TermInfo text={G.adr} />} />
              <NumberInput label="Καθαρισμός ανά διαμονή" value={stClean} onChange={setStClean} suffix="€" step={5} />
              <NumberInput label="Προμήθεια πλατφόρμας" value={stFee} onChange={setStFee} suffix="%" max={100} step={0.5} labelInfo={<TermInfo text={G.platform_fee} />} />
            </div>
            {!empty && y.grossYield > MAX_ST_GROSS_YIELD_WARN && (
              <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-secondary)', fontFamily: SANS, lineHeight: 1.5 }}>
                  Η μεικτή απόδοση προκύπτει <strong style={{ color: 'var(--text-primary)' }}>{fp(y.grossYield)}</strong>, ασυνήθιστα υψηλή. Σε ισχυρές τουριστικές αγορές μπορεί να είναι πραγματική· διαφορετικά έλεγξε την αξία και τη μέση τιμή ανά νύχτα.
                </p>
              </div>
            )}
            {!empty && (
              <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', fontFamily: SANS }}>Τέλη και φορολογία βραχυχρόνιας</span>
                </div>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <div><span style={{ fontSize: 11.5, color: 'var(--text-tertiary)', fontFamily: SANS }}>Τέλος Ανθεκτικότητας (ΤΑΚΚ) <TermInfo text={G.takk} /></span><div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>{fe(st.climateLevy, 0)} τον χρόνο</div></div>
                  <div><span style={{ fontSize: 11.5, color: 'var(--text-tertiary)', fontFamily: SANS }}>Τέλος παρεπιδημούντων <TermInfo text={G.transient_tax} /></span><div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>{st.municipalTax > 0 ? `${fe(st.municipalTax, 0)} τον χρόνο` : 'Εξαιρείται'}</div></div>
                </div>
                <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--text-secondary)', fontFamily: SANS, lineHeight: 1.55 }}>
                  Το Τέλος Ανθεκτικότητας χρεώνεται ανά διανυκτέρευση, με υψηλότερη τιμή στην υψηλή περίοδο και για μονοκατοικίες και βίλες. Το τέλος παρεπιδημούντων (0,5%) εξαιρεί τους μικρούς ιδιοκτήτες (έως δύο ακίνητα, ως φυσικό πρόσωπο). {individualPerson ? 'Όταν η δραστηριότητα ξεπεράσει τα όρια (πολλά ακίνητα ή παροχή υπηρεσιών ξενοδοχειακού τύπου), θεωρείται επιχειρηματική και υπάγεται σε ΦΠΑ και στην κλίμακα του άρθρου 15· είναι θέμα του λογιστή.' : 'Ως νομικό πρόσωπο, τα έσοδα υπάγονται σε ΦΠΑ και εταιρική φορολογία, ενώ τα τέλη εκπίπτουν ως δαπάνες.'} Κάθε ακίνητο χρειάζεται Αριθμό Μητρώου Ακινήτων σε κάθε αγγελία. Οι τελικές υποχρεώσεις επιβεβαιώνονται με τον λογιστή ή την ΑΑΔΕ.
                </p>
              </div>
            )}
          </div>
        )}
        {empty && <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '12px 0 0', fontFamily: SANS }}>{term === 'short' ? 'Συμπλήρωσε αξία, πληρότητα και τιμή ανά νύχτα για να δεις τις αποδόσεις.' : 'Συμπλήρωσε αξία και ενοίκιο για να δεις τις αποδόσεις.'}</p>}
      </div>

      {!empty && (<>
        {/* KPIs */}
        <div style={g4}>
          <KPI label="Μεικτή απόδοση" value={fp(y.grossYield)} sub={`${fe(y.annualRent, 0)} έσοδα τον χρόνο`} info={G.gross_yield} />
          <KPI label="Καθαρή απόδοση" value={fp(y.netYield)} sub="μετά τα έξοδα" info={G.net_yield} />
          <KPI label="Απόδοση μετά τον φόρο" value={fp(y.netYieldAfterTax)} sub={`φόρος ${fe(annualTax, 0)} τον χρόνο`} accent info={G.after_tax_yield} />
          {pro
            ? <KPI label="Απόδοση ιδίων κεφαλαίων" value={fp(lev.cashOnCash)} sub={lev.cashOnCash >= 0 ? 'θετική μόχλευση' : (lev.positiveCarry ? 'θετική μόχλευση, αρνητική ροή' : 'αρνητική μόχλευση')} info={G.cash_on_cash} />
            : term === 'short'
              ? <KPI label="Τυπική βραχυχρόνια απόδοση" value={fp(stRef.grossYield)} sub={reg?.region || 'Ελλάδα'} info={G.region_short_ref} />
              : <KPI label="Μέσος όρος περιοχής" value={fp(reg?.grossYield || GREECE_AVG_GROSS_YIELD)} sub={reg?.region || 'Ελλάδα'} info={G.region_ref} />}
        </div>

        {/* Βαθμός απόδοσης A–F */}
        <GradeCard grade={grade} note={term === 'short'
          ? `Σε σχέση με την τυπική βραχυχρόνια απόδοση της περιοχής, μετά τα λειτουργικά έξοδα και τον φόρο.`
          : `Σε σχέση με τον μέσο όρο της περιοχής (${reg?.region || 'Ελλάδα'}, μεικτή ${fp(reg?.grossYield || GREECE_AVG_GROSS_YIELD)}), με βάση την καθαρή απόδοση και την ταμειακή ροή.`} />

        {/* 1) Η περιοχή σου */}
        <Section icon={<Landmark size={15} />} title="Η περιοχή σου" sub={`Σύγκριση με τα δεδομένα της αγοράς (${MARKET_DATA_ASOF})`} defaultOpen>
          {term === 'short' ? (() => {
            const m = Math.max(y.grossYield, stRef.grossYield, reg?.grossYield || 5) * 1.1;
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <BarRow label="Το ακίνητό σου" value={y.grossYield} max={m} valueLabel={fp(y.grossYield)} tone="accent" hint="Μεικτή απόδοση βραχυχρόνιας" />
                <BarRow label="Τυπική βραχυχρόνια" value={stRef.grossYield} max={m} valueLabel={fp(stRef.grossYield)} tone="neutral" hint={stRef.note} />
                <BarRow label="Μακροχρόνια στην ίδια περιοχή" value={reg?.grossYield || 0} max={m} valueLabel={fp(reg?.grossYield || 0)} tone="muted" hint={reg?.note} />
              </div>
            );
          })() : (() => {
            const m = Math.max(y.grossYield, reg?.grossYield || 5, ATHENS_AVG_GROSS_YIELD) * 1.1;
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <BarRow label="Το ακίνητό σου" value={y.grossYield} max={m} valueLabel={fp(y.grossYield)} tone="accent" />
                <BarRow label={reg?.label || 'Περιοχή'} value={reg?.grossYield || 0} max={m} valueLabel={fp(reg?.grossYield || 0)} tone="neutral" hint={reg?.note} />
                <BarRow label="Μέσος όρος Αθήνας" value={ATHENS_AVG_GROSS_YIELD} max={m} valueLabel={fp(ATHENS_AVG_GROSS_YIELD)} tone="muted" />
                <BarRow label="Εθνικός μέσος όρος" value={GREECE_AVG_GROSS_YIELD} max={m} valueLabel={fp(GREECE_AVG_GROSS_YIELD)} tone="muted" />
              </div>
            );
          })()}
          <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-primary)', fontFamily: SANS, fontWeight: 600 }}>{verdictLabel}</p>
            {reg && <p style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--text-tertiary)', fontFamily: SANS, lineHeight: 1.5 }}>{reg.note}</p>}
          </div>
          {commStat && (
            <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-primary)', fontFamily: SANS, fontWeight: 600, display: 'flex', alignItems: 'center' }}>Δεδομένα κοινότητας Property OS<TermInfo text={G.community} /></p>
              <p style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--text-tertiary)', fontFamily: SANS, lineHeight: 1.5 }}>
                Ταχυδρομικός κώδικας {commStat.postal}: διάμεση μεικτή απόδοση <strong style={{ color: 'var(--text-secondary)' }}>{fp(commStat.median)}</strong> (εύρος {fp(commStat.p25)} έως {fp(commStat.p75)}), από {commStat.count} πραγματικά ακίνητα χρηστών. Ανώνυμα και συγκεντρωτικά.
              </p>
            </div>
          )}
          {term === 'short' && (
            <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--text-secondary)', fontFamily: SANS, lineHeight: 1.55 }}>
              {stExact
                ? <>Δεδομένα αναφοράς περιοχής: πληρότητα περίπου {stExact.occupancy}%, μέση τιμή {fe(stExact.adr, 0)} ανά νύχτα, ενδεικτική μεικτή απόδοση {fp(stExact.grossYield)} έναντι {fp(stExact.longTermYield)} στη μακροχρόνια.{stExact.redZone ? ' Κόκκινη ζώνη Αριθμού Μητρώου Ακινήτων: δεν επιτρέπονται νέες εγγραφές.' : ''} </>
                : <>Στη βραχυχρόνια τα μεικτά έσοδα είναι συνήθως υψηλότερα, με έντονη όμως εποχικότητα. </>}
              Η καθαρή απόδοση είναι σημαντικά χαμηλότερη από τη μεικτή, καθώς τα λειτουργικά έξοδα (καθαρισμοί, διαχείριση, τέλος ανθεκτικότητας, κενές νύχτες) απορροφούν το 40 έως 60% των εσόδων.
            </div>
          )}
        </Section>

        {/* 2) Ιστορική διαδρομή */}
        <Section icon={<TrendingUp size={15} />} title={`Ιστορική διαδρομή ${histYears}ετίας`} sub="Πώς θα κινούνταν η αξία ενός ακινήτου όπως το δικό σου (δείκτης Τράπεζας της Ελλάδος)" info={G.hist_index}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            <Seg value={histYears} onChange={setHistYears} options={[['10', '10 έτη'], ['20', '20 έτη']]} />
          </div>
          <AreaChart points={hist} />
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
            {[['Σήμερα', 'var(--accent)'], ['Κορυφή 2008', 'var(--text-tertiary)'], ['Πυθμένας 2017', 'var(--text-tertiary)']].map(([l, c]) => (
              <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'var(--text-tertiary)', fontFamily: SANS }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />{l}</span>
            ))}
          </div>
          <div className="po-fig-card" tabIndex={0} style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12 }}>
            <div><p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.4px', fontFamily: SANS }}>{hist[0]?.year}</p><p className="po-fig" style={{ fontSize: 15, fontWeight: 700, margin: '2px 0 0', fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>{fe(histStart, 0)}</p></div>
            <div><p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.4px', fontFamily: SANS }}>Σήμερα</p><p className="po-fig" data-tone="accent" style={{ fontSize: 15, fontWeight: 700, margin: '2px 0 0', fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>{fe(histEnd, 0)}</p></div>
            <div><p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.4px', fontFamily: SANS }}>Μεταβολή</p><p className="po-fig" style={{ fontSize: 15, fontWeight: 700, margin: '2px 0 0', fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>{histStart > 0 ? `${histEnd >= histStart ? '+' : ''}${(((histEnd - histStart) / histStart) * 100).toFixed(0)}%` : '—'}</p></div>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '12px 0 0', fontFamily: SANS, lineHeight: 1.5 }}>{HISTORY_ANCHORS.note} <strong style={{ color: 'var(--text-secondary)' }}>Παρελθούσες αποδόσεις δεν εγγυώνται μελλοντικές.</strong></p>
        </Section>

        {/* 3) Σύγκριση με εναλλακτικές */}
        <Section icon={<Layers size={15} />} title="Σύγκριση με εναλλακτικές επενδύσεις" sub={`Ίδιο ποσό (${fe(nVal, 0)}) με τις πραγματικές αποδόσεις ${cmpYears}ετίας`} info={G.total_return}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: SANS }}>Ετήσια ανατίμηση ακινήτου</span>
              <div style={{ width: 90 }}><NumberInput label="" value={appreciation} onChange={setAppreciation} suffix="%" step={0.5} max={20} /></div>
            </div>
            <Seg value={cmpYears} onChange={setCmpYears} options={[['10', '10 έτη'], ['20', '20 έτη']]} />
          </div>
          {/* Προβολή-γραμμή: ακίνητο vs κορυφαία εναλλακτική στον χρόνο */}
          <LineChart series={projSeries} />
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '2px 0 14px' }}>
            {projSeries.map(s => (
              <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'var(--text-tertiary)', fontFamily: SANS }}><span style={{ width: 12, height: 2.5, borderRadius: 2, background: s.color }} />{s.label}</span>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {compare.map(c => (
              <BarRow key={c.key} label={c.label} value={c.futureValue} max={compMax} valueLabel={feC(c.futureValue)} tone={c.key === 'property' ? 'accent' : 'neutral'} hint={`${fp(c.annualReturnPct)} ετησίως · ${c.totalReturnPct >= 0 ? '+' : ''}${c.totalReturnPct.toFixed(0)}% συνολικά`} />
            ))}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '12px 0 0', fontFamily: SANS, lineHeight: 1.55 }}>
            Οι εναλλακτικές εμφανίζονται με τη <strong style={{ color: 'var(--text-secondary)' }}>μέση πραγματική ετήσια απόδοσή τους της τελευταίας {cmpYears}ετίας</strong> (συνολική απόδοση σε ευρώ, από επίσημες πηγές, ορίζοντας {BENCHMARKS_ASOF}), όχι με εξομαλυμένες υποθέσεις. Η 20ετία περιλαμβάνει την κρίση: το Χρηματιστήριο Αθηνών και το ομόλογο είναι σχεδόν μηδενικά. Το ακίνητο υπολογίζεται με τη δική σου καθαρή απόδοση συν ανατίμηση. Όλα προ φόρου εισοδήματος· οι εναλλακτικές είναι <strong style={{ color: 'var(--text-secondary)' }}>παθητικές και ρευστές</strong>, ενώ το ακίνητο έχει κόστος συναλλαγής (περίπου 4 έως 10%), απαιτεί χρόνο και συγκεντρώνει τον κίνδυνο σε ένα μόνο περιουσιακό στοιχείο. Παρελθούσες αποδόσεις δεν εγγυώνται μελλοντικές· ενδεικτικά στοιχεία, όχι επενδυτική συμβουλή.
          </p>
        </Section>

        {/* 4) Εργαλεία & μοχλοί — μόνο επαγγελματίας */}
        {pro && (
          <Section icon={<Percent size={15} />} title="Εργαλεία απόδοσης" sub="Ανατοκισμός επανεπένδυσης και μόχλευση ιδίων κεφαλαίων">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 16 }}>
              {/* Ανατοκισμός */}
              <div className="po-fig-card" tabIndex={0} style={{ padding: 14, borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <p style={{ ...titleStyle, marginBottom: 12, display: 'flex', alignItems: 'center' }}>Ανατοκισμός επανεπένδυσης<TermInfo text={G.compound} /></p>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ width: 150 }}><NumberInput label="Απόδοση επανεπένδυσης" value={compRate} onChange={setCompRate} suffix="%" step={0.5} /></div>
                  <div><p style={{ ...subStyle, margin: '0 0 6px' }}>Ορίζοντας</p><Seg value={compYears} onChange={setCompYears} options={[['10', '10 έτη'], ['20', '20 έτη']]} /></div>
                </div>
                <div style={{ marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <div><p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.4px', fontFamily: SANS }}>Τελική αξία</p><p className="po-fig" data-tone="accent" style={{ fontSize: 16, fontWeight: 700, margin: '2px 0 0', fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>{fe(comp.futureValue, 0)}</p></div>
                  <div><p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.4px', fontFamily: SANS }}>Κέρδος ανατοκισμού</p><p className="po-fig" style={{ fontSize: 16, fontWeight: 700, margin: '2px 0 0', fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>{fe(comp.totalGrowth, 0)}</p></div>
                </div>
                <p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', margin: '10px 0 0', fontFamily: SANS, lineHeight: 1.5 }}>Αρχική αξία συν ετήσια επανεπένδυση της καθαρής ταμειακής ροής ({fe(Math.max(0, grossAnnual - effOpex - annualTax), 0)} ανά έτος).</p>
              </div>
              {/* Μόχλευση */}
              <div className="po-fig-card" tabIndex={0} style={{ padding: 14, borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                  <p style={{ ...titleStyle, margin: 0, display: 'flex', alignItems: 'center' }}>Μόχλευση (δανεισμός)<TermInfo text={G.leverage} /></p>
                  {savedLoan && savedLoan.amount > 0 && (
                    <button
                      onClick={() => {
                        const base = (savedLoan.property_value || parseFloat(value) || 0);
                        if (base > 0) setLtv(String(Math.min(100, Math.round((savedLoan.amount / base) * 100))));
                        setLoanRate(String(savedLoan.rate));
                        setIfree(savedLoan.loan_type === 'first_home' ? '50' : '0');
                      }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px', borderRadius: 10, border: '1px solid var(--border-accent)', background: 'var(--accent-dim)', color: 'var(--accent)', fontSize: 12, fontFamily: SANS, fontWeight: 500, cursor: 'pointer' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 12a9 9 0 11-6.2-8.5"/><polyline points="21 3 21 9 15 9"/></svg>
                      Χρησιμοποίησε το πραγματικό μου δάνειο
                    </button>
                  )}
                </div>
                <div style={g2}>
                  <NumberInput label="Δάνειο (% αξίας)" value={ltv} onChange={setLtv} suffix="%" max={100} />
                  <NumberInput label="Επιτόκιο" value={loanRate} onChange={setLoanRate} suffix="%" step={0.1} />
                  <NumberInput label="Άτοκο μέρος (Σπίτι μου ΙΙ)" value={ifree} onChange={setIfree} suffix="%" max={100} />
                </div>
                <div style={{ marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <div><p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.4px', fontFamily: SANS }}>Ίδια κεφάλαια</p><p className="po-fig" style={{ fontSize: 16, fontWeight: 700, margin: '2px 0 0', fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>{fe(lev.equity, 0)}</p></div>
                  <div><p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.4px', fontFamily: SANS }}>Απόδοση ιδίων</p><p className="po-fig" data-tone={lev.cashOnCash >= 0 ? 'accent' : 'negative'} style={{ fontSize: 16, fontWeight: 700, margin: '2px 0 0', fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>{fp(lev.cashOnCash)}</p></div>
                  <div><p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.4px', fontFamily: SANS }}>Ετήσια ροή</p><p className="po-fig" data-tone={lev.cashFlow >= 0 ? undefined : 'negative'} style={{ fontSize: 16, fontWeight: 700, margin: '2px 0 0', fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>{fe(lev.cashFlow, 0)}</p></div>
                </div>
                <p style={{ fontSize: 10.5, color: 'var(--text-secondary)', margin: '10px 0 0', fontFamily: SANS, lineHeight: 1.5 }}>{lev.positiveCarry ? `Θετική μόχλευση: η καθαρή απόδοση ${fp(lev.unleveredYield)} υπερβαίνει το κόστος δανείου ${fp(lev.effectiveLoanRate)}. Η ετήσια ροή μπορεί να είναι αρνητική λόγω χρεολυσίου, αυξάνεις όμως τα ίδια κεφάλαιά σου.` : `Αρνητική μόχλευση: το κόστος δανείου ${fp(lev.effectiveLoanRate)} καλύπτει ή υπερβαίνει την καθαρή απόδοση ${fp(lev.unleveredYield)}.`}</p>
              </div>
            </div>
          </Section>
        )}

        {/* Επενδυτική ανάλυση IRR/NPV/DSCR — μόνο επαγγελματίας */}
        {pro && (
          <Section icon={<Percent size={15} />} title="Επενδυτική ανάλυση" sub="IRR / NPV / DSCR: αγορά, κατοχή και πώληση στον ορίζοντα">
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
              <div><p style={{ ...subStyle, margin: '0 0 6px' }}>Ορίζοντας κατοχής</p><Seg value={holdYears} onChange={setHoldYears} options={[['5', '5 έτη'], ['10', '10 έτη'], ['20', '20 έτη']]} /></div>
              <div style={{ width: 128 }}><NumberInput label="Αύξηση ενοικίου" value={rentGrowth} onChange={setRentGrowth} suffix="%" step={0.5} /></div>
              <div style={{ width: 158 }}><NumberInput label="Επιτόκιο προεξόφλησης" value={discountRate} onChange={setDiscountRate} suffix="%" step={0.5} labelInfo={<TermInfo text={G.npv} />} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 130px), 1fr))', gap: 12 }}>
              <MetricTile label="IRR" value={Number.isFinite(deal.irrPct) ? fp(deal.irrPct) : '—'} info={G.irr} />
              <MetricTile label="Καθαρή παρούσα αξία" value={fe(deal.npv, 0)} info={G.npv} tone={deal.npv < 0 ? 'neg' : undefined} />
              <MetricTile label="DSCR" value={Number.isFinite(deal.dscr) ? fn(deal.dscr, 2) : '∞'} info={G.dscr} tone={deal.dscr < 1 ? 'neg' : undefined} />
              <MetricTile label="Πολλαπλασιαστής ιδίων" value={`${fn(deal.equityMultiple, 2)}×`} info={G.equity_multiple} />
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '12px 0 0', fontFamily: SANS, lineHeight: 1.55 }}>
              Υποθέτει πώληση στο τέλος του ορίζοντα: καθαρό προϊόν {fe(deal.saleProceeds, 0)} (μετά κόστη πώλησης 3% και υπόλοιπο δανείου {fe(deal.loanBalanceAtExit, 0)}). Το IRR ενσωματώνει τη χρονική αξία του χρήματος και την έξοδο· η NPV υπολογίζεται με επιτόκιο προεξόφλησης {fp(parseFloat(discountRate) || 0)}. Ενδεικτικά, όχι επενδυτική συμβουλή.
            </p>
          </Section>
        )}

        {/* Ανάλυση ευαισθησίας & αντοχή — μόνο επαγγελματίας */}
        {pro && (
          <Section icon={<TrendingUp size={15} />} title="Ανάλυση ευαισθησίας" sub="Πώς αντέχει η επένδυση σε μεταβολές επιτοκίου και ανατίμησης" info={G.sensitivity}>
            <div style={{ overflowX: 'auto' }}>
              <div className="po-fig-card" tabIndex={0} style={{ minWidth: 460, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr', gap: 8, padding: '0 12px 8px' }}>
                  {['Σενάριο', 'Συνολική απόδοση', 'Απόδοση ιδίων', 'Ετήσια ροή'].map((h, i) => (
                    <span key={h} style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontFamily: SANS, textAlign: i === 0 ? 'left' : 'right' }}>{h}</span>
                  ))}
                </div>
                {scenarios.map(s => (
                  <div key={s.key} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr', gap: 8, alignItems: 'center', padding: '10px 12px', borderRadius: 10, background: s.key === 'base' ? 'var(--bg-elevated)' : 'transparent', border: `1px solid ${s.key === 'base' ? 'var(--border-subtle)' : 'transparent'}` }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', margin: 0, fontFamily: SANS }}>{s.label}</p>
                      <p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', margin: '1px 0 0', fontFamily: SANS }}>{s.note}</p>
                    </div>
                    <span className="po-fig" style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontFamily: SANS }}>{fp(s.totalReturn)}</span>
                    <span className="po-fig" data-tone={s.roe >= 0 ? undefined : 'negative'} style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontFamily: SANS }}>{fp(s.roe)}</span>
                    <span className="po-fig" data-tone={s.cashFlow >= 0 ? undefined : 'negative'} style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontFamily: SANS }}>{fe(s.cashFlow, 0)}</span>
                  </div>
                ))}
              </div>
            </div>
            {term === 'short' && breakEvenOcc !== null && (
              <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-primary)', fontFamily: SANS, fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                  Πληρότητα ισοσκελισμού: {isFinite(breakEvenOcc) ? `${Math.min(100, breakEvenOcc).toFixed(0)}%` : 'μη εφικτή'}<TermInfo text={G.break_even} />
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--text-tertiary)', fontFamily: SANS, lineHeight: 1.5 }}>
                  {isFinite(breakEvenOcc) && breakEvenOcc <= 100
                    ? `Πάνω από αυτό το ποσοστό πληρότητας, τα καθαρά έσοδα της βραχυχρόνιας ξεπερνούν τα καθαρά της μακροχρόνιας μίσθωσης (προ φόρου).`
                    : `Με τα τρέχοντα δεδομένα, η βραχυχρόνια δύσκολα ξεπερνά τη μακροχρόνια: η μακροχρόνια μίσθωση φαίνεται προτιμότερη.`}
                </p>
              </div>
            )}
          </Section>
        )}

        {/* Μοχλοί μεγιστοποίησης — επαγγελματίας (πλήρες) / ιδιώτης (μόνο βασικά) */}
        <Section icon={<Wallet size={15} />} title="Μοχλοί μεγιστοποίησης απόδοσης" sub={pro ? 'Συγκεκριμένες κινήσεις με μετρήσιμη επίδραση και κίνδυνο' : 'Απλές κινήσεις που αυξάνουν την καθαρή απόδοση'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {YIELD_LEVERS.filter(l => pro || l.audience === 'all').map(l => (
              <LeverCard key={l.key} lever={l} />
            ))}
          </div>
          {pro && (
            <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Building2 size={14} style={{ color: 'var(--text-secondary)' }} />
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0, fontFamily: SANS }}>Ηλεκτρονικός πλειστηριασμός ({AUCTION_FACTS.platform})</p>
                <a href={AUCTION_FACTS.href} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', color: 'var(--text-tertiary)', display: 'inline-flex' }}><ArrowUpRight size={14} /></a>
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', margin: 0, fontFamily: SANS, lineHeight: 1.55 }}>
                Μέσω συμβολαιογράφου. Μετά από 2 άγονους η τιμή πέφτει στο 80%, μετά τον 3ο στο 65%, έως −35% της εκτιμηθείσας αξίας. Εγγύηση {AUCTION_FACTS.guaranteePct}% + τέλος {AUCTION_FACTS.systemFee}€. Μόνο περίπου 1 στους 7 βρίσκει αγοραστή. {AUCTION_FACTS.note}
              </p>
            </div>
          )}
        </Section>

        {/* Πηγές & disclaimer */}
        <div style={{ ...card, padding: '13px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <Info size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0, marginTop: 2 }} />
            <div>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0, fontFamily: SANS, lineHeight: 1.55 }}>{MARKET_DISCLAIMER}</p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
                {MARKET_SOURCES.map(s => <a key={s.href} href={s.href} target="_blank" rel="noreferrer" style={{ fontSize: 10.5, color: 'var(--accent)', textDecoration: 'none', fontFamily: SANS }}>{s.label}</a>)}
              </div>
            </div>
          </div>
        </div>
      </>)}
    </div>
  );
}
