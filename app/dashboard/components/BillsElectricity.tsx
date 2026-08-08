'use client';

import { useState, useMemo, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { NumberInput, CustomSelect, Toggle, DatePicker } from './UIComponents';
import { useBillsSettings } from './BillsSettings';
import { T, fe, fn, Skeleton, histInputStyle, ABSENT_SHORT } from '@/components/Theme';
import { monthlyCost, compareTariffs, estimateUsage, type Tariff, type Usage } from '@/lib/energy/tariff';
import { PROVIDERS, COMPARABLE_TARIFFS, FLAT_WITHOUT_ALLOWANCE } from '@/lib/energy/catalogue';
import { canRecommend, freshness, RAAEY_COMPARE } from '@/lib/energy/freshness';
import { MONTHS_SHORT } from '@/lib/core/months';

const fk = (n: number) => `${fe(n, 4)}`;
// Η ημερομηνία τελευταίου ελέγχου των τιμών.
//
// ΓΙΑΤΙ ΓΡΑΜΜΕΝΗ ΕΔΩ ΚΑΙ ΟΧΙ ΜΕ import ΤΟΥ JSON: ένα `import ... from '.json'`
// σε module scope, μέσα σε αρχείο που φορτώνεται σε ΚΑΘΕ άνοιγμα του πίνακα
// ελέγχου, είναι εξάρτηση από τον τρόπο που ο bundler κάνει interop τα JSON. Αν
// αστοχήσει, δεν σκάει μια οθόνη: δεν φορτώνει ΟΛΗ η εφαρμογή, επειδή το
// σφάλμα συμβαίνει πριν καν αποδοθεί τίποτα. Δεν αξίζει τέτοιο ρίσκο για μια
// ετικέτα ημερομηνίας.
//
// Η συνέπεια με το data/price-sources.json, που είναι η πηγή αλήθειας για το
// workflow φρεσκάδας, φυλάσσεται από test: αν αποκλίνουν, κοκκινίζει το CI.
const LAST_UPDATED = 'Ιούλιος 2026';
// ΤΟ `RAAYEY_URL` ΔΕΝ ΕΔΕΙΧΝΕ ΣΤΗ ΡΑΑΕΥ. Έδειχνε στο energycost.gr, ιδιωτικό
// site, ενώ το κουμπί είχε title «Ρυθμιστική Αρχή Αποβλήτων, Ενέργειας και
// Υδάτων» και το κείμενο έλεγε «Διασταύρωσε στη ΡΑΑΕΥ». Ο χρήστης πίστευε ότι
// πάει στη ρυθμιστική αρχή για να επαληθεύσει, και πήγαινε αλλού. Η πραγματική
// σελίδα ζει στο `lib/energy/freshness.ts`, μαζί με τον κανόνα παλαιότητας.
// Ο υπολογισμός κόστους ζει σε ένα σημείο, με tests. Δείτε lib/energy/tariff.ts
// για τον λόγο: εδώ υπήρχαν δύο διαφορετικοί τύποι για το ίδιο νούμερο.


// ── CONTRACT DURATION OPTIONS ─────────────────────────────────────────────────
const DURATION_OPTIONS = [
  { value: '',    label: 'Χωρίς δέσμευση' },
  { value: '12',  label: '12 μήνες'        },
  { value: '18',  label: '18 μήνες'        },
  { value: '24',  label: '24 μήνες'        },
  { value: '36',  label: '36 μήνες'        },
];

/**
 * ΠΟΤΕ ΕΠΑΛΗΘΕΥΤΗΚΑΝ ΟΙ ΤΙΜΕΣ ΤΟΥ ΚΑΤΑΛΟΓΟΥ.
 *
 * ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΚΛΕΙΝΕΙ: ο κατάλογος αερίου (`BillsGas.tsx`) είχε ΚΑΙ
 * ημερομηνία επαλήθευσης ΚΑΙ σήμανση ανά τιμή («επιβεβαιωμένη / ενδεικτική /
 * τύπος»). Ο κατάλογος ρεύματος, με 100 τιμολόγια από έντεκα παρόχους, δεν
 * είχε ούτε το ένα ούτε το άλλο — και πάνω του έτρεχε αυτόκλητη ειδοποίηση
 * «άλλαξε πάροχο και κέρδισε». Δύο οθόνες, δύο πρότυπα ειλικρίνειας.
 *
 * Τα τιμολόγια ανακοινώνονται την 1η κάθε μήνα. Μετά το κατώφλι παλαιότητας η
 * σύγκριση ΠΑΥΕΙ να ονομάζει νικητή — δεν σβήνει, σταματά να αποφαίνεται.
 *
 * ΗΤΑΝ ΔΕΥΤΕΡΗ ΠΗΓΗ, ΚΑΙ ΤΟ ΕΓΡΑΨΑ ΕΓΩ. Μπήκε ως '2026-07-08' ενώ το
 * `data/price-sources.json` — που δηλώνει τον εαυτό του «μία πηγή αλήθειας για
 * το πότε ελέγχθηκαν οι τιμές» και έχει δικό του workflow φρεσκάδας — έλεγε
 * '2026-07-29'. Απόκλιση είκοσι μιας ημερών, χωρίς τίποτα να την ελέγχει: το
 * υπάρχον test φύλαγε μόνο το `LAST_UPDATED`. Συγχρονίστηκε, και φυλάσσεται
 * πλέον από το ίδιο test — αλλιώς η επόμενη απόκλιση θα ήταν εξίσου αθόρυβη.
 */
export const TARIFFS_VERIFIED = '2026-07-29';
/** Το κατώφλι του ρεύματος, από το `maxAgeDays` του data/price-sources.json. */
export const TARIFFS_MAX_AGE_DAYS = 40;


// ΗΤΑΝ ΠΙΝΑΚΑΣ ΕΞΙ ΕΓΓΡΑΦΩΝ ΜΕ ΠΑΝΟΜΟΙΟΤΥΠΕΣ ΤΙΜΕΣ, ΚΑΙ ΕΝΑ ΨΕΥΔΕΣ ΣΧΟΛΙΟ.
// Το σχόλιο έλεγε «Τώρα distinct teal» για το FLAT· το FLAT είχε ακριβώς το ίδιο
// γκρι με τα υπόλοιπα πέντε, και με το fallback. Δηλαδή ένας πίνακας
// αντιστοίχισης που δεν αντιστοιχίζει τίποτα, με σχόλιο που περιγράφει
// χαρακτηριστικό που δεν υπάρχει — το χειρότερο είδος νεκρού κώδικα, γιατί
// διαβάζεται ως κανόνας. Η σήμανση έχει ΕΝΑ ουδέτερο ύφος, όπως κάθε ετικέτα
// της εφαρμογής, και ο τύπος του τιμολογίου λέγεται με λέξεις.
const bc = () => ({ bg: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: 'var(--border-subtle)' });

const ELEC_DEFAULTS = {
  elecProvider: 'dei', elecTariff: 'dei_enter', useEbill: true,
  kwhMonthly: '250', nightPct: '30', kwhHistory: Array(12).fill(''),
  contractStart: '', contractMonths: '', manualMonthly: '',
};

// ═══════════════════════════════════════════════════════════════════════════
// Η ΣΥΓΚΡΙΣΗ ΩΣ ΕΙΔΟΠΟΙΗΣΗ, ΟΧΙ ΩΣ ΚΑΡΤΕΛΑ.
//
// Ο ιδιοκτήτης δεν ανοίγει καρτέλα «σύγκριση παρόχων» — δεν ξύπνησε το πρωί
// θέλοντας να συγκρίνει τιμολόγια. Θέλει να του πουν, μία φορά, ότι πληρώνει
// παραπάνω. Αυτή η συνάρτηση απαντά ΜΟΝΟ όταν υπάρχει πραγματική διαφορά πάνω
// σε ΠΡΑΓΜΑΤΙΚΗ κατανάλωση: αν δεν ξέρουμε πόσες κιλοβατώρες καίει (ούτε από
// ιστορικό, ούτε από τους λογαριασμούς του), επιστρέφει null. Σύγκριση πάνω σε
// μαντεψιά είναι χειρότερη από καμία σύγκριση: οδηγεί σε αλλαγή παρόχου με
// λάθος κριτήριο.
// ═══════════════════════════════════════════════════════════════════════════

/** Το ελάχιστο μηνιαίο όφελος που αξίζει να διακόψει τον χρήστη. */
const SWITCH_NOISE = 5;

export interface SwitchFinding {
  /** Τι πληρώνει σήμερα, τον μήνα. */
  current: number;
  /** Τι θα πλήρωνε με την καλύτερη εναλλακτική. */
  best: number;
  /** Πάντα θετικό: πόσα τον μήνα. */
  savingsMonthly: number;
  /** Πώς λέγεται η εναλλακτική («ΔΕΗ myHome Enter»). */
  bestLabel: string;
  /** Πάνω σε τι στηρίζεται το νούμερο, με τα λόγια του χρήστη. */
  basedOn: string;
}

export function electricitySwitchFinding(
  s: Record<string, unknown> | null | undefined,
  billsKwh: number[],
): SwitchFinding | null {
  if (!s) return null;
  const usageEst = estimateUsage(
    (s.kwhHistory as string[]) ?? [], billsKwh, parseFloat(String(s.kwhMonthly ?? '')),
  );
  // Χωρίς αξιόπιστη κατανάλωση, καμία ειδοποίηση.
  if (usageEst.source === 'unknown' || !usageEst.reliable) return null;

  const providerObj = PROVIDERS.find(p => p.value === (s.elecProvider ?? 'dei')) || PROVIDERS[0];
  const tariff = providerObj.tariffs.find(t => t.id === s.elecTariff) || providerObj.tariffs[0];
  if (!tariff) return null;

  const usage: Usage = {
    kwhMonthly: usageEst.kwhMonthly,
    nightPct: parseFloat(String(s.nightPct ?? '')) || 30,
    ebill: s.useEbill === undefined ? true : Boolean(s.useEbill),
    manualMonthly: parseFloat(String(s.manualMonthly ?? '')) || 0,
  };
  const current = monthlyCost(tariff as Tariff, usage).total;

  const ranked = compareTariffs(
    COMPARABLE_TARIFFS(),
    usage, tariff.id, current,
  ).filter(r => r.tariff.segment === tariff.segment);

  const best = ranked[0];
  if (!best || best.isCurrent) return null;
  const savings = current - best.cost.total;
  if (!(savings >= SWITCH_NOISE)) return null;

  // ΔΥΟ ΠΡΟΫΠΟΘΕΣΕΙΣ ΓΙΑ ΝΑ ΠΟΥΜΕ «ΑΛΛΑΞΕ»: αξιόπιστη κατανάλωση (ίσχυε ήδη,
  // πιο πάνω) ΚΑΙ φρέσκος κατάλογος (έλειπε). Η ειδοποίηση είναι αυτόκλητη και
  // οδηγεί σε δέσμευση δώδεκα μηνών· σε τιμές περασμένου μήνα δεν εκδίδεται.
  if (!canRecommend(freshness(TARIFFS_VERIFIED, new Date(), TARIFFS_MAX_AGE_DAYS), usageEst.reliable)) return null;

  return {
    current, best: best.cost.total, savingsMonthly: savings,
    bestLabel: `${best.tariff.providerLabel} ${best.tariff.name}`,
    basedOn: usageEst.source === 'history'
      ? `${usageEst.kwhMonthly} kWh τον μήνα, από το ιστορικό σου`
      : usageEst.source === 'bills'
      ? `${usageEst.kwhMonthly} kWh τον μήνα, από τους λογαριασμούς σου`
      : `${usageEst.kwhMonthly} kWh τον μήνα`,
  };
}

export default function BillsElectricity({ propertyId, userId, onNavigateTab }: { propertyId: string; userId?: string; onNavigateTab?: (tab: string) => void }) {
  const supabase   = createClient();
  const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 20, marginBottom: 16 };
  const g2: React.CSSProperties   = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14, marginBottom: 14 };
  const currentMonth = new Date().getMonth();
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);

  // Το τρίτο στοιχείο (loading) αγνοούνταν: η καρτέλα «Ρεύμα» εμφάνιζε τα
  // ELEC_DEFAULTS (ΔΕΗ, 250 kWh) σαν να ήταν τα αποθηκευμένα στοιχεία του χρήστη και
  // μετά τα αντικαθιστούσε σιωπηλά — ο χρήστης προλάβαινε να διαβάσει λάθος κόστος.
  const [s, su, loading] = useBillsSettings(propertyId, userId || '', 'electricity', ELEC_DEFAULTS);

  const [provider,         setProvider]         = useState('dei');
  const [tariffId,         setTariffId]         = useState('dei_enter');
  const [useEbill,         setUseEbill]          = useState(true);
  const [kwhMonthly,       setKwhMonthly]       = useState('250');
  const [nightPct,         setNightPct]         = useState('30');
  const [kwhHistory,       setKwhHistory]       = useState<string[]>(Array(12).fill(''));
  const [contractStart,    setContractStart]    = useState('');
  const [contractMonths,   setContractMonths]   = useState('');
  const [manualMonthly,    setManualMonthly]    = useState('');
  const [insData,          setInsData]          = useState<{ eq: boolean; fl: boolean } | null>(null);
  const [segmentFilter,    setSegmentFilter]    = useState<'residential' | 'business'>('residential');
  // Κιλοβατώρες από τους ΠΡΑΓΜΑΤΙΚΟΥΣ λογαριασμούς του χρήστη. Η στήλη bills.kwh
  // υπήρχε από την αρχή και δεν τη ρωτούσε κανείς: η σύγκριση έτρεχε πάνω σε
  // προεπιλογή 250 κιλοβατώρες, δηλαδή πάνω σε κατανάλωση κάποιου άλλου.
  const [billsKwh,         setBillsKwh]         = useState<number[]>([]);

  // Φόρτωση από τις ρυθμίσεις
  useEffect(() => {
    if (!s) return;
    if (s.elecProvider)          setProvider(s.elecProvider as string);
    if (s.elecTariff)            setTariffId(s.elecTariff as string);
    if (s.useEbill !== undefined) setUseEbill(Boolean(s.useEbill));
    if (s.kwhMonthly)            setKwhMonthly(String(s.kwhMonthly));
    if (s.nightPct)              setNightPct(String(s.nightPct));
    if (s.kwhHistory)            setKwhHistory(s.kwhHistory as string[]);
    if (s.contractStart)         setContractStart(String(s.contractStart));
    if (s.contractMonths)        setContractMonths(String(s.contractMonths));
    if (s.manualMonthly)         setManualMonthly(String(s.manualMonthly));
  }, [s]);

  useEffect(() => {
    if (!propertyId) return;
    (async () => {
      try {
        const { data } = await supabase.from('bills_settings').select('data').eq('property_id', propertyId).eq('section', 'insurance').maybeSingle();
        if (data?.data) { const d = data.data as Record<string, unknown>; setInsData({ eq: !!d.insCustomEarthquake, fl: !!d.insCustomFlood }); }
      } catch (_) {}
    })();
  }, [propertyId]);

  // Οι δικές του κιλοβατώρες, από τους δικούς του λογαριασμούς ρεύματος.
  useEffect(() => {
    if (!propertyId) return;
    (async () => {
      try {
        const { data } = await supabase.from('bills')
          .select('kwh,created_at').eq('property_id', propertyId).eq('category', 'electricity')
          .not('kwh', 'is', null).order('created_at', { ascending: false }).limit(12);
        setBillsKwh((data ?? []).map(b => Number((b as { kwh?: number }).kwh)).filter(n => Number.isFinite(n) && n > 0));
      } catch (_) {}
    })();
  }, [propertyId]);

  const save = (patch: Record<string, unknown>) => su({ elecProvider: provider, elecTariff: tariffId, useEbill, kwhMonthly, nightPct, kwhHistory, contractStart, contractMonths, manualMonthly, ...patch });

  const providerObj   = PROVIDERS.find(p => p.value === provider) || PROVIDERS[0];
  const tariff        = providerObj.tariffs.find(t => t.id === tariffId) || providerObj.tariffs[0];
  const tariffBc      = bc();

  // ── ΜΙΑ ΚΑΤΑΝΑΛΩΣΗ, ΤΟΥ ΧΡΗΣΤΗ ──────────────────────────────────────────
  // Σειρά: το δωδεκάμηνο που συμπλήρωσε, μετά οι κιλοβατώρες των λογαριασμών
  // του, μετά ό,τι έγραψε στο πεδίο. Αν δεν υπάρχει τίποτα, το λέμε και δεν
  // συγκρίνουμε: σύγκριση πάνω σε μαντεψιά οδηγεί σε αλλαγή παρόχου με λάθος
  // κριτήριο, που είναι χειρότερο από καμία σύγκριση.
  const usageEst = useMemo(
    () => estimateUsage(kwhHistory, billsKwh, parseFloat(kwhMonthly)),
    [kwhHistory, billsKwh, kwhMonthly],
  );
  const kwh = usageEst.kwhMonthly;
  const nightP = parseFloat(nightPct) || 30;
  const manualNum = parseFloat(manualMonthly) || 0;
  // Απλό αντικείμενο, χωρίς useMemo: ο υπολογισμός είναι μια πρόσθεση και ένας
  // πολλαπλασιασμός. Το να τον «βελτιστοποιήσουμε» θα έκρυβε τη μία αλήθεια
  // πίσω από εξαρτήσεις που πρέπει να μένουν συγχρονισμένες με το χέρι.
  const usage: Usage = { kwhMonthly: kwh, nightPct: nightP, ebill: useEbill, manualMonthly: manualNum };

  // ΕΝΑΣ ΤΥΠΟΣ. Πριν υπήρχαν δύο, ένας για «το τιμολόγιό σου» και ένας για τη
  // σύγκριση, και διέφεραν σε τρία σημεία. Ο υπολογισμός ζει πλέον στο
  // lib/energy/tariff.ts με 53 ελέγχους από πάνω του.
  const currentCost = monthlyCost(tariff as Tariff, usage);
  const calcMonthly = currentCost.total;

  const contractExpiry = useMemo(() => {
    if (!contractStart || !contractMonths) return null;
    const start = new Date(contractStart);
    const months = parseInt(contractMonths) || 0;
    if (!months) return null;
    const expiry = new Date(start);
    expiry.setMonth(expiry.getMonth() + months);
    const daysLeft = Math.ceil((expiry.getTime() - new Date().getTime()) / 86400000);
    return { date: expiry.toLocaleDateString('el-GR', { day: 'numeric', month: 'long', year: 'numeric' }), daysLeft };
  }, [contractStart, contractMonths]);

  // Σύγκριση με ΤΟΝ ΙΔΙΟ τύπο που υπολόγισε το τρέχον τιμολόγιο.
  // Χωρίς useMemo: εκατό τιμολόγια επί μερικές πράξεις το καθένα κοστίζουν
  // μικροδευτερόλεπτα, ενώ ένας πίνακας εξαρτήσεων που ξεχνιέται κοστίζει λάθος
  // τιμή στην οθόνη. Η ταχύτητα εδώ δεν ήταν ποτέ το πρόβλημα.
  const allTariffs = compareTariffs(
    COMPARABLE_TARIFFS(),
    usage, tariffId, calcMonthly,
  )
    // Το κουμπί Οικιακό/Επιχειρηματικό υπήρχε και δεν φιλτράριζε τίποτα.
    .filter(r => r.tariff.segment === segmentFilter)
    .map(r => ({ ...r.tariff, monthly: r.cost.total, isCurrent: r.isCurrent, diff: r.diff }));

  const bestMonthly  = allTariffs[0]?.monthly || 0;
  const savings      = calcMonthly - bestMonthly;

  // ── Η ΠΥΛΗ ΦΡΕΣΚΑΔΑΣ ΙΣΧΥΕ ΜΟΝΟ ΣΤΗΝ ΑΥΤΟΚΛΗΤΗ ΕΙΔΟΠΟΙΗΣΗ ────────────────
  // Δηλαδή η εφαρμογή σιωπούσε σωστά όταν δεν ρωτούσε κανείς, και ανακήρυσσε
  // νικητή με βεβαιότητα μόλις ο χρήστης άνοιγε την οθόνη: «★ ΚΑΛΥΤΕΡΟ»,
  // «Μπορείς να εξοικονομήσεις», και πλακίδιο «Εξοικονόμηση vs καλύτερο» — όλα
  // πάνω σε τιμές που μπορεί να είναι περασμένου μήνα. Η πιο ήσυχη διαδρομή
  // ήταν αυστηρότερη από την πιο ορατή.
  const fresh = freshness(TARIFFS_VERIFIED, new Date(), TARIFFS_MAX_AGE_DAYS);
  const canRank = canRecommend(fresh, usageEst.reliable);

  const secHdr = (label: string, sub?: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: 'var(--text-secondary)', fontFamily: T.font.sans }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1, fontFamily: T.font.sans }}>{sub}</div>}
      </div>
    </div>
  );

  // Ο σκελετός μπαίνει ΜΕΤΑ από όλα τα hooks (κανόνας των hooks) και αντιγράφει το
  // πραγματικό σχήμα της καρτέλας: κεφαλίδα + τρεις στοιβαγμένες κάρτες. Σκελετός
  // KPIs θα υποσχόταν σειρά μετρικών που αυτή η καρτέλα δεν έχει καθόλου.
  if (loading) return (
    <div style={{ fontFamily: T.font.sans }}>
      <div style={{ marginBottom: 16 }}>
        <Skeleton w={110} h={20} r={6} />
        <Skeleton w={320} h={12} r={6} style={{ marginTop: 8 }} />
      </div>
      {[220, 180, 140].map((h, i) => <Skeleton key={i} h={h} r={T.radius.card} style={{ marginBottom: 16 }} />)}
    </div>
  );

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>Ρεύμα</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Τιμολόγια {LAST_UPDATED}, Πηγή: bestenergydeals.gr / ΡΑΑΕΥ</div>
        </div>
        <a href={RAAEY_COMPARE} target="_blank" rel="noopener noreferrer" title="Ρυθμιστική Αρχή Αποβλήτων, Ενέργειας και Υδάτων"
          style={{ fontSize: 11, color: 'var(--accent)', background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: T.radius.pill, padding: '6px 16px', cursor: 'pointer', textDecoration: 'none', fontFamily: T.font.sans, fontWeight: 600 }}>
          Σύγκριση ΡΑΑΕΥ →
        </a>
      </div>

      {/* ── Contract expiry alert ── */}
      {contractExpiry && contractExpiry.daysLeft <= 60 && (
        <div style={{ marginBottom: 14, background: contractExpiry.daysLeft <= 14 ? 'rgba(197,34,31,0.06)' : 'rgba(242,153,0,0.05)', border: `1px solid ${contractExpiry.daysLeft <= 14 ? 'rgba(197,34,31,0.2)' : 'rgba(242,153,0,0.2)'}`, borderRadius: T.radius.inner, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: contractExpiry.daysLeft <= 14 ? 'var(--negative)' : 'var(--warning)' }}/>
          <span style={{ fontSize: 12, fontFamily: T.font.sans, color: 'var(--text-primary)', fontWeight: 600 }}>
            Σύμβαση ρεύματος λήγει σε {contractExpiry.daysLeft} ημέρες, {contractExpiry.date}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>
            Καλό να συγκρίνεις τιμές πριν ανανεώσεις
          </span>
        </div>
      )}

      {/* ── Provider + Tariff + Contract ── */}
      <div style={card}>
        {secHdr('Πάροχος και τιμολόγιο')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14, marginBottom: 14 }}>
          <CustomSelect label="Πάροχος" value={provider} onChange={p => {
            setProvider(p);
            const prov = PROVIDERS.find(x => x.value === p);
            const firstId = prov?.tariffs[0]?.id || '';
            setTariffId(firstId);
            save({ elecProvider: p, elecTariff: firstId });
          }} options={PROVIDERS.map(p => ({ value: p.value, label: p.label }))} />
          <CustomSelect label="Τιμολόγιο" value={tariffId} onChange={v => { setTariffId(v); save({ elecTariff: v }); }}
            options={providerObj.tariffs.map(t => ({ value: t.id, label: t.name }))} />
        </div>

        <div style={{ background: tariffBc.bg, border: `1px solid ${tariffBc.border}`, borderRadius: T.radius.inner, padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' as const }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.sans }}>{tariff.name}</span>
              <span style={{ fontSize: 9, fontWeight: 800, color: tariffBc.color, background: tariffBc.border, padding: '2px 10px', borderRadius: T.radius.pill, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{tariff.badge}</span>
              {tariff.contract_months ? (
                <span style={{ fontSize: 9, color: 'var(--text-tertiary)', background: 'var(--bg-elevated)', padding: '2px 10px', borderRadius: T.radius.pill, border: '1px solid var(--border-subtle)', fontFamily: T.font.sans }}>
                  {tariff.contract_months} μήνες
                </span>
              ) : (
                <span style={{ fontSize: 9, color: 'var(--text-tertiary)', background: 'var(--bg-elevated)', padding: '2px 10px', borderRadius: T.radius.pill, border: '1px solid var(--border-subtle)', fontFamily: T.font.sans }}>
                  Χωρίς δέσμευση
                </span>
              )}
              {tariff.no_fixed && <span style={{ fontSize: 9, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', padding: '2px 10px', borderRadius: T.radius.pill, fontFamily: T.font.sans }}>Χωρίς πάγιο</span>}
              {tariff.smart_meter && <span style={{ fontSize: 9, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', padding: '2px 10px', borderRadius: T.radius.pill, fontFamily: T.font.sans }}>Έξυπνος Μετρητής</span>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, fontFamily: T.font.sans }}>{tariff.desc}</div>
            {tariff.desc.includes('ΜΔΚΑ') && (
              <div style={{ marginTop: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.badge, padding: '6px 12px', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.5 }}>
                  <strong>ΜΔΚΑ</strong> = Μέσο Μηνιαίο Κόστος Κύκλου Αγοράς. Πρόσθετη χρέωση σε κυμαινόμενα τιμολόγια («κίτρινα») που αντανακλά τη διακύμανση της τιμής χονδρικής ηλεκτρισμού στην αγορά ενέργειας, αντικαθιστά παλαιότερες ρήτρες αναπροσαρμογής. Ανακοινώνεται κάθε 1η του μήνα από τον πάροχο. <a href="https://www.raaey.gr" target="_blank" title="Ρυθμιστική Αρχή Αποβλήτων, Ενέργειας και Υδάτων" style={{ color: "var(--accent)", fontWeight: 600 }}>ΡΑΑΕΥ →</a>
                </span>
              </div>
            )}
            {/* FIX: new, Picasso-family flat packages had no explanation of the tolerance/overage/settlement mechanic anywhere in the UI */}
            {tariff.type === 'fixed_monthly' && tariff.flat_annual_kwh != null && tariff.flat_overage_rate != null && (
              <div style={{ marginTop: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.badge, padding: '6px 12px', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.5 }}>
                  Σταθερό μηνιαίο ποσό για {tariff.contract_months || 12} μήνες (προμήθεια + ρυθμιζόμενες χρεώσεις, όχι υπέρ τρίτων). Ανοχή υπέρβασης 5% χωρίς χρέωση· πάνω από αυτό, {fk(tariff.flat_overage_rate)}/kWh. Ετήσια εκκαθάριση.
                </span>
              </div>
            )}
            {tariff.type !== 'dynamic' && tariff.type !== 'fixed_monthly' && (
              <div style={{ display: 'flex', gap: 20, marginTop: 10, flexWrap: 'wrap' as const, alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                  Χρέωση ημέρας:{'  '}<strong style={{ color: tariffBc.color }}>{fk(tariff.kwh_day)} / kWh</strong>
                </span>
                {tariff.kwh_night != null && (
                  <span style={{ fontSize: 11, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                    Χρέωση νύχτας:{'  '}<strong style={{ color: tariffBc.color }}>{fk(tariff.kwh_night)} / kWh</strong>
                  </span>
                )}
                {tariff.kwh_tier2 != null && (
                  <span style={{ fontSize: 11, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                    Άνω των {tariff.tier2_threshold} kWh:{'  '}<strong style={{ color: tariffBc.color }}>{fk(tariff.kwh_tier2)} / kWh</strong>
                  </span>
                )}
                <span style={{ fontSize: 11, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                  Μηνιαίο πάγιο:{'  '}<strong>{tariff.no_fixed ? '0,00 €' : `${fe(((useEbill && tariff.fixed_ebill != null) ? tariff.fixed_ebill : tariff.fixed), 2)} / μήνα`}</strong>
                </span>
              </div>
            )}
            {/* FIX: new, fixed_monthly tariffs previously showed nothing here at all (the block above explicitly excludes them) */}
            {tariff.type === 'fixed_monthly' && (
              <div style={{ display: 'flex', gap: 20, marginTop: 10, flexWrap: 'wrap' as const, alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                  Σταθερό μηνιαίο κόστος:{'  '}<strong style={{ color: tariffBc.color }}>{fe(tariff.flat_monthly || 0)} / μήνα</strong>
                </span>
                {tariff.flat_annual_kwh != null && (
                  <span style={{ fontSize: 11, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                    Όριο κατανάλωσης:{'  '}<strong>{tariff.flat_annual_kwh.toLocaleString('el-GR')} kWh / έτος</strong>
                  </span>
                )}
              </div>
            )}
          </div>
          <a href={providerObj.url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 10, color: 'var(--accent)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.pill, padding: '4px 12px', textDecoration: 'none', whiteSpace: 'nowrap' as const, fontFamily: T.font.sans, fontWeight: 600 }}>
            Επίσκεψη →
          </a>
        </div>

        {/* Ημερομηνίες συμβολαίου και διακόπτης ηλεκτρονικού λογαριασμού */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 14, alignItems: 'center' }}>
          <DatePicker
            label="Έναρξη σύμβασης"
            value={contractStart}
            onChange={v => { setContractStart(v); save({ contractStart: v }); }}
          />
          <CustomSelect label="Διάρκεια σύμβασης" value={contractMonths}
            onChange={v => { setContractMonths(v); save({ contractMonths: v }); }}
            options={DURATION_OPTIONS}/>
          {contractExpiry && (
            <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '9px 12px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 3, fontFamily: T.font.sans }}>Λήξη Σύμβασης</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: contractExpiry.daysLeft <= 60 ? 'var(--warning)' : 'var(--text-primary)', fontFamily: T.font.sans }}>{contractExpiry.date}</div>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>{contractExpiry.daysLeft} ημέρες</div>
            </div>
          )}
          {tariff.fixed_ebill != null && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 6, fontFamily: T.font.sans }}>Ηλεκτρονικός Λογαριασμός</div>
              {/* ΤΡΙΤΗ ΓΕΩΜΕΤΡΙΑ ΓΙΑ ΤΟ ΙΔΙΟ ΠΡΑΓΜΑ. Εδώ ζούσε χειρόγραφος
                  διακόπτης 40×26 με δείκτη 20, ενώ το κοινό `Toggle` υπήρχε ήδη
                  — και ήταν ΗΔΗ εισαγμένο σε αυτό το αρχείο (γραμμή 5) χωρίς να
                  χρησιμοποιείται πουθενά. Δηλαδή τρίτο μέγεθος διακόπτη στην
                  εφαρμογή (36×20, 52×32, 40×26), ωμό #fff στον δείκτη, ωμό rgba
                  στη σκιά και το ίδιο κείμενο κατάστασης στα 12 αντί για 14. Το
                  κοινό component κρατά aria-checked και δίνει ρητή ελληνική
                  aria-label, που πριν έλειπε τελείως. */}
              {/* Το nowrap έμενε πίσω στη μεταφορά. Ο παλιός χειρόγραφος είχε
                  whiteSpace: 'nowrap' στο κείμενο κατάστασης· το κοινό `Toggle`
                  δεν το έχει, και το κείμενο μεγάλωσε από 12 σε 14 (η ετικέτα
                  «Ενεργό, μειωμένο πάγιο» πάει από ~133px σε ~155px) μέσα σε
                  στήλη `auto` ενός grid `1fr 1fr 1fr auto`. Σε στενό πλάτος θα
                  έσπαγε σε δύο γραμμές μέσα σε κουτί σταθερού ύψους T.h.lg (40px)
                  και θα ξεχείλιζε πάνω στη γραμμή. Το white-space κληρονομείται,
                  οπότε μπαίνει εδώ αντί να αλλάξει το κοινό component. */}
              <div style={{ display: 'flex', alignItems: 'center', height: T.h.lg, whiteSpace: 'nowrap' }}>
                <Toggle
                  on={useEbill}
                  onChange={v => { setUseEbill(v); save({ useEbill: v }); }}
                  label="Ενεργό, μειωμένο πάγιο"
                  labelOff="Ανενεργό"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Κατανάλωση + υπολογισμός ── */}
      <div style={card}>
        {secHdr('Κατανάλωση και εκτιμώμενο κόστος')}
        <div style={{ display: 'grid', gridTemplateColumns: tariff.kwh_night ? '1fr 1fr 1fr' : '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <NumberInput label="Μέση μηνιαία κατανάλωση" value={kwhMonthly} onChange={v => { setKwhMonthly(v); save({ kwhMonthly: v }); }} suffix="kWh" step={10}/>
          {tariff.kwh_night != null && <NumberInput label="Νυχτερινή κατανάλωση" value={nightPct} onChange={v => { setNightPct(v); save({ nightPct: v }); }} suffix="%" step={5}/>}
          {tariff.type === 'dynamic' && <NumberInput label="Μηνιαίο Κόστος (€), Από Λογαριασμό" value={manualMonthly} onChange={v => { setManualMonthly(v); save({ manualMonthly: v }); }} suffix="€" step={1}/>}
        </div>

        {/* ΑΠΟ ΠΟΥ ΒΓΗΚΕ Ο ΑΡΙΘΜΟΣ. Χωρίς αυτό, ο χρήστης δεν έχει τρόπο να
            ξέρει αν η σύγκριση τρέχει πάνω στη ΔΙΚΗ ΤΟΥ κατανάλωση ή σε μια
            προεπιλογή. Πριν ήταν πάντα προεπιλογή, και δεν φαινόταν πουθενά. */}
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.55, marginBottom: 14 }}>
          {usageEst.source === 'history'
            ? `Υπολογισμός με ${usageEst.kwhMonthly} kWh τον μήνα, μέσος όρος από ${usageEst.months} ${usageEst.months === 1 ? 'μήνα' : 'μήνες'} του ιστορικού σου.`
            : usageEst.source === 'bills'
              ? `Υπολογισμός με ${usageEst.kwhMonthly} kWh τον μήνα, μέσος όρος από ${usageEst.months} ${usageEst.months === 1 ? 'λογαριασμό' : 'λογαριασμούς'} που έχεις καταχωρήσει.`
              : usageEst.source === 'manual'
                ? (kwhMonthly === ELEC_DEFAULTS.kwhMonthly
                    // ΤΟ «ΟΠΩΣ ΤΑ ΔΗΛΩΣΕΣ» ΕΛΕΓΕ ΨΕΜΑΤΑ ΣΤΗΝ ΠΡΟΕΠΙΛΟΓΗ. Το πεδίο
                    // ξεκινά στα 250 kWh· ένας χρήστης που δεν το άγγιξε ποτέ
                    // διάβαζε ότι δήλωσε νούμερο που δεν έγραψε, και πάνω του
                    // στηνόταν ολόκληρη η σύγκριση τιμολογίων.
                    ? `Υπολογισμός με ${fn(usageEst.kwhMonthly)} kWh τον μήνα, ενδεικτική τιμή εκκίνησης. Ανέβασε έναν λογαριασμό ή συμπλήρωσε το ιστορικό για δικό σου νούμερο.`
                    : `Υπολογισμός με ${fn(usageEst.kwhMonthly)} kWh τον μήνα, όπως το έγραψες.`)
                : 'Δεν ξέρουμε ακόμη πόσο ρεύμα καίει το ακίνητο. Γράψε τη μέση μηνιαία κατανάλωση ή συμπλήρωσε το ιστορικό πιο κάτω, και η σύγκριση θα τρέξει στα δικά σου νούμερα.'}
          {usageEst.source !== 'unknown' && !usageEst.reliable && (
            <> Με {usageEst.months} {usageEst.months === 1 ? 'μήνα' : 'μήνες'} δεδομένων η εικόνα είναι πρόχειρη: ο Ιούλιος με κλιματιστικό και ο Απρίλιος δεν μοιάζουν.</>
          )}
        </div>

        {tariff.type !== 'dynamic' && kwh > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: 10, marginBottom: 14 }}>
            {[
              { label: 'Εκτιμώμενο / μήνα', value: fe(calcMonthly),       color: 'var(--accent)' },
              { label: 'Ετήσιο Κόστος',      value: fe(calcMonthly * 12), color: 'var(--text-primary)' },
              { label: 'Κόστος / kWh net',   value: kwh > 0 ? fk(calcMonthly / kwh) : '—', color: 'var(--text-secondary)' },
              // ΧΩΡΙΣ ΣΗΜΑΣΙΟΛΟΓΙΚΟ ΠΡΑΣΙΝΟ. Η εξοικονόμηση δεν είναι «καλή» ή
              // «κακή»· είναι μέτρηση. Η έμφαση βγαίνει από βάρος και θέση.
              { label: 'Εξοικονόμηση vs καλύτερο', value: canRank ? (savings > 0.5 ? `+${fe(savings)}` : fn(0)) : ABSENT_SHORT, color: 'var(--text-primary)' },
            ].map((k, i) => (
              <div key={i} style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '12px 14px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 8, fontFamily: T.font.sans }}>{k.label}</div>
                <div style={{ fontSize: i === 0 ? 20 : 14, fontWeight: 700, color: k.color, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{k.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* kWh history */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 8, fontFamily: T.font.sans }}>Ιστορικό Κατανάλωσης, <span title="κιλοβατώρα, μονάδα μέτρησης κατανάλωσης ηλεκτρικής ενέργειας">kWh</span> ανά μήνα</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 4 }}>
            {MONTHS_SHORT.map((m, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: i === currentMonth ? 'var(--accent)' : 'var(--text-tertiary)', marginBottom: 4, fontWeight: i === currentMonth ? 700 : 400, fontFamily: T.font.sans }}>{m}</div>
                {/* ΤΟ placeholder ΗΤΑΝ «0» ΚΑΙ ΤΑ ΔΩΔΕΚΑ ΚΟΥΤΙΑ ΔΙΑΒΑΖΟΝΤΑΝ ΩΣ
                    ΜΗΔΕΝΙΚΑ. Ένα άδειο ιστορικό έδειχνε «μηδέν κιλοβατώρες κάθε
                    μήνα», δηλαδή ακίνητο που δεν καίει ρεύμα — αντί για «δεν
                    έχει συμπληρωθεί». Η ίδια αρχή με τα ποσά: το άγνωστο δεν
                    γράφεται μηδέν. */}
                <input type="number" value={kwhHistory[i] || ''} placeholder=""
                  style={histInputStyle(i === currentMonth, hoveredMonth === i)}
                  onMouseEnter={() => setHoveredMonth(i)} onMouseLeave={() => setHoveredMonth(null)}
                  onChange={e => {
                    const h = [...kwhHistory]; h[i] = e.target.value;
                    setKwhHistory(h); save({ kwhHistory: h });
                  }}/>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Σύγκριση παρόχων ── */}
      {kwh > 0 && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4, flexWrap: 'wrap' as const, gap: 10 }}>
            {secHdr('Σύγκριση Όλων των Παρόχων', `Βάσει ${kwh} kWh/μήνα, ${LAST_UPDATED}`)}
            <div style={{ display: 'flex', background: 'var(--bg-base)', borderRadius: T.radius.pill, padding: 3, border: '1px solid var(--border-default)' }}>
              {(['residential', 'business'] as const).map(seg => (
                <button key={seg} onClick={() => setSegmentFilter(seg)}
                  style={{
                    padding: '6px 16px', borderRadius: T.radius.pill, border: 'none', cursor: 'pointer',
                    fontSize: 11, fontWeight: 700, fontFamily: T.font.sans,
                    background: segmentFilter === seg ? 'var(--accent)' : 'transparent',
                    color: segmentFilter === seg ? 'var(--accent-text)' : 'var(--text-secondary)',
                    transition: 'all 0.15s',
                  }}>
                  {seg === 'residential' ? 'Οικιακό' : 'Επιχειρηματικό'}
                </button>
              ))}
            </div>
          </div>
          {canRank && savings > 1 && (
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '10px 16px', marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-tertiary)' }}/>
              <span style={{ fontSize: 12, fontFamily: T.font.sans, color: 'var(--text-primary)' }}>
                Μπορείς να εξοικονομήσεις <strong style={{ fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{fe(savings)} / μήνα</strong> ({fe(savings * 12)} / έτος) με το καλύτερο τιμολόγιο
              </span>
            </div>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>{['Πάροχος','Πρόγραμμα','Τύπος','kWh','Πάγιο','Διάρκεια','Μήνας','Έτος','Διαφορά'].map((h,i) => (
                  <th key={i} style={{ fontSize: 9, color: 'var(--text-secondary)', padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em', fontFamily: T.font.sans, whiteSpace: 'nowrap' as const, background: 'var(--bg-elevated)' }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {allTariffs.slice(0, 20).map((t, i) => {
                  const rowBc   = bc();
                  const isBest  = i === 0;
                  const isCur   = t.isCurrent;
                  return (
                    <tr key={t.id} style={{ background: isCur ? 'var(--accent-soft)' : isBest ? 'var(--bg-elevated)' : 'transparent' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans, whiteSpace: 'nowrap' as const }}>
                        {isCur && <span style={{ fontSize: 9, color: 'var(--accent)', marginRight: 6, fontWeight: 800, textTransform: 'uppercase' as const }}>▶ ΤΡΕΧΟΝ</span>}
                        {canRank && !isCur && isBest && <span style={{ fontSize: 10, color: 'var(--text-primary)', marginRight: 6, fontWeight: 800 }}>ΚΑΛΥΤΕΡΟ</span>}
                        {t.providerLabel}
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-primary)', fontFamily: T.font.sans }}>{t.name}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: rowBc.color, background: rowBc.border, padding: '2px 8px', borderRadius: T.radius.pill, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{t.badge}</span>
                      </td>
                      <td style={{ padding: '8px 10px', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)', whiteSpace: 'nowrap' as const }}>
                        {t.type === 'fixed_monthly' ? 'all-in' : t.type === 'vnm' ? <span title="Εικονική Καθαρή Μέτρηση (Virtual Net Metering)">VNM</span> : `${fk(t.kwh_day)}`}
                      </td>
                      <td style={{ padding: '8px 10px', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)', whiteSpace: 'nowrap' as const }}>
                        {/* ΔΥΟ ΣΤΗΛΕΣ ΤΗΣ ΙΔΙΑΣ ΓΡΑΜΜΗΣ ΥΠΑΚΟΥΑΝ ΣΕ ΔΙΑΦΟΡΕΤΙΚΟ ΚΑΝΟΝΑ.
                            Εδώ γραφόταν πάντα η τιμή με e-bill (`fixed_ebill ?? fixed`),
                            ΑΓΝΟΩΝΤΑΣ τον διακόπτη του χρήστη — ενώ η στήλη «Μήνας», δύο
                            κελιά δεξιά, τον τηρούσε μέσω του `monthlyCost`. Όποιος είχε
                            κλειστό το e-bill έβλεπε χαμηλότερο πάγιο και υψηλότερο μήνα,
                            χωρίς τρόπο να καταλάβει γιατί δεν βγαίνουν. Ο κανόνας ζει στο
                            `lib/energy/tariff.ts`· εδώ απλώς τηρείται.
                            Το «—» των πακέτων flat έμεινε: εκεί ΔΕΝ υπάρχει πάγιο, και το
                            «0 €» θα διαβαζόταν ως «δωρεάν πάγιο», που είναι άλλο πράγμα. */}
                        {t.type === 'fixed_monthly' ? ABSENT_SHORT : t.no_fixed ? fe(0) : fe(useEbill && t.fixed_ebill != null ? t.fixed_ebill : t.fixed)}
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', fontFamily: T.font.sans, whiteSpace: 'nowrap' as const }}>
                        {t.contract_months ? `${t.contract_months} μήνες` : 'Χωρίς δέσμευση'}
                      </td>
                      <td style={{ padding: '8px 10px', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: isCur ? 'var(--accent)' : 'var(--text-primary)', fontWeight: canRank && isBest ? 800 : 700, whiteSpace: 'nowrap' as const }}>
                        {t.type === 'dynamic' ? 'Ωριαίο' : fe(t.monthly)}
                      </td>
                      <td style={{ padding: '8px 10px', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' as const }}>
                        {t.type === 'dynamic' ? '—' : fe(t.monthly * 12)}
                      </td>
                      <td style={{ padding: '8px 10px', fontWeight: 700, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' as const,
                        color: isCur ? 'var(--text-tertiary)' : 'var(--text-secondary)' }}>
                        {isCur ? '—' : t.diff === 0 ? '—' : `${t.diff < 0 ? '' : '+'}${fe(t.diff)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ΤΙ ΑΚΡΙΒΩΣ ΣΥΓΚΡΙΝΕΤΑΙ ΚΑΙ ΑΠΟ ΠΟΥ. Χωρίς αυτή τη γραμμή, ο χρήστης
              βλέπει ένα ποσό και δεν ξέρει ούτε πότε ισχύει ούτε τι δεν
              περιλαμβάνει. Οι τιμές λιανικής ρεύματος ΔΕΝ αλλάζουν σε πραγματικό
              χρόνο: το κυμαινόμενο ανακοινώνεται μηνιαία. Το «ζωντανή τιμή» θα
              ήταν διαφήμιση, όχι ακρίβεια. */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-subtle)', fontSize: 11, lineHeight: 1.6, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
            Συγκρίνεται η <strong style={{ color: 'var(--text-secondary)' }}>χρέωση προμήθειας</strong>, δηλαδή πάγιο και ενέργεια, μαζί με τα ρυθμιζόμενα τέλη και τον ΦΠΑ.
            Δεν περιλαμβάνονται χρεώσεις δικτύου ΔΕΔΔΗΕ, δημοτικά τέλη και τέλος ΕΡΤ, επειδή είναι ίδια όποιον πάροχο κι αν διαλέξεις και δεν αλλάζουν τη σειρά.
            <br />
            Τιμές όπως δημοσιεύονται από τους παρόχους. Τελευταίος έλεγχος: {LAST_UPDATED}.
            {' '}<a href={RAAEY_COMPARE} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Διασταύρωσε στη ΡΑΑΕΥ</a>.
            Πριν υπογράψεις, επιβεβαίωσε την τιμή στη σελίδα του παρόχου: το κυμαινόμενο ανακοινώνεται κάθε μήνα.
          </div>
        </div>
      )}

      {/* Ζωντανές υποδείξεις από τα πραγματικά δεδομένα του χρήστη */}
      {(() => {
        // Οι υποδείξεις χτίζονται από ό,τι έχει ήδη καταχωρήσει ο χρήστης
        const hints: { text: string; severity: 'info' | 'warning' | 'tip'; action?: string; tab?: string }[] = [];
        // Η ΥΠΟΔΕΙΞΗ ΜΕΤΡΟΥΣΕ ΑΛΛΗ ΚΑΤΑΝΑΛΩΣΗ ΑΠΟ ΤΟ ΚΟΣΤΟΣ ΑΠΟ ΠΑΝΩ.
        // Εδώ διαβαζόταν το ωμό πεδίο `kwhMonthly` (η χειροκίνητη εκτίμηση),
        // ενώ κάθε ευρώ της οθόνης υπολογίζεται από το `usageEst.kwhMonthly`,
        // που προτιμά το ιστορικό και τους πραγματικούς λογαριασμούς. Έτσι η
        // προειδοποίηση υπέρβασης έλεγε «με 250 kWh τον μήνα» ενώ το κόστος από
        // πάνω ήταν υπολογισμένο σε 410. Μία κατανάλωση ανά οθόνη.
        const kwhNum   = usageEst.kwhMonthly || 0;
        const costNum  = calcMonthly;

        // FIX: new, warn if the SELECTED flat-tier package's kWh limit is smaller than
        // the user's actual projected usage. Without this, someone could pick "Picasso
        // μικρό πακέτο ενώ καταναλώνουν πολύ περισσότερο, χωρίς καμία ένδειξη ότι θα χρεωθούν υπέρβαση.
        // ΔΥΟ ΣΦΑΛΜΑΤΑ ΠΟΥ ΑΠΟΚΑΛΥΨΕ Ο ΦΡΟΥΡΟΣ ΤΟΥ ΚΑΤΑΛΟΓΟΥ:
        //
        //  1. Η ΣΥΝΘΗΚΗ ΑΠΑΙΤΟΥΣΕ ΚΑΙ ΤΑ ΔΥΟ. Τρία πακέτα ZeΝergy δηλώνουν όριο
        //     κιλοβατωρών ΑΛΛΑ όχι τιμή υπέρβασης· η προειδοποίηση σιωπούσε
        //     τελείως, ενώ ξέραμε ότι το όριο ξεπερνιέται. Το ποσό της χρέωσης
        //     είναι άγνωστο· το ΓΕΓΟΝΟΣ της υπέρβασης όχι.
        //  2. ΤΑ ΠΑΚΕΤΑ ΧΩΡΙΣ ΟΡΙΟ ΦΑΙΝΟΝΤΑΝ ΑΠΕΡΙΟΡΙΣΤΑ. Ένα «60 € τον μήνα
        //     all-in» χωρίς καμία επιφύλαξη διαβάζεται ως «όσο θέλω».
        if (tariff.type === 'fixed_monthly') {
          const projectedAnnual = kwhNum * 12;
          if (tariff.flat_annual_kwh) {
            const allowance = tariff.flat_annual_kwh * 1.05;
            if (projectedAnnual > allowance) {
              const overageKwh = Math.round(projectedAnnual - tariff.flat_annual_kwh);
              const cost = tariff.flat_overage_rate
                ? ` Με ${fk(tariff.flat_overage_rate)} ανά κιλοβατώρα, περίπου ${fe(overageKwh * tariff.flat_overage_rate)} τον χρόνο.`
                : ' Η τιμή της υπέρβασης δεν έχει καταχωρηθεί, επιβεβαίωσέ την στον πάροχο.';
              hints.push({
                text: `Με ${fn(kwhNum)} κιλοβατώρες τον μήνα ξεπερνάς το όριο του «${tariff.name}» κατά ${fn(overageKwh)} τον χρόνο.${cost}`,
                severity: 'warning',
              });
            }
          } else if (FLAT_WITHOUT_ALLOWANCE.has(tariff.id)) {
            hints.push({
              text: `Το «${tariff.name}» είναι σταθερό μηνιαίο, αλλά το όριο κατανάλωσης δεν δημοσιεύεται σε αριθμό. Επιβεβαίωσέ το στον πάροχο πριν δεσμευτείς, γιατί πάνω από το όριο υπάρχει χρέωση.`,
              severity: 'warning',
            });
          }
        }

        // ── Insurance gap, only if VNM/solar is relevant (cross-tab context) ──
        if (insData && kwhNum > 200) {
          if (!insData.eq) {
            hints.push({ text: 'Η ασφάλειά σου δεν καλύπτει σεισμό. Δες τις καλύψεις σου.', severity: 'warning', action: 'Ασφάλεια & συνδρομές', tab: 'insurance' });
          }
        }

        // ── Κατανάλωση insights ─────────────────────────────────────────────────
        if (kwhNum > 400) {
          const vnmTariff = allTariffs.find(t => t.id === 'heron_ena');
          if (vnmTariff && vnmTariff.monthly < costNum - 5) {
            // Το κουμπί «Πάρε Προσφορά» έστελνε στην καρτέλα «Ρεύμα» — δηλαδή σε
            // αυτήν ΠΟΥ ΗΔΗ ΒΛΕΠΕΙ ο χρήστης. Η υπόδειξη μένει, το κουμπί φεύγει.
            hints.push({ text: `Με ${kwhNum} kWh/μήνα το VNM (Εικονική Καθαρή Μέτρηση) μπορεί να σου εξοικονομήσει ${fe(costNum - vnmTariff.monthly)} τον μήνα.`, severity: 'tip' });
          } else {
            hints.push({ text: `Κατανάλωση ${kwhNum} kWh/μήνα, αξίζει σύγκριση με φωτοβολταϊκό ή κοινοτικό VNM.`, severity: 'tip' });
          }
        } else if (kwhNum > 0 && kwhNum < 100) {
          const noFixed = allTariffs.find(t => t.no_fixed && t.type !== 'dynamic');
          if (noFixed && noFixed.monthly < costNum) {
            hints.push({ text: `Χαμηλή κατανάλωση (${kwhNum} kWh). Τιμολόγιο χωρίς πάγιο (${noFixed.providerLabel} ${noFixed.name}) εξοικονομεί ${fe((costNum - noFixed.monthly), 0)}/μήνα.`, severity: 'tip' });
          }
        }

        // ── Contract expiry ─────────────────────────────────────────────────────
        if (contractExpiry && contractExpiry.daysLeft <= 30 && contractExpiry.daysLeft > 0) {
          hints.push({ text: `Η σύμβασή σου λήγει σε ${contractExpiry.daysLeft} ημέρες (${contractExpiry.date}). Σύγκρινε πριν ανανεώσεις.`, severity: 'warning' });
        }

        // ── Dynamic tariff suggestion ───────────────────────────────────────────
        if (tariff.type !== 'dynamic' && kwhNum > 300) {
          hints.push({ text: 'Με έξυπνο μετρητή ΔΕΔΔΗΕ, το δυναμικό (ωριαίο) τιμολόγιο μπορεί να μειώσει το κόστος έως 20% μεταφέροντας χρήση σε ώρες χαμηλής ζήτησης.', severity: 'info' });
        }

        // ── Night tariff suggestion ─────────────────────────────────────────────
        if (!tariff.kwh_night && kwhNum > 150) {
          hints.push({ text: 'Αν χρησιμοποιείς πλυντήριο ή θερμοσίφωνα το βράδυ, τα νυχτερινά τιμολόγια (ΔΕΗ Γ1Ν Πράσινο Νυχτερινό ή myHome EnterTwo) μειώνουν το κόστος έως 35%.', severity: 'tip' });
        }

        if (hints.length === 0) return null;

        const SEV_STYLE = {
          warning: { bg: 'rgba(242,153,0,0.05)', border: 'rgba(242,153,0,0.2)', dot: 'var(--warning)', text: 'var(--warning)' },
          info:    { bg: 'var(--bg-elevated)', border: 'var(--border-subtle)', dot: 'var(--text-tertiary)', text: 'var(--accent)' },
          tip:     { bg: 'var(--bg-elevated)', border: 'var(--border-subtle)', dot: 'var(--text-tertiary)', text: 'var(--accent)' },
        };

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {hints.map((h, i) => {
              const s = SEV_STYLE[h.severity];
              return (
                <div key={i} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: T.radius.inner, padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0, marginTop: 5 }}/>
                  <div style={{ flex: 1, fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.5 }}>
                    {h.text}
                  </div>
                  {h.action && h.tab && (
                    <button
                      onClick={() => onNavigateTab?.(h.tab!)}
                      style={{ fontSize: 10, fontWeight: 700, color: s.text, background: 'transparent', border: `1px solid ${s.border}`, borderRadius: T.radius.pill, padding: '4px 12px', cursor: 'pointer', whiteSpace: 'nowrap' as const, fontFamily: T.font.sans }}>
                      {h.action} →
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}