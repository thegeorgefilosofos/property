'use client';

import { useState, useMemo, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
// Οι ρυθμίσεις ανά ενότητα έχουν ένα σπίτι: lib/data/settings.
import * as settings from '@/lib/data/settings';
import * as calendar from '@/lib/data/calendar'
import { NumberInput, CustomSelect, DatePicker } from './UIComponents';
import { useBillsSettings } from './BillsSettings';
import { usePropertyHeating } from './usePropertyHeating';
import { usesGas } from '@/lib/property/heating';
import { T, fe, feRate, Spinner, fixedCols } from '@/components/Theme';
import { canRecommend, freshness, RAAEY_COMPARE, RAAEY_NAME } from '@/lib/energy/freshness';
// Ο κατάλογος είναι δεδομένα και ζει στο lib, όπως και του ρεύματος. Η οθόνη
// τον διαβάζει, δεν τον φιλοξενεί: 130 γραμμές τιμών μέσα σε React component
// σήμαιναν ότι κάθε διόρθωση τιμής έδειχνε αλλαγή σε οθόνη.
import { GAS_PROVIDERS, NETWORK_OPERATORS, GAS_LABEL, GAS_VERIFIED, GAS_MAX_AGE_DAYS } from '@/lib/energy/gas';
import { saved } from '@/components/dbWrite';
import { athensToday } from '@/lib/core/time';

/**
 * Η ΤΙΜΗ ΤΗΣ ΚΙΛΟΒΑΤΩΡΑΣ ΑΕΡΙΟΥ, ΜΕ ΤΑ ΔΕΚΑΔΙΚΑ ΠΟΥ ΤΗΝ ΞΕΧΩΡΙΖΟΥΝ.
 * Το ίδιο σφάλμα με το ρεύμα, στην επόμενη οθόνη: ήταν `fe(n, 4)`, που
 * διαβάζεται σαν «τέσσερα δεκαδικά» ενώ το δεύτερο όρισμα αγνοούνταν. Οι
 * χρεώσεις αερίου κινούνται στα 0,0398–0,0870 €/kWh — στα δύο δεκαδικά όλες
 * γίνονταν «0,05 €», δηλαδή η στήλη σύγκρισης έδειχνε τα πάντα ίδια.
 */
const fk = feRate;

const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 20, marginBottom: 16 };

const secHdr = (label: string, sub?: string) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
    <div>
      <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: 'var(--text-secondary)', fontFamily: T.font.sans }}>{label}</div>
      {sub && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)', marginTop: 2, fontFamily: T.font.sans }}>{sub}</div>}
    </div>
  </div>
);

