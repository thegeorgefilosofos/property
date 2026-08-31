'use client';
// ═══════════════════════════════════════════════════════════════════════════
// ΑΠΟΔΟΣΕΙΣ — το εργαλείο απόδοσης ακινήτου. Καθαρό, minimal, πτυσσόμενο.
// Οδηγείται από το προφίλ: ιδιώτης → απλή εικόνα· επαγγελματίας → αναλυτικά
// εργαλεία, με διάκριση φυσικού/νομικού προσώπου όπου έχει σημασία.
// Πραγματικά δεδομένα αγοράς (lib/market/greekMarket) + μηχανή (lib/market/returns).
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/lib/supabase/client';
import * as properties from '@/lib/data/properties';
import * as loanStore from '@/lib/data/loans';
import * as expenses from '@/lib/data/expenses';
import { isActiveLoan } from '@/lib/loans/shape'
import { readStatus, type StatusRow } from '@/lib/property/status'
import { useChartWidth } from '@/app/hooks/useChartWidth'
import { businessFormOf } from '@/lib/accounting/taxProfile'
import type { LegalForm as DossierLegalForm } from '@/lib/accounting/dossier'
import { Skeleton, SkeletonKPIs, PageTitle, fe, feCompact, fp, fn, ABSENT, ABSENT_SHORT, T, fixedCols } from '@/components/Theme';
import { NumberInput, CustomSelect, fieldLabelStyle, SegmentControl, Toggle as Switch } from './UIComponents';
import { ChevronRight, TrendingUp, Landmark, Percent, Wallet, Layers, ArrowUpRight, Info, ShieldCheck } from 'lucide-react';
import { yields, compound, leverage, compareInvestments, propertyTotalReturn, projectLine, yieldGrade, dealAnalysis, type LeverageResult, type YieldGrade } from '@/lib/market/returns';
import { shortTermEstimate, breakEvenOccupancy, adrReference, MAX_ST_GROSS_YIELD_WARN } from '@/lib/market/shortTerm';
import { isHouseType } from '@/lib/tax/shortTermTax';
import {
  REGIONS, BENCHMARKS, BENCHMARKS_ASOF, HISTORY_INDEX, HISTORY_ANCHORS, SHORT_TERM, YIELD_LEVERS,
  GREECE_AVG_GROSS_YIELD, ATHENS_AVG_GROSS_YIELD, MARKET_DISCLAIMER, MARKET_DATA_ASOF, MARKET_SOURCES,
  yieldVerdict, regionByKey, estimatePropertyValue, historyPriceCagr, type ShortTermStat, type YieldLever,
} from '@/lib/market/greekMarket';
import { incomeStatement } from '@/lib/accounting/statement';
import { consolidateRentTax, taxShareOf, CONSOLIDATION_NOTE, PRESUMPTIVE_RULE_2026 } from '@/lib/billing/consolidate';
import { hasFeature } from '@/lib/billing/entitlements';
import type { PlanId } from '@/lib/billing/plans';
import { GLOSSARY as G } from '@/lib/market/glossary';
import { navLabel } from '@/lib/nav/labels';
import { useReportBranding } from '@/lib/reportBranding';
import { reportHead, reportHeader, reportSection, reportRow, reportKpi, reportDisclaimer, openReport, rEur, rSigned, rPct, rEsc } from './reportPdf';
import { generateReportPdf, pEur, pSigned, pPct, type PdfReportModel, type PdfSection, type PdfRow } from '@/lib/pdf/pdfReport';
import { issueDocument } from '@/lib/documents/issue';
import { notifyError } from '@/components/Toast';
import { INK_FAINT, INK_MUTED } from '@/lib/print/ink';
import { failed, MSG } from '@/lib/core/dbError';
import { InfoHint } from './InfoHint';

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

interface Props { propertyId: string; userId: string; propertyValue?: number; profileType?: 'individual' | 'professional'; legalForm?: DossierLegalForm; plan?: PlanId; }

// Εδώ ζούσε τοπικός «fp» με ΕΝΑ δεκαδικό, που ΣΚΙΑΖΕ τον κανονικό: όλη η οθόνη
// απόδοσης έγραφε «4,2%» ενώ η διπλανή έγραφε «4,20%». Ένας μορφοποιητής.
// Ρεαλιστικό εύρος συνολικής ετήσιας απόδοσης για πολυετείς προβολές/σύγκριση: προστατεύει
// από ακραίες τιμές λόγω μη ρεαλιστικών εισόδων (π.χ. πολύ μικρή αξία με έσοδα βραχυχρόνιας).
// Δεν επηρεάζει τους δείκτες KPI — μόνο τον ανατοκισμό στα γραφήματα/μπάρες.
const clampReturn = (r: number) => Math.max(-30, Math.min(35, isFinite(r) ? r : 0));
// Η συμπαγής μορφή ζει στο lib/core/format.ts, μαζί με όλες τις άλλες.
const feC = feCompact;
// Σύντομες, ολοκληρωμένες (χωρίς συντομογραφίες) ονομασίες εναλλακτικών για τα γραφήματα.
const BENCH_SHORT: Record<string, string> = {
  deposit: 'Κατάθεση', bond: 'Ομόλογο', gold: 'Χρυσός', athex: 'Χρηματιστήριο', sp500: 'S&P 500', inflation: 'Πληθωρισμός',
};
const benchShort = (key: string, fallback: string) => BENCH_SHORT[key] || fallback;
const SANS = T.font.sans;
const card: React.CSSProperties = { position: 'relative', background: 'linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg-surface) 100%)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '18px 20px', boxShadow: 'var(--highlight-inset), var(--elev-2)' };
const titleStyle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0, fontFamily: SANS, letterSpacing: '0.1px' };
const subStyle: React.CSSProperties = { fontSize: 12, color: 'var(--text-tertiary)', margin: '2px 0 0', fontFamily: SANS };
/** Οι δύο κάρτες των «Εργαλείων απόδοσης»: ίδιο κουτί, ίδια σημείωση, ίδιο ύψος. */
const toolCard: React.CSSProperties = { padding: 14, borderRadius: 12, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column' };
const toolNote: React.CSSProperties = { fontSize: 11, color: 'var(--text-tertiary)', margin: 0, fontFamily: SANS, lineHeight: 1.5 };

// ── Επεξήγηση όρου (διακριτικό εικονίδιο· επαγγελματικός ορισμός) ─────────────
// Προσβάσιμο: πραγματικό κουμπί (πληκτρολόγιο + αφή), ανοίγει σε hover, εστίαση ή άγγιγμα,
// κλείνει σε Escape/έξοδο. Portal-based popover ώστε να μην «κόβεται» από scroll containers.
// ═══════════════════════════════════════════════════════════════════════════
// Η ΕΤΙΚΕΤΑ ΤΟΥ ΠΛΑΚΙΔΙΟΥ, ΜΙΑ ΦΟΡΑ
// ─────────────────────────────────────────────────────────────────────────
// Ηταν γραμμένη δύο φορές, στο `KPI` και στο `MetricTile`, με μία διαφορά που
// δεν είχε αποφασίσει κανείς (`fontWeight: 500` στο ένα, τίποτα στο άλλο).
//
// ΤΟ ΥΨΟΣ ΓΡΑΜΜΗΣ ΕΙΝΑΙ 16 ΓΙΑΤΙ 16 ΕΙΝΑΙ ΚΑΙ ΤΟ ΕΙΚΟΝΙΔΙΟ. Με στοίχιση στο
// κέντρο, μια ετικέτα δύο γραμμών έβαζε το «i» στη ΜΕΣΗ των δύο γραμμών, να
// αιωρείται ανάμεσά τους. Με στοίχιση στην κορυφή και ίδιο ύψος, κάθεται
// ακριβώς πάνω στην πρώτη γραμμή — σε ετικέτα μιας γραμμής και σε δύο.
// ═══════════════════════════════════════════════════════════════════════════
const KPI_LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 500, color: 'var(--text-tertiary)',
  textTransform: 'uppercase', letterSpacing: '0.4px', margin: 0, fontFamily: SANS,
  display: 'flex', alignItems: 'flex-start', lineHeight: '16px',
};

// ═══════════════════════════════════════════════════════════════════════════
// ΔΥΟ ΥΛΟΠΟΙΗΣΕΙΣ ΤΟΥ ΙΔΙΟΥ ΚΥΚΛΑΚΙΟΥ· ΜΟΝΟ Η ΜΙΑ ΕΙΧΕ ΔΙΟΡΘΩΘΕΙ
// ─────────────────────────────────────────────────────────────────────────
// Εδώ ζούσαν τριάντα γραμμές popover με portal, δικό τους εικονίδιο 12,5 και
// δικό τους περιθώριο: αντίγραφο του `InfoHint`, γραμμένο ξεχωριστά. Ο σαρωτής
// το έπιασε από τον νέο έλεγχο πλάτους: στόχος αφής 16 εικονοστοιχείων, ενώ το
// αδελφάκι του είχε ήδη πάρει τη ζώνη των 24. Κάθε διόρθωση στο ένα άφηνε το
// άλλο πίσω· δεν το έβλεπε κανείς γιατί έμοιαζαν ίδια στην οθόνη.
//
// Το `TermInfo` κρατά το όνομά του και τα δεκαοκτώ σημεία που το καλούν, αλλά
// είναι πλέον ο ίδιος `InfoHint` με άλλη ετικέτα: ένα σχήμα, μία συμπεριφορά,
// μία ζώνη αφής, μία σύνδεση με τον αναγνώστη οθόνης.
// ═══════════════════════════════════════════════════════════════════════════
function TermInfo({ text }: { text: string }) {
  return <InfoHint label="Επεξήγηση όρου">{text}</InfoHint>;
}

// ── Πτυσσόμενη ενότητα (ομοιόμορφη, χωρίς μπλε πλαίσιο) ─────────────────────
// ═══════════════════════════════════════════════════════════════════════════
// ΚΟΥΜΠΙ ΜΕΣΑ ΣΕ ΚΟΥΜΠΙ: Η ΚΕΦΑΛΙΔΑ ΠΟΥ ΕΣΠΑΓΕ ΣΕ ΤΡΕΙΣ ΕΝΟΤΗΤΕΣ
// ─────────────────────────────────────────────────────────────────────────
// Η κουκκίδα επεξήγησης (`TermInfo`) αποδίδει `<button>` και καθόταν ΜΕΣΑ στο
// `<button>` που ανοίγει την ενότητα. Η HTML δεν επιτρέπει διαδραστικό στοιχείο
// μέσα σε κουμπί: ο αναλυτής του περιηγητή ΚΛΕΙΝΕΙ το εξωτερικό κουμπί μόλις
// συναντήσει το εσωτερικό. Ό,τι ερχόταν μετά —ο υπότιτλος και το βελάκι—
// έβγαινε έξω από τη σειρά και η κεφαλίδα διαβαζόταν σε τέσσερις γραμμές με
// ένα ορφανό «›» στα αριστερά. Έσπαγαν και οι τρεις ενότητες που έχουν
// επεξήγηση: Ιστορική διαδρομή, Σύγκριση με εναλλακτικές, Ανάλυση ευαισθησίας.
//
// Το κουμπί της ενότητας γίνεται στρώση από κάτω που πιάνει όλη τη σειρά· το
// εικονίδιο και το κείμενο αφήνουν το πάτημα να περάσει σε αυτό και η κουκκίδα
// μένει το μόνο στοιχείο που κρατά το δικό της. Ένα κουμπί για την ενότητα, ένα
// για την επεξήγηση, κανένα μέσα στο άλλο.
// ═══════════════════════════════════════════════════════════════════════════
function Section({ icon, title, sub, info, children, defaultOpen = false }: { icon: React.ReactNode; title: string; sub?: string; info?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={card}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label={title} className="acc-toggle"
          style={{ position: 'absolute', inset: 0, width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }} />
        <span style={{ position: 'relative', pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', flexShrink: 0 }}>{icon}</span>
        <div style={{ position: 'relative', pointerEvents: 'none', flex: 1, minWidth: 0 }}>
          <p style={titleStyle}>{title}</p>
          {sub && <p style={subStyle}>{sub}</p>}
        </div>
        {info && <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}><TermInfo text={info} /></span>}
        <ChevronRight size={17} style={{ position: 'relative', pointerEvents: 'none', color: 'var(--text-tertiary)', flexShrink: 0, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.18s' }} />
      </div>
      {open && <div style={{ marginTop: 16 }}>{children}</div>}
    </div>
  );
}

// ── KPI κάρτα 3D ────────────────────────────────────────────────────────────
function KPI({ label, value, sub, accent, info }: { label: string; value: string; sub?: string; accent?: boolean; info?: string }) {
  const [hot, setHot] = useState(false);
  return (
    <div onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
      style={{ display: 'flex', flexDirection: 'column', background: 'linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg-surface) 100%)', border: `1px solid ${hot ? 'var(--border-accent)' : 'var(--border-subtle)'}`, borderRadius: T.radius.card, padding: '15px 16px', boxShadow: hot ? 'var(--elev-2)' : 'var(--elev-1)', transform: hot ? 'translateY(-3px)' : 'none', transition: 'transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease' }}>
      <p style={KPI_LABEL}>{label}{info && <TermInfo text={info} />}</p>
      {/* ΤΟ ΝΟΥΜΕΡΟ ΚΟΛΛΑΕΙ ΚΑΤΩ. Χωρίς αυτό, μια ετικέτα δύο γραμμών κατεβάζει
          το δικό της νούμερο και η σειρά χάνει τη γραμμή βάσης της — τέσσερα
          ποσοστά δίπλα-δίπλα σε τέσσερα διαφορετικά ύψη. */}
      <div style={{ marginTop: 'auto', paddingTop: 6 }}>
        <p style={{ fontSize: 24, fontWeight: 700, color: accent && hot ? 'var(--accent)' : 'var(--text-primary)', margin: 0, fontVariantNumeric: 'tabular-nums', fontFamily: SANS, lineHeight: 1, transition: 'color 0.16s ease' }}>{value}</p>
        {sub && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '4px 0 0', fontFamily: SANS }}>{sub}</p>}
      </div>
    </div>
  );
}

// ── Κάρτα βαθμού απόδοσης (A–F) — μονόχρωμη· ο βαθμός, ο αριθμός και το μήκος
//    της μπάρας μεταφέρουν την ποιότητα, χωρίς περιττά χρώματα. ────────────────
function GradeCard({ grade, note }: { grade: YieldGrade; note: string }) {
  const strong = grade.grade === 'A' || grade.grade === 'B';
  return (
    <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: T.radius.card, background: 'var(--bg-elevated)', border: `1px solid ${strong ? 'var(--border-accent)' : 'var(--border-subtle)'}`, flexShrink: 0 }}>
        <span style={{ fontSize: 28, fontWeight: 700, color: strong ? 'var(--accent)' : 'var(--text-primary)', fontFamily: SANS, lineHeight: 1 }}>{grade.grade}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0, fontFamily: SANS, display: 'flex', alignItems: 'center' }}>Βαθμός απόδοσης<TermInfo text={G.grade} /></p>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>{grade.label} · {grade.score} / 100</span>
        </div>
        <div style={{ marginTop: 8, height: 6, borderRadius: 6, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
          <div style={{ width: `${Math.max(3, grade.score)}%`, height: '100%', borderRadius: 6, background: 'var(--accent)', transition: 'width 0.5s ease' }} />
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-tertiary)', fontFamily: SANS, lineHeight: 1.5 }}>{note}</p>
      </div>
    </div>
  );
}

// ── Μίνι μπάρα-γράφημα (ιστορικό / σύγκριση) ─────────────────────────────────
function BarRow({ label, value, max, valueLabel, tone = 'neutral', hint }: { label: string; value: number; max: number; valueLabel: string; tone?: 'accent' | 'neutral' | 'muted'; hint?: string }) {
  const pct = max > 0 ? Math.max(2, Math.min(100, (value / max) * 100)) : 0;
  const bg = tone === 'accent' ? 'var(--accent)' : tone === 'muted' ? 'var(--text-tertiary)' : 'var(--border-default)';
  return (
    /* ═══ ΤΡΕΙΣ ΣΤΗΛΕΣ ΣΕ ΦΑΡΔΙΑ ΟΘΟΝΗ, ΔΥΟ ΣΕΙΡΕΣ ΣΕ ΣΤΕΝΗ ══════════════════
       Ονομα 168, ράβδος, τιμή 92 και δύο κενά των 12: μαζί 284 ΠΡΙΝ πάρει η
       ράβδος ούτε ένα εικονοστοιχείο. ΜΕΤΡΗΜΕΝΟ ΣΕ 320 (One UI με μεγάλη
       γραμματοσειρά), η κάρτα δίνει 258, οπότε κάθε μία από τις τέσσερις
       γραμμές σύγκρισης έβγαινε 26 έξω από την κάρτα και το ποσοστό, που είναι
       ΟΛΟ το νόημα της γραμμής, έπεφτε πάνω στο περίγραμμα.

       ΤΙ ΑΛΛΑΖΕΙ ΣΕ ΣΤΕΝΗ ΟΘΟΝΗ: το όνομα και το ποσοστό κρατούν τη σειρά
       τους, αριστερά και δεξιά· η ράβδος κατεβαίνει από κάτω σε ΟΛΟ το
       πλάτος. Κερδίζει και η ράβδος: από 64 εικονοστοιχεία που θα της έμεναν,
       πηγαίνει στα 258. Το πλέγμα το κάνει το globals.css· εδώ μένει η δομή.

       Ο ΛΟΓΟΣ ΠΟΥ ΤΑ ΠΛΑΤΗ ΕΙΝΑΙ ΣΤΑΘΕΡΑ ΚΑΙ ΟΧΙ `auto`: κάθε γραμμή είναι δικό
       της πλέγμα, οπότε μια στήλη `auto` θα μετρούσε ΜΟΝΟ το δικό της
       περιεχόμενο. Το «5,40%» και το «10,00%» θα έπαιρναν άλλο πλάτος και οι
       τέσσερις τιμές δεν θα στοίχιζαν μεταξύ τους.

       ΤΟ ΟΝΟΜΑ ΤΗΣ ΓΡΑΜΜΗΣ ΔΕΝ ΚΟΒΕΤΑΙ. «Μακροχρόνια στην ίδια περιοχή» γινόταν
       «Μακροχρόνια στην ίδια π…», δηλαδή ο χρήστης δεν μάθαινε με τι
       συγκρίνεται. Δύο λέξεις σε δεύτερη σειρά κοστίζουν δεκαέξι
       εικονοστοιχεία ύψους· η μισή πρόταση κοστίζει το νόημα. */
    <div className="bar-row" style={{ display: 'grid', alignItems: 'center', columnGap: 12, rowGap: 6, padding: '5px 0' }} title={hint}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: SANS, lineHeight: 1.35 }}>{label}</span>
      <div style={{ height: 8, borderRadius: 6, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 6, background: bg, transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ textAlign: 'right', fontSize: 12, fontWeight: 600, color: tone === 'accent' ? 'var(--accent)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', fontFamily: SANS }}>{valueLabel}</span>
    </div>
  );
}

