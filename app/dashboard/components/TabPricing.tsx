'use client';

// ═══════════════════════════════════════════════════════════════════════════
// Δυναμική τιμολόγηση: διαφανείς προτάσεις τιμής/νύχτα για βραχυχρόνια μίσθωση,
// εντοπισμός κενών ημερών προς πλήρωση (με ενέργειες), ρυθμίσεις ανά ακίνητο.
// Επικοινωνεί με το υπόλοιπο app σε πραγματικό χρόνο: ενημερώνεται από τις
// διαμονές/iCal και ενημερώνει (ρυθμίσεις + υπενθυμίσεις ημερολογίου).
//
// ΤΙ ΕΦΥΓΕ ΑΠΟ ΑΥΤΗ ΤΗΝ ΟΘΟΝΗ, ΚΑΙ ΓΙΑΤΙ
//
// 1. «Εκτιμώμενο επιπλέον κέρδος» (KPI + κάρτα). Ήταν ταυτολογία: το app έλεγε
//    «ανέβασε τις τιμές 12% και θα βγάλεις 12% περισσότερα, με την ίδια
//    πληρότητα», και ήταν μαθηματικά αδύνατο να βγει αρνητικό. Πρόβλεψη εσόδων
//    χωρίς ελαστικότητα ζήτησης δεν είναι πρόβλεψη. Μένει το εύρος τιμής.
// 2. «Προβολή εσόδων». Ίδια ρίζα: πολλαπλασιασμός των προτάσεών μας με
//    πληρότητα που εν μέρει επινοήσαμε.
// 3. Η αυτόματη βάση από τ.μ./ενοίκιο (`suggestBaseFallback`). 60 τ.μ. στη
//    Λάρισα έβγαζαν 96 €/νύχτα. Χωρίς ιστορικό δεν προτείνουμε βάση: μένει το
//    EmptyState και η βαθμονόμηση από πραγματικές αγγελίες ανταγωνιστών.
// 4. Το τρίτο έτος (nowYear+2) — 1.096 υπολογισμένες ημέρες για τιμές που
//    κανείς δεν ορίζει δύο χρόνια μπροστά.
// 5. Η λέξη «ζήτηση» από το InfoBanner: δεδομένο ζήτησης δεν υπάρχει πουθενά.
//    Ό,τι μετράμε λέγεται πλέον με το όνομά του, με ΠΗΓΗ ανά πολλαπλασιαστή.
//
// ΤΙ ΠΡΟΣΤΕΘΗΚΕ. (α) Η γραμμή του ΑΜΑ στην κορυφή, ποτέ πίσω από paywall.
// (β) Κάτω από κάθε τιμή, η ανάλυση που κανείς δεν επινοεί: τιμή στον επισκέπτη,
// τέλος ανθεκτικότητας (δεν είναι έσοδό σου), προμήθεια (δαπάνη, όχι μείωση
// εσόδου), και το δηλωτέο ακαθάριστο που μένει.
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import * as properties from '@/lib/data/properties';
import * as stayStore from '@/lib/data/stays';
import * as billStore from '@/lib/data/bills';
import * as expenses from '@/lib/data/expenses'
import * as calendar from '@/lib/data/calendar'
import { T, PageTitle, KPIGrid, InfoBanner, Btn, ExportButton, SecHdr, EmptyState, Skeleton, SkeletonKPIs, fe, fd, fp, fn, pressable, formGrid , fieldRow} from '@/components/Theme';
import { navLabel } from '@/lib/nav/labels';
import { shortTermYearSummary } from '@/lib/tax/shortTermTax';
import { shortTermCashflow } from '@/lib/tax/shortTermCashflow';
import { mergeLedger, type LedgerBill, type LedgerExpense } from '@/lib/expenses/ledger';
import { notify, notifyOk, notifyError } from '@/components/Toast';
import { saved } from '@/components/dbWrite';
import { Tag } from 'lucide-react';
import { NumberInput } from './UIComponents';
import { exportPricingWorkbook } from './sheets';
import {
  recommendPrices, summarize, suggestBase, suggestGuardrails, bookedDatesFromStays,
  realizedAdr, findGaps, estimateSeasonalOccupancy, MIN_NIGHTS_FOR_OCCUPANCY, SEASON_LABELS,
  type DayPrice, type PricingStay, type Gap, type Season,
} from '@/lib/pricing/dynamicPricing';
import { guestPriceBreakdown } from '@/lib/tax/shortTermTax';
import { platformFeeRate, type StayAmountLike } from '@/lib/clients/stayAmounts';
import { athensToday } from '@/lib/core/time';
import { MONTHS_NOM } from '@/lib/core/months';
import { failed } from '@/lib/core/dbError';

interface Props {
  propertyId: string; userId: string; propertyName?: string; propertySqm?: number;
  /** ΔΕΝ ΧΡΗΣΙΜΟΠΟΙΕΙΤΑΙ ΠΙΑ. Το `page.tsx` το περνά ακόμη· έμεινε στον τύπο για
   *  να μη σπάσει η κλήση. Τροφοδοτούσε το `suggestBaseFallback`, που πρότεινε
   *  τιμή/νύχτα από `(ενοίκιο/30) × 2,2` χωρίς τοποθεσία. Δες dynamicPricing.ts. */
  propertyRent?: number;
}

type PriceStay = PricingStay & StayAmountLike;

const WEEKDAYS = ['Δε', 'Τρ', 'Τε', 'Πε', 'Πα', 'Σα', 'Κυ'];
const todayIso = () => athensToday();
const addDaysIso = (d: string, n: number) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

