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
import { T, PageTitle, KPIGrid, InfoBanner, Btn, ExportButton, SecHdr, EmptyState, Skeleton, SkeletonKPIs, fe, fd } from '@/components/Theme';
import { notify, notifyOk, notifyError } from '@/components/Toast';
import { Tag } from 'lucide-react';
import { NumberInput } from './UIComponents';
import { exportPricingWorkbook } from './pricingExport';
import {
  recommendPrices, summarize, suggestBase, suggestBaseFallback, suggestGuardrails, bookedDatesFromStays,
  realizedAdr, projectRevenue, findGaps, estimateSeasonalOccupancy, SEASON_LABELS,
  type DayPrice, type PricingStay, type Gap,
} from '@/lib/pricing/dynamicPricing';

interface Props { propertyId: string; userId: string; propertyName?: string; propertyRent?: number; propertySqm?: number }

const WEEKDAYS = ['Δε', 'Τρ', 'Τε', 'Πε', 'Πα', 'Σα', 'Κυ'];
const MONTH_NAMES = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
const todayIso = () => new Date().toISOString().slice(0, 10);
const addDaysIso = (d: string, n: number) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

export default function TabPricing({ propertyId, userId, propertyName, propertyRent, propertySqm }: Props) {
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
  const [saveNote, setSaveNote] = useState<string | null>(null);
  // Στιγμιότυπο πρόβλεψης για «ζωντανό», χρήσιμο μήνυμα αποθήκευσης (όχι στείρο «αποθηκεύτηκαν»).
  const projRef = useRef<{ projRevenue: number; uplift: number; upliftPct: number; occPct: number } | null>(null);
  const [gapTitles, setGapTitles] = useState<Set<string>>(new Set()); // κενά ήδη στο Ημερολόγιο
  const compsKey = `pos-pricing-comps-${propertyId}`;
  const [comps, setComps] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(compsKey) || '[]'); } catch { return []; } });
  const [compsOpen, setCompsOpen] = useState(false);
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

  // Ποια κενά έχουν ήδη υπενθύμιση στο Ημερολόγιο (για toggle προσθήκη/αφαίρεση).
  const loadGapEvents = useCallback(async () => {
    const { data } = await supabase.from('calendar_events').select('title').eq('property_id', propertyId).eq('source', 'pricing_gap');
    setGapTitles(new Set((data || []).map(r => r.title as string)));
  }, [propertyId]);

  useEffect(() => {
    (async () => { setLoading(true); await Promise.all([loadStays(), loadSettings(), loadGapEvents()]); setLoading(false); })();
  }, [loadStays, loadSettings, loadGapEvents]);

  // ── Realtime: διαμονές, iCal, ρυθμίσεις → ζωντανή ενημέρωση ────────────────
  useEffect(() => {
    const ch = supabase.channel('pricing-' + propertyId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_stays', filter: `user_id=eq.${userId}` }, () => loadStays())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ical_feeds', filter: `user_id=eq.${userId}` }, () => loadStays())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pricing_settings', filter: `user_id=eq.${userId}` }, () => loadSettings())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, propertyId, loadStays, loadSettings]);

  // Τιμές ανταγωνισμού: τοπική αποθήκευση (βοήθημα βαθμονόμησης, ανά ακίνητο).
  useEffect(() => { try { localStorage.setItem(compsKey, JSON.stringify(comps)); } catch { /* ignore */ } }, [comps, compsKey]);

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
    const t = setTimeout(async () => {
      await persist({ base, min, max, wknd, minStay });
      // Ζωντανό, χρήσιμο μήνυμα: τι ισχύει τώρα και τι σημαίνει σε έσοδα, αντί για
      // πάντα το ίδιο «αποθηκεύτηκαν». Οι αριθμοί αλλάζουν με κάθε ρύθμιση.
      const p = projRef.current;
      const range = `${fe(min || base, 0)}–${fe(max || base, 0)}`;
      const note = p && p.uplift > 0
        ? `Αποθηκεύτηκε. Βάση ${fe(base, 0)}, εύρος ${range} · εκτιμώμενα ${fe(p.projRevenue, 0)} τον χρόνο, +${p.upliftPct}% έναντι σταθερής τιμής (${p.occPct}% πληρότητα).`
        : p
        ? `Αποθηκεύτηκε. Βάση ${fe(base, 0)}, εύρος ${range} · εκτιμώμενα ${fe(p.projRevenue, 0)} τον χρόνο στο ${p.occPct}% πληρότητα.`
        : `Αποθηκεύτηκε. Βάση ${fe(base, 0)}, εύρος ${range}, Σαββατοκύριακο +${wknd}%, ελάχιστη διαμονή ${minStay} ${minStay === 1 ? 'νύχτα' : 'νύχτες'}.`;
      setSaveNote(note);
    }, 700);
    return () => clearTimeout(t);
  }, [base, min, max, wknd, minStay, touched, persist]);
  // Το μήνυμα σβήνει διακριτικά μετά από λίγο — μένει «ζωντανό», όχι μόνιμο.
  useEffect(() => { if (!saveNote) return; const t = setTimeout(() => setSaveNote(null), 5200); return () => clearTimeout(t); }, [saveNote]);
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
  useEffect(() => { projRef.current = projection; }, [projection]);
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

  // Σταθερός τίτλος ανά κενό, για ταύτιση της εγγραφής στο Ημερολόγιο.
  const gapTitle = (g: Gap) => `Γέμισε κενές μέρες ${fd(g.start)} - ${fd(g.end)}`;

  // Ενέργεια toggle: προσθήκη υπενθύμισης στο Ημερολόγιο ή αφαίρεσή της αν υπάρχει.
  const toggleGap = async (g: Gap) => {
    const title = gapTitle(g);
    if (gapTitles.has(title)) {
      const { error } = await supabase.from('calendar_events').delete()
        .eq('property_id', propertyId).eq('source', 'pricing_gap').eq('title', title);
      if (error) { notifyError(`Σφάλμα: ${error.message}`); return; }
      setGapTitles(prev => { const n = new Set(prev); n.delete(title); return n; });
      notify('Αφαιρέθηκε από το Ημερολόγιο');
      return;
    }
    const rd = (() => { const wanted = addDaysIso(g.start, -5); return wanted < todayIso() ? todayIso() : wanted; })();
    const { error } = await supabase.from('calendar_events').insert({
      property_id: propertyId, user_id: userId, title,
      category: 'reminder', event_date: rd, priority: g.soon ? 'high' : 'medium', status: 'pending', source: 'pricing_gap',
      notes: `${g.nights} κενές νύχτες. Προτεινόμενη τιμή πλήρωσης ${fe(g.fillPrice, 0)}/νύχτα${minStay > 1 ? `, ελάχιστη διαμονή ${minStay} νύχτες` : ''}.`,
    });
    if (error) { notifyError(`Σφάλμα: ${error.message}`); return; }
    setGapTitles(prev => new Set(prev).add(title));
    notifyOk('Προστέθηκε στο Ημερολόγιο');
  };
  // Ενέργεια: αντιγραφή κειμένου προσφοράς last minute.
  const copyOffer = (g: Gap) => {
    const txt = `Τελευταία διαθεσιμότητα ${fd(g.start)} - ${fd(g.end)} (${g.nights} ${g.nights === 1 ? 'νύχτα' : 'νύχτες'}) σε ειδική τιμή ${fe(g.fillPrice, 0)} ανά νύχτα${minStay > 1 ? `, ελάχιστη διαμονή ${minStay} νύχτες` : ''}. Κλείσε τώρα, οι ημερομηνίες είναι περιορισμένες.`;
    navigator.clipboard?.writeText(txt);
    notifyOk('Το κείμενο προσφοράς αντιγράφηκε');
  };

  // Εξαγωγή επαγγελματικού .xlsx (Σύνοψη + Ημερήσιες τιμές + Ανά μήνα).
  const exportXlsx = () => {
    exportPricingWorkbook({
      propName: propertyName || 'Ακίνητο',
      year: pyear,
      settings: { base, min, max, weekendPremiumPct: wknd, minStay },
      summary: sum,
      projection,
      realizedAdr: adr,
      rows: rows.map(r => ({ date: r.date, dow: r.dow, season: r.season, isWeekend: r.isWeekend, holidayName: r.holidayName, price: r.price, booked: r.booked })),
    });
  };

  const mark = (fn: (v: number) => void) => (v: number) => { setTouched(true); fn(v); };

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>
      <PageTitle title="Δυναμική τιμολόγηση" titleHint="Προτεινόμενη τιμή ανά νύχτα με βάση τα δικά σου δεδομένα και την ελληνική εποχικότητα. Οι τιμές είναι προτάσεις, τις εφαρμόζεις εσύ στα κανάλια."
        sub="Έσοδα, κέρδος έναντι σταθερής τιμής, κενές μέρες προς πλήρωση και ημερολόγιο τιμών, όλα εξηγήσιμα και ζωντανά."
        right={rows.length > 0 ? <ExportButton onClick={exportXlsx} label="Εξαγωγή Excel" /> : undefined} />

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
          <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border-subtle)', borderRadius: 10, overflow: 'hidden', height: 40 }}>
            {[nowYear, nowYear + 1, nowYear + 2].map(y => (
              <button key={y} onClick={() => setPyear(y)} style={{ flex: 1, border: 'none', cursor: 'pointer', fontFamily: T.font.sans, fontSize: 13, fontWeight: 600, background: pyear === y ? 'var(--accent)' : 'transparent', color: pyear === y ? 'var(--accent-text)' : 'var(--text-secondary)' }}>{y}</button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 16, minHeight: 16 }}>
        {adr > 0 && <>Μέση πραγματική τιμή (ADR): <strong style={{ color: 'var(--text-secondary)', fontFamily: T.font.num }}>{fe(adr, 0)}</strong> / νύχτα από {stays.length} διαμονές. </>}
        {saveNote && <span style={{ color: 'var(--text-secondary)' }}>{saveNote}</span>}
      </div>

      {/* Βαθμονόμηση βάσης από τον ανταγωνισμό (προαιρετικό, τοπικό) */}
      {(() => {
        const compNums = comps.map(c => parseFloat(c)).filter(n => !isNaN(n) && n > 0).sort((a, b) => a - b);
        const median = compNums.length ? (compNums.length % 2 ? compNums[(compNums.length - 1) / 2] : Math.round((compNums[compNums.length / 2 - 1] + compNums[compNums.length / 2]) / 2)) : 0;
        const compBase = median ? Math.max(5, Math.round((median * 0.9) / 5) * 5) : 0;
        const setComp = (i: number, v: string) => setComps(prev => { const n = [...prev]; n[i] = v; return n; });
        return (
          <div className="card" style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer' }} onClick={() => setCompsOpen(o => !o)}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: T.font.sans, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>Βαθμονόμηση από τον ανταγωνισμό</div>
                <div style={{ fontFamily: T.font.sans, fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1 }}>Βάλε τιμές/νύχτα παρόμοιων ακινήτων της περιοχής και δες μια προτεινόμενη βάση</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                {median > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', fontFamily: T.font.mono }}>διάμεση {fe(median, 0)}</span>}
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: compsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><path d="m6 9 6 6 6-6" /></svg>
              </div>
            </div>
            {compsOpen && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 130px), 1fr))', gap: 10, marginBottom: 12 }}>
                  {[0, 1, 2, 3].map(i => (
                    <NumberInput key={i} label={`Ανταγωνιστής ${i + 1}`} value={comps[i] || ''} onChange={v => setComp(i, v)} suffix="€" step={5} placeholder="—" />
                  ))}
                </div>
                {compBase > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '12px 14px' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>
                      Προτεινόμενη βάση <strong style={{ color: 'var(--text-primary)', fontFamily: T.font.num }}>{fe(compBase, 0)}</strong> / νύχτα
                      <span style={{ color: 'var(--text-tertiary)' }}> (διάμεση − 10%, αφού η βάση αφορά καθημερινή εκτός αιχμής· η εποχή/ΣΚ προστίθενται από πάνω)</span>
                    </div>
                    <Btn variant="secondary" onClick={() => { mark(setBase)(compBase); const g = suggestGuardrails(compBase); mark(setMin)(g.min); mark(setMax)(g.max); }}>Χρησιμοποίησε αυτή τη βάση</Btn>
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>Πρόσθεσε 1-4 τιμές ανταγωνιστών (π.χ. από Airbnb/Booking για παρόμοια ακίνητα) για να δεις προτεινόμενη βάση. Αποθηκεύεται τοπικά στη συσκευή σου.</div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {loading ? (
        // Σκελετός αντί για «Φόρτωση…»: το σχήμα του αποτελέσματος είναι γνωστό
        // (μετρικές + πίνακας ημερήσιων τιμών), άρα η σελίδα δεν αναπηδά όταν έρθουν τα δεδομένα.
        <><SkeletonKPIs n={4} /><Skeleton h={260} r={14} /></>
      ) : base <= 0 ? (
        <EmptyState
          icon={<Tag size={20} />}
          title="Δεν υπάρχει βασική τιμή"
          hint="Όρισε τιμή ανά νύχτα, ή καταχώρησε διαμονές (χειροκίνητα ή με εισαγωγή iCal) για να υπολογιστεί αυτόματα από το ιστορικό σου."
        />
      ) : (
        <>
          <KPIGrid items={kpis} />

          {/* Προβολή εσόδων & κέρδους (3D premium) */}
          {projection && (
            <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 14 }}>
              <div className="po-fig-card" style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-raised)', borderRadius: 14, padding: 16, boxShadow: 'var(--highlight-inset), var(--elev-2)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: 10 }}>Προβολή εσόδων ({pyear === nowYear ? 'ως το τέλος του έτους' : `${pyear}`})</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                  <span className="po-fig" data-tone="accent" style={{ fontSize: 24, fontWeight: 700, fontFamily: T.font.num }}>{fe(projection.projRevenue, 0)}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>με δυναμική τιμή</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>έναντι {fe(projection.flatRevenue, 0)} με σταθερή. Εκτίμηση {projection.expectedNights} κρατημένων νυχτών ({projection.occPct}% πληρότητα, {personalizedOcc ? 'από το ιστορικό σου' : 'ενδεικτική'}).</div>
              </div>
              <div className="po-fig-card" style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-raised)', borderRadius: 14, padding: 16, boxShadow: 'var(--highlight-inset), var(--elev-2)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: 10 }}>Εκτιμώμενο επιπλέον κέρδος</div>
                <div className="po-fig" data-tone="positive" style={{ fontSize: 28, fontWeight: 700, fontFamily: T.font.num }}>+{fe(projection.uplift, 0)}</div>
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
                  <div key={i} className="po-fig-card" tabIndex={0} style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-raised)', borderRadius: 14, padding: 16, boxShadow: 'var(--highlight-inset), var(--elev-1)', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        {fd(g.start)} - {fd(g.end)}
                        {g.hard && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 100, padding: '1px 6px' }}>δύσκολο κενό</span>}
                        {g.soon && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 100, padding: '1px 6px' }}>άμεσα</span>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 3 }}>{g.nights} {g.nights === 1 ? 'νύχτα' : 'νύχτες'} · εποχή {SEASON_LABELS[g.season]} · πρόταση πλήρωσης <strong className="po-fig" data-tone="accent" style={{ fontFamily: T.font.num }}>{fe(g.fillPrice, 0)}</strong>/νύχτα</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <Btn variant="secondary" onClick={() => copyOffer(g)}>Αντιγραφή προσφοράς</Btn>
                      <Btn variant="secondary" onClick={() => toggleGap(g)}>{gapTitles.has(gapTitle(g)) ? 'Προστέθηκε στο Ημερολόγιο' : 'Υπενθύμιση'}</Btn>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ημερολόγιο-heatmap */}
          <div style={{ marginTop: 24 }}>
            <SecHdr label="Ημερολόγιο τιμών" sub="Πιο σκούρο μπλε = υψηλότερη προτεινόμενη τιμή. Πάτησε μια ημέρα για ανάλυση."
              right={pastCount > 0 ? <button onClick={() => setShowPast(v => !v)} style={{ background: 'none', border: '1px solid var(--border-default)', borderRadius: 100, padding: '6px 14px', fontSize: 12, fontWeight: 600, fontFamily: T.font.sans, color: 'var(--text-secondary)', cursor: 'pointer' }}>{showPast ? 'Κρύψε προηγούμενους μήνες' : `Δείξε προηγούμενους μήνες (${pastCount})`}</button> : undefined} />
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
                            <span style={{ position: 'relative', fontSize: 10, fontWeight: 600, color: d.booked ? 'var(--text-tertiary)' : 'var(--text-secondary)' }}>{dayNum}</span>
                            <span style={{ position: 'relative', fontSize: top ? 12 : 11, fontWeight: top ? 800 : 700, fontFamily: T.font.num, color: d.booked ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>
                              {d.booked ? '—' : fe(d.price, 0).replace(/\s?€/, '')}
                            </span>
                            {d.isHoliday && !d.booked && <span style={{ position: 'absolute', top: 3, right: 3, width: 4, height: 4, borderRadius: '50%', background: 'var(--text-secondary)' }} />}
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
            <div className="po-fig-card" tabIndex={0} style={{ marginTop: 20, background: 'var(--bg-base)', boxShadow: 'var(--well-inset)', borderRadius: 14, padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{fd(sel.date)}{sel.holidayName ? ` · ${sel.holidayName}` : ''}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>Εποχή {SEASON_LABELS[sel.season]}{sel.isWeekend ? ' · Σαββατοκύριακο' : ''}{sel.booked ? ' · Ήδη κλεισμένη' : ''}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="po-fig" data-tone="accent" style={{ fontSize: 22, fontWeight: 700, fontFamily: T.font.num }}>{fe(sel.price, 0)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>ανά νύχτα</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)' }}>
                  <span>Βάση</span><span className="po-fig" style={{ fontFamily: T.font.num }}>{fe(sel.base, 0)}</span>
                </div>
                {sel.factors.map((f, i) => {
                  const pct = Math.round((f.mult - 1) * 100);
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)' }}>
                      <span>{f.label}</span>
                      <span className="po-fig" data-tone={pct > 0 ? 'positive' : pct < 0 ? 'negative' : undefined} style={{ fontFamily: T.font.num }}>{pct > 0 ? '+' : ''}{pct}%</span>
                    </div>
                  );
                })}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, borderTop: '1px solid var(--border-subtle)', paddingTop: 8, marginTop: 2 }}>
                  <span>Προτεινόμενη τιμή</span><span className="po-fig" data-tone="accent" style={{ fontFamily: T.font.num }}>{fe(sel.price, 0)}</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}

    </div>
  );
}
