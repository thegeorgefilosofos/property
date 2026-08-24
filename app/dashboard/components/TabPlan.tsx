'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ΑΞΙΟΠΟΙΗΣΗ — η οθόνη που απαντά σε ΜΙΑ ερώτηση: «τι κάνω τώρα με αυτό το
// ακίνητο;». Τέσσερις μορφές, μία για κάθε κατάσταση όπου η απάντηση δεν είναι
// προφανής: κενό, αμφισβητούμενο, προς πώληση, ανακαίνιση. Στη μακροχρόνια και
// τη βραχυχρόνια μίσθωση δεν υπάρχει σχέδιο να φτιαχτεί — υπάρχει ενοίκιο να
// εισπραχθεί — και στην ιδιοχρησία δεν υπάρχει καν ερώτηση. Ποια κατάσταση
// δείχνει η καρτέλα το ορίζει το lib/property/visibility, όχι αυτό το αρχείο.
//
// ══ ΤΟ ΑΡΧΕΙΟ ΕΓΡΑΦΕ ΕΔΩ «ΚΑΜΙΑ ΚΑΡΤΑ, ΚΑΙ ΑΥΤΟ ΕΙΝΑΙ Η ΑΠΟΦΑΣΗ» ═══════════
// Η σκέψη ήταν ότι εδώ ο χρήστης δεν καταχωρεί, αποφασίζει, άρα η οθόνη πρέπει
// να είναι κείμενο και όχι εργαλείο. Το αποτέλεσμα όμως ήταν οι ΕΝΤΕΚΑ άλλες
// καρτέλες να μιλούν τη γλώσσα των επιφανειών της εφαρμογής (ανασηκωμένο φόντο,
// λεπτό περίγραμμα, βάθος) και η Αξιοποίηση να είναι η μόνη με γυμνό κείμενο
// πάνω στο φόντο της σελίδας. Δεν ήταν λιτότητα· ήταν ασυμφωνία, και φαινόταν.
//
// Πλέον κάθε ενότητα είναι `Card`, όπως παντού αλλού. Η λιτότητα δεν χάθηκε:
// ζει στο ΠΕΡΙΕΧΟΜΕΝΟ κάθε κάρτας, όχι στην απουσία της κάρτας.
//
// ══ ΤΡΕΙΣ ΚΑΝΟΝΕΣ ΠΟΥ ΚΡΑΤΟΥΝ ΟΛΗ ΤΗΝ ΟΘΟΝΗ ΣΤΟΙΧΙΣΜΕΝΗ ══════════════════
//
// 1. Η ΣΕΙΡΑ ΕΧΕΙ ΡΑΓΑ. Τα βήματα δεν είναι λίστα, είναι διαδρομή: μια λεπτή
//    κατακόρυφη γραμμή περνά μέσα από τα κουτάκια και τα δένει. Οι επιλογές και
//    τα προγράμματα ΔΕΝ έχουν ράγα, γιατί δεν είναι διαδρομή — η ίδια η γραμμή
//    είναι το σήμα «αυτό εδώ έχει σειρά».
//
// 2. ΚΑΘΕ ΓΡΑΜΜΗ ΕΧΕΙ ΤΙΣ ΙΔΙΕΣ ΣΤΗΛΕΣ. Ο τίτλος αριστερά, η ιδιότητα («Εσύ»,
//    «Μηχανικός», «Επιδότηση») σε ΔΙΚΗ ΤΗΣ στήλη στοιχισμένη δεξιά, το βελάκι
//    στο άκρο. Πριν, η ιδιότητα ακολουθούσε τον τίτλο: σε δώδεκα γραμμές με
//    δώδεκα διαφορετικά μήκη τίτλου, δώδεκα διαφορετικές θέσεις — και το μάτι
//    δεν μπορούσε να σαρώσει «ποιος κάνει τι» χωρίς να διαβάσει τα πάντα.
//
// 3. ΟΤΙ ΑΝΟΙΓΕΙ, ΑΝΟΙΓΕΙ ΜΕ ΤΟΝ ΙΔΙΟ ΤΡΟΠΟ: βελάκι στο δεξί άκρο, ένα ανοιχτό
//    τη φορά μέσα στην ίδια λίστα. Το επόμενο βήμα είναι ήδη ανοιχτό, και μόλις
//    το τσεκάρεις κλείνει και ανοίγει το αμέσως επόμενο. Οι ολοκληρωμένες ομάδες
//    διπλώνονται μόνες τους: η οθόνη μικραίνει όσο προχωράς.
//
// ΤΟ ΧΡΩΜΑ ΛΕΕΙ ΕΝΑ ΠΡΑΓΜΑ: «ΕΔΩ ΠΑΤΑΣ». Το μπλε εμφανίζεται μόνο στο κουτάκι
// που τσεκάρεις, όπως ακριβώς και στις Εργασίες. Καμία πράσινη επιβράβευση,
// κανένα πορτοκαλί σήμα: η πρόοδος είναι μέτρηση, όχι καλά νέα.
//
// ΤΙ ΚΡΑΤΑΕΙ ΑΥΤΟ ΤΟ ΑΡΧΕΙΟ ΚΑΙ ΤΙ ΟΧΙ
// Καμία γνώση. Όλο το περιεχόμενο και όλη η λογική ζουν στο `lib/property/plan`
// με tests. Εδώ μένει η παρουσίαση και η μνήμη του χρήστη (τι έχει τσεκάρει, τι
// είδος εκκρεμότητας δήλωσε, τι δεδομένα έβαλε) — τοπικά, ανά χρήστη και ανά
// ακίνητο, χωρίς να απαιτείται νέος πίνακας στη βάση.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { T, TT, Card, SecHdr, PageTitle, fixedCols, settingsField, feAuto, pageShell } from '@/components/Theme';
import { feSigned } from '@/lib/core/format';
import type { PropertyStatus } from '@/lib/property/status';
import {
  planFor, groupSteps, vacancyCost, renovationLoan, saleEstimate,
  ACTOR_LABEL, EFFORT_LABEL, RISK_LABEL, FUNDING_KIND_LABEL, DISPUTE_KINDS, PLAN_DISCLAIMER,
  type Step, type Option, type DisputeKind, type VacancyCostInput,
} from '@/lib/property/plan';

// Το ελάχιστο σχήμα ακινήτου που χρειάζεται η οθόνη. Μπαίνει ως παράμετρος τύπου
// ώστε να δέχεται και αντικείμενα με ΠΕΡΙΣΣΟΤΕΡΑ πεδία (η γραμμή της βάσης έχει
// δεκάδες) χωρίς μετατροπή στον καλούντα και χωρίς να αλλάζει το συμβόλαιο.
interface PlanProperty {
  id: string;
  name: string;
  address?: string | null;
  sqm?: number | null;
  value?: number | null;
  year_built?: number | null;
  postal_code?: string | null;
  prop_type?: string | null;
}

// Υποθέσεις ΜΟΝΟ για το μέγεθος της δόσης επισκευαστικού, δηλωμένες ρητά στην
// οθόνη δίπλα στον αριθμό. Δεν είναι προσφορά τράπεζας ούτε τρέχον επιτόκιο.
const ASSUMED_RATE_PCT = 6;
const ASSUMED_YEARS = 7;