// Έξυπνο γράφημα περιοχής — premium: ομαλή καμπύλη, βάθος, διαδραστικό tooltip ανά έτος.
function AreaChart({ points }: { points: { year: number; value: number }[] }) {
  const [svgRef, W] = useChartWidth();
  const H = 196, padX = 18, padTop = 16, padBottom = 26;
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
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block', touchAction: 'none' }} role="img" aria-label="Ιστορική διαδρομή αξίας"
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
        <text key={'t' + p.year} x={X(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontSize="11" fill="var(--text-tertiary)" fontFamily="Inter, sans-serif">{p.year}</text>
      ) : null)}
      {/* Διαδραστικός δείκτης: κάθετη γραμμή, φωτεινό σημείο, tooltip έτους/τιμής */}
      {hp && (
        <g pointerEvents="none">
          <line x1={X(hover!)} y1={padTop - 4} x2={X(hover!)} y2={baseY} stroke="var(--border-default)" strokeWidth="1" strokeDasharray="3 3" />
          <circle cx={X(hover!)} cy={Y(hp.value)} r="7" fill="var(--accent)" opacity="0.16" />
          <circle cx={X(hover!)} cy={Y(hp.value)} r="4" fill="var(--accent)" stroke="var(--bg-surface)" strokeWidth="2" />
          <g transform={`translate(${tx.toFixed(1)},${ty.toFixed(1)})`}>
            <rect width={TW} height={TH} rx="8" fill="var(--bg-elevated)" stroke="var(--border-subtle)" strokeWidth="1" style={{ filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.28))' }} />
            <text x="10" y="14" fontSize="11" fill="var(--text-tertiary)" fontFamily="Inter, sans-serif" letterSpacing="0.2">Έτος {hp.year}</text>
            <text x="10" y="28" fontSize="12" fontWeight="600" fill="var(--text-primary)" fontFamily="Inter, sans-serif" style={{ fontVariantNumeric: 'tabular-nums' }}>{feC(hp.value)}</text>
          </g>
        </g>
      )}
    </svg>
  );
}

