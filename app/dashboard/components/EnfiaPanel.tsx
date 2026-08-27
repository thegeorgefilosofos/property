'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ΥΠΟΛΟΓΙΣΜΟΣ ΕΝΦΙΑ — ΕΝΑ ΣΗΜΕΙΟ, ΚΑΙ ΚΑΝΕΝΑ ΨΕΜΑ
// ─────────────────────────────────────────────────────────────────────────
// ΠΟΥ ΗΤΑΝ. Μέσα στο πάνελ «Υπηρεσίες» των Συμβολαίων, τρίτο σκαλοπάτι από την
// αρχική, διπλωμένο πίσω από ένα κουμπί «▼ Ανάπτυξη». Δηλαδή το εργαλείο που
// απαντά στη μοναδική φορολογική ερώτηση που κάνει ΚΑΘΕ ιδιοκτήτης κάθε χρόνο
// ήταν κλειστό, σε οθόνη που μέχρι πρόσφατα δεν άνοιγε καν από πουθενά.
//
// ΤΡΙΑ ΠΡΑΓΜΑΤΙΚΑ ΣΦΑΛΜΑΤΑ ΠΟΥ ΔΙΟΡΘΩΝΟΝΤΑΙ ΕΔΩ, ΟΧΙ ΥΦΟΣ:
//
// 1. Η ΔΟΣΗ ΗΤΑΝ Η ΜΙΣΗ. Ο πίνακας προθεσμιών έγραφε έξι δόσεις (Μάιος ως
//    Οκτώβριος) και από κάτω τύπωνε ποσό δόσης ίσο με ετήσιο διά ΔΩΔΕΚΑ. Η
//    ετικέτα έλεγε «Δόση (~6 δόσεις)» πάνω σε νούμερο δώδεκα δόσεων. Όποιος
//    προϋπολόγιζε από αυτή την οθόνη έβαζε στην άκρη τα μισά. Και το φορολογικό
//    ημερολόγιο της ίδιας εφαρμογής έλεγε τρίτο πράγμα: «έως 12 μηνιαίες δόσεις
//    έως τον Φεβρουάριο του επόμενου έτους».
//
//    Το πλήθος των δόσεων είναι νομικό γεγονός που αλλάζει ανά έτος. Δεν
//    γράφεται εδώ ως βεβαιότητα. Η οθόνη λέει το ΕΤΗΣΙΟ ποσό και «πόσα τον μήνα
//    να βάζεις στην άκρη» (ετήσιο διά δώδεκα), που είναι αληθές ανεξάρτητα από
//    το πόσες δόσεις ορίσει φέτος η ΑΑΔΕ. Τις ημερομηνίες τις κρατά το
//    φορολογικό ημερολόγιο, με την επιφύλαξή του.
//
// 2. Η ΠΡΟΕΠΙΛΟΓΗ ΞΑΝΑΕΦΕΡΕ ΤΗ ΜΑΝΤΕΨΙΑ ΠΟΥ Η ΜΗΧΑΝΗ ΕΙΧΕ ΒΓΑΛΕΙ. Το
//    lib/billing/enfia.ts λέει ρητά ότι όροφος και παλαιότητα που λείπουν
//    παίρνουν συντελεστή 1,00, «όχι μαντεψιά», επειδή το `?? 'second'` και
//    `?? '10_20'` έβγαζαν κάθε εκτίμηση 16,15% πάνω από την ουδέτερη βάση.
//    Η φόρμα όμως είχε ΠΡΟΕΠΙΛΕΓΜΕΝΑ ακριβώς αυτά τα δύο («2ος όροφος»,
//    «10-14 έτη»), οπότε κάθε χρήστης που δεν τα άγγιζε έπαιρνε πάλι +16,15%.
//    Η διόρθωση της μηχανής είχε ακυρωθεί από την προεπιλογή της οθόνης.
//    Τώρα και τα δύο ξεκινούν από «Δεν γνωρίζω», που είναι 1,00.
//
// 3. ΤΟ ΠΛΑΙΣΙΟ «ΝΕΟ 2026: ΑΥΞΗΣΗ ΠΕΡΙΠΟΥ 8%» ΕΦΥΓΕ. Ο υπολογισμός ΔΕΝ
//    εφάρμοζε καμία αύξηση 8%: οι πίνακες είναι του ν.4916/2022. Η οθόνη
//    ανακοίνωνε αύξηση που τα ίδια της τα μαθηματικά δεν έκαναν.
//
// ΤΙ ΠΡΟΣΤΕΘΗΚΕ, ΚΑΙ ΕΙΝΑΙ ΤΟ ΚΥΡΙΟ. Ο ΕΝΦΙΑ ενός ακινήτου δεν αλλάζει από
// χρονιά σε χρονιά παρά μόνο αν αλλάξει το ίδιο το ακίνητο ή ο νόμος. Άρα το
// ΠΕΡΣΙΝΟ ποσό είναι ασύγκριτα ακριβέστερο από κάθε μοντελοποίηση ζώνης και
// ορόφου — και το ξέρει ήδη ο ιδιοκτήτης, γιατί το πλήρωσε. Η οθόνη το ζητά
// πρώτο και δέχεται είτε το ετήσιο του εκκαθαριστικού είτε τη δόση επί το
// πλήθος των δόσεων, γιατί το εκκαθαριστικό δεν το κρατούν όλοι ενώ τις δόσεις
// τις βλέπει ο καθένας στην τράπεζα.
//
// Η σειρά αξιοπιστίας είναι δηλωμένη και ορατή: φετινό εκκαθαριστικό, μετά
// περσινό, μετά εκτίμηση. Η οθόνη λέει ΠΑΝΤΑ ποιο από τα τρία χρησιμοποιεί.
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo, useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
// Οι ρυθμίσεις ανά ενότητα έχουν ένα σπίτι: lib/data/settings.
import * as settings from '@/lib/data/settings';
import { T, TT, fe, fp, SecHdr, Spinner } from '@/components/Theme';
import { NumberInput, CustomSelect } from './UIComponents';
import { useBillsSettings } from './BillsSettings';
import { AadePill } from '@/components/AadeLink';
import {
  estimateENFIA, enfiaInUse, enfiaLastYearAnnual,
  ENFIA_REDUCTIONS, ENFIA_AGE_BANDS, ENFIA_FLOOR_COEF,
} from '@/lib/billing/enfia';

