'use client';

import { useState, useRef, useEffect, useId, ReactNode, Fragment, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { T, TT, localDay } from '@/components/Theme';
import { acceptNumeric, forDisplay } from '@/lib/core/numInput';
import { athensToday, isoYear, isoMonth } from '@/lib/core/time';
import { MONTHS_SHORT } from '@/lib/core/months';
import { fn } from '@/lib/core/format';

// ── ΕΝΙΑΙΟ σύστημα πεδίων (ένα μέγεθος/σχήμα/focus παντού) ───────────────────
// Γωνία 10, 1px border + accent focus-ring (χωρίς μετατόπιση layout — δεν
// αλλάζει πάχος border/padding στο focus).
//
// Το ύψος ΔΕΝ είναι πια αριθμός: είναι το `T.h.lg` της κοινής κλίμακας, δηλαδή
// 40 στο ποντίκι και 44 στο δάχτυλο. Ήταν σταθερό 40, δηλαδή κάθε πεδίο φόρμας
// της εφαρμογής έπεφτε κάτω από το ελάχιστο μέγεθος αφής. Δεύτερη σταθερά με
// δεύτερη τιμή θα ήταν δεύτερη κλίμακα.
export const FIELD_HEIGHT = T.h.lg;
// Ακτίνα πεδίων: ίδια με τα κουμπιά και το inner token (T.radius.inner = 10),
// ώστε πεδία και κουμπιά να έχουν την ίδια γεωμετρία παντού.
export const FIELD_RADIUS = T.radius.inner;
export const fieldBorderColor = (active: boolean) => (active ? 'var(--accent)' : 'var(--border-default)');
export const fieldRing = (active: boolean) => (active ? '0 0 0 3px var(--accent-dim)' : 'none');

/**
 * ΤΟ ΚΟΥΜΠΙ ΠΟΥ ΣΤΕΚΕΤΑΙ ΔΙΠΛΑ ΣΕ ΠΕΔΙΑ, ΟΧΙ ΚΑΤΩ ΑΠΟ ΑΥΤΑ.
 *
 * Οι σειρές «τρία πεδία και μια προσθήκη» είχαν το κουμπί κρεμασμένο σε δική
 * του γραμμή, δεξιά. Δύο γραμμές για ένα βήμα, και η ενέργεια μακριά από τα
 * πεδία που την τροφοδοτούν. Μέσα στη σειρά, το κουμπί πρέπει να έχει ΑΚΡΙΒΩΣ
 * τη γεωμετρία του πεδίου δίπλα του — ίδιο ύψος, ίδια ακτίνα — αλλιώς η ευθεία
 * σπάει οπτικά ακόμη κι όταν το πλέγμα είναι σωστό.
 *
 * ΚΑΙ ΔΕΝ ΦΑΙΝΕΤΑΙ ΠΑΤΗΣΙΜΟ ΟΤΑΝ ΔΕΝ ΕΙΝΑΙ. Ήταν πάντα στο χρώμα της ενέργειας
 * και, με άδεια πεδία, το πάτημα δεν έκανε τίποτε: ο χρήστης δεν μάθαινε ποτέ
 * ότι κάτι έλειπε. Η ανενεργή μορφή το λέει πριν το πατήσει.
 */
/**
 * ΔΙΑΚΟΠΤΗΣ ΠΟΥ ΣΤΕΚΕΤΑΙ ΣΕ ΣΕΙΡΑ ΠΕΔΙΩΝ.
 *
 * Ο σκέτος `Toggle` δεν έχει ετικέτα από πάνω, οπότε μέσα σε μια σειρά πεδίων
 * καθόταν ψηλότερα από τα διπλανά του και έσπαγε τη γραμμή βάσης. Εδώ παίρνει
 * την ίδια γεωμετρία με ένα πεδίο: ετικέτα από πάνω, κουτί ύψους πεδίου.
 */
export function ToggleField({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div>
      <label style={fieldLabelStyle}>{label}</label>
      {/* ΧΩΡΙΣ ΚΟΥΤΙ. Το πλαίσιο ενός πεδίου σημαίνει «εδώ γράφεις»· γύρω από
          διακόπτη είναι άδειο περίγραμμα που περικλείει ένα αντικείμενο μισού
          πλάτους και το κάνει να μοιάζει με πεδίο που δεν γέμισε κανείς. Μένει
          μόνο το ΥΨΟΣ, ώστε ο διακόπτης να κάθεται στην ίδια γραμμή βάσης με τα
          κουτιά δίπλα του. */}
      <div style={{ height: FIELD_HEIGHT, display: 'flex', alignItems: 'center', boxSizing: 'border-box' }}>
        <Toggle on={on} onChange={onChange} ariaLabel={label}/>
      </div>
    </div>
  );
}

export const addBtn = (disabled = false): React.CSSProperties => ({
  height: FIELD_HEIGHT,
  width: '100%',
  borderRadius: FIELD_RADIUS,
  border: disabled ? '1px solid var(--border-default)' : 'none',
  background: disabled ? 'transparent' : 'var(--accent)',
  color: disabled ? 'var(--text-tertiary)' : 'var(--accent-text)',
  fontSize: 13,
  fontWeight: 700,
  fontFamily: T.font.sans,
  letterSpacing: 0,
  cursor: disabled ? 'not-allowed' : 'pointer',
  boxSizing: 'border-box',
  transition: 'background 0.15s, color 0.15s, border-color 0.15s',
});

const mdInputBase: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-default)',
  borderRadius: FIELD_RADIUS,
  padding: '10px 16px',
  color: 'var(--text-primary)',
  fontSize: 14,
  fontFamily: T.font.sans,
  letterSpacing: 0,
  // ΤΟ ΔΑΧΤΥΛΙΔΙ ΕΣΤΙΑΣΗΣ ΜΕΝΕΙ. Ηταν `outline: 'none'` — inline, άρα νικούσε
  // τον κανόνα :focus-visible του globals.css σε ΚΑΘΕ πεδίο που χτίζεται πάνω
  // σε αυτή τη βάση. Οσα components ζωγραφίζουν και δικό τους σημάδι εστίασης
  // (CustomSelect) κρατούν και τα δύο: το δικό τους δηλώνει κατάσταση, το
  // δαχτυλίδι δηλώνει «εδώ είναι ο δείκτης του πληκτρολογίου», και μόνο το
  // δεύτερο είναι εγγύηση προσβασιμότητας.
  boxSizing: 'border-box' as const,
  height: FIELD_HEIGHT,
  transition: 'border-color 0.15s, box-shadow 0.15s',
};

// ═══ Η ΕΤΙΚΕΤΑ ΠΟΥ ΤΣΑΚΙΖΕΙ ΚΑΤΕΒΑΖΕΙ ΜΟΝΟ ΤΟ ΔΙΚΟ ΤΗΣ ΠΕΔΙΟ ══════════════
// Σε σειρά με πέντε πεδία, μία ετικέτα δύο λέξεων τσακίζει σε δεύτερη γραμμή
// και το πλαίσιό της κατεβαίνει δεκαοκτώ εικονοστοιχεία χαμηλότερα από τα
// υπόλοιπα τέσσερα. Η σειρά παύει να είναι σειρά, και το μάτι το βλέπει αμέσως
// χωρίς να ξέρει γιατί.
//
// Η λύση δεν είναι να κονταίνουν όλες οι ετικέτες: είναι να κρατούν την ίδια
// ΘΕΣΗ βάσης. Δύο γραμμές ύψους, στοιχισμένες στο κάτω μέρος, ώστε είτε μία
// είτε δύο λέξεις, το πεδίο ξεκινά πάντα από το ίδιο σημείο.
/**
 * Η ετικέτα ΠΕΔΙΟΥ, εξαγόμενη.
 *
 * Οθόνες που χτίζουν δικό τους «σαν πεδίο» κελί (ένα υπολογισμένο ποσό, έναν
 * διακόπτη) έγραφαν την ετικέτα με το `TT.label` — που είναι ετικέτα ΕΝΟΤΗΤΑΣ:
 * δέκα εικονοστοιχεία, βάρος επτακόσια, ΚΕΦΑΛΑΙΑ. Δίπλα σε «Τύπος ακινήτου»
 * γραμμένο κανονικά, το «ΤΙΜΗ ΑΝΑ Τ.Μ.» διαβαζόταν ως άλλο είδος πράγματος.
 * Ίδια ετικέτα, ίδια γραμμή βάσης, μία δήλωση.
 */
export const fieldLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  minHeight: 32,
  lineHeight: 1.3,
  fontFamily: T.font.sans,
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: '0.5px',
  color: 'var(--text-secondary)',
  marginBottom: 6,
};