// ΤΟ ΣΗΜΑ ΤΟΥ ΤΥΠΟΥ ΤΙΜΟΛΟΓΙΟΥ ΗΤΑΝ ΣΥΝΑΡΤΗΣΗ ΜΕ ΤΕΣΣΕΡΙΣ ΚΛΑΔΟΥΣ ΚΑΙ ΕΝΑ
// ΑΠΟΤΕΛΕΣΜΑ. Το `bc(badge)` έκανε switch σε τρεις τιμές και επέστρεφε τρεις
// φορές το ίδιο αντικείμενο: ουδέτερο φόντο, ουδέτερο περίγραμμα, ουδέτερο
// γράμμα. Διαβαζόταν σαν να χρωματίζει κάτι, ενώ δεν χρωμάτιζε τίποτα. Η
// διάκριση ΜΠΛΕ έναντι ΚΙΤΡΙΝΟ λέγεται από την ίδια τη λέξη, όχι από χρώμα.
const badgeStyle = { background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' };

// Το πλήθος μετριέται, δεν γράφεται. Αριθμός καρφωμένος σε πρόταση γερνά με την
// πρώτη προσθήκη τιμολογίου και κανένας έλεγχος δεν τον πιάνει.
const TARIFF_COUNT = GAS_PROVIDERS.reduce((n, p) => n + p.tariffs.length, 0);

interface Props { propertyId: string; userId?: string; }

const DEFAULTS = {
  gasProvider: 'nrg', gasTariffId: '', gasMonthly: '', gasKwhMonthly: '',
  networkOperator: 'eda_attikis', gasContractStart: '', gasContractMonths: '',
  hasGasConnection: true,
};

export default function BillsGas({ propertyId, userId = '' }: Props) {
  const supabase = createClient();
  const [s, su, loading] = useBillsSettings(propertyId, userId, 'gas', DEFAULTS);
  // Διαβάζεται, δεν ρωτιέται ξανά: απαντήθηκε στη Θέρμανση, μία φορά.
  const [heatingType] = usePropertyHeating(propertyId, userId);
  const [segmentFilter, setSegmentFilter] = useState<'residential' | 'business'>('residential');
  const [elecProvider, setElecProvider]   = useState<string>('');
  const [calendarSynced, setCalendarSynced] = useState(false);

  const upd = (patch: Partial<typeof DEFAULTS>) => su(patch);

  const kwh    = parseFloat(s.gasKwhMonthly) || 0;

  const provider    = GAS_PROVIDERS.find(p => p.value === s.gasProvider);
  const tariff      = provider?.tariffs.find(t => t.id === s.gasTariffId) || provider?.tariffs[0];
  const calcMonthly = tariff ? kwh * tariff.kwh + tariff.fixed : 0;

  // ══ Η ΠΥΛΗ ΦΡΕΣΚΑΔΑΣ, ΟΠΩΣ ΚΑΙ ΣΤΟ ΡΕΥΜΑ ══════════════════════════════
  // Η οθόνη του ρεύματος σιωπά όταν ο κατάλογος έχει παλιώσει: δεν ανακηρύσσει
  // «φθηνότερο» ούτε υπόσχεται εξοικονόμηση σε τιμές περασμένου μήνα. Η οθόνη
  // του αερίου το έκανε πάντα, χωρίς καμία προϋπόθεση, πάνω σε κατάλογο που
  // ανακοινώνεται μηνιαία. Το ίδιο ρίσκο, η ίδια δέσμευση δώδεκα ή είκοσι
  // τεσσάρων μηνών, ίδιος πλέον και ο κανόνας.
  const fresh   = freshness(GAS_VERIFIED, new Date(), GAS_MAX_AGE_DAYS);
  // Η κατανάλωση εδώ δεν εκτιμάται, τη γράφει ο ίδιος ο ιδιοκτήτης: αξιόπιστη
  // είναι όταν υπάρχει.
  const canRank = canRecommend(fresh, kwh > 0);

  const manual      = parseFloat(s.gasMonthly) || 0;
  const effective   = manual > 0 ? manual : calcMonthly;

  // ── Cross-tab: πάροχος ρεύματος για ανίχνευση Dual Fuel ─────────────────────
  useEffect(() => {
    if (!propertyId) return;
    (async () => {
      const elecData = await settings.section<{ elecProvider?: unknown }>(supabase, propertyId, 'electricity', userId);
      if (elecData?.elecProvider) setElecProvider(String(elecData.elecProvider));
    })();
  }, [propertyId]);

  // ΗΤΑΝ ΤΡΙΤΟΣ ΚΑΤΑΛΟΓΟΣ ΠΑΡΟΧΩΝ, ΓΡΑΜΜΕΝΟΣ ΜΕ ΤΟ ΧΕΡΙ. Μια λίστα επτά τιμών
  // έπρεπε να μένει συγχρονισμένη με δύο καταλόγους. Δεν έμενε: η «Φυσικό αέριο
  // ΕΕΕ» πουλά και ρεύμα και αέριο, έλειπε όμως από τη λίστα, οπότε όποιος την
  // είχε και στα δύο δεν έβλεπε ποτέ την υπόδειξη. Η ισότητα των δύο τιμών
  // σημαίνει ήδη ότι ο πάροχος υπάρχει και στους δύο καταλόγους.
  const sameDualFuelProvider = Boolean(elecProvider) && elecProvider === s.gasProvider;

  // Ο μήνας από την ώρα της Αθήνας: ο περιηγητής ενός χρήστη σε άλλη ζώνη
  // μπορεί να είναι ήδη στον επόμενο μήνα και η περίοδος θέρμανσης να αρχίσει
  // ή να τελειώσει μια μέρα νωρίτερα από ό,τι στην πραγματικότητα.
  const isHeatingSeason = [10, 11, 12, 1, 2, 3].includes(Number(athensToday().slice(5, 7)));
  const noGasDataYet = effective === 0 && kwh === 0;

  // Ο ΣΥΓΧΡΟΝΙΣΜΟΣ ΠΡΟΣ ΤΟ ΑΚΙΝΗΤΟ ΕΦΥΓΕ, ΜΑΖΙ ΜΕ ΤΟ ΜΕΝΟΥ ΠΟΥ ΤΟΝ ΤΡΟΦΟΔΟΤΟΥΣΕ.
  // Αυτή η οθόνη αντέγραφε το δικό της τρίτιμο λεξιλόγιο στο
  // `user_properties.heating`: όποιος διάλεγε «Συνδυαστικό» έγραφε `combi` σε
  // στήλη που κανένας κατάλογος ετικετών δεν γνωρίζει και η καρτέλα του
  // ακινήτου τύπωνε «Θέρμανση: combi». Τώρα η πηγή είναι μία και η ροή
  // μονόδρομη: το ακίνητο απαντά, οι καρτέλες διαβάζουν.

  // ── Auto-sync λήξης σύμβασης → calendar_events ───────────────────────────────
  useEffect(() => {
    if (!propertyId || !s.gasContractStart || !s.gasContractMonths || calendarSynced) return;
    const months = parseInt(s.gasContractMonths) || 0;
    if (months <= 0) return;
    // Ίδιο σφάλμα θερινής ώρας: η λήξη του συμβολαίου αερίου έπεφτε μία μέρα
    // νωρίτερα όταν το διάστημα περνούσε από χειμερινή σε θερινή ώρα.
    const expiry = new Date(`${s.gasContractStart}T00:00:00Z`);
    if (Number.isNaN(expiry.getTime())) return;
    expiry.setUTCMonth(expiry.getUTCMonth() + months);
    const expiryStr = expiry.toISOString().slice(0, 10);

    (async () => {
      // Η κατηγορία είναι το κλειδί της μοναδικότητας: η πηγή 'system' τη
      // μοιράζονται και η ασφάλιση και το αέριο.
      if (await calendar.exists(supabase, propertyId, { category: 'gas_contract', eventDate: expiryStr })) { setCalendarSynced(true); return; }

      // Το `.then(() => setCalendarSynced(true))` δήλωνε επιτυχία χωρίς να
      // κοιτάξει: ο Supabase δεν πετά, οπότε μια απόρριψη από πολιτική RLS
      // κατέληγε σε «συγχρονίστηκε», η υπενθύμιση λήξης δεν έμπαινε ποτέ στο
      // ημερολόγιο και ο χρήστης το μάθαινε όταν είχε λήξει η σύμβαση.
      if (await saved('Η υπενθύμιση λήξης δεν μπήκε στο ημερολόγιο',
        calendar.insert(supabase, [calendar.row({ propertyId, userId }, 'system', {
          title: `Λήξη σύμβασης φυσικού αερίου, ${provider?.label ?? ''}`,
          category: 'gas_contract',
          event_date: expiryStr,
          amount: effective > 0 ? effective : null,
          notes: `Η σύμβαση ${tariff?.name ?? ''} λήγει. Σύγκρινε νέα τιμολόγια πριν ανανεώσεις.`,
        })]))) setCalendarSynced(true);
    })();
  }, [propertyId, s.gasContractStart, s.gasContractMonths]);

  const allTariffs = useMemo(() => {
    return GAS_PROVIDERS.flatMap(p => p.tariffs
      .filter(t => t.segment === segmentFilter)
      .map(t => ({ ...t, providerLabel: p.label, providerUrl: p.url, monthly: kwh * t.kwh + t.fixed, isCurrent: t.id === s.gasTariffId })))
      .sort((a, b) => a.monthly - b.monthly);
  }, [kwh, s.gasTariffId, segmentFilter]);

  const bestMonthly = allTariffs[0]?.monthly || 0;
  // ═══ ΤΑ ΔΥΟ ΝΟΥΜΕΡΑ ΔΕΝ ΕΙΝΑΙ ΤΟΥ ΙΔΙΟΥ ΕΙΔΟΥΣ ══════════════════════════
  // Η εξοικονόμηση υπολογιζόταν ως `effective − bestMonthly`. Το `effective`
  // είναι το ΠΡΑΓΜΑΤΙΚΟ ποσό του λογαριασμού όταν ο χρήστης το έχει γράψει:
  // μέσα του κάθονται ρυθμιζόμενες χρεώσεις δικτύου, ΕΦΚ και ΦΠΑ 6%. Το
  // `bestMonthly` είναι μόνο η χρέωση προμήθειας. Η αφαίρεση έβγαζε τη διαφορά
  // ΦΟΡΩΝ ΚΑΙ ΔΙΚΤΥΟΥ και την παρουσίαζε ως «δυνητική εξοικονόμηση αλλάζοντας
  // πάροχο» — ποσό που δεν πρόκειται να εξοικονομηθεί ποτέ, γιατί οι χρεώσεις
  // αυτές είναι ίδιες σε κάθε πάροχο. Όσο μεγαλύτερος ο λογαριασμός, τόσο
  // μεγαλύτερο το ψέμα.
  //
  // Η σύγκριση γίνεται τώρα προμήθεια προς προμήθεια: το τρέχον πρόγραμμα με
  // τη ΔΙΚΗ ΤΟΥ κατανάλωση, απέναντι στο φθηνότερο με την ίδια κατανάλωση.
  const savings     = calcMonthly - bestMonthly;

  const providerOptions = GAS_PROVIDERS.map(p => ({ value: p.value, label: p.label }));
  const tariffOptions   = (provider?.tariffs ?? []).filter(t => t.segment === segmentFilter)
    .map(t => ({ value: t.id, label: `${t.name}, ${t.badge}, ${fk(t.kwh)}/kWh` }));
  const networkOptions  = NETWORK_OPERATORS.map(n => ({ value: n.value, label: `${n.label} (${n.region})` }));

  if (loading) return <Spinner label="Φόρτωση…" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>

      {/* ── Διαφάνεια τιμών, τι ακριβώς βλέπεις ── */}
      <div style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: T.radius.inner, padding: '12px 16px', marginBottom: 14, fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text-primary)' }}>Διαφάνεια τιμών:</strong> Και τα {TARIFF_COUNT} τιμολόγια είναι όπως τα δημοσιεύει το εργαλείο σύγκρισης της <span title={RAAEY_NAME}>ΡΑΑΕΥ</span>, κατάσταση {GAS_LABEL}.
        Αφορούν μόνο τη <strong>χρέωση προμήθειας</strong> (ανταγωνιστικό σκέλος): χωρίς ρυθμιζόμενες χρεώσεις δικτύου, χωρίς <span title="Ειδικός Φόρος Κατανάλωσης">ΕΦΚ</span> και χωρίς <span title="Φόρος Προστιθέμενης Αξίας">ΦΠΑ</span> 6%, οπότε ο λογαριασμός σου βγαίνει υψηλότερος. Τα κυμαινόμενα (ΚΙΤΡΙΝΟ) αναθεωρούνται κάθε μήνα.
      </div>

      {/* ── Επισκόπηση κόστους ── */}
      <div style={card}>
        {secHdr('Τρέχον κόστος', `Τιμές ΡΑΑΕΥ, ${GAS_LABEL}`)}
        {/* Τρία πλακίδια: το ρευστό πλέγμα έβγαζε 2+1 στα 430. Ιδια κλάση και
            ίδιοι κανόνες με τους δείκτες του KPIGrid. */}
        <div className="kpi-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 12, '--kpi-lg': 3, '--kpi-md': 3, '--kpi-sm': 1 } as React.CSSProperties}>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '16px 18px' }}>
            {/* ══ Η ΕΤΙΚΕΤΑ ΕΛΕΓΕ «ΠΡΟΜΗΘΕΙΑ» ΚΑΙ ΤΟ ΝΟΥΜΕΡΟ ΗΤΑΝ ΟΛΟΚΛΗΡΟΣ
                Ο ΛΟΓΑΡΙΑΣΜΟΣ. Το `effective` παίρνει το ποσό που γράφει ο
                ιδιοκτήτης στο «Πραγματικό κόστος τον μήνα»· το ίδιο το
                πεδίο του ζητά ρητά ΟΛΟΚΛΗΡΟ το ποσό, με δίκτυο, ΕΦΚ και ΦΠΑ.
                Το πλακίδιο το τύπωνε από κάτω ως «κόστος προμήθειας»: ο
                αριθμός που ο ιδιοκτήτης θα σύγκρινε με τον πίνακα παρόχων
                ήταν 20 έως 30% μεγαλύτερος από ό,τι ο πίνακας μετρά. Τώρα η
                ετικέτα λέει ποιο από τα δύο βλέπει. ══ */}
            <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>{manual > 0 ? 'Ο λογαριασμός σου' : 'Μηνιαίο κόστος προμήθειας'}</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', color: 'var(--accent)', lineHeight: 1 }}>{fe(effective)}</div>
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)', marginTop: 6, fontFamily: T.font.sans }}>{manual > 0 ? 'Με δίκτυο, ΕΦΚ και ΦΠΑ' : 'Χωρίς δίκτυο, ΕΦΚ και ΦΠΑ'}</div>
          </div>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '16px 18px' }}>
            <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>Ετήσιο κόστος, εκτίμηση</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)', lineHeight: 1 }}>{fe(effective * 12)}</div>
          </div>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '16px 18px' }}>
            <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>Δίκτυο διανομής</div>
            <div style={{ fontSize: 'var(--fs-base)', fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.mono, lineHeight: 1.2 }}>{NETWORK_OPERATORS.find(n => n.value === s.networkOperator)?.label}</div>
          </div>
        </div>
      </div>

      {/* ── Στοιχεία σύνδεσης ── */}
      <div style={card}>
        {secHdr('Σύνδεση, πάροχος και τιμολόγιο')}
        {/* ══ ΤΕΣΣΕΡΙΣ ΣΕΙΡΕΣ ΤΩΝ ΔΥΟ ΕΓΙΝΑΝ ΔΥΟ ΣΕΙΡΕΣ ΜΕ ΛΟΓΙΚΗ ═════════════
            Εννιά πεδία κάθονταν σε τέσσερα ξεχωριστά πλέγματα των δύο, με σειρά
            που δεν έλεγε τίποτα: πάροχος, μετά κατανάλωση, μετά ημερομηνίες
            σύμβασης, μετά μια χρηματιστηριακή τιμή δίπλα σε παράγραφο. Το ίδιο
            θέμα σπασμένο σε κομμάτια και κάθε κομμάτι στο μισό πλάτος της
            κάρτας — γι' αυτό η κάρτα ήταν ψηλή και διαβαζόταν σαν ερωτηματολόγιο.

            Δύο σειρές και η καθεμία απαντά ΕΝΑ ερώτημα:
              πρώτη   → τι έχεις (δίκτυο, θέρμανση, πάροχος, τιμολόγιο)
              δεύτερη → η σύμβασή σου και η χρήση σου

            Η παράγραφος του TTF έγινε ⓘ πάνω στο ίδιο του το πεδίο: μια
            επεξήγηση δίπλα σε ένα πεδίο διαβάζεται μία φορά και μετά είναι
            θόρυβος για πάντα. Η ίδια σύμβαση με το «Πραγματικό κόστος».

            ΚΑΙ ΕΙΝΑΙ ΣΥΜΒΟΛΟΣΕΙΡΑ, ΟΧΙ JSX. Το `infoNode` τυλίγει σε κουκκίδα
            ΜΟΝΟ τις συμβολοσειρές· οτιδήποτε άλλο τυπώνεται αυτούσιο μέσα στην
            ετικέτα. Με σύνδεσμο μέσα σε <>…</> η επεξήγηση θα ξαναγινόταν
            παράγραφος, θα φούσκωνε η ετικέτα και το πεδίο θα έπεφτε κάτω από τα
            διπλανά του. Ο σύνδεσμος δεν χάνεται από αδιαφορία: το tooltip έχει
            `pointerEvents: none`, οπότε δεν πατιέται ούτως ή άλλως. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* ΤΡΙΑ ΠΑΙΔΙΑ, ΟΧΙ ΤΕΣΣΕΡΑ. Το πλήθος ήταν γραμμένο «4» ενώ οι επιλογείς
            είναι τρεις, οπότε ο κανόνας των διαιρετών υπολόγιζε για τέσσερα και
            έβγαζε 2+1: ο τρίτος μόνος του, με τρύπα δίπλα του. Μετρημένο στα
            430, 768 και 820. */}
        <div {...fixedCols(3, 14, 'start')}>
          <CustomSelect label="Διαχειριστής δικτύου" value={s.networkOperator} onChange={v => upd({ networkOperator: v })} options={networkOptions} />
          <CustomSelect label="Πάροχος" value={s.gasProvider}
            onChange={v => upd({ gasProvider: v, gasTariffId: GAS_PROVIDERS.find(p => p.value === v)?.tariffs[0]?.id || '' })}
            options={providerOptions}/>
          <CustomSelect label="Τιμολόγιο" value={s.gasTariffId || provider?.tariffs[0]?.id || ''} onChange={v => upd({ gasTariffId: v })} options={tariffOptions}/>
        </div>
        {/* ΤΕΣΣΕΡΑ ΠΕΔΙΑ, ΟΧΙ ΠΕΝΤΕ. Το πέμπτο ζητούσε από τον ιδιοκτήτη τη
            χρηματιστηριακή τιμή TTF για να υπολογιστούν τρία τιμολόγια nrg. Η
            ΡΑΑΕΥ δημοσιεύει την πραγματική τιμή τους κάθε μήνα, οπότε το πεδίο
            ζητούσε δουλειά για απάντηση που υπάρχει ήδη. */}
        <div {...fixedCols(4, 14, 'start')}>
          <DatePicker label="Έναρξη σύμβασης" value={s.gasContractStart} onChange={v => upd({ gasContractStart: v })}/>
          <NumberInput label="Διάρκεια σύμβασης" value={s.gasContractMonths} onChange={v => upd({ gasContractMonths: v })} suffix="μήνες"/>
          <NumberInput label="Μηνιαία κατανάλωση" value={s.gasKwhMonthly} onChange={v => upd({ gasKwhMonthly: v })} suffix="kWh"/>
          <NumberInput label="Πραγματικό κόστος τον μήνα" labelInfo="Ολόκληρο το ποσό του λογαριασμού, με δίκτυο, ΕΦΚ και ΦΠΑ. Χρησιμοποιείται για την παρακολούθηση κόστους, ΟΧΙ για τη σύγκριση παρόχων: εκεί συγκρίνεται προμήθεια με προμήθεια."
            value={s.gasMonthly} onChange={v => upd({ gasMonthly: v })} suffix="€"/>
        </div>
        </div>

        {tariff && (
          <div style={{ marginTop: 14, padding: '12px 16px', background: 'var(--bg-base)', borderRadius: T.radius.inner, border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' as const, gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const }}>
                <span style={{ fontSize: 'var(--fs-base)', fontWeight: 700, color: 'var(--text-primary)' }}>{tariff.name}</span>
                <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, padding: '3px 9px', borderRadius: T.radius.badge, ...badgeStyle }}>{tariff.badge}</span>
              </div>
              <a href={provider?.url} target="_blank" rel="noopener noreferrer" className="tap-link"
                style={{ fontSize: 'var(--fs-xs)', color: 'var(--accent)', border: '1px solid var(--border-default)', borderRadius: T.radius.pill, padding: '4px 12px', textDecoration: 'none', whiteSpace: 'nowrap' as const, fontFamily: T.font.sans, fontWeight: 600 }}>
                Επίσημη σελίδα
              </a>
            </div>
            {tariff.desc && <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{tariff.desc}</div>}
            <div style={{ display: 'flex', gap: 20, marginTop: 10, flexWrap: 'wrap' as const }}>
              <span title="Κιλοβατώρα, μονάδα μέτρησης κατανάλωσης ενέργειας" style={{ fontSize: 'var(--fs-xs)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>Χρέωση kWh:{'  '}<strong style={{ color: 'var(--text-primary)' }}>{fk(tariff.kwh)} / kWh</strong></span>
              <span style={{ fontSize: 'var(--fs-xs)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>Πάγιο:{'  '}<strong>{fe(tariff.fixed)} / μήνα</strong></span>
              {tariff.contract_months != null && (
                <span style={{ fontSize: 'var(--fs-xs)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>Δέσμευση:{'  '}<strong>{tariff.contract_months} μήνες</strong></span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Σύγκριση παρόχων ── */}
      {kwh > 0 && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4, flexWrap: 'wrap' as const, gap: 10 }}>
            {secHdr('Σύγκριση παρόχων', `${allTariffs.length} τιμολόγια της ΡΑΑΕΥ σε ${kwh} kWh τον μήνα, χρέωση προμήθειας`)}
            <div style={{ display: 'flex', background: 'var(--bg-base)', borderRadius: T.radius.pill, padding: 4, border: '1px solid var(--border-default)' }}>
              {(['residential', 'business'] as const).map(seg => (
                <button key={seg} onClick={() => setSegmentFilter(seg)}
                  style={{ padding: '6px 16px', borderRadius: T.radius.pill, border: 'none', cursor: 'pointer', fontSize: 'var(--fs-xs)', fontWeight: 700,
                    background: segmentFilter === seg ? 'var(--accent)' : 'transparent',
                    color: segmentFilter === seg ? 'var(--accent-text)' : 'var(--text-secondary)' }}>
                  {seg === 'residential' ? 'Οικιακό' : 'Επιχειρηματικό'}
                </button>
              ))}
            </div>
          </div>

          {canRank && savings > 1 && (
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '10px 16px', marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-tertiary)' }}/>
              <span style={{ fontSize: 12, fontFamily: T.font.sans, color: 'var(--text-primary)' }}>
                Δυνητική εξοικονόμηση <strong style={{ fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{fe(savings)} τον μήνα</strong> ({fe(savings * 12)} τον χρόνο) με το φθηνότερο τιμολόγιο, στη χρέωση προμήθειας. Δίκτυο, ΕΦΚ και ΦΠΑ είναι ίδια σε κάθε πάροχο και δεν εξοικονομούνται. Επιβεβαίωσε την τρέχουσα προσφορά στον πάροχο.
              </span>
            </div>
          )}

          {/* Η σιωπή χωρίς εξήγηση διαβάζεται ως βλάβη. Οταν ο κατάλογος έχει
              παλιώσει, η οθόνη λέει γιατί δεν ονομάζει νικητή. */}
          {fresh.stale && (
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '10px 16px', marginBottom: 14, fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.5 }}>
              {fresh.note}
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-xs)' }}>
              <thead>
                {/* Η στήλη «Τιμή» έδειχνε τη σήμανση αξιοπιστίας, όχι τιμή, δίπλα
                    στη στήλη «kWh» που έδειχνε την πραγματική τιμή. Δύο κεφαλίδες
                    που λένε το ίδιο πράγμα και η μία λέει ψέματα. Στη θέση της
                    μπαίνει η δέσμευση, που ο ιδιοκτήτης πρέπει να ξέρει πριν
                    αλλάξει πάροχο. */}
                <tr>{['Πάροχος', 'Τιμολόγιο', 'Τύπος', 'Δέσμευση', 'kWh', 'Πάγιο', 'Μήνας', 'Έτος', 'Διαφορά'].map(h => (
                  <th key={h} style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em', fontFamily: T.font.sans, whiteSpace: 'nowrap' as const, background: 'var(--bg-elevated)' }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {allTariffs.map((t, i) => {
                  const isBest = i === 0;
                  const diff   = t.monthly - bestMonthly;
                  return (
                    <tr key={t.id} style={{ background: t.isCurrent ? 'var(--accent-soft)' : isBest ? 'var(--bg-elevated)' : 'transparent' }}>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', fontWeight: 600 }}>
                        {canRank && !t.isCurrent && isBest && <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)', marginRight: 6, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Φθηνότερο</span>}
                        {t.providerLabel}
                      </td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)' }}>{t.name}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)' }}>
                        <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, padding: '2px 8px', borderRadius: T.radius.badge, ...badgeStyle }}>{t.badge}</span>
                      </td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>{t.contract_months != null ? `${t.contract_months} μήνες` : 'Χωρίς'}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fk(t.kwh)}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fe(t.fixed)}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'var(--accent)' }}>{fe(t.monthly)}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: 'var(--text-tertiary)' }}>{fe(t.monthly * 12)}</td>
                      {/* Ο πίνακας είναι ήδη ταξινομημένος από το φθηνότερο: η
                          κατεύθυνση της διαφοράς φαίνεται από τη θέση, δεν
                          χρειάζεται φανάρι. Και το μηδέν λέγεται με μηδέν, όχι
                          με παύλα που διαβάζεται ως «λείπει». */}
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                        {diff > 0 ? `+${fe(diff)}` : fe(diff)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 8, fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)', fontFamily: T.font.sans, background: 'var(--bg-elevated)', padding: '6px 12px', borderRadius: T.radius.badge, lineHeight: 1.5 }}>
            * Χρέωση προμήθειας χωρίς δίκτυο, ΕΦΚ και ΦΠΑ. Πηγή: εργαλείο σύγκρισης της ΡΑΑΕΥ, {GAS_LABEL}. Οι εκπτώσεις συνέπειας και συνδυασμού που περιγράφονται είναι ήδη μέσα στην τιμή· χάνονται με μία εκπρόθεσμη πληρωμή.
          </div>
        </div>
      )}

      {/* ── Έξυπνες ειδοποιήσεις βάσει πραγματικών δεδομένων ── */}
      {(() => {
        const hints: { text: string; severity: 'info' | 'warning' | 'tip' }[] = [];

        if (sameDualFuelProvider) {
          hints.push({ text: `Έχεις ${provider?.label} και στο ρεύμα και στο αέριο. Αρκετά τιμολόγια του καταλόγου δίνουν έκπτωση για τον συνδυασμό, έλεγξε αν το δικό σου την περιλαμβάνει.`, severity: 'tip' });
        }
        if (isHeatingSeason && noGasDataYet && usesGas(heatingType)) {
          hints.push({ text: 'Είμαστε σε περίοδο θέρμανσης και δεν έχεις καταχωρήσει ακόμη κατανάλωση ή κόστος αερίου. Συμπλήρωσε τα στοιχεία για ακριβή παρακολούθηση.', severity: 'warning' });
        }
        if (tariff?.type === 'variable' && kwh > 800) {
          hints.push({ text: `Με ${kwh} kWh/μήνα, ένα σταθερό τιμολόγιο θα σε προστάτευε από διακυμάνσεις TTF τον χειμώνα, τότε οι τιμές συνήθως ανεβαίνουν.`, severity: 'tip' });
        }
        if (heatingType === 'central_gas') {
          hints.push({ text: 'Με κεντρική θέρμανση, το κόστος αερίου μοιράζεται στους ενοίκους/ιδιοκτήτες βάσει χιλιοστών. Έλεγξε τον κανονισμό κοινοχρήστων.', severity: 'info' });
        }

        if (hints.length === 0) return null;

        const SEV_STYLE = {
          warning: { bg: 'var(--bg-elevated)', border: 'var(--border-subtle)', dot: 'var(--warning)' },
          info:    { bg: 'var(--bg-elevated)', border: 'var(--border-subtle)', dot: 'var(--accent)' },
          tip:     { bg: 'var(--bg-elevated)', border: 'var(--border-subtle)', dot: 'var(--accent)' },
        };

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            {hints.map((h, i) => {
              const sv = SEV_STYLE[h.severity];
              return (
                <div key={i} style={{ background: sv.bg, border: `1px solid ${sv.border}`, borderRadius: T.radius.inner, padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: sv.dot, flexShrink: 0, marginTop: 4 }}/>
                  <div style={{ flex: 1, fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.5 }}>{h.text}</div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ══ ΤΡΙΑ ΙΔΙΑ ΓΚΡΙΖΑ ΚΟΥΤΙΑ ΔΙΑΒΑΖΟΝΤΑΙ ΩΣ ΤΟΙΧΟΣ ══════════════════
          Τρεις παράγραφοι με πανομοιότυπο πλαίσιο, φόντο και μέγεθος: τίποτα δεν
          έλεγε στο μάτι ποια αφορά ΕΣΕΝΑ τώρα. Και οι τρεις πληροφορίες είναι
          χρήσιμες, οπότε δεν σβήνονται· αποκτούν όμως κεφαλή που σαρώνεται σε
          ένα δευτερόλεπτο και το πλαίσιο φεύγει υπέρ μιας λεπτής γραμμής.
          Το ίδιο ιδίωμα με τις υπόλοιπες λίστες της εφαρμογής. ══ */}
      <div style={card}>
        {secHdr('Πριν αλλάξεις τιμολόγιο')}
        <div>
          {[
            { t: 'Η αλλαγή παρόχου δεν αγγίζει το δίκτυο',
              b: 'Το δίκτυο διανομής ανήκει στον τοπικό διαχειριστή (ΕΔΑ Αττικής, ΕΔΑ ΘΕΣΣ ή ΔΕΔΑ) και δεν αλλάζει όποιον πάροχο κι αν επιλέξεις. Η αλλαγή είναι καθαρά εμπορική: καμία επέμβαση στον αγωγό ή στον λέβητα, περίπου τρεις εβδομάδες, χωρίς χρέωση.' },
            { t: 'Η «έκπτωση συνέπειας» χάνεται με μία καθυστέρηση',
              b: 'Πολλά τιμολόγια διαφημίζουν τιμή που ισχύει μόνο με εμπρόθεσμη εξόφληση. Αν αργήσεις μία πληρωμή, χρεώνεσαι τη βασική, υψηλότερη τιμή. Σύγκρινε και την καθαρή τιμή, χωρίς την έκπτωση.' },
            { t: 'Τα κυμαινόμενα ακολουθούν τον δείκτη TTF',
              b: 'Ο TTF είναι η ευρωπαϊκή χονδρεμπορική αγορά αερίου και ανεβαίνει συνήθως τον χειμώνα, με τη ζήτηση θέρμανσης. Αν θέλεις σιγουριά, κλείδωσε σταθερό πριν την ψυχρή περίοδο.' },
          ].map((x, i, arr) => (
            <div key={x.t} style={{ padding: '12px 0', borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--border-subtle)' }}>
              <p style={{ fontSize: 'var(--fs-base)', fontWeight: 500, color: 'var(--text-primary)', fontFamily: T.font.sans, lineHeight: 1.45 }}>{x.t}</p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.7, marginTop: 4 }}>{x.b}</p>
            </div>
          ))}
        </div>
        <a href={RAAEY_COMPARE} target="_blank" rel="noopener noreferrer" className="tap-link"
          style={{ display: 'inline-block', marginTop: 14, fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--accent)', background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: T.radius.pill, padding: '8px 18px', textDecoration: 'none' }}>
          Επίσημη σύγκριση τιμών <span title={RAAEY_NAME}>ΡΑΑΕΥ</span> στο gov.gr
        </a>
      </div>
    </div>
  );
}