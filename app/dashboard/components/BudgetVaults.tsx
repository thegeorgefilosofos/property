'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { NumberInput, TextInput, DatePicker, InfoDot, CustomSelect } from './UIComponents';
import { T, feAuto, Badge, Skeleton } from '@/components/Theme';
import { reservePlan, savingsSchedule } from '@/lib/billing/budgetPro';

// ── Κουμπαράδες / Αποθεματικά (sinking funds) ─────────────────────────────────
// Εικονικοί κουμπαράδες ανά ακίνητο: ΕΝΦΙΑ, λέβητας, κενές περίοδοι, ανακαίνιση.
// Κάθε κουμπαράς έχει στόχο και (προαιρετικά) ημερομηνία — υπολογίζεται η μηνιαία
// εισφορά που χρειάζεται και το ποσοστό κάλυψης. Google-minimal, μονόχρωμο, με
// γαλάζιο μόνο στο πέρασμα του κέρσορα και επεξηγήσεις πίσω από ⓘ.

interface Vault { id: string; name: string; target: number; current: number; due?: string; srcKey?: string; bank?: string; apy?: number; planAmount?: number; planDay?: number }

// Λογαριασμοί αποταμίευσης με ευέλικτο (ημερήσιο/εβδομαδιαίο) επιτόκιο σε EUR, για
// τράπεζες/νεοτράπεζες που δραστηριοποιούνται ή είναι προσβάσιμες από Ελλάδα.
// Ενδεικτικά επιτόκια 2026 — όπου εξαρτώνται από πρόγραμμα (Standard→Premium/Metal)
// δίνεται εύρος. Είναι ΜΕΤΑΒΛΗΤΑ και επεξεργάσιμα· ο χρήστης προσαρμόζει το δικό του.
interface BankRate { name: string; apy: number; range?: [number, number]; note: string }
const BANK_RATES: BankRate[] = [
  { name: 'Revolut',        apy: 2.25, range: [2.00, 2.50], note: 'Instant Access σε EUR, ανάλογα με πλάνο' },
  { name: 'Trading 212',    apy: 2.40,                      note: 'Επιτόκιο σε αδιάθετα μετρητά (EUR)' },
  { name: 'Trade Republic', apy: 2.00,                      note: 'Επιτόκιο σε μετρητά, ημερήσιος υπολογισμός' },
  { name: 'Lightyear',      apy: 2.50,                      note: 'Ευέλικτο EUR, ημερήσιος τόκος' },
  { name: 'Bunq',           apy: 2.01, range: [1.51, 2.46], note: 'easySavings, ανάλογα με πλάνο' },
  { name: 'N26',            apy: 2.00, range: [2.00, 2.26], note: 'Instant Savings, ανάλογα με πλάνο' },
  { name: 'Freedom24',      apy: 3.00, range: [2.50, 3.50], note: 'D-account EUR, συνδεδεμένο με EURIBOR' },
  { name: 'Wealthyhood',    apy: 2.00,                      note: 'Ευέλικτη αποταμίευση σε EUR' },
  { name: 'Snappi',         apy: 1.00,                      note: 'Ελληνική neobank: ελεύθερη ανάληψη' },
  { name: 'Εθνική (Next)',  apy: 1.50,                      note: 'Πρόγραμμα νέων' },
  { name: 'Credia Bank',    apy: 1.50,                      note: 'Αποταμιευτικός λογαριασμός' },
  { name: 'Eurobank',       apy: 0.30,                      note: 'Ταμιευτήριο, προθεσμιακά υψηλότερα' },
  { name: 'Πειραιώς',       apy: 0.30,                      note: 'Ταμιευτήριο, προθεσμιακά υψηλότερα' },
  { name: 'Alpha Bank',     apy: 0.30,                      note: 'Ταμιευτήριο, προθεσμιακά υψηλότερα' },
];
const pct = (n: number) => n.toString().replace('.', ',') + '%';
const rateLabel = (b: BankRate) => b.range ? `${pct(b.range[0])}–${pct(b.range[1])}` : pct(b.apy);

// Έξυπνη πρόταση κουμπαρά (ΕΝΦΙΑ, φόρος, CapEx, κενές περίοδοι) — υπολογισμένη από
// τον γονέα με τους κανονικούς μηχανισμούς. Εμφανίζεται ως πρόταση ενός αγγίγματος.
export interface VaultSuggestion { key: string; name: string; target: number; due?: string; hint?: string; note?: string }

interface Props {
  propertyId: string;
  userId?: string;
  suggestions?: VaultSuggestion[];
  // Μηνιαίο κόστος ακινήτου — για δείκτη «κάλυψης» (πόσους μήνες καλύπτουν τα αποθεματικά).
  monthlyCommitment?: number;
}

const uid = () => `v_${Date.now().toString(36)}_${Math.round(Math.random() * 1e6).toString(36)}`;
// Τοπική ημερομηνία από ISO (όχι UTC) — αλλιώς off-by-one στα όρια σε ζώνες πίσω από UTC.
const parseLocal = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
};
// Ληξιπρόθεσμο = η ημερομηνία-στόχος έχει περάσει (σύγκριση ΗΜΕΡΑΣ, όχι μόνο μήνα).
const isOverdue = (due?: string): boolean => {
  if (!due) return false;
  const now = new Date();
  return parseLocal(due) < new Date(now.getFullYear(), now.getMonth(), now.getDate());
};
// Μήνες-παράθυρα εισφοράς μέχρι τον στόχο: 0 αν δεν υπάρχει/είναι ληξιπρόθεσμη
// προθεσμία· τουλάχιστον 1 για μελλοντική προθεσμία (ακόμη κι αργότερα ΜΕΣΑ στον μήνα).
const monthsUntil = (due?: string): number => {
  if (!due || isOverdue(due)) return 0;
  const d = parseLocal(due), now = new Date();
  const m = (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
  return Math.max(1, m);
};
const monthLabel = (due?: string): string => {
  if (!due) return '';
  try { return parseLocal(due).toLocaleDateString('el-GR', { month: 'short', year: 'numeric' }); } catch { return ''; }
};
const fullDate = (iso?: string): string => {
  if (!iso) return '';
  try { return parseLocal(iso).toLocaleDateString('el-GR', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return ''; }
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-zα-ω0-9]/gi, '');

export default function BudgetVaults({ propertyId, userId = '', suggestions = [], monthlyCommitment = 0 }: Props) {
  const supabase = createClient();
  const saveTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);   // αποδέσμευση dirty μετά την εγγραφή
  const dirtyRef   = useRef(false);   // εκκρεμεί/μόλις έγινε δική μας εγγραφή → μη «πατάς» πάνω της με reload
  const editRef    = useRef<string | null>(null);
  const deletedRef = useRef<Set<string>>(new Set());   // ρητά διαγραμμένοι (για merge-on-write)
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [hoverPct, setHoverPct] = useState<string | null>(null);
  const [hoverSg, setHoverSg] = useState<string | null>(null);
  const [shut, setShut] = useState(false);
  const [doneHover, setDoneHover] = useState(false);
  const [delHover, setDelHover] = useState(false);
  const [planHover, setPlanHover] = useState(false);
  editRef.current = editId;

  useEffect(() => {
    // Προεπιλογή: κλειστό (μαζεμένο) — ο χρήστης το ανοίγει αν το χρειάζεται.
    try { const v = localStorage.getItem(`vaults_shut_${propertyId}`); setShut(v == null ? true : v === '1'); } catch { setShut(true); }
  }, [propertyId]);
  const toggleShut = () => setShut(s => { const n = !s; try { localStorage.setItem(`vaults_shut_${propertyId}`, n ? '1' : '0'); } catch { /* ignore */ } return n; });

  useEffect(() => {
    if (!propertyId) return;
    let mounted = true;
    const loadVaults = async () => {
      const { data } = await supabase.from('bills_settings').select('data').eq('property_id', propertyId).eq('section', 'vaults').maybeSingle();
      const arr = (data?.data as { vaults?: Vault[] } | null)?.vaults;
      // Μη αντικαθιστάς ό,τι επεξεργάζεται ή μόλις έσωσε ο χρήστης (θα έχανε αλλαγές).
      if (mounted && Array.isArray(arr) && editRef.current == null && !dirtyRef.current) setVaults(arr);
    };
    (async () => {
      const { data } = await supabase.from('bills_settings').select('data').eq('property_id', propertyId).eq('section', 'vaults').maybeSingle();
      const arr = (data?.data as { vaults?: Vault[] } | null)?.vaults;
      if (mounted && Array.isArray(arr)) setVaults(arr);
      if (mounted) setLoaded(true);
    })();
    // Ζωντανή ενημέρωση: αν αλλάξει η ρύθμιση 'vaults' αλλού (π.χ. ο βοηθός φτιάξει
    // κουμπαρά), ξαναδιάβασε — ώστε να μη «χαθεί» από παλιά εικόνα στη μνήμη.
    const ch = supabase
      .channel(`vaults_${propertyId}`)
      .on('postgres_changes' as const, { event: '*', schema: 'public', table: 'bills_settings', filter: `property_id=eq.${propertyId}` }, () => { if (mounted) loadVaults(); })
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [propertyId]);

  const persist = useCallback((next: Vault[]) => {
    setVaults(next);
    dirtyRef.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (clearTimer.current) clearTimeout(clearTimer.current);   // μόνο η ΤΕΛΕΥΤΑΙΑ εγγραφή αποδεσμεύει το dirty
    saveTimer.current = setTimeout(async () => {
      // Merge-on-write: διάβασε την τρέχουσα DB εικόνα και κράτα κουμπαράδες που πρόσθεσε
      // αλλού (π.χ. ο βοηθός/άλλη συσκευή) και ΔΕΝ υπάρχουν τοπικά — χωρίς να «αναστήσεις»
      // όσους ο χρήστης διέγραψε ρητά. Έτσι η ολική εγγραφή δεν χάνει ξένες αλλαγές.
      const { data: cur } = await supabase.from('bills_settings').select('data').eq('property_id', propertyId).eq('section', 'vaults').maybeSingle();
      const remote = ((cur?.data as { vaults?: Vault[] } | null)?.vaults ?? []) as Vault[];
      const localIds = new Set(next.map(v => v.id));
      const merged = [...next, ...remote.filter(rv => !localIds.has(rv.id) && !deletedRef.current.has(rv.id))];
      await supabase.from('bills_settings').upsert(
        { property_id: propertyId, user_id: userId, section: 'vaults', data: { vaults: merged } },
        { onConflict: 'property_id,section' },
      );
      // Άφησε λίγο περιθώριο ώστε να «καταλαγιάσει» το δικό μας realtime echo πριν επιτρέψεις reload.
      clearTimer.current = setTimeout(() => { dirtyRef.current = false; }, 1200);
    }, 700);
  }, [propertyId, userId]);

  const update = (id: string, patch: Partial<Vault>) => persist(vaults.map(v => v.id === id ? { ...v, ...patch } : v));
  const remove = (id: string) => { deletedRef.current.add(id); persist(vaults.filter(v => v.id !== id)); if (editId === id) setEditId(null); };
  const addVault = (v?: Partial<Vault>) => {
    const nv: Vault = { id: uid(), name: v?.name ?? '', target: v?.target ?? 0, current: v?.current ?? 0, due: v?.due, ...(v?.srcKey ? { srcKey: v.srcKey } : {}) };
    persist([...vaults, nv]);
    setEditId(nv.id);
  };

  const totalSaved = vaults.reduce((s, v) => s + (v.current || 0), 0);
  // Μηνιαία εισφορά: μόνο κουμπαράδες με ΜΕΛΛΟΝΤΙΚΗ προθεσμία — χωρίς προθεσμία ή
  // ληξιπρόθεσμοι δεν είναι πάγια μηνιαία δέσμευση (αλλιώς φαίνεται όλο το υπόλοιπο «/μήνα»).
  const totalMonthly = vaults.reduce((s, v) => {
    const mo = monthsUntil(v.due);
    return v.due && mo > 0 ? s + reservePlan(v.target, v.current, mo).requiredMonthly : s;
  }, 0);
  // Δείκτης «κάλυψης»: πόσους μήνες κόστους καλύπτουν τα αποθεματικά (age-of-money style).
  const coverMonths = monthlyCommitment > 0 && totalSaved > 0 ? totalSaved / monthlyCommitment : 0;
  // Ετήσιοι τόκοι που «δουλεύουν» τα αποθεματικά σε λογαριασμούς με ευέλικτο επιτόκιο.
  const totalInterest = vaults.reduce((s, v) => s + (v.apy != null && v.apy > 0 ? (v.current || 0) * v.apy / 100 : 0), 0);
  // Προτάσεις που ΔΕΝ έχουν ήδη δημιουργηθεί: ταίριασμα με σταθερό κλειδί προέλευσης
  // (επιβιώνει σε μετονομασία) ή, ως εφεδρεία, με το κανονικοποιημένο όνομα.
  const openSuggestions = suggestions.filter(sg => !vaults.some(v => v.srcKey === sg.key || norm(v.name) === norm(sg.name)));

  // Πριν, όσο διάβαζε τα δεδομένα η ενότητα ΔΕΝ αποδιδόταν καθόλου: εμφανιζόταν
  // απότομα και έσπρωχνε προς τα κάτω ό,τι ήταν από κάτω της. Ο σκελετός κρατά τη
  // θέση της. Ακολουθεί το `shut` (προεπιλογή: μαζεμένη) ώστε να μη δεσμεύει
  // περισσότερο ύψος από όσο θα πιάσει τελικά — αλλιώς η μετακίνηση απλώς αλλάζει φορά.
  if (!loaded) return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 16, marginBottom: 12 }}>
      <Skeleton w={110} h={10} />
      {!shut && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {[0, 1].map(i => <Skeleton key={i} h={56} r={12} />)}
        </div>
      )}
    </div>
  );

  const card: React.CSSProperties = { background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 16 };

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 16, marginBottom: 12 }}>
      <div onClick={toggleShut} role="button" tabIndex={0} aria-expanded={!shut}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleShut(); } }}
        style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: shut ? 0 : 12, paddingBottom: shut ? 0 : 8, borderBottom: shut ? 'none' : '1px solid var(--border-subtle)', cursor: 'pointer', userSelect: 'none' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: T.font.sans }}>Κουμπαράδες</span>
        <span onClick={e => e.stopPropagation()} style={{ display: 'inline-flex' }}>
          <InfoDot text="Εικονικοί κουμπαράδες για μελλοντικά έξοδα (ΕΝΦΙΑ, λέβητας, ανακαίνιση, κενές περίοδοι). Ορίζεις στόχο και ημερομηνία· υπολογίζεται πόσο πρέπει να βάζεις κάθε μήνα ώστε να είναι έτοιμος όταν χρειαστεί." />
        </span>
        <span style={{ flex: 1 }}/>
        {vaults.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>
            Σύνολο {feAuto(totalSaved, 0)}{totalMonthly > 0 ? ` · ${feAuto(totalMonthly, 0)}/μήνα` : ''}{coverMonths >= 0.5 ? ` · ~${coverMonths.toFixed(coverMonths >= 10 ? 0 : 1)} μήνες κάλυψη` : ''}{totalInterest > 0 ? ` · +${feAuto(totalInterest, 0)}/έτος τόκοι` : ''}
          </span>
        )}
        <span aria-hidden="true" style={{ display: 'flex', color: 'var(--text-tertiary)', padding: 4, margin: '-4px -4px -4px 0' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: shut ? 'rotate(-90deg)' : 'none', transition: 'transform 0.18s' }}><polyline points="6 9 12 15 18 9"/></svg>
        </span>
      </div>

      {!shut && (<>
      {/* Έξυπνες προτάσεις — ΕΝΦΙΑ, φόρος, CapEx, κενές περίοδοι· ένα άγγιγμα ο καθένας */}
      {openSuggestions.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {openSuggestions.map(sg => {
            const h = hoverSg === sg.key;
            return (
            <button key={sg.key} title={sg.note || undefined} onClick={() => addVault({ name: sg.name, target: sg.target, due: sg.due, srcKey: sg.key })}
              onMouseEnter={() => setHoverSg(sg.key)} onMouseLeave={() => setHoverSg(null)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: h ? 'var(--accent-dim)' : 'var(--bg-elevated)', border: `1px dashed ${h ? 'var(--border-accent)' : 'var(--border-default)'}`, borderRadius: T.radius.pill, cursor: 'pointer', textAlign: 'left', fontFamily: T.font.sans, transition: 'background 0.15s, border-color 0.15s' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={h ? 'var(--accent)' : 'var(--text-tertiary)'} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, transition: 'stroke 0.15s' }}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                <strong style={{ color: h ? 'var(--accent)' : 'var(--text-primary)', fontWeight: 600, transition: 'color 0.15s' }}>{sg.name}</strong>
                {'  '}<span style={{ fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{feAuto(sg.target, 0)}</span>
                {sg.hint ? <span style={{ color: 'var(--text-tertiary)' }}>{'  '}· {sg.hint}</span> : null}
              </span>
            </button>
            );
          })}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 232px), 1fr))', gap: 10 }}>
        {vaults.map(v => {
          const mo = monthsUntil(v.due);
          const plan = reservePlan(v.target, v.current, mo);
          const funded = plan.fundedPct;
          const done = funded >= 100;
          const overdue = !done && isOverdue(v.due);
          const barCol = done ? 'var(--accent)' : overdue ? 'var(--negative)' : 'color-mix(in srgb, var(--text-primary) 34%, transparent)';
          const editing = editId === v.id;
          const on = hoverPct === v.id;

          if (editing) return (
            <div key={v.id} className="po-fig-card" tabIndex={0} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: T.radius.card, padding: 16, gridColumn: '1 / -1', boxShadow: '0 6px 18px -12px color-mix(in srgb, var(--text-primary) 40%, transparent)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>{v.name ? 'Επεξεργασία κουμπαρά' : 'Νέος κουμπαράς'}</div>
              {(() => {
                const knownBank = BANK_RATES.find(b => b.name === v.bank);
                const isOther = !knownBank && (v.apy != null || (v.bank ?? '') !== '');
                const selectValue = knownBank ? knownBank.name : (isOther ? '__other' : '');
                const bankOptions = [
                  { value: '', label: 'Χωρίς αποταμιευτικό επιτόκιο' },
                  ...BANK_RATES.map(b => ({ value: b.name, label: `${b.name} · ${rateLabel(b)}`, description: b.note })),
                  { value: '__other', label: 'Άλλη τράπεζα (χειροκίνητα)' },
                ];
                const onBank = (val: string) => {
                  if (val === '') update(v.id, { bank: undefined, apy: undefined });
                  else if (val === '__other') update(v.id, { bank: v.bank ?? '', apy: v.apy ?? 0 });
                  else { const b = BANK_RATES.find(x => x.name === val); update(v.id, { bank: val, apy: b?.apy }); }
                };
                const yearly = (v.apy != null && v.apy > 0 && (v.current || 0) > 0) ? Math.round((v.current || 0) * v.apy / 100) : 0;
                // Σταθερές 2 στήλες ώστε τα πεδία (ημερολόγιο, dropdown τραπεζών) να έχουν
                // αρκετό πλάτος και να ανοίγουν σωστά· ορθολογική σειρά με βάση την εμπειρία χρήσης.
                const now = new Date();
                const sc = (v.planAmount && v.planAmount > 0)
                  ? savingsSchedule(v.target || 0, v.current || 0, v.planAmount, v.planDay || 1, { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() })
                  : null;
                const grp: React.CSSProperties = { gridColumn: '1 / -1', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: T.font.sans, marginTop: 4 };
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 12px' }}>
                    {/* 1. Βασικά */}
                    <div style={{ gridColumn: '1 / -1' }}><TextInput label="Όνομα" value={v.name} onChange={val => update(v.id, { name: val })} placeholder="π.χ. Λέβητας" /></div>
                    <NumberInput label="Στόχος" value={String(v.target || '')} onChange={val => update(v.id, { target: parseFloat(val) || 0 })} suffix="€" step={50} />
                    <NumberInput label="Έχω μαζέψει" value={String(v.current || '')} onChange={val => update(v.id, { current: parseFloat(val) || 0 })} suffix="€" step={20} />

                    {/* 2. Πρόγραμμα: πόσο βάζω κάθε μήνα και πότε πιάνω τον στόχο */}
                    <div style={grp}>Μηνιαίο πρόγραμμα</div>
                    <NumberInput label="Προσθέτω κάθε μήνα" value={v.planAmount != null ? String(v.planAmount) : ''} onChange={val => update(v.id, { planAmount: val.trim() === '' ? undefined : (parseFloat(val) || 0) })} suffix="€" step={10} placeholder="0" />
                    <NumberInput label="Ημέρα του μήνα" value={v.planDay != null ? String(v.planDay) : ''} onChange={val => update(v.id, { planDay: val.trim() === '' ? undefined : Math.min(31, Math.max(1, parseInt(val) || 1)) })} step={1} placeholder="1" />
                    {sc && (
                      <div onMouseEnter={() => setPlanHover(true)} onMouseLeave={() => setPlanHover(false)} onTouchStart={() => setPlanHover(true)} onTouchEnd={() => setPlanHover(false)}
                        style={{ gridColumn: '1 / -1', background: 'var(--bg-surface)', border: `1px solid ${planHover ? 'var(--border-accent)' : 'var(--border-subtle)'}`, borderRadius: T.radius.inner, padding: '11px 13px', transition: 'border-color 0.15s', cursor: 'default' }}>
                        {sc.reached ? (
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>Ο στόχος έχει ήδη καλυφθεί.</div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.5 }}>
                              Θα πιάσεις τον στόχο τον <strong style={{ color: planHover ? 'var(--accent)' : 'var(--text-primary)', transition: 'color 0.15s' }}>{fullDate(sc.goalDate)}</strong>, σε <strong style={{ color: planHover ? 'var(--accent)' : 'var(--text-primary)', fontFamily: T.font.num, transition: 'color 0.15s' }}>{sc.contributionsToGoal}</strong> προσθήκες.
                            </div>
                            <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.5 }}>
                              Επόμενη προσθήκη σε <strong style={{ color: planHover ? 'var(--accent)' : 'var(--text-secondary)', fontFamily: T.font.num, transition: 'color 0.15s' }}>{sc.daysToNext}</strong> {sc.daysToNext === 1 ? 'ημέρα' : 'ημέρες'} ({fullDate(sc.nextDate)}).
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 3. Προθεσμία & αποταμιευτικός λογαριασμός */}
                    <div style={grp}>Προθεσμία και τράπεζα</div>
                    <DatePicker label="Ημερομηνία-στόχος" value={v.due || ''} onChange={val => update(v.id, { due: val })} />
                    <CustomSelect label="Αποταμίευση"
                      labelInfo={<InfoDot text="Αν κρατάς τον κουμπαρά σε λογαριασμό με ευέλικτο επιτόκιο, τα χρήματα δεν μένουν αδρανή και βλέπεις πόσους τόκους κερδίζεις τον χρόνο, έτσι αντισταθμίζεις και την απώλεια αγοραστικής δύναμης από τον πληθωρισμό. Τα επιτόκια είναι ενδεικτικά και μεταβλητά (EUR, 2026) και εξαρτώνται από το πρόγραμμα ή το υπόλοιπο. Επιβεβαίωσέ τα στην τράπεζα." />}
                      value={selectValue} onChange={onBank} options={bankOptions} placeholder="Επιλογή…" />
                    {selectValue !== '' && (
                      <NumberInput label="Επιτόκιο (ετήσιο)" value={v.apy != null ? String(v.apy) : ''} onChange={val => update(v.id, { apy: val.trim() === '' ? undefined : (parseFloat(val.replace(',', '.')) || 0) })} suffix="%" step={0.25} placeholder="0" />
                    )}
                    {isOther && <TextInput label="Όνομα τράπεζας" value={v.bank || ''} onChange={val => update(v.id, { bank: val })} placeholder="π.χ. Raisin" />}
                    {yearly > 0 && <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>Εκτιμώμενοι τόκοι: <strong className="po-fig" data-tone="accent" style={{ fontFamily: T.font.num }}>+{feAuto(yearly, 0)}</strong> / έτος</div>}
                  </div>
                );
              })()}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12 }}>
                <button onClick={() => setEditId(null)} onMouseEnter={() => setDoneHover(true)} onMouseLeave={() => setDoneHover(false)} onTouchStart={() => setDoneHover(true)} onTouchEnd={() => setDoneHover(false)}
                  style={{ height: T.h.md, padding: '0 20px', borderRadius: T.radius.btn, background: doneHover ? 'var(--accent)' : 'color-mix(in srgb, var(--text-primary) 88%, transparent)', border: 'none', color: doneHover ? 'var(--accent-text)' : 'var(--bg-surface)', fontSize: 12, fontWeight: 600, fontFamily: T.font.sans, cursor: 'pointer', transition: 'background 0.15s, color 0.15s' }}>Έτοιμο</button>
                <button onClick={() => remove(v.id)} onMouseEnter={() => setDelHover(true)} onMouseLeave={() => setDelHover(false)}
                  style={{ height: T.h.md, padding: '0 12px', borderRadius: T.radius.btn, background: 'transparent', border: 'none', color: delHover ? 'var(--negative)' : 'var(--text-tertiary)', fontSize: 12, fontWeight: 500, fontFamily: T.font.sans, cursor: 'pointer', transition: 'color 0.15s' }}>Διαγραφή</button>
              </div>
            </div>
          );

          // Πλήρες πλακίδιο 3D & clickable: κλικ οπουδήποτε ανοίγει την επεξεργασία (μετονομασία,
          // στόχος, ποσό, ημερομηνία, τράπεζα). Στο πέρασμα κέρσορα σηκώνεται και τα νούμερα γίνονται γαλάζια.
          return (
            <div key={v.id} className="po-fig-card" role="button" tabIndex={0} aria-label={`Επεξεργασία: ${v.name || 'Κουμπαράς'}`}
              onClick={() => setEditId(v.id)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditId(v.id); } }}
              onMouseEnter={() => setHoverPct(v.id)} onMouseLeave={() => setHoverPct(null)}
              onTouchStart={() => setHoverPct(v.id)} onTouchEnd={() => setHoverPct(null)}
              style={{ ...card, cursor: 'pointer', border: `1px solid ${on ? 'var(--border-accent)' : 'var(--border-subtle)'}`, transform: on ? 'translateY(-2px)' : 'none', boxShadow: on ? '0 8px 20px -10px color-mix(in srgb, var(--text-primary) 34%, transparent)' : 'none', transition: 'transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, fontFamily: T.font.sans, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name || 'Κουμπαράς'}</span>
                {done && <Badge tone="accent">Καλυμμένο</Badge>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: on ? 'var(--accent)' : 'var(--text-primary)', transition: 'color 0.15s' }}>{feAuto(v.current || 0, 0)}</span>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>/ {feAuto(v.target || 0, 0)}</span>
              </div>
              <div style={{ height: 6, background: 'var(--bg-overlay)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ height: '100%', width: `${funded}%`, background: barCol, borderRadius: 3, transition: 'width 0.5s ease, background 0.15s' }}/>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, fontFamily: T.font.sans }}>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 700, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{funded}%</span>
                {done
                  ? <span style={{ color: 'var(--text-tertiary)' }}>Έτοιμος</span>
                  : overdue
                    ? <span className="po-fig" data-tone="negative" style={{ fontWeight: 600 }}>απαιτούνται {feAuto(plan.remaining, 0)} τώρα</span>
                    : v.due && plan.requiredMonthly > 0
                      ? <span style={{ color: 'var(--text-tertiary)' }}>{feAuto(plan.requiredMonthly, 0)}/μήνα έως {monthLabel(v.due)}</span>
                      : plan.remaining > 0
                        ? <span style={{ color: 'var(--text-tertiary)' }}>απομένουν {feAuto(plan.remaining, 0)}</span>
                        : null}
              </div>
              {v.apy != null && v.apy > 0 && (v.current || 0) > 0 && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontFamily: T.font.sans, color: 'var(--text-tertiary)' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={on ? 'var(--accent)' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transition: 'stroke 0.15s' }}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.bank || 'Τόκοι'}</span>
                  <span style={{ flex: 1 }}/>
                  <span style={{ color: on ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: 700, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', transition: 'color 0.15s' }}>+{feAuto((v.current || 0) * v.apy / 100, 0)}/έτος</span>
                </div>
              )}
            </div>
          );
        })}

        {/* Νέος κουμπαράς — dashed, γαλάζιο στο hover */}
        <button onClick={() => addVault()}
          onMouseEnter={() => setHoverPct('__new')} onMouseLeave={() => setHoverPct(null)}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 92, background: hoverPct === '__new' ? 'var(--accent-dim)' : 'transparent', border: `1px dashed ${hoverPct === '__new' ? 'var(--border-accent)' : 'var(--border-default)'}`, borderRadius: T.radius.card, cursor: 'pointer', color: hoverPct === '__new' ? 'var(--accent)' : 'var(--text-secondary)', fontFamily: T.font.sans, transition: 'background 0.15s, border-color 0.15s, color 0.15s' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span style={{ fontSize: 12, fontWeight: 500 }}>Νέος κουμπαράς</span>
        </button>
      </div>
      </>)}
    </div>
  );
}