// Γράφημα πολλαπλών γραμμών (forward προβολή) — premium, ομαλό, με διαδραστικό tooltip.
function LineChart({ series }: { series: { label: string; color: string; points: { year: number; value: number }[] }[] }) {
  const [svgRef, W] = useChartWidth();
  const H = 200, padX = 18, padTop = 16, padBottom = 26;
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
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block', touchAction: 'none' }} role="img" aria-label="Προβολή απόδοσης"
      onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
      {[0, 0.25, 0.5, 0.75, 1].map(f => { const gy = padTop + f * (baseY - padTop); return <line key={f} x1={padX} y1={gy.toFixed(1)} x2={W - padX} y2={gy.toFixed(1)} stroke="var(--border-subtle)" strokeWidth="1" opacity="0.45" />; })}
      {series.map(s => (
        <path key={s.label} d={smooth(s.points.map(p => [X(p.year), Y(p.value)] as [number, number]))} fill="none" stroke={s.color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {series.map(s => { const last = s.points[s.points.length - 1]; return (<circle key={s.label + 'c'} cx={X(last.year)} cy={Y(last.value)} r="4" fill={s.color} stroke="var(--bg-surface)" strokeWidth="1.6" />); })}
      {[0, Math.round(years / 2), years].map(t => <text key={t} x={X(t)} y={H - 6} textAnchor={t === 0 ? 'start' : t === years ? 'end' : 'middle'} fontSize="11" fill="var(--text-tertiary)" fontFamily="Inter, sans-serif">{`Έτος ${t}`}</text>)}
      {th != null && (
        <g pointerEvents="none">
          <line x1={X(th)} y1={padTop - 4} x2={X(th)} y2={baseY} stroke="var(--border-default)" strokeWidth="1" strokeDasharray="3 3" />
          {series.map(s => <circle key={s.label + 'h'} cx={X(th)} cy={Y(s.points[th].value)} r="4" fill={s.color} stroke="var(--bg-surface)" strokeWidth="2" />)}
          <g transform={`translate(${tx.toFixed(1)},${ty.toFixed(1)})`}>
            <rect width={TW} height={TH} rx="8" fill="var(--bg-elevated)" stroke="var(--border-subtle)" strokeWidth="1" style={{ filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.28))' }} />
            <text x="11" y="13" fontSize="11" fill="var(--text-tertiary)" fontFamily="Inter, sans-serif" letterSpacing="0.2">Έτος {th}</text>
            {rows.map((r, i) => (
              <g key={r.label + 'r'} transform={`translate(11,${27 + i * 16})`}>
                <rect x="0" y="-6.5" width="8" height="3" rx="1.5" fill={r.color} />
                <text x="15" y="0" fontSize="11" fill="var(--text-secondary)" fontFamily="Inter, sans-serif">{r.label}</text>
                <text x={TW - 22} y="0" textAnchor="end" fontSize="11" fontWeight="600" fill="var(--text-primary)" fontFamily="Inter, sans-serif" style={{ fontVariantNumeric: 'tabular-nums' }}>{r.value}</text>
              </g>
            ))}
          </g>
        </g>
      )}
    </svg>
  );
}

// ═══ Ο ΕΠΙΛΟΓΕΑΣ ΕΙΝΑΙ Ο ΚΟΙΝΟΣ ΕΠΙΛΟΓΕΑΣ ══════════════════════════════════════
// ΗΤΑΝ ΤΕΤΑΡΤΟ ΑΝΤΙΓΡΑΦΟ, ΚΑΙ ΦΑΙΝΟΤΑΝ. Το `SegmentControl` των κοινών
// στοιχείων υπάρχει και το χρησιμοποιούν οι Ρυθμίσεις· εδώ ζούσε δικό του
// `Seg` με τρεις αποκλίσεις: τα τμήματα έπαιρναν πλάτος από το ΚΕΙΜΕΝΟ τους
// («10 έτη» στενό, «20 έτη» πλατύ, δηλαδή δύο επιλογές σε άνισα κουτιά), το
// επιλεγμένο γέμιζε ΣΥΜΠΑΓΕΣ γαλάζιο αντί για το ανασηκωμένο πλακίδιο που
// χρησιμοποιεί κάθε άλλος επιλογέας· και δεν δήλωνε `aria-pressed`.
//
// Ο κοινός δίνει `flex: 1` σε κάθε τμήμα: δύο επιλογές γίνονται δύο ίσα μισά,
// τρεις γίνονται τρία ίσα τρίτα, όποιο κι αν είναι το λεκτικό τους.
const yearOpts = (...years: number[]) => years.map(y => ({ value: String(y), label: `${y} έτη` }));

/**
 * ΝΟΥΜΕΡΟ ΜΕ ΕΤΙΚΕΤΑ ΑΠΟ ΠΑΝΩ — ΜΙΑ ΦΟΡΑ, ΓΙΑ ΟΛΗ ΤΗΝ ΟΘΟΝΗ.
 *
 * Το ίδιο ζευγάρι ήταν γραμμένο οκτώ φορές μέσα στο αρχείο, με δύο διαφορετικά
 * μεγέθη (15 και 16) και τρία διαφορετικά κενά. Οκτώ αντίγραφα σημαίνει ότι
 * κάθε διόρθωση γινόταν σε ένα και ξεχνιόταν στα υπόλοιπα επτά — γι' αυτό η
 * «Ιστορική διαδρομή» είχε άλλο μέγεθος νούμερου από τα «Εργαλεία απόδοσης».
 */
function Figure({ label, value, tone }: { label: string; value: string; tone?: 'accent' | 'negative' }) {
  return (
    <div>
      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.4px', fontFamily: SANS }}>{label}</p>
      <p className="po-fig" data-tone={tone} style={{ fontSize: 16, fontWeight: 700, margin: '3px 0 0', fontFamily: SANS, fontVariantNumeric: 'tabular-nums', lineHeight: 1.15 }}>{value}</p>
    </div>
  );
}

// Κάρτα μοχλού — στο hover γίνεται accent ΜΟΝΟ ο τίτλος (καθαρή, διακριτική ένδειξη).
/* ── Ο ΜΟΧΛΟΣ ΛΕΕΙ ΤΟ ΠΟΣΟ ΚΑΙ ΚΡΥΒΕΙ ΤΑ ΨΙΛΑ ────────────────────────────
   ΤΕΣΣΕΡΑ ΜΠΛΟΚ ΚΕΙΜΕΝΟΥ ΑΝΑ ΚΑΡΤΑ, ΕΠΙ ΤΕΣΣΕΡΙΣ ΚΑΡΤΕΣ. Η κάρτα έγραφε
   μονίμως ορατά: τίτλο, τη γραμμή του ποσού, ολόκληρη την παράγραφο των
   προϋποθέσεων και από κάτω το «Προσοχή». Δεκαέξι μπλοκ σε μια ενότητα που
   απαντά ΕΝΑ ερώτημα: αξίζει να το κοιτάξω;

   ΚΑΙ ΤΟ ΜΙΣΟ ΠΛΑΤΟΣ ΤΗΣ ΚΑΡΤΑΣ ΕΜΕΝΕ ΑΔΕΙΟ. Μετρημένο στον πάγκο, στη σκηνή
   roi-pro: η παράγραφος του «Άρθρου 39Β» έπιανε 552 εικονοστοιχεία μέσα σε
   κάρτα 1.350, δηλαδή άφηνε 798 κενά δεξιά της· στα 1920 άφηνε 1.126. Αιτία ένα
   όριο 74 χαρακτήρων που έμπαινε τότε σε κάθε σημείωση: σωστός κανόνας για
   σελίδα βιβλίου, λάθος σχήμα για σημείωση μέσα σε φαρδιά κάρτα.

   ΤΩΡΑ ΜΕΝΕΙ ΟΡΑΤΟ ΜΟΝΟ ΟΤΙ ΚΡΙΝΕΙ ΤΗΝ ΑΠΟΦΑΣΗ: ο τίτλος και το ποσό. Οι
   προϋποθέσεις και ο κίνδυνος μπαίνουν πίσω από το κυκλάκι, μαζί, γιατί
   διαβάζονται μαζί από όποιον αποφάσισε ότι τον ενδιαφέρει.

   ΤΙΠΟΤΑ ΔΕΝ ΥΠΟΒΑΘΜΙΖΕΤΑΙ. Το `InfoHint` γράφει το κείμενό του σε κρυφό κόμβο
   με `aria-describedby`, οπότε ο αναγνώστης οθόνης το ανακοινώνει είτε είναι
   ανοιχτό είτε όχι. Η ετικέτα του κυκλακιού ονομάζει ρητά τι κρύβει, ώστε να
   μην είναι ένα ⓘ που δεν λέει τίποτα. */
function LeverCard({ lever }: { lever: YieldLever }) {
  const [hot, setHot] = useState(false);
  return (
    <div onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
      style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: hot ? 'var(--accent)' : 'var(--text-primary)', margin: 0, fontFamily: SANS, transition: 'color 0.15s' }}>{lever.title}</p>
        <InfoHint label={`Προϋποθέσεις και κίνδυνος: ${lever.title}`}>
          <span style={{ display: 'block' }}>{lever.detail}</span>
          <span style={{ display: 'block', marginTop: 8 }}><strong>Προσοχή:</strong> {lever.risk}</span>
        </InfoHint>
        {lever.href && <a href={lever.href} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', color: 'var(--text-tertiary)', display: 'inline-flex' }}><ArrowUpRight size={14} /></a>}
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-primary)', margin: 0, fontFamily: SANS, fontWeight: 600, lineHeight: 1.5 }}>{lever.impact}</p>
    </div>
  );
}

// Πλακίδιο μετρικής (IRR/NPV/DSCR) — μονόχρωμο· κόκκινο μόνο σε προβληματική τιμή,
// και αυτό διακριτικά μόνο όταν ο δείκτης/δάχτυλο ακουμπά το πλακίδιο.
function MetricTile({ label, value, info, tone }: { label: string; value: string; info?: string; tone?: 'neg' }) {
  return (
    <div className="po-fig-card" tabIndex={0} style={{ display: 'flex', flexDirection: 'column', padding: '12px 14px', borderRadius: 12, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
      <p style={KPI_LABEL}>{label}{info && <TermInfo text={info} />}</p>
      <p className="po-fig" data-tone={tone === 'neg' ? 'negative' : undefined} style={{ fontSize: 20, fontWeight: 700, margin: 0, marginTop: 'auto', paddingTop: 4, fontFamily: SANS, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value}</p>
    </div>
  );
}

// ΤΟ ΣΤΑΘΕΡΟ ΜΕΓΙΣΤΟ ΣΤΗΛΗΣ ΕΚΟΒΕ ΤΟ ΤΕΤΑΡΤΟ ΠΕΔΙΟ ΚΑΤΩ. Τρία πάνω, ένα από
// κάτω μόνο του και μισή κάρτα άδεια δεξιά. Τα τέσσερα στοιχεία είναι ΕΝΑ
// ερώτημα — τι αξίζει, τι αποδίδει, τι κοστίζει, πού είναι — και διαβάζονται
// σε μία ευθεία.
/**
 * Οι σειρές των τεσσάρων. ΔΥΟ, ΟΧΙ ΜΙΑ.
 *
 * Το ίδιο `g4` σέρβιρε και τα πεδία εισόδου και τα πλακίδια KPI και η
 * στοίχιση που θέλει το ένα είναι λάθος για το άλλο:
 *
 *   ΠΕΔΙΟ έχει ετικέτα ΠΑΝΩ από το κουτί του. Στοίχιση στο κάτω άκρο, ώστε μια
 *   ετικέτα δύο γραμμών να μη σπρώχνει το πεδίο της πιο χαμηλά από τα διπλανά.
 *
 *   ΚΑΡΤΑ ΕΙΝΑΙ η ίδια το κουτί, με περίγραμμα και σκιά. Στοίχιση στο κάτω
 *   άκρο σημαίνει ότι η ψηλότερη κάρτα προεξέχει προς τα ΠΑΝΩ: τέσσερα κουτιά
 *   που αρχίζουν σε τρία διαφορετικά ύψη διαβάζονται ως λάθος, γιατί είναι.
 *   Ο «Τυπική βραχυχρόνια απόδοση» τυλιγόταν σε δύο γραμμές και η κάρτα του
 *   ξεχώριζε από τις άλλες τρεις.
 *
 * Η στοίχιση διορθώνει το σύμπτωμα ΚΑΙ ΟΤΑΝ η ετικέτα τυλιχτεί έτσι κι αλλιώς
 * — με τη ρύθμιση «μεγαλύτερο κείμενο», σε στενή οθόνη, σε μεγάλο zoom. Την
 * αιτία τη διόρθωσε η ίδια η ετικέτα: η λέξη «απόδοση» υπήρχε και στις
 * τέσσερις κάρτες μιας σειράς που ΟΛΗ μιλά για αποδόσεις, δηλαδή λεγόταν
 * τέσσερις φορές χωρίς να προσθέτει τίποτα την τέταρτη.
 */
const g4 = fixedCols(4, 12);
const g4box = fixedCols(4, 12, 'stretch');

// ── Διακόπτης παραδοχής (ναι/όχι), με το κείμενο του κανόνα από κάτω ─────────
// ═══ ΔΕΥΤΕΡΟΣ ΔΙΑΚΟΠΤΗΣ ΓΙΑ ΤΗΝ ΙΔΙΑ ΔΟΥΛΕΙΑ ═══════════════════════════════
//
// Εδώ ζούσε δικό του χειριστήριο: γυμνό `input type="checkbox"` 15×15. Δύο
// προβλήματα και κανένα δεν είναι στιλιστικό.
//
// ΤΟ ΙΔΙΟ ΕΡΩΤΗΜΑ, ΑΛΛΟ ΣΧΗΜΑ. Το «εισπράττονται μέσω τραπέζης» είναι διακόπτης
// ναι/όχι, ακριβώς όπως οι δεκάδες άλλοι της εφαρμογής — που είναι ελατήρια. Ο
// χρήστης μάθαινε δύο σχήματα για το ίδιο νόημα και το ένα εμφανιζόταν σε μία
// μόνο οθόνη.
//
// ΚΑΙ ΣΤΟΧΟΣ ΑΦΗΣ 15 ΕΙΚΟΝΟΣΤΟΙΧΕΙΩΝ, όταν το ελάχιστο αξιόπιστο με δάχτυλο
// είναι 44. Το κοινό `Toggle` δίνει 44 χωρίς να μεγαλώσει η εικόνα.
//
// Η ΠΕΡΙΓΡΑΦΗ ΜΕΝΕΙ, γιατί εδώ ο διακόπτης αλλάζει ΦΟΡΟ: χωρίς την επεξήγηση
// του κανόνα, ο χρήστης πατά κάτι που μετακινεί νούμερα και δεν ξέρει γιατί.
// Η εσοχή είναι το πλάτος του διακόπτη συν το κενό του (36 + 12), ώστε το
// κείμενο να ευθυγραμμίζεται με την ετικέτα από πάνω του.
function Toggle({ checked, onChange, label, note }: { checked: boolean; onChange: (v: boolean) => void; label: string; note: string }) {
  return (
    <div>
      <Switch on={checked} onChange={onChange} label={label} size="sm" />
      {/* ΜΑΚΡΙΑ ΓΡΑΜΜΗ, ΠΕΡΙΣΣΟΤΕΡΟΣ ΑΕΡΑΣ. Χωρίς όριο πλάτους η σημείωση πιάνει
          όλη την κάρτα και φτάνει τους 103 χαρακτήρες ανά γραμμή στα 820: το
          1,5 του ύψους γραμμής άφηνε το μάτι να χάνει τη σειρά στην επιστροφή. */}
      <p style={{ margin: '4px 0 0 48px', fontSize: 11, color: 'var(--text-tertiary)', fontFamily: SANS, lineHeight: 1.7 }}>{note}</p>
    </div>
  );
}

// ── ΠΑΡΑΔΟΧΕΣ ΠΟΥ ΔΕΝ ΦΑΙΝΟΝΤΑΝ ΠΟΥΘΕΝΑ ─────────────────────────────────────
// Οι τιμές αυτές έμπαιναν σιωπηλά στη μηχανή (leverage/dealAnalysis) και έβγαζαν
// IRR, NPV και DSCR που ο χρήστης διάβαζε ως γεγονός. Τώρα είναι πεδία που
// φαίνονται και αλλάζουν, με προεπιλογές που λέγονται ρητά:
//   • Διάρκεια δανείου 25 έτη — η συνηθέστερη ελληνική στεγαστική διάρκεια.
//   • Κόστη πώλησης 3% — πλευρά ΠΩΛΗΤΗ (μεσιτική αμοιβή ~2% + ΦΠΑ, νομικός/
//     συμβολαιογραφικός έλεγχος). Ο φόρος μεταβίβασης 3% βαρύνει τον ΑΓΟΡΑΣΤΗ,
//     γι’ αυτό το συνολικό κόστος μιας πλήρους συναλλαγής (αγορά + πώληση) που
//     αναφέρεται παρακάτω είναι μεγαλύτερο. Δύο διαφορετικά πράγματα, δύο νούμερα.
const DEFAULT_LOAN_YEARS = '25';
const DEFAULT_SELL_COSTS_PCT = '3';

export default function TabRentROI({ propertyId, userId, propertyValue, profileType = 'individual', legalForm = 'individual', plan = 'free' }: Props) {
  const supabase = createClient();
  const branding = useReportBranding(userId);
  const [loading, setLoading] = useState(true);
  const [genOfficial, setGenOfficial] = useState(false);
  // ═══ ΧΩΡΙΣ ΕΦΕ, ΧΩΡΙΣ ΣΥΓΧΡΟΝΙΣΜΟ ════════════════════════════════════════
  // Η πρώτη γραφή κρατούσε `inputsOpen` σε state και το γύριζε με `useEffect`
  // μόλις συμπληρώνονταν τα στοιχεία. Δύο προβλήματα: το `empty` υπολογίζεται
  // ΜΕΤΑ από πρόωρη επιστροφή, άρα τα hooks έμπαιναν υπό συνθήκη — σφάλμα που
  // σπάει τη σειρά των hooks μεταξύ renders· και ένα state που απλώς αντιγράφει
  // ένα άλλο δεν είναι κατάσταση, είναι αντίγραφο που μπορεί να αποκλίνει.
  //
  // Τώρα η προεπιλογή ΠΑΡΑΓΕΤΑΙ: ανοιχτό όσο λείπουν στοιχεία, κλειστό μόλις
  // υπάρχει αποτέλεσμα. Το `null` σημαίνει «δεν έχει αποφασίσει ο χρήστης»· μόλις
  // πατήσει, η επιλογή του καρφώνεται και δεν την ξαναγυρίζει κανείς.
  const [inputsPinned, setInputsPinned] = useState<boolean | null>(null);
  const apprId = useId();
  const pro = profileType === 'professional';
  // ── Η ΚΛΕΙΔΑΡΙΑ ΤΗΣ ΕΠΕΝΔΥΤΙΚΗΣ ΑΝΑΛΥΣΗΣ ΗΤΑΝ Ο ΤΥΠΟΣ ΠΡΟΦΙΛ ────────────
  // Το IRR, το NPV, ο DSCR και η ανάλυση ευαισθησίας πωλούνται: ο πίνακας
  // σύγκρισης τα δείχνει με λουκέτο στο «Επαγγελματίας». Φυλάγονταν όμως από το
  // `profileType`, που ο χρήστης το διαλέγει μόνος του σε ένα κουμπί των
  // ρυθμίσεων, χωρίς κανέναν έλεγχο. Δηλαδή η κλειδαριά είχε το κλειδί επάνω.
  //
  // Οι δύο όροι ρωτούν διαφορετικά πράγματα και χρειάζονται ΚΑΙ ΟΙ ΔΥΟ: το
  // πακέτο απαντά «το πληρώνει;», το προφίλ «βγάζει νόημα;» — η μόχλευση
  // υπολογίζεται πάνω στο επιχειρηματικό καθεστώς και σε φυσικό πρόσωπο δεν
  // εμφανίζονται καν τα πεδία του δανείου που τη γεννούν.
  const canInvest = pro && hasFeature({ plan }, 'investment_analysis');

  // ── ΔΥΟ ΔΙΑΚΟΠΤΕΣ ΠΟΥ ΞΑΝΑΡΩΤΟΥΣΑΝ Ο,ΤΙ Η ΕΦΑΡΜΟΓΗ ΗΔΗ ΞΕΡΕΙ ─────────────
  // Η νομική μορφή δηλώνεται ΜΙΑ φορά, στην εγγραφή και ζει στο
  // `billing_profiles.legal_form`. Η μίσθωση είναι η κατάσταση του ακινήτου και
  // αλλάζει από το μενού της μπάρας. Εδώ υπήρχαν τοπικά αντίγραφα και των δύο,
  // με δικά τους κουμπιά — και η Λογιστική είχε ΤΡΙΤΟ ζευγάρι. Ο χρήστης
  // μπορούσε να δηλώσει «Νομικό πρόσωπο» εδώ, «Ατομική» δίπλα και «Φυσικό» στο
  // προφίλ και οι τρεις οθόνες να του δώσουν τρεις διαφορετικούς φόρους.
  //
  // Αν κάτι είναι λάθος, διορθώνεται εκεί που δηλώθηκε.
  // Η αντιστοίχιση ζει σε ένα σημείο, με τεστ. Εδώ γραφόταν ως έκφραση, ΚΑΙ
  // έπαιρνε τη δυαδική περίληψη της νομικής μορφής, όπου η ατομική επιχείρηση
  // είχε ήδη γίνει «νομικό πρόσωπο»: σε κέρδος 100.000 € ο φόρος έβγαινε 25.900
  // αντί 34.300 και στα μικρά εισοδήματα υπερδιπλάσιος.
  const entity = businessFormOf(legalForm);
  const [term, setTerm] = useState<'long' | 'short'>('long');

  // Στοιχεία (prefill από τα δεδομένα του ακινήτου, με δυνατότητα διόρθωσης).
  const [value, setValue] = useState('');
  const [rent, setRent] = useState('');
  const [opex, setOpex] = useState('');
  // ΠΟΙΑ ΧΡΟΝΙΑ ΕΙΝΑΙ ΤΟ ΠΡΟΣΥΜΠΛΗΡΩΜΕΝΟ ΠΟΣΟ, ΚΑΙ ΑΝ ΕΧΕΙ ΚΛΕΙΣΕΙ.
  // Το πεδίο λέει «Ετήσια έξοδα» και γεμίζει με το άθροισμα των εξόδων της
  // ΤΡΕΧΟΥΣΑΣ χρονιάς — δηλαδή, τον Αύγουστο, με οκτώ μήνες. Ο αριθμός μπαίνει
  // αυτούσιος σε καθαρή απόδοση, βαθμό A ώς F και IRR, χωρίς πουθενά να λέγεται
  // ότι είναι μερικός. `null` σημαίνει «το έγραψε ο χρήστης», οπότε δεν είναι
  // δική μας δουλειά να σχολιάσουμε τι περιλαμβάνει.
  const [opexYear, setOpexYear] = useState<number | null>(null);
  const [region, setRegion] = useState('ath_center');
  // ── ΑΝΑΤΙΜΗΣΗ: ΜΕΤΡΗΜΕΝΗ, ΟΧΙ ΕΠΙΛΕΓΜΕΝΗ ────────────────────────────────
  // Ήταν σταθερά «3» χωρίς πηγή — και αυτή η σταθερά έκρινε μόνη της το
  // συμπέρασμα: με 3% το ακίνητο βγαίνει κοντά στον S&P 500 στην 20ετία, με 1%
  // όχι. Η προεπιλογή προκύπτει πλέον από τον δείκτη τιμών κατοικιών της Τράπεζας
  // της Ελλάδος (HISTORY_INDEX), στον ΙΔΙΟ ορίζοντα με τις εναλλακτικές. Μόλις ο
  // χρήστης τη πειράξει, χαρακτηρίζεται ρητά «δική σου υπόθεση».
  // Όσο δεν έχει πειραχθεί, η τιμή ΠΑΡΑΓΕΤΑΙ από τον δείκτη στον επιλεγμένο
  // ορίζοντα (δες apprRef) — δεν αντιγράφεται σε state με effect.
  const [appreciation, setAppreciation] = useState('');
  const [apprTouched, setApprTouched] = useState(false);
  // Είσπραξη μέσω τραπέζης: ήταν καρφωμένο `true`. Είναι προϋπόθεση της τεκμαρτής
  // έκπτωσης 5% από 1/1/2026 — άρα απόφαση του χρήστη, όχι παραδοχή του κώδικα.
  const [rentsBank, setRentsBank] = useState(true);
  // ΤΟ ΤΑΚΚ ΤΟ ΠΛΗΡΩΝΕΙ Ο ΕΠΙΣΚΕΠΤΗΣ, ΤΟ ΑΠΟΔΙΔΕΙ Ο ΙΔΙΟΚΤΗΤΗΣ. Οι πλατφόρμες
  // όμως δεν έχουν πεδίο γι' αυτό στην Ελλάδα: όποιος δεν το ζητά ρητά, το
  // πληρώνει από την τσέπη του. Παραδοχή του χρήστη, όπως η τραπεζική είσπραξη.
  // Προεπιλογή η ΣΥΝΤΗΡΗΤΙΚΗ, ώστε το νούμερο να μην ανεβαίνει από μόνο του.
  const [levyToGuest, setLevyToGuest] = useState(false);
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
  const [loanYears, setLoanYears] = useState(DEFAULT_LOAN_YEARS);
  // Επενδυτική ανάλυση (IRR/NPV/DSCR)
  const [holdYears, setHoldYears] = useState<'5' | '10' | '20'>('10');
  const [rentGrowth, setRentGrowth] = useState('2');
  const [discountRate, setDiscountRate] = useState('8');
  const [sellCosts, setSellCosts] = useState(DEFAULT_SELL_COSTS_PCT);
  // Ενοίκια των ΑΛΛΩΝ ακινήτων του χρήστη — για τον προοδευτικό φόρο στο σύνολο.
  const [otherRents, setOtherRents] = useState<{ id: string; annualRent: number; shortTerm: boolean }[]>([]);

  const K = (s: string) => `roi_${propertyId}_${s}`;
  // ΑΚΥΡΩΣΗ ΑΝΑ ΑΚΙΝΗΤΟ. Έξι παράλληλα ερωτήματα γεμίζουν δώδεκα πεδία. Με αλλαγή
  // ακινήτου στη διάρκειά τους, η παλιά απάντηση έγραφε αξία, ενοίκιο, ετήσια
  // έξοδα, τετραγωνικά και τύπο του ΠΡΟΗΓΟΥΜΕΝΟΥ ακινήτου. Και επειδή αυτά τα
  // πεδία αποθηκεύονται τοπικά με κλειδί ανά ακίνητο, τα λάθος νούμερα έμεναν και
  // μετά την ανανέωση σελίδας — και από αυτά βγαίνουν απόδοση, βαθμός A–F και IRR.
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [pr, rc, exp, ln, allPr, allRc] = await Promise.all([
          properties.one(supabase, propertyId, 'value,target_rent,rental_mode,sqm,prop_type,name,postal_code', userId),
          supabase.from('rent_config').select('actual_rent,target_rent').eq('property_id', propertyId).maybeSingle(),
          // ΓΙΑΤΙ ΜΕ ΗΜΕΡΟΜΗΝΙΑ. Το ερώτημα ήταν χωρίς φίλτρο έτους και το άθροισμα
          // έμπαινε στο πεδίο με ετικέτα «Ετήσια έξοδα». Δηλαδή στον δεύτερο χρόνο
          // χρήσης έδειχνε δύο χρονιές, στον τρίτο τρεις — και μαζί του χειροτέρευαν
          // σιωπηλά η καθαρή απόδοση, η απόδοση μετά τον φόρο, ο βαθμός A–F και το
          // IRR. Κανένα σφάλμα, κανένα κρασάρισμα: απλώς το ίδιο ακίνητο έβγαζε
          // τριπλάσια έξοδα εδώ απ' ό,τι στη Λογιστική. Ίδιο φίλτρο με εκείνη.
          expenses.inRangeOfProperty(supabase, propertyId, `${new Date().getFullYear()}-01-01`, `${new Date().getFullYear()}-12-31`),
          loanStore.ofProperty(supabase, propertyId, userId),
          // ΤΑ ΑΛΛΑ ΑΚΙΝΗΤΑ. Αυτή η καρτέλα εμφανίζεται (disclosure.ts) ΜΟΝΟ σε
          // χρήστες με 2+ ακίνητα — δηλαδή ακριβώς εκεί όπου ο ανά-ακίνητο φόρος
          // είναι λάθος. Χωρίς τα υπόλοιπα ενοίκια δεν υπάρχει τρόπος να βγει ο
          // σωστός φόρος: η κλίμακα είναι προοδευτική στο σύνολο του Ε1.
          properties.list<{ id: string; target_rent: number | null; rental_mode: string | null }>(supabase, userId, { columns: 'id,target_rent,rental_mode' }),
          supabase.from('rent_config').select('property_id,actual_rent,target_rent').eq('user_id', userId),
        ]);
        // ΤΑ ΔΥΟ ΣΧΗΜΑΤΑ, ΟΠΩΣ ΤΑ ΖΗΤΑ ΤΟ ΕΡΩΤΗΜΑ. Ήταν `any`, δηλαδή κάθε πεδίο
        // παρακάτω («p.sqm», «p.postal_code») ήταν αδιαφανές: ένα λάθος όνομα θα
        // έδινε undefined και η οθόνη θα υποχωρούσε αθόρυβα στις προεπιλογές.
        type PropRow = {
          value: number | null; target_rent: number | null; sqm: number | null;
          prop_type: string | null; name: string | null; postal_code: string | null;
          status_detail: string | null; rental_mode: string | null;
        };
        type RentCfgRow = { actual_rent: number | null; target_rent: number | null };
        if (!alive) return;
        const p = (pr || {}) as Partial<PropRow>; const c = (rc.data || {}) as Partial<RentCfgRow>;
        const rcRows = (allRc.data || []) as { property_id: string; actual_rent: number | null; target_rent: number | null }[];
        const prRows = allPr;
        const rcMap = new Map(rcRows.map(r => [r.property_id, r]));
        setOtherRents(prRows.filter(x => x.id !== propertyId).map(x => {
          const cfg = rcMap.get(x.id);
          const monthly = Number(cfg?.actual_rent) || Number(cfg?.target_rent) || Number(x.target_rent) || 0;
          return { id: x.id, annualRent: monthly * 12, shortTerm: readStatus(x as StatusRow) === 'rent_short' };
        }));
        // Το `amount`/`rate` δεν είναι στήλες: υπολογίζονται από το loan_amount
        // και το rate_type/fixed_rate/euribor/spread (lib/loans/shape.ts).
        const activeLoan = ln.find(l => isActiveLoan(l));
        if (activeLoan) setSavedLoan({ amount: activeLoan.amount, rate: activeLoan.rate, property_value: Number(activeLoan.property_value) || 0, loan_type: activeLoan.loan_type ?? '' });
        setValue(String(propertyValue || p.value || localStorage.getItem(K('value')) || ''));
        setRent(String(c.actual_rent || c.target_rent || p.target_rent || localStorage.getItem(K('rent')) || ''));
        const expSum = Math.round(exp.reduce((s, e) => s + (e.amount || 0), 0));
        setOpex(String(expSum || localStorage.getItem(K('opex')) || ''));
        setOpexYear(expSum > 0 ? new Date().getFullYear() : null);
        setPSqm(p.sqm && p.sqm > 0 ? p.sqm : null);
        setPType(p.prop_type || null);
        setPName(p.name || '');
        // ΩΜΟ `rental_mode` ΕΧΑΝΕ ΤΑ ΠΑΛΙΑ ΑΚΙΝΗΤΑ. Όσα σημάνθηκαν πριν από τη
        // μετάβαση κρατούν `status_detail: 'seasonal'`, που σημαίνει ακριβώς το
        // ίδιο. Το readStatus είναι η μία ανάγνωση που ξέρει και τα δύο.
        setTerm(readStatus(p as StatusRow) === 'rent_short' ? 'short' : 'long');
        const savedR = localStorage.getItem(K('region'));
        if (savedR) setRegion(savedR === 'mykonos_santorini' ? 'mykonos' : savedR); // συμβατότητα με παλαιό κλειδί
        // Δεδομένα κοινότητας για τον ΤΚ του ακινήτου (ανώνυμα· μόνο με ≥5 ακίνητα).
        const postal = String(p.postal_code || '').trim();
        if (postal) {
          try {
            const { data: cs } = await supabase.rpc('community_market_stats');
            // Το αποτέλεσμα της συνάρτησης της βάσης: τα πέντε πεδία που διαβάζονται.
            type CommRow = { postal_code: string | null; sample_count: number | null; median_gross_yield: number | null; p25_yield: number | null; p75_yield: number | null };
            const row = ((cs || []) as CommRow[]).find(r => String(r.postal_code || '').trim() === postal);
            if (alive && row && Number(row.sample_count) >= 5) {
              setCommStat({ postal, count: Number(row.sample_count), median: Number(row.median_gross_yield), p25: Number(row.p25_yield), p75: Number(row.p75_yield) });
            }
          } catch { /* λειτουργεί όταν υπάρχει αρκετό δείγμα */ }
        }
      } catch { /* keep defaults */ }
      // Και ο δείκτης φόρτωσης κάτω από τον ίδιο έλεγχο: αλλιώς η παλιά εκτέλεση
      // τον σβήνει ενώ η νέα φορτώνει ακόμη.
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false };
  }, [propertyId, propertyValue]);

  // Persist ελαφριά (τοπικά) — δεν χρειάζεται νέος πίνακας.
  useEffect(() => { try { localStorage.setItem(K('value'), value); localStorage.setItem(K('rent'), rent); localStorage.setItem(K('opex'), opex); localStorage.setItem(K('region'), region); } catch { } }, [value, rent, opex, region]);

  // Prefill πληρότητας/τιμής βραχυχρόνιας από την αναφορά της περιοχής (επαναφορά όταν
  // αλλάζει η περιοχή· ο χρήστης μπορεί πάντα να διορθώσει).
  const stRef = stRefFor(region);
  // Prefill ADR κουμπωμένο στο μέγεθος & τύπο του ακινήτου (ρεαλιστικό ανά κατηγορία).
  // ΚΑΤΑ ΤΗΝ ΑΠΟΔΟΣΗ, ΟΧΙ ΣΕ EFFECT. Ηταν effect: με αλλαγή περιοχής, τα δύο
  // πεδία της βραχυχρόνιας ζωγραφίζονταν πρώτα με τα νούμερα της ΠΡΟΗΓΟΥΜΕΝΗΣ
  // περιοχής και μετά με τα σωστά. Σε οθόνη που συγκρίνει αποδόσεις, εκείνο το
  // καρέ είναι λάθος απάντηση. Η React το ονομάζει «adjusting state when a prop
  // changes» και το συνιστά ρητά για ακριβώς αυτή την περίπτωση.
  const stKey = `${region}|${pSqm}|${pType}`;
  const [stSeen, setStSeen] = useState<string | null>(null);
  if (!loading && stKey !== stSeen) {
    setStSeen(stKey);
    setStOcc(String(stRef.occupancy));
    setStAdr(String(adrReference(stRef.adr, pSqm, pType)));
  }

  const nVal = parseFloat(value) || 0;
  const nRent = parseFloat(rent) || 0;
  const nOpex = parseFloat(opex) || 0;
  // ΤΕΚΜΗΡΙΩΜΕΝΗ ΠΡΟΕΠΙΛΟΓΗ ΑΝΑΤΙΜΗΣΗΣ. Μετρημένη πάνω στον δείκτη τιμών
  // κατοικιών της Τράπεζας της Ελλάδος, στον ΙΔΙΟ ορίζοντα με τις εναλλακτικές
  // (BENCHMARKS.ret10/ret20) — αλλιώς η σύγκριση δεν είναι σύγκριση. Η μακρά
  // περίοδος εμφανίζεται δίπλα, ώστε ο χρήστης να βλέπει και τις δύο αναγνώσεις.
  const apprRef = useMemo(() => historyPriceCagr(parseInt(cmpYears)), [cmpYears]);
  const apprLong = useMemo(() => historyPriceCagr(20), []);
  // Στα «20 έτη» οι δύο μετρήσεις ταυτίζονται (ο δείκτης δεν πάει πιο πίσω από
  // το 2007), οπότε δεν υπάρχει δεύτερη περίοδος για να αντιπαρατεθεί.
  const longIsOther = apprLong.fromYear !== apprRef.fromYear;
  const apprShown = apprTouched ? appreciation : String(apprRef.pct);
  const nAppr = apprTouched ? (parseFloat(appreciation) || 0) : apprRef.pct;
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
  const isHouse = isHouseType(pType);
  // Μερίδιο νυχτών σε υψηλή περίοδο: νησιά/τουριστικά συγκεντρώνουν τη ζήτηση στο καλοκαίρι.
  const highSeasonShare = (reg?.tags || []).some(t => t === 'island' || t === 'tourist') ? 0.85 : 0.6;
  const st = useMemo(() => shortTermEstimate({
    occupancyPct: occEff, adr: adrEff, cleaningPerStay: parseFloat(stClean) || 0,
    platformFeePct: parseFloat(stFee) || 0, sqm: pSqm, isHouse, highSeasonShare, propertyCount: 1, individual: individualPerson,
    levyChargedToGuest: levyToGuest,
  }), [occEff, adrEff, stClean, stFee, pSqm, isHouse, highSeasonShare, individualPerson, levyToGuest]);

  // Ενοποιημένα μεγέθη: το toggle μακροχρόνια/βραχυχρόνια αλλάζει πραγματικά τα έσοδα & κόστη.
  const grossAnnual = term === 'short' ? st.grossRevenue : nRent * 12;
  // ΤΟ `levyBorne` ΚΑΙ ΟΧΙ ΤΟ `climateLevy`: κόστος του ιδιοκτήτη είναι μόνο
  // όσο από το τέλος δεν το εισέπραξε από τον επισκέπτη. Ιδιο ιδίωμα με το
  // `levyShortfall` της Λογιστικής, ώστε οι δύο οθόνες να λένε το ίδιο.
  const stCosts = term === 'short' ? (st.platformFees + st.cleaning + st.levyBorne + st.municipalTax) : 0;
  const effOpex = nOpex + stCosts;                 // λειτουργικά έξοδα ακινήτου + κόστη βραχυχρόνιας
  const monthlyEquiv = grossAnnual / 12;           // ισοδύναμο «μηνιαίο ενοίκιο» για τη μηχανή

  // ── ΦΟΡΟΣ: ΕΝΑΣ ΦΟΡΟΛΟΓΟΥΜΕΝΟΣ, ΟΧΙ ΕΝΑ ΑΚΙΝΗΤΟ ─────────────────────────────
  // Πριν, ο φόρος υπολογιζόταν πάνω ΜΟΝΟ στα έσοδα αυτού του ακινήτου, με
  // `rentsPaidViaBank: true` καρφωμένο. Δύο λάθη σε δύο γραμμές: (α) η κλίμακα
  // είναι προοδευτική στο σύνολο των ενοικίων του Ε1, οπότε ένα ακίνητο 8.000 €
  // ανάμεσα σε τρία δεν φορολογείται με 15% αλλά συμμετέχει στο 25%· (β) η
  // τεκμαρτή έκπτωση 5% δεν είναι δεδομένη — από 1/1/2026 θέλει τραπεζική
  // είσπραξη. Τώρα ενοποιούμε το χαρτοφυλάκιο (με το ΕΠΕΞΕΡΓΑΣΜΕΝΟ εδώ ενοίκιο
  // για το τρέχον ακίνητο, ώστε τα «τι θα γινόταν αν» να παραμένουν αληθινά) και
  // δείχνουμε το μερίδιο. Νομικό πρόσωπο: δεν ισχύει ενοποίηση φυσικού προσώπου.
  const portfolioTax = useMemo(() => consolidateRentTax([
    { id: propertyId, annualRent: grossAnnual, shortTerm: term === 'short', rentsPaidViaBank: rentsBank },
    ...otherRents.map(o => ({ ...o, rentsPaidViaBank: rentsBank })),
  ]), [propertyId, grossAnnual, term, rentsBank, otherRents]);

  const annualTax = useMemo(() => {
    if (grossAnnual <= 0) return 0;
    if (pro && entity === 'company') {
      // Νομικό πρόσωπο: 22% + φόρος μερίσματος 5% στη διανομή (προεπιλογή: πλήρης διανομή,
      // ώστε ο φόρος να δείχνει τι φτάνει πραγματικά στον ιδιοκτήτη). Τα κόστη βραχυχρόνιας
      // εκπίπτουν ως δαπάνες της επιχείρησης.
      const stB = incomeStatement({ regime: 'business', businessForm: 'company', grossIncome: grossAnnual, itemizedExpenses: effOpex, companyDistribution: 1 });
      return stB.incomeTax + (stB.dividendTax || 0);
    }
    if (pro) {
      // Ατομική επιχείρηση: κλίμακα άρθρου 15 στο καθαρό κέρδος (όχι άρθρο 40).
      return incomeStatement({ regime: 'business', businessForm: 'sole', grossIncome: grossAnnual, itemizedExpenses: effOpex }).incomeTax;
    }
    // Φυσικό πρόσωπο: το μερίδιό του από τον ΕΝΑ προοδευτικό φόρο του χαρτοφυλακίου.
    return taxShareOf(portfolioTax, propertyId);
  }, [grossAnnual, effOpex, pro, entity, portfolioTax, propertyId]);
  // Εμφανίζουμε την ενοποίηση μόνο όταν υπάρχει τι να ενοποιηθεί (2+ ακίνητα με έσοδα).
  const consolidated = !pro && portfolioTax.count > 1;

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
    // ΚΑΜΙΑ ΣΥΓΚΡΙΣΗ ΧΩΡΙΣ ΑΞΙΑ ΑΚΙΝΗΤΟΥ.
    //
    // Ήταν `nVal || 100000`: χωρίς καταχωρημένη αξία, ολόκληρη η σύγκριση
    // επενδύσεων έτρεχε πάνω σε 100.000 € που δεν έδωσε ποτέ ο χρήστης — και
    // το νούμερο διέρρεε ΚΑΙ στην εκτύπωση ΚΑΙ στην εξαγωγή, όπου φαίνεται σαν
    // δικό του στοιχείο. Χωρίς αξία δεν υπάρχει τι να συγκριθεί· ζητάμε την αξία.
    if (!(nVal > 0)) return [];
    return compareInvestments(nVal, parseInt(cmpYears), opts);
  }, [y.netYield, nAppr, nVal, cmpYears]);
  const compMax = Math.max(...compare.map(c => c.futureValue), 1);

  // Προβολή-γραμμή (forward): πώς μεγαλώνει το ίδιο ποσό στο ακίνητο vs στην κορυφαία
  // εναλλακτική, στον επιλεγμένο ορίζοντα — για το «έξυπνο» γράφημα σύγκρισης.
  const projSeries = useMemo(() => {
    const yearsN = parseInt(cmpYears);
    if (!(nVal > 0)) return [];
    const base = nVal;
    const propRate = clampReturn(propertyTotalReturn(y.netYield, nAppr));
    const topAlt = compare.find(c => c.key !== 'property');
    const series = [{ label: 'Ακίνητο', color: 'var(--accent)', points: projectLine(base, propRate, yearsN) }];
    if (topAlt) series.push({ label: benchShort(topAlt.key, topAlt.label), color: 'var(--text-tertiary)', points: projectLine(base, topAlt.annualReturnPct, yearsN) });
    return series;
  }, [cmpYears, nVal, y.netYield, nAppr, compare]);

  // Εργαλεία (pro)
  const comp = useMemo(() => compound(nVal, parseFloat(compRate) || 0, parseInt(compYears), Math.max(0, Math.round(grossAnnual - effOpex - annualTax))), [nVal, compRate, compYears, grossAnnual, effOpex, annualTax]);
  // ΟΙ ΠΑΡΑΔΟΧΕΣ ΕΙΝΑΙ ΠΛΕΟΝ ΠΕΔΙΑ. Διάρκεια δανείου και κόστη πώλησης έρχονται από
  // την οθόνη, όχι από σταθερές μέσα στην κλήση. Το ποσοστό λειτουργικών εξόδων
  // προκύπτει από τα ΠΡΑΓΜΑΤΙΚΑ έξοδα του χρήστη προς τα έσοδα — και εμφανίζεται.
  const nLoanYears = Math.max(1, parseInt(loanYears) || 25);
  const nSellCosts = Math.max(0, parseFloat(sellCosts) || 0);
  const opexPctOfRent = grossAnnual > 0 ? (effOpex / grossAnnual) * 100 : 0;
  const lev: LeverageResult = useMemo(() => leverage({ price: nVal, ltvPct: parseFloat(ltv) || 0, loanRatePct: parseFloat(loanRate) || 0, loanYears: nLoanYears, grossYieldPct: grossYieldExact, opexPctOfRent, interestFreePct: parseFloat(ifree) || 0 }), [nVal, ltv, loanRate, nLoanYears, grossYieldExact, opexPctOfRent, ifree]);

  // Χρηματοοικονομική ανάλυση αγοράς-κατοχής-πώλησης (IRR/NPV/DSCR), με τα ίδια στοιχεία.
  const deal = useMemo(() => dealAnalysis({
    price: nVal, ltvPct: parseFloat(ltv) || 0, loanRatePct: parseFloat(loanRate) || 0, loanYears: nLoanYears,
    grossYieldPct: grossYieldExact, opexPctOfRent,
    interestFreePct: parseFloat(ifree) || 0, holdYears: parseInt(holdYears), rentGrowthPct: parseFloat(rentGrowth) || 0,
    appreciationPct: nAppr, sellCostsPct: nSellCosts, discountRatePct: parseFloat(discountRate) || 0,
  }), [nVal, ltv, loanRate, nLoanYears, grossYieldExact, opexPctOfRent, ifree, holdYears, rentGrowth, nAppr, nSellCosts, discountRate]);

  // Ανάλυση ευαισθησίας (pro): απόδοση ιδίων & συνολική απόδοση σε δυσμενές/βασικό/ευνοϊκό
  // σενάριο (μεταβολή επιτοκίου & ετήσιας ανατίμησης). Δείχνει την αντοχή της επένδυσης.
  const scenarios = useMemo(() => {
    const rows: { key: string; label: string; note: string; totalReturn: number; roe: number; cashFlow: number }[] = [];
    const defs = [
      { key: 'bad', label: 'Δυσμενές', note: 'επιτόκιο +1,50% · ανατίμηση −2,00%', appr: -2, rate: +1.5 },
      { key: 'base', label: 'Βασικό', note: 'τρέχουσες παραδοχές', appr: 0, rate: 0 },
      { key: 'good', label: 'Ευνοϊκό', note: 'επιτόκιο −1,00% · ανατίμηση +2,00%', appr: +2, rate: -1 },
    ];
    for (const d of defs) {
      const l = leverage({ price: nVal, ltvPct: parseFloat(ltv) || 0, loanRatePct: Math.max(0, (parseFloat(loanRate) || 0) + d.rate), loanYears: nLoanYears, grossYieldPct: grossYieldExact, opexPctOfRent, interestFreePct: parseFloat(ifree) || 0 });
      rows.push({ key: d.key, label: d.label, note: d.note, totalReturn: clampReturn(propertyTotalReturn(y.netYield, nAppr + d.appr)), roe: l.cashOnCash, cashFlow: l.cashFlow });
    }
    return rows;
  }, [nVal, ltv, loanRate, nLoanYears, grossYieldExact, y.netYield, nAppr, opexPctOfRent, ifree]);

  // Πληρότητα ισοσκελισμού: το ελάχιστο ποσοστό πληρότητας ώστε η ΒΡΑΧΥΧΡΟΝΙΑ να αποδώσει
  // ό,τι και η μακροχρόνια. Το σταθερό opex (ΕΝΦΙΑ, συντήρηση) βαρύνει ΚΑΙ τους δύο τρόπους
  // εξίσου, οπότε απαλείφεται στη σύγκριση: στόχος = μεικτό ετήσιο ενοίκιο μακροχρόνιας.
  //
  // ΙΔΙΟ ΑΚΙΝΗΤΟ, ΙΔΙΕΣ ΠΑΡΑΔΟΧΕΣ. Εδώ έλειπαν τα `sqm`, `isHouse` και
  // `highSeasonShare` — άρα η μηχανή έπεφτε στις προεπιλογές της (βασικό κλιμάκιο
  // ΤΑΚΚ 8/2 € και 60% νύχτες σε υψηλή περίοδο), ενώ η εκτίμηση από πάνω έτρεχε με
  // τα ΠΡΑΓΜΑΤΙΚΑ στοιχεία του ακινήτου. Για μια βίλα 120 τ.μ. σε νησί αυτό σήμαινε
  // 5,60 € ΤΑΚΚ ανά νύχτα εδώ και 13,35 € δύο κάρτες πιο πάνω: ο χρήστης έβλεπε
  // «Τέλος Ανθεκτικότητας Χ € τον χρόνο» και δίπλα μια πληρότητα ισοσκελισμού που
  // είχε υπολογιστεί σαν να μην πλήρωνε αυτό το τέλος — δηλαδή η βραχυχρόνια
  // έδειχνε ότι «βγαίνει» με χαμηλότερη πληρότητα απ' ό,τι πραγματικά χρειάζεται.
  const breakEvenOcc = useMemo(() => {
    const ltGross = nRent * 12;
    if (ltGross <= 0) return null;
    return breakEvenOccupancy(ltGross, { adr: adrEff, cleaningPerStay: parseFloat(stClean) || 0, platformFeePct: parseFloat(stFee) || 0, sqm: pSqm, isHouse, highSeasonShare, propertyCount: 1, individual: individualPerson });
  }, [nRent, adrEff, stClean, stFee, pSqm, isHouse, highSeasonShare, individualPerson]);

  // ΤΟ ΑΝΕΦΙΚΤΟ ΔΕΝ ΓΡΑΦΕΤΑΙ «100%».
  // Εδώ γραφόταν `Math.min(100, breakEvenOcc)`. Ένα ακίνητο με χαμηλή τιμή ανά
  // νύχτα και υψηλό μακροχρόνιο ενοίκιο χρειάζεται π.χ. 334% πληρότητα για να
  // ισοφαρίσει — δηλαδή ΔΕΝ ισοφαρίζει ποτέ. Η αναφορά όμως τύπωνε «100%», που
  // διαβάζεται ως «βγαίνει, αν το γεμίζεις κάθε βράδυ». Ο ιδιοκτήτης έβγαζε τον
  // ενοικιαστή του με βάση αυτόν τον αριθμό.
  //
  // Η στρογγυλοποίηση δεν είναι ίδια με το ψέμα: κάτω από 100 δείχνουμε το
  // ποσοστό, πάνω από 100 λέμε ΓΙΑΤΙ δεν φτάνει.
  const breakEvenText = (pct: (n: number) => string): string =>
    breakEvenOcc === null ? ''
      : !isFinite(breakEvenOcc) ? 'μη εφικτή με αυτά τα στοιχεία'
      : breakEvenOcc > 100 ? `δεν επιτυγχάνεται ούτε με πλήρη πληρότητα (θα χρειαζόταν ${pct(breakEvenOcc)})`
      : pct(breakEvenOcc);

  // Εξαγωγή επαγγελματικής αναφοράς PDF (μέσω παραθύρου εκτύπωσης· escape όλων των τιμών).
  const printReport = () => {
    const name = pName.trim() || 'Ακίνητο';
    const num2 = (n: number) => fn(n, 2);
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
      R(consolidated ? 'Μερίδιο φόρου εισοδήματος (προοδευτικός στο σύνολο των ακινήτων)' : 'Φόρος εισοδήματος', rSigned(-annualTax)),
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
    const finBlock = canInvest ? reportSection('Χρηματοδότηση και μόχλευση') + `<table><tbody>
        ${R('Ίδια κεφάλαια', rEur(deal.equity))}
        ${R('Δάνειο', rEur(deal.loan))}
        ${R('Ετήσια δόση δανείου', rEur(deal.annualDebtService))}
        ${R('Δείκτης κάλυψης χρέους (DSCR)', Number.isFinite(deal.dscr) ? num2(deal.dscr) : '∞')}
        ${R('Απόδοση ιδίων κεφαλαίων (cash-on-cash)', rPct(lev.cashOnCash))}
        ${R('Ετήσια ταμειακή ροή', rEur(lev.cashFlow))}
        ${R('Εσωτερικός βαθμός απόδοσης (IRR)', Number.isFinite(deal.irrPct) ? rPct(deal.irrPct) : ABSENT)}
        ${R('Καθαρή παρούσα αξία (NPV)', rEur(deal.npv))}
        ${R('Πολλαπλασιαστής ιδίων κεφαλαίων', `${num2(deal.equityMultiple)}×`)}
        ${R('Ορίζοντας κατοχής', `${parseInt(holdYears)} έτη`, 'sub')}
      </tbody></table>` : '';

    // Ανάλυση ευαισθησίας (επαγγελματικό προφίλ).
    const sensBlock = canInvest ? reportSection('Ανάλυση ευαισθησίας') + `<table>
        <thead><tr><th>Σενάριο</th><th class="n">Συνολική απόδοση</th><th class="n">Απόδοση ιδίων</th><th class="n">Ταμειακή ροή</th></tr></thead>
        <tbody>${scenarios.map(sc => `<tr><td>${rEsc(sc.label)} <span class="muted" style="font-size: 11px">${rEsc(sc.note)}</span></td><td class="n">${rEsc(rPct(sc.totalReturn))}</td><td class="n">${rEsc(rPct(sc.roe))}</td><td class="n">${rEsc(rEur(sc.cashFlow))}</td></tr>`).join('')}</tbody>
      </table>` : '';

    // Νεκρό σημείο πληρότητας (βραχυχρόνια).
    const beBlock = (term === 'short' && breakEvenOcc !== null) ? reportSection('Νεκρό σημείο πληρότητας')
        + `<div class="note">Ελάχιστη πληρότητα ώστε η βραχυχρόνια να αποδώσει όσο η μακροχρόνια στην ίδια περιοχή: <strong>${rEsc(breakEvenText(rPct))}</strong>. Εκτιμώμενη πληρότητα εργαλείου: ${rPct(occEff)} · τιμή/νύχτα ${rEsc(rEur(adrEff))}.</div>` : '';

    // Παραδοχές & μεθοδολογία.
    const asmpItems = [
      `Αξία ακινήτου: ${rEur(nVal)} (καταχώρηση ή εκτίμηση χρήστη)`,
      term === 'short' ? `Έσοδα: εκτιμώμενη πληρότητα ${rPct(occEff)} × τιμή/νύχτα ${rEur(adrEff)}` : `Έσοδα: μηνιαίο ενοίκιο ${rEur(nRent)}`,
      apprTouched
        ? `Ετήσια ανατίμηση: ${rPct(nAppr)}· υπόθεση του χρήστη (η τεκμηριωμένη τιμή είναι ${rPct(apprRef.pct)})`
        : `Ετήσια ανατίμηση: ${rPct(nAppr)}· δείκτης τιμών κατοικιών Τράπεζας της Ελλάδος, ${apprRef.fromYear} ως ${apprRef.toYear}`,
      `Φορολογικό καθεστώς: ${regimeLabel}`,
      `Είσπραξη ενοικίων μέσω τραπέζης: ${rentsBank ? 'ναι, ισχύει η τεκμαρτή έκπτωση 5%' : 'όχι, φόρος στο 100% του ενοικίου'}`,
      // Η ΔΕΥΤΕΡΗ ΠΑΡΑΔΟΧΗ ΤΑΞΙΔΕΥΕΙ ΚΙ ΑΥΤΗ. Οποιος διαβάσει την αναφορά χωρίς
      // να έχει την οθόνη μπροστά του πρέπει να ξέρει ποιο σενάριο διαβάζει.
      ...(term === 'short'
        ? [`Τέλος ανθεκτικότητας: ${levyToGuest ? 'χρεώνεται στον επισκέπτη, δεν βαραίνει τα καθαρά' : 'δεν χρεώνεται στον επισκέπτη, βγαίνει από την τσέπη του ιδιοκτήτη'}`]
        : []),
      ...(consolidated ? [`Φόρος: μερίδιο από τον προοδευτικό φόρο ${portfolioTax.count} ακινήτων (σύνολο ενοικίων ${rEur(portfolioTax.totalAnnualRent)}, συνολικός φόρος ${rEur(portfolioTax.totalTax)})`] : []),
      `Λειτουργικά έξοδα: ${rPct(opexPctOfRent)} των εσόδων (${rEur(effOpex)})`,
      ...(canInvest ? [`Χρηματοδότηση: δάνειο ${rPct(parseFloat(ltv) || 0)} της αξίας, επιτόκιο ${rPct(parseFloat(loanRate) || 0)}, διάρκεια ${nLoanYears} έτη, ορίζοντας κατοχής ${parseInt(holdYears)} έτη, κόστη πώλησης ${rPct(nSellCosts)} (πλευρά πωλητή)`] : []),
      `Δεδομένα αναφοράς αγοράς: ${MARKET_DATA_ASOF}`,
    ].map(t => `<li>${rEsc(t)}</li>`).join('');

    const disclaimer = `Η παρούσα αναφορά αποτελεί ενημερωτικό εργαλείο εκτίμησης. Οι υπολογισμοί βασίζονται στα στοιχεία που καταχώρησες και σε ενδεικτικά δημόσια δεδομένα αγοράς και δεν συνιστούν επενδυτική, φορολογική ή νομική συμβουλή. Τα πραγματικά μεγέθη διαφέρουν ανά ακίνητο, όροφο, κατάσταση, θέση και συνθήκες αγοράς. Οι αποδόσεις των εναλλακτικών επενδύσεων είναι ιστορικές και δεν εγγυώνται μελλοντικά αποτελέσματα. Πριν από κάθε απόφαση, επιβεβαίωσε τα στοιχεία και συμβουλέψου εξειδικευμένο λογιστή ή σύμβουλο ακινήτων. Δεδομένα αγοράς: ${MARKET_DATA_ASOF}.`;

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
      + reportSection('Ανάλυση εσόδων και εξόδων (ετήσια)') + `<table><tbody>${incRows}</tbody></table>`
      + reportSection('Δείκτες απόδοσης') + `<table><tbody>${yieldRows}</tbody></table>`
      + reportSection('Σύγκριση με την αγορά') + `<table><tbody>${regionRows.map(r => R(r[0], r[1])).join('')}</tbody></table>`
      + finBlock
      + sensBlock
      + beBlock
      + reportSection(`Σύγκριση με εναλλακτικές επενδύσεις (${cmpYears} έτη, ονομαστικές αποδόσεις)`)
        + `<table><tbody>${compare.map(c => R(c.label, `${rEur(c.futureValue)} · ${rPct(c.annualReturnPct)} ετησίως`)).join('')}</tbody></table>`
      + reportSection('Παραδοχές και μεθοδολογία')
        + `<ul style="margin:4px 0 0;padding-left:18px;font-size:12px;color:${INK_MUTED};line-height:1.7">${asmpItems}</ul>`
        + `<div class="note" style="font-size: 11px;color:${INK_FAINT};margin-top:10px">Πηγές: ${MARKET_SOURCES.map(s => rEsc(s.label)).join(' · ')}</div>`
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
      const num2 = (n: number) => fn(n, 2);
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
        apprTouched
          ? `Ετήσια ανατίμηση: ${pPct(nAppr)}· υπόθεση του χρήστη (η τεκμηριωμένη τιμή είναι ${pPct(apprRef.pct)})`
          : `Ετήσια ανατίμηση: ${pPct(nAppr)}· δείκτης τιμών κατοικιών Τράπεζας της Ελλάδος, ${apprRef.fromYear} ως ${apprRef.toYear}`,
        `Φορολογικό καθεστώς: ${regimeLabel}`,
        `Είσπραξη ενοικίων μέσω τραπέζης: ${rentsBank ? 'ναι, ισχύει η τεκμαρτή έκπτωση 5%' : 'όχι, φόρος στο 100% του ενοικίου'}`,
      // Η ΔΕΥΤΕΡΗ ΠΑΡΑΔΟΧΗ ΤΑΞΙΔΕΥΕΙ ΚΙ ΑΥΤΗ. Οποιος διαβάσει την αναφορά χωρίς
      // να έχει την οθόνη μπροστά του πρέπει να ξέρει ποιο σενάριο διαβάζει.
      ...(term === 'short'
        ? [`Τέλος ανθεκτικότητας: ${levyToGuest ? 'χρεώνεται στον επισκέπτη, δεν βαραίνει τα καθαρά' : 'δεν χρεώνεται στον επισκέπτη, βγαίνει από την τσέπη του ιδιοκτήτη'}`]
        : []),
        ...(consolidated ? [`Φόρος: μερίδιο από τον προοδευτικό φόρο ${portfolioTax.count} ακινήτων (σύνολο ενοικίων ${pEur(portfolioTax.totalAnnualRent)}, συνολικός φόρος ${pEur(portfolioTax.totalTax)})`] : []),
        `Λειτουργικά έξοδα: ${pPct(opexPctOfRent)} των εσόδων (${pEur(effOpex)})`,
        ...(canInvest ? [`Χρηματοδότηση: δάνειο ${pPct(parseFloat(ltv) || 0)} της αξίας, επιτόκιο ${pPct(parseFloat(loanRate) || 0)}, διάρκεια ${nLoanYears} έτη, ορίζοντας κατοχής ${parseInt(holdYears)} έτη, κόστη πώλησης ${pPct(nSellCosts)} (πλευρά πωλητή)`] : []),
        `Δεδομένα αναφοράς αγοράς: ${MARKET_DATA_ASOF}`,
      ];

      const disclaimer = `Η παρούσα αναφορά αποτελεί ενημερωτικό εργαλείο εκτίμησης. Οι υπολογισμοί βασίζονται στα στοιχεία που καταχώρησες και σε ενδεικτικά δημόσια δεδομένα αγοράς και δεν συνιστούν επενδυτική, φορολογική ή νομική συμβουλή. Τα πραγματικά μεγέθη διαφέρουν ανά ακίνητο, όροφο, κατάσταση, θέση και συνθήκες αγοράς. Οι αποδόσεις των εναλλακτικών επενδύσεων είναι ιστορικές και δεν εγγυώνται μελλοντικά αποτελέσματα. Πριν από κάθε απόφαση, επιβεβαίωσε τα στοιχεία και συμβουλέψου εξειδικευμένο λογιστή ή σύμβουλο ακινήτων. Δεδομένα αγοράς: ${MARKET_DATA_ASOF}.`;

      const sections: PdfSection[] = [
        { type: 'kpis', title: 'Σύνοψη', items: [
          { label: 'Αξία ακινήτου', value: pEur(nVal) },
          { label: term === 'short' ? 'Ετήσια έσοδα' : 'Μηνιαίο ενοίκιο', value: pEur(term === 'short' ? grossAnnual : nRent) },
          { label: 'Καθαρή απόδοση', value: pPct(y.netYield) },
          { label: 'Βαθμός απόδοσης', value: `${grade.grade} · ${grade.score}/100` },
        ] },
        { type: 'rows', title: 'Ανάλυση εσόδων και εξόδων (ετήσια)', rows: [
          { label: 'Ακαθάριστα έσοδα (ετήσια)', value: pEur(grossAnnual) },
          { label: 'Λειτουργικά έξοδα ακινήτου', value: pSigned(-nOpex) },
          ...(term === 'short' && stCosts > 0 ? [{ label: 'Κόστη βραχυχρόνιας (πλατφόρμα, καθαρισμός, ΤΑΚΚ, τέλος παρεπιδημούντων)', value: pSigned(-stCosts) }] : []),
          { label: 'Καθαρά λειτουργικά έσοδα (NOI)', value: pEur(noi), kind: 'sub' },
          { label: consolidated ? 'Μερίδιο φόρου εισοδήματος (προοδευτικός στο σύνολο των ακινήτων)' : 'Φόρος εισοδήματος', value: pSigned(-annualTax) },
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

      if (canInvest) {
        sections.push({ type: 'rows', title: 'Χρηματοδότηση και μόχλευση', rows: [
          { label: 'Ίδια κεφάλαια', value: pEur(deal.equity) },
          { label: 'Δάνειο', value: pEur(deal.loan) },
          { label: 'Ετήσια δόση δανείου', value: pEur(deal.annualDebtService) },
          { label: 'Δείκτης κάλυψης χρέους (DSCR)', value: Number.isFinite(deal.dscr) ? num2(deal.dscr) : '∞' },
          { label: 'Απόδοση ιδίων κεφαλαίων (cash-on-cash)', value: pPct(lev.cashOnCash) },
          { label: 'Ετήσια ταμειακή ροή', value: pEur(lev.cashFlow) },
          { label: 'Εσωτερικός βαθμός απόδοσης (IRR)', value: Number.isFinite(deal.irrPct) ? pPct(deal.irrPct) : ABSENT },
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
          text: `Ελάχιστη πληρότητα ώστε η βραχυχρόνια να αποδώσει όσο η μακροχρόνια στην ίδια περιοχή: ${breakEvenText(pPct)}. Εκτιμώμενη πληρότητα εργαλείου: ${pPct(occEff)} · τιμή/νύχτα ${pEur(adrEff)}.` });
      }

      sections.push({ type: 'rows', title: `Σύγκριση με εναλλακτικές επενδύσεις (${cmpYears} έτη, ονομαστικές αποδόσεις)`,
        rows: compare.map(c => ({ label: c.label, value: `${pEur(c.futureValue)} · ${pPct(c.annualReturnPct)} ετησίως` })) });
      sections.push({ type: 'note', title: 'Παραδοχές και μεθοδολογία', text: asmpItems.map(t => `· ${t}`).join('\n') });
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
    } catch { notifyError(failed(MSG.pdf)); }
    finally { setGenOfficial(false); }
  };

  // Σκελετός αντί για δείκτη: το σχήμα της καρτέλας είναι γνωστό εκ των προτέρων
  // (σειρά μετρικών + κάρτες ανάλυσης), οπότε το περιεχόμενο δεν «πετάγεται» όταν φορτώσει.
  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Ο ΣΚΕΛΕΤΟΣ ΚΡΑΤΑ ΤΟ ΟΝΟΜΑ ΤΗΣ ΟΘΟΝΗΣ. Οσο φορτώνει, ο αναγνώστης οθόνης
          πρέπει να μπορεί να πει πού βρίσκεται· η φορτωμένη οθόνη το γράφει
          ορατά, με το κοινό `PageTitle`, που είναι κι αυτό `h1`. Κρυφό ΟΠΤΙΚΑ
          μόνο εδώ, ώστε ο σκελετός να μην αλλάξει ούτε ένα εικονοστοιχείο. */}
      <h1 className="sr-only">{navLabel('roi')}</h1>
      <SkeletonKPIs n={4} />
      <div {...fixedCols(2, 12, 'stretch')}>{[0, 1].map(i => <Skeleton key={i} h={140} r={14} />)}</div>
    </div>
  );

  const regimeLabel = pro ? (entity === 'company' ? 'Επιχείρηση · Νομικό πρόσωπο' : 'Επιχείρηση · Φυσικό πρόσωπο') : 'Ιδιώτης';
  const empty = term === 'short' ? (nVal <= 0 || grossAnnual <= 0) : (nVal <= 0 || nRent <= 0);
  const inputsOpen = inputsPinned ?? empty;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ═══ Η ΚΕΦΑΛΙΔΑ ΗΤΑΝ ΧΕΙΡΟΠΟΙΗΤΗ, ΚΑΙ ΗΤΑΝ Η ΠΕΜΠΤΗ ══════════════════════
          Τίτλος h2 στα 20, υπότιτλος στα 13, δικό της flex με τις ενέργειες
          δεξιά: δηλαδή το PageTitle, γραμμένο ξανά με άλλα νούμερα. Δεκαέξι
          καρτέλες χρησιμοποιούν το κοινό· αυτή έγραφε δικό της, οπότε δεν πήρε
          τίποτα από όσα διορθώθηκαν εκεί.

          ΤΙ ΚΟΣΤΙΖΕ, ΜΕΤΡΗΜΕΝΟ ΣΕ Galaxy A, 360×800. Τα δύο κουμπιά είχαν 110
          και 212 εικονοστοιχεία, δηλαδή το ένα σχεδόν διπλάσιο από το άλλο, ενώ
          το σχόλιο από πάνω τους έλεγε «ίδιο σχήμα, ίδιο μέγεθος». Το κοινό
          στοιχείο τα βάζει σε πλέγμα δύο στηλών στο τηλέφωνο, οπότε γίνονται
          πράγματι ίσα. Και ο τίτλος πέφτει στα 22 σε στενή οθόνη αντί να μένει
          καρφωμένος, όπως σε κάθε άλλη καρτέλα.

          ΔΥΟ ΚΟΥΜΠΙΑ, Η ΔΙΑΦΟΡΑ ΜΟΝΟ ΣΕ TOOLTIP. Έλεγαν «Αναφορά PDF» και
          «Επίσημο PDF», δηλαδή ο χρήστης έπρεπε να μαντέψει ποιο θέλει και σε
          κινητό δεν υπήρχε καν tooltip να τον βοηθήσει. Είναι όντως δύο
          διαφορετικά παραδοτέα: το ένα το τυπώνεις για σένα, το άλλο φέρει
          αριθμό εγγράφου που μπορεί να επαληθεύσει τρίτος.

          ΤΟ ΟΝΟΜΑ ΕΡΧΕΤΑΙ ΑΠΟ ΤΟ ΜΕΝΟΥ. Το `lib/nav/labels.ts` γράφτηκε ακριβώς
          για αυτό το σφάλμα και ονομάζει ΑΥΤΗ την περίπτωση στην κεφαλίδα του:
          ο κωδικός `roi` λεγόταν «Απόδοση» στο μενού και «Αποδόσεις» εδώ. */}
      <PageTitle
        title={navLabel('roi')}
        sub={`${regimeLabel} · η απόδοση του ακινήτου σου και σύγκριση με την αγορά.`}
        right={empty ? undefined : (<>
          <button onClick={printReport} className="acc-toggle" style={{ height: T.h.md, padding: '0 14px', borderRadius: 10, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 13, fontFamily: SANS, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <ArrowUpRight size={14} /> Για μένα
          </button>
          <button onClick={officialReport} disabled={genOfficial} className="acc-toggle" title="Επίσημο true-PDF με αριθμό εγγράφου και QR επαλήθευσης· κατάλληλο για τράπεζες, ΔΟΥ και φορείς" style={{ height: T.h.md, padding: '0 14px', borderRadius: 10, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 13, fontFamily: SANS, fontWeight: 600, cursor: genOfficial ? 'wait' : 'pointer', opacity: genOfficial ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <ShieldCheck size={14} /> {genOfficial ? 'Δημιουργία…' : 'Για τράπεζα ή λογιστή'}
          </button>
        </>)}
      />

      {/* ═══ ΟΚΤΩ ΠΕΔΙΑ ΑΝΑΜΕΣΑ ΣΤΟΝ ΧΡΗΣΤΗ ΚΑΙ ΣΤΟ ΑΠΟΤΕΛΕΣΜΑ ══════════════════
          Η κάρτα των στοιχείων ήταν πάντα ανοιχτή: τέσσερα πεδία, μια γραμμή
          εκτίμησης, άλλα τέσσερα πεδία στη βραχυχρόνια και μετά δύο παράγραφοι
          φορολογίας. Ο χρήστης που άνοιγε τις Αποδόσεις για να δει την απόδοσή
          του κατέβαινε πρώτα ολόκληρη φόρμα που είχε ήδη συμπληρώσει.

          Τα πεδία είναι ρύθμιση, όχι περιεχόμενο. Μένουν στην κορυφή γιατί εκεί
          ανήκουν, αλλά μαζεμένα σε μία γραμμή που λέει τι ισχύει — και ανοίγουν
          με ένα κλικ. Όταν λείπουν στοιχεία, ανοίγουν μόνα τους: τότε ΕΙΝΑΙ το
          περιεχόμενο. */}
      <div style={card}>
        <button onClick={() => setInputsPinned(!inputsOpen)} aria-expanded={inputsOpen} className="acc-toggle"
          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', flexShrink: 0 }}><Percent size={15} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={titleStyle}>Στοιχεία υπολογισμού</p>
            {/* ΟΤΑΝ ΕΙΝΑΙ ΟΔΗΓΙΑ, ΔΙΑΒΑΖΕΤΑΙ ΟΛΟΚΛΗΡΗ. Η ίδια γραμμή έχει δύο ρόλους:
                άδεια λέει ΤΙ ΝΑ ΣΥΜΠΛΗΡΩΣΕΙΣ, γεμάτη ανακεφαλαιώνει. Με μία κοινή
                αποκοπή σε μία γραμμή, στα 390 εικονοστοιχεία έγραφε «Συμπλήρωσε
                αξία ακινήτου και μηνιαίο μίσθ…» — έκοβε ακριβώς την οδηγία. */}
            <p style={{ ...subStyle, ...(empty ? {} : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }) }}>
              {empty
                ? (term === 'short' ? 'Συμπλήρωσε αξία, πληρότητα και τιμή ανά νύχτα' : 'Συμπλήρωσε αξία ακινήτου και μηνιαίο μίσθωμα')
                : [
                    `Αξία ${fe(nVal)}`,
                    term === 'short' ? `${fp(Number(stOcc) || 0)} πληρότητα` : `${fe(Number(rent) || 0)} τον μήνα`,
                    term === 'short' ? `${fe(Number(stAdr) || 0)} ανά νύχτα` : null,
                    `${fe(Number(opex) || 0)} έξοδα τον χρόνο`,
                    reg?.label || null,
                  ].filter(Boolean).join(' · ')}
            </p>
          </div>
          <ChevronRight size={17} style={{ color: 'var(--text-tertiary)', flexShrink: 0, transform: inputsOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.18s' }} />
        </button>
        {inputsOpen && (<div style={{ marginTop: 16 }}>
        <div {...g4}>
          <NumberInput label="Αξία ακινήτου" value={value} onChange={setValue} suffix="€" step={5000} />
          {/* Η ΜΟΝΑΔΑ ΧΡΟΝΟΥ ΔΕΝ ΦΕΥΓΕΙ ΑΠΟ ΤΗΝ ΕΤΙΚΕΤΑ ΟΤΑΝ ΑΛΛΑΖΕΙ Ο ΤΡΟΠΟΣ.
              Σε βραχυχρόνια η ετικέτα γινόταν σκέτο «Ενοίκιο μακροχρόνιας» και
              καθόταν δίπλα στα «Ετήσια έξοδα»: δύο πεδία, ένα με μονάδα και ένα
              χωρίς, ενώ το ποσό είναι μηνιαίο και πολλαπλασιάζεται επί δώδεκα. */}
          <NumberInput label={term === 'short' ? 'Μηνιαίο ενοίκιο μακροχρόνιας' : 'Μηνιαίο ενοίκιο'} value={rent} onChange={setRent} suffix="€" step={50} />
          <NumberInput label="Ετήσια έξοδα" value={opex} onChange={v => { setOpex(v); setOpexYear(null); }} suffix="€" step={100} />
          <CustomSelect label="Περιοχή" value={region} onChange={setRegion} options={REGIONS.map((r, i) => ({ value: r.key, label: r.label, header: r.region !== REGIONS[i - 1]?.region ? r.region : undefined }))} />
        </div>
        {opexYear !== null && (
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '10px 0 0', fontFamily: SANS, lineHeight: 1.55 }}>
            Τα «Ετήσια έξοδα» προσυμπληρώθηκαν με όσα έξοδα του {opexYear} έχεις καταχωρήσει. Η χρονιά δεν έχει κλείσει, οπότε το ετήσιο ποσό μπορεί να είναι μεγαλύτερο.
          </p>
        )}
        {showEstValue && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13, fontFamily: SANS, color: 'var(--text-secondary)' }}>
            <span>Ενδεικτική εκτίμηση αξίας για την περιοχή{pSqm ? ` (${pSqm} τ.μ.)` : ''}: <strong style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fe(estValue)}</strong></span>
            <TermInfo text={`Ενδεικτικός υπολογισμός: μέση τιμή ανά τετραγωνικό μέτρο στην περιοχή, επί τα τ.μ. και τον συντελεστή τύπου του ακινήτου. Δεν υποκαθιστά την αντικειμενική αξία ούτε την εκτίμηση πιστοποιημένου εκτιμητή. Χρησιμοποίησέ την ως αφετηρία και προσάρμοσέ την στην πραγματική κατάσταση, τον όροφο και τη θέση του ακινήτου.`} />
            <button onClick={() => setValue(String(estValue))} className="acc-toggle" style={{ height: 28, padding: '0 12px', borderRadius: 10, border: '1px solid var(--border-accent)', background: 'var(--accent-dim)', color: 'var(--accent)', fontSize: 12, fontFamily: SANS, fontWeight: 600, cursor: 'pointer' }}>Χρήση</button>
          </div>
        )}
        {term === 'short' && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', fontFamily: SANS }}>Παράμετροι βραχυχρόνιας</span>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: SANS }}>· προσυμπληρωμένες από τα δεδομένα αναφοράς της περιοχής{pSqm ? `, για ${pSqm} τ.μ.` : ''}</span>
            </div>
            <div {...g4}>
              <NumberInput label="Ετήσια πληρότητα" value={stOcc} onChange={setStOcc} suffix="%" max={100} labelInfo={<TermInfo text={G.occupancy} />} />
              <NumberInput label="Μέση τιμή ανά νύχτα" value={stAdr} onChange={setStAdr} suffix="€" step={5} labelInfo={<TermInfo text={G.adr} />} />
              <NumberInput label="Καθαρισμός ανά διαμονή" value={stClean} onChange={setStClean} suffix="€" step={5} />
              <NumberInput label="Προμήθεια πλατφόρμας" value={stFee} onChange={setStFee} suffix="%" max={100} step={0.5} labelInfo={<TermInfo text={G.platform_fee} />} />
            </div>
            {!empty && y.grossYield > MAX_ST_GROSS_YIELD_WARN && (
              <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', fontFamily: SANS, lineHeight: 1.5 }}>
                  Η μεικτή απόδοση προκύπτει <strong style={{ color: 'var(--text-primary)' }}>{fp(y.grossYield)}</strong>, ασυνήθιστα υψηλή. Σε ισχυρές τουριστικές αγορές μπορεί να είναι πραγματική· διαφορετικά έλεγξε την αξία και τη μέση τιμή ανά νύχτα.
                </p>
              </div>
            )}
          </div>
        )}
        </div>)}
        {/* Η άδεια κατάσταση έλεγε με εικονίδιο και τίτλο ό,τι λέει ήδη ο
            υπότιτλος της ενότητας από πάνω, δύο εκατοστά πιο ψηλά. */}
      </div>

      {!empty && (<>
        {/* KPIs */}
        <div {...g4box}>
          <KPI label="Μεικτή απόδοση" value={fp(y.grossYield)} sub={`${fe(y.annualRent)} έσοδα τον χρόνο`} info={G.gross_yield} />
          <KPI label="Καθαρή απόδοση" value={fp(y.netYield)} sub="μετά τα έξοδα" info={G.net_yield} />
          <KPI label="Απόδοση μετά τον φόρο" value={fp(y.netYieldAfterTax)}
            sub={consolidated ? `μερίδιο φόρου ${fe(annualTax)} τον χρόνο` : `φόρος ${fe(annualTax)} τον χρόνο`}
            accent info={consolidated ? `${G.after_tax_yield} ${CONSOLIDATION_NOTE}` : G.after_tax_yield} />
          {canInvest
            ? <KPI label="Απόδοση ιδίων κεφαλαίων" value={fp(lev.cashOnCash)} sub={lev.cashOnCash >= 0 ? 'θετική μόχλευση' : (lev.positiveCarry ? 'θετική μόχλευση, αρνητική ροή' : 'αρνητική μόχλευση')} info={G.cash_on_cash} />
            : term === 'short'
              ? <KPI label="Τυπική βραχυχρόνια" value={fp(stRef.grossYield)} sub={reg?.region || 'Ελλάδα'} info={G.region_short_ref} />
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
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-primary)', fontFamily: SANS, fontWeight: 600 }}>{verdictLabel}</p>
            {reg && <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-tertiary)', fontFamily: SANS, lineHeight: 1.5 }}>{reg.note}</p>}
          </div>
          {commStat && (
            <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--text-primary)', fontFamily: SANS, fontWeight: 600, display: 'flex', alignItems: 'center' }}>Δεδομένα κοινότητας PROPERWISE<TermInfo text={G.community} /></p>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-tertiary)', fontFamily: SANS, lineHeight: 1.5 }}>
                Ταχυδρομικός κώδικας {commStat.postal}: διάμεση μεικτή απόδοση <strong style={{ color: 'var(--text-secondary)' }}>{fp(commStat.median)}</strong> (εύρος {fp(commStat.p25)} έως {fp(commStat.p75)}), από {commStat.count} πραγματικά ακίνητα χρηστών. Ανώνυμα και συγκεντρωτικά.
              </p>
            </div>
          )}
          {term === 'short' && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)', fontFamily: SANS, lineHeight: 1.55 }}>
              {/* ΟΙ ΔΥΟ ΑΠΟΔΟΣΕΙΣ ΗΤΑΝ ΗΔΗ ΣΤΙΣ ΜΠΑΡΕΣ ΑΠΟ ΠΑΝΩ. Η παράγραφος τις
                  ξαναέγραφε («μεικτή 8,00% έναντι 5,00% στη μακροχρόνια»), δηλαδή
                  έλεγε με λέξεις ό,τι μόλις είχε δείξει με σχήμα. Μένει ό,τι οι
                  μπάρες ΔΕΝ λένε: πληρότητα, τιμή νύχτας και πόσο τρώνε τα έξοδα. */}
              {stExact
                ? <>Δεδομένα αναφοράς περιοχής: πληρότητα περίπου {stExact.occupancy}%, μέση τιμή {fe(stExact.adr)} ανά νύχτα.{stExact.redZone ? ' Κόκκινη ζώνη Αριθμού Μητρώου Ακινήτων: δεν επιτρέπονται νέες εγγραφές.' : ''} </>
                : <>Στη βραχυχρόνια τα μεικτά έσοδα είναι συνήθως υψηλότερα, με έντονη όμως εποχικότητα. </>}
              {/* Η ΠΑΡΕΝΘΕΣΗ ΜΕ ΤΑ ΤΕΣΣΕΡΑ ΠΑΡΑΔΕΙΓΜΑΤΑ ΕΦΥΓΕ. Τρεις σειρές για μια
                  πρόταση· τα «καθαρισμοί, διαχείριση, τέλος ανθεκτικότητας,
                  κενές νύχτες» δεν αλλάζουν τίποτα στην απόφαση: ο αριθμός είναι
                  το 40 έως 60%. */}
              Η καθαρή απόδοση είναι σημαντικά χαμηλότερη από τη μεικτή: τα λειτουργικά έξοδα απορροφούν 40 έως 60% των εσόδων.
            </div>
          )}
        </Section>

        {/* 2) Ιστορική διαδρομή */}
        {/* ═══ ΤΕΣΣΕΡΙΣ ΕΠΙΛΟΓΕΙΣ ΟΡΙΖΟΝΤΑ ΣΕ ΜΙΑ ΟΘΟΝΗ, ΚΑΝΕΝΑΣ ΜΕ ΟΝΟΜΑ ══════
            Η καρτέλα έχει τέσσερα χειριστήρια ετών: το παράθυρο του ιστορικού,
            τον ορίζοντα της σύγκρισης, τον ορίζοντα του ανατοκισμού και τον
            ορίζοντα κατοχής. Τα δύο τελευταία έχουν ετικέτα· τα δύο πρώτα
            κάθονταν γυμνά και το ΜΟΝΟ ίχνος του τι κυβερνούν ήταν η τιμή τους
            ξαναγραμμένη μέσα στον τίτλο («Ιστορική διαδρομή 10ετίας», «πραγματικές
            αποδόσεις 10ετίας»), δέκα εικονοστοιχεία πιο πάνω από τον ίδιο τον
            διακόπτη. Δηλαδή ο τίτλος έκανε τη δουλειά της ετικέτας, λέγοντας
            δύο φορές το ίδιο νούμερο.

            Η ετικέτα του πρώτου διαβάζεται μαζί με την επιλογή του, «Τελευταία
            10 έτη»: μετρήθηκε ότι το «Παράθυρο γραφήματος» έσπαγε σε δύο σειρές
            στα 320 και στα 375 εικονοστοιχεία.

            Τώρα κάθε επιλογέας λέει ΤΙ ΚΥΒΕΡΝΑ, με τη δική του ετικέτα· ο
            τίτλος λέει τι είναι η ενότητα. Η τιμή γράφεται μία φορά, στον
            διακόπτη. */}
        <Section icon={<TrendingUp size={15} />} title="Ιστορική διαδρομή" sub="Πώς θα κινούνταν η αξία ενός ακινήτου όπως το δικό σου (δείκτης Τράπεζας της Ελλάδος)" info={G.hist_index}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <label style={{ ...fieldLabelStyle, margin: 0 }}>Τελευταία</label>
            <SegmentControl ariaLabel="Ορίζοντας ιστορικής διαδρομής" value={histYears} onChange={v => setHistYears(v as typeof histYears)} options={yearOpts(10, 20)} />
          </div>
          <AreaChart points={hist} />
          {/* ═══ ΛΕΖΑΝΤΑ ΜΟΝΟ ΓΙΑ ΣΗΜΑΔΙΑ ΠΟΥ ΥΠΑΡΧΟΥΝ ═══════════════════════
              Ηταν σταθερή τριάδα «Σήμερα · Κορυφή 2008 · Πυθμένας 2017». Στην
              προβολή δεκαετίας η καμπύλη ξεκινά το 2016, οπότε το `marks` του
              γραφήματος δεν βρίσκει το 2008 και δεν ζωγραφίζει κουκκίδα: η
              λεζάντα εξηγούσε σημάδι που δεν υπήρχε. Οι χρονιές έρχονται τώρα
              από τα HISTORY_ANCHORS, όχι γραμμένες στο χέρι δίπλα τους. */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
            {([['Σήμερα', 'var(--accent)'] as [string, string]]
              .concat(hist.some(p => p.year === HISTORY_ANCHORS.peakYear) ? [[`Κορυφή ${HISTORY_ANCHORS.peakYear}`, 'var(--text-tertiary)']] : [])
              .concat(hist.some(p => p.year === HISTORY_ANCHORS.troughYear) ? [[`Πυθμένας ${HISTORY_ANCHORS.troughYear}`, 'var(--text-tertiary)']] : [])
            ).map(([l, c]) => (
              <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-tertiary)', fontFamily: SANS }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />{l}</span>
            ))}
          </div>
          <div className="po-fig-card" tabIndex={0} style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12 }}>
            <div><p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.4px', fontFamily: SANS }}>{hist[0]?.year}</p><p className="po-fig" style={{ fontSize: 15, fontWeight: 700, margin: '2px 0 0', fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>{fe(histStart)}</p></div>
            <div><p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.4px', fontFamily: SANS }}>Σήμερα</p><p className="po-fig" data-tone="accent" style={{ fontSize: 15, fontWeight: 700, margin: '2px 0 0', fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>{fe(histEnd)}</p></div>
            <div><p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.4px', fontFamily: SANS }}>Μεταβολή</p><p className="po-fig" style={{ fontSize: 15, fontWeight: 700, margin: '2px 0 0', fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>{histStart > 0 ? `${histEnd >= histStart ? '+' : ''}${fp(((histEnd - histStart) / histStart) * 100)}` : ABSENT_SHORT}</p></div>
          </div>
          {/* Η μακρά ιστορία λέγεται μόνο όταν φαίνεται. Κάτω από γράφημα που
              ξεκινά το 2016, μια πρόταση για την κορυφή του 2008 ζητά από τον
              αναγνώστη να πιστέψει κάτι που δεν μπορεί να δει. */}
          {/* Η ΕΠΙΦΥΛΑΞΗ ΛΕΓΕΤΑΙ ΜΙΑ ΦΟΡΑ, ΣΤΗΝ ΚΑΡΤΑ ΤΩΝ ΠΗΓΩΝ. Ήταν γραμμένη
              εδώ με έντονα, στη σύγκριση εναλλακτικών και μέσα στο
              MARKET_DISCLAIMER: τρία αντίγραφα της ίδιας πρότασης σε μία
              καρτέλα. Όσο πιο συχνά γράφεται μια επιφύλαξη, τόσο λιγότερο
              διαβάζεται. Εδώ μένει το ιστορικό, που είναι μέτρηση. */}
          {/* ΜΑΚΡΙΑ ΓΡΑΜΜΗ ΘΕΛΕΙ ΑΕΡΑ. Στα 20 έτη η υποσημείωση παίρνει και τις
              δύο προτάσεις (κύκλος 2008 ώς 2017 συν πρόσφατα), δηλαδή 115
              χαρακτήρες ανά γραμμή με ύψος γραμμής 1,5: το μάτι χάνει τη σειρά
              γυρίζοντας αριστερά. Ο σαρωτής το έπιασε σε δέκα οθόνες, μόλις ο
              κοινός επιλογέας ετών του επέτρεψε να φτάσει ώς εκείνη την
              κατάσταση — με τον προηγούμενο, χειρόγραφο, δεν την είχε δει ποτέ. */}
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '12px 0 0', fontFamily: SANS, lineHeight: 1.7 }}>{hist.some(p => p.year === HISTORY_ANCHORS.peakYear) ? `${HISTORY_ANCHORS.long} ${HISTORY_ANCHORS.recent}` : HISTORY_ANCHORS.recent}</p>
        </Section>

        {/* 3) Σύγκριση με εναλλακτικές */}
        <Section icon={<Layers size={15} />} title="Σύγκριση με εναλλακτικές επενδύσεις" sub={`Ίδιο ποσό (${fe(nVal)}) με τις ονομαστικές τους αποδόσεις`} info={G.total_return}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
            {/* Η ΟΜΑΔΑ ΤΥΛΙΓΕΤΑΙ ΚΙ ΑΥΤΗ, ΟΧΙ ΜΟΝΟ Ο ΓΟΝΕΑΣ ΤΗΣ. Ετικέτα 148,
                πεδίο 120 και σήμα ΤτΕ 76 δένονταν σε ένα αδιαίρετο κομμάτι 272:
                μετρημένο σε 320, η κάρτα δίνει 258 και το σήμα έβγαινε
                δεκατέσσερα έξω. Ο γονέας τύλιγε ήδη, αλλά τύλιγε ολόκληρη την
                ομάδα σε δική της σειρά, όπου πάλι δεν χωρούσε. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, rowGap: 6, flexWrap: 'wrap' }}>
              <label htmlFor={apprId} style={{ ...fieldLabelStyle, margin: 0, alignItems: 'center' }}>Ετήσια ανατίμηση ακινήτου</label>
              {/* ΤΑ 90 ΔΕΝ ΧΩΡΟΥΣΑΝ ΤΗΝ ΤΙΜΗ. Το επίθεμα «%» παίρνει 33, το
                  γέμισμα του πεδίου 28 και το περίγραμμα 2: μένουν 22 για τον
                  αριθμό, που ζητά 29 για το «6,8». Μετρημένο σε Chromium και
                  στα οκτώ πλάτη. Τα 120 αφήνουν 52, δηλαδή χωρούν και το
                  «10,5» με περιθώριο. */}
              <div style={{ width: 120 }}><NumberInput id={apprId} value={apprShown} onChange={v => { setAppreciation(v); setApprTouched(true); }} suffix="%" step={0.5} max={20} /></div>
              {/* Το ίδιο σήμα με δύο λεκτικά· το στυλ γραφόταν δύο φορές. */}
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontFamily: SANS, border: '1px solid var(--border-default)', borderRadius: 8, padding: '3px 7px' }}>{apprTouched ? 'δική σου υπόθεση' : 'δείκτης ΤτΕ'}</span>
              {apprTouched && (
                <button type="button" onClick={() => { setAppreciation(''); setApprTouched(false); }} className="acc-toggle"
                  style={{ height: 26, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontFamily: SANS, fontWeight: 600, cursor: 'pointer' }}>
                  Επαναφορά στο τεκμηριωμένο ({fp(apprRef.pct)})
                </button>
              )}
            </div>
            {/* ═══ ΔΥΟ ΟΜΑΔΕΣ ΣΕ ΜΙΑ ΣΕΙΡΑ, ΚΑΙ ΦΑΙΝΟΤΑΝ ΜΙΑ ═════════════════
                Η σειρά έτρεχε «Ετήσια ανατίμηση ακινήτου [6,80 %] ΔΕΙΚΤΗΣ ΤΤΕ
                Ορίζοντας σύγκρισης [10 έτη][20 έτη]» χωρίς τίποτα να δείχνει
                πού τελειώνει το ένα χειριστήριο και πού αρχίζει το άλλο: το
                σήμα της ΤτΕ καθόταν ανάμεσα στο πεδίο και στην επόμενη ετικέτα,
                οπότε το μάτι δεν ήξερε σε ποιο από τα δύο ανήκει.

                ΚΑΙ ΟΙ ΔΥΟ ΕΤΙΚΕΤΕΣ ΕΙΧΑΝ ΑΛΛΟ ΒΑΡΟΣ: η πρώτη γραμμένη με το
                χέρι (12, δεύτερη βαθμίδα), η δεύτερη με την κοινή
                `fieldLabelStyle` (12, βάρος 500). Ιδια σειρά, δύο ιδιώματα.

                Τώρα η κάθε ομάδα είναι δικό της κουτί με το δικό της κενό, μια
                τρίχα τις χωρίζει και οι δύο ετικέτες διαβάζουν την ίδια πηγή.
                Οταν η σειρά τυλίγεται, η τρίχα εξαφανίζεται μαζί με τη σειρά. */}
            <span aria-hidden style={{ width: 1, alignSelf: 'stretch', minHeight: 24, background: 'var(--border-subtle)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, rowGap: 6, flexWrap: 'wrap' }}>
              <label style={{ ...fieldLabelStyle, margin: 0, alignItems: 'center' }}>Ορίζοντας σύγκρισης</label>
              <SegmentControl ariaLabel="Ορίζοντας σύγκρισης" value={cmpYears} onChange={v => setCmpYears(v as typeof cmpYears)} options={yearOpts(10, 20)} />
            </div>
          </div>
          {/* ═══ ΑΠΟ ΠΟΥ ΒΓΑΙΝΕΙ Η ΠΡΟΕΠΙΛΟΓΗ, ΚΑΙ ΔΥΟ ΨΕΜΑΤΑ ΠΟΥ ΕΦΥΓΑΝ ══════
              Ηταν «3%» χωρίς πηγή, δηλαδή ο αριθμός που αποφάσιζε μόνος του το
              συμπέρασμα της σύγκρισης. Μετρήθηκε. Η πρόταση όμως που τον
              εξηγούσε έλεγε δύο πράγματα που δεν ίσχυαν πάντα:

              1. «ΓΙΑ ΣΥΓΚΡΙΣΗ, Η ΜΑΚΡΑ ΠΕΡΙΟΔΟΣ…» ΗΤΑΝ Η ΙΔΙΑ ΠΕΡΙΟΔΟΣ. Στα
                 «20 έτη» το `apprRef` και το `apprLong` είναι κυριολεκτικά η
                 ίδια κλήση `historyPriceCagr(20)`. Ο δείκτης ΤτΕ ξεκινά το
                 2007, οπότε και τα δύο μετρούν 2007 ώς 2026. Η οθόνη τύπωνε
                 ίδιο ζεύγος χρονιών και ίδιο ποσοστό δύο φορές και εισήγαγε το
                 δεύτερο ως αντίλογο του πρώτου.

              2. «Ο ΙΔΙΟΣ ΟΡΙΖΟΝΤΑΣ ΜΕ ΤΙΣ ΕΝΑΛΛΑΚΤΙΚΕΣ» ΔΕΝ ΕΙΝΑΙ Ο ΙΔΙΟΣ.
                 Ζητώντας 20 έτη ο δείκτης δίνει 19 (2007 ώς 2026), ενώ οι
                 εναλλακτικές τρέχουν με πραγματική 20ετία. Ο ισχυρισμός
                 γράφεται πλέον μόνο όταν τα δύο νούμερα συμπίπτουν. */}
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '0 0 12px', fontFamily: SANS, lineHeight: 1.55 }}>
            {/* Μένει Η ΠΗΓΗ του νούμερου, που είναι ο λόγος να το εμπιστευτείς.
                Τα υπόλοιπα τετρακόσια είναι επιχειρηματολογία: γιατί άλλη
                περίοδος δίνει άλλο νούμερο και τι σημαίνει αν το αλλάξεις. */}
            Προεπιλογή <strong style={{ color: 'var(--text-secondary)' }}>{fp(apprRef.pct)}</strong>: μέση ετήσια μεταβολή του δείκτη τιμών κατοικιών της Τράπεζας της Ελλάδος, {apprRef.fromYear} ως {apprRef.toYear}.{' '}
            <InfoHint label="Από πού βγαίνει η προεπιλογή ανατίμησης">
              <span style={{ display: 'block' }}>Είναι {apprRef.years} έτη{apprRef.years === parseInt(cmpYears) ? ', ο ίδιος ορίζοντας με τις εναλλακτικές παρακάτω' : ''}.{longIsOther ? ` Για σύγκριση, η μακρά περίοδος από το ${apprLong.fromYear} ως το ${apprLong.toYear} δίνει ${fp(apprLong.pct)}, επειδή περιλαμβάνει την κρίση.` : ''}</span>
              <span style={{ display: 'block', marginTop: 8 }}>{longIsOther ? 'Καμία από τις δύο δεν είναι πρόβλεψη' : 'Δεν είναι πρόβλεψη'}· αν βάλεις άλλο νούμερο, είναι δική σου υπόθεση και βαραίνει όσο και το υπόλοιπο της σελίδας.</span>
            </InfoHint>
          </p>
          {/* Προβολή-γραμμή: ακίνητο vs κορυφαία εναλλακτική στον χρόνο */}
          {projSeries.length === 0 ? (
            <div style={{ padding: '18px 16px', borderRadius: 12, border: '1px dashed var(--border-default)', background: 'var(--bg-elevated)', marginBottom: 12 }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, fontFamily: SANS, lineHeight: 1.55 }}>
                Συμπλήρωσε την <strong style={{ color: 'var(--text-primary)' }}>αξία του ακινήτου</strong> για να συγκριθεί με τις εναλλακτικές επενδύσεις.
                Χωρίς αυτήν δεν υπάρχει ποσό να προβληθεί και ένα νούμερο βγαλμένο από το πουθενά θα διάβαζε σαν δικό σου.
              </p>
            </div>
          ) : <LineChart series={projSeries} />}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '2px 0 14px' }}>
            {projSeries.map(s => (
              <span key={s.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-tertiary)', fontFamily: SANS }}><span style={{ width: 12, height: 2.5, borderRadius: 3, background: s.color }} />{s.label}</span>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {compare.map(c => (
              <BarRow key={c.key} label={c.label} value={c.futureValue} max={compMax} valueLabel={feC(c.futureValue)} tone={c.key === 'property' ? 'accent' : 'neutral'} hint={`${fp(c.annualReturnPct)} ετησίως · ${c.totalReturnPct >= 0 ? '+' : ''}${fp(c.totalReturnPct)} συνολικά`} />
            ))}
          </div>
          {/* ═══ ΕΝΝΙΑΚΟΣΙΟΙ ΧΑΡΑΚΤΗΡΕΣ ΚΑΤΩ ΑΠΟ ΤΕΣΣΕΡΙΣ ΜΠΑΡΕΣ ══════════════════
              Η παράγραφος ήταν μονίμως ορατή και έλεγε πέντε πράγματα μαζί: τι
              δείχνουν οι μπάρες, τι έγινε στην κρίση, γιατί το ακίνητο δεν είναι
              ρευστό, πόσο κοστίζει η αγοραπωλησία και μια νομική επιφύλαξη.
              Μετρημένο στον πάγκο, στα 1440: έπιανε 537 εικονοστοιχεία μέσα σε
              κάρτα 1.392 και άφηνε 855 κενά δεξιά της.

              ΟΡΑΤΟ ΜΕΝΕΙ ΤΟ ΤΙ ΔΕΙΧΝΟΥΝ ΟΙ ΜΠΑΡΕΣ, γιατί χωρίς αυτό οι μπάρες
              δεν διαβάζονται. Ολα τα υπόλοιπα είναι απάντηση στο «γιατί όχι
              απλώς να πουλήσω και να τα βάλω αλλού», δηλαδή δεύτερη ερώτηση. Πάνε
              πίσω από το κυκλάκι αυτούσια, χωρίς να χαθεί ούτε ένα νούμερο.

              Η ΕΠΙΦΥΛΑΞΗ ΔΕΝ ΚΡΥΒΕΤΑΙ, ΦΕΥΓΕΙ ΩΣ ΔΙΠΛΟΤΥΠΙΑ. Το «Παρελθούσες
              αποδόσεις δεν εγγυώνται μελλοντικές» γραφόταν ΤΡΕΙΣ φορές στην ίδια
              καρτέλα: εδώ, στο ιστορικό των τιμών πιο πάνω και στο MARKET_DISCLAIMER
              της κάρτας πηγών στο τέλος. Μένει στην κάρτα πηγών, που είναι το
              σημείο της και είναι ορατή χωρίς πάτημα.

              ΚΑΙ Η ΚΡΙΣΗ ΑΝΑΦΕΡΕΤΑΙ ΜΟΝΟ ΟΤΑΝ ΕΙΝΑΙ ΜΕΣΑ ΣΤΟΝ ΟΡΙΖΟΝΤΑ. Η
              πρόταση για τη 20ετία γραφόταν και με επιλεγμένη τη 10ετία, δηλαδή
              περιέγραφε γράφημα που ο χρήστης δεν έβλεπε. */}
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '12px 0 0', fontFamily: SANS, lineHeight: 1.55 }}>
            Οι εναλλακτικές τρέχουν με τη <strong style={{ color: 'var(--text-secondary)' }}>μέση ετήσια ονομαστική απόδοσή τους της τελευταίας {cmpYears}ετίας</strong>, ως συνολική απόδοση σε ευρώ από επίσημες πηγές, με ορίζοντα {BENCHMARKS_ASOF}. Το ακίνητο τρέχει με τη δική σου καθαρή απόδοση συν ανατίμηση. Όλα προ φόρου εισοδήματος.{' '}
            <InfoHint label="Τι δεν δείχνει η σύγκριση">
              <span style={{ display: 'block' }}>Τα νούμερα είναι μετρημένα, όχι εξομαλυμένες υποθέσεις. Ονομαστικά και τα δύο σκέλη, χωρίς αφαίρεση πληθωρισμού: γι’ αυτό ο πληθωρισμός στέκει ως δική του γραμμή αναφοράς παραπάνω.{cmpYears === '20' ? ' Η 20ετία περιλαμβάνει την κρίση: το Χρηματιστήριο Αθηνών και το ομόλογο είναι σχεδόν μηδενικά.' : ''}</span>
              <span style={{ display: 'block', marginTop: 8 }}>Οι εναλλακτικές είναι <strong>παθητικές και ρευστές</strong>, ενώ το ακίνητο απαιτεί χρόνο, συγκεντρώνει τον κίνδυνο σε ένα περιουσιακό στοιχείο και κοστίζει για να μπεις και να βγεις: μια πλήρης διαδρομή αγοράς και πώλησης είναι τυπικά 4 έως 10% της αξίας, δηλαδή φόρος μεταβίβασης 3% και συμβολαιογραφικά στην αγορά, μεσιτική αμοιβή και νομικός έλεγχος στην πώληση.</span>
              <span style={{ display: 'block', marginTop: 8 }}>Στην ενότητα «Επενδυτική ανάλυση» παρακάτω μπαίνει μόνο το σκέλος του <strong>πωλητή</strong> και το βλέπεις και το αλλάζεις.</span>
            </InfoHint>
          </p>
        </Section>

        {/* 4) Εργαλεία & μοχλοί — πακέτο «Επαγγελματίας», σε επιχειρηματικό καθεστώς */}
        {canInvest && (
          <Section icon={<Percent size={15} />} title="Εργαλεία απόδοσης" sub="Ανατοκισμός επανεπένδυσης και μόχλευση ιδίων κεφαλαίων">
            {/* ΔΥΟ ΚΑΡΤΕΣ, ΙΔΙΑ ΓΕΩΜΕΤΡΙΑ, ΙΔΙΟ ΥΨΟΣ.
                Η αριστερή είχε τα πεδία της σε flex με χειρόγραφο πλάτος 150 και
                ετικέτα που τύλιγε σε δύο σειρές δίπλα σε μία σειρά, άρα τα δύο
                κουτιά κάθονταν σε άλλη γραμμή βάσης. Η δεξιά είχε τέσσερα πεδία
                σε στήλη, το ένα κάτω από το άλλο. Και οι δύο άφηναν τα νούμερά
                τους σε flex-wrap, δηλαδή σε άλλη κατακόρυφο η καθεμία.

                Τώρα: πεδία σε δύο στήλες, νούμερα σε δικό τους πλέγμα, σημείωση
                στο κάτω άκρο. Ό,τι διαβάζεις αριστερά το βρίσκεις δεξιά. */}
            <div {...fixedCols(2, 16, 'stretch')}>
              {/* Ανατοκισμός */}
              <div className="po-fig-card" tabIndex={0} style={toolCard}>
                <p style={{ ...titleStyle, marginBottom: 12, display: 'flex', alignItems: 'center' }}>Ανατοκισμός επανεπένδυσης<TermInfo text={G.compound} /></p>
                <div {...fixedCols(2, 12)}>
                  <NumberInput label="Απόδοση επανεπένδυσης" value={compRate} onChange={setCompRate} suffix="%" step={0.5} />
                  <div><label style={fieldLabelStyle}>Ορίζοντας ανατοκισμού</label><SegmentControl ariaLabel="Ορίζοντας ανατοκισμού" value={compYears} onChange={v => setCompYears(v as typeof compYears)} options={yearOpts(10, 20)} /></div>
                </div>
                <div {...fixedCols(2, 16, 'start')} style={{ ...fixedCols(2, 16, 'start').style, marginTop: 14 }}>
                  <Figure label="Τελική αξία" value={fe(comp.futureValue)} tone="accent" />
                  <Figure label="Κέρδος ανατοκισμού" value={fe(comp.totalGrowth)} />
                </div>
                {/* Ητανε 84 χαρακτήρες και τσάκιζε σε δεύτερη γραμμή μέσα στη
                    στήλη του εργαλείου. Η ίδια πρόταση χωρίς τα γεμίσματα: το
                    «ετήσια» το λέει το «τον χρόνο» στο τέλος και η «καθαρή
                    ταμειακή ροή» είναι ό,τι ακριβώς δείχνει το ποσό δίπλα της. */}
                <p style={{ ...toolNote, marginTop: 12 }}>Αρχική αξία συν επανεπένδυση ροής {fe(Math.max(0, grossAnnual - effOpex - annualTax))} τον χρόνο.</p>
              </div>
              {/* Μόχλευση */}
              <div className="po-fig-card" tabIndex={0} style={toolCard}>
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
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 12px', borderRadius: 10, border: '1px solid var(--border-accent)', background: 'var(--accent-dim)', color: 'var(--accent)', fontSize: 12, fontFamily: SANS, fontWeight: 500, cursor: 'pointer' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 12a9 9 0 11-6.2-8.5"/><polyline points="21 3 21 9 15 9"/></svg>
                      Χρησιμοποίησε το πραγματικό μου δάνειο
                    </button>
                  )}
                </div>
                <div {...fixedCols(2, 12)}>
                  <NumberInput label="Δάνειο (% αξίας)" value={ltv} onChange={setLtv} suffix="%" max={100} />
                  <NumberInput label="Επιτόκιο" value={loanRate} onChange={setLoanRate} suffix="%" step={0.1} />
                  {/* Η διάρκεια ήταν καρφωμένη στα 25 έτη μέσα στη κλήση της
                      μηχανής: καθόριζε δόση, ταμειακή ροή, DSCR και IRR χωρίς να
                      φαίνεται πουθενά. Τώρα είναι πεδίο, με την προεπιλογή ρητή. */}
                  <NumberInput label="Διάρκεια δανείου" value={loanYears} onChange={setLoanYears} suffix="έτη" step={5} max={40} />
                  <NumberInput label="Άτοκο μέρος (Σπίτι μου ΙΙ)" value={ifree} onChange={setIfree} suffix="%" max={100} />
                </div>
                <div {...fixedCols(3, 16, 'start')} style={{ ...fixedCols(3, 16, 'start').style, marginTop: 14 }}>
                  <Figure label="Ίδια κεφάλαια" value={fe(lev.equity)} />
                  <Figure label="Απόδοση ιδίων" value={fp(lev.cashOnCash)} tone={lev.cashOnCash >= 0 ? 'accent' : 'negative'} />
                  <Figure label="Ετήσια ροή" value={fe(lev.cashFlow)} tone={lev.cashFlow >= 0 ? undefined : 'negative'} />
                </div>
                {/* ══ ΔΥΟ ΓΚΡΙΖΕΣ ΠΑΡΑΓΡΑΦΟΙ ΓΙΑ ΜΙΑ ΕΤΥΜΗΓΟΡΙΑ ΚΑΙ ΤΕΣΣΕΡΑ ΜΕΓΕΘΗ
                    Το κουτί έκλεινε με δύο μπλοκ κειμένου στο ίδιο μέγεθος και
                    σχεδόν στο ίδιο χρώμα, που τύλιγαν σε τρεις και τέσσερις
                    σειρές. Μέσα τους κρύβονταν πράγματα διαφορετικού είδους: μία
                    ΚΡΙΣΗ («αρνητική μόχλευση»), δύο ΜΕΓΕΘΗ που τη στηρίζουν
                    (κόστος δανείου έναντι καθαρής απόδοσης) και δύο ΠΑΡΑΔΟΧΕΣ
                    (λειτουργικά έξοδα, διάρκεια). Ο αναγνώστης έπρεπε να τα
                    ξεχωρίσει μόνος του μέσα από τη σύνταξη.

                    Τώρα: η ετυμηγορία με λέξεις, τα δύο μεγέθη που τη βγάζουν
                    δίπλα της, οι παραδοχές σε ήσυχη γραμμή στοιχείων από κάτω.
                    Ιδιο ιδίωμα με την κάρτα δανείου: όνομα πάνω, μέγεθος κάτω. */}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '6px 18px', marginTop: 14 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, fontFamily: SANS, color: 'var(--text-primary)' }}>
                    {lev.positiveCarry ? 'Θετική μόχλευση' : 'Αρνητική μόχλευση'}
                  </span>
                  <span style={{ fontSize: 12, fontFamily: SANS, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>καθαρή απόδοση {fp(lev.unleveredYield)}</span>
                  <span style={{ fontSize: 12, fontFamily: SANS, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>κόστος δανείου {fp(lev.effectiveLoanRate)}</span>
                </div>
                {lev.positiveCarry && (
                  <p style={{ ...toolNote, marginTop: 6 }}>Η ετήσια ροή μπορεί να είναι αρνητική λόγω χρεολυσίου, αυξάνεις όμως τα ίδια κεφάλαιά σου.</p>
                )}
                {/* Το ποσοστό λειτουργικών εξόδων έμπαινε στη μηχανή σιωπηλά (με
                    εφεδρικό 20% όταν έλειπαν έσοδα). Δεν είναι υπόθεση: βγαίνει από
                    τα «Ετήσια έξοδα» που έγραψε ο χρήστης. Άρα λέγεται. */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 22px', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
                  <div>
                    <p style={{ ...toolNote, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Λειτουργικά έξοδα</p>
                    <p style={{ fontSize: 12, fontFamily: SANS, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums', margin: '2px 0 0' }}>{fp(opexPctOfRent)} των εσόδων · {fe(effOpex)} σε {fe(grossAnnual)}</p>
                  </div>
                  <div>
                    <p style={{ ...toolNote, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Διάρκεια δανείου</p>
                    <p style={{ fontSize: 12, fontFamily: SANS, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums', margin: '2px 0 0' }}>{nLoanYears} έτη</p>
                  </div>
                </div>
              </div>
            </div>
          </Section>
        )}

        {/* Επενδυτική ανάλυση IRR/NPV/DSCR — πακέτο «Επαγγελματίας» */}
        {canInvest && (
          <Section icon={<Percent size={15} />} title="Επενδυτική ανάλυση" sub="IRR / NPV / DSCR: αγορά, κατοχή και πώληση στον ορίζοντα">
            {/* ΤΕΣΣΕΡΑ ΧΕΙΡΙΣΤΗΡΙΑ ΜΕ ΤΡΙΑ ΧΕΙΡΟΓΡΑΦΑ ΠΛΑΤΗ (128, 158, 148) ΚΑΙ
                ΕΝΑ ΧΩΡΙΣ. Η ετικέτα «Επιτόκιο προεξόφλησης» δεν χωρούσε στα 158
                και τύλιγε σε δύο σειρές, οπότε το πεδίο της κατέβαινε και έσπαγε
                τη γραμμή. Τέσσερις ίσες στήλες, μία γραμμή βάσης. */}
            <div {...fixedCols(4, 12)} style={{ ...fixedCols(4, 12).style, marginBottom: 14 }}>
              <div><label style={fieldLabelStyle}>Ορίζοντας κατοχής</label><SegmentControl ariaLabel="Ορίζοντας κατοχής" value={holdYears} onChange={v => setHoldYears(v as typeof holdYears)} options={yearOpts(5, 10, 20)} /></div>
              <NumberInput label="Αύξηση ενοικίου" value={rentGrowth} onChange={setRentGrowth} suffix="%" step={0.5} />
              <NumberInput label="Επιτόκιο προεξόφλησης" value={discountRate} onChange={setDiscountRate} suffix="%" step={0.5} labelInfo={<TermInfo text={G.npv} />} />
              {/* Τα κόστη πώλησης ήταν σταθερά 3% μέσα στην κλήση: αφαιρούνταν από
                  το προϊόν της πώλησης και άρα από το IRR, χωρίς να φαίνονται. */}
              <NumberInput label="Κόστη πώλησης" value={sellCosts} onChange={setSellCosts} suffix="%" step={0.5} max={15}
                labelInfo={<TermInfo text="Κόστη που βαρύνουν τον πωλητή στην έξοδο: μεσιτική αμοιβή, τυπικά περίπου 2% συν ΦΠΑ, νομικός και συμβολαιογραφικός έλεγχος, τεχνικά πιστοποιητικά. Ο φόρος μεταβίβασης 3% βαρύνει τον αγοραστή, γι’ αυτό δεν περιλαμβάνεται εδώ. Προεπιλογή 3%· άλλαξέ το αν γνωρίζεις τα δικά σου κόστη." />} />
            </div>
            <div {...fixedCols(4, 12, 'stretch')}>
              <MetricTile label="IRR" value={Number.isFinite(deal.irrPct) ? fp(deal.irrPct) : fp(0)} info={G.irr} />
              <MetricTile label="Καθαρή παρούσα αξία" value={fe(deal.npv)} info={G.npv} tone={deal.npv < 0 ? 'neg' : undefined} />
              <MetricTile label="DSCR" value={Number.isFinite(deal.dscr) ? fn(deal.dscr, 2) : '∞'} info={G.dscr} tone={deal.dscr < 1 ? 'neg' : undefined} />
              <MetricTile label="Πολλαπλασιαστής ιδίων" value={`${fn(deal.equityMultiple, 2)}×`} info={G.equity_multiple} />
            </div>
            {/* ΜΙΑ ΠΑΡΑΓΡΑΦΟΣ ΠΟΥ ΕΚΡΥΒΕ ΕΝΑΝ ΠΙΝΑΚΑ. Οι έξι παραδοχές ήταν σε
                τρέχον κείμενο, χωρισμένες με κόμματα, ανάμεσα σε δύο εξηγήσεις:
                για να βρεις με ποιο επιτόκιο υπολογίστηκε η NPV έπρεπε να
                διαβάσεις πενήντα λέξεις. Ό,τι είναι ζευγάρι «όνομα, τιμή» δεν
                είναι πρόταση, είναι γραμμή. */}
            <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
              <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', fontFamily: SANS, margin: '0 0 10px' }}>Οι παραδοχές του υπολογισμού</p>
              <div {...fixedCols(3, 14, 'start')}>
                {[
                  ['Ανατίμηση ακινήτου', fp(nAppr), apprTouched ? 'δική σου υπόθεση' : `δείκτης ΤτΕ ${apprRef.fromYear} ως ${apprRef.toYear}`],
                  ['Αύξηση ενοικίου', fp(parseFloat(rentGrowth) || 0), 'τον χρόνο'],
                  ['Λειτουργικά έξοδα', fp(opexPctOfRent), 'των εσόδων'],
                  ['Δάνειο', fp(parseFloat(ltv) || 0), `της αξίας, με επιτόκιο ${fp(parseFloat(loanRate) || 0)}`],
                  ['Διάρκεια δανείου', `${nLoanYears} έτη`, `ορίζοντας κατοχής ${holdYears} έτη`],
                  ['Επιτόκιο προεξόφλησης', fp(parseFloat(discountRate) || 0), 'για την καθαρή παρούσα αξία'],
                ].map(([l, v, sub]) => (
                  <div key={l}>
                    <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0, fontFamily: SANS }}>{l}</p>
                    <p className="po-fig" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '2px 0 0', fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>{v}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '1px 0 0', fontFamily: SANS, lineHeight: 1.4 }}>{sub}</p>
                  </div>
                ))}
              </div>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '12px 0 0', fontFamily: SANS, lineHeight: 1.55 }}>
              {/* Μένουν τα τρία ποσά που χαρακτηρίζουν τους δείκτες από πάνω.
                  Ο ορισμός του IRR και η επιφύλαξη «όχι επενδυτική συμβουλή»
                  έφυγαν: η δεύτερη γραφόταν ΤΕΤΑΡΤΗ φορά στην ίδια καρτέλα και
                  ζει στην κάρτα των πηγών. */}
              Πώληση στο τέλος του ορίζοντα: καθαρό προϊόν {fe(deal.saleProceeds)}, μετά τα κόστη πώλησης {fp(nSellCosts)} και το υπόλοιπο του δανείου {fe(deal.loanBalanceAtExit)}.{' '}
              <InfoHint label="Τι μετρά το IRR">
                <span style={{ display: 'block' }}>Το IRR ενσωματώνει τη χρονική αξία του χρήματος και την έξοδο: ένα ευρώ σήμερα δεν είναι ίδιο με ένα ευρώ στο τέλος του ορίζοντα και η πώληση μετρά όσο και τα ενοίκια.</span>
              </InfoHint>
            </p>
          </Section>
        )}

        {/* Ανάλυση ευαισθησίας & αντοχή — πακέτο «Επαγγελματίας» */}
        {canInvest && (
          <Section icon={<TrendingUp size={15} />} title="Ανάλυση ευαισθησίας" sub="Πώς αντέχει η επένδυση σε μεταβολές επιτοκίου και ανατίμησης" info={G.sensitivity}>
            <div style={{ overflowX: 'auto' }}>
              <div className="po-fig-card" tabIndex={0} style={{ minWidth: 460, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr', gap: 8, padding: '0 12px 8px' }}>
                  {['Σενάριο', 'Συνολική απόδοση', 'Απόδοση ιδίων', 'Ετήσια ροή'].map((h, i) => (
                    <span key={h} style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontFamily: SANS, textAlign: i === 0 ? 'left' : 'right' }}>{h}</span>
                  ))}
                </div>
                {scenarios.map(s => (
                  <div key={s.key} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr', gap: 8, alignItems: 'center', padding: '10px 12px', borderRadius: 10, background: s.key === 'base' ? 'var(--bg-elevated)' : 'transparent', border: `1px solid ${s.key === 'base' ? 'var(--border-subtle)' : 'transparent'}` }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0, fontFamily: SANS }}>{s.label}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '1px 0 0', fontFamily: SANS }}>{s.note}</p>
                    </div>
                    <span className="po-fig" style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontFamily: SANS }}>{fp(s.totalReturn)}</span>
                    <span className="po-fig" data-tone={s.roe >= 0 ? undefined : 'negative'} style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontFamily: SANS }}>{fp(s.roe)}</span>
                    <span className="po-fig" data-tone={s.cashFlow >= 0 ? undefined : 'negative'} style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontFamily: SANS }}>{fe(s.cashFlow)}</span>
                  </div>
                ))}
              </div>
            </div>
            {term === 'short' && breakEvenOcc !== null && (
              <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-primary)', fontFamily: SANS, fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                  Πληρότητα ισοσκελισμού: {isFinite(breakEvenOcc) ? fp(Math.min(100, breakEvenOcc)) : 'μη εφικτή'}<TermInfo text={G.break_even} />
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-tertiary)', fontFamily: SANS, lineHeight: 1.5 }}>
                  {isFinite(breakEvenOcc) && breakEvenOcc <= 100
                    ? `Πάνω από αυτό το ποσοστό πληρότητας, τα καθαρά έσοδα της βραχυχρόνιας ξεπερνούν τα καθαρά της μακροχρόνιας μίσθωσης (προ φόρου).`
                    : `Με τα τρέχοντα δεδομένα, η βραχυχρόνια δύσκολα ξεπερνά τη μακροχρόνια: η μακροχρόνια μίσθωση φαίνεται προτιμότερη.`}
                </p>
              </div>
            )}
          </Section>
        )}

        {/* ═══ Η ΦΟΡΟΛΟΓΙΑ ΕΙΝΑΙ ΕΞΗΓΗΣΗ, ΟΧΙ ΠΡΟΫΠΟΘΕΣΗ ══════════════════════
            Δύο μπλοκ πυκνού κειμένου —τα τέλη της βραχυχρόνιας και οι φορολογικές
            παραδοχές— κάθονταν ΜΕΣΑ στην κάρτα των πεδίων, πάντα ανοιχτά, ανάμεσα
            στον χρήστη και στο αποτέλεσμα. Δηλαδή για να δεις την απόδοσή σου
            έπρεπε να προσπεράσεις δύο παραγράφους για το πώς φορολογείται.
            Τα νούμερα που περιέχουν είναι ήδη μέσα στα πλακίδια από πάνω· εδώ
            μένει το «γιατί», για όποιον το ζητήσει. Ο διακόπτης της είσπραξης
            μέσω τραπέζης μένει μαζί τους, γιατί είναι φορολογική παραδοχή. */}
        <Section icon={<Landmark size={15} />} title="Τέλη και φορολογία" sub={term === 'short' ? 'Τέλος ανθεκτικότητας, παρεπιδημούντων και πώς προκύπτει ο φόρος' : 'Πώς προκύπτει ο φόρος και τι τον αλλάζει'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {term === 'short' && (<>
            {!empty && (
              <div style={{ marginTop: 0, padding: '12px 14px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', fontFamily: SANS }}>Τέλη και φορολογία βραχυχρόνιας</span>
                </div>
                <div {...fixedCols(2, 16, 'start')}>
                  <div>
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: SANS, display: 'inline-flex', alignItems: 'center' }}>Τέλος ανθεκτικότητας (ΤΑΚΚ)<TermInfo text={G.takk} /></span>
                    <p className="po-fig" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '3px 0 0', fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>{fe(st.climateLevy)} τον χρόνο</p>
                    {/* ΤΟ ΠΟΣΟ ΕΙΝΑΙ ΤΟ ΙΔΙΟ, Η ΤΣΕΠΗ ΟΧΙ. Χωρίς αυτή τη γραμμή
                        ο ίδιος αριθμός διαβαζόταν ως κόστος του ιδιοκτήτη ακόμη
                        και όταν τον πληρώνει ο επισκέπτης. */}
                    <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '2px 0 0', fontFamily: SANS, lineHeight: 1.45 }}>
                      {levyToGuest ? 'Το εισπράττεις και το αποδίδεις· δεν βαραίνει τα καθαρά σου.' : 'Δεν το χρεώνεις στον επισκέπτη, οπότε μετρά ως δικό σου κόστος.'}
                    </p>
                  </div>
                  <div>
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: SANS, display: 'inline-flex', alignItems: 'center' }}>Τέλος παρεπιδημούντων<TermInfo text={G.transient_tax} /></span>
                    <p className="po-fig" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '3px 0 0', fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>{st.municipalTax > 0 ? `${fe(st.municipalTax)} τον χρόνο` : 'Εξαιρείται'}</p>
                  </div>
                </div>
                {/* ═══ ΔΥΟ ΑΠΟ ΤΙΣ ΠΕΝΤΕ ΠΡΟΤΑΣΕΙΣ ΗΤΑΝ ΑΝΤΙΓΡΑΦΑ ΤΩΝ ΚΥΚΛΑΚΙΩΝ
                    ΠΟΥ ΚΑΘΟΝΤΑΙ ΑΚΡΙΒΩΣ ΑΠΟ ΠΑΝΩ ΤΟΥΣ ═══════════════════════
                    Η παράγραφος ξεκινούσε λέγοντας ότι το Τέλος Ανθεκτικότητας
                    χρεώνεται ανά διανυκτέρευση με υψηλότερη τιμή στην υψηλή
                    περίοδο. Το κυκλάκι δίπλα στην ίδια την ετικέτα το λέει ήδη
                    και ΚΑΛΥΤΕΡΑ: δίνει τα ποσά (2 € και 8 € για διαμερίσματα,
                    4 € και 15 € για μονοκατοικίες άνω των 80 τετραγωνικών) και
                    τους μήνες κάθε περιόδου.

                    Η δεύτερη πρόταση έλεγε ότι το τέλος παρεπιδημούντων 0,5%
                    εξαιρεί όσους έχουν έως δύο ακίνητα. Το διπλανό κυκλάκι λέει
                    ακριβώς αυτό, με το ίδιο ποσοστό και το ίδιο όριο.

                    Μετρημένο στην οθόνη του χρήστη: το ανοιχτό κυκλάκι έπεφτε
                    ΠΑΝΩ στην παράγραφο, οπότε οι δύο διατυπώσεις της ίδιας
                    πληροφορίας διαβάζονταν κυριολεκτικά η μία δίπλα στην άλλη.

                    Μένουν οι τρεις προτάσεις που δεν λέγονται πουθενά αλλού: το
                    κατώφλι της επιχειρηματικής δραστηριότητας, ο Αριθμός
                    Μητρώου Ακινήτων και το ποιος επιβεβαιώνει τα τελικά. */}
                <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text-secondary)', fontFamily: SANS, lineHeight: 1.55 }}>
                  {individualPerson ? 'Όταν η δραστηριότητα ξεπεράσει τα όρια (πολλά ακίνητα ή παροχή υπηρεσιών ξενοδοχειακού τύπου), θεωρείται επιχειρηματική και υπάγεται σε ΦΠΑ και στην κλίμακα του άρθρου 15· είναι θέμα του λογιστή.' : 'Ως νομικό πρόσωπο, τα έσοδα υπάγονται σε ΦΠΑ και εταιρική φορολογία, ενώ τα τέλη εκπίπτουν ως δαπάνες.'} Κάθε ακίνητο χρειάζεται Αριθμό Μητρώου Ακινήτων σε κάθε αγγελία. Οι τελικές υποχρεώσεις επιβεβαιώνονται με τον λογιστή ή την ΑΑΔΕ.
                </p>
              </div>
            )}
            </>)}
            {/* ΦΟΡΟΛΟΓΙΚΕΣ ΠΑΡΑΔΟΧΕΣ ─────────────────────────────────
            Η είσπραξη μέσω τραπέζης ήταν καρφωμένη σε `true` μέσα στον κώδικα και
            η έκπτωση 5% παρουσιαζόταν αλλού ως «αυτόματη». Είναι απόφαση του
            χρήστη με μετρήσιμη συνέπεια στον φόρο του, άρα ζει στην οθόνη. */}
        {/* ΜΙΑ ΠΑΡΑΔΟΧΗ ΠΟΥ ΜΕΤΡΟΥΣΕ ΓΙΑ ΟΛΟΥΣ, ΑΛΛΑ ΦΑΙΝΟΤΑΝ ΜΟΝΟ ΣΤΟΥΣ ΜΙΣΟΥΣ.
            Το `rentsBank` μπαίνει στον υπολογισμό του φόρου ΚΑΘΕ χρήστη: με
            τραπεζική είσπραξη ο φόρος βγαίνει στο 95% του ενοικίου, αλλιώς στο
            100%. Ο διακόπτης όμως αποδιδόταν μόνο σε ιδιώτες. Ο επαγγελματίας
            πλήρωνε στην οθόνη του μια υπόθεση που ούτε έβλεπε ούτε μπορούσε να
            αλλάξει — και, στη μακροχρόνια, η ενότητα «Τέλη και φορολογία»
            άνοιγε σε ΑΔΕΙΟ κουτί, αφού δεν του έμενε τίποτε να δείξει. */}
        {!empty && (
          <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
            <span style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', fontFamily: SANS, marginBottom: 10 }}>Φορολογικές παραδοχές</span>
            <Toggle checked={rentsBank} onChange={setRentsBank}
              label="Τα ενοίκια εισπράττονται μέσω τραπέζης"
              note={PRESUMPTIVE_RULE_2026} />
            {/* Η ΔΕΥΤΕΡΗ ΠΑΡΑΔΟΧΗ ΗΤΑΝ ΚΑΡΦΩΜΕΝΗ ΚΑΙ ΑΟΡΑΤΗ, ΟΠΩΣ ΗΤΑΝ ΚΑΙ Η
                ΠΡΩΤΗ. Η οθόνη αφαιρούσε ολόκληρο το ΤΑΚΚ από τα καθαρά, ενώ η
                Λογιστική αφαιρεί μόνο όσο δεν εισπράχθηκε: δύο αλήθειες για το
                ίδιο τέλος, με διαφορά ώς 1.500 € τον χρόνο. Τώρα το λέει ο
                ιδιοκτήτης μία φορά· το ακολουθούν και οι δύο. */}
            {term === 'short' && (
              <div style={{ marginTop: 10 }}>
                <Toggle checked={levyToGuest} onChange={setLevyToGuest}
                  label="Χρεώνω το τέλος ανθεκτικότητας στον επισκέπτη"
                  note="Ο νόμος το βάζει στον επισκέπτη και ο ιδιοκτήτης το αποδίδει. Οι πλατφόρμες όμως δεν έχουν πεδίο γι᾽ αυτό στην Ελλάδα: αν δεν το ζητήσεις ρητά, βγαίνει από την τσέπη σου." />
              </div>
            )}
            <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text-secondary)', fontFamily: SANS, lineHeight: 1.55 }}>
              {consolidated
                ? <>{CONSOLIDATION_NOTE} Το χαρτοφυλάκιό σου: <strong style={{ color: 'var(--text-primary)' }}>{portfolioTax.count} ακίνητα</strong> με ενοίκια {fe(portfolioTax.totalAnnualRent)} και συνολικό φόρο {fe(portfolioTax.totalTax)} (μέσος συντελεστής {fp(portfolioTax.effectiveRate * 100)}, οριακός {fp(portfolioTax.marginalRate * 100)}). Το μερίδιο αυτού του ακινήτου είναι <strong style={{ color: 'var(--text-primary)' }}>{fe(annualTax)}</strong>. Αν υπολογιζόταν μόνο του, θα έδειχνε {fe(portfolioTax.perProperty.find(p => p.id === propertyId)?.standaloneTax ?? 0)}, δηλαδή λιγότερα από την πραγματικότητα.</>
                : <>{/* Μένει ο ΔΙΚΟΣ ΣΟΥ συντελεστής, που είναι το νούμερο της
                       απόφασης. Η κλίμακα είναι πίνακας αναφοράς: τη βλέπεις
                       μία φορά και μετά σε ενδιαφέρει μόνο πού πέφτεις. */}
                    Έχεις ένα ακίνητο με εισόδημα, οπότε ο φόρος του είναι όλος ο φόρος σου. Οριακός συντελεστής <strong style={{ color: 'var(--text-primary)' }}>{fp(portfolioTax.marginalRate * 100)}</strong>.{' '}
                    <InfoHint label="Η κλίμακα ενοικίων 2026">
                      <span style={{ display: 'block' }}>Ο φόρος υπολογίζεται με την προοδευτική κλίμακα ενοικίων 2026, στο σύνολο των ενοικίων σου: 15% έως 12.000 €, 25% έως 24.000 €, 35% έως 35.000 € και 45% πάνω από αυτά.</span>
                    </InfoHint></>}
            </p>
          </div>
        )}
          </div>
        </Section>
        {/* Μοχλοί μεγιστοποίησης — επαγγελματίας (πλήρες) / ιδιώτης (μόνο βασικά) */}
        <Section icon={<Wallet size={15} />} title="Μοχλοί μεγιστοποίησης απόδοσης" sub={pro ? 'Συγκεκριμένες κινήσεις με μετρήσιμη επίδραση και κίνδυνο' : 'Απλές κινήσεις που αυξάνουν την καθαρή απόδοση'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {YIELD_LEVERS.filter(l => pro || l.audience === 'all').map(l => (
              <LeverCard key={l.key} lever={l} />
            ))}
          </div>
          {/* ΑΦΑΙΡΕΘΗΚΕ ΤΟ ΚΟΥΤΙ «ΗΛΕΚΤΡΟΝΙΚΟΣ ΠΛΕΙΣΤΗΡΙΑΣΜΟΣ». Καθόταν δέκα
              εικονοστοιχεία κάτω από τον πρώτο μοχλό, που λέγεται «Αγορά κάτω από
              την αγορά (ηλεκτρονικός πλειστηριασμός)» και επαναλάμβανε τα ίδια
              ακριβώς νούμερα: δύο άγονοι στο 80%, ο τρίτος στο 65%, ένας στους
              επτά βρίσκει αγοραστή. Ό,τι είχε παραπάνω —η εγγύηση, το τέλος
              συστήματος και η προειδοποίηση ότι η μείωση είναι νομικό κατώφλι και
              όχι εγγυημένη έκπτωση— μετακόμισε ΜΕΣΑ στον μοχλό, εκεί που το
              διαβάζει όποιος ενδιαφέρεται. */}
        </Section>

        {/* Πηγές & disclaimer */}
        <div style={{ ...card, padding: '13px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <Info size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0, marginTop: 2 }} />
            <div>
              {/* ΤΟ ΟΡΙΟ ΤΩΝ 74 ΧΑΡΑΚΤΗΡΩΝ ΕΚΟΒΕ ΤΟ ΚΕΙΜΕΝΟ ΚΑΙ ΑΦΗΝΕ ΤΗ ΜΙΣΗ
                  ΚΑΡΤΑ ΑΔΕΙΑ. Μετρημένο στα 1440: το κείμενο έπιανε 498
                  εικονοστοιχεία μέσα σε κάρτα 1.358, δηλαδή 860 κενά δεξιά του.
                  Το `fineprint` το αφήνει να πιάσει ολόκληρο το μέτρο της
                  κάρτας, σε μία στήλη, όπως κάθε άλλο κείμενο της οθόνης. */}
              <p className="fineprint" style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0, fontFamily: SANS }}>{MARKET_DISCLAIMER}</p>
              {/* Μία σειρά. Το `flexWrap` μένει ως δίχτυ για πολύ στενή οθόνη ή
                  για τη ρύθμιση «μεγαλύτερο κείμενο» — δεν είναι η κανονική
                  κατάσταση, είναι η υποχώρηση. */}
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
                {/* ΜΕΤΡΗΜΕΝΟΙ ΣΤΑ 17. Τέσσερις σύνδεσμοι σε γραμμή 11 στιγμών,
                    δηλαδή τέσσερις στόχοι αφής στο 39% του ορίου των 44. Η
                    κλάση δίνει το ύψος ΜΟΝΟ στο δάχτυλο· στο ποντίκι η γραμμή
                    μένει όσο ήταν. */}
                {MARKET_SOURCES.map(s => <a key={s.href} href={s.href} target="_blank" rel="noreferrer" className="tap-link" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', fontFamily: SANS }}>{s.label}</a>)}
              </div>
            </div>
          </div>
        </div>
      </>)}
    </div>
  );
}
