'use client';

// ═══════════════════════════════════════════════════════════════════════════
// Δυναμική τιμολόγηση (v2): διαφανείς προτάσεις τιμής/νύχτα για βραχυχρόνια
// μίσθωση, με προβολή εσόδων και κέρδους έναντι σταθερής τιμής, εντοπισμό κενών
// ημερών προς πλήρωση (με ενέργειες), και αποθήκευση ρυθμίσεων ανά ακίνητο.
// Επικοινωνεί με το υπόλοιπο app σε πραγματικό χρόνο: ενημερώνεται από τις
// διαμονές/iCal (πληρότητα) και ενημερώνει (ρυθμίσεις + υπενθυμίσεις ημερολογίου).
// Σχεδίαση: near-monochrome μπλε, premium 3D, Google-minimal, τυποποιημένα πεδία.
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, PageTitle, KPIGrid, InfoBanner, Btn, ExportButton, SecHdr, fe, fd } from '@/components/Theme';
import { NumberInput } from './UIComponents';
import { downloadCsv } from './exportCsv';
import {
  recommendPrices, summarize, suggestBase, suggestBaseFallback, suggestGuardrails, bookedDatesFromStays,
  realizedAdr, projectRevenue, findGaps, estimateSeasonalOccupancy, SEASON_LABELS,
  type DayPrice, type PricingStay, type Gap,
} from '@/lib/pricing/dynamicPricing';

interface Props { propertyId: string; userId: string; propertyRent?: number; propertySqm?: number }

const WEEKDAYS = ['Δε', 'Τρ', 'Τε', 'Πε', 'Πα', 'Σα', 'Κυ'];
const MONTH_NAMES = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
const todayIso = () => new Date().toISOString().slice(0, 10);
const addDaysIso = (d: string, n: number) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

