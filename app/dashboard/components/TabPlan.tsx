'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ΑΞΙΟΠΟΙΗΣΗ — η οθόνη που απαντά σε ΜΙΑ ερώτηση: «τι κάνω τώρα με αυτό το
// ακίνητο;». Τέσσερις μορφές, μία για κάθε κατάσταση όπου η απάντηση δεν είναι
// προφανής: κενό, αμφισβητούμενο, προς πώληση, ανακαίνιση. Στη μακροχρόνια και
// τη βραχυχρόνια μίσθωση δεν υπάρχει σχέδιο να φτιαχτεί — υπάρχει ενοίκιο να
// εισπραχθεί — και στην ιδιοχρησία δεν υπάρχει καν ερώτηση. Ποια κατάσταση
// δείχνει η καρτέλα το ορίζει το lib/property/visibility, όχι αυτό το αρχείο.
//
// ΤΟ ΠΡΟΒΛΗΜΑ ΠΟΥ ΛΥΝΕΙ Η ΑΠΟΚΑΛΥΨΗ
// Στην ανακαίνιση η οθόνη έβγαζε, ανοιχτά και ταυτόχρονα: δώδεκα βήματα με
// περιγραφή, «πότε» και «αν παραλειφθεί», πέντε χρηματοδοτήσεις με «τι κάνει»
// και «τι να επιβεβαιώσεις», τέσσερις κανόνες και τέσσερα σημεία ελέγχου.
// Πάνω από δυόμισι χιλιάδες εικονοστοιχεία κύλισης, όλα στο ίδιο βάρος. Ο
// άνθρωπος που ανοίγει την καρτέλα δεν έχει να διαβάσει εγχειρίδιο· έχει να
// κάνει το ΕΠΟΜΕΝΟ πράγμα.
//
// Τώρα κάθε γραμμή δείχνει ΤΙ είναι και ΠΟΙΟΣ το κάνει, και ανοίγει μόνη της
// όταν τη χρειάζεσαι: το επόμενο βήμα είναι ήδη ανοιχτό, και μόλις το τσεκάρεις
// κλείνει και ανοίγει το αμέσως επόμενο. Καμία δεύτερη κίνηση, κανένα ψάξιμο.
//
// ΕΝΑΣ ΚΑΝΟΝΑΣ ΑΠΟΚΑΛΥΨΗΣ ΣΕ ΟΛΗ ΤΗΝ ΟΘΟΝΗ: ό,τι ανοίγει, ανοίγει με βελάκι στο
// ΔΕΞΙ άκρο της γραμμής, και ανοίγει ΕΝΑ τη φορά μέσα στην ίδια λίστα. Έτσι το
// μάτι δεν ξαναμαθαίνει τον μηχανισμό σε κάθε ενότητα.
//
// ΤΟ ΧΡΩΜΑ ΛΕΕΙ ΕΝΑ ΠΡΑΓΜΑ: «ΕΔΩ ΠΑΤΑΣ». Το μπλε εμφανίζεται μόνο στο κουτάκι
// που τσεκάρεις, όπως ακριβώς και στις Εργασίες. Καμία πράσινη επιβράβευση,
// κανένα πορτοκαλί σήμα: η πρόοδος είναι μέτρηση, όχι καλά νέα, και ό,τι θέλει
// επιβεβαίωση το λέει με λέξεις.
//
// ΤΙ ΚΡΑΤΑΕΙ ΑΥΤΟ ΤΟ ΑΡΧΕΙΟ ΚΑΙ ΤΙ ΟΧΙ
// Καμία γνώση. Όλο το περιεχόμενο και όλη η λογική ζουν στο `lib/property/plan`
// με tests. Εδώ μένει η παρουσίαση και η μνήμη του χρήστη (τι έχει τσεκάρει, τι
// είδος εκκρεμότητας δήλωσε, τι δεδομένα έβαλε) — τοπικά, ανά χρήστη και ανά
// ακίνητο, χωρίς να απαιτείται νέος πίνακας στη βάση.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { T, TT, SecHdr, PageTitle, fixedCols, settingsField, feAuto } from '@/components/Theme';
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
 * Ετικέτα ενότητας πάνω από τυπογραφικό περιεχόμενο, χωρίς πλαίσιο.
 *
 * Το `tight` μηδενίζει το πάνω περιθώριο, για τις ενότητες που ζουν μέσα σε
 * πλέγμα με δικό του gap: αλλιώς η δεύτερη στήλη ξεκινά τριάντα δύο
 * εικονοστοιχεία πιο κάτω από την πρώτη, χωρίς λόγο.
 */
function Section({ label, sub, right, tight, children }: {
  label: string; sub?: string; right?: ReactNode; tight?: boolean; children: ReactNode;
}) {
  return (
    <section style={{ marginTop: tight ? 0 : T.sp.section }}>
      <SecHdr label={label} sub={sub} right={right} />
      {children}
    </section>
  );
}

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
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 104px) minmax(0, 1fr)', gap: '0 10px', marginTop: 6, alignItems: 'baseline' }}>
      <span style={{ ...TT.label, fontSize: 9, color: 'var(--text-tertiary)' }}>{label}</span>
      <span style={{ ...TT.caption, color: 'var(--text-secondary)' }}>{children}</span>
    </div>
  );
}

/** Η μικρή ετικέτα που συνοδεύει έναν τίτλο: ποιος το κάνει, τι είδους είναι. */
const Tag = ({ children }: { children: ReactNode }) => (
  <span style={{ ...TT.label, fontSize: 9, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{children}</span>
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
function RowToggle({ open, onClick, label, dim, children }: {
  open: boolean; onClick: () => void; label: string; dim?: boolean; children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} aria-expanded={open} aria-label={label} className="acc-toggle"
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '13px 0',
        background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        fontFamily: T.font.sans, opacity: dim ? 0.55 : 1, transition: 'opacity .15s',
      }}>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
        {children}
      </span>
      <Caret open={open} />
    </button>
  );
}

/** Το σώμα που αποκαλύπτεται, στοιχισμένο με τον τίτλο από πάνω. */
function RowBody({ indent, children }: { indent?: number; children: ReactNode }) {
  return <div style={{ paddingLeft: indent ?? 0, paddingBottom: 14 }}>{children}</div>;
}

/**
 * ΤΟ ΙΔΙΟ ΧΕΙΡΙΣΤΗΡΙΟ ΜΕ ΤΙΣ ΕΡΓΑΣΙΕΣ, ΓΙΑΤΙ ΕΙΝΑΙ Η ΙΔΙΑ ΠΡΑΞΗ.
 *
 * Ήταν ΠΡΑΣΙΝΟ (`--positive`) με περίγραμμα 1,5 εικονοστοιχείου, ενώ το
 * αντίστοιχο κουμπί των Εργασιών είναι ΜΠΛΕ με περίγραμμα 2: δύο χρώματα και
 * δύο πάχη για «το τσέκαρα», σε δύο οθόνες της ίδιας εφαρμογής.
 *
 * Και το πράσινο έλεγε κάτι που δεν ισχύει. Δέκα γραμμές πιο κάτω, η μπάρα
 * προόδου της ίδιας οθόνης φέρει γραμμένο τον κανόνα: «η πρόοδος είναι μέτρηση,
 * δεν είναι καλά νέα» — και γεμίζει με το χρώμα του κειμένου, όχι με χρώμα
 * επιτεύγματος. Το κουτάκι δίπλα της γέμιζε πράσινο. Ο ίδιος κανόνας, δύο
 * απαντήσεις, στο ίδιο αρχείο.
 */
const Check = ({ on }: { on: boolean }) => (
  <span aria-hidden style={{
    width: 20, height: 20, borderRadius: '50%', flexShrink: 0, boxSizing: 'border-box',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: on ? 'var(--accent)' : 'transparent',
    border: `2px solid ${on ? 'var(--accent)' : 'var(--border-default)'}`,
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
        appearance: 'none', cursor: 'pointer', height: small ? T.h.sm : T.h.md, padding: small ? '0 12px' : '0 16px',
        borderRadius: T.radius.pill, fontFamily: T.font.sans, fontSize: small ? 12 : 13,
        fontWeight: on ? 700 : 500,
        background: on ? 'var(--bg-surface)' : 'transparent',
        border: `1px solid ${on ? 'var(--border-default)' : 'var(--border-subtle)'}`,
        color: on ? 'var(--text-primary)' : 'var(--text-secondary)',
        boxShadow: on ? 'var(--highlight-inset), var(--elev-1)' : 'none',
        transition: 'background .15s, color .15s',
      }}>
      {children}
    </button>
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
  // ίδια οθόνη, δέκα εκατοστά πιο πάνω, ο χρήστης καλείται να διαλέξει
  // ΑΚΡΙΒΩΣ ΑΥΤΟ: «Με μεσίτη» ή «Μόνος σου». Του δείχναμε το καθαρό ποσό της
  // μίας επιλογής και το παρουσιάζαμε ως το καθαρό ποσό της πώλησης.
  // Τώρα το νούμερο ακολουθεί την επιλογή, οπότε η σύγκριση γίνεται σε ευρώ.
  const [useAgent, setUseAgent] = useState(true);

  // ── ΤΙ ΕΙΝΑΙ ΑΝΟΙΧΤΟ ─────────────────────────────────────────────────────
  // `undefined` σημαίνει «ακολούθησε το επόμενο βήμα» — δηλαδή η οθόνη ανοίγει
  // μόνη της εκεί που πρέπει και ξανακλείνει μόλις τελειώσεις. `null` σημαίνει
  // «τα έκλεισε ο χρήστης όλα» και το σέβεται. Καμία επίδραση, κανένας
  // συγχρονισμός: η τιμή προκύπτει τη στιγμή της απόδοσης.
  const [openStep, setOpenStep] = useState<string | null | undefined>(undefined);
  const [openFund, setOpenFund] = useState<string | null>(null);
  const [openOption, setOpenOption] = useState<string | null>(null);
  const [refOpen, setRefOpen] = useState(false);
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

  const stepRow = (s: Step, first: boolean) => {
    const on = checked.has(s.id);
    const isNext = plan.next?.id === s.id;
    const open = openStepId === s.id;
    return (
      // ΤΟ ΕΠΟΜΕΝΟ ΒΗΜΑ ΞΕΧΩΡΙΖΕΙ ΜΕΣΑ ΣΤΗ ΣΕΙΡΑ, ΟΧΙ ΣΕ ΔΙΚΗ ΤΟΥ ΚΑΡΤΑ.
      // Η έμφαση είναι θέση και βάρος: ένα ήρεμο φόντο και μία λέξη στο άκρο.
      // Χωρίς σημασιολογικό χρώμα, χωρίς δεύτερο κουμπί.
      <div key={s.id} style={{
        borderTop: first || isNext ? 'none' : '1px solid var(--border-subtle)',
        background: isNext ? 'var(--bg-elevated)' : 'transparent',
        borderRadius: isNext ? T.radius.inner : 0,
        margin: isNext ? '6px -12px' : 0,
        padding: isNext ? '0 12px' : 0,
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 12, alignItems: 'center' }}>
          <button type="button" onClick={() => toggle(s.id)} aria-pressed={on}
            aria-label={on ? `Αναίρεση: ${s.title}` : `Ολοκληρώθηκε: ${s.title}`}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 0 }}>
            <Check on={on} />
          </button>
          <RowToggle open={open} dim={on} label={s.title} onClick={() => setOpenStep(open ? null : s.id)}>
            <span style={{
              fontFamily: T.font.sans, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)',
              textDecoration: on ? 'line-through' : 'none',
            }}>{s.title}</span>
            <Tag>{ACTOR_LABEL[s.who]}</Tag>
            {isNext && !on && <span style={{ ...TT.label, fontSize: 9, color: 'var(--text-secondary)', marginLeft: 'auto' }}>Το επόμενο</span>}
          </RowToggle>
        </div>
        {open && (
          <RowBody indent={32}>
            <div style={{ ...TT.bodySm, color: 'var(--text-secondary)' }}>{s.detail}</div>
            {s.when && <Meta label="Πότε">{s.when}</Meta>}
            {s.cost && <Meta label="Αν παραλειφθεί">{s.cost}</Meta>}
          </RowBody>
        )}
      </div>
    );
  };

  const optionRow = (o: Option, first: boolean) => {
    const open = openOption === o.id;
    return (
      <div key={o.id} style={{ borderTop: first ? 'none' : '1px solid var(--border-subtle)' }}>
        <RowToggle open={open} label={o.title} onClick={() => setOpenOption(open ? null : o.id)}>
          <span style={{ fontFamily: T.font.sans, fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>{o.title}</span>
        </RowToggle>
        <div style={{ paddingBottom: open ? 0 : 14 }}>
          <div style={{ ...TT.bodySm, color: 'var(--text-secondary)', marginTop: -6 }}>{o.payoff}</div>
          {/* ── Η ΣΥΓΚΡΙΣΗ ΠΟΥ ΔΕΝ ΜΠΟΡΟΥΣΕ ΝΑ ΓΙΝΕΙ ────────────────────────
              Οι τρεις άξονες ήταν πλέγμα τριών στηλών ύψους σαράντα
              εικονοστοιχείων, με την ετικέτα πάνω και την τιμή από κάτω. Σε
              επτά επιλογές, η μία κάτω από την άλλη, το «Ρίσκο» της τρίτης
              απείχε πάνω από τετρακόσια εικονοστοιχεία από το «Ρίσκο» της
              δεύτερης. Δηλαδή μια οθόνη σύγκρισης όπου η σύγκριση απαιτούσε να
              θυμάσαι τρεις λέξεις ενώ κυλάς.

              Τώρα οι τρεις άξονες είναι ΜΙΑ γραμμή, στην ίδια θέση σε κάθε
              επιλογή, και μένουν ΠΑΝΤΑ ορατοί: είναι το μόνο που συγκρίνεται
              μεταξύ γραμμών, οπότε δεν κρύβεται πίσω από άνοιγμα. */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 14px',
            marginTop: 8, fontFamily: T.font.sans, fontSize: 12, color: 'var(--text-primary)',
          }}>
            {[
              { k: 'Κόπος', v: EFFORT_LABEL[o.effort] },
              { k: 'Ρίσκο', v: RISK_LABEL[o.risk] },
              { k: 'Χρόνος', v: o.speed },
            ].map(x => (
              <span key={x.k} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
                <Tag>{x.k}</Tag>
                <span style={{ fontWeight: 600 }}>{x.v}</span>
              </span>
            ))}
          </div>
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

  const numField = (label: string, field: keyof VacancyCostInput, hint: string) => (
    <label style={{ display: 'block' }}>
      <span style={{ ...TT.label, fontSize: 9, color: 'var(--text-tertiary)' }}>{label}</span>
      {/* ΤΟ placeholder ΗΤΑΝ «0» ΚΑΙ ΤΑ ΤΕΣΣΕΡΑ ΠΕΔΙΑ ΔΙΑΒΑΖΟΝΤΑΝ ΩΣ ΜΗΔΕΝΙΚΑ.
          Ακριβώς το ίδιο σφάλμα είχε ήδη βρεθεί και διορθωθεί στο ιστορικό
          κατανάλωσης του ρεύματος: κενή φόρμα που δηλώνει «ΕΝΦΙΑ μηδέν,
          κοινόχρηστα μηδέν» δεν είναι κενή, είναι λάθος απάντηση. Το άγνωστο δεν
          γράφεται μηδέν — και η υπόδειξη από κάτω λέει ήδη τι μπαίνει εδώ. */}
      <input type="number" min={0} inputMode="decimal" className="po-field" placeholder=""
        value={costs[field] ?? ''}
        onChange={e => setCost(field, e.target.value === '' ? undefined : Number(e.target.value))}
        style={{ ...settingsField, height: T.h.md, fontSize: 13, marginTop: 5 }} />
      <span style={{ ...TT.caption, color: 'var(--text-tertiary)', display: 'block', marginTop: 4 }}>{hint}</span>
    </label>
  );

  return (
    <div style={{ fontFamily: T.font.sans, maxWidth: 900 }}>
      {/* ── Η ΚΕΦΑΛΙΔΑ ────────────────────────────────────────────────────
          ΗΤΑΝ ΔΥΟ ΚΕΦΑΛΙΔΕΣ, ΚΑΙ Η ΚΑΤΑΣΤΑΣΗ ΓΡΑΦΟΤΑΝ ΔΥΟ ΦΟΡΕΣ. Η σελίδα
          τύπωνε από πάνω «ΑΞΙΟΠΟΙΗΣΗ ΑΚΙΝΗΤΟΥ / Κενό· πώς θα μισθωθεί ή θα
          αξιοποιηθεί» και αμέσως μετά η καρτέλα τύπωνε «ΚΕΝΟ · Όνομα» και τον
          δικό της τίτλο: τέσσερα μπλοκ επικεφαλίδας στη σειρά, με τη λέξη
          «Κενό» δύο φορές μέσα σε εξήντα εικονοστοιχεία.

          Μία κεφαλίδα, από το κοινό PageTitle που χρησιμοποιούν οι άλλες δέκα
          καρτέλες — ίδιες αποστάσεις, ίδια μεγέθη, ίδια θέση. */}
      <PageTitle over={`Αξιοποίηση · ${plan.label}`} title={plan.headline} lede={plan.lede} />

      {/* ── ΤΙ ΕΙΔΟΥΣ ΕΚΚΡΕΜΟΤΗΤΑ: αλλάζει ΟΛΗ τη σειρά, άρα ρωτιέται πρώτο ── */}
      {isDispute && (
        <div style={{ marginTop: T.sp.xl }}>
          <div style={{ ...TT.label, color: 'var(--text-secondary)', marginBottom: 10 }}>Τι είδους εκκρεμότητα είναι</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {DISPUTE_KINDS.map(k => (
              <Pick key={k.key} on={k.key === kind} onClick={() => pickKind(k.key)}>{k.label}</Pick>
            ))}
          </div>
          <div style={{ ...TT.caption, color: 'var(--text-tertiary)', marginTop: 8 }}>
            {DISPUTE_KINDS.find(k => k.key === kind)?.hint}
          </div>
        </div>
      )}

      {/* ── ΤΟ ΝΟΥΜΕΡΟ ΤΟΥ ΚΕΝΟΥ: χωρίς αυτό, οι επιλογές μοιάζουν ίδιες ───
          ΤΑ ΤΕΣΣΕΡΑ ΠΕΔΙΑ ΜΕΝΟΥΝ ΑΝΟΙΧΤΑ ΟΣΟ ΔΕΝ ΕΧΟΥΝ ΑΠΑΝΤΗΣΗ. Μόλις υπάρχει
          νούμερο, η φόρμα δεν έχει τι άλλο να πει: μαζεύεται και μένει το
          αποτέλεσμα, που είναι και ο λόγος που ζητήθηκαν. Ξανανοίγει με ένα
          πάτημα, στην ίδια θέση όπου έκλεισε. */}
      {plan.status === 'vacant' && (
        <Section label="Τι κοστίζει ο μήνας που περνάει"
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
               `fixedCols` είναι η μία απάντηση της εφαρμογής σε αυτό (βλ.
               components/tokens.ts) και το χρησιμοποιούν ήδη οι Λογαριασμοί, ο
               Έλεγχος και οι Πάροχοι. Στοίχιση στην κορυφή: κάθε πεδίο κουβαλά
               υπόδειξη ΑΠΟ ΚΑΤΩ, οπότε το κάτω άκρο δεν είναι το κουτί. */
            <div {...fixedCols(4, 14, 'start')}>
              {numField('ΕΝΦΙΑ (έτος)', 'enfiaYear', 'Από το εκκαθαριστικό')}
              {numField('Κοινόχρηστα (μήνας)', 'commonMonthly', 'Ό,τι πληρώνεις κλειστό')}
              {numField('Πάγια ρεύμα/νερό (μήνας)', 'utilitiesMonthly', 'Χωρίς κατανάλωση')}
              {numField('Ασφάλιστρο (έτος)', 'insuranceYear', 'Αν υπάρχει')}
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
        </Section>
      )}

      {/* ── Η ΣΕΙΡΑ ──────────────────────────────────────────────────────
          Ο ΥΠΟΤΙΤΛΟΣ ΜΠΑΙΝΕΙ ΜΟΝΟ ΟΠΟΥ ΔΕΝ ΥΠΑΡΧΟΥΝ ΟΜΑΔΕΣ. Στην ανακαίνιση οι
          ίδιες οι ομάδες («Πριν ξεκινήσεις», «Πρώτα· χωρίς αυτά τίποτα δεν
          κρατάει», «Μετά· εδώ κρίνεται το ενοίκιο», «Τελευταία· το φαινόμενο»)
          ΕΙΝΑΙ η εξήγηση της σειράς. Μια πρόταση από πάνω που λέει «ό,τι είναι
          πιο πάνω εμποδίζει ό,τι είναι πιο κάτω» απλώς την επαναλαμβάνει. */}
      <Section
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
              <div style={{ width: 90, height: 3, borderRadius: 2, background: 'var(--border-subtle)', overflow: 'hidden' }}>
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
        {groups.map((g, gi) => (
          <div key={g.group ?? `g${gi}`} style={{ marginTop: g.group && gi > 0 ? T.sp.xl : 0 }}>
            {g.group && (
              /* Η ομάδα κουβαλά και τη μέτρησή της: τέσσερα βήματα «πριν
                 ξεκινήσεις» με τα δύο τσεκαρισμένα είναι διαφορετική εικόνα από
                 τέσσερα άθικτα, και φαίνεται χωρίς να μετρήσει κανείς κουτάκια. */
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4, paddingBottom: 6, borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ ...TT.label, fontSize: 9, color: 'var(--text-tertiary)', flex: 1, minWidth: 0 }}>{g.group}</span>
                <span style={{ ...TT.caption, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                  {g.items.filter(s => checked.has(s.id)).length} από {g.items.length}
                </span>
              </div>
            )}
            {g.items.map((s, i) => stepRow(s, i === 0))}
          </div>
        ))}
        {!plan.next && (
          <div style={{ marginTop: T.sp.lg, paddingTop: T.sp.lg, borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ ...TT.h2 }}>Δεν μένει κάτι ανοιχτό.</div>
            <div style={{ ...TT.bodySm, color: 'var(--text-secondary)', marginTop: 6 }}>
              Πέρασες όλη τη σειρά. Αν άλλαξε κάτι στο ακίνητο, άλλαξε και την κατάστασή του: αυτή η καρτέλα
              υπάρχει για όσο διαρκεί η μεταβατική περίοδος, όχι για πάντα.
            </div>
          </div>
        )}
      </Section>

      {/* ── Η ΣΥΓΚΡΙΣΗ ───────────────────────────────────────────────────── */}
      {plan.options.length > 0 && (
        <Section label={plan.optionsTitle} sub={plan.optionsSub}>
          {plan.options.map((o, i) => optionRow(o, i === 0))}
        </Section>
      )}

      {/* ── ΤΙ ΜΕΝΕΙ ΚΑΘΑΡΟ (πώληση, όταν υπάρχει καταχωρημένη αξία) ─────── */}
      {plan.status === 'for_sale' && sale && (
        <Section label="Τι μένει καθαρό"
          sub={`Ενδεικτικά, με βάση την αξία που έχεις καταχωρήσει (${feAuto(sale.price)}).`}
          right={
            <div style={{ display: 'flex', gap: 6 }}>
              {[{ k: true, l: 'Με μεσίτη' }, { k: false, l: 'Μόνος σου' }].map(o => (
                <Pick key={o.l} small on={useAgent === o.k} onClick={() => setUseAgent(o.k)}>{o.l}</Pick>
              ))}
            </div>
          }>
          {sale.lines.map(l => (
            <div key={l.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 2px', borderTop: '1px solid var(--border-subtle)' }}>
              <span style={{ ...TT.bodySm, color: 'var(--text-secondary)' }}>{l.label}</span>
              {/* Το λογιστικό μείον γραφόταν με το χέρι, δίπλα σε `feAuto`, ενώ το
                  `feSigned` υπάρχει στο `lib/core/format` ακριβώς γι’ αυτό, με δικό
                  του test — και δεν το καλούσε ΚΑΝΕΝΑ σημείο της εφαρμογής. Μια
                  συνάρτηση που κανείς δεν χρησιμοποιεί δεν φυλάει τίποτα. */}
              <span style={{ ...TT.mono, fontSize: 13, color: 'var(--text-primary)' }}>{feSigned(-l.amount)}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 2px 0', borderTop: '2px solid var(--border-subtle)', marginTop: 4 }}>
            <span style={{ fontFamily: T.font.sans, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Καθαρό έσοδο</span>
            <span style={{ ...TT.kpi, fontSize: 18 }}>{feAuto(sale.net)}</span>
          </div>
          <Meta label="Επιβεβαίωσε">{sale.note}</Meta>
        </Section>
      )}

      {/* ── ΠΟΙΟΣ ΜΠΟΡΕΙ ΝΑ ΠΛΗΡΩΣΕΙ ΤΙ (ανακαίνιση) ─────────────────────
          ΠΕΝΤΕ ΠΡΟΓΡΑΜΜΑΤΑ ΜΕ ΤΙΣ ΕΠΙΦΥΛΑΞΕΙΣ ΤΟΥΣ ΑΝΟΙΧΤΕΣ ΗΤΑΝ ΤΕΤΡΑΚΟΣΙΕΣ
          ΛΕΞΕΙΣ. Και οι επιφυλάξεις λένε όλες την ίδια κουβέντα με άλλα λόγια
          («ορίζεται ανά κύκλο»), που τη λέει ήδη μία φορά ο υπότιτλος από πάνω.
          Κλειστά, οι πέντε γραμμές απαντούν στο μόνο που ρωτάει κάποιος που
          μόλις έμαθε ότι υπάρχουν: ποια είναι, και τι είδους χρήμα είναι. */}
      {plan.funding.length > 0 && (
        <Section label="Ποιος μπορεί να πληρώσει τι"
          sub="Οι όροι κάθε προγράμματος αλλάζουν σε κάθε κύκλο, γι’ αυτό δεν γράφεται εδώ κανένα ποσοστό.">
          {plan.funding.map((f, i) => {
            const open = openFund === f.id;
            return (
              <div key={f.id} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)' }}>
                <RowToggle open={open} label={f.title} onClick={() => setOpenFund(open ? null : f.id)}>
                  <span style={{ fontFamily: T.font.sans, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{f.title}</span>
                  <Tag>{FUNDING_KIND_LABEL[f.kind]}</Tag>
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
                        ενέργεια. Ο κανόνας του αρχείου παραβιαζόταν από το ίδιο το αρχείο.
                        Εδώ γίνεται αυτό που είναι: ήσυχος σύνδεσμος κειμένου. */}
                    {f.href && (
                      <a href={f.href} target="_blank" rel="noopener noreferrer"
                        style={{
                          display: 'inline-block', marginTop: 12, fontFamily: T.font.sans,
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

          {/* Ενδεικτική δόση επισκευαστικού. Το τοκοχρεολύσιο δεν ξαναγράφεται:
              έρχεται από το lib/loans, που είναι η πηγή αλήθειας για κάθε δόση.
              Η υπόθεση του επιτοκίου γράφεται ΜΑΖΙ με το αποτέλεσμα και ποτέ
              χωρίς αυτό: πριν μπει ποσό δεν υπάρχει νούμερο να παρεξηγηθεί. */}
          <div style={{ marginTop: T.sp.xl, paddingTop: T.sp.lg, borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap' }}>
              <label style={{ display: 'block', width: 190 }}>
                <span style={{ ...TT.label, fontSize: 9, color: 'var(--text-tertiary)' }}>Ποσό ανακαίνισης</span>
                <input type="number" min={0} inputMode="decimal" className="po-field" placeholder=""
                  value={loanAmount ?? ''}
                  onChange={e => setLoanAmount(e.target.value === '' ? null : Number(e.target.value))}
                  style={{ ...settingsField, height: T.h.md, fontSize: 13, marginTop: 5 }} />
              </label>
              {loan && (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ ...TT.kpi, fontSize: 20 }}>{feAuto(loan.monthly)}</span>
                  <span style={{ ...TT.bodySm, color: 'var(--text-secondary)' }}>
                    τον μήνα για {ASSUMED_YEARS} έτη · συνολικοί τόκοι {feAuto(loan.interest)}
                  </span>
                </div>
              )}
            </div>
            <div style={{ ...TT.caption, color: 'var(--text-tertiary)', marginTop: 10 }}>
              Ενδεικτική δόση επισκευαστικού με υποθετικό επιτόκιο {ASSUMED_RATE_PCT}% σε {ASSUMED_YEARS} έτη.
              Τα σημερινά επιτόκια και τα έξοδα συγκρίνονται στην καρτέλα Δάνειο.
            </div>
          </div>
        </Section>
      )}

      {/* ═══ ΑΝΑΦΟΡΑ ══════════════════════════════════════════════════════
          ΗΤΑΝ ΔΥΟ ΑΚΟΜΗ ΕΝΟΤΗΤΕΣ ΜΕ ΤΟ ΙΔΙΟ ΑΚΡΙΒΩΣ ΥΦΟΣ, ΑΝΟΙΧΤΕΣ, ΣΤΟ ΤΕΛΟΣ.
          «Οι κανόνες» και «Προς επιβεβαίωση»: ίδια ετικέτα, ίδια λεπτή γραμμή,
          ίδιες σειρές κειμένου με τις τρεις από πάνω. Όταν όλα μοιάζουν εξίσου
          σημαντικά, τίποτα δεν είναι — και ο χρήστης κάνει το μόνο λογικό: κυλά
          μέχρι κάτω χωρίς να διαβάσει.

          Καμία από τις δύο δεν ζητά ενέργεια, και το λέει και η ίδια η οθόνη
          δύο γραμμές πιο πάνω. Είναι υλικό αναφοράς: μία γραμμή που ανοίγει,
          κλειστή στην πρώτη επίσκεψη. Δεν χάθηκε τίποτα — απλώς έπαψε να
          διεκδικεί την ίδια προσοχή με τη δουλειά. */}
      <div style={{ marginTop: T.sp.section, paddingTop: T.sp.xl, borderTop: '1px solid var(--border-default)' }}>
        <RowToggle open={refOpen} label="Αναφορά" onClick={() => setRefOpen(o => !o)}>
          <span style={{ ...TT.label, color: 'var(--text-secondary)' }}>Αναφορά</span>
          <span style={{ ...TT.caption, color: 'var(--text-tertiary)' }}>
            Δεν υπάρχει κάτι να κάνεις εδώ. Είναι όσα καλό είναι να ξέρεις πριν αποφασίσεις.
          </span>
        </RowToggle>

        {refOpen && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 330px), 1fr))', gap: T.sp.section, paddingTop: T.sp.md }}>
            <Section tight label="Οι κανόνες που κοστίζουν χρήματα"
              sub="Λίγα πράγματα, και όλα τους τα έχει πληρώσει κάποιος που δεν τα ήξερε.">
              {plan.rules.map((r, i) => (
                <div key={r.id} style={{ padding: '14px 2px', borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)' }}>
                  <div style={{ fontFamily: T.font.sans, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{r.title}</div>
                  <div style={{ ...TT.bodySm, color: 'var(--text-secondary)', marginTop: 4 }}>{r.body}</div>
                </div>
              ))}
            </Section>

            {/* ΤΟ ΠΟΡΤΟΚΑΛΙ ΣΗΜΑ ΜΕ ΤΟ «3» ΕΦΥΓΕ. Δύο γραμμές πιο πάνω η ίδια
                οθόνη γράφει «δεν υπάρχει κάτι να κάνεις εδώ» — και δίπλα στον
                τίτλο στεκόταν ένας μετρητής σε χρώμα προειδοποίησης, δηλαδή το
                σήμα που η εφαρμογή χρησιμοποιεί για εκκρεμότητες. Ένα γυμνό «3»
                δεν λέει καν τρία τι· το πλήθος φαίνεται από τη λίστα. */}
            <Section tight
              label="Προς επιβεβαίωση"
              sub="Ό,τι αλλάζει από χρονιά σε χρονιά δεν γράφεται εδώ ως βεβαιότητα. Γράφεται τι να ελέγξεις και πού.">
              {plan.verify.map((v, i) => (
                <div key={v.id} style={{ padding: '14px 2px', borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)' }}>
                  {/* Ίδιο βάρος με τον τίτλο κανόνα δίπλα: δύο στήλες με το ίδιο
                      νόημα δεν επιτρέπεται να έχουν άλλο μέγεθος και άλλο πάχος. */}
                  <div style={{ fontFamily: T.font.sans, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{v.what}</div>
                  <Meta label="Πού">{v.where}</Meta>
                  <Meta label="Γιατί αλλάζει">{v.why}</Meta>
                </div>
              ))}
            </Section>
          </div>
        )}
      </div>

      <p style={{ ...TT.caption, color: 'var(--text-tertiary)', marginTop: T.sp.xl, paddingTop: T.sp.lg, borderTop: '1px solid var(--border-subtle)' }}>
        {PLAN_DISCLAIMER}
      </p>
    </div>
  );
}