// ── InfoDot: διακριτικό εικονίδιο «i» με tooltip στο πέρασμα του κέρσορα/δαχτύλου.
// Κρύβει επεξηγήσεις/σημειώσεις πίσω από σύμβολο, ώστε τα πεδία να μένουν καθαρά
// και μαζεμένα (όχι «σούπερ μάρκετ» με μόνιμα κατεβατά). Portal → δεν κόβεται.
export function InfoDot({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean }>({ top: 0, left: 0, up: false });
  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || typeof window === 'undefined') return;
    const W = 260;
    const left = Math.min(Math.max(8, r.left - 2), window.innerWidth - W - 8);
    const up = r.bottom + 120 > window.innerHeight;
    setPos({ top: up ? r.top - 8 : r.bottom + 8, left, up });
    setOpen(true);
  };
  const hide = () => setOpen(false);
  return (
    <>
      {/* Ορατή κουκκίδα 15px, αλλά περιοχή αφής ~32px (αρνητικά margins ώστε να μη μεγαλώνει η σειρά). */}
      <button ref={ref} type="button" aria-label="Επεξήγηση"
        onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); open ? hide() : show(); }}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', verticalAlign: 'middle', marginLeft: 0, marginTop: -9, marginBottom: -9, padding: 0, width: T.h.sm, height: T.h.sm, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'help', flexShrink: 0 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 15, height: 15, borderRadius: '50%', border: '1px solid var(--border-default)' }}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 8h.01M11 12h1v4h1" /></svg>
        </span>
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div role="tooltip" style={{ position: 'fixed', top: pos.top, left: pos.left, transform: pos.up ? 'translateY(-100%)' : 'none', width: 260, maxWidth: 'calc(100vw - 16px)', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '10px 12px', boxShadow: 'var(--elev-3)', zIndex: 3000, pointerEvents: 'none' }}>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.55 }}>{text}</p>
        </div>,
        document.body,
      )}
    </>
  );
}

/**
 * ΠΛΑΚΙΔΙΟ «ΕΤΙΚΕΤΑ ΚΑΙ ΕΠΕΞΗΓΗΣΗ» — ΜΙΑ ΦΟΡΑ, ΓΙΑ ΤΡΕΙΣ ΟΘΟΝΕΣ.
 *
 * Το ίδιο ακριβώς στοιχείο ήταν γραμμένο τρεις φορές, και τις τρεις αλλιώς: τα
 * κριτήρια έγκρισης, οι επισημάνσεις της προσφοράς και τα δικαιώματα απέναντι
 * σε servicer. Τρία padding, τρία μεγέθη γράμματος, τρεις στοιχίσεις — και,
 * κυρίως, ΑΛΛΗ ΣΥΜΠΕΡΙΦΟΡΑ ΣΤΟ ΜΑΚΡΥ ΚΕΙΜΕΝΟ: το ένα τύλιγε, το άλλο έκοβε με
 * αποσιωπητικά. Δηλαδή στην ίδια οθόνη, η ίδια πληροφορία άλλοτε φαινόταν
 * ολόκληρη και άλλοτε γινόταν «Ακριβότερο από την αγο…».
 *
 * ΤΟ ΚΕΙΜΕΝΟ ΔΕΝ ΚΟΒΕΤΑΙ ΠΟΤΕ. Μια ετικέτα που δεν χωρά δεν γίνεται μισή,
 * γίνεται δύο γραμμές· έτσι το πλήθος στηλών είναι απόφαση διάταξης και όχι
 * απόφαση για το τι θα διαβάσει ο χρήστης.
 */
export function InfoChip({ label, detail, icon, tone = 'default' }: {
  label: string; detail?: string; icon?: ReactNode; tone?: 'default' | 'negative';
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
      borderRadius: T.radius.inner, height: '100%',
    }}>
      {icon && <span style={{ flexShrink: 0, display: 'inline-flex' }} aria-hidden="true">{icon}</span>}
      <span style={{
        flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, fontFamily: T.font.sans,
        color: tone === 'negative' ? 'var(--negative)' : 'var(--text-primary)', lineHeight: 1.4,
      }}>{label}</span>
      {detail && <InfoDot text={detail} />}
    </div>
  );
}

// ── ΤΟ labelInfo ΠΟΥ ΕΓΙΝΕ ΠΑΡΑΓΡΑΦΟΣ ΜΕΣΑ ΣΤΗΝ ΕΤΙΚΕΤΑ ────────────────────
// Ο τύπος είναι ReactNode, οπότε μια συμβολοσειρά περνά τον μεταγλωττιστή και
// ΤΥΠΩΝΕΤΑΙ κολλητά στην ετικέτα. Το αποτέλεσμα στην οθόνη ήταν
// «Πλήρωσε ο επισκέπτηςΤο ΣΥΝΟΛΟ που πλήρωσε ο επισκέπτης, πριν αφαιρεθεί
// προμήθεια…» — τρεις παράγραφοι στη θέση τριών ετικετών, χωρίς κενό, χωρίς
// τελεία, με τη φόρμα να τριπλασιάζεται σε ύψος.
//
// Η διόρθωση δεν είναι να θυμάται ο καλών να τυλίγει: είναι να μη ΜΠΟΡΕΙ να
// ξεχάσει. Κείμενο σημαίνει επεξήγηση, και η επεξήγηση ζει πίσω από την κουκκίδα.
const infoNode = (info: ReactNode): ReactNode =>
  typeof info === 'string' ? <InfoDot text={info} /> : info;

// ─── Number Input ─────────────────────────────────────────────────────────────
interface NumberInputProps {
  label?: string;
  /**
   * Το όνομα του πεδίου όταν η ετικέτα δεν μπαίνει μέσα στο component — επειδή
   * τη γράφει ο γονιός (πλέγμα με δύο πεδία, ετικέτα δίπλα και όχι από πάνω).
   * Χωρίς αυτό ο αναγνώστης οθόνης λέει σκέτο «πλαίσιο κειμένου»: το πεδίο
   * υπάρχει, αλλά δεν λέγεται τίποτα.
   */
  ariaLabel?: string;
  /**
   * Όταν την ετικέτα τη γράφει ο γονιός σε δικό του <label>, δίνει εδώ το ίδιο
   * `id` και εκεί `htmlFor`. Τότε η ετικέτα δεν είναι απλώς διπλανό κείμενο:
   * κάνει και εστίαση με το κλικ, όπως σε κάθε άλλο πεδίο της εφαρμογής.
   */
  id?: string;
  labelInfo?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  suffix?: string;
  prefix?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
}

/**
 * ΤΟ ΚΕΝΟ ΠΕΔΙΟ ΕΛΕΓΕ «ΜΗΔΕΝ», ΚΑΙ ΤΟ ΕΛΕΓΕ 108 ΦΟΡΕΣ.
 *
 * Η προεπιλογή του placeholder ήταν `'0'`. Από τις 127 χρήσεις του component,
 * μόνο 19 περνούν δικό τους — άρα σε 108 πεδία ο χρήστης έβλεπε έναν αριθμό που
 * δεν είχε γράψει ποτέ. Ένα κενό πεδίο ΕΝΦΙΑ που γράφει «0» δεν διαβάζεται
 * «συμπλήρωσε»· διαβάζεται «ο ΕΝΦΙΑ σου είναι μηδέν».
 *
 * Είναι το ίδιο σφάλμα που είχε ήδη βρεθεί δύο φορές μεμονωμένα — στο δωδεκάμηνο
 * ιστορικό κατανάλωσης, όπου δώδεκα κουτιά διάβαζαν «μηδέν κιλοβατώρες κάθε
 * μήνα», και στα τέσσερα πεδία κόστους της Αξιοποίησης. Και τις δύο φορές
 * διορθώθηκε τοπικά, ενώ η αιτία ζούσε εδώ. Τώρα διορθώνεται στη ρίζα: το
 * άγνωστο δεν γράφεται μηδέν, πουθενά.
 *
 * Όποιο πεδίο χρειάζεται πραγματικά υπόδειξη μορφής («3.5», «€ ανά μήνα») τη
 * δηλώνει ρητά — και τότε είναι υπόδειξη, όχι τιμή.
 */