// Το «Δεν γνωρίζω» ΔΕΝ είναι απουσία επιλογής: είναι η ουδέτερη επιλογή, με
// συντελεστή 1,00. Ο χρήστης πρέπει να μπορεί να τη διαλέξει ρητά και να
// είναι αυτή που βρίσκει μπροστά του.
const UNKNOWN = '';

const ZONE_OPTIONS = [
  { value: UNKNOWN,      label: 'Δεν γνωρίζω ακόμη'                 },
  { value: '0_750',      label: 'Έως 750 € ανά τετραγωνικό'         },
  { value: '751_1500',   label: '751 έως 1.500 € ανά τετραγωνικό'   },
  { value: '1501_2500',  label: '1.501 έως 2.500 € ανά τετραγωνικό' },
  { value: '2501_3000',  label: '2.501 έως 3.000 € ανά τετραγωνικό' },
  { value: '3001_3500',  label: '3.001 έως 3.500 € ανά τετραγωνικό' },
  { value: '3501_4000',  label: '3.501 έως 4.000 € ανά τετραγωνικό' },
  { value: '4001_4500',  label: '4.001 έως 4.500 € ανά τετραγωνικό' },
  { value: '4501_5000',  label: '4.501 έως 5.000 € ανά τετραγωνικό' },
  { value: 'over_5000',  label: 'Πάνω από 5.000 € ανά τετραγωνικό'  },
];

const FLOOR_LABEL: Record<keyof typeof ENFIA_FLOOR_COEF | string, string> = {
  basement: 'Υπόγειο', ground: 'Ισόγειο', first: '1ος', second: '2ος',
  third: '3ος', fourth: '4ος', fifth_plus: '5ος και άνω',
};
const FLOOR_OPTIONS = [
  { value: UNKNOWN, label: 'Δεν γνωρίζω' },
  ...Object.keys(ENFIA_FLOOR_COEF).map(k => ({ value: k, label: FLOOR_LABEL[k] ?? k })),
];
const AGE_OPTIONS = [
  { value: UNKNOWN, label: 'Δεν γνωρίζω' },
  ...ENFIA_AGE_BANDS.map(b => ({ value: b.key, label: b.label })),
];

