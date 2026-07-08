'use client';

// ═══════════════════════════════════════════════════════════════════════════
// Δυναμική τιμολόγηση: διαφανείς προτάσεις τιμής/νύχτα για βραχυχρόνια μίσθωση.
// Βασίζεται στο ιστορικό διαμονών του ακινήτου (χειροκίνητο + iCal), στην
// ελληνική εποχικότητα, στις αργίες, στην ημέρα εβδομάδας, στο lead time και
// στην πληρότητα. Κάθε τιμή είναι εξηγήσιμη (ανάλυση παραγόντων). Οι τιμές είναι
// ΠΡΟΤΑΣΕΙΣ: τις εφαρμόζεις εσύ στα κανάλια (Airbnb/Booking).
// Σχεδίαση: near-monochrome μπλε, premium, Google-minimal.
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, PageTitle, KPIGrid, InfoBanner, Btn, ExportButton, SecHdr, fe, fd } from '@/components/Theme';
import { NumberInput } from './UIComponents';
import { downloadCsv } from './exportCsv';
import {
  recommendPrices, summarize, suggestBase, suggestGuardrails, bookedDatesFromStays,
  realizedAdr, SEASON_LABELS, type DayPrice, type PricingStay,
} from '@/lib/pricing/dynamicPricing';

interface Props { propertyId: string; userId: string; propertyRent?: number; propertySqm?: number }

const WEEKDAYS = ['Δε', 'Τρ', 'Τε', 'Πε', 'Πα', 'Σα', 'Κυ'];
const MONTH_NAMES = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
const todayIso = () => new Date().toISOString().slice(0, 10);

export default function TabPricing({ propertyId, userId, propertyRent }: Props) {
  const supabase = createClient();
  const [stays, setStays] = useState<PricingStay[]>([]);
  const [loading, setLoading] = useState(true);
  const [base, setBase] = useState(0);
  const [min, setMin] = useState(0);
  const [max, setMax] = useState(0);
  const [horizon, setHorizon] = useState(60);
  const [sel, setSel] = useState<DayPrice | null>(null);
  const [touched, setTouched] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('client_stays').select('check_in,check_out,nights,nightly_rate,total').eq('user_id', userId).eq('property_id', propertyId);
    setStays((data || []) as PricingStay[]);
    setLoading(false);
  }, [userId, propertyId]);

  useEffect(() => { load(); }, [load]);

  // Πρόταση βάσης: από ADR ιστορικού· αλλιώς χοντρική εκτίμηση από μηνιαίο ενοίκιο.
  useEffect(() => {
    if (touched) return;
    const fromHistory = suggestBase(stays);
    const fallback = propertyRent ? Math.round((propertyRent / 30) * 2.2) : 0;
    const b = fromHistory || fallback;
    if (b > 0) {
      setBase(b);
      const g = suggestGuardrails(b);
      setMin(g.min); setMax(g.max);
    }
  }, [stays, propertyRent, touched]);

  const bookedDates = useMemo(() => bookedDatesFromStays(stays), [stays]);
  const adr = useMemo(() => realizedAdr(stays), [stays]);

  const rows = useMemo(() => base > 0
    ? recommendPrices(todayIso(), horizon, { base, min: min || undefined, max: max || undefined, stays, bookedDates, today: todayIso() })
    : [], [base, min, max, horizon, stays, bookedDates]);

  const sum = useMemo(() => summarize(rows), [rows]);

  const kpis = useMemo(() => [
    { label: 'Μέση τιμή / νύχτα', value: base > 0 ? fe(sum.avg, 0) : '—', sub: 'διαθέσιμες ημέρες' },
    { label: 'Αιχμή', value: base > 0 ? fe(sum.max, 0) : '—', sub: 'υψηλότερη πρόταση' },
    { label: 'Χαμηλότερη', value: base > 0 ? fe(sum.min, 0) : '—', sub: 'χαμηλότερη πρόταση' },
    { label: 'Κλεισμένες', value: String(sum.bookedCount), sub: `σε ${horizon} ημέρες`, tone: 'neutral' as const },
  ], [sum, base, horizon]);

  // Ένταση χρώματος heatmap: κανονικοποίηση τιμής στο [min..max] του διαστήματος.
  const priceRange = useMemo(() => {
    const avail = rows.filter(r => !r.booked).map(r => r.price);
    return { lo: avail.length ? Math.min(...avail) : 0, hi: avail.length ? Math.max(...avail) : 1 };
  }, [rows]);
  const intensity = (p: number) => {
    const { lo, hi } = priceRange;
    if (hi <= lo) return 0.5;
    return Math.max(0, Math.min(1, (p - lo) / (hi - lo)));
  };

  // Ομαδοποίηση ανά μήνα για το ημερολόγιο.
  const months = useMemo(() => {
    const m = new Map<string, DayPrice[]>();
    rows.forEach(r => { const k = r.date.slice(0, 7); const a = m.get(k) || []; a.push(r); m.set(k, a); });
    return [...m.entries()];
  }, [rows]);

  const exportCsv = () => {
    downloadCsv('dynamic-pricing.csv',
      ['Ημερομηνία', 'Ημέρα', 'Τιμή/νύχτα (€)', 'Εποχή', 'Αργία', 'Κατάσταση'],
      rows.map(r => [r.date, WEEKDAYS[(r.dow + 6) % 7], String(r.price), SEASON_LABELS[r.season], r.holidayName || '', r.booked ? 'Κλεισμένο' : 'Διαθέσιμο']));
  };

  const setBaseManual = (v: number) => { setTouched(true); setBase(v); };

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>
      <PageTitle title="Δυναμική τιμολόγηση" titleHint="Προτεινόμενη τιμή ανά νύχτα, με βάση τα δικά σου δεδομένα και την ελληνική εποχικότητα. Τις τιμές τις εφαρμόζεις εσύ στα κανάλια."
        sub="Διαφανείς προτάσεις τιμής: εποχή, ημέρα εβδομάδας, αργίες, ζήτηση και last minute — όλα εξηγήσιμα."
        right={rows.length > 0 ? <ExportButton onClick={exportCsv} /> : undefined} />

      <InfoBanner tone="info">
        Οι τιμές είναι <strong>προτάσεις</strong>, όχι αυτόματη αλλαγή στα κανάλια. Βασίζονται στο ιστορικό διαμονών του ακινήτου (χειροκίνητο και iCal), στη γνωστή εποχικότητα της ελληνικής αγοράς, στις αργίες, στην ημέρα της εβδομάδας και στη ζήτηση. Πάτησε μια ημέρα για να δεις πώς προκύπτει η τιμή της.
      </InfoBanner>

      {/* Ρυθμίσεις */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 14, margin: '18px 0' }}>
        <NumberInput label="Βασική τιμή / νύχτα" value={base ? String(base) : ''} onChange={v => setBaseManual(Number(v) || 0)} suffix="€" />
        <NumberInput label="Κατώτατο όριο" value={min ? String(min) : ''} onChange={v => { setTouched(true); setMin(Number(v) || 0); }} suffix="€" />
        <NumberInput label="Ανώτατο όριο" value={max ? String(max) : ''} onChange={v => { setTouched(true); setMax(Number(v) || 0); }} suffix="€" />
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Ορίζοντας</div>
          <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border-subtle)', borderRadius: 10, overflow: 'hidden', height: 42 }}>
            {[30, 60, 90].map(h => (
              <button key={h} onClick={() => setHorizon(h)} style={{ flex: 1, border: 'none', cursor: 'pointer', fontFamily: T.font.sans, fontSize: 13, fontWeight: 600, background: horizon === h ? 'var(--accent)' : 'transparent', color: horizon === h ? '#fff' : 'var(--text-secondary)' }}>{h} ημ.</button>
            ))}
          </div>
        </div>
      </div>

      {adr > 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 16 }}>
          Μέση πραγματική τιμή που έχεις πετύχει (ADR): <strong style={{ color: 'var(--text-secondary)', fontFamily: T.font.num }}>{fe(adr, 0)}</strong> / νύχτα, από {stays.length} διαμονές. Χρησιμοποιείται ως αφετηρία.
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Φόρτωση…</div>
      ) : base <= 0 ? (
        <div style={{ background: 'var(--bg-base)', boxShadow: 'var(--well-inset)', borderRadius: 14, padding: '40px 20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13, lineHeight: 1.6 }}>
          Όρισε μια βασική τιμή ανά νύχτα για να δεις τις προτεινόμενες τιμές. Αν καταχωρήσεις διαμονές (χειροκίνητα ή με εισαγωγή iCal), η αφετηρία υπολογίζεται αυτόματα από το ιστορικό σου.
        </div>
      ) : (
        <>
          <KPIGrid items={kpis} />

          {/* Ημερολόγιο-heatmap */}
          <div style={{ marginTop: 24 }}>
            <SecHdr label="Ημερολόγιο τιμών" sub="Πιο σκούρο μπλε = υψηλότερη προτεινόμενη τιμή. Πάτησε μια ημέρα για ανάλυση." />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
              {months.map(([key, days]) => {
                const [yy, mm] = key.split('-').map(Number);
                const firstDow = new Date(Date.UTC(yy, mm - 1, 1)).getUTCDay();
                const lead = (firstDow + 6) % 7; // Δευτέρα-πρώτη
                const byDay = new Map(days.map(d => [Number(d.date.slice(8, 10)), d]));
                const daysInMonth = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
                return (
                  <div key={key} style={{ flex: '1 1 300px', minWidth: 280, background: 'var(--surface-raised)', border: '1px solid var(--border-raised)', borderRadius: 14, padding: 16, boxShadow: 'var(--highlight-inset), var(--elev-1)' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>{MONTH_NAMES[mm - 1]} {yy}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                      {WEEKDAYS.map(w => <div key={w} style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', paddingBottom: 4 }}>{w}</div>)}
                      {Array.from({ length: lead }).map((_, i) => <div key={'b' + i} />)}
                      {Array.from({ length: daysInMonth }).map((_, i) => {
                        const dayNum = i + 1;
                        const d = byDay.get(dayNum);
                        if (!d) return <div key={dayNum} style={{ aspectRatio: '1', borderRadius: 8, background: 'var(--bg-base)', opacity: 0.4 }} />;
                        const t = intensity(d.price);
                        const strong = t > 0.55 && !d.booked;
                        return (
                          <button key={dayNum} onClick={() => setSel(d)} title={d.holidayName || ''} style={{
                            position: 'relative', aspectRatio: '1', borderRadius: 8, cursor: 'pointer', overflow: 'hidden',
                            border: sel?.date === d.date ? '2px solid var(--accent)' : '1px solid var(--border-subtle)',
                            background: d.booked ? 'var(--bg-base)' : 'var(--surface-raised)', padding: 0,
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                          }}>
                            {!d.booked && <span style={{ position: 'absolute', inset: 0, background: 'var(--accent)', opacity: 0.10 + t * 0.80 }} />}
                            <span style={{ position: 'relative', fontSize: 10, fontWeight: 600, color: d.booked ? 'var(--text-tertiary)' : strong ? 'rgba(255,255,255,0.85)' : 'var(--text-tertiary)' }}>{dayNum}</span>
                            <span style={{ position: 'relative', fontSize: 11, fontWeight: 700, fontFamily: T.font.num, color: d.booked ? 'var(--text-tertiary)' : strong ? '#fff' : 'var(--text-primary)' }}>
                              {d.booked ? '—' : fe(d.price, 0).replace(/\s?€/, '')}
                            </span>
                            {d.isHoliday && !d.booked && <span style={{ position: 'absolute', top: 3, right: 3, width: 4, height: 4, borderRadius: '50%', background: strong ? '#fff' : 'var(--accent)' }} />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Υπόμνημα */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 14, fontSize: 11, color: 'var(--text-tertiary)', alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 44, height: 10, borderRadius: 3, background: 'linear-gradient(90deg, color-mix(in srgb, var(--accent) 12%, transparent), var(--accent))' }} />χαμηλή → υψηλή τιμή</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)' }} />αργία / υψηλή ζήτηση</span>
              <span>«—» = ήδη κλεισμένη</span>
            </div>
          </div>

          {/* Λεπτομέρεια επιλεγμένης ημέρας */}
          {sel && (
            <div style={{ marginTop: 20, background: 'var(--bg-base)', boxShadow: 'var(--well-inset)', borderRadius: 14, padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{fd(sel.date)}{sel.holidayName ? ` · ${sel.holidayName}` : ''}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>Εποχή {SEASON_LABELS[sel.season]}{sel.isWeekend ? ' · Σαββατοκύριακο' : ''}{sel.booked ? ' · Ήδη κλεισμένη' : ''}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, fontFamily: T.font.num, color: 'var(--accent)' }}>{fe(sel.price, 0)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>ανά νύχτα</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)' }}>
                  <span>Βάση</span><span style={{ fontFamily: T.font.num }}>{fe(sel.base, 0)}</span>
                </div>
                {sel.factors.map((f, i) => {
                  const pct = Math.round((f.mult - 1) * 100);
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)' }}>
                      <span>{f.label}</span>
                      <span style={{ fontFamily: T.font.num, color: pct > 0 ? 'var(--positive)' : pct < 0 ? 'var(--negative)' : 'var(--text-tertiary)' }}>{pct > 0 ? '+' : ''}{pct}%</span>
                    </div>
                  );
                })}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, borderTop: '1px solid var(--border-subtle)', paddingTop: 8, marginTop: 2 }}>
                  <span>Προτεινόμενη τιμή</span><span style={{ fontFamily: T.font.num }}>{fe(sel.price, 0)}</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