// ── Μικρά δομικά στοιχεία της οθόνης ──────────────────────────────────────

/**
 * Μια ενότητα: κάρτα με επικεφαλίδα, όπως σε κάθε άλλη καρτέλα της εφαρμογής.
 *
 * Το εσωτερικό περιθώριο είναι 20 και οι γραμμές μέσα «ξεχειλίζουν» 12 προς τα
 * έξω (`ROW_BLEED`), ώστε το ανασηκωμένο φόντο μιας γραμμής να μη σφίγγει πάνω
 * στο κείμενό της. Το κείμενο μένει στοιχισμένο με την επικεφαλίδα.
 */
function Panel({ label, sub, right, children }: {
  label: string; sub?: string; right?: ReactNode; children: ReactNode;
}) {
  return (
    <Card pad="lg" gap={false} style={{ marginBottom: T.sp.lg }}>
      <SecHdr label={label} sub={sub} right={right} />
      {children}
    </Card>
  );
}

const ROW_BLEED: CSSProperties = { margin: '0 -12px', padding: '0 12px' };

/**
 * Γραμμή «ετικέτα: κείμενο», για τα μικρά μεταδεδομένα κάθε γραμμής.
 *
 * ΗΤΑΝ FLEX ΜΕ ΔΥΟ ΕΛΑΧΙΣΤΑ ΠΛΑΤΗ, ΚΑΙ ΓΙ᾽ ΑΥΤΟ ΧΟΡΟΠΗΔΟΥΣΕ. Η ετικέτα κρατούσε
 * 98 εικονοστοιχεία και το κείμενο ζητούσε 220: σε στενή στήλη το κείμενο έπεφτε
 * κάτω από την ετικέτα, σε φαρδιά έμενε δίπλα της — δηλαδή δύο διαφορετικές
 * διατάξεις στην ίδια οθόνη, ανάλογα με το πόσο μακρύ ήταν το κείμενο.
 *
 * Πλέγμα δύο στηλών: η ετικέτα έχει ΣΤΑΘΕΡΗ στήλη, το κείμενο ξεκινά πάντα από
 * το ίδιο σημείο, και οι δύο σειρές («Πού», «Γιατί αλλάζει») στοιχίζονται μεταξύ
 * τους. Σε κινητό η στήλη χάνεται και οι δύο σειρές πέφτουν η μία κάτω από την
 * άλλη — αλλά το κάνουν ΠΑΝΤΑ, όχι πότε ναι και πότε όχι.
 */
function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 104px) minmax(0, 1fr)', gap: '0 10px', marginTop: 7, alignItems: 'baseline' }}>
      <span style={{ ...TT.label, fontSize: 11, color: 'var(--text-tertiary)' }}>{label}</span>
      <span style={{ ...TT.caption, color: 'var(--text-secondary)' }}>{children}</span>
    </div>
  );
}

/**
 * Η στήλη της ιδιότητας: ποιος το κάνει, τι είδους χρήμα είναι.
 *
 * ΤΟ ΠΛΑΤΟΣ ΤΗΣ ΒΓΑΙΝΕΙ ΑΠΟ ΤΗ ΜΑΚΡΥΤΕΡΗ ΛΕΞΗ, ΟΧΙ ΑΠΟ ΤΟ ΜΑΤΙ. Το
 * «ΣΥΜΒΟΛΑΙΟΓΡΑΦΟΣ» είναι μία λέξη: δεν σπάει πουθενά, οπότε σε στενότερη στήλη
 * δεν αναδιπλώνεται — ξεχειλίζει προς τα αριστερά και πέφτει πάνω στον τίτλο.
 * Οι δύο πλάτη (116 για πρόσωπα, 150 για είδη χρηματοδότησης) ζουν στο φύλλο
 * στυλ μαζί με το ερώτημα μέσων που τα καταργεί σε κινητό.
 */
const Tag = ({ children }: { children: ReactNode }) => (
  <span className="plan-tag" style={{ ...TT.label, fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.3 }}>
    {children}
  </span>
);

/** Το βελάκι της αποκάλυψης. Ένα σχήμα, μία θέση: δεξί άκρο, σε κάθε λίστα. */
const Caret = ({ open }: { open: boolean }) => (
  <ChevronRight aria-hidden size={15} style={{
    flexShrink: 0, color: 'var(--text-tertiary)',
    transform: open ? 'rotate(90deg)' : 'none',
    transition: `transform .18s ${T.ease.standard}`,
  }} />
);

/**
 * Η γραμμή που ανοίγει: ένα κουμπί σε όλο το πλάτος.
 *
 * ΟΛΟΚΛΗΡΗ Η ΓΡΑΜΜΗ ΕΙΝΑΙ Ο ΣΤΟΧΟΣ, όχι το βελάκι. Ένα βελάκι δεκαπέντε
 * εικονοστοιχείων είναι στόχος για ποντίκι σε γραφείο, όχι για δάχτυλο σε
 * κινητό — και η γραμμή είναι ούτως ή άλλως εκεί.
 */
function RowToggle({ open, onClick, label, dim, tag, wide, children }: {
  open: boolean; onClick: () => void; label: string; dim?: boolean; tag?: ReactNode; wide?: boolean; children: ReactNode;
}) {
  const shape = !tag ? 'plan-row-bare' : wide ? 'plan-row-wide' : '';
  return (
    <button type="button" onClick={onClick} aria-expanded={open} aria-label={label}
      className={`acc-toggle plan-row ${shape}`}
      style={{
        padding: '12px 0', background: 'none', border: 'none', cursor: 'pointer',
        textAlign: 'left', fontFamily: T.font.sans, opacity: dim ? 0.5 : 1, transition: 'opacity .15s',
      }}>
      <span style={{ minWidth: 0 }}>{children}</span>
      {tag}
      <span className="plan-caret" style={{ display: 'flex', justifyContent: 'flex-end' }}><Caret open={open} /></span>
    </button>
  );
}

/**
 * Το σώμα που αποκαλύπτεται.
 *
 * Η κίνηση είναι η ΥΠΑΡΧΟΥΣΑ `budget-rise` του φύλλου στυλ, όχι καινούργια: έξι
 * εικονοστοιχεία ανόδου με σβήσιμο. Ένα δεύτερο, «δικό μας» άνοιγμα θα έκανε την
 * ίδια χειρονομία να αισθάνεται αλλιώς σε δύο οθόνες. Και σε όποιον έχει ζητήσει
 * μειωμένη κίνηση, ο καθολικός κανόνας του globals.css τη μηδενίζει ήδη.
 */
function RowBody({ children }: { children: ReactNode }) {
  return <div className="budget-rise" style={{ paddingBottom: 16 }}>{children}</div>;
}

/**
 * ΤΟ ΙΔΙΟ ΧΕΙΡΙΣΤΗΡΙΟ ΜΕ ΤΙΣ ΕΡΓΑΣΙΕΣ, ΓΙΑΤΙ ΕΙΝΑΙ Η ΙΔΙΑ ΠΡΑΞΗ.
 *
 * Ήταν ΠΡΑΣΙΝΟ (`--positive`), ενώ το αντίστοιχο κουμπί των Εργασιών είναι ΜΠΛΕ:
 * δύο χρώματα για «το τσέκαρα», σε δύο οθόνες της ίδιας εφαρμογής. Και το
 * πράσινο έλεγε κάτι που δεν ισχύει — η μπάρα προόδου δίπλα του γεμίζει με το
 * χρώμα του κειμένου, γιατί η πρόοδος είναι μέτρηση, όχι καλά νέα.
 *
 * ΤΟ ΠΕΡΙΓΡΑΜΜΑ ΔΕΙΧΝΕΙ ΠΟΥ ΒΡΙΣΚΕΣΑΙ. Όλα τα άτσεκα κουτάκια είχαν το ίδιο
 * έντονο περίγραμμα, οπότε η ράγα ήταν δώδεκα ισοδύναμοι κρίκοι. Τώρα ο κρίκος
 * του επόμενου βήματος είναι ο μόνος με πλήρες περίγραμμα: η θέση σου στη
 * διαδρομή φαίνεται από ένα μέτρο απόσταση, χωρίς λέξη και χωρίς χρώμα.
 */
const Check = ({ on, next }: { on: boolean; next?: boolean }) => (
  <span aria-hidden style={{
    width: 20, height: 20, borderRadius: '50%', flexShrink: 0, boxSizing: 'border-box',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: on ? 'var(--accent)' : 'var(--surface-raised)',
    border: `2px solid ${on ? 'var(--accent)' : next ? 'var(--border-default)' : 'var(--border-subtle)'}`,
  }}>
    {on && (
      <svg width={10} height={10} viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3" fill="none" stroke="var(--text-inverse)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    )}
  </span>
);

/** Ήσυχο κουμπί κειμένου, για δεύτερες ενέργειες μέσα σε επικεφαλίδα. */
const quietBtn: CSSProperties = {
  appearance: 'none', background: 'none', border: 'none', padding: 0, cursor: 'pointer',
  fontFamily: T.font.sans, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
};

/** Χειριστήριο επιλογής ενός από λίγα: ίδιο σχήμα σε είδος εκκρεμότητας και σε μεσίτη. */
function Pick({ on, onClick, small, children }: { on: boolean; onClick: () => void; small?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      style={{
        appearance: 'none', cursor: 'pointer', height: small ? T.h.sm : T.h.md, padding: small ? '0 14px' : '0 16px',
        borderRadius: T.radius.pill, fontFamily: T.font.sans, fontSize: small ? 12 : 13,
        fontWeight: on ? 700 : 500,
        background: on ? 'var(--bg-elevated)' : 'transparent',
        border: `1px solid ${on ? 'var(--border-default)' : 'var(--border-subtle)'}`,
        color: on ? 'var(--text-primary)' : 'var(--text-secondary)',
        boxShadow: on ? 'var(--highlight-inset), var(--elev-1)' : 'none',
        transition: 'background .15s, color .15s',
      }}>
      {children}
    </button>
  );
}

/**
 * Πεδίο ποσού: ετικέτα, κουτί, και το ευρώ ΜΕΣΑ στο κουτί, δεξιά.
 *
 * Το σύμβολο δεν είναι διακόσμηση — είναι η μονάδα. Χωρίς αυτό, τέσσερα γυμνά
 * κουτιά δίπλα δίπλα («ΕΝΦΙΑ», «Κοινόχρηστα», «Πάγια», «Ασφάλιστρο») δεν λένε αν
 * περιμένουν ευρώ, μήνες ή ποσοστό. Το ίδιο σχήμα χρησιμοποιούν ήδη οι
 * Λογαριασμοί και το Καθολικό Δαπανών.
 */
function MoneyField({ label, hint, value, onChange }: {
  label: string; hint?: string; value: number | null | undefined; onChange: (v: number | undefined) => void;
}) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ ...TT.label, fontSize: 11, color: 'var(--text-tertiary)' }}>{label}</span>
      <span style={{ position: 'relative', display: 'block', marginTop: 6 }}>
        {/* ΤΟ placeholder ΗΤΑΝ «0» ΚΑΙ ΤΑ ΠΕΔΙΑ ΔΙΑΒΑΖΟΝΤΑΝ ΩΣ ΜΗΔΕΝΙΚΑ. Το ίδιο
            σφάλμα είχε ήδη βρεθεί στο ιστορικό κατανάλωσης του ρεύματος: κενή
            φόρμα που δηλώνει «ΕΝΦΙΑ μηδέν» δεν είναι κενή, είναι λάθος απάντηση.
            Το άγνωστο δεν γράφεται μηδέν. */}
        <input type="number" min={0} inputMode="decimal" className="po-field" placeholder=""
          value={value ?? ''}
          onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          style={{ ...settingsField, height: T.h.md, fontSize: 13, paddingRight: 30 }} />
        <span aria-hidden style={{
          position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)',
          fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.num, pointerEvents: 'none',
        }}>€</span>
      </span>
      {hint && <span style={{ ...TT.caption, color: 'var(--text-tertiary)', display: 'block', marginTop: 5 }}>{hint}</span>}
    </label>
  );
}

// ── Η ΜΝΗΜΗ ΤΟΥ ΧΡΗΣΤΗ ────────────────────────────────────────────────────
//
// Τι έχει τσεκάρει, τι είδος εκκρεμότητας δήλωσε, τι δεδομένα έβαλε. Τοπικά, ανά
// χρήστη και ανά ακίνητο: σε κοινό υπολογιστή τα βήματα του ενός δεν
// εμφανίζονται στον άλλον. Χωρίς τοπική αποθήκευση (ιδιωτική περιήγηση) η οθόνη
// δουλεύει κανονικά — απλώς δεν θυμάται. Δεν είναι λόγος να μη φορτώσει.

function readLocal<V>(key: string, fallback: V, valid: (v: unknown) => boolean): V {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return valid(parsed) ? (parsed as V) : fallback;
  } catch {
    return fallback;
  }
}

const writeLocal = (key: string, value: unknown): void => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* δες παραπάνω */ }
};

const isStringArray = (v: unknown): boolean => Array.isArray(v) && v.every(x => typeof x === 'string');
const isObject = (v: unknown): boolean => !!v && typeof v === 'object' && !Array.isArray(v);
const isKind = (v: unknown): boolean => DISPUTE_KINDS.some(k => k.key === v);

// ── Η καρτέλα ─────────────────────────────────────────────────────────────

/**
 * Το `key` δεν είναι διακοσμητικό: όταν αλλάξει χρήστης, ακίνητο ή κατάσταση,
 * ο πίνακας ξεκινά από την αρχή και ξαναδιαβάζει τη σωστή μνήμη, αντί να
 * κρατήσει τα τσεκαρισμένα του προηγούμενου ακινήτου.
 */
export default function TabPlan<P extends PlanProperty>(props: {
  propertyId: string;
  userId: string;
  status: PropertyStatus;
  property: P;
}) {
  return <PlanScreen key={`${props.userId}:${props.propertyId}:${props.status}`} {...props} />;
}

function PlanScreen<P extends PlanProperty>({ propertyId, userId, status, property }: {
  propertyId: string;
  userId: string;
  status: PropertyStatus;
  property: P;
}) {
  const base = `pos-plan-${userId}-${propertyId}`;
  const doneKey = `${base}-done-${status}`;
  const kindKey = `${base}-kind`;
  const costKey = `${base}-cost`;

  const [done, setDone] = useState<string[]>(() => readLocal<string[]>(doneKey, [], isStringArray));
  const [kind, setKind] = useState<DisputeKind>(() => readLocal<DisputeKind>(kindKey, 'unknown', isKind));
  const [costs, setCosts] = useState<VacancyCostInput>(() => readLocal<VacancyCostInput>(costKey, {}, isObject));
  const [loanAmount, setLoanAmount] = useState<number | null>(null);
  // ΤΟ «ΚΑΘΑΡΟ ΕΣΟΔΟ» ΧΡΕΩΝΕ ΠΑΝΤΑ ΜΕΣΙΤΗ, ΧΩΡΙΣ ΝΑ ΤΟ ΛΕΕΙ. Η `saleEstimate`
  // δέχεται `useAgent` με προεπιλογή «ναι», και καλούνταν χωρίς όρισμα. Στην
  // ίδια οθόνη ο χρήστης καλείται να διαλέξει ΑΚΡΙΒΩΣ ΑΥΤΟ: «Με μεσίτη» ή «Μόνος
  // σου». Του δείχναμε το καθαρό ποσό της μίας επιλογής και το παρουσιάζαμε ως
  // το καθαρό ποσό της πώλησης. Τώρα το νούμερο ακολουθεί την επιλογή.
  const [useAgent, setUseAgent] = useState(true);

  // ── ΤΙ ΕΙΝΑΙ ΑΝΟΙΧΤΟ ─────────────────────────────────────────────────────
  // `undefined` σημαίνει «ακολούθησε το επόμενο βήμα» — δηλαδή η οθόνη ανοίγει
  // μόνη της εκεί που πρέπει και ξανακλείνει μόλις τελειώσεις. `null` σημαίνει
  // «τα έκλεισε ο χρήστης όλα» και το σέβεται. Καμία επίδραση, κανένας
  // συγχρονισμός: η τιμή προκύπτει τη στιγμή της απόδοσης.
  const [openStep, setOpenStep] = useState<string | null | undefined>(undefined);
  // Ρητή επιλογή του χρήστη ανά ομάδα. Χωρίς εγγραφή, η ομάδα ακολουθεί τον
  // κανόνα: όσο έχει ανοιχτά βήματα μένει ανοιχτή, όταν τελειώσει διπλώνεται.
  const [shutGroups, setShutGroups] = useState<Record<string, boolean>>({});
  const [openFund, setOpenFund] = useState<string | null>(null);
  const [openOption, setOpenOption] = useState<string | null>(null);
  const [refOpen, setRefOpen] = useState(false);
  const [openRef, setOpenRef] = useState<string | null>(null);
  // ΤΑ ΠΕΔΙΑ ΤΟΥ ΚΕΝΟΥ ΜΑΖΕΥΟΝΤΑΝ ΚΑΤΩ ΑΠΟ ΤΑ ΔΑΧΤΥΛΑ ΤΟΥ ΧΡΗΣΤΗ. Η κατάσταση
  // υπολογιζόταν από το τρέχον σύνολο («υπάρχει νούμερο, άρα κλείσε»), οπότε με
  // το που έμπαινε ο ΕΝΦΙΑ — πρώτο από τα τέσσερα πεδία — η φόρμα εξαφανιζόταν
  // και τα άλλα τρία δεν συμπληρώνονταν ποτέ. Το κριτήριο είναι «τι ήξερε η
  // οθόνη ΟΤΑΝ ΑΝΟΙΞΕ»: όποιος ξαναμπαίνει με συμπληρωμένα δεδομένα βλέπει το
  // αποτέλεσμα, όποιος τα γράφει τώρα δεν χάνει τη φόρμα από μπροστά του.
  const [costsOpen, setCostsOpen] = useState(() => vacancyCost(costs).monthly === 0);

  const write = useCallback((key: string, value: unknown) => { writeLocal(key, value); }, []);

  const toggle = useCallback((id: string) => {
    setDone(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      write(doneKey, next);
      return next;
    });
    // Τσέκαρες: η οθόνη επιστρέφει στην αυτόματη συμπεριφορά και ανοίγει το
    // αμέσως επόμενο βήμα. Χωρίς αυτό, ο χρήστης κλείνει ένα και ψάχνει το άλλο.
    setOpenStep(undefined);
  }, [doneKey, write]);

  const pickKind = useCallback((k: DisputeKind) => {
    setKind(k);
    write(kindKey, k);
  }, [kindKey, write]);

  const setCost = useCallback((field: keyof VacancyCostInput, v: number | undefined) => {
    setCosts(prev => {
      const next = { ...prev, [field]: v };
      write(costKey, next);
      return next;
    });
  }, [costKey, write]);

  const plan = useMemo(() => planFor({
    status, done, disputeKind: kind,
    sqm: property.sqm ?? null,
    value: property.value ?? null,
    yearBuilt: property.year_built ?? null,
  }), [status, done, kind, property.sqm, property.value, property.year_built]);

  const drain = useMemo(() => vacancyCost(costs), [costs]);
  const sale = useMemo(() => saleEstimate(property.value ?? 0, { useAgent }), [property.value, useAgent]);
  // Ενδεικτική δόση επισκευαστικού: το τοκοχρεολύσιο έρχεται από το lib/loans και
  // το επιτόκιο δηλώνεται ρητά ως υπόθεση, ακριβώς κάτω από τον αριθμό.
  const loan = useMemo(() => renovationLoan(loanAmount ?? 0, ASSUMED_RATE_PCT, ASSUMED_YEARS), [loanAmount]);

  // Καρτέλα που δεν αφορά αυτή την κατάσταση δεν πρέπει να είναι ορατή (το κρίνει
  // το lib/property/visibility). Αν παρ' όλα αυτά αποδοθεί, δεν σκάει και δεν
  // επινοεί περιεχόμενο.
  if (!plan) return null;

  const checked = new Set(done);
  const isDispute = plan.status === 'disputed';
  const groups = groupSteps(plan.steps);
  const hasGroups = groups.some(g => g.group);
  const openStepId = openStep === undefined ? plan.next?.id ?? null : openStep;

  /**
   * Ένα βήμα πάνω στη ράγα.
   *
   * Η ράγα είναι δύο κομμάτια γραμμής μέσα στην πρώτη στήλη: ένα κοντό από πάνω
   * (μόνο αν υπάρχει προηγούμενο βήμα) και ένα που τεντώνεται ως το κάτω άκρο
   * της γραμμής (μόνο αν υπάρχει επόμενο). Έτσι δεν σπάει όταν το βήμα ανοίγει
   * και ψηλώνει, και δεν προεξέχει στο πρώτο και στο τελευταίο.
   */
  const stepRow = (s: Step, first: boolean, last: boolean) => {
    const on = checked.has(s.id);
    const isNext = plan.next?.id === s.id;
    const open = openStepId === s.id;
    const rail: CSSProperties = { width: 1, background: 'var(--border-subtle)' };
    return (
      <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '20px minmax(0, 1fr)', gap: 14, alignItems: 'stretch' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ ...rail, height: 12, opacity: first ? 0 : 1 }} />
          <button type="button" onClick={() => toggle(s.id)} aria-pressed={on}
            aria-label={on ? `Αναίρεση: ${s.title}` : `Ολοκληρώθηκε: ${s.title}`}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 0 }}>
            <Check on={on} next={isNext} />
          </button>
          <div style={{ ...rail, flex: 1, opacity: last ? 0 : 1 }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <RowToggle open={open} dim={on} label={s.title} tag={<Tag>{ACTOR_LABEL[s.who]}</Tag>}
            onClick={() => setOpenStep(open ? null : s.id)}>
            {/* Η λέξη μπαίνει ΠΑΝΩ από τον τίτλο και όχι δίπλα του: δίπλα θα
                διεκδικούσε τη στήλη της ιδιότητας, που είναι η μόνη άλλη στήλη
                της γραμμής και έχει ήδη δουλειά. */}
            {isNext && !on && <span style={{ ...TT.label, fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Το επόμενο</span>}
            <span style={{
              fontFamily: T.font.sans, fontSize: 14, fontWeight: 600, lineHeight: 1.35,
              color: 'var(--text-primary)', textDecoration: on ? 'line-through' : 'none',
            }}>{s.title}</span>
          </RowToggle>
          {open && (
            <RowBody>
              <div style={{ ...TT.bodySm, color: 'var(--text-secondary)', marginTop: -4 }}>{s.detail}</div>
              {s.when && <Meta label="Πότε">{s.when}</Meta>}
              {s.cost && <Meta label="Αν παραλειφθεί">{s.cost}</Meta>}
            </RowBody>
          )}
        </div>
      </div>
    );
  };

  const optionRow = (o: Option, first: boolean) => {
    const open = openOption === o.id;
    return (
      <div key={o.id} style={{ borderTop: first ? 'none' : '1px solid var(--border-subtle)', paddingBottom: open ? 0 : 14 }}>
        <RowToggle open={open} label={o.title} onClick={() => setOpenOption(open ? null : o.id)}>
          <span style={{ fontFamily: T.font.sans, fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>{o.title}</span>
        </RowToggle>
        <div style={{ ...TT.bodySm, color: 'var(--text-secondary)', marginTop: -4 }}>{o.payoff}</div>
        {/* ── Η ΣΥΓΚΡΙΣΗ ΠΟΥ ΔΕΝ ΜΠΟΡΟΥΣΕ ΝΑ ΓΙΝΕΙ ──────────────────────────
            Οι τρεις άξονες ήταν πλέγμα τριών στηλών ύψους σαράντα
            εικονοστοιχείων, με την ετικέτα πάνω και την τιμή από κάτω. Σε επτά
            επιλογές, η μία κάτω από την άλλη, το «Ρίσκο» της τρίτης απείχε πάνω
            από τετρακόσια εικονοστοιχεία από το «Ρίσκο» της δεύτερης — δηλαδή
            μια οθόνη σύγκρισης όπου η σύγκριση απαιτούσε να θυμάσαι τρεις λέξεις
            ενώ κυλάς.

            Τώρα οι τρεις άξονες είναι ΜΙΑ γραμμή, στην ίδια θέση σε κάθε
            επιλογή, και μένουν ΠΑΝΤΑ ορατοί: είναι το μόνο που συγκρίνεται
            μεταξύ γραμμών, οπότε δεν κρύβεται πίσω από άνοιγμα. */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 16px',
          marginTop: 9, fontFamily: T.font.sans, fontSize: 12, color: 'var(--text-primary)',
        }}>
          {[
            { k: 'Κόπος', v: EFFORT_LABEL[o.effort] },
            { k: 'Ρίσκο', v: RISK_LABEL[o.risk] },
            { k: 'Χρόνος', v: o.speed },
          ].map(x => (
            <span key={x.k} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ ...TT.label, fontSize: 11, color: 'var(--text-tertiary)' }}>{x.k}</span>
              <span style={{ fontWeight: 600 }}>{x.v}</span>
            </span>
          ))}
        </div>
        {open && (
          <RowBody>
            <Meta label="Ταιριάζει αν">{o.fits}</Meta>
            <Meta label="Τι πληρώνεις">{o.cost}</Meta>
          </RowBody>
        )}
      </div>
    );
  };

  return (
    <div style={pageShell(920)}>
      {/* ── Η ΚΕΦΑΛΙΔΑ ────────────────────────────────────────────────────
          ΗΤΑΝ ΔΥΟ ΚΕΦΑΛΙΔΕΣ, ΚΑΙ Η ΚΑΤΑΣΤΑΣΗ ΓΡΑΦΟΤΑΝ ΔΥΟ ΦΟΡΕΣ. Η σελίδα
          τύπωνε από πάνω «ΑΞΙΟΠΟΙΗΣΗ ΑΚΙΝΗΤΟΥ / Κενό· πώς θα μισθωθεί ή θα
          αξιοποιηθεί» και αμέσως μετά η καρτέλα τύπωνε «ΚΕΝΟ · Όνομα» και τον
          δικό της τίτλο: τέσσερα μπλοκ επικεφαλίδας στη σειρά, με τη λέξη
          «Κενό» δύο φορές μέσα σε εξήντα εικονοστοιχεία. Μία κεφαλίδα, από το
          κοινό PageTitle που χρησιμοποιούν οι άλλες έντεκα καρτέλες. */}
      <PageTitle over={`Αξιοποίηση · ${plan.label}`} title={plan.headline} lede={plan.lede} />

      {/* ── ΤΙ ΕΙΔΟΥΣ ΕΚΚΡΕΜΟΤΗΤΑ: αλλάζει ΟΛΗ τη σειρά, άρα ρωτιέται πρώτο ── */}
      {isDispute && (
        <Panel label="Τι είδους εκκρεμότητα είναι"
          sub={DISPUTE_KINDS.find(k => k.key === kind)?.hint}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {DISPUTE_KINDS.map(k => (
              <Pick key={k.key} on={k.key === kind} onClick={() => pickKind(k.key)}>{k.label}</Pick>
            ))}
          </div>
        </Panel>
      )}

      {/* ── ΤΟ ΝΟΥΜΕΡΟ ΤΟΥ ΚΕΝΟΥ: χωρίς αυτό, οι επιλογές μοιάζουν ίδιες ───
          ΤΑ ΤΕΣΣΕΡΑ ΠΕΔΙΑ ΜΕΝΟΥΝ ΑΝΟΙΧΤΑ ΟΣΟ ΔΕΝ ΕΧΟΥΝ ΑΠΑΝΤΗΣΗ. Μόλις υπάρχει
          νούμερο, η φόρμα δεν έχει τι άλλο να πει: μαζεύεται και μένει το
          αποτέλεσμα, που είναι και ο λόγος που ζητήθηκαν. */}
      {plan.status === 'vacant' && (
        <Panel label="Τι κοστίζει ο μήνας που περνάει"
          sub="Μόνο όσα φεύγουν από τον λογαριασμό σου. Το ενοίκιο που δεν εισπράττεις είναι άλλη συζήτηση."
          right={drain.monthly > 0
            ? <button type="button" style={quietBtn} onClick={() => setCostsOpen(o => !o)} aria-expanded={costsOpen}>
                {costsOpen ? 'Σύμπτυξη' : 'Αλλαγή δεδομένων'}
              </button>
            : undefined}>
          {costsOpen && (
            /* ΡΗΤΕΣ ΤΕΣΣΕΡΙΣ ΣΤΗΛΕΣ, ΟΧΙ auto-fit. Με ελάχιστο 170 το ίδιο
               πλέγμα έβγαζε τέσσερα πεδία στο 100% zoom και «τρία και ένα» στο
               125%: η ίδια οθόνη, άλλη διάταξη σε κάθε ρύθμιση περιηγητή. Το
               `fixedCols` είναι η μία απάντηση της εφαρμογής σε αυτό. Στοίχιση
               στην κορυφή: κάθε πεδίο κουβαλά υπόδειξη ΑΠΟ ΚΑΤΩ, οπότε το κάτω
               άκρο δεν είναι το κουτί. */
            <div {...fixedCols(4, 14, 'start')}>
              <MoneyField label="ΕΝΦΙΑ (έτος)" hint="Από το εκκαθαριστικό" value={costs.enfiaYear} onChange={v => setCost('enfiaYear', v)} />
              <MoneyField label="Κοινόχρηστα (μήνας)" hint="Ό,τι πληρώνεις κλειστό" value={costs.commonMonthly} onChange={v => setCost('commonMonthly', v)} />
              <MoneyField label="Πάγια ρεύμα/νερό (μήνας)" hint="Χωρίς κατανάλωση" value={costs.utilitiesMonthly} onChange={v => setCost('utilitiesMonthly', v)} />
              <MoneyField label="Ασφάλιστρο (έτος)" hint="Αν υπάρχει" value={costs.insuranceYear} onChange={v => setCost('insuranceYear', v)} />
            </div>
          )}
          {drain.monthly > 0 && (
            <div style={{ marginTop: costsOpen ? T.sp.xl : 0, paddingTop: costsOpen ? T.sp.lg : 0, borderTop: costsOpen ? '1px solid var(--border-subtle)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ ...TT.kpi }}>{feAuto(drain.monthly)}</span>
                <span style={{ ...TT.bodySm, color: 'var(--text-secondary)' }}>
                  κάθε μήνα που μένει κενό · {feAuto(drain.yearly)} τον χρόνο
                </span>
              </div>
              <div style={{ ...TT.caption, color: 'var(--text-tertiary)', marginTop: 8 }}>
                {drain.parts.map(p => `${p.label} ${feAuto(p.monthly)}`).join(' · ')}
              </div>
            </div>
          )}
        </Panel>
      )}

      {/* ── Η ΣΕΙΡΑ ──────────────────────────────────────────────────────
          Ο ΥΠΟΤΙΤΛΟΣ ΜΠΑΙΝΕΙ ΜΟΝΟ ΟΠΟΥ ΔΕΝ ΥΠΑΡΧΟΥΝ ΟΜΑΔΕΣ. Στην ανακαίνιση οι
          ίδιες οι ομάδες («Πριν ξεκινήσεις», «Πρώτα· χωρίς αυτά τίποτα δεν
          κρατάει», «Μετά· εδώ κρίνεται το ενοίκιο», «Τελευταία· το φαινόμενο»)
          ΕΙΝΑΙ η εξήγηση της σειράς. Μια πρόταση από πάνω που λέει «ό,τι είναι
          πιο πάνω εμποδίζει ό,τι είναι πιο κάτω» απλώς την επαναλαμβάνει. */}
      <Panel
        label="Η σειρά"
        sub={hasGroups ? undefined : isDispute
          ? 'Δεν είναι λίστα. Είναι ακολουθία, και η αντιστροφή δύο βημάτων κοστίζει χρήματα.'
          : 'Από πάνω προς κάτω. Ό,τι είναι πιο πάνω, εμποδίζει ό,τι είναι πιο κάτω.'}
        right={
          /* Η ΠΡΟΟΔΟΣ ΖΕΙ ΣΤΗΝ ΕΠΙΚΕΦΑΛΙΔΑ ΤΟΥ ΠΡΑΓΜΑΤΟΣ ΠΟΥ ΜΕΤΡΑΕΙ. Ήταν δικό
             της μπλοκ κάτω από την εισαγωγή, με δικό του περιθώριο: μια γραμμή
             τριών εικονοστοιχείων που κόστιζε εξήντα κατακόρυφα, και μετρούσε
             βήματα που εμφανίζονταν εκατόν πενήντα εικονοστοιχεία πιο κάτω.
             Στο μηδέν η μπάρα δεν σχεδιάζεται: άδειο αυλάκι δίπλα σε ένα «0 από
             12» δεν δείχνει πρόοδο, δείχνει ότι δεν υπάρχει. */
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {plan.progress.done > 0 && (
              <div style={{ width: 88, height: 3, borderRadius: 2, background: 'var(--border-subtle)', overflow: 'hidden' }}>
                <div style={{
                  width: `${plan.progress.pct}%`, height: '100%',
                  background: 'var(--text-primary)', transition: `width .3s ${T.ease.standard}`,
                }} />
              </div>
            )}
            <span style={{ ...TT.caption, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {plan.progress.done} από {plan.progress.total} ολοκληρωμένα
            </span>
          </div>
        }>
        {groups.map((g, gi) => {
          const doneHere = g.items.filter(s => checked.has(s.id)).length;
          const finished = doneHere === g.items.length;
          // Η ΟΘΟΝΗ ΜΙΚΡΑΙΝΕΙ ΟΣΟ ΠΡΟΧΩΡΑΣ. Μια ομάδα που τελείωσε δεν έχει τι
          // άλλο να πει: διπλώνεται σε μία γραμμή που κρατά το όνομα και τη
          // μέτρησή της, και η δουλειά που απομένει ανεβαίνει πιο ψηλά. Ένα
          // πάτημα την ξανανοίγει, και τότε μένει ανοιχτή όσο τη θέλει ο χρήστης.
          const shut = g.group ? shutGroups[g.group] ?? finished : false;
          return (
            <div key={g.group ?? `g${gi}`} style={{ marginTop: g.group && gi > 0 ? T.sp.lg : 0 }}>
              {g.group && (
                /* Η ομάδα κουβαλά και τη μέτρησή της: τέσσερα βήματα «πριν
                   ξεκινήσεις» με τα δύο τσεκαρισμένα είναι διαφορετική εικόνα
                   από τέσσερα άθικτα, χωρίς να μετρήσει κανείς κουτάκια. */
                <button type="button" className="acc-toggle" aria-expanded={!shut} aria-label={g.group}
                  onClick={() => setShutGroups(prev => ({ ...prev, [g.group as string]: !shut }))}
                  style={{
                    ...ROW_BLEED, display: 'flex', alignItems: 'center', gap: 10, width: 'calc(100% + 24px)',
                    textAlign: 'left', paddingTop: 6, paddingBottom: 8, cursor: 'pointer', background: 'none',
                    border: 'none', opacity: finished ? 0.5 : 1, transition: 'opacity .15s',
                  }}>
                  <span style={{ ...TT.label, fontSize: 11, color: 'var(--text-tertiary)', flex: 1, minWidth: 0 }}>{g.group}</span>
                  <span style={{ ...TT.caption, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                    {doneHere} από {g.items.length}
                  </span>
                  <Caret open={!shut} />
                </button>
              )}
              {!shut && g.items.map((s, i) => stepRow(s, i === 0, i === g.items.length - 1))}
            </div>
          );
        })}
        {!plan.next && (
          <div style={{ marginTop: T.sp.lg, paddingTop: T.sp.lg, borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ ...TT.h2 }}>Δεν μένει κάτι ανοιχτό.</div>
            <div style={{ ...TT.bodySm, color: 'var(--text-secondary)', marginTop: 6 }}>
              Πέρασες όλη τη σειρά. Αν άλλαξε κάτι στο ακίνητο, άλλαξε και την κατάστασή του: αυτή η καρτέλα
              υπάρχει για όσο διαρκεί η μεταβατική περίοδος, όχι για πάντα.
            </div>
          </div>
        )}
      </Panel>

      {/* ── Η ΣΥΓΚΡΙΣΗ ───────────────────────────────────────────────────── */}
      {plan.options.length > 0 && (
        <Panel label={plan.optionsTitle} sub={plan.optionsSub}>
          {plan.options.map((o, i) => optionRow(o, i === 0))}
        </Panel>
      )}

      {/* ── ΤΙ ΜΕΝΕΙ ΚΑΘΑΡΟ (πώληση, όταν υπάρχει καταχωρημένη αξία) ─────── */}
      {plan.status === 'for_sale' && sale && (
        <Panel label="Τι μένει καθαρό"
          sub={`Ενδεικτικά, με βάση την αξία που έχεις καταχωρήσει (${feAuto(sale.price)}).`}
          right={
            <div style={{ display: 'flex', gap: 6 }}>
              {[{ k: true, l: 'Με μεσίτη' }, { k: false, l: 'Μόνος σου' }].map(o => (
                <Pick key={o.l} small on={useAgent === o.k} onClick={() => setUseAgent(o.k)}>{o.l}</Pick>
              ))}
            </div>
          }>
          {sale.lines.map((l, i) => (
            <div key={l.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)' }}>
              <span style={{ ...TT.bodySm, color: 'var(--text-secondary)' }}>{l.label}</span>
              {/* Το λογιστικό μείον γραφόταν με το χέρι, δίπλα σε `feAuto`, ενώ το
                  `feSigned` υπάρχει στο `lib/core/format` ακριβώς γι’ αυτό, με δικό
                  του test — και δεν το καλούσε ΚΑΝΕΝΑ σημείο της εφαρμογής. Μια
                  συνάρτηση που κανείς δεν χρησιμοποιεί δεν φυλάει τίποτα. */}
              <span style={{ ...TT.mono, fontSize: 13, color: 'var(--text-primary)' }}>{feSigned(-l.amount)}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '14px 0 0', borderTop: '1px solid var(--border-default)', marginTop: 4 }}>
            <span style={{ fontFamily: T.font.sans, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Καθαρό έσοδο</span>
            <span style={{ ...TT.kpi, fontSize: 20 }}>{feAuto(sale.net)}</span>
          </div>
          <Meta label="Επιβεβαίωσε">{sale.note}</Meta>
        </Panel>
      )}

      {/* ── ΠΟΙΟΣ ΜΠΟΡΕΙ ΝΑ ΠΛΗΡΩΣΕΙ ΤΙ (ανακαίνιση) ─────────────────────
          ΠΕΝΤΕ ΠΡΟΓΡΑΜΜΑΤΑ ΜΕ ΤΙΣ ΕΠΙΦΥΛΑΞΕΙΣ ΤΟΥΣ ΑΝΟΙΧΤΕΣ ΗΤΑΝ ΤΕΤΡΑΚΟΣΙΕΣ
          ΛΕΞΕΙΣ. Και οι επιφυλάξεις λένε όλες την ίδια κουβέντα με άλλα λόγια
          («ορίζεται ανά κύκλο»), που τη λέει ήδη μία φορά ο υπότιτλος από πάνω.
          Κλειστά, οι πέντε γραμμές απαντούν στο μόνο που ρωτάει κάποιος που
          μόλις έμαθε ότι υπάρχουν: ποια είναι, και τι είδους χρήμα είναι. */}
      {plan.funding.length > 0 && (
        <Panel label="Ποιος μπορεί να πληρώσει τι"
          sub="Οι όροι κάθε προγράμματος αλλάζουν σε κάθε κύκλο, γι’ αυτό δεν γράφεται εδώ κανένα ποσοστό.">
          {plan.funding.map((f, i) => {
            const open = openFund === f.id;
            return (
              <div key={f.id} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)' }}>
                <RowToggle open={open} label={f.title} wide tag={<Tag>{FUNDING_KIND_LABEL[f.kind]}</Tag>}
                  onClick={() => setOpenFund(open ? null : f.id)}>
                  <span style={{ fontFamily: T.font.sans, fontSize: 14, fontWeight: 600, lineHeight: 1.35, color: 'var(--text-primary)' }}>{f.title}</span>
                </RowToggle>
                {open && (
                  <RowBody>
                    <div style={{ ...TT.bodySm, color: 'var(--text-secondary)', marginTop: -4 }}>{f.what}</div>
                    <Meta label="Επιβεβαίωσε">{f.confirm}</Meta>
                    {/* ΔΥΟ ΜΠΛΕ ΣΤΗΝ ΙΔΙΑ ΟΘΟΝΗ, ΚΑΙ ΤΟ ΕΝΑ ΕΙΧΕ ΔΗΛΩΣΕΙ ΑΠΟΚΛΕΙΣΤΙΚΟΤΗΤΑ.
                        Το σχόλιο στην κορυφή αυτού του αρχείου γράφει: «το μπλε εμφανίζεται
                        ΜΟΝΟ στην κύρια ενέργεια, ώστε το μάτι να ξέρει πάντα πού να πάει».
                        Και τέσσερις γραμμές πιο κάτω, ο σύνδεσμος του προγράμματος ήταν
                        `var(--info)` — άλλο μπλε, ίδια ένταση, σε ενότητα που δεν είναι
                        ενέργεια. Εδώ γίνεται αυτό που είναι: ήσυχος σύνδεσμος κειμένου. */}
                    {f.href && (
                      <a href={f.href} target="_blank" rel="noopener noreferrer"
                        style={{
                          display: 'inline-block', marginTop: 14, fontFamily: T.font.sans,
                          fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
                          textDecoration: 'none', borderBottom: '1px solid var(--border-default)',
                        }}>
                        Επίσημη σελίδα προγράμματος
                      </a>
                    )}
                  </RowBody>
                )}
              </div>
            );
          })}

          {/* ── Ο ΥΠΟΛΟΓΙΣΜΟΣ ΤΗΣ ΔΟΣΗΣ ───────────────────────────────────
              Ήταν ένα γυμνό κουτάκι κρεμασμένο κάτω από τη λίστα, με μια λεζάντα
              από κάτω. Τώρα είναι ένα ένθετο πλαίσιο με δύο πλευρές: αριστερά τι
              δίνεις, δεξιά τι βγαίνει. Το τοκοχρεολύσιο δεν ξαναγράφεται εδώ —
              έρχεται από το lib/loans, που είναι η πηγή αλήθειας για κάθε δόση. */}
          <div style={{
            marginTop: T.sp.xl, padding: 16, borderRadius: T.radius.inner,
            background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ width: 180 }}>
                <MoneyField label="Ποσό ανακαίνισης" value={loanAmount} onChange={v => setLoanAmount(v ?? null)} />
              </div>
              {loan && (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', paddingBottom: 2 }}>
                  <span style={{ ...TT.kpi, fontSize: 20 }}>{feAuto(loan.monthly)}</span>
                  <span style={{ ...TT.bodySm, color: 'var(--text-secondary)' }}>
                    τον μήνα για {ASSUMED_YEARS} έτη · συνολικοί τόκοι {feAuto(loan.interest)}
                  </span>
                </div>
              )}
            </div>
            <div style={{ ...TT.caption, color: 'var(--text-tertiary)', marginTop: 12 }}>
              Ενδεικτική δόση επισκευαστικού με υποθετικό επιτόκιο {ASSUMED_RATE_PCT}% σε {ASSUMED_YEARS} έτη.
              Τα σημερινά επιτόκια και τα έξοδα συγκρίνονται στην καρτέλα Δάνειο.
            </div>
          </div>
        </Panel>
      )}

      {/* ═══ ΑΝΑΦΟΡΑ ══════════════════════════════════════════════════════
          ΗΤΑΝ ΔΥΟ ΑΚΟΜΗ ΕΝΟΤΗΤΕΣ ΜΕ ΤΟ ΙΔΙΟ ΑΚΡΙΒΩΣ ΥΦΟΣ, ΑΝΟΙΧΤΕΣ, ΣΤΟ ΤΕΛΟΣ.
          «Οι κανόνες» και «Προς επιβεβαίωση»: ίδια ετικέτα, ίδια λεπτή γραμμή,
          ίδιες σειρές κειμένου με τις τρεις από πάνω. Όταν όλα μοιάζουν εξίσου
          σημαντικά, τίποτα δεν είναι — και ο χρήστης κάνει το μόνο λογικό: κυλά
          μέχρι κάτω χωρίς να διαβάσει. Καμία από τις δύο δεν ζητά ενέργεια:
          είναι υλικό αναφοράς, μία γραμμή που ανοίγει. */}
      <Card pad="lg" gap={false} style={{ marginBottom: T.sp.lg }}>
        <RowToggle open={refOpen} label="Αναφορά" onClick={() => setRefOpen(o => !o)}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ ...TT.label, fontSize: 11, color: 'var(--text-secondary)' }}>Αναφορά</span>
            <span style={{ ...TT.caption, color: 'var(--text-tertiary)' }}>
              Κανόνες που κοστίζουν χρήματα, και όσα αλλάζουν από χρονιά σε χρονιά.
            </span>
          </span>
        </RowToggle>

        {refOpen && (
          /* ΔΥΟ ΣΤΗΛΕΣ ΔΕΝ ΖΥΓΙΖΟΝΤΑΙ ΠΟΤΕ, ΓΙΑΤΙ ΤΟ ΠΕΡΙΕΧΟΜΕΝΟ ΤΟΥΣ ΔΕΝ ΕΙΝΑΙ
             ΙΣΟ. Τέσσερις κανόνες με παραγράφους αριστερά, τρία ερωτήματα με από
             δύο απαντήσεις δεξιά: η μία στήλη τελείωνε τριακόσια εικονοστοιχεία
             πριν την άλλη, και καμία από τις δύο δεν έφτανε στην άκρη της κάρτας.
             Το πλέγμα δεν διορθώνεται με ρυθμίσεις — αφαιρείται.

             Μία στήλη σε όλο το πλάτος, και το ίδιο χειριστήριο με ΟΛΗ την
             υπόλοιπη οθόνη: τίτλος που ανοίγει. Κλειστά, οι επτά γραμμές λένε τι
             υπάρχει· ανοιχτή, η μία που ρώτησες λέει τα πάντα. Οκτακόσιες λέξεις
             ανοιχτές ταυτόχρονα δεν είναι πληρότητα, είναι θόρυβος. */
          <div className="budget-rise" style={{ paddingTop: T.sp.md, marginTop: 2, borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ ...TT.label, fontSize: 11, color: 'var(--text-tertiary)', paddingBottom: 6, marginBottom: 2, borderBottom: '1px solid var(--border-subtle)' }}>
              Οι κανόνες που κοστίζουν χρήματα
            </div>
            {plan.rules.map(r => {
              const open = openRef === r.id;
              return (
                <div key={r.id}>
                  <RowToggle open={open} label={r.title} onClick={() => setOpenRef(open ? null : r.id)}>
                    <span style={{ fontFamily: T.font.sans, fontSize: 14, fontWeight: 600, lineHeight: 1.35, color: 'var(--text-primary)' }}>{r.title}</span>
                  </RowToggle>
                  {open && <RowBody><div style={{ ...TT.bodySm, color: 'var(--text-secondary)', marginTop: -4 }}>{r.body}</div></RowBody>}
                </div>
              );
            })}

            {/* ΤΟ ΠΟΡΤΟΚΑΛΙ ΣΗΜΑ ΜΕ ΤΟ «3» ΕΦΥΓΕ. Ένα γυμνό «3» δεν λέει καν
                τρία τι, και ήταν γραμμένο στο χρώμα που η εφαρμογή κρατά για
                εκκρεμότητες — σε ενότητα που ρητά δεν ζητά καμία ενέργεια. */}
            <div style={{ ...TT.label, fontSize: 11, color: 'var(--text-tertiary)', paddingBottom: 6, marginTop: T.sp.lg, marginBottom: 2, borderBottom: '1px solid var(--border-subtle)' }}>
              Προς επιβεβαίωση
            </div>
            {plan.verify.map(v => {
              const open = openRef === v.id;
              return (
                <div key={v.id}>
                  {/* ΔΕΝ ΕΙΝΑΙ ΤΙΤΛΟΣ, ΕΙΝΑΙ ΕΡΩΤΗΜΑ, και γι᾽ αυτό δεν φοράει το
                      βάρος του τίτλου κανόνα από πάνω: μια ερώτηση δύο σειρών σε
                      14/600 διαβάζεται σαν κραυγή. */}
                  <RowToggle open={open} label={v.what} onClick={() => setOpenRef(open ? null : v.id)}>
                    <span style={{ ...TT.body, color: 'var(--text-primary)' }}>{v.what}</span>
                  </RowToggle>
                  {open && (
                    <RowBody>
                      <Meta label="Πού">{v.where}</Meta>
                      <Meta label="Γιατί αλλάζει">{v.why}</Meta>
                    </RowBody>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <p style={{ ...TT.caption, color: 'var(--text-tertiary)', margin: 0, padding: '0 2px' }}>
        {PLAN_DISCLAIMER}
      </p>
    </div>
  );
}