export default function TabPricing({ propertyId, userId, propertyRent, propertySqm }: Props) {
  const supabase = createClient();
  const [stays, setStays] = useState<PricingStay[]>([]);
  const [loading, setLoading] = useState(true);
  const [base, setBase] = useState(0);
  const [min, setMin] = useState(0);
  const [max, setMax] = useState(0);
  const [wknd, setWknd] = useState(18);      // premium Σαββατοκύριακου (%)
  const [minStay, setMinStay] = useState(1);
  const nowYear = new Date().getFullYear();
  const [pyear, setPyear] = useState(nowYear); // έτος τιμολόγησης
  const [showPast, setShowPast] = useState(false); // εμφάνιση περασμένων μηνών
  const [sel, setSel] = useState<DayPrice | null>(null);
  const [touched, setTouched] = useState(false);
  const [savedTick, setSavedTick] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const loadedSettings = useRef(false);

  // ── Φόρτωση διαμονών + αποθηκευμένων ρυθμίσεων ─────────────────────────────
  const loadStays = useCallback(async () => {
    const { data } = await supabase.from('client_stays').select('check_in,check_out,nights,nightly_rate,total').eq('user_id', userId).eq('property_id', propertyId);
    setStays((data || []) as PricingStay[]);
  }, [userId, propertyId]);

  const loadSettings = useCallback(async () => {
    const { data } = await supabase.from('pricing_settings').select('*').eq('user_id', userId).eq('property_id', propertyId).maybeSingle();
    if (data) {
      if (data.base != null) setBase(Number(data.base));
      if (data.min_price != null) setMin(Number(data.min_price));
      if (data.max_price != null) setMax(Number(data.max_price));
      if (data.weekend_premium != null) setWknd(Math.round(Number(data.weekend_premium) * 100));
      if (data.min_stay != null) setMinStay(Number(data.min_stay));
      loadedSettings.current = true;
      setTouched(true); // υπάρχουν αποθηκευμένες τιμές, μην τις παρακάμψεις με auto
    }
  }, [userId, propertyId]);

  useEffect(() => {
    (async () => { setLoading(true); await Promise.all([loadStays(), loadSettings()]); setLoading(false); })();
  }, [loadStays, loadSettings]);

  // ── Realtime: διαμονές, iCal, ρυθμίσεις → ζωντανή ενημέρωση ────────────────
  useEffect(() => {
    const ch = supabase.channel('pricing-' + propertyId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_stays', filter: `user_id=eq.${userId}` }, () => loadStays())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ical_feeds', filter: `user_id=eq.${userId}` }, () => loadStays())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pricing_settings', filter: `user_id=eq.${userId}` }, () => loadSettings())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, propertyId, loadStays, loadSettings]);

  // Αρχική πρόταση βάσης (μόνο αν δεν υπάρχουν αποθηκευμένες ρυθμίσεις).
  useEffect(() => {
    if (touched || loadedSettings.current) return;
    const b = suggestBase(stays) || suggestBaseFallback(propertyRent, propertySqm);
    if (b > 0) { setBase(b); const g = suggestGuardrails(b); setMin(g.min); setMax(g.max); }
  }, [stays, propertyRent, propertySqm, touched]);

  // ── Αποθήκευση ρυθμίσεων (debounced) ──────────────────────────────────────
  const settingsRef = useRef({ base, min, max, wknd, minStay, touched });
  useEffect(() => { settingsRef.current = { base, min, max, wknd, minStay, touched }; });
  const persist = useCallback((v: { base: number; min: number; max: number; wknd: number; minStay: number }) =>
    supabase.from('pricing_settings').upsert({
      user_id: userId, property_id: propertyId, base: v.base, min_price: v.min || null, max_price: v.max || null,
      weekend_premium: v.wknd / 100, min_stay: v.minStay, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,property_id' }), [userId, propertyId]);
  useEffect(() => {
    if (!touched || base <= 0) return;
    const t = setTimeout(async () => { await persist({ base, min, max, wknd, minStay }); setSavedTick(x => x + 1); }, 700);
    return () => clearTimeout(t);
  }, [base, min, max, wknd, minStay, touched, persist]);
  // Flush κατά την έξοδο: η τελευταία αλλαγή δεν χάνεται αν φύγεις μέσα στα 700ms.
  useEffect(() => () => {
    const v = settingsRef.current;
    if (v.touched && v.base > 0) persist(v);
  }, [persist]);

  const bookedDates = useMemo(() => bookedDatesFromStays(stays), [stays]);
  const adr = useMemo(() => realizedAdr(stays), [stays]);

  // Όλο το έτος (Ιαν–Δεκ) για το ημερολόγιο. Οι υπολογισμοί (έσοδα/πληρότητα/
  // κενά) γίνονται μόνο στις ΜΕΛΛΟΝΤΙΚΕΣ ημέρες· οι περασμένοι μήνες μπορούν να
  // εμφανιστούν στο ημερολόγιο αλλά μένουν κρυμμένοι από προεπιλογή.
  const yearDays = useMemo(() => {
    const from = `${pyear}-01-01`;
    const days = Math.max(1, Math.round((new Date(`${pyear}-12-31`).getTime() - new Date(from).getTime()) / 86400000) + 1);
    return { from, days };
  }, [pyear]);
  const yearRows = useMemo(() => base > 0
    ? recommendPrices(yearDays.from, yearDays.days, { base, min: min || undefined, max: max || undefined, stays, bookedDates, today: todayIso(), weekendPremium: wknd / 100 })
    : [], [base, min, max, yearDays, stays, bookedDates, wknd]);
  // Μελλοντικές ημέρες (για KPIs/προβολή/κενά): από σήμερα και μετά για το τρέχον
  // έτος, όλες για μελλοντικά έτη.
  const rows = useMemo(() => pyear === nowYear ? yearRows.filter(r => r.date >= todayIso()) : yearRows, [yearRows, pyear, nowYear]);

  const sum = useMemo(() => summarize(rows), [rows]);
  // Πληρότητα: προσωπική από το ιστορικό σου (αν υπάρχει αρκετό), αλλιώς βάση.
  const occBySeason = useMemo(() => estimateSeasonalOccupancy(stays), [stays]);
  const personalizedOcc = stays.length >= 4;
  const projection = useMemo(() => base > 0 ? projectRevenue(rows, base, occBySeason) : null, [rows, base, occBySeason]);
  const gaps = useMemo(() => findGaps(rows, todayIso()), [rows]);

  const kpis = useMemo(() => [
    { label: 'Μέση τιμή / νύχτα', value: base > 0 ? fe(sum.avg, 0) : '—', sub: 'διαθέσιμες ημέρες' },
    { label: 'Αιχμή', value: base > 0 ? fe(sum.max, 0) : '—', sub: 'υψηλότερη πρόταση' },
    { label: 'Εκτιμώμενη πληρότητα', value: projection ? projection.occPct + '%' : '—', sub: pyear === nowYear ? 'ως το τέλος του έτους' : `για το ${pyear}` },
    { label: 'Κέρδος vs σταθερής', value: projection ? `+${fe(projection.uplift, 0)}` : '—', sub: projection ? `+${projection.upliftPct}% έσοδα` : '', tone: (projection && projection.uplift > 0 ? 'positive' : 'neutral') as 'positive' | 'neutral' },
  ], [sum, base, pyear, nowYear, projection]);

  const priceRange = useMemo(() => {
    const avail = rows.filter(r => !r.booked).map(r => r.price);
    return { lo: avail.length ? Math.min(...avail) : 0, hi: avail.length ? Math.max(...avail) : 1 };
  }, [rows]);
  // Κανονικοποίηση 0..1. Επιστρέφει και την «οπτική» ένταση με πιο απότομη
  // καμπύλη ώστε οι μέρες αιχμής να ξεχωρίζουν έντονα από τις χαμηλές.
  const norm = (p: number) => { const { lo, hi } = priceRange; return hi <= lo ? 0.5 : Math.max(0, Math.min(1, (p - lo) / (hi - lo))); };
  const fillOpacity = (t: number) => 0.05 + Math.pow(t, 1.25) * 0.93;

  // Ομαδοποίηση όλου του έτους ανά μήνα (για το ημερολόγιο).
  const months = useMemo(() => {
    const m = new Map<string, DayPrice[]>();
    yearRows.forEach(r => { const k = r.date.slice(0, 7); const a = m.get(k) || []; a.push(r); m.set(k, a); });
    return [...m.entries()];
  }, [yearRows]);
  const todayMonth = todayIso().slice(0, 7);
  const isPastMonth = (key: string) => pyear === nowYear && key < todayMonth;
  const pastCount = useMemo(() => months.filter(([k]) => isPastMonth(k)).length, [months, pyear, nowYear]);
  const visibleMonths = useMemo(() => months.filter(([k]) => showPast || !isPastMonth(k)), [months, showPast, pyear, nowYear]);

  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(null), 2600); };

  // Ενέργεια: υπενθύμιση στο Ημερολόγιο για πλήρωση κενού.
  const remindGap = async (g: Gap) => {
    const rd = (() => { const wanted = addDaysIso(g.start, -5); return wanted < todayIso() ? todayIso() : wanted; })();
    const { error } = await supabase.from('calendar_events').insert({
      property_id: propertyId, user_id: userId, title: `Γέμισε κενές μέρες ${fd(g.start)} - ${fd(g.end)}`,
      category: 'reminder', event_date: rd, priority: g.soon ? 'high' : 'medium', status: 'pending', source: 'manual',
      notes: `${g.nights} κενές νύχτες. Προτεινόμενη τιμή πλήρωσης ${fe(g.fillPrice, 0)}/νύχτα${minStay > 1 ? `, ελάχιστη διαμονή ${minStay} νύχτες` : ''}.`,
    });
    flash(error ? `Σφάλμα: ${error.message}` : 'Η υπενθύμιση προστέθηκε στο Ημερολόγιο');
  };
  // Ενέργεια: αντιγραφή κειμένου προσφοράς last minute.
  const copyOffer = (g: Gap) => {
    const txt = `Τελευταία διαθεσιμότητα ${fd(g.start)} - ${fd(g.end)} (${g.nights} ${g.nights === 1 ? 'νύχτα' : 'νύχτες'}) σε ειδική τιμή ${fe(g.fillPrice, 0)} ανά νύχτα${minStay > 1 ? `, ελάχιστη διαμονή ${minStay} νύχτες` : ''}. Κλείσε τώρα, οι ημερομηνίες είναι περιορισμένες.`;
    navigator.clipboard?.writeText(txt);
    flash('Το κείμενο προσφοράς αντιγράφηκε');
  };

  const exportCsv = () => {
    downloadCsv('dynamic-pricing.csv',
      ['Ημερομηνία', 'Ημέρα', 'Τιμή/νύχτα (€)', 'Εποχή', 'Αργία', 'Κατάσταση'],
      rows.map(r => [r.date, WEEKDAYS[(r.dow + 6) % 7], String(r.price), SEASON_LABELS[r.season], r.holidayName || '', r.booked ? 'Κλεισμένο' : 'Διαθέσιμο']));
  };

  const mark = (fn: (v: number) => void) => (v: number) => { setTouched(true); fn(v); };

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>
      <PageTitle title="Δυναμική τιμολόγηση" titleHint="Προτεινόμενη τιμή ανά νύχτα με βάση τα δικά σου δεδομένα και την ελληνική εποχικότητα. Οι τιμές είναι προτάσεις, τις εφαρμόζεις εσύ στα κανάλια."
        sub="Έσοδα, κέρδος έναντι σταθερής τιμής, κενές μέρες προς πλήρωση και ημερολόγιο τιμών — όλα εξηγήσιμα και ζωντανά."
        right={rows.length > 0 ? <ExportButton onClick={exportCsv} /> : undefined} />

      <InfoBanner tone="info">
        Οι τιμές είναι <strong>προτάσεις</strong>, όχι αυτόματη αλλαγή στα κανάλια. Βασίζονται στο ιστορικό διαμονών (χειροκίνητο και iCal), στην ελληνική εποχικότητα, στις αργίες, στην ημέρα της εβδομάδας και στη ζήτηση. Οι κλεισμένες ημέρες και οι ρυθμίσεις ενημερώνονται <strong>σε πραγματικό χρόνο</strong>. Η εκτιμώμενη πληρότητα είναι ενδεικτική.
      </InfoBanner>

      {/* Ρυθμίσεις (τυποποιημένα πεδία, αποθηκεύονται αυτόματα) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 14, margin: '18px 0 6px' }}>
        <NumberInput label="Βασική τιμή / νύχτα" value={base ? String(base) : ''} onChange={v => mark(setBase)(Number(v) || 0)} suffix="€" />
        <NumberInput label="Κατώτατο όριο" value={min ? String(min) : ''} onChange={v => mark(setMin)(Number(v) || 0)} suffix="€" />
        <NumberInput label="Ανώτατο όριο" value={max ? String(max) : ''} onChange={v => mark(setMax)(Number(v) || 0)} suffix="€" />
        <NumberInput label="Premium Σαββατοκύριακου" value={String(wknd)} onChange={v => mark(setWknd)(Number(v) || 0)} suffix="%" />
        <NumberInput label="Ελάχιστη διαμονή" value={String(minStay)} onChange={v => mark(setMinStay)(Math.max(1, Number(v) || 1))} suffix="νύχτες" />
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Έτος</div>
          <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border-subtle)', borderRadius: 10, overflow: 'hidden', height: 42 }}>
            {[nowYear, nowYear + 1, nowYear + 2].map(y => (
              <button key={y} onClick={() => setPyear(y)} style={{ flex: 1, border: 'none', cursor: 'pointer', fontFamily: T.font.sans, fontSize: 13, fontWeight: 600, background: pyear === y ? 'var(--accent)' : 'transparent', color: pyear === y ? '#fff' : 'var(--text-secondary)' }}>{y}</button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 16, minHeight: 16 }}>
        {adr > 0 && <>Μέση πραγματική τιμή (ADR): <strong style={{ color: 'var(--text-secondary)', fontFamily: T.font.num }}>{fe(adr, 0)}</strong> / νύχτα από {stays.length} διαμονές. </>}
        {savedTick > 0 && <span style={{ color: 'var(--positive)' }}>Οι ρυθμίσεις αποθηκεύτηκαν.</span>}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>Φόρτωση…</div>
      ) : base <= 0 ? (
        <div style={{ background: 'var(--bg-base)', boxShadow: 'var(--well-inset)', borderRadius: 14, padding: '40px 20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13, lineHeight: 1.6 }}>
          Όρισε μια βασική τιμή ανά νύχτα για να δεις τις προτεινόμενες τιμές. Αν καταχωρήσεις διαμονές (χειροκίνητα ή με εισαγωγή iCal), η αφετηρία υπολογίζεται αυτόματα από το ιστορικό σου.
        </div>
      ) : (
        <>
          <KPIGrid items={kpis} />

          {/* Προβολή εσόδων & κέρδους (3D premium) */}
          {projection && (
            <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 14 }}>
              <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-raised)', borderRadius: 14, padding: 18, boxShadow: 'var(--highlight-inset), var(--elev-2)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: 10 }}>Προβολή εσόδων ({pyear === nowYear ? 'ως το τέλος του έτους' : `${pyear}`})</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 26, fontWeight: 800, fontFamily: T.font.num, color: 'var(--accent)' }}>{fe(projection.projRevenue, 0)}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>με δυναμική τιμή</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>έναντι {fe(projection.flatRevenue, 0)} με σταθερή. Εκτίμηση {projection.expectedNights} κρατημένων νυχτών ({projection.occPct}% πληρότητα, {personalizedOcc ? 'από το ιστορικό σου' : 'ενδεικτική'}).</div>
              </div>
              <div style={{ background: 'linear-gradient(135deg, var(--accent-soft), transparent)', border: '1px solid var(--accent-border)', borderRadius: 14, padding: 18, boxShadow: 'var(--highlight-inset), var(--elev-2)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent)', marginBottom: 10 }}>Εκτιμώμενο επιπλέον κέρδος</div>
                <div style={{ fontSize: 30, fontWeight: 800, fontFamily: T.font.num, color: 'var(--accent)' }}>+{fe(projection.uplift, 0)}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>+{projection.upliftPct}% έναντι σταθερής τιμής, στο ίδιο επίπεδο πληρότητας.</div>
              </div>
            </div>
          )}

          {/* Κενές μέρες προς πλήρωση (actionable) */}
          {gaps.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <SecHdr label="Κενές μέρες προς πλήρωση" sub="Διαστήματα χωρίς κράτηση, με προτεινόμενη τιμή και άμεσες ενέργειες" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {gaps.slice(0, 8).map((g, i) => (
                  <div key={i} style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-raised)', borderRadius: 12, padding: 14, boxShadow: 'var(--highlight-inset), var(--elev-1)', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        {fd(g.start)} - {fd(g.end)}
                        {g.hard && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--warning)', background: 'var(--warning-soft)', border: '1px solid var(--warning-border)', borderRadius: 6, padding: '1px 6px' }}>δύσκολο κενό</span>}
                        {g.soon && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent)', background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: 6, padding: '1px 6px' }}>άμεσα</span>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 3 }}>{g.nights} {g.nights === 1 ? 'νύχτα' : 'νύχτες'} · εποχή {SEASON_LABELS[g.season]} · πρόταση πλήρωσης <strong style={{ color: 'var(--accent)', fontFamily: T.font.num }}>{fe(g.fillPrice, 0)}</strong>/νύχτα</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <Btn variant="secondary" onClick={() => copyOffer(g)}>Αντιγραφή προσφοράς</Btn>
                      <Btn variant="ghost" onClick={() => remindGap(g)}>Υπενθύμιση</Btn>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ημερολόγιο-heatmap */}
          <div style={{ marginTop: 24 }}>
            <SecHdr label="Ημερολόγιο τιμών" sub="Πιο σκούρο μπλε = υψηλότερη προτεινόμενη τιμή. Πάτησε μια ημέρα για ανάλυση."
              right={pastCount > 0 ? <button onClick={() => setShowPast(v => !v)} style={{ background: 'none', border: '1px solid var(--border-default)', borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 600, fontFamily: T.font.sans, color: 'var(--text-secondary)', cursor: 'pointer' }}>{showPast ? 'Κρύψε προηγούμενους μήνες' : `Δείξε προηγούμενους μήνες (${pastCount})`}</button> : undefined} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
              {visibleMonths.map(([key, days]) => {
                const [yy, mm] = key.split('-').map(Number);
                const firstDow = new Date(Date.UTC(yy, mm - 1, 1)).getUTCDay();
                const lead = (firstDow + 6) % 7;
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
                        const past = pyear === nowYear && d.date < todayIso();
                        const t = past ? 0 : norm(d.price);
                        const strong = !past && t > 0.5 && !d.booked;   // λευκά ψηφία σε σκούρο φόντο
                        const top = !past && t > 0.82 && !d.booked;     // κορυφαία αιχμή: έξτρα έμφαση
                        return (
                          <button key={dayNum} onClick={() => setSel(d)} title={d.holidayName || ''}
                            aria-label={`${fd(d.date)}: ${d.booked ? 'ήδη κλεισμένη' : `προτεινόμενη τιμή ${fe(d.price, 0)}`}${d.holidayName ? `, ${d.holidayName}` : ''}`}
                            aria-pressed={sel?.date === d.date} style={{
                            position: 'relative', aspectRatio: '1', borderRadius: 8, cursor: 'pointer', overflow: 'hidden',
                            border: sel?.date === d.date ? '2px solid var(--accent)' : top ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
                            background: d.booked ? 'var(--bg-base)' : 'var(--surface-raised)', padding: 0,
                            boxShadow: top ? '0 2px 10px -2px color-mix(in srgb, var(--accent) 55%, transparent)' : 'none',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                            transform: top ? 'scale(1.04)' : 'none', zIndex: top ? 1 : 0, opacity: past ? 0.4 : 1,
                          }}>
                            {!d.booked && !past && <span style={{ position: 'absolute', inset: 0, background: 'var(--accent)', opacity: fillOpacity(t) }} />}
                            <span style={{ position: 'relative', fontSize: 10, fontWeight: 600, color: d.booked ? 'var(--text-tertiary)' : strong ? 'rgba(255,255,255,0.9)' : 'var(--text-tertiary)' }}>{dayNum}</span>
                            <span style={{ position: 'relative', fontSize: top ? 12 : 11, fontWeight: top ? 800 : 700, fontFamily: T.font.num, color: d.booked ? 'var(--text-tertiary)' : strong ? '#fff' : 'var(--text-primary)' }}>
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

      {/* Toast ενεργειών */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--text-primary)', color: 'var(--bg-surface)', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: 'var(--elev-3)', zIndex: 2000 }}>{toast}</div>
      )}
    </div>
  );
}