// ═══ ΤΟ ΠΛΗΘΟΣ ΤΩΝ ΔΟΣΕΩΝ ΔΕΝ ΕΧΕΙ ΠΡΟΕΠΙΛΟΓΗ ══════════════════════════════
// Η κεφαλίδα αυτού του αρχείου αρνείται ρητά να γράψει το πλήθος των δόσεων ως
// βεβαιότητα, επειδή είναι νομικό γεγονός που αλλάζει ανά έτος. Το ίδιο αρχείο
// όμως ξεκινούσε τον επιλογέα στο «12 δόσεις». Οποιος έγραφε ΜΟΝΟ το ποσό μιας
// δόσης και δεν άγγιζε τον επιλογέα έπαιρνε σιωπηλά ποσό δόσης επί δώδεκα — η
// ίδια ακριβώς κατηγορία σφάλματος που η κεφαλίδα λέει ότι διόρθωσε.
//
// Χωρίς επιλογή, η `enfiaLastYearAnnual` επιστρέφει 0 και η οθόνη ζητά την
// επιλογή με το όνομά της. Κανένα νούμερο δεν γεννιέται από μαντεψιά.
const INSTALMENT_OPTIONS = [
  { value: UNKNOWN, label: 'Δεν γνωρίζω' },
  { value: '12', label: '12 δόσεις' },
  { value: '10', label: '10 δόσεις' },
  { value: '6',  label: '6 δόσεις'  },
  { value: '1',  label: 'Εφάπαξ'    },
];

const DEFAULTS = {
  // Φετινό, αν το έχει ήδη στα χέρια του.
  enfiaAnnual: '', enfiaMonthly: '',
  // Περσινό: το ένα από τα δύο αρκεί.
  enfiaLastAnnual: '', enfiaLastInstalment: '', enfiaLastCount: UNKNOWN,
  // Εκτίμηση, μόνο όταν δεν υπάρχει κανένα από τα δύο.
  enfiaSqm: '', enfiaZone: UNKNOWN, enfiaFloor: UNKNOWN, enfiaAge: UNKNOWN,
  enfiaOwnership: '100', enfiaTotalVal: '', enfiaPropVal: '',
  enfiaReductions: [] as string[],
};

/** Τι λέει η οθόνη για κάθε πηγή. Μία πρόταση, χωρίς υπεκφυγή. */
const SOURCE_NOTE = {
  declared: 'Από το φετινό εκκαθαριστικό της ΑΑΔΕ. Δεν είναι εκτίμηση, είναι το ποσό.',
  lastYear: 'Ίδιο με πέρσι. Ο ΕΝΦΙΑ δεν αλλάζει από χρονιά σε χρονιά, εκτός αν αλλάξει το ακίνητο ή ο νόμος.',
  estimate: 'Εκτίμηση από τα στοιχεία που έδωσες. Το ακριβές ποσό το ορίζει μόνο η ΑΑΔΕ.',
  none:     '',
} as const;

const SOURCE_LABEL = {
  declared: 'Φετινό εκκαθαριστικό',
  lastYear: 'Περσινό ποσό',
  estimate: 'Εκτίμηση',
  none:     '',
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// ΤΡΕΙΣ ΔΡΟΜΟΙ ΓΙΑ ΤΟ ΙΔΙΟ ΠΟΣΟ, ΩΣ ΜΙΑ ΕΠΙΛΟΓΗ
// ─────────────────────────────────────────────────────────────────────────
// ΠΟΥ ΗΜΑΣΤΑΝ. Τέσσερις κάρτες η μία κάτω από την άλλη: η απάντηση και από
// κάτω τρεις ενότητες που άνοιγαν και έκλειναν, καθεμιά με δικό της «Άνοιγμα»,
// δικό της «Σύμπτυξη» και δική της περίληψη. Οι τρεις έκαναν ΤΗΝ ΙΔΙΑ δουλειά,
// απαντούσαν ΤΗΝ ΙΔΙΑ ερώτηση και είχαν δηλωμένη σειρά μεταξύ τους — και όμως
// στην οθόνη στέκονταν σαν τρία άσχετα θέματα. Για να περάσεις από τον έναν
// δρόμο στον άλλο χρειαζόσουν δύο πατήματα, ένα για να κλείσεις και ένα για να
// ανοίξεις· στο ενδιάμεσο έβλεπες δύο φόρμες μαζί.
//
// ΤΙ ΕΙΝΑΙ ΤΩΡΑ. Η επιλογή είναι μία και φαίνεται ολόκληρη: τρία πλακίδια στη
// σειρά της προτεραιότητας, καθένα με το ΔΙΚΟ ΤΟΥ νούμερο πάνω του. Ενα
// πάτημα αλλάζει δρόμο. Ο δρόμος που δίνει το ποσό της κάρτας από πάνω φοράει
// κουκκίδα, οπότε η ιεραρχία δεν χρειάζεται να εξηγηθεί με πρόταση: φαίνεται.
//
// ΚΑΙ ΤΟ ΚΕΡΔΟΣ ΔΕΝ ΕΙΝΑΙ ΑΙΣΘΗΤΙΚΟ. Πριν, ο ιδιοκτήτης δεν μπορούσε να δει
// ταυτόχρονα τι κρατά ο κάθε δρόμος χωρίς να τους ανοίξει έναν έναν. Τώρα τα
// τρία νούμερα είναι μπροστά του και συγκρίνονται με μια ματιά — που είναι
// ακριβώς η ερώτηση που κάνει κανείς εδώ: πόσο πέφτει έξω η εκτίμηση.
// ═══════════════════════════════════════════════════════════════════════════
type Route = Exclude<keyof typeof SOURCE_LABEL, 'none'>;

/** Η σειρά είναι Η ΣΕΙΡΑ ΠΡΟΤΕΡΑΙΟΤΗΤΑΣ του `enfiaInUse`, όχι διακοσμητική. */
const ROUTES: Route[] = ['declared', 'lastYear', 'estimate'];

/** Τι ζητά ο κάθε δρόμος. Λέγεται μόλις τον διαλέξεις, όχι τρεις φορές μαζί. */
const ROUTE_HELP: Record<Route, string> = {
  declared: 'Μόλις εκδοθεί, υπερισχύει κάθε άλλου ποσού αυτής της οθόνης.',
  lastYear: 'Το ένα από τα δύο αρκεί. Τις δόσεις τις βλέπει ο καθένας στην τράπεζα.',
  estimate: 'Ζώνη, εμβαδόν, όροφος και παλαιότητα. Όσα δεν ξέρεις μένουν ουδέτερα, δεν μαντεύονται.',
};

function RouteTile({ route, value, inUse, active, onSelect }: {
  route: Route; value: number; inUse: boolean; active: boolean; onSelect: () => void;
}) {
  return (
    <button type="button" onClick={onSelect} aria-pressed={active}
      style={{
        minWidth: 0, minHeight: 62, textAlign: 'left',
        padding: '10px 13px', borderRadius: T.radius.inner, cursor: 'pointer',
        fontFamily: 'inherit',
        background: active ? 'var(--accent-soft)' : 'var(--bg-elevated)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`,
        transition: 'background-color .15s, border-color .15s',
      }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Η κουκκίδα λέει «από εδώ βγαίνει το ποσό πάνω». Για όποιον δεν τη
            βλέπει, το ίδιο πράγμα γίνεται λέξη μέσα στο κουμπί. */}
        {inUse && <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />}
        <span style={{ ...TT.label, fontSize: 11, color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
          {SOURCE_LABEL[route]}
        </span>
        {inUse && <span className="sr-only">σε χρήση</span>}
      </span>
      <span style={{ ...TT.figure, fontSize: 15, display: 'block', marginTop: 5, color: value > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
        {value > 0 ? fe(value) : 'Κενό'}
      </span>
    </button>
  );
}

export default function EnfiaPanel({ propertyId, userId }: { propertyId: string; userId: string }) {
  const [s, upd, loading] = useBillsSettings(propertyId, userId, 'services', DEFAULTS);
  // ΕΝΑ «ΔΕΝ ΤΟ ΕΧΕΙ ΑΠΟΦΑΣΙΣΕΙ ΑΚΟΜΗ Ο ΧΡΗΣΤΗΣ», ΟΧΙ ΤΡΙΑ.
  // Το `null` σημαίνει «κανείς δεν πάτησε ακόμη», οπότε ισχύει ο κανόνας. Μόλις
  // πατήσει, η επιλογή του υπερισχύει. Παράγεται στην απόδοση και όχι σε effect:
  // η πηγή της απάντησης έρχεται ασύγχρονα από τη βάση και ένα effect θα
  // ζωγράφιζε πρώτα λάθος και μετά σωστά — ορατό τίναγμα σε κάθε φόρτωση.
  const [route, setRoute] = useState<Route | null>(null);

  // ── ΜΙΑ ΜΕΙΩΣΗ ΠΟΥ ΔΙΚΑΙΟΥΤΑΙ ΚΑΙ ΔΕΝ ΤΗ ΞΕΡΕΙ ──────────────────────────
  // Αν το ασφαλιστήριο του ακινήτου καλύπτει σεισμό ή πλημμύρα, ο νόμος δίνει
  // μείωση ΕΝΦΙΑ. Το στοιχείο υπάρχει ήδη, δηλωμένο στην Ασφάλεια — απλώς ζει
  // σε άλλη ενότητα ρυθμίσεων και κανείς δεν έκανε τη σύνδεση. Είναι χρήματα
  // που ο ιδιοκτήτης αφήνει στο τραπέζι επειδή δύο οθόνες δεν μιλούσαν.
  const supabase = createClient();
  const [insured, setInsured] = useState(false);
  useEffect(() => {
    if (!propertyId) return;
    let live = true;
    settings.section<{ insCustomEarthquake?: boolean; insCustomFlood?: boolean }>(supabase, propertyId, 'insurance', userId)
      .then(d => {
        if (!live) return;
        setInsured(!!(d?.insCustomEarthquake || d?.insCustomFlood));
      });
    return () => { live = false; };
  }, [propertyId, supabase]);

  const lastYear = useMemo(() => enfiaLastYearAnnual({
    annual: s.enfiaLastAnnual, instalment: s.enfiaLastInstalment, instalments: s.enfiaLastCount,
  }), [s.enfiaLastAnnual, s.enfiaLastInstalment, s.enfiaLastCount]);

  // Ο όροφος και η παλαιότητα περνούν ΟΠΩΣ ΕΙΝΑΙ: κενό σημαίνει άγνωστο και η
  // μηχανή το μεταφράζει σε 1,00. Καμία προεπιλογή που να σπρώχνει προς τα πάνω.
  const est = useMemo(() => estimateENFIA({
    sqm: parseFloat(s.enfiaSqm) || 0,
    zone: s.enfiaZone,
    floor: s.enfiaFloor || undefined,
    age: s.enfiaAge || undefined,
    ownership: parseFloat(s.enfiaOwnership) || 100,
    totalValue: parseFloat(s.enfiaTotalVal) || 0,
    propertyValue: parseFloat(s.enfiaPropVal) || 0,
    reductions: s.enfiaReductions || [],
  }), [s.enfiaSqm, s.enfiaZone, s.enfiaFloor, s.enfiaAge, s.enfiaOwnership, s.enfiaTotalVal, s.enfiaPropVal, s.enfiaReductions]);

  const inUse = enfiaInUse(s.enfiaAnnual, s.enfiaMonthly, est?.annual, lastYear);

  // ΑΝΟΙΧΤΟΣ ΕΙΝΑΙ Ο ΔΡΟΜΟΣ ΠΟΥ ΔΙΝΕΙ ΤΗΝ ΑΠΑΝΤΗΣΗ. Όσο δεν υπάρχει καμία
  // απάντηση, ανοιχτό είναι το «πέρσι»: ο συντομότερος δρόμος, αυτός που
  // προτείνει ήδη η κάρτα από πάνω. Η ρητή επιλογή του χρήστη υπερισχύει.
  const activeRoute: Route = route ?? (inUse.source === 'none' ? 'lastYear' : inUse.source);
  // Το φετινό έχει την ΠΡΩΤΗ προτεραιότητα, οπότε όποτε υπάρχει είναι και το
  // ποσό σε χρήση. Δεν χρειάζεται δεύτερος υπολογισμός για να γραφτεί στο
  // πλακίδιό του.
  const declaredAnnual = inUse.source === 'declared' ? inUse.annual : 0;
  const routeValue: Record<Route, number> = {
    declared: declaredAnnual, lastYear, estimate: est?.annual ?? 0,
  };

  const toggleReduction = (key: string) => {
    const cur = s.enfiaReductions || [];
    upd({ enfiaReductions: cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key] });
  };

  if (loading) return <Spinner label="Φόρτωση…" />;

  const card: React.CSSProperties = {
    background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
    borderRadius: T.radius.card, padding: 20, marginBottom: 16,
  };
  const g2: React.CSSProperties = {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14,
  };

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>
      <SecHdr label="Υπολογισμός ΕΝΦΙΑ"
        sub="Πόσο είναι ο φόρος του ακινήτου και πόσα να βάζεις στην άκρη κάθε μήνα"
        right={<AadePill action="enfia" label="Ε9 και ΕΝΦΙΑ"/>}/>

      {/* ── Η ΑΠΑΝΤΗΣΗ ΠΡΩΤΗ, ΜΕ ΤΗΝ ΠΗΓΗ ΤΗΣ ─────────────────────────────
          Το νούμερο δεν στέκει ποτέ γυμνό. Δίπλα του λέγεται από πού ήρθε και
          από κάτω τι σημαίνει αυτό. Ένας ιδιοκτήτης που δεν ξέρει αν κοιτάζει
          εκκαθαριστικό ή μοντέλο δεν μπορεί να αποφασίσει τίποτα με αυτό. */}
      <div style={{ ...card, borderTop: '2px solid var(--accent)' }}>
        {inUse.source === 'none' ? (
          <div>
            <div style={{ ...TT.h2 }}>Δεν ξέρουμε ακόμη τον ΕΝΦΙΑ σου</div>
            <div style={{ ...TT.bodySm, color: 'var(--text-secondary)', marginTop: 6, maxWidth: 620 }}>
              Ο συντομότερος δρόμος είναι το περσινό ποσό, παρακάτω. Είναι ακριβέστερο από κάθε
              υπολογισμό ζώνης και ορόφου.
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ ...TT.label, color: 'var(--text-tertiary)', marginBottom: 8 }}>ΕΝΦΙΑ τον χρόνο</div>
                <div style={{ ...TT.display }}>{fe(inUse.annual)}</div>
              </div>
              <div>
                <div style={{ ...TT.label, color: 'var(--text-tertiary)', marginBottom: 8 }}>Να βάζεις στην άκρη</div>
                <div style={{ ...TT.display }}>{fe(inUse.monthly)}</div>
                <div style={{ ...TT.caption, marginTop: 4 }}>τον μήνα</div>
              </div>
              <span style={{ ...TT.label, fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.pill, padding: '4px 12px' }}>
                {SOURCE_LABEL[inUse.source]}
              </span>
            </div>
            <div style={{ ...TT.bodySm, color: 'var(--text-secondary)', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-subtle)', maxWidth: 720 }}>
              {SOURCE_NOTE[inUse.source]}
            </div>
            {/* ΤΟ ΠΛΗΘΟΣ ΤΩΝ ΔΟΣΕΩΝ ΔΕΝ ΓΡΑΦΕΤΑΙ ΩΣ ΒΕΒΑΙΟΤΗΤΑ. Άλλαξε τρεις
                φορές την τελευταία δεκαετία και η ίδια η εφαρμογή το έλεγε με
                τρία διαφορετικά νούμερα σε τρία σημεία. Οι ημερομηνίες ζουν στο
                φορολογικό ημερολόγιο, όπου φέρουν και την επιφύλαξή τους. */}
            <div style={{ ...TT.caption, marginTop: 8, maxWidth: 720 }}>
              Το πόσες δόσεις ορίζονται και πότε λήγει η καθεμία αλλάζει ανά έτος και το κρατά το Ημερολόγιο.
            </div>
          </>
        )}
      </div>

      {/* ── ΑΠΟ ΠΟΥ ΒΓΑΙΝΕΙ: ΜΙΑ ΚΑΡΤΑ, ΤΡΙΑ ΠΛΑΚΙΔΙΑ ───────────────────────
          Η σειρά των πλακιδίων ΕΙΝΑΙ η σειρά προτεραιότητας, οπότε το «ποιο
          νικά» διαβάζεται από αριστερά προς τα δεξιά χωρίς να γραφτεί. */}
      <div style={card}>
        <SecHdr label="Από πού βγαίνει"
          sub="Τρεις δρόμοι για το ίδιο ποσό. Υπερισχύει ο πρώτος που έχει νούμερο."/>
        <div className="route-row">
          {ROUTES.map(r => (
            <RouteTile key={r} route={r} value={routeValue[r]} inUse={inUse.source === r}
              active={activeRoute === r} onSelect={() => setRoute(r)}/>
          ))}
        </div>
        <div style={{ ...TT.bodySm, color: 'var(--text-secondary)', marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-subtle)', maxWidth: 720 }}>
          {ROUTE_HELP[activeRoute]}
          {/* Η ΜΟΝΗ ΠΡΟΤΑΣΗ ΠΟΥ ΧΡΕΙΑΖΕΤΑΙ Η ΙΕΡΑΡΧΙΑ, ΚΑΙ ΜΟΝΟ ΟΤΑΝ ΧΡΕΙΑΖΕΤΑΙ.
              Δύο γεμάτοι δρόμοι ταυτόχρονα είναι η στιγμή που ο ιδιοκτήτης
              απορεί ποιο ποσό μετράει. Αν ο δρόμος που κοιτάζει είναι κενός,
              το λέει ήδη το πλακίδιό του και δεν ξαναλέγεται εδώ. */}
          {routeValue[activeRoute] > 0 && inUse.source !== activeRoute && (
            <> Δεν είναι αυτός ο δρόμος σε χρήση· κρατιέται για σύγκριση.</>
          )}
        </div>

        <div style={{ marginTop: 16 }}>
        {activeRoute === 'lastYear' && (<>
          <div style={g2}>
            <NumberInput label="Περσινός ΕΝΦΙΑ, σύνολο έτους" value={s.enfiaLastAnnual}
              onChange={v => upd({ enfiaLastAnnual: v })} suffix="€" step={10}/>
            <NumberInput label="Ποσό μίας δόσης" value={s.enfiaLastInstalment}
              onChange={v => upd({ enfiaLastInstalment: v })} suffix="€" step={5}/>
            <CustomSelect label="Σε πόσες δόσεις" value={s.enfiaLastCount}
              onChange={v => upd({ enfiaLastCount: v })} options={INSTALMENT_OPTIONS}/>
          </div>
          {lastYear > 0 && !s.enfiaLastAnnual && (
            <div style={{ ...TT.bodySm, color: 'var(--text-secondary)', marginTop: 12 }}>
              {s.enfiaLastCount === '1'
                ? `Εφάπαξ ${fe(lastYear)} τον χρόνο.`
                : `${s.enfiaLastCount} δόσεις επί ${fe(parseFloat(s.enfiaLastInstalment) || 0)} δίνουν ${fe(lastYear)} τον χρόνο.`}
            </div>
          )}
          {/* Η ΕΛΛΕΙΨΗ ΛΕΓΕΤΑΙ, ΔΕΝ ΚΑΛΥΠΤΕΤΑΙ ΜΕ ΥΠΟΘΕΣΗ. Ποσό δόσης χωρίς
              πλήθος δόσεων δεν είναι ετήσιο ποσό. */}
          {!s.enfiaLastAnnual && parseFloat(s.enfiaLastInstalment) > 0 && !s.enfiaLastCount && (
            <div style={{ ...TT.bodySm, color: 'var(--text-secondary)', marginTop: 12 }}>
              Διάλεξε σε πόσες δόσεις πληρώθηκε, για να βγει το ετήσιο ποσό.
            </div>
          )}
        </>)}

        {activeRoute === 'declared' && (<>
          <div style={g2}>
            <NumberInput label="Φετινός ΕΝΦΙΑ, σύνολο έτους" value={s.enfiaAnnual}
              onChange={v => upd({ enfiaAnnual: v, enfiaMonthly: v ? String(((parseFloat(v) || 0) / 12).toFixed(2)) : '' })}
              suffix="€" step={10}/>
          </div>
        </>)}

        {activeRoute === 'estimate' && (<>
          <div style={g2}>
            <NumberInput label="Εμβαδόν" value={s.enfiaSqm} onChange={v => upd({ enfiaSqm: v })} suffix="τ.μ."/>
            <NumberInput label="Ποσοστό ιδιοκτησίας" value={s.enfiaOwnership} onChange={v => upd({ enfiaOwnership: v })} suffix="%" max={100}/>
          </div>
          <div style={{ ...g2, marginTop: 14 }}>
            <CustomSelect label="Τιμή ζώνης" value={s.enfiaZone} onChange={v => upd({ enfiaZone: v })} options={ZONE_OPTIONS}/>
            <CustomSelect label="Όροφος" value={s.enfiaFloor} onChange={v => upd({ enfiaFloor: v })} options={FLOOR_OPTIONS}/>
            <CustomSelect label="Παλαιότητα" value={s.enfiaAge} onChange={v => upd({ enfiaAge: v })} options={AGE_OPTIONS}/>
          </div>
          <div style={{ ...g2, marginTop: 14 }}>
            <NumberInput label="Συνολική αξία όλων των ακινήτων" value={s.enfiaTotalVal} onChange={v => upd({ enfiaTotalVal: v })} suffix="€"
              labelInfo="Από αυτήν εξαρτάται η αυτόματη μείωση και η προσαύξηση πάνω από τις 500.000 €."/>
            <NumberInput label="Αντικειμενική αξία αυτού του ακινήτου" value={s.enfiaPropVal} onChange={v => upd({ enfiaPropVal: v })} suffix="€"
              labelInfo="Πρόσθετος φόρος επιβάλλεται όταν η αξία του ενός ακινήτου ξεπερνά τις 400.000 €."/>
          </div>

          {insured && !(s.enfiaReductions || []).includes('insurance') && (
            <div style={{ marginTop: 18, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: T.radius.inner, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <span style={{ ...TT.bodySm, color: 'var(--text-secondary)', flex: 1, minWidth: 240 }}>
                Το ασφαλιστήριό σου καλύπτει φυσικές καταστροφές, άρα δικαιούσαι μείωση ΕΝΦΙΑ. Δεν εφαρμόζεται μόνη της.
              </span>
              <button type="button" onClick={() => toggleReduction('insurance')}
                style={{ height: T.h.sm, padding: '0 16px', borderRadius: T.radius.pill, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 12, fontWeight: 700, fontFamily: T.font.sans, cursor: 'pointer' }}>
                Εφαρμογή
              </button>
            </div>
          )}

          <div style={{ ...TT.label, color: 'var(--text-secondary)', margin: '20px 0 8px' }}>Μειώσεις</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ENFIA_REDUCTIONS.map(r => {
              const active = (s.enfiaReductions || []).includes(r.key);
              return (
                <button key={r.key} type="button" onClick={() => toggleReduction(r.key)} aria-pressed={active}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', width: '100%',
                    textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                    background: active ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`,
                    borderRadius: T.radius.inner,
                    transition: 'background-color .15s, border-color .15s',
                  }}>
                  <span aria-hidden style={{ width: 16, height: 16, borderRadius: 5, flexShrink: 0, border: `2px solid ${active ? 'var(--accent)' : 'var(--border-default)'}`, background: active ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {active && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ ...TT.bodySm, color: 'var(--text-primary)', fontWeight: active ? 600 : 400, display: 'block' }}>{r.label}</span>
                    <span style={{ ...TT.caption, display: 'block', marginTop: 2 }}>{r.note}</span>
                  </span>
                  <span style={{ ...TT.figure, fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 }}>{fp(r.pct)}</span>
                </button>
              );
            })}
          </div>

          {est ? (
            <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
              {[
                { label: 'Κύριος φόρος κτισμάτων', val: est.basic },
                ...(est.extra > 0 ? [{ label: 'Πρόσθετος φόρος, αξία πάνω από 400.000 €', val: est.extra }] : []),
                ...(est.supplementary > 0 ? [{ label: 'Προσαύξηση, συνολική αξία πάνω από 500.000 €', val: est.supplementary }] : []),
                ...(est.reductionAmount > 0 ? [{ label: `Μειώσεις ${fp(est.reductionPct)}`, val: -est.reductionAmount }] : []),
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ ...TT.bodySm, color: 'var(--text-secondary)' }}>{row.label}</span>
                  <span style={{ ...TT.figure, fontSize: 12 }}>{fe(row.val)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingTop: 12 }}>
                <span style={{ ...TT.bodySm, fontWeight: 700, color: 'var(--text-primary)' }}>Εκτίμηση ΕΝΦΙΑ</span>
                <span style={{ ...TT.kpi, fontSize: 20 }}>{fe(est.annual)}</span>
              </div>
            </div>
          ) : (
            <div style={{ ...TT.bodySm, color: 'var(--text-secondary)', marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
              Χρειάζονται εμβαδόν και τιμή ζώνης. Το εμβαδόν το βρίσκεις στο Ε9 σου, την τιμή ζώνης στον χάρτη αντικειμενικών αξιών.
            </div>
          )}
        </>)}
        </div>
      </div>
    </div>
  );
}