export default function TabPricing({ propertyId, userId, propertyName, propertySqm }: Props) {
  const supabase = createClient();
  const [stays, setStays] = useState<PriceStay[]>([]);
  const [isHouse, setIsHouse] = useState(false);
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
  const [gapTitles, setGapTitles] = useState<Set<string>>(new Set()); // κενά ήδη στο Ημερολόγιο
  const compsKey = `pos-pricing-comps-${propertyId}`;
  const [opex, setOpex] = useState(0);
  const [propCount, setPropCount] = useState(1);
  const [comps, setComps] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(compsKey) || '[]'); } catch { return []; } });
  const [compsOpen, setCompsOpen] = useState(false);
  const loadedSettings = useRef(false);

  // ── Φόρτωση διαμονών + αποθηκευμένων ρυθμίσεων ─────────────────────────────
  const loadStays = useCallback(async () => {
    // Το `declared_at` και το `channel` χρειάζονται για τη φορολογική σύνοψη:
    // πόσες διαμονές δεν έχουν Δήλωση Βραχυχρόνιας, και ανά ποιο κανάλι.
    const data = await stayStore.ofProperty<PriceStay>(supabase, propertyId, stayStore.ACCOUNTING_COLUMNS, userId);
    setStays(data);
  }, [userId, propertyId]);

  // Ο τύπος του ακινήτου κρίνει το κλιμάκιο του τέλους ανθεκτικότητας: το
  // υψηλότερο (15/4 €) ισχύει ΜΟΝΟ για μονοκατοικίες άνω των 80 τ.μ., όχι για
  // κάθε ακίνητο άνω των 80 τ.μ. Χωρίς αυτό, η ανάλυση τιμής θα ήταν λάθος.
  const loadPropType = useCallback(async () => {
    const data = await properties.one<{ prop_type: string }>(supabase, propertyId, 'prop_type', userId);
    setIsHouse(['house', 'villa'].includes(String(data?.prop_type || '').toLowerCase()));
  }, [propertyId]);

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

  // ═══ ΤΑ ΔΥΟ ΝΟΥΜΕΡΑ ΠΟΥ ΕΛΕΙΠΑΝ ΓΙΑ ΝΑ ΚΛΕΙΣΕΙ Η ΑΛΥΣΙΔΑ ═══════════════════
  // Οι λειτουργικές δαπάνες της χρονιάς, και πόσα ακίνητα έχει ο φορολογούμενος
  // (κρίνει την εξαίρεση του τέλους παρεπιδημούντων: ισχύει έως δύο ακίνητα).
  const loadCashflowInputs = useCallback(async () => {
    const [exp, bil, count] = await Promise.all([
      expenses.ledger(supabase, propertyId, { userId }),
      billStore.ofProperty(supabase, propertyId, billStore.LEDGER_COLUMNS, userId),
      properties.countShortTerm(supabase, userId),
    ]);
    // ΚΑΘΕ ΕΥΡΩ ΜΙΑ ΦΟΡΑ. Ο πληρωμένος λογαριασμός και η δαπάνη του είναι το ΙΔΙΟ
    // γεγονός: αθροίζοντας και τα δύο, τα λειτουργικά έξοδα θα έβγαιναν διπλά και
    // το «μένει σε εσένα» θα έδειχνε λιγότερα απ' όσα πραγματικά μένουν. Η
    // συγχώνευση γίνεται από τον κοινό πυρήνα, τον ίδιο που χρησιμοποιούν οι
    // Δαπάνες και ο Προϋπολογισμός — αλλιώς δύο οθόνες μετράνε αλλιώς το ίδιο.
    const { entries } = mergeLedger(bil as LedgerBill[], (exp || []) as LedgerExpense[]);
    setOpex(entries.filter(e => e.date.slice(0, 4) === String(nowYear)).reduce((sum, e) => sum + e.amount, 0));
    setPropCount(Math.max(1, count || 1));
  }, [propertyId, userId, nowYear]);

  // Ποια κενά έχουν ήδη υπενθύμιση στο Ημερολόγιο (για toggle προσθήκη/αφαίρεση).
  const loadGapEvents = useCallback(async () => {
    setGapTitles(new Set(await calendar.titles(supabase, propertyId, { source: 'pricing_gap' })));
  }, [propertyId]);

  useEffect(() => {
    (async () => { setLoading(true); await Promise.all([loadStays(), loadSettings(), loadGapEvents(), loadPropType(), loadCashflowInputs()]); setLoading(false); })();
  }, [loadStays, loadSettings, loadGapEvents, loadPropType, loadCashflowInputs]);

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

  // Αρχική πρόταση βάσης ΜΟΝΟ από πραγματικό ιστορικό (πραγματοποιημένη ADR).
  // Χωρίς ιστορικό δεν προτείνουμε τίποτα: εμφανίζεται το EmptyState και η
  // βαθμονόμηση από αγγελίες ανταγωνιστών, όπου τα νούμερα τα βάζει ο χρήστης.
  useEffect(() => {
    if (touched || loadedSettings.current) return;
    const b = suggestBase(stays);
    if (b > 0) { setBase(b); const g = suggestGuardrails(b); setMin(g.min); setMax(g.max); }
  }, [stays, touched]);

  // ── Αποθήκευση ρυθμίσεων (debounced) ──────────────────────────────────────
  const settingsRef = useRef({ base, min, max, wknd, minStay, touched });
  useEffect(() => { settingsRef.current = { base, min, max, wknd, minStay, touched }; });
  // Ο έλεγχος ζει ΕΔΩ, μαζί με το γράψιμο, και όχι στον καλούντα: έτσι δεν
  // υπάρχει διαδρομή που να αποθηκεύει χωρίς να ρωτά αν αποθηκεύτηκε.
  const persist = useCallback((v: { base: number; min: number; max: number; wknd: number; minStay: number }) =>
    saved('Η τιμολόγηση δεν αποθηκεύτηκε', supabase.from('pricing_settings').upsert({
      user_id: userId, property_id: propertyId, base: v.base, min_price: v.min || null, max_price: v.max || null,
      weekend_premium: v.wknd / 100, min_stay: v.minStay, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,property_id' })), [userId, propertyId]);
  useEffect(() => {
    if (!touched || base <= 0) return;
    const t = setTimeout(async () => {
      // «Αποθηκεύτηκε» χωρίς έλεγχο είναι το χειρότερο μήνυμα που υπάρχει.
      if (!await persist({ base, min, max, wknd, minStay })) return;
      // Το μήνυμα λέει ΤΙ ΙΣΧΥΕΙ, όχι τι θα κερδίσεις: η πρόβλεψη εσόδων έφυγε
      // επειδή ήταν ταυτολογία, και μαζί της κάθε υπόσχεση ποσού.
      const range = `${fe(min || base)}–${fe(max || base)}`;
      setSaveNote(`Αποθηκεύτηκε. Βάση ${fe(base)}, εύρος ${range}, Σαββατοκύριακο +${wknd}%, ελάχιστη διαμονή ${minStay} ${minStay === 1 ? 'νύχτα' : 'νύχτες'}.`);
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
  // Πληρότητα ΜΟΝΟ μετρημένη, ανά εποχή, με κατώφλι 24 πραγματικών νυχτών.
  // Κάτω από αυτό δεν εμφανίζεται κανένας αριθμός: το «δεν ξέρουμε ακόμη» είναι
  // η αλήθεια και είναι χρησιμότερο από ένα prior με ετικέτα «από το ιστορικό σου».
  const occ = useMemo(() => estimateSeasonalOccupancy(stays), [stays]);
  // Ποσοστό προμήθειας από τα ΔΙΚΑ ΤΟΥ δεδομένα· null όταν δεν έχει καταγράψει.
  const feeRate = useMemo(() => platformFeeRate(stays), [stays]);
  const gaps = useMemo(() => findGaps(rows, todayIso()), [rows]);

  // Οι εποχές που εμφανίζονται στο επιλεγμένο έτος, για τη μετρημένη πληρότητα.
  const seasonsShown = useMemo(() => {
    const s = new Set<Season>(); rows.forEach(r => s.add(r.season)); return [...s];
  }, [rows]);
  const measuredOcc = useMemo(() => {
    const vals = seasonsShown.map(s => occ.occ[s]).filter((v): v is number => v != null);
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100);
  }, [seasonsShown, occ]);
  const occNights = useMemo(() => seasonsShown.reduce((a, s) => a + occ.nights[s], 0), [seasonsShown, occ]);

  const kpis = useMemo(() => [
    { label: 'Μέση τιμή ανά νύχτα', value: base > 0 ? fe(sum.avg) : fe(0), sub: 'Διαθέσιμες ημέρες' },
    { label: 'Κατώτατη πρόταση', value: base > 0 ? fe(sum.min) : fe(0), sub: 'Χαμηλότερη ημέρα' },
    { label: 'Υψηλότερη πρόταση', value: base > 0 ? fe(sum.max) : fe(0), sub: 'Ακριβότερη ημέρα' },
    {
      label: 'Πληρότητα από το ιστορικό',
      value: measuredOcc != null ? measuredOcc + '%' : fp(0),
      sub: measuredOcc != null
        ? `${occNights} πραγματικές νύχτες`
        : `Χρειάζονται τουλάχιστον ${MIN_NIGHTS_FOR_OCCUPANCY} νύχτες ανά εποχή`,
    },
  ], [sum, base, measuredOcc, occNights]);

  // ═══ Η ΑΠΑΝΤΗΣΗ ΣΤΟ «ΠΟΣΑ ΜΕΝΟΥΝ ΣΕ ΕΜΕΝΑ» ═══════════════════════════════
  // Ήταν σκορπισμένη σε τρεις οθόνες: η δυναμική τιμή εδώ, τα έσοδα και οι
  // διανυκτερεύσεις στην Επισκόπηση, ο φόρος με τα τέλη στη Λογιστική. Ο
  // ιδιοκτήτης έπρεπε να επισκεφθεί και τις τρεις και να κάνει την αφαίρεση
  // μόνος του — δηλαδή να κάνει ό,τι υποτίθεται ότι κάνει η εφαρμογή.
  const taxSummary = useMemo(
    () => shortTermYearSummary(stays, nowYear, { sqm: propertySqm ?? null, isHouse, propertyCount: propCount, individual: true }),
    [stays, nowYear, propertySqm, isHouse, propCount],
  );
  const cashflow = useMemo(
    () => shortTermCashflow({
      grossRevenue: taxSummary.grossRevenue,
      platformFees: taxSummary.platformFees,
      operatingExpenses: opex,
      municipalTax: taxSummary.municipalTax,
      levyShortfall: taxSummary.levyShortfall,
      incomeTax: taxSummary.incomeTax,
    }),
    [taxSummary, opex],
  );

  const priceRange = useMemo(() => {
    const avail = rows.filter(r => !r.booked).map(r => r.price);
    return { lo: avail.length ? Math.min(...avail) : 0, hi: avail.length ? Math.max(...avail) : 1 };
  }, [rows]);
  // Κανονικοποίηση 0..1. Επιστρέφει και την «οπτική» ένταση με πιο απότομη
  // καμπύλη ώστε οι μέρες αιχμής να ξεχωρίζουν έντονα από τις χαμηλές.
  const norm = (p: number) => { const { lo, hi } = priceRange; return hi <= lo ? 0.5 : Math.max(0, Math.min(1, (p - lo) / (hi - lo))); };
  // ═══ ΔΥΟ ΚΩΔΙΚΟΠΟΙΗΣΕΙΣ ΓΙΑ ΤΗΝ ΙΔΙΑ ΤΙΜΗ ═══════════════════════════════
  // Κάθε κελί είχε ΚΑΙ γέμισμα ΚΑΙ αριθμό: το γέμισμα έφτανε το 98% του accent,
  // δηλαδή σχεδόν συμπαγές γαλάζιο, και από πάνω του καθόταν το ποσό. Τρία
  // πλέγματα επί σαράντα δύο κελιά έβγαζαν έναν τοίχο μπλε όπου δεν ξεχώριζε
  // ούτε η ακριβή μέρα ούτε η φθηνή — και τα δύο ήταν χρωματιστά.
  //
  // Ο αριθμός είναι το περιεχόμενο· το γέμισμα είναι υπόδειξη. Κρατά το ένα
  // έκτο της έντασης: αρκετό για να σαρώσεις με το μάτι πού ανεβαίνει, πολύ
  // λίγο για να ανταγωνιστεί ό,τι γράφει από πάνω του.
  const fillOpacity = (t: number) => 0.03 + Math.pow(t, 1.25) * 0.14;

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
      const { error } = await calendar.clearSource(supabase, { propertyId, userId }, { source: 'pricing_gap', title });
      if (error) { notifyError(failed('Οι ρυθμίσεις τιμολόγησης δεν αποθηκεύτηκαν', error)); return; }
      setGapTitles(prev => { const n = new Set(prev); n.delete(title); return n; });
      notify('Αφαιρέθηκε από το Ημερολόγιο');
      return;
    }
    const rd = (() => { const wanted = addDaysIso(g.start, -5); return wanted < todayIso() ? todayIso() : wanted; })();
    const { error } = await calendar.insert(supabase, [calendar.row({ propertyId, userId }, 'pricing_gap', {
      title, category: 'reminder', event_date: rd, priority: g.soon ? 'high' : 'medium',
      notes: `${g.nights} κενές νύχτες. Προτεινόμενη τιμή πλήρωσης ${fe(g.fillPrice)}/νύχτα${minStay > 1 ? `, ελάχιστη διαμονή ${minStay} νύχτες` : ''}.`,
    })]);
    if (error) { notifyError(failed('Οι ρυθμίσεις τιμολόγησης δεν αποθηκεύτηκαν', error)); return; }
    setGapTitles(prev => new Set(prev).add(title));
    notifyOk('Προστέθηκε στο Ημερολόγιο');
  };
  // Ενέργεια: αντιγραφή κειμένου προσφοράς last minute.
  const copyOffer = (g: Gap) => {
    const txt = `Τελευταία διαθεσιμότητα ${fd(g.start)} - ${fd(g.end)} (${g.nights} ${g.nights === 1 ? 'νύχτα' : 'νύχτες'}) σε ειδική τιμή ${fe(g.fillPrice)} ανά νύχτα${minStay > 1 ? `, ελάχιστη διαμονή ${minStay} νύχτες` : ''}. Κλείσε τώρα, οι ημερομηνίες είναι περιορισμένες.`;
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
      occupancy: measuredOcc != null ? { pct: measuredOcc, nights: occNights } : null,
      realizedAdr: adr,
      rows: rows.map(r => ({ date: r.date, dow: r.dow, season: r.season, isWeekend: r.isWeekend, holidayName: r.holidayName, price: r.price, booked: r.booked })),
    });
  };

  const mark = (fn: (v: number) => void) => (v: number) => { setTouched(true); fn(v); };

  // ── Η γραμμή που κανείς δεν επινοεί ────────────────────────────────────────
  // Ο οικοδεσπότης βλέπει «85 €/νύχτα» και νομίζει ότι εισπράττει 85 και δηλώνει
  // 85. Κανένα από τα δύο. Το τέλος ανθεκτικότητας ΔΕΝ είναι έσοδό του (το κρατά
  // για το κράτος) και η προμήθεια είναι ΔΑΠΑΝΗ που δεν μειώνει το δηλωτέο έσοδο.
  // Τίποτα εδώ δεν είναι επινοημένο: το τέλος από τους συντελεστές της ΑΑΔΕ, η
  // προμήθεια ΜΟΝΟ από το πραγματικό ιστορικό του — αλλιώς λέμε ότι δεν την ξέρουμε.
  // ── ΠΟΤΕ ΑΛΛΑΖΕΙ ΤΟ ΤΕΛΟΣ ΜΕΣΑ ΣΕ ΕΝΑ ΔΙΑΣΤΗΜΑ ────────────────────────────
  // Το ΤΑΚΚ έχει δύο συντελεστές, με σύνορο την 1η Απριλίου και την 1η
  // Νοεμβρίου. Η γραμμή του κενού υπολόγιζε το τέλος ΜΟΝΟ από την ημερομηνία
  // έναρξης και το τύπωνε σαν να ισχύει για όλο το διάστημα: ένα κενό «24 Σεπ
  // έως 31 Δεκ» έγραφε 8,00 € για ενενήντα εννέα νύχτες, ενώ οι εξήντα ένα από
  // αυτές πληρώνουν 2,00 €. Το «μένει σε εσένα» της γραμμής ήταν αντίστοιχα
  // λάθος προς τα κάτω. Οταν το διάστημα περνά το σύνορο, το λέμε και δίνουμε
  // την ημερομηνία — δεν διαλέγουμε σιωπηλά τη μία από τις δύο τιμές.
  const levyChange = (start: string, end?: string) => {
    if (!end) return null;
    const y0 = Number(start.slice(0, 4)), m0 = Number(start.slice(5, 7)) - 1;
    const y1 = Number(end.slice(0, 4)), m1 = Number(end.slice(5, 7)) - 1;
    const high = (m: number) => m >= 3 && m <= 9;
    const from = high(m0);
    for (let y = y0, m = m0; y < y1 || (y === y1 && m <= m1); m === 11 ? (m = 0, y++) : m++) {
      if (high(m) !== from) return { date: `${String(y)}-${String(m + 1).padStart(2, '0')}-01`, toHigh: !from };
    }
    return null;
  };

  const priceLine = (date: string, price: number, end?: string) => {
    const b = guestPriceBreakdown(date, price, { sqm: propertySqm ?? null, isHouse, platformFeeRate: feeRate });
    const change = levyChange(date, end);
    const after = change ? guestPriceBreakdown(change.date, price, { sqm: propertySqm ?? null, isHouse, platformFeeRate: feeRate }) : null;
    return (
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-subtle)', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
        {/* Ήταν μία γραμμή με τρεις παρενθέσεις, δύο παύλες, ένα βέλος και έξι
            έντονα — τέσσερις σειρές κειμένου για να πει μια αφαίρεση. Η αφαίρεση
            γράφεται όπως γράφεται μια αφαίρεση: στη σειρά, με τα ποσά στοιχισμένα. */}
        Τιμή στον επισκέπτη <strong style={{ fontFamily: T.font.num, color: 'var(--text-primary)' }}>{fe(b.guestPrice)}</strong>
        {' · '}τέλος ανθεκτικότητας <strong style={{ fontFamily: T.font.num }}>{fe(b.climateLevy)}</strong>
        {' · '}δηλωτέο ακαθάριστο <strong style={{ fontFamily: T.font.num, color: 'var(--text-primary)' }}>{fe(b.declarableGross)}</strong>
        {b.platformFee != null && <>{' · '}προμήθεια <strong style={{ fontFamily: T.font.num }}>{fe(b.platformFee)}</strong></>}
        {b.payout != null && <>{' · '}μένει σε εσένα <strong style={{ fontFamily: T.font.num }}>{fe(b.payout)}</strong></>}
        {change && after && (
          <div style={{ marginTop: 4, color: 'var(--text-tertiary)' }}>
            Από {fd(change.date)} το τέλος γίνεται <strong style={{ fontFamily: T.font.num }}>{fe(after.climateLevy)}</strong>
            {after.payout != null && <> και μένουν <strong style={{ fontFamily: T.font.num }}>{fe(after.payout)}</strong></>}.
          </div>
        )}
      </div>
    );
  };

  // ── Η ΑΝΑΤΟΜΙΑ ΤΗΣ ΤΙΜΗΣ ΕΞΗΓΕΙΤΑΙ ΜΙΑ ΦΟΡΑ ─────────────────────────────
  // Η ίδια εξήγηση καθόταν ΜΕΣΑ σε κάθε γραμμή κενού. Με οκτώ κενά, ο χρήστης
  // διάβαζε οκτώ φορές τις ίδιες δύο προτάσεις — και στην ένατη, στη λεπτομέρεια
  // ημέρας, άλλη μία. Δεν είναι πληροφορία που αλλάζει ανά γραμμή: το ότι το
  // τέλος ανήκει στο κράτος και ότι η προμήθεια είναι δαπάνη ισχύει για όλη την
  // καρτέλα. Λέγεται μία φορά, εκεί που πρωτοεμφανίζεται η ανάλυση.
  const priceAnatomy = (
    <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.65, fontFamily: T.font.sans }}>
      Το τέλος ανθεκτικότητας εισπράττεται για το κράτος και δεν είναι έσοδό σου.{' '}
      {feeRate != null && feeRate > 0
        ? `Η προμήθεια (${fp(feeRate * 100)}, από τις δικές σου καταγεγραμμένες διαμονές) είναι δαπάνη και δεν μειώνει το δηλωτέο έσοδο.`
        : 'Η προμήθεια της πλατφόρμας δεν φαίνεται σε καμία καταγεγραμμένη διαμονή, οπότε δεν μπαίνει στον υπολογισμό.'}
    </div>
  );

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>
      {/* ═══ Η ΓΡΑΜΜΗ ΤΟΥ ΑΜΑ ΑΠΟΔΙΔΟΤΑΝ ΔΥΟ ΦΟΡΕΣ, ΚΑΙ ΕΡΙΧΝΕ ΤΗΝ ΚΑΡΤΕΛΑ ═══
          Στεκόταν εδώ ΚΑΙ στην καρτέλα «Πελάτης» που φιλοξενεί αυτή την οθόνη.
          Δεν ήταν μόνο διπλοτυπία: και τα δύο αντίγραφα άνοιγαν κανάλι realtime
          με το ΙΔΙΟ όνομα, `ama-strip-<χρήστης><ακίνητο>`. Ο πελάτης της Supabase
          επιστρέφει το ΥΠΑΡΧΟΝ κανάλι για ίδιο όνομα, οπότε το δεύτερο αντίγραφο
          καλούσε `.on()` πάνω σε κανάλι που είχε ήδη κάνει `subscribe()` — και
          αυτό πετά εξαίρεση. Ολόκληρη η καρτέλα έδειχνε «Αυτή η ενότητα δεν
          φόρτωσε». Το ίδιο πράγμα σε δύο σημεία δεν ήταν αισθητικό πρόβλημα εδώ:
          ήταν το σφάλμα. */}

      <PageTitle title="Βραχυχρόνια μίσθωση" titleHint="Προτεινόμενη τιμή ανά νύχτα από τα δικά σου δεδομένα και την ελληνική εποχικότητα. Οι τιμές είναι προτάσεις, τις εφαρμόζεις εσύ στα κανάλια."
        sub="Τι να ζητήσεις ανά νύχτα, ποιες μέρες μένουν κενές, και τι σου μένει στο χέρι μετά από έξοδα, τέλη και φόρο."
        right={rows.length > 0 ? <ExportButton onClick={exportXlsx} label="Εξαγωγή Excel" /> : undefined} />

      {/* Ήταν τέσσερις γραμμές πριν φανεί το πρώτο πεδίο, και τρεις από αυτές
          εξηγούσαν τι ΔΕΝ κάνει η οθόνη. Το ουσιώδες χωρά σε μία: οι τιμές είναι
          προτάσεις, όχι αυτόματη αλλαγή. Το «από πού βγαίνει» το λέει η ίδια η
          ημέρα όταν την πατήσεις, ονομαστικά και με την πηγή της. */}
      {/* Ρυθμίσεις (τυποποιημένα πεδία, αποθηκεύονται αυτόματα) */}
      <div style={{ ...fieldRow(150), margin: '18px 0 6px' }}>
        <NumberInput label="Βασική τιμή ανά νύχτα" value={base ? String(base) : ''} onChange={v => mark(setBase)(Number(v) || 0)} suffix="€" />
        <NumberInput label="Κατώτατο όριο" value={min ? String(min) : ''} onChange={v => mark(setMin)(Number(v) || 0)} suffix="€" />
        <NumberInput label="Ανώτατο όριο" value={max ? String(max) : ''} onChange={v => mark(setMax)(Number(v) || 0)} suffix="€" />
        {/* Το 18 δεν το έγραψε ο χρήστης: είναι η αφετηρία της μηχανής, και το
            πεδίο το παρουσίαζε σαν δική του καταχώρηση. Λέγεται ρητά. */}
        <NumberInput label="Προσαύξηση σαββατοκύριακου" labelInfo="Πόσο ακριβότερη είναι η Παρασκευή και το Σάββατο από τις καθημερινές. Ξεκινά από την αφετηρία της εφαρμογής· άλλαξέ την και οι προτάσεις προσαρμόζονται." value={String(wknd)} onChange={v => mark(setWknd)(Number(v) || 0)} suffix="%" />
        <NumberInput label="Ελάχιστη διαμονή" value={String(minStay)} onChange={v => mark(setMinStay)(Math.max(1, Number(v) || 1))} suffix="νύχτες" />
      </div>
      {/* ΤΟ ΕΤΟΣ ΔΕΝ ΕΙΝΑΙ ΠΕΔΙΟ ΤΙΜΗΣ. Καθόταν έκτη στήλη μέσα στη σειρά, με
          ύψος πεδίου και ίδιο βάρος με τη «Βασική τιμή ανά νύχτα» — και επειδή
          έπιανε στήλη, τα πέντε πραγματικά πεδία στρίμωχναν και η «Προσαύξηση
          σαββατοκύριακου» έσπαγε σε δύο γραμμές. Είναι επιλογή προβολής του
          ημερολογίου από κάτω: μικρότερο, πιο διακριτικό, στη θέση του. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 14px' }}>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>Έτος</span>
        <div style={{ display: 'inline-flex', border: '1px solid var(--border-subtle)', borderRadius: T.radius.pill, overflow: 'hidden', height: 28 }}>
          {[nowYear, nowYear + 1].map(y => (
            <button key={y} onClick={() => setPyear(y)} style={{
              border: 'none', cursor: 'pointer', fontFamily: T.font.sans, fontSize: 12,
              fontWeight: pyear === y ? 700 : 500, padding: '0 14px',
              background: pyear === y ? 'var(--accent-soft)' : 'transparent',
              color: pyear === y ? 'var(--accent)' : 'var(--text-tertiary)',
            }}>{y}</button>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 16, minHeight: 16 }}>
        {adr > 0 && <>Μέση πραγματική τιμή (ADR): <strong style={{ color: 'var(--text-secondary)', fontFamily: T.font.num }}>{fe(adr)}</strong> / νύχτα από {stays.length} διαμονές. </>}
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer' }} {...pressable(() => setCompsOpen(o => !o))}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: T.font.sans, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>Βαθμονόμηση από τον ανταγωνισμό</div>
                <div style={{ fontFamily: T.font.sans, fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>Βάλε τιμές/νύχτα παρόμοιων ακινήτων της περιοχής και δες μια προτεινόμενη βάση</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                {median > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', fontFamily: T.font.num }}>διάμεση {fe(median)}</span>}
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: compsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><path d="m6 9 6 6 6-6" /></svg>
              </div>
            </div>
            {compsOpen && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
                <div style={{ ...formGrid(130, 190), gap: 10, marginBottom: 12 }}>
                  {[0, 1, 2, 3].map(i => (
                    <NumberInput key={i} label={`Ανταγωνιστής ${i + 1}`} value={comps[i] || ''} onChange={v => setComp(i, v)} suffix="€" step={5} placeholder="" />
                  ))}
                </div>
                {compBase > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '12px 14px' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>
                      Προτεινόμενη βάση <strong style={{ color: 'var(--text-primary)', fontFamily: T.font.num }}>{fe(compBase)}</strong> / νύχτα
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
          title="Καμία βασική τιμή ακόμη"
          /* Η υπόδειξη έστελνε σε «εισαγωγή iCal». Το χειριστήριο λέγεται
             «Σύνδεση ημερολογίου» και ζει στους Επισκέπτες — και το «Όρισε τιμή
             ανά νύχτα» δεν έλεγε ΠΟΥ, ενώ το πεδίο είναι δύο εκατοστά πιο πάνω. */
          hint={`Συμπλήρωσε τη «Βασική τιμή ανά νύχτα» πιο πάνω. Εναλλακτικά καταχώρησε διαμονές στους ${navLabel('clients')}, χειροκίνητα ή με τη «Σύνδεση ημερολογίου», και η τιμή θα υπολογιστεί από το ιστορικό σου.`}
        />
      ) : (
        <>
          {/* Η ΟΔΗΓΙΑ ΜΠΑΙΝΕΙ ΟΠΟΥ ΥΠΑΡΧΕΙ ΤΟ ΗΜΕΡΟΛΟΓΙΟ. Ήταν πάνω από όλα, οπότε
              ο χρήστης χωρίς βασική τιμή διάβαζε «Πάτησε μια ημέρα» ενώ καμία
              ημέρα δεν φαινόταν στην οθόνη του. */}
          <InfoBanner tone="info">
            Οι τιμές είναι <strong>προτάσεις</strong>, όχι αυτόματη αλλαγή στα κανάλια. Πάτησε μια ημέρα για να δεις από πού προκύπτει η δική της.
          </InfoBanner>

          <KPIGrid items={kpis} />

          {/* ═══════════════════════════════════════════════════════════════════
              ΑΠΟ ΤΑ ΕΚΑΤΟ ΕΥΡΩ ΤΟΥ ΕΠΙΣΚΕΠΤΗ, ΠΟΣΑ ΜΕΝΟΥΝ ΣΕ ΕΜΕΝΑ
              ─────────────────────────────────────────────────────────────────
              Η δυναμική τιμή από πάνω λέει τι να ζητήσεις. Αυτό εδώ λέει τι σου
              μένει αφού ζητηθεί — και ήταν το μόνο που έλειπε, γιατί ζούσε
              μοιρασμένο σε δύο άλλες οθόνες: τα έσοδα στην Επισκόπηση, ο φόρος
              με τα τέλη στη Λογιστική. Ο ιδιοκτήτης έκανε την αφαίρεση στο μυαλό
              του, ανάμεσα σε τρεις καρτέλες.

              ΔΕΝ ΕΙΝΑΙ ΤΟ ΙΔΙΟ ΜΕ ΤΗ ΛΟΓΙΣΤΙΚΗ. Εκεί το «καθαρό» απαντά σε
              φορολογικό ερώτημα και αφαιρεί μόνο φόρο και τέλη. Εδώ απαντά σε
              ταμειακό και αφαιρεί ΚΑΙ τα έξοδα. Δύο σωστά νούμερα, δύο
              διαφορετικές ερωτήσεις, δύο διαφορετικές λέξεις. */}
          {taxSummary.stayCount > 0 && (
            <div className="card" style={{ marginTop: 20 }}>
              <SecHdr label={`Τι μένει σε εσένα, ${nowYear}`}
                sub={`Από ${fn(taxSummary.totalNights)} διανυκτερεύσεις σε ${taxSummary.stayCount === 1 ? 'μία διαμονή' : `${fn(taxSummary.stayCount)} διαμονές`}`}
                right={cashflow.keptPct != null
                  ? <span title="Ποσοστό των ακαθαρίστων που καταλήγει σε εσένα" style={{ fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{fp(cashflow.keptPct)}</span>
                  : undefined} />

              {/* Μία στήλη, μία υποδιαστολή. Οι εκροές έχουν εσοχή ώστε να
                  διαβάζονται ως αφαιρέσεις από τη γραμμή που τις γεννά, χωρίς
                  να χρειάζεται πρόσημο που θα μετακινούσε τα ψηφία. */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {cashflow.steps.map(step => {
                  const isTotal = step.kind === 'total';
                  const isOut = step.kind === 'out';
                  return (
                    <div key={step.key} title={step.note}
                      style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16,
                        padding: isTotal ? '14px 0 2px' : '9px 0',
                        borderTop: isTotal ? '1px solid var(--border-default)' : 'none',
                        marginTop: isTotal ? 6 : 0 }}>
                      <span style={{ fontFamily: T.font.sans, fontSize: isTotal ? 14 : 12.5,
                        fontWeight: isTotal ? 700 : 400,
                        color: isTotal ? 'var(--text-primary)' : 'var(--text-secondary)',
                        paddingLeft: isOut ? 14 : 0, minWidth: 0 }}>{step.label}</span>
                      <span style={{ fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums',
                        fontSize: isTotal ? 19 : 13,
                        fontWeight: isTotal ? 700 : 500,
                        color: isTotal ? 'var(--text-primary)' : 'var(--text-secondary)',
                        whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {isOut ? '−' : cashflow.net < 0 && isTotal ? '−' : ''}{fe(step.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Η αναλογία με μια ματιά: πόσο από τη μπάρα μένει δικό σου. */}
              {cashflow.keptPct != null && cashflow.net > 0 && (
                <div style={{ marginTop: 14, height: 6, background: 'var(--bg-overlay)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, cashflow.keptPct)}%`, background: 'var(--accent)', borderRadius: 3, transition: 'width 0.5s' }} />
                </div>
              )}

              {/* ΟΠΟΥ ΤΟ ΝΟΥΜΕΡΟ ΕΙΝΑΙ ΕΚΤΙΜΗΣΗ, ΤΟ ΛΕΜΕ ΔΙΠΛΑ ΤΟΥ. Διαμονές με
                  απροσδιόριστη βάση ποσού κάνουν τα ακαθάριστα εκτίμηση· διαμονές
                  χωρίς Δήλωση Βραχυχρόνιας είναι εκκρεμότητα, όχι λογιστικό λάθος. */}
              <div style={{ marginTop: 14, fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.65 }}>
                Ο φόρος υπολογίζεται στα ακαθάριστα με την κλίμακα ενοικίων, όχι στο υπόλοιπο μετά τα έξοδα. Δεν περιλαμβάνονται δόσεις δανείου.
                {taxSummary.unresolvedCount > 0 && ` ${taxSummary.unresolvedCount === 1 ? 'Μία διαμονή' : `${fn(taxSummary.unresolvedCount)} διαμονές`} χωρίς ανάλυση ποσού σε ακαθάριστο, προμήθεια και τέλος: τα ακαθάριστα είναι εκτίμηση ως τότε.`}
                {taxSummary.undeclaredCount > 0 && ` ${taxSummary.undeclaredCount === 1 ? 'Μία διαμονή δεν έχει' : `${fn(taxSummary.undeclaredCount)} διαμονές δεν έχουν`} Δήλωση Βραχυχρόνιας Διαμονής.`}
              </div>
            </div>
          )}

          {/* Η μετρημένη πληρότητα, με την απόδειξή της. Καμία προβολή εσόδων:
              πολλαπλασιάζοντας τις δικές μας προτάσεις με τη δική μας εκτίμηση
              πληρότητας, θα παρήγαμε «κέρδος» που δεν μπορεί να βγει αρνητικό. */}
          {measuredOcc == null && occNights > 0 && (
            <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
              Έχεις {occNights} καταγεγραμμένες νύχτες σε αυτό το ακίνητο. Η πληρότητα εμφανίζεται όταν συγκεντρωθούν {MIN_NIGHTS_FOR_OCCUPANCY}+ πραγματικές νύχτες σε μια εποχή. Κάτω από αυτό ο αριθμός θα ήταν εικασία με ετικέτα μέτρησης.
            </div>
          )}

          {/* Κενές μέρες προς πλήρωση (actionable) */}
          {gaps.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <SecHdr label="Κενές μέρες προς πλήρωση" sub="Διαστήματα χωρίς κράτηση, με προτεινόμενη τιμή και άμεσες ενέργειες" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {gaps.slice(0, 8).map((g, i) => (
                  <div key={i} className="po-fig-card" tabIndex={0} style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-raised)', borderRadius: T.radius.card, padding: 16, boxShadow: 'var(--highlight-inset), var(--elev-1)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          {fd(g.start)} - {fd(g.end)}
                          {g.hard && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.pill, padding: '1px 6px' }}>δύσκολο κενό</span>}
                          {g.soon && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.pill, padding: '1px 6px' }}>άμεσα</span>}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 3 }}>{g.nights} {g.nights === 1 ? 'νύχτα' : 'νύχτες'} · εποχή {SEASON_LABELS[g.season]} · πρόταση πλήρωσης <strong className="po-fig" data-tone="accent" style={{ fontFamily: T.font.num }}>{fe(g.fillPrice)}</strong>/νύχτα</div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <Btn variant="secondary" onClick={() => copyOffer(g)}>Αντιγραφή προσφοράς</Btn>
                        <Btn variant="secondary" onClick={() => toggleGap(g)}>{gapTitles.has(gapTitle(g)) ? 'Προστέθηκε στο Ημερολόγιο' : 'Υπενθύμιση'}</Btn>
                      </div>
                    </div>
                    {/* Και εδώ, όχι μόνο στη λεπτομέρεια ημέρας: η τιμή προσφοράς
                        είναι ακριβώς η στιγμή που ο χρήστης υπολογίζει «τι βγάζω». */}
                    {priceLine(g.start, g.fillPrice, g.end)}
                  </div>
                ))}
              </div>
              {priceAnatomy}
            </div>
          )}

          {/* Ημερολόγιο-heatmap */}
          <div style={{ marginTop: 24 }}>
            <SecHdr label="Ημερολόγιο τιμών" sub="Όσο πιο σκούρη η ημέρα, τόσο υψηλότερη η προτεινόμενη τιμή. Πάτησε μια ημέρα για ανάλυση."
              right={pastCount > 0 ? <button onClick={() => setShowPast(v => !v)} style={{ background: 'none', border: '1px solid var(--border-default)', borderRadius: T.radius.pill, padding: '6px 14px', fontSize: 12, fontWeight: 600, fontFamily: T.font.sans, color: 'var(--text-secondary)', cursor: 'pointer' }}>{showPast ? 'Κρύψε προηγούμενους μήνες' : `Δείξε προηγούμενους μήνες (${pastCount})`}</button> : undefined} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
              {visibleMonths.map(([key, days]) => {
                const [yy, mm] = key.split('-').map(Number);
                const firstDow = new Date(Date.UTC(yy, mm - 1, 1)).getUTCDay();
                const lead = (firstDow + 6) % 7;
                const byDay = new Map(days.map(d => [Number(d.date.slice(8, 10)), d]));
                const daysInMonth = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
                return (
                  <div key={key} style={{ flex: '1 1 300px', minWidth: 280, background: 'var(--surface-raised)', border: '1px solid var(--border-raised)', borderRadius: T.radius.card, padding: 16, boxShadow: 'var(--highlight-inset), var(--elev-1)' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>{MONTHS_NOM[mm - 1]} {yy}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                      {WEEKDAYS.map(w => <div key={w} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', paddingBottom: 4 }}>{w}</div>)}
                      {Array.from({ length: lead }).map((_, i) => <div key={'b' + i} />)}
                      {Array.from({ length: daysInMonth }).map((_, i) => {
                        const dayNum = i + 1;
                        const d = byDay.get(dayNum);
                        if (!d) return <div key={dayNum} style={{ aspectRatio: '1', borderRadius: 8, background: 'var(--bg-base)', opacity: 0.4 }} />;
                        const past = pyear === nowYear && d.date < todayIso();
                        const t = past ? 0 : norm(d.price);
                        const top = !past && t > 0.82 && !d.booked;     // κορυφαία αιχμή: έξτρα έμφαση
                        return (
                          <button key={dayNum} onClick={() => setSel(d)} title={[d.holidayName, d.booked ? 'Ήδη κλεισμένη' : `Προτεινόμενη τιμή ${fe(d.price)}`].filter(Boolean).join(' · ')}
                            aria-label={`${fd(d.date)}: ${d.booked ? 'ήδη κλεισμένη' : `προτεινόμενη τιμή ${fe(d.price)}`}${d.holidayName ? `, ${d.holidayName}` : ''}`}
                            aria-pressed={sel?.date === d.date} style={{
                            position: 'relative', aspectRatio: '1', borderRadius: 8, cursor: 'pointer', overflow: 'hidden',
                            border: sel?.date === d.date ? '2px solid var(--accent)' : top ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
                            background: d.booked ? 'var(--bg-base)' : 'var(--surface-raised)', padding: 0,
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                            opacity: past ? 0.4 : 1,
                          }}>
                            {/* Το κελί δεν μεγαλώνει πια στην αιχμή: ένα κελί που
                                αλλάζει μέγεθος σπάει το πλέγμα γύρω του και το
                                μάτι το διαβάζει ως σφάλμα. Η αιχμή ξεχωρίζει από
                                το περίγραμμα και το βάρος του αριθμού. */}
                            {!d.booked && !past && <span style={{ position: 'absolute', inset: 0, background: 'var(--accent)', opacity: fillOpacity(t) }} />}
                            {/* ══ Η ΛΕΞΗ ΔΕΝ ΧΩΡΑΕΙ, ΚΑΙ ΔΕΝ ΕΙΝΑΙ ΘΕΜΑ ΓΡΑΜΜΑΤΟΣΕΙΡΑΣ ══
                                Το κελί είναι ΤΕΤΡΑΓΩΝΟ (aspectRatio: 1) σε πλέγμα
                                εφτά στηλών: με δύο μήνες δίπλα-δίπλα βγαίνει ~33
                                εικονοστοιχεία πλάτος. Η λέξη «πιασμένη» στα 9px
                                θέλει ~37. Με `overflow: hidden` το αποτέλεσμα ήταν
                                «πιασμέν» και «ιασμένι» — κομμένο ΚΑΙ ΑΠΟ ΤΙΣ ΔΥΟ
                                μεριές, γιατί είναι κεντραρισμένο. Μικρότερα
                                γράμματα δεν το λύνουν· το μετακινούν στην επόμενη
                                στενή οθόνη.
                                Η διαγώνιος διαβάζεται σε κάθε πλάτος, δεν έχει
                                γλώσσα, και είναι το σήμα που χρησιμοποιεί κάθε
                                ημερολόγιο κρατήσεων. Το υπόμνημα από κάτω τη λέει
                                με λέξεις μία φορά, αντί για τριάντα.

                                ΥΦΗ ΚΑΙ ΟΧΙ ΜΙΑ ΔΙΑΓΩΝΙΟΣ: μία γραμμή γωνία προς
                                γωνία περνά ΑΚΡΙΒΩΣ πάνω από τον αριθμό της ημέρας
                                και τον κάνει δυσανάγνωστο (δοκιμάστηκε και στα δύο
                                θέματα). Η επαναλαμβανόμενη ράβδωση κάθεται πίσω
                                από τον αριθμό χωρίς να τον κόβει, και έχει ένα
                                ακόμη πλεονέκτημα: οι διαδοχικές κλεισμένες νύχτες
                                σχηματίζουν ΕΝΙΑΙΑ ζώνη, δηλαδή η κράτηση φαίνεται
                                ως κράτηση αντί για επτά ξεχωριστά τετράγωνα. */}
                            {d.booked && <span aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(45deg, transparent 0 4px, var(--border-default) 4px 5px)', opacity: 0.75 }} />}
                            <span style={{ position: 'relative', fontSize: 11, fontWeight: 600, color: d.booked ? 'var(--text-tertiary)' : 'var(--text-tertiary)' }}>{dayNum}</span>
                            {/* Ακέραια ευρώ στο κελί, δύο δεκαδικά στην ανάλυση που
                                ανοίγει με το πάτημα: το «45,00» είναι πέντε
                                χαρακτήρες για να πει αυτό που λένε δύο.
                                ΤΟ ΣΥΜΒΟΛΟ ΟΜΩΣ ΕΛΕΙΠΕ, και ένα γυμνό «45» δίπλα
                                σε ένα «45» της επόμενης ημέρας δεν λέει αν είναι
                                ευρώ, ποσοστό ή νύχτες. Μπαίνει μικρότερο και
                                πιο σβηστό: διαβάζεται ως μονάδα, όχι ως ψηφίο. */}
                            {/* Κλεισμένη ημέρα: δεν έχει προτεινόμενη τιμή, και η
                                παύλα που έμπαινε στη θέση της διαβαζόταν ως
                                «λείπει τιμή» αντί για «είναι πιασμένη». */}
                            {!d.booked && (() => {
                              /* ══ ΤΕΤΡΑΨΗΦΙΑ ΤΙΜΗ ΚΟΒΟΤΑΝ ΚΑΙ ΑΠΟ ΤΙΣ ΔΥΟ ΜΕΡΙΕΣ ══
                                 Ιδιο σφάλμα με τη λέξη «πιασμένη», ίδιο κελί: το
                                 τετράγωνο βγαίνει 34,8 εικονοστοιχεία σε στενή
                                 κάρτα (33 ωφέλιμα), και το «1.250 €» στα 12px
                                 θέλει 37. Επειδή είναι κεντραρισμένο, χανόταν το
                                 πρώτο ψηφίο ΚΑΙ το σύμβολο: το 1.250 διαβαζόταν
                                 «.25». Σε οθόνη που ο ιδιοκτήτης χρησιμοποιεί για
                                 να ορίσει τιμή, αυτό δεν είναι θέμα τυπογραφίας.
                                 Το μέγεθος βγαίνει από το ΜΗΚΟΣ, μετρημένο σε
                                 Chromium στο στενότερο δυνατό κελί:
                                   ως 3 ψηφία   12px → 27 / 33
                                   ως 5 χαρακτ. 10px → 31 / 33
                                   πάνω από     9px → 33 / 33 */
                              const txt = fn(d.price);
                              const [fs, es] = txt.length <= 3 ? [12, 9] : txt.length <= 5 ? [10, 8] : [9, 7];
                              return (
                                <span style={{ position: 'relative', fontSize: fs, fontWeight: top ? 800 : 600, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                                  {txt}
                                  <span style={{ fontSize: es, fontWeight: 600, marginLeft: 1.5, opacity: 0.55 }}>€</span>
                                </span>
                              );
                            })()}
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
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 44, height: 10, borderRadius: 3, background: 'linear-gradient(90deg, color-mix(in srgb, var(--accent) 12%, transparent), var(--accent))' }} />από χαμηλή σε υψηλή τιμή</span>
              {/* «υψηλή ζήτηση» έφυγε: το σημάδι δηλώνει ΑΡΓΙΑ, που είναι
                  ημερολογιακό γεγονός. Δεδομένο ζήτησης δεν έχουμε. */}
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)' }} />αργία</span>
              {/* ΤΟ ΥΠΟΜΝΗΜΑ ΞΑΝΑΠΟΚΤΑ ΤΗΝ ΤΡΙΤΗ ΓΡΑΜΜΗ ΤΟΥ, ΤΩΡΑ ΜΕ ΛΟΓΟ.
                  Είχε αφαιρεθεί σωστά, όταν εξηγούσε μια παύλα που δεν υπήρχε
                  πουθενά. Στη συνέχεια η κλεισμένη ημέρα έγραφε τη λέξη
                  «πιασμένη» μέσα στο κελί — και εκείνη δεν χωρούσε: 48
                  εικονοστοιχεία κείμενο σε κελί 32. Πλέον υπάρχει σήμα που ΟΝΤΩΣ
                  φαίνεται, και το δείγμα δίπλα στη λέξη είναι ΤΟ ΙΔΙΟ που βλέπει
                  κανείς μέσα στο κελί. */}
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 14, height: 14, borderRadius: 4, border: '1px solid var(--border-subtle)', backgroundImage: 'repeating-linear-gradient(45deg, transparent 0 4px, var(--border-default) 4px 5px)' }} />
                κλεισμένη
              </span>
            </div>
          </div>

          {/* Λεπτομέρεια επιλεγμένης ημέρας */}
          {sel && (
            <div className="po-fig-card" tabIndex={0} style={{ marginTop: 20, background: 'var(--bg-base)', boxShadow: 'var(--well-inset)', borderRadius: T.radius.card, padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{fd(sel.date)}{sel.holidayName ? ` · ${sel.holidayName}` : ''}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>Εποχή {SEASON_LABELS[sel.season]}{sel.isWeekend ? ' · Σαββατοκύριακο' : ''}{sel.booked ? ' · Ήδη κλεισμένη' : ''}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="po-fig" data-tone="accent" style={{ fontSize: 22, fontWeight: 700, fontFamily: T.font.num }}>{fe(sel.price)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>ανά νύχτα</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)' }}>
                  <span>Βάση</span><span className="po-fig" style={{ fontFamily: T.font.num }}>{fe(sel.base)}</span>
                </div>
                {/* Κάθε πολλαπλασιαστής με ΤΗΝ ΠΗΓΗ ΤΟΥ: ο χρήστης βλέπει ποιο
                    νούμερο είναι μέτρηση, ποιο ημερολόγιο και ποιο παραδοχή μας. */}
                {sel.factors.map((f, i) => {
                  const pct = Math.round((f.mult - 1) * 100);
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
                      <span style={{ minWidth: 0 }}>
                        {f.label}
                        <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5, marginTop: 1 }}>από: {f.source}</span>
                      </span>
                      <span className="po-fig" data-tone={pct > 0 ? 'positive' : pct < 0 ? 'negative' : undefined} style={{ fontFamily: T.font.num, flexShrink: 0 }}>{pct > 0 ? '+' : ''}{pct}%</span>
                    </div>
                  );
                })}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, borderTop: '1px solid var(--border-subtle)', paddingTop: 8, marginTop: 2 }}>
                  <span>Προτεινόμενη τιμή</span><span className="po-fig" data-tone="accent" style={{ fontFamily: T.font.num }}>{fe(sel.price)}</span>
                </div>
              </div>
              {priceLine(sel.date, sel.price)}
              {gaps.length === 0 && priceAnatomy}
            </div>
          )}
        </>
      )}

    </div>
  );
}