export function NumberInput({
  label, ariaLabel, id, labelInfo, value, onChange, placeholder = '', suffix, prefix,
  min = 0, max, step = 1, disabled, className,
}: NumberInputProps) {
  const [focused, setFocused] = useState(false);
  // ═══ ΤΟ ΠΡΟΧΕΙΡΟ ΥΠΑΡΧΕΙ ΜΟΝΟ ΟΣΟ ΓΡΑΦΕΙ Ο ΧΡΗΣΤΗΣ ══════════════════════
  // ΤΙ ΗΤΑΝ: μια δεύτερη κατάσταση που κρατούσε αντίγραφο της τιμής του γονέα,
  // και ένα effect που τα ξανασυγχρόνιζε μετά από κάθε απόδοση. Δηλαδή σε ΚΑΘΕ
  // αλλαγή της τιμής, το πεδίο αποδιδόταν, το effect έτρεχε, έγραφε κατάσταση,
  // και το πεδίο αποδιδόταν ΞΑΝΑ: δύο περάσματα για μία αλλαγή, στο πιο
  // πολυχρησιμοποιημένο πεδίο ολόκληρης της εφαρμογής.
  //
  // ΤΩΡΑ ΥΠΟΛΟΓΙΖΕΤΑΙ ΚΑΤΑ ΤΗΝ ΑΠΟΔΟΣΗ. Το πρόχειρο είναι `null` όσο δεν
  // πληκτρολογεί κανείς, οπότε δείχνεται η τιμή του γονέα χωρίς αντιγραφή· με
  // το πρώτο πλήκτρο γεννιέται και ζει ώσπου να φύγει η εστίαση. Καμία διπλή
  // απόδοση, και καμία στιγμή όπου το αντίγραφο διαφωνεί με το πρωτότυπο.
  //
  // ΓΙΑΤΙ ΔΕΝ ΑΡΚΕΙ ΤΟ `focused`: ανάμεσα στο πάτημα και στο πρώτο πλήκτρο, το
  // πεδίο πρέπει να δείχνει την τιμή που ήδη υπάρχει. Το `null` λέει ακριβώς
  // «δεν έχει γραφτεί τίποτα ακόμη», που το σκέτο `focused` δεν το ξέρει.
  const [draft, setDraft] = useState<string | null>(null);
  const local = draft ?? String(value ?? '');
  const setLocal = setDraft;
  const autoId = useId();
  const inputId = id ?? autoId;

  const handleChange = (raw: string) => {
    // Ο ΓΡΑΜΜΑΤΙΚΟΣ ΕΛΕΓΧΟΣ ΖΕΙ ΣΕ ΕΝΑ ΣΗΜΕΙΟ. Ήταν γραμμένος εδώ και ΠΟΥΘΕΝΑ
    // αλλού: τα χειροποίητα πεδία ποσού των παραθύρων (μισθωτήριο,
    // αναπροσαρμογή, κατανομή) δέχονταν πλην και γράμματα. Τώρα και τα δύο
    // περνούν από την ίδια `acceptNumeric` (lib/core/numInput.ts), οπότε μια
    // διόρθωση εδώ φτάνει παντού.
    const normalized = acceptNumeric(raw, max);
    if (normalized === null) return;
    // Η οθόνη παίρνει κόμμα, ο γονέας τελεία: μία τιμή, δύο αναγνώστες.
    if (normalized === '' || normalized === '.') { setLocal(forDisplay(normalized)); return; }
    const n = parseFloat(normalized);
    // ΤΟ ΚΑΤΩΤΑΤΟ ΟΡΙΟ ΔΕΝ ΚΡΙΝΕΤΑΙ ΣΤΟ ΚΑΘΕ ΠΛΗΚΤΡΟ. Όποιος γράφει «2026» περνά
    // πρώτα από το «2», το «20» και το «202» — και τα τρία είναι μικρότερα από το
    // 2000. Με έλεγχο εδώ, κάθε ενδιάμεσο πάτημα απορριπτόταν και το πεδίο δεν
    // άλλαζε ΠΟΤΕ: το «Έτος» της πληρωμής ενοικίου (min 2000) ήταν αδύνατο να
    // διορθωθεί, και στη διάρκεια δανείου (min 3) δεν γράφονταν τα 10, 15, 20, 25.
    // Το `min` ζει στο `handleBlur`, που κάνει clamp μία φορά, στο τέλος. Το
    // αρνητικό δεν χρειάζεται όριο: δεν είναι καν έγκυρος χαρακτήρας πια.
    setLocal(forDisplay(normalized));
    if (!isNaN(n)) onChange(normalized);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setFocused(true);
    if (local === '0') setLocal('');
    setTimeout(() => e.target.select(), 0);
  };

  const handleBlur = () => {
    setFocused(false);
    const n = parseFloat(local.replace(',', '.'));
    // Το πρόχειρο ΣΒΗΝΕΙ και στις δύο διαδρομές: η τιμή που μένει είναι αυτή
    // που μόλις στάλθηκε στον γονέα, και από εκεί θα ξαναδιαβαστεί. Αν έμενε,
    // το πεδίο θα κρατούσε τη δική του εκδοχή ακόμη κι όταν ο γονέας άλλαζε
    // την τιμή από αλλού (φόρτωση, επαναφορά, άλλο ακίνητο).
    if (isNaN(n) || local === '' || local === '.') {
      const fallback = String(min ?? 0);
      setDraft(null); onChange(fallback);
    } else {
      const clamped = min !== undefined && n < min ? min : max !== undefined && n > max ? max : n;
      setDraft(null); onChange(String(clamped));
    }
  };

  // ΤΑ ΠΟΣΑ ΣΕ ΕΥΡΩ ΓΡΑΦΟΝΤΑΙ ΩΣ ΠΟΣΑ, ΚΑΙ ΟΤΑΝ ΕΙΝΑΙ ΠΕΔΙΟ.
  //
  // Το πεδίο έδειχνε ό,τι του έδινε ο κώδικας: «3.9» εκεί που ολόκληρη η
  // εφαρμογή γράφει «3,90 €», και «1112» εκεί που γράφει «1.112,00 €». Δεν
  // ήταν αθώο: το ίδιο ποσό εμφανιζόταν με δύο μορφές στην ίδια οθόνη, και η
  // τελεία διαβάζεται από Έλληνα ως διαχωριστικό χιλιάδων.
  //
  // ΜΟΝΟ ΟΣΟ ΔΕΝ ΓΡΑΦΕΙ Ο ΧΡΗΣΤΗΣ. Με την εστίαση επιστρέφει ο γυμνός αριθμός,
  // αλλιώς θα πάλευε με κόμματα και τελείες που βάζει άλλος. Και μόνο στα ευρώ:
  // το «Έτος 2026» δεν είναι ποσό και δεν γίνεται «2.026,00».
  const euro = suffix === '€';
  // Ο,τι κρατά το πρόχειρο είναι γραμμένο για την οθόνη (με κόμμα): για να
  // διαβαστεί ως αριθμός περνά πρώτα στην κανονική μορφή.
  const parsed = parseFloat(local.replace(',', '.'));

  // ═══ Η ΤΕΛΕΙΑ ΔΕΝ ΕΠΙΤΡΕΠΕΤΑΙ ΟΥΤΕ ΓΙΑ ΜΙΑ ΣΤΙΓΜΗ ══════════════════════════
  // ΤΙ ΜΕΤΡΗΘΗΚΕ. Ο παλιός κανόνας μορφοποιούσε ΜΟΝΟ όσο το πεδίο ήταν
  // ανεστίαστο ΚΑΙ μόνο αν το επίθεμα ήταν «€». Δηλαδή:
  //
  //   · Πατώντας ένα ποσό, το «84,50» γινόταν «84.5» — τελεία, και χαμένο το
  //     δεύτερο δεκαδικό. Μετρημένο σε πραγματικό Chromium: «87,45» → «87.45»,
  //     «84,50» → «84.5», «97,50» → «97.5».
  //   · Στα 26 πεδία ποσοστού και σε όσα μετρούν τ.μ., kWh ή ‰, η τελεία δεν
  //     έφευγε ΠΟΤΕ: το `fn` δεν έτρεχε καθόλου εκεί.
  //
  // Το ίδιο αρχείο lib/core/numInput.ts το γράφει: «η τελεία διαβάζεται από
  // Έλληνα ως διαχωριστικό χιλιάδων». Ενα «84.5» σε πεδίο ευρώ δεν είναι απλώς
  // ασυνεπές, είναι διφορούμενο.
  //
  // Ο ΔΙΑΧΩΡΙΣΜΟΣ ΠΟΥ ΜΕΝΕΙ. Η ομαδοποίηση χιλιάδων φεύγει με την εστίαση, και
  // σωστά: το «1.112,00» δεν επεξεργάζεται, γιατί η `acceptNumeric` απορρίπτει
  // τη δεύτερη τελεία και το πλήκτρο θα αγνοούνταν. Η ΥΠΟΔΙΑΣΤΟΛΗ όμως μένει
  // κόμμα και στις δύο καταστάσεις — «1112,00» γράφεται μια χαρά.
  const bare = (n: number) => (euro ? n.toFixed(2) : String(n)).replace('.', ',');
  const shown =
    // Οσο γράφει ο χρήστης, η οθόνη είναι δική του: το πρόχειρο περνά αυτούσιο.
    draft !== null ? local
    : local === '' || isNaN(parsed) ? local
    // Εστιασμένο: επεξεργάσιμο, χωρίς χιλιάδες, με ελληνικό κόμμα.
    : focused ? bare(parsed)
    // Ανεστίαστο: ποσό σε πλήρη μορφή, οτιδήποτε άλλο με σκέτο κόμμα.
    : euro ? fn(parsed, 2) : bare(parsed);

  // FIX: calculate suffix padding based on string length
  // Short suffixes (€, %, η, ω) → 12px each side
  // Medium (kWh, τ.μ., Mbps) → 10px each side, slightly more space
  // Long (άτομα, kWp, τεμ.) → 8px each side, ensure min content fits
  const getSuffixPadding = (s: string) => {
    const len = s.length;
    if (len <= 2) return '0 12px';
    if (len <= 4) return '0 10px';
    return '0 8px';
  };

  return (
    <div className={className}>
      {label && <label htmlFor={inputId} style={fieldLabelStyle}>{label}{infoNode(labelInfo)}</label>}
      <div style={{
        width: '100%',
        background: 'var(--bg-surface)',
        border: `1px solid ${fieldBorderColor(focused)}`,
        boxShadow: fieldRing(focused),
        borderRadius: FIELD_RADIUS,
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        opacity: disabled ? 0.5 : 1,
        height: FIELD_HEIGHT,
      }}>
        {prefix && (
          <span style={{
            padding: '0 12px',
            fontFamily: T.font.sans,
            fontSize: 14,
            color: 'var(--text-secondary)',
            background: 'var(--bg-elevated)',
            alignSelf: 'stretch',
            display: 'flex',
            alignItems: 'center',
            borderRight: `1px solid var(--border-subtle)`,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>{prefix}</span>
        )}
        {/* ΤΟ ΥΨΟΣ ΤΟ ΟΡΙΖΕΙ ΤΟ ΠΛΑΙΣΙΟ, ΟΧΙ ΤΟ ΠΕΔΙΟ. Το περίβλημα είναι ήδη
            T.h.lg, δηλαδή 44 στο δάχτυλο, και κόβει το ξεχείλισμα ώστε το «€»
            να κάθεται κολλητά στην άκρη. Οταν το δάπεδο αφής ανέβασε ΚΑΙ το
            πεδίο στα 44, το πεδίο έγινε ψηλότερο από το κουτί που το κρατά:
            μετρημένο κόψιμο ενός εικονοστοιχείου πάνω και κάτω, σε κάθε ποσό
            της εφαρμογής. Η κλάση το εξαιρεί.

            ΤΟ ΑΚΡΙΒΕΣ ΝΟΥΜΕΡΟ ΕΙΝΑΙ 42, ΟΧΙ 44. Το περίβλημα μετρά 44, αλλά η
            τρίχα του περιγράμματος δεν εστιάζει το πεδίο: με elementFromPoint
            σε 390, 430 και 768, το πάτημα πιάνει 42 ως 43. Η διαφορά είναι δύο
            εικονοστοιχεία στην ίδια την άκρη της γραμμής, και ο περιηγητής τα
            καλύπτει με τη δική του προσαρμογή αφής. Καταγράφεται όπως
            μετρήθηκε, ώστε να μη λέει ο κώδικας 44 εκεί που το δάχτυλο βρίσκει
            42. */}
        <input
          className="po-field-inner"
          id={inputId}
          aria-label={label ? undefined : ariaLabel}
          type="text"
          inputMode="decimal"
          value={shown}
          onChange={e => handleChange(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          style={{
            flex: 1,
            // Το πεδίο ΓΕΜΙΖΕΙ το πλαίσιο κάθετα. Με «align-items: center» στο
            // περίβλημα έμενε στο ύψος του κειμένου του, 39 εικονοστοιχεία μέσα
            // σε κουτί 44: το δάχτυλο που πατούσε λίγο πιο πάνω ή πιο κάτω από
            // τη μέση δεν έπιανε τίποτα, παρότι το πλαίσιο φαινόταν πατημένο.
            alignSelf: 'stretch',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            padding: '0 14px',
            color: 'var(--text-primary)',
            fontSize: 14,
            fontFamily: T.font.mono,
            letterSpacing: 0,
            minWidth: 0,
          }}
        />
        {suffix && (
          <span style={{
            // FIX: dynamic padding + never shrink below content width
            padding: getSuffixPadding(suffix),
            fontFamily: T.font.sans,
            fontSize: suffix.length > 4 ? 12 : 14,
            color: 'var(--text-secondary)',
            background: 'var(--bg-elevated)',
            alignSelf: 'stretch',
            display: 'flex',
            alignItems: 'center',
            borderLeft: `1px solid var(--border-subtle)`,
            whiteSpace: 'nowrap',
            flexShrink: 0,
            // FIX: ensure enough width for the content
            minWidth: 'max-content',
          }}>{suffix}</span>
        )}
      </div>
    </div>
  );
}

// ─── Custom Select Dropdown ───────────────────────────────────────────────────
interface SelectOption {
  value: string;
  label: string;
  description?: string;
  color?: string;
  dot?: string;
  header?: string; // προαιρετική επικεφαλίδα ομάδας (εμφανίζεται πριν από αυτή την επιλογή)
}

interface CustomSelectProps {
  label?: string;
  /**
   * Χωρίς ετικέτα, ο επιλογέας ονομάζεται από την ΤΙΜΗ του — δηλαδή αλλάζει
   * όνομα κάθε φορά που ο χρήστης επιλέγει κάτι, και σε λίστα με μία γραμμή
   * ανά αντικείμενο ακούγονται είκοσι επιλογείς που λένε «Καλή», «Καλή»…
   * Το `ariaLabel` δίνει σταθερό όνομα που λέει ΤΙ ρυθμίζει, όχι τι δείχνει.
   */
  ariaLabel?: string;
  labelInfo?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
}

export function CustomSelect({
  label, ariaLabel, labelInfo, value, onChange, options, placeholder = 'Επιλογή…', disabled,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  // Το μενού ζωγραφίζεται σε portal (fixed) ώστε να μην «κόβεται» ποτέ από modal ή
  // scroll container. Ανοίγει προς τα κάτω· γυρίζει προς τα πάνω μόνο αν πραγματικά
  // δεν χωράει, με ύψος που προσαρμόζεται στον διαθέσιμο χώρο (εσωτερικό scroll).
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; minWidth: number; maxH: number; up: boolean }>({ top: 0, left: 0, minWidth: 0, maxH: 264, up: false });
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optRefs = useRef<(HTMLDivElement | null)[]>([]);
  // useId(): σταθερό αναγνωριστικό σε server και client (χωρίς hydration mismatch).
  const baseId = useId();
  // ΨΕΥΤΙΚΟ REF. Ήταν `const idRef = { current: baseId }` — αντικείμενο που
  // ξαναφτιαχνόταν σε κάθε απόδοση και του οποίου το `.current` ήταν ΠΑΝΤΑ το
  // `baseId`. Δεν έκανε τίποτα, αλλά ο μεταγλωττιστής της React το διάβαζε ως
  // πρόσβαση σε ref κατά την απόδοση και το σημείωνε τρεις φορές.
  const listId = `${baseId}-list`;
  const labelId = `${baseId}-label`;
  const selected = options.find(o => o.value === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Κράτα ορατή την επιλογή που «φωτίζεται» με το πληκτρολόγιο.
  useEffect(() => {
    if (open && activeIndex >= 0) optRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  // Θέση μενού: προτίμηση προς τα κάτω· γύρισμα προς τα πάνω μόνο αν από κάτω δεν
  // χωράει εύλογο μενού. Το ύψος προσαρμόζεται στον διαθέσιμο χώρο (εσωτερικό scroll),
  // ώστε ποτέ να μη «κόβεται» ή να βγαίνει εκτός οθόνης.
  const reposition = () => {
    const el = triggerRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const GAP = 4, MARGIN = 8, DESIRED = 264;
    const below = window.innerHeight - r.bottom - MARGIN;
    const above = r.top - MARGIN;
    // Προτίμηση ΠΡΟΣ ΤΑ ΚΑΤΩ: το μενού κάνει εσωτερικό scroll, οπότε ανοίγει κάτω
    // ακόμη κι όταν ο χώρος είναι περιορισμένος. Γυρίζει πάνω ΜΟΝΟ όταν ο χώρος
    // κάτω είναι πραγματικά ελάχιστος (και υπάρχει σαφώς περισσότερος πάνω).
    const up = below < 132 && above > below + 24;
    const maxH = Math.min(DESIRED, Math.max(112, (up ? above : below) - GAP));
    // ΤΟ ΠΑΝΕΛ ΕΒΓΑΙΝΕ ΕΞΩ ΑΠΟ ΤΗΝ ΟΘΟΝΗ, ΓΙΑΤΙ Η ΣΤΟΙΧΙΣΗ ΚΟΙΤΟΥΣΕ ΛΑΘΟΣ ΠΛΑΤΟΣ.
    // Ο περιορισμός γραφόταν με το πλάτος του ΚΟΥΜΠΙΟΥ (`r.width`), αλλά το πάνελ
    // είναι `minWidth: r.width` ΚΑΙ `maxWidth: min(340px, 86vw)`: όταν το κουμπί
    // είναι στενότερο από 340, το πάνελ μεγαλώνει και βγαίνει έξω δεξιά. Στο
    // κινητό αυτό σήμαινε ότι η δεύτερη γραμμή κάθε επιλογής («Ανταγωνιστικοί
    // όροι · Χωρίς έξοδα εξέτασης») κοβόταν στη μέση της λέξης, και ο χρήστης
    // διάβαζε μισή πρόταση χωρίς να υπάρχει τρόπος να δει την υπόλοιπη.
    //
    // Το ΠΡΑΓΜΑΤΙΚΟ πλάτος είναι το μεγαλύτερο από τα δύο, γιατί στο CSS το
    // `min-width` κερδίζει το `max-width`. Ο περιορισμός γράφεται με αυτό.
    const panelW = Math.max(r.width, Math.min(340, window.innerWidth * 0.86));
    const left = Math.max(8, Math.min(r.left, window.innerWidth - panelW - 8));
    setMenuPos({ top: up ? r.top - GAP : r.bottom + GAP, left, minWidth: r.width, maxH, up });
  };
  useEffect(() => {
    if (!open) return;
    reposition();
    const onScroll = () => reposition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onScroll); };
  }, [open, options.length]);

  const openList = (to?: number) => {
    setOpen(true);
    setActiveIndex(to ?? Math.max(0, options.findIndex(o => o.value === value)));
  };
  const close = () => { setOpen(false); triggerRef.current?.focus(); };
  const selectAt = (i: number) => {
    const opt = options[i];
    if (!opt) return;
    onChange(opt.value); setOpen(false); triggerRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (!open) openList(); else if (activeIndex >= 0) selectAt(activeIndex);
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!open) openList();
        else setActiveIndex(i => Math.min(options.length - 1, i + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!open) openList(options.length - 1);
        else setActiveIndex(i => Math.max(0, i - 1));
        break;
      case 'Home':
        if (open) { e.preventDefault(); setActiveIndex(0); }
        break;
      case 'End':
        if (open) { e.preventDefault(); setActiveIndex(options.length - 1); }
        break;
      case 'Escape':
        // ΤΟ stopPropagation ΔΕΝ ΕΙΝΑΙ ΠΡΟΦΥΛΑΞΗ, ΚΛΕΙΝΕΙ ΣΦΑΛΜΑ.
        // Το Escape ανέβαινε μέχρι το `document`, όπου το ακούει κάθε ανοιχτό
        // παράθυρο. Ο χρήστης άνοιγε τη λίστα «Όροφος» μέσα στον οδηγό
        // προσθήκης ακινήτου, πατούσε Escape για να την κλείσει — και έχανε
        // ΟΛΟΚΛΗΡΟ τον οδηγό με τα πέντε βήματα συμπληρωμένα. Ένα Escape
        // κλείνει ΕΝΑ επίπεδο: πρώτα τη λίστα, μετά το παράθυρο.
        if (open) { e.preventDefault(); e.stopPropagation(); close(); }
        break;
      case 'Tab':
        if (open) setOpen(false);
        break;
    }
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {label && <label style={fieldLabelStyle} id={labelId}>{label}{infoNode(labelInfo)}</label>}
      <div
        ref={triggerRef}
        role="combobox"
        tabIndex={disabled ? -1 : 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        // Η ΑΝΑΦΟΡΑ ΑΚΟΛΟΥΘΕΙ ΤΗΝ ΥΠΑΡΞΗ ΤΟΥ ΣΤΟΧΟΥ. Η λίστα αποδίδεται σε
        // portal μόνο όταν είναι ανοιχτή· όσο ήταν κλειστή, το aria-controls
        // έδειχνε σε id που δεν υπήρχε πουθενά στη σελίδα.
        aria-controls={open ? listId : undefined}
        aria-disabled={disabled || undefined}
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : (ariaLabel || selected?.label || placeholder)}
        aria-activedescendant={open && activeIndex >= 0 ? `${baseId}-opt-${activeIndex}` : undefined}
        onClick={() => !disabled && (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          ...mdInputBase,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          border: `1px solid ${fieldBorderColor(open || focused)}`,
          boxShadow: fieldRing(open || focused),
          padding: '10px 16px',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          {selected?.dot && <div style={{ width: 8, height: 8, borderRadius: '50%', background: selected.dot, flexShrink: 0 }}/>}
          {selected?.color && <div style={{ width: 10, height: 10, borderRadius: 3, background: selected.color, flexShrink: 0 }}/>}
          <span style={{
            fontFamily: T.font.sans,
            fontSize: 14,
            letterSpacing: '0.25px',
            color: selected ? 'var(--text-primary)' : 'var(--text-tertiary)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {selected?.label || placeholder}
          </span>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--text-secondary)" style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none', flexShrink: 0 }} aria-hidden="true">
          <path d="M7 10l5 5 5-5z"/>
        </svg>
      </div>
      {open && createPortal(
        <div ref={menuRef} role="listbox" id={listId} aria-labelledby={label ? labelId : undefined} style={{
          // Portal + fixed: το μενού δεν «κόβεται» ποτέ από modal/scroll container.
          position: 'fixed',
          top: menuPos.top,
          left: menuPos.left,
          transform: menuPos.up ? 'translateY(-100%)' : 'none',
          // Πλάτος στο περιεχόμενο, ποτέ στενότερο από το πεδίο, με ανώτατο όριο.
          minWidth: menuPos.minWidth,
          width: 'max-content',
          maxWidth: 'min(340px, 86vw)',
          background: 'var(--bg-surface)',
          borderRadius: T.radius.inner,
          zIndex: 2000,
          boxShadow: 'var(--elev-3)',
          border: '1px solid var(--border-default)',
          maxHeight: menuPos.maxH,
          overflowY: 'auto',
          padding: '6px',
        }}>
          {options.map((opt, i) => (
            <Fragment key={opt.value}>
            {opt.header && (
              <div style={{
                padding: '10px 12px 5px', fontFamily: T.font.sans, fontSize: 11,
                fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                color: 'var(--text-tertiary)', userSelect: 'none', pointerEvents: 'none',
              }}>{opt.header}</div>
            )}
            <div
              ref={el => { optRefs.current[i] = el; }}
              id={`${baseId}-opt-${i}`}
              role="option"
              aria-selected={opt.value === value}
              onMouseEnter={() => { setHovered(opt.value); setActiveIndex(i); }}
              onMouseLeave={() => setHovered(null)}
              onClick={() => { onChange(opt.value); setOpen(false); triggerRef.current?.focus(); }}
              style={{
                padding: '9px 12px',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                cursor: 'pointer',
                fontFamily: T.font.sans,
                fontSize: 14,
                letterSpacing: 0,
                color: opt.value === value ? 'var(--accent)' : 'var(--text-primary)',
                background: opt.value === value ? 'var(--accent-dim)' : (hovered === opt.value || activeIndex === i) ? 'var(--bg-hover)' : 'transparent',
                outline: activeIndex === i && opt.value !== value ? '1px solid var(--border-accent)' : 'none',
                transition: 'background 0.1s',
              }}
            >
              {opt.dot && <div style={{ width: 8, height: 8, borderRadius: '50%', background: opt.dot, flexShrink: 0 }}/>}
              {opt.color && <div style={{ width: 10, height: 10, borderRadius: 3, background: opt.color, flexShrink: 0 }}/>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ whiteSpace: 'nowrap' }}>{opt.label}</div>
                {opt.description && (
                  <div style={{ fontFamily: T.font.sans, fontSize: 12, color: 'var(--text-secondary)', marginTop: 1, letterSpacing: '0.4px', textWrap: 'pretty', overflowWrap: 'anywhere' }}>{opt.description}</div>
                )}
              </div>
              {opt.value === value && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)" aria-hidden="true"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
              )}
            </div>
            </Fragment>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

// ─── Date Picker ─────────────────────────────────────────────────────────────
const DAYS_GR = ['Δε','Τρ','Τε','Πε','Πα','Σά','Κυ'];

interface DatePickerProps {
  /**
   * Η επεξήγηση, πίσω από την κουκκίδα της ετικέτας.
   *
   * ΥΠΗΡΧΕ ΜΟΝΟ ΣΕ ΔΥΟ ΑΠΟ ΤΑ ΠΕΝΤΕ ΠΕΔΙΑ, και το αποτέλεσμα φαινόταν στις
   * φόρμες: όποιο πεδίο δεν μπορούσε να κρύψει την εξήγησή του, την τύπωνε ως
   * μόνιμη παράγραφο από κάτω. Δύο ιδιώματα για το ίδιο πράγμα, δίπλα δίπλα.
   */
  labelInfo?: ReactNode;
  label?: string;
  /**
   * Χωρίς ετικέτα, το ημερολόγιο ονομαζόταν από την τιμή του, και όσο η τιμή
   * είναι κενή, από το placeholder: δύο ημερολόγια στον οδηγό ακινήτου έλεγαν
   * και τα δύο «Επιλογή ημερομηνίας». Το `ariaLabel` δίνει σταθερό όνομα που
   * λέει ΤΙ ρυθμίζει, όχι τι δείχνει. Ιδιο συμβόλαιο με το CustomSelect.
   */
  ariaLabel?: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function DatePicker({ label, labelInfo, ariaLabel, value, onChange, disabled, placeholder = 'Επιλογή ημερομηνίας' }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  // ΤΟ ΗΜΕΡΟΛΟΓΙΟ ΑΝΟΙΓΕ ΣΕ ΛΑΘΟΣ ΜΗΝΑ. Εδώ γραφόταν `new Date(value).getMonth()`:
  // η αποθηκευμένη τιμή «2026-01-15» διαβάζεται σε UTC και ρωτιέται σε τοπική
  // ώρα. Για τιμή της 1ης του μήνα, σε ζώνη με αρνητική απόκλιση, ο επιλογέας
  // άνοιγε στον ΠΡΟΗΓΟΥΜΕΝΟ μήνα — δηλαδή δεν έδειχνε την ημερομηνία που ήδη
  // είχε ο χρήστης, και έπρεπε να πατήσει «επόμενος» για να τη δει.
  // Το `new Date()` χωρίς όρισμα μένει: εκεί κατασκευή και ανάγνωση είναι και
  // οι δύο τοπικές, άρα συμφωνούν.
  const [month, setMonth] = useState(() => (isoMonth(value) ?? new Date().getMonth() + 1) - 1);
  const [year, setYear] = useState(() => isoYear(value) ?? new Date().getFullYear());
  const ref = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  // Το ημερολόγιο ζωγραφίζεται μέσω portal στο body ώστε να μην «κόβεται» από modal
  // ή scroll container (overflow) — σταθερές συντεταγμένες από το κουμπί ενεργοποίησης.
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const reposition = () => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const PANEL_W = 280, GAP = 4, MARGIN = 8;
    // Πραγματικό ύψος πίνακα (μεταβλητό: 5–6 εβδομάδες) — με fallback πριν ζωγραφιστεί.
    const panelH = popupRef.current?.offsetHeight || 344;
    const left = Math.max(MARGIN, Math.min(r.left, window.innerWidth - PANEL_W - MARGIN));
    const below = window.innerHeight - r.bottom - MARGIN;
    // Προτίμηση προς τα κάτω· αν δεν χωράει ολόκληρο, γύρισμα προς τα πάνω, αλλιώς
    // clamp ώστε ο πίνακας να μένει πάντα πλήρως ορατός στην οθόνη.
    let top: number;
    if (below >= panelH) top = r.bottom + GAP;
    else if (r.top - MARGIN > below) top = Math.max(MARGIN, r.top - GAP - panelH);
    else top = Math.max(MARGIN, window.innerHeight - panelH - MARGIN);
    setCoords({ top, left });
  };

  useEffect(() => {
    if (!open) return;
    reposition();
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current && !ref.current.contains(t) && popupRef.current && !popupRef.current.contains(t)) setOpen(false);
    };
    const onScroll = () => reposition();
    document.addEventListener('mousedown', handler);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  const fmtDisplay = (d: string) => {
    if (!d) return '';
    return localDay(d).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = athensToday();

  const pick = (day: number) => {
    const d = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    onChange(d); setOpen(false);
  };

  const prevMonth = () => month === 0 ? (setMonth(11), setYear(y => y-1)) : setMonth(m => m-1);
  const nextMonth = () => month === 11 ? (setMonth(0), setYear(y => y+1)) : setMonth(m => m+1);

  // Ποιος γράφει το όνομα: η ρητή ετικέτα του γονιού, αλλιώς η δική μας. Η τιμή
  // μπαίνει πάντα από πίσω, ώστε το όνομα να λέει και τι ρυθμίζει και τι δείχνει.
  const naming = ariaLabel || label;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {label && <label style={fieldLabelStyle}>{label}{infoNode(labelInfo)}</label>}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-disabled={disabled || undefined}
        aria-label={`${naming ? naming + ': ' : ''}${value ? fmtDisplay(value) : placeholder}`}
        onClick={() => !disabled && setOpen(v => !v)}
        onKeyDown={e => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(v => !v); }
          // Ίδιος λόγος με το CustomSelect: το Escape πάνω σε ανοιχτό
          // ημερολόγιο έκλεινε ΚΑΙ το παράθυρο που το φιλοξενεί.
          else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          ...mdInputBase,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          border: `1px solid ${fieldBorderColor(open || focused)}`,
          boxShadow: fieldRing(open || focused),
          padding: '10px 14px',
          userSelect: 'none',
        }}
      >
        <span style={{ fontFamily: T.font.sans, fontSize: 14, letterSpacing: 0, color: value ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
          {value ? fmtDisplay(value) : placeholder}
        </span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--text-secondary)" aria-hidden="true">
          <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/>
        </svg>
      </div>
      {/* ═══ Ο ΡΟΛΟΣ ΠΟΥ ΕΛΕΙΠΕ, ΚΑΙ ΤΟΝ ΥΠΟΣΧΟΤΑΝ ΤΟ ΙΔΙΟ ΤΟ ΚΟΥΜΠΙ ══════════
          Το χειριστήριο από πάνω δηλώνει «aria-haspopup="dialog"», δηλαδή
          υπόσχεται στον αναγνώστη οθόνης ότι θα ανοίξει διάλογος. Το αναδυόμενο
          όμως ήταν ΓΥΜΝΟ <div> σε portal: χωρίς ρόλο, χωρίς όνομα. Ο χρήστης
          πατούσε Enter, η οθόνη άλλαζε, και δεν ακουγόταν τίποτα — ούτε ότι
          άνοιξε κάτι, ούτε τι είναι.

          `aria-modal="false"` επίτηδες: το ημερολόγιο ΔΕΝ παγιδεύει την εστίαση
          και δεν σκεπάζει τη σελίδα. Δηλώνοντας το αντίθετο θα λέγαμε στον
          αναγνώστη οθόνης να κρύψει ό,τι υπάρχει απ' έξω, ενώ το Tab
          εξακολουθεί να βγαίνει: ψέμα προς την τεχνολογία υποβοήθησης. */}
      {open && createPortal(
        <div ref={popupRef} role="dialog" aria-modal="false" aria-label={`Ημερολόγιο${naming ? ': ' + naming : ''}`} style={{
          position: 'fixed',
          top: coords.top,
          left: coords.left,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 10,
          padding: 16,
          zIndex: 2000,
          width: 280,
          boxShadow: 'var(--shadow-lg)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <button onClick={prevMonth} aria-label="Προηγούμενος μήνας" style={{ width: T.h.sm, height: T.h.sm, borderRadius: T.radius.card, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6z"/></svg>
            </button>
            <span style={{ fontFamily: T.font.sans, fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', letterSpacing: '0.1px' }}>
              {MONTHS_SHORT[month]} {year}
            </span>
            <button onClick={nextMonth} aria-label="Επόμενος μήνας" style={{ width: T.h.sm, height: T.h.sm, borderRadius: T.radius.card, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 0, marginBottom: 4 }}>
            {DAYS_GR.map(d => (
              <div key={d} style={{ fontFamily: T.font.sans, fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', textAlign: 'center', padding: '4px 0', letterSpacing: '0.5px' }}>{d}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 0 }}>
            {Array(firstDay).fill(null).map((_,i) => <div key={`b${i}`}/>)}
            {Array(daysInMonth).fill(null).map((_,i) => {
              const day = i + 1;
              const iso = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
              const isSelected = value === iso;
              const isToday = today === iso;
              return (
                <button
                  key={day}
                  onClick={() => pick(day)}
                  aria-label={localDay(iso).toLocaleDateString('el-GR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  aria-current={isToday ? 'date' : undefined}
                  aria-pressed={isSelected}
                  style={{
                    width: '100%', aspectRatio: '1',
                    borderRadius: '50%',
                    border: 'none',
                    background: isSelected ? 'var(--accent)' : 'transparent',
                    color: isSelected ? 'var(--accent-text)' : isToday ? 'var(--accent)' : 'var(--text-primary)',
                    fontFamily: T.font.sans,
                    fontSize: 13,
                    fontWeight: isToday ? 700 : 400,
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                >
                  {day}
                  {isToday && !isSelected && (
                    <div style={{ position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)' }}/>
                  )}
                </button>
              );
            })}
          </div>
          <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
            <button onClick={() => { onChange(''); setOpen(false); }}
              style={{ height: T.h.md, padding: '0 16px', borderRadius: T.radius.modal, border: 'none', background: 'transparent', color: 'var(--accent)', fontFamily: T.font.sans, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-dim)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              Εκκαθάριση
            </button>
            <button onClick={() => { onChange(today); setOpen(false); }}
              style={{ height: T.h.md, padding: '0 16px', borderRadius: T.radius.modal, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontFamily: T.font.sans, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
              Σήμερα
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── Toggle, Google MD3 Switch ───────────────────────────────────────────────
/**
 * Ο ΔΙΑΚΟΠΤΗΣ ΑΛΛΑΖΕ ΤΟ ΙΔΙΟ ΤΟΥ ΤΟ ΟΝΟΜΑ, ΚΑΙ ΓΙ᾽ ΑΥΤΟ ΟΙ ΦΟΡΜΕΣ ΦΩΝΑΖΑΝ
 * «ΧΩΡΙΣ».
 *
 * Υπήρχε `labelOff`: το κείμενο δίπλα στον διακόπτη άλλαζε ανάλογα με την
 * κατάσταση. Τρεις κλειστοί διακόπτες στη σειρά διάβαζαν «Χωρίς τηλεχειρισμό ·
 * Χωρίς κάμερες · Χωρίς αυτόματη πόρτα», δηλαδή μια οθόνη που απαριθμεί όσα
 * ΔΕΝ έχει ο χρήστης. Και σε δεκατέσσερα σημεία το κείμενο ήταν σκέτο
 * «Ναι»/«Όχι», δηλαδή έλεγε με λέξεις ακριβώς ό,τι δείχνει ήδη ο δείκτης με τη
 * θέση και το χρώμα του.
 *
 * Υπήρχε και τρίτο, σοβαρότερο: το προσβάσιμο όνομα του διακόπτη ήταν το ίδιο
 * κείμενο, άρα ΑΛΛΑΖΕ με την τιμή. Ένας αναγνώστης οθόνης άκουγε το χειριστήριο
 * να μετονομάζεται κάθε φορά που το πατούσες. Το όνομα ενός χειριστηρίου είναι
 * σταθερό· η κατάσταση λέγεται από το `aria-checked`.
 *
 * Τώρα: το κείμενο είναι το ΟΝΟΜΑ του πράγματος και δεν αλλάζει ποτέ. Όπου το
 * όνομα το γράφει ήδη η ετικέτα από πάνω, ο διακόπτης μένει χωρίς κείμενο και
 * παίρνει `ariaLabel`.
 */
interface ToggleProps {
  on: boolean;
  onChange: (v: boolean) => void;
  /** Το όνομα του πράγματος. Σταθερό, ό,τι κι αν είναι η κατάσταση. */
  label?: string;
  /** Το όνομα όταν δεν υπάρχει ορατό κείμενο, γιατί το λέει η ετικέτα από πάνω. */
  ariaLabel?: string;
  size?: 'sm' | 'md';
}

// ═══ Η ΜΠΑΡΑ ΜΑΖΙΚΩΝ ΕΝΕΡΓΕΙΩΝ ════════════════════════════════════════════
//
// ΗΤΑΝ ΓΡΑΜΜΕΝΗ ΔΥΟ ΦΟΡΕΣ ΣΤΟ ΧΕΡΙ, στις Εκκρεμότητες και στο Χαρτοφυλάκιο, και
// είχε ΗΔΗ αποκλίνει σε πέντε σημεία: το σήμα του πλήθους με `borderRadius: 6`
// εδώ και `T.radius.pill` εκεί, βάρος 800 έναντι 700, γραμματοσειρά `mono`
// έναντι `num`, εσωτερική απόσταση κουμπιού 4 έναντι 6, και το κλείσιμο άλλοτε
// εικονίδιο και άλλοτε ο χαρακτήρας «✕».
//
// Καμία από αυτές τις διαφορές δεν αποφασίστηκε ποτέ: προέκυψαν επειδή το ίδιο
// πράγμα γράφτηκε δεύτερη φορά. Ο χρήστης που επιλέγει πολλαπλά στη μία οθόνη
// και μετά στην άλλη βλέπει δύο παραλλαγές του ίδιου εργαλείου.
//
// ΤΙ ΚΡΑΤΗΘΗΚΕ ΑΠΟ ΠΟΙΑ. Οι τιμές που βγαίνουν από τα tokens (pill, `num`,
// βάρος 700) και το εικονίδιο αντί για χαρακτήρα, που είναι το μόνο από τα δύο
// που παραμένει σωστό σε κάθε γραμματοσειρά.
export interface BulkAction {
  label: string;
  onClick: () => void;
  /** «accent» για τη δημιουργική ενέργεια, «strong» για την κύρια. */
  tone?: 'default' | 'strong' | 'accent';
}

export function BulkActionBar({ count, countLabel, actions, onClear, minWidth = 480 }: {
  count: number;
  /** Τι μετρήθηκε, ήδη στον σωστό αριθμό: «επιλεγμένα», «όλα επιλεγμένα». */
  countLabel: string;
  actions: BulkAction[];
  onClear: () => void;
  minWidth?: number;
}) {
  const ink = (t: BulkAction['tone']) =>
    t === 'accent' ? 'var(--accent)' : t === 'strong' ? 'var(--text-primary)' : 'var(--text-secondary)';
  const hover = (t: BulkAction['tone']) => (t === 'accent' ? 'var(--accent-soft)' : 'var(--bg-surface)');
  return (
    <div style={{ position: 'fixed', bottom: 'var(--float-bottom)', left: '50%', transform: 'translateX(-50%)', zIndex: 'var(--float-z)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: T.radius.modal, boxShadow: 'var(--elev-3)', overflow: 'hidden', minWidth: `min(${minWidth}px, calc(100vw - 24px))`, maxWidth: 'calc(100vw - 24px)' }}>
      <div style={{ padding: '12px 18px', borderRight: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
        <div style={{ minWidth: 24, height: 26, padding: '0 6px', borderRadius: T.radius.pill, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--accent-text)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{count}</div>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', fontFamily: T.font.sans }}>{countLabel}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
        {actions.map((a, i, arr) => (
          <button key={a.label} type="button" onClick={a.onClick}
            style={{ flex: 1, padding: '12px 6px', border: 'none', borderRight: i < arr.length - 1 ? '1px solid var(--border-subtle)' : 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: ink(a.tone), fontWeight: 600, fontSize: 13, transition: 'background 0.15s', fontFamily: T.font.sans, whiteSpace: 'nowrap' }}
            onMouseEnter={e => { e.currentTarget.style.background = hover(a.tone); }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
            {a.label}
          </button>
        ))}
      </div>
      <button type="button" aria-label="Ακύρωση επιλογής" onClick={onClear}
        style={{ padding: '12px 16px', border: 'none', borderLeft: '1px solid var(--border-subtle)', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 18, lineHeight: 1, flexShrink: 0, transition: 'background 0.15s' }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-surface)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>
  );
}

/**
 * ΜΟΝΟ Η ΟΨΗ ΤΟΥ ΔΙΑΚΟΠΤΗ, ΧΩΡΙΣ ΚΟΥΜΠΙ.
 *
 * ΓΙΑΤΙ ΞΕΧΩΡΙΣΤΑ. Το `BillsBudget` έχει ρυθμίσεις όπου ΟΛΟΚΛΗΡΗ η κάρτα είναι
 * ο διακόπτης: το `<button>` υπάρχει ήδη, και `<button>` μέσα σε `<button>` δεν
 * είναι έγκυρο HTML. Το σχόλιο εκεί το είχε εντοπίσει σωστά, και η απάντηση
 * ήταν να ξαναζωγραφιστεί το ελατήριο στο χέρι — δηλαδή δεύτερη εμφάνιση για το
 * ίδιο πράγμα, που αποκλίνει στην πρώτη αλλαγή. Ηδη είχε αποκλίνει: `borderRadius: 20`
 * αντί για το ύψος, και δικό της `transition`.
 *
 * Τώρα η όψη ζει ΜΙΑ φορά, εδώ, και τη χρησιμοποιούν και οι δύο: το `Toggle`
 * τυλίγοντάς τη σε κουμπί, και η κάρτα-διακόπτης σκέτη.
 */
export function ToggleTrack({ on, size = 'md' }: { on: boolean; size?: 'sm' | 'md' }) {
  const w = size === 'sm' ? 36 : 52;
  const h = size === 'sm' ? 20 : 32;
  const thumb = on ? (size === 'sm' ? 16 : 24) : (size === 'sm' ? 12 : 16);
  return (
    <span style={{
      display: 'block',
      width: w, height: h, borderRadius: h,
      background: on ? 'var(--accent)' : 'transparent',
      border: `2px solid ${on ? 'var(--accent)' : 'var(--border-default)'}`,
      position: 'relative', boxSizing: 'border-box', flexShrink: 0,
      transition: 'background 0.2s, border-color 0.2s',
    }}>
      <span style={{
        display: 'block',
        width: thumb, height: thumb,
        borderRadius: '50%',
        background: on ? 'var(--accent-text)' : 'var(--text-secondary)',
        position: 'absolute',
        top: '50%',
        transform: 'translateY(-50%)',
        left: on ? `calc(100% - ${thumb}px - 2px)` : '2px',
        transition: 'background-color 0.2s cubic-bezier(0.2,0,0,1), border-color 0.2s cubic-bezier(0.2,0,0,1), color 0.2s cubic-bezier(0.2,0,0,1), box-shadow 0.2s cubic-bezier(0.2,0,0,1), transform 0.2s cubic-bezier(0.2,0,0,1), opacity 0.2s cubic-bezier(0.2,0,0,1)',
        boxShadow: 'var(--elev-1)',
      }}/>
    </span>
  );
}

export function Toggle({ on, onChange, label, ariaLabel, size = 'md' }: ToggleProps) {
  const w = size === 'sm' ? 36 : 52;
  const h = size === 'sm' ? 20 : 32;
  // ═══ Ο ΣΤΟΧΟΣ ΑΦΗΣ ΕΙΝΑΙ 44, Η ΟΨΗ ΜΕΝΕΙ ΟΠΩΣ ΗΤΑΝ ══════════════════════
  //
  // Το κουμπί ΗΤΑΝ το ίδιο το ορατό ελατήριο: 52×32 στο κανονικό μέγεθος και
  // 36×20 στο μικρό. Δηλαδή ο στόχος αφής ήταν 32 και 20 εικονοστοιχεία σε ύψος,
  // ενώ το ελάχιστο αξιόπιστο με δάχτυλο είναι 44. Το μικρό μέγεθος ζει ακριβώς
  // εκεί που πονάει: στη στήλη των ειδοποιήσεων, όπου δέκα διακόπτες στοιβάζονται
  // ο ένας κάτω από τον άλλο και η αστοχία πατά τον διπλανό.
  //
  // ΤΩΡΑ ΤΟ ΚΟΥΜΠΙ ΕΙΝΑΙ 44×44 ΚΑΙ ΤΟ ΕΛΑΤΗΡΙΟ ΖΩΓΡΑΦΙΖΕΤΑΙ ΜΕΣΑ ΤΟΥ. Το
  // αρνητικό περιθώριο επαναφέρει το κουτί ΔΙΑΤΑΞΗΣ στις παλιές διαστάσεις, ώστε
  // καμία σειρά να μη μετακινηθεί ούτε κατά ένα εικονοστοιχείο: η περιοχή που
  // δέχεται το δάχτυλο μεγαλώνει, η εικόνα όχι.
  const hit = 44;
  const boxW = Math.max(w, hit);

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, userSelect: 'none' }}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label || ariaLabel || 'Εναλλαγή'}
        onClick={() => onChange(!on)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(!on); } }}
        style={{
          width: boxW, height: hit,
          margin: `${(h - hit) / 2}px ${(w - boxW) / 2}px`,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent', border: 'none', padding: 0,
          flexShrink: 0, cursor: 'pointer',
        }}
      >
        <ToggleTrack on={on} size={size} />
      </button>
      {/* ΤΟ ΑΝΟΙΧΤΟ ΔΕΝ ΕΙΝΑΙ ΠΡΑΣΙΝΟ. Το ίδιο το primitive έβαφε το «Ναι» με το
          σημασιολογικό πράσινο — μέσα στο κοινό component, δηλαδή σε κάθε
          διακόπτη της εφαρμογής. Το «εισπράττεται μέσω τραπέζης» δεν είναι
          επιτυχία και το «όχι, μετρητά» δεν είναι αποτυχία· είναι δύο νόμιμες
          επιλογές. Η κατάσταση φαίνεται ήδη από τη ΘΕΣΗ του δείκτη· η ένταση
          του κειμένου αρκεί για να ξεχωρίσει το ενεργό. */}
      {label && (
        <span style={{ fontFamily: T.font.sans, fontSize: 14, color: on ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: on ? 600 : 400, letterSpacing: '0.25px', transition: 'color 0.15s' }}>
          {label}
        </span>
      )}
    </span>
  );
}

// ─── Text Input ───────────────────────────────────────────────────────────────
interface TextInputProps {
  /**
   * Η επεξήγηση, πίσω από την κουκκίδα της ετικέτας.
   *
   * ΥΠΗΡΧΕ ΜΟΝΟ ΣΕ ΔΥΟ ΑΠΟ ΤΑ ΠΕΝΤΕ ΠΕΔΙΑ, και το αποτέλεσμα φαινόταν στις
   * φόρμες: όποιο πεδίο δεν μπορούσε να κρύψει την εξήγησή του, την τύπωνε ως
   * μόνιμη παράγραφο από κάτω. Δύο ιδιώματα για το ίδιο πράγμα, δίπλα δίπλα.
   */
  labelInfo?: ReactNode;
  label?: string;
  // Όπως στο NumberInput: `ariaLabel` όταν δεν υπάρχει ορατή ετικέτα, `id`
  // όταν την ετικέτα τη γράφει ο γονιός και θέλει να συνδεθεί με `htmlFor`.
  ariaLabel?: string;
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /**
   * Ο τύπος του πεδίου, ΧΩΡΙΣ 'date'.
   *
   * Ηταν `string`. Ενα `type="date"` που θα περνούσε από εδώ θα απέδιδε το
   * ημερολόγιο του ΠΕΡΙΗΓΗΤΗ: αγγλικά ονόματα ημερών και, το σοβαρό, σειρά
   * ημέρας και μήνα που ορίζει η γλώσσα του και όχι η εφαρμογή. Η γραμμή
   * «08/09/2026» δεν λέει καν αν εννοεί 8 Σεπτεμβρίου ή 9 Αυγούστου.
   *
   * Ο τύπος το κάνει ΑΔΥΝΑΤΟ, αντί να το απαγορεύει φύλακας εκ των υστέρων. Οι
   * ημερομηνίες περνούν από τον DatePicker αυτού του αρχείου.
   */
  type?: 'text' | 'email' | 'tel' | 'url' | 'search' | 'number' | 'password';
  disabled?: boolean;
  prefix?: ReactNode;
  suffix?: ReactNode;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
}

export function TextInput({ label, labelInfo, ariaLabel, id, value, onChange, placeholder, type='text', disabled, prefix, suffix, onKeyDown }: TextInputProps) {
  const [focused, setFocused] = useState(false);
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div>
      {label && <label htmlFor={inputId} style={fieldLabelStyle}>{label}{infoNode(labelInfo)}</label>}
      <div style={{
        display: 'flex', alignItems: 'center',
        background: 'var(--bg-surface)',
        border: `1px solid ${fieldBorderColor(focused)}`,
        boxShadow: fieldRing(focused),
        borderRadius: FIELD_RADIUS,
        overflow: 'hidden',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        opacity: disabled ? 0.5 : 1,
        height: FIELD_HEIGHT,
      }}>
        {prefix && (
          <div style={{ padding: '0 12px', color: 'var(--text-secondary)', fontFamily: T.font.sans, fontSize: 14, background: 'var(--bg-elevated)', alignSelf: 'stretch', display: 'flex', alignItems: 'center', borderRight: '1px solid var(--border-subtle)', flexShrink: 0 }}>
            {prefix}
          </div>
        )}
        <input
          id={inputId}
          aria-label={label ? undefined : ariaLabel}
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            padding: '10px 14px',
            color: 'var(--text-primary)',
            fontFamily: T.font.sans,
            fontSize: 14,
            letterSpacing: 0,
            minWidth: 0,
          }}
        />
        {suffix && (
          <div style={{ padding: '0 12px', color: 'var(--text-secondary)', fontFamily: T.font.sans, fontSize: 14, background: 'var(--bg-elevated)', alignSelf: 'stretch', display: 'flex', alignItems: 'center', borderLeft: '1px solid var(--border-subtle)', flexShrink: 0 }}>
            {suffix}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Textarea ─────────────────────────────────────────────────────────────────
export function Textarea({
  label, labelInfo, value, onChange, placeholder, rows = 3,
}: {
  label?: string; labelInfo?: ReactNode; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
}) {
  const [focused, setFocused] = useState(false);
  const inputId = useId();
  return (
    <div>
      {label && <label htmlFor={inputId} style={fieldLabelStyle}>{label}{infoNode(labelInfo)}</label>}
      <textarea
        id={inputId}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%',
          background: 'var(--bg-surface)',
          border: `1px solid ${fieldBorderColor(focused)}`,
          boxShadow: fieldRing(focused),
          borderRadius: FIELD_RADIUS,
          padding: '10px 14px',
          color: 'var(--text-primary)',
          fontFamily: T.font.sans,
          fontSize: 14,
          letterSpacing: 0,
          boxSizing: 'border-box',
          outline: 'none',
          resize: 'vertical',
          minHeight: 80,
          transition: 'border-color 0.15s, box-shadow 0.15s',
          lineHeight: '20px',
        }}
      />
    </div>
  );
}

// ─── Service By Selector ──────────────────────────────────────────────────────
type ServiceBy = 'owner' | 'tenant' | 'split';
const SB_LABELS: Record<ServiceBy, string> = { owner: 'Ιδιοκτήτης', tenant: 'Ενοικιαστής', split: '50 / 50' };
const SB_COLORS: Record<ServiceBy, string> = { owner: 'var(--warning)', tenant: 'var(--positive)', split: 'var(--accent)' };

export function ServiceBySelect({ label, value, onChange }: { label: string; value: ServiceBy; onChange: (v: ServiceBy) => void }) {
  return (
    <div>
      <label style={fieldLabelStyle}>{label}</label>
      <div style={{ display: 'flex', gap: 4 }}>
        {(['owner', 'tenant', 'split'] as ServiceBy[]).map(v => (
          <button
            key={v}
            onClick={() => onChange(v)}
            style={{
              flex: 1,
              height: T.h.md,
              fontFamily: T.font.sans,
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: '0.1px',
              cursor: 'pointer',
              borderRadius: T.radius.modal,
              border: `1px solid ${value === v ? SB_COLORS[v] : 'var(--border-default)'}`,
              background: value === v ? `var(--accent-dim)` : 'transparent',
              color: value === v ? SB_COLORS[v] : 'var(--text-secondary)',
              transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s',
            }}
          >
            {SB_LABELS[v]}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Frequency Select ─────────────────────────────────────────────────────────
export const FREQ_OPTIONS = [
  { value: '', label: 'Χωρίς' },
  { value: 'monthly', label: 'Μηνιαία' },
  { value: 'quarterly', label: 'Τριμηνιαία' },
  { value: 'biannual', label: 'Εξαμηνιαία' },
  { value: 'annual', label: 'Ετήσια' },
];

// ─── Segment Control, Google Tabs style ─────────────────────────────────────
interface SegmentOption { value: string; label: string; }

/**
 * ═══ Ο ΤΜΗΜΑΤΙΚΟΣ ΕΠΙΛΟΓΕΑΣ ΛΕΕΙ ΠΟΙΟ ΤΜΗΜΑ ΕΙΝΑΙ ΕΝΕΡΓΟ ═══════════════════
 * ΤΙ ΕΛΕΙΠΕ. Η επιλεγμένη κατάσταση φαινόταν ΜΟΝΟ με χρώμα: κανένα
 * `aria-pressed`, κανένα `aria-selected`, κανένας ρόλος ομάδας. Ο χρήστης
 * αναγνώστη οθόνης άκουγε δύο κουμπιά, «Μήνας» και «Έτος», και δεν είχε κανέναν
 * τρόπο να μάθει ποιο από τα δύο ισχύει — ούτε καν ότι είναι εναλλακτικά.
 *
 * ΓΙΑΤΙ `aria-pressed` ΚΑΙ ΟΧΙ `role="radio"`. Το radiogroup φέρνει μαζί του
 * σύμβαση πλοήγησης με βέλη και ΜΙΑ στάση Tab για όλη την ομάδα· τα δύο άλλα
 * τμηματικά χειριστήρια του προϊόντος (εποχικότητα, κύκλος χρέωσης) είναι ήδη
 * κουμπιά με `aria-pressed`, και μία διεπαφή με δύο συμβάσεις για το ίδιο
 * σχήμα είναι χειρότερη από μία ατελή. Ένα ιδίωμα ανά στοιχείο.
 */
export function SegmentControl({ options, value, onChange, ariaLabel }: { options: SegmentOption[]; value: string; onChange: (v: string) => void; ariaLabel?: string }) {
  return (
    <div role="group" aria-label={ariaLabel} style={{
      display: 'flex',
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 8,
      padding: 4,
      gap: 2,
    }}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          style={{
            flex: 1,
            height: T.h.sm,
            paddingLeft: 16,
            paddingRight: 16,
            fontFamily: T.font.sans,
            fontSize: 13,
            fontWeight: value === o.value ? 500 : 400,
            letterSpacing: '0.1px',
            cursor: 'pointer',
            borderRadius: 6,
            border: 'none',
            background: value === o.value ? 'var(--bg-surface)' : 'transparent',
            color: value === o.value ? 'var(--accent)' : 'var(--text-secondary)',
            transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s',
            whiteSpace: 'nowrap',
            boxShadow: value === o.value ? 'var(--shadow-sm)' : 'none',
          }}
          onMouseEnter={e => { if (value !== o.value) e.currentTarget.style.background = 'var(--bg-hover)'; }}
          onMouseLeave={e => { if (value !== o.value) e.currentTarget.style.background = 'transparent'; }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}