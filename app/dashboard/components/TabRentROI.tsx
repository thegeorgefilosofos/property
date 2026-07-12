'use client';
// ═══════════════════════════════════════════════════════════════════════════
// ΑΠΟΔΟΣΕΙΣ — το εργαλείο απόδοσης ακινήτου. Καθαρό, minimal, πτυσσόμενο.
// Οδηγείται από το προφίλ: ιδιώτης → απλή εικόνα· επαγγελματίας → αναλυτικά
// εργαλεία, με διάκριση φυσικού/νομικού προσώπου όπου έχει σημασία.
// Πραγματικά δεδομένα αγοράς (lib/market/greekMarket) + μηχανή (lib/market/returns).
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Spinner, fe } from '@/components/Theme';
import { NumberInput, CustomSelect } from './UIComponents';
import { ChevronRight, TrendingUp, Landmark, Percent, Wallet, Building2, Layers, ArrowUpRight, Info } from 'lucide-react';
import { yields, compound, leverage, applySeries, compareInvestments, propertyTotalReturn, type LeverageResult } from '@/lib/market/returns';
import {
  REGIONS, BENCHMARKS, HISTORY_INDEX, HISTORY_ANCHORS, SHORT_TERM, YIELD_LEVERS, AUCTION_FACTS,
  GREECE_AVG_GROSS_YIELD, ATHENS_AVG_GROSS_YIELD, MARKET_DISCLAIMER, MARKET_DATA_ASOF, MARKET_SOURCES,
  yieldVerdict, regionByKey,
} from '@/lib/market/greekMarket';
import { incomeStatement, type TaxRegime } from '@/lib/accounting/statement';

interface Props { propertyId: string; userId: string; propertyValue?: number; profileType?: 'individual' | 'professional'; }

const fp = (n: number) => `${(isFinite(n) ? n : 0).toFixed(1)}%`;
const SANS = "'Inter',sans-serif";
const card: React.CSSProperties = { position: 'relative', background: 'linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg-surface) 100%)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: '18px 20px', boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset, 0 14px 34px -20px rgba(0,0,0,0.55)' };
const titleStyle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0, fontFamily: SANS, letterSpacing: '0.1px' };
const subStyle: React.CSSProperties = { fontSize: 12, color: 'var(--text-tertiary)', margin: '2px 0 0', fontFamily: SANS };

// ── Πτυσσόμενη ενότητα (ομοιόμορφη, χωρίς μπλε πλαίσιο) ─────────────────────
function Section({ icon, title, sub, children, defaultOpen = false }: { icon: React.ReactNode; title: string; sub?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={card}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} className="acc-toggle" style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 9, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', flexShrink: 0 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={titleStyle}>{title}</p>
          {sub && <p style={subStyle}>{sub}</p>}
        </div>
        <ChevronRight size={17} style={{ color: 'var(--text-tertiary)', flexShrink: 0, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.18s' }} />
      </button>
      {open && <div style={{ marginTop: 16 }}>{children}</div>}
    </div>
  );
}

// ── KPI κάρτα 3D ────────────────────────────────────────────────────────────
function KPI({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  const [hot, setHot] = useState(false);
  return (
    <div onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
      style={{ background: 'linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg-surface) 100%)', border: `1px solid ${hot ? 'var(--border-accent)' : 'var(--border-subtle)'}`, borderRadius: 14, padding: '15px 16px', boxShadow: hot ? '0 16px 30px -18px rgba(0,0,0,0.6)' : '0 8px 20px -18px rgba(0,0,0,0.5)', transform: hot ? 'translateY(-3px)' : 'none', transition: 'transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease' }}>
      <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: 0, fontFamily: SANS }}>{label}</p>
      <p style={{ fontSize: 24, fontWeight: 700, color: accent ? 'var(--accent)' : 'var(--text-primary)', margin: '6px 0 0', fontVariantNumeric: 'tabular-nums', fontFamily: SANS, lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '4px 0 0', fontFamily: SANS }}>{sub}</p>}
    </div>
  );
}

// ── Μίνι μπάρα-γράφημα (ιστορικό / σύγκριση) ─────────────────────────────────
function BarRow({ label, value, max, valueLabel, tone = 'neutral', hint }: { label: string; value: number; max: number; valueLabel: string; tone?: 'accent' | 'neutral' | 'muted'; hint?: string }) {
  const pct = max > 0 ? Math.max(2, Math.min(100, (value / max) * 100)) : 0;
  const bg = tone === 'accent' ? 'var(--accent)' : tone === 'muted' ? 'var(--text-tertiary)' : 'var(--border-default)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '5px 0' }} title={hint}>
      <span style={{ width: 128, flexShrink: 0, fontSize: 12, color: 'var(--text-secondary)', fontFamily: SANS, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: bg, transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ width: 92, flexShrink: 0, textAlign: 'right', fontSize: 12, fontWeight: 600, color: tone === 'accent' ? 'var(--accent)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', fontFamily: SANS }}>{valueLabel}</span>
    </div>
  );
}

// Segmented control (ομοιόμορφο)
function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div style={{ display: 'flex', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: 2, gap: 2 }}>
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)} style={{ height: 32, padding: '0 13px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontFamily: SANS, fontWeight: value === v ? 600 : 500, background: value === v ? 'var(--accent)' : 'transparent', color: value === v ? 'var(--accent-text)' : 'var(--text-secondary)', transition: 'all 0.15s' }}>{label}</button>
      ))}
    </div>
  );
}

const g2: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 };
const g4: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 165px), 1fr))', gap: 12 };

export default function TabRentROI({ propertyId, userId, propertyValue, profileType = 'individual' }: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
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

  // Εργαλεία (pro)
  const [compRate, setCompRate] = useState('5');
  const [ltv, setLtv] = useState('70');
  const [loanRate, setLoanRate] = useState('3.5');
  const [ifree, setIfree] = useState('0');

  const K = (s: string) => `roi_${propertyId}_${s}`;
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [pr, rc, exp] = await Promise.all([
          supabase.from('user_properties').select('value,target_rent,rental_mode').eq('id', propertyId).maybeSingle(),
          supabase.from('rent_config').select('actual_rent,target_rent').eq('property_id', propertyId).maybeSingle(),
          supabase.from('expenses').select('amount').eq('property_id', propertyId),
        ]);
        const p: any = pr.data || {}; const c: any = rc.data || {};
        setValue(String(propertyValue || p.value || localStorage.getItem(K('value')) || ''));
        setRent(String(c.actual_rent || c.target_rent || p.target_rent || localStorage.getItem(K('rent')) || ''));
        const expSum = (exp.data || []).reduce((s: number, e: any) => s + (e.amount || 0), 0);
        setOpex(String(Math.round(expSum) || localStorage.getItem(K('opex')) || ''));
        if (p.rental_mode === 'short_term') setTerm('short');
        const savedR = localStorage.getItem(K('region')); if (savedR) setRegion(savedR);
      } catch { /* keep defaults */ }
      finally { setLoading(false); }
    })();
  }, [propertyId, propertyValue]);

  // Persist ελαφριά (τοπικά) — δεν χρειάζεται νέος πίνακας.
  useEffect(() => { try { localStorage.setItem(K('value'), value); localStorage.setItem(K('rent'), rent); localStorage.setItem(K('opex'), opex); localStorage.setItem(K('region'), region); } catch { } }, [value, rent, opex, region]);

  const nVal = parseFloat(value) || 0;
  const nRent = parseFloat(rent) || 0;
  const nOpex = parseFloat(opex) || 0;
  const nAppr = parseFloat(appreciation) || 0;

  // Φόρος εισοδήματος (ίδια μηχανή με τη Λογιστική).
  const annualTax = useMemo(() => {
    const gross = nRent * 12;
    if (gross <= 0) return 0;
    if (pro) {
      // Νομικό πρόσωπο: 22% + φόρος μερίσματος 5% στη διανομή (προεπιλογή: πλήρης διανομή,
      // ώστε ο φόρος να δείχνει τι φτάνει πραγματικά στον ιδιοκτήτη).
      const stB = incomeStatement({ regime: 'business', businessForm: entity, grossIncome: gross, itemizedExpenses: nOpex, companyDistribution: entity === 'company' ? 1 : 0 });
      return stB.incomeTax + (stB.dividendTax || 0);
    }
    const regime: TaxRegime = term === 'short' ? 'individual_shortterm' : 'individual_longterm';
    return incomeStatement({ regime, grossIncome: gross, rentsPaidViaBank: true }).incomeTax;
  }, [nRent, nOpex, pro, entity, term]);

  const y = useMemo(() => yields(nRent, nVal, nOpex, annualTax), [nRent, nVal, nOpex, annualTax]);
  const reg = regionByKey(region);
  const verdict = yieldVerdict(y.grossYield);
  const stExact = SHORT_TERM.find(s => s.key === region);

  // Ιστορική διαδρομή: πώς θα κινούνταν η αξία σου τα τελευταία 10/20 έτη.
  const hist = useMemo(() => {
    const base = HISTORY_INDEX.filter(p => p.year >= (histYears === '20' ? 2007 : 2016));
    const latest = HISTORY_INDEX[HISTORY_INDEX.length - 1].price;
    return base.map(p => ({ year: p.year, value: nVal > 0 ? Math.round(nVal * p.price / latest) : Math.round(p.price) }));
  }, [nVal, histYears]);
  const histStart = hist[0]?.value || 0;
  const histEnd = hist[hist.length - 1]?.value || 0;
  const histMax = Math.max(...hist.map(h => h.value), 1);

  // Σύγκριση με εναλλακτικές — ΟΛΑ προ φόρου εισοδήματος για δίκαιη σύγκριση (like-for-like):
  // το ακίνητο με ΚΑΘΑΡΗ απόδοση (προ φόρου) + ανατίμηση· οι εναλλακτικές με τη μεικτή τους απόδοση.
  const compare = useMemo(() => {
    const totalReturn = propertyTotalReturn(y.netYield, nAppr);
    const opts = [
      { key: 'property', label: 'Ακίνητο (απόδοση + ανατίμηση)', annualReturnPct: totalReturn },
      ...BENCHMARKS.filter(b => b.key !== 'inflation').map(b => ({ key: b.key, label: b.label, annualReturnPct: b.annualReturnPct })),
    ];
    return compareInvestments(nVal || 100000, parseInt(cmpYears), opts);
  }, [y.netYield, nAppr, nVal, cmpYears]);
  const compMax = Math.max(...compare.map(c => c.futureValue), 1);

  // Εργαλεία (pro)
  const comp = useMemo(() => compound(nVal, parseFloat(compRate) || 0, parseInt(compYears), Math.max(0, Math.round((nRent * 12 - nOpex - annualTax)))), [nVal, compRate, compYears, nRent, nOpex, annualTax]);
  const lev: LeverageResult = useMemo(() => leverage({ price: nVal, ltvPct: parseFloat(ltv) || 0, loanRatePct: parseFloat(loanRate) || 0, loanYears: 25, grossYieldPct: y.grossYield, opexPctOfRent: nRent > 0 ? (nOpex / (nRent * 12)) * 100 : 20, interestFreePct: parseFloat(ifree) || 0 }), [nVal, ltv, loanRate, y.grossYield, nOpex, nRent, ifree]);

  if (loading) return <div style={{ padding: 40 }}><Spinner label="Φόρτωση αποδόσεων…" /></div>;

  const regimeLabel = pro ? (entity === 'company' ? 'Επιχείρηση · Νομικό πρόσωπο' : 'Επιχείρηση · Φυσικό πρόσωπο') : 'Ιδιώτης';
  const empty = nVal <= 0 || nRent <= 0;

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
        </div>
      </div>

      {/* Στοιχεία (πάντα προσβάσιμα) */}
      <div style={card}>
        <div style={g4}>
          <NumberInput label="Αξία ακινήτου" value={value} onChange={setValue} suffix="€" step={5000} />
          <NumberInput label="Μηνιαίο ενοίκιο" value={rent} onChange={setRent} suffix="€" step={50} />
          <NumberInput label="Ετήσια έξοδα" value={opex} onChange={setOpex} suffix="€" step={100} />
          <CustomSelect label="Περιοχή" value={region} onChange={setRegion} options={REGIONS.map(r => ({ value: r.key, label: `${r.region} · ${r.label}` }))} />
        </div>
        {empty && <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '12px 0 0', fontFamily: SANS }}>Συμπλήρωσε αξία και ενοίκιο για να δεις τις αποδόσεις.</p>}
      </div>

      {!empty && (<>
        {/* KPIs */}
        <div style={g4}>
          <KPI label="Μεικτή απόδοση" value={fp(y.grossYield)} sub={`${fe(y.annualRent, 0)}/έτος`} />
          <KPI label="Καθαρή απόδοση" value={fp(y.netYield)} sub="μετά τα έξοδα" />
          <KPI label="Μετά τον φόρο" value={fp(y.netYieldAfterTax)} sub={`φόρος ${fe(annualTax, 0)}/έτος`} accent />
          {pro
            ? <KPI label="Απόδοση ιδίων (μόχλευση)" value={fp(lev.cashOnCash)} sub={lev.positiveCarry ? 'θετική μόχλευση' : 'αρνητική μόχλευση'} />
            : <KPI label="Μέση αγορά (περιοχή)" value={fp(reg?.grossYield || GREECE_AVG_GROSS_YIELD)} sub={reg?.region || 'Ελλάδα'} />}
        </div>

        {/* 1) Η περιοχή σου */}
        <Section icon={<Landmark size={15} />} title="Η περιοχή σου" sub={`Σύγκριση με τα πραγματικά δεδομένα αγοράς (${MARKET_DATA_ASOF})`} defaultOpen>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <BarRow label="Το ακίνητό σου" value={y.grossYield} max={Math.max(y.grossYield, (reg?.grossYield || 5), ATHENS_AVG_GROSS_YIELD) * 1.1} valueLabel={fp(y.grossYield)} tone="accent" />
            <BarRow label={reg?.label || 'Περιοχή'} value={reg?.grossYield || 0} max={Math.max(y.grossYield, (reg?.grossYield || 5), ATHENS_AVG_GROSS_YIELD) * 1.1} valueLabel={fp(reg?.grossYield || 0)} tone="neutral" hint={reg?.note} />
            <BarRow label="Μέσος όρος Αθήνας" value={ATHENS_AVG_GROSS_YIELD} max={Math.max(y.grossYield, (reg?.grossYield || 5), ATHENS_AVG_GROSS_YIELD) * 1.1} valueLabel={fp(ATHENS_AVG_GROSS_YIELD)} tone="muted" />
            <BarRow label="Εθνικός μέσος" value={GREECE_AVG_GROSS_YIELD} max={Math.max(y.grossYield, (reg?.grossYield || 5), ATHENS_AVG_GROSS_YIELD) * 1.1} valueLabel={fp(GREECE_AVG_GROSS_YIELD)} tone="muted" />
          </div>
          <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: verdict.tone === 'good' ? 'var(--accent-soft)' : 'var(--bg-elevated)', border: `1px solid ${verdict.tone === 'good' ? 'var(--border-accent)' : 'var(--border-subtle)'}` }}>
            <p style={{ margin: 0, fontSize: 12.5, color: verdict.tone === 'good' ? 'var(--accent)' : 'var(--text-secondary)', fontFamily: SANS, fontWeight: 600 }}>{verdict.label}</p>
            {reg && <p style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--text-tertiary)', fontFamily: SANS, lineHeight: 1.5 }}>{reg.note}</p>}
          </div>
          {term === 'short' && (
            <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--text-secondary)', fontFamily: SANS, lineHeight: 1.55 }}>
              {stExact
                ? <>Βραχυχρόνια αναφορά περιοχής: πληρότητα ~{stExact.occupancy}%, μέση τιμή ~{fe(stExact.adr, 0)}/νύχτα, ενδεικτική μεικτή ~{fp(stExact.grossYield)} (vs {fp(stExact.longTermYield)} μακροχρόνια).{stExact.redZone ? ' Προσοχή: κόκκινη ζώνη ΑΜΑ — δεν επιτρέπονται νέες εγγραφές.' : ''} </>
                : <>Στη βραχυχρόνια τα μεικτά έσοδα είναι συνήθως υψηλότερα, αλλά με έντονη εποχικότητα. </>}
              Η καθαρή βραχυχρόνια είναι πολύ χαμηλότερη από τη μεικτή (λειτουργικά κόστη 40–60%: καθαρισμοί, διαχείριση, ΤΑΚΚ, κενές νύχτες).
            </div>
          )}
        </Section>

        {/* 2) Ιστορική διαδρομή */}
        <Section icon={<TrendingUp size={15} />} title={`Ιστορική διαδρομή ${histYears}ετίας`} sub="Πώς θα κινούνταν η αξία ενός ακινήτου σαν το δικό σου (δείκτης ΤτΕ)">
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            <Seg value={histYears} onChange={setHistYears} options={[['10', '10 έτη'], ['20', '20 έτη']]} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 130, padding: '0 2px' }}>
            {hist.map(h => {
              const isPeak = h.year === HISTORY_ANCHORS.peakYear, isTrough = h.year === HISTORY_ANCHORS.troughYear, isNow = h.year === 2026;
              return (
                <div key={h.year} title={`${h.year}: ${fe(h.value, 0)}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: '100%', height: `${Math.max(4, (h.value / histMax) * 100)}%`, borderRadius: '4px 4px 0 0', background: isNow ? 'var(--accent)' : isTrough ? 'var(--negative)' : isPeak ? 'var(--warning)' : 'var(--border-default)', transition: 'height 0.4s ease' }} />
                  <span style={{ fontSize: 8.5, color: 'var(--text-tertiary)', fontFamily: SANS }}>{`'${String(h.year).slice(2)}`}</span>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12 }}>
            <div><p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.4px', fontFamily: SANS }}>{hist[0]?.year}</p><p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '2px 0 0', fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>{fe(histStart, 0)}</p></div>
            <div><p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.4px', fontFamily: SANS }}>Σήμερα</p><p style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)', margin: '2px 0 0', fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>{fe(histEnd, 0)}</p></div>
            <div><p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.4px', fontFamily: SANS }}>Μεταβολή</p><p style={{ fontSize: 15, fontWeight: 700, color: histEnd >= histStart ? 'var(--positive)' : 'var(--negative)', margin: '2px 0 0', fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>{histStart > 0 ? `${histEnd >= histStart ? '+' : ''}${(((histEnd - histStart) / histStart) * 100).toFixed(0)}%` : '—'}</p></div>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '12px 0 0', fontFamily: SANS, lineHeight: 1.5 }}>{HISTORY_ANCHORS.note} <strong style={{ color: 'var(--text-secondary)' }}>Παρελθούσες αποδόσεις δεν εγγυώνται μελλοντικές.</strong></p>
        </Section>

        {/* 3) Σύγκριση με εναλλακτικές */}
        <Section icon={<Layers size={15} />} title="Σύγκριση με εναλλακτικές επενδύσεις" sub={`Ίδιο ποσό (${fe(nVal, 0)}) ανατοκισμένο σε ${cmpYears} έτη`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: SANS }}>Ετήσια ανατίμηση ακινήτου</span>
              <div style={{ width: 90 }}><NumberInput label="" value={appreciation} onChange={setAppreciation} suffix="%" step={0.5} max={20} /></div>
            </div>
            <Seg value={cmpYears} onChange={setCmpYears} options={[['10', '10 έτη'], ['20', '20 έτη']]} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {compare.map(c => (
              <BarRow key={c.key} label={c.label} value={c.futureValue} max={compMax} valueLabel={fe(c.futureValue, 0)} tone={c.key === 'property' ? 'accent' : 'neutral'} hint={`${fp(c.annualReturnPct)}/έτος · +${c.totalReturnPct.toFixed(0)}% συνολικά`} />
            ))}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '12px 0 0', fontFamily: SANS, lineHeight: 1.55 }}>
            Όλα <strong style={{ color: 'var(--text-secondary)' }}>προ φόρου εισοδήματος</strong> για δίκαιη σύγκριση: το ακίνητο = καθαρή απόδοση + ανατίμηση· οι εναλλακτικές με τη μεικτή τους απόδοση (τόκοι κατάθεσης/ομολόγου φορολογούνται 15%). Οι εναλλακτικές είναι <strong style={{ color: 'var(--text-secondary)' }}>παθητικές & ρευστές</strong>· το ακίνητο έχει κόστος συναλλαγής (~4–10%), χρόνο και συγκέντρωση κινδύνου. Το S&P 500 ETF (accumulating) δεν έχει φόρο μερίσματος. Ενδεικτικά, όχι επενδυτική συμβουλή.
          </p>
        </Section>

        {/* 4) Εργαλεία & μοχλοί — μόνο επαγγελματίας */}
        {pro && (
          <Section icon={<Percent size={15} />} title="Εργαλεία απόδοσης" sub="Ανατοκισμός επανεπένδυσης & μόχλευση (απόδοση ιδίων κεφαλαίων)">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 16 }}>
              {/* Ανατοκισμός */}
              <div style={{ padding: 14, borderRadius: 12, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <p style={{ ...titleStyle, marginBottom: 12 }}>Ανατοκισμός επανεπένδυσης</p>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ width: 150 }}><NumberInput label="Απόδοση επανεπένδυσης" value={compRate} onChange={setCompRate} suffix="%" step={0.5} /></div>
                  <div><p style={{ ...subStyle, margin: '0 0 6px' }}>Ορίζοντας</p><Seg value={compYears} onChange={setCompYears} options={[['10', '10 έτη'], ['20', '20 έτη']]} /></div>
                </div>
                <div style={{ marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <div><p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.4px', fontFamily: SANS }}>Τελική αξία</p><p style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)', margin: '2px 0 0', fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>{fe(comp.futureValue, 0)}</p></div>
                  <div><p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.4px', fontFamily: SANS }}>Κέρδος ανατοκισμού</p><p style={{ fontSize: 18, fontWeight: 700, color: 'var(--positive)', margin: '2px 0 0', fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>{fe(comp.totalGrowth, 0)}</p></div>
                </div>
                <p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', margin: '10px 0 0', fontFamily: SANS, lineHeight: 1.5 }}>Αξία + ετήσια επανεπένδυση της καθαρής ταμειακής ροής ({fe(Math.max(0, nRent * 12 - nOpex - annualTax), 0)}/έτος).</p>
              </div>
              {/* Μόχλευση */}
              <div style={{ padding: 14, borderRadius: 12, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <p style={{ ...titleStyle, marginBottom: 12 }}>Μόχλευση (δανεισμός)</p>
                <div style={g2}>
                  <NumberInput label="Δάνειο (% αξίας)" value={ltv} onChange={setLtv} suffix="%" max={100} />
                  <NumberInput label="Επιτόκιο" value={loanRate} onChange={setLoanRate} suffix="%" step={0.1} />
                  <NumberInput label="Άτοκο μέρος (Σπίτι μου ΙΙ)" value={ifree} onChange={setIfree} suffix="%" max={100} />
                </div>
                <div style={{ marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <div><p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.4px', fontFamily: SANS }}>Ίδια κεφάλαια</p><p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '2px 0 0', fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>{fe(lev.equity, 0)}</p></div>
                  <div><p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.4px', fontFamily: SANS }}>Απόδοση ιδίων</p><p style={{ fontSize: 16, fontWeight: 700, color: lev.cashOnCash >= 0 ? 'var(--accent)' : 'var(--negative)', margin: '2px 0 0', fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>{fp(lev.cashOnCash)}</p></div>
                  <div><p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.4px', fontFamily: SANS }}>Ετήσια ροή</p><p style={{ fontSize: 16, fontWeight: 700, color: lev.cashFlow >= 0 ? 'var(--positive)' : 'var(--negative)', margin: '2px 0 0', fontFamily: SANS, fontVariantNumeric: 'tabular-nums' }}>{fe(lev.cashFlow, 0)}</p></div>
                </div>
                <p style={{ fontSize: 10.5, color: lev.positiveCarry ? 'var(--positive)' : 'var(--warning)', margin: '10px 0 0', fontFamily: SANS, lineHeight: 1.5 }}>{lev.positiveCarry ? `Θετική μόχλευση: καθαρή απόδοση ${fp(lev.unleveredYield)} > κόστος δανείου ${fp(lev.effectiveLoanRate)}. Η ροή μπορεί να είναι αρνητική λόγω χρεολυσίου (χτίζεις κεφάλαιο).` : `Αρνητική μόχλευση: κόστος δανείου ${fp(lev.effectiveLoanRate)} ≥ καθαρή απόδοση ${fp(lev.unleveredYield)}.`}</p>
              </div>
            </div>
          </Section>
        )}

        {/* Μοχλοί μεγιστοποίησης — επαγγελματίας (πλήρες) / ιδιώτης (μόνο βασικά) */}
        <Section icon={<Wallet size={15} />} title="Μοχλοί μεγιστοποίησης απόδοσης" sub={pro ? 'Συγκεκριμένες κινήσεις με ποσοτικοποιημένη επίδραση & ρίσκο' : 'Απλές κινήσεις που ανεβάζουν την καθαρή απόδοση'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {YIELD_LEVERS.filter(l => pro || l.audience === 'all').map(l => (
              <div key={l.key} style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0, fontFamily: SANS }}>{l.title}</p>
                  {l.href && <a href={l.href} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', color: 'var(--text-tertiary)', display: 'inline-flex' }}><ArrowUpRight size={14} /></a>}
                </div>
                <p style={{ fontSize: 12, color: 'var(--accent)', margin: 0, fontFamily: SANS, fontWeight: 500 }}>{l.impact}</p>
                <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', margin: '5px 0 0', fontFamily: SANS, lineHeight: 1.55 }}>{l.detail}</p>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '5px 0 0', fontFamily: SANS, lineHeight: 1.5 }}><strong style={{ color: 'var(--warning)' }}>Προσοχή:</strong> {l.risk}</p>
              </div>
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
                Μέσω συμβολαιογράφου. Μετά από 2 άγονους η τιμή πέφτει στο 80%, μετά τον 3ο στο 65% — έως −35% της εκτιμηθείσας αξίας. Εγγύηση {AUCTION_FACTS.guaranteePct}% + τέλος {AUCTION_FACTS.systemFee}€. Μόνο ~1 στους 7 βρίσκει αγοραστή. {AUCTION_FACTS.note}
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
