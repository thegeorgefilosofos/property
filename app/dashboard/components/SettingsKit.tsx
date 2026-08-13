'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΛΕΞΙΛΟΓΙΟ ΤΩΝ ΡΥΘΜΙΣΕΩΝ: ΤΕΣΣΕΡΑ ΣΧΗΜΑΤΑ, ΓΡΑΜΜΕΝΑ ΜΙΑ ΦΟΡΑ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΠΡΟΒΛΗΜΑ, ΜΕΤΡΗΜΕΝΟ. Η σελίδα «Λογαριασμός» απαρτίζεται από επτά αρχεία,
// και καθένα έγραφε ΜΟΝΟ ΤΟΥ τα ίδια τέσσερα σχήματα:
//
//   «τίτλος + εξήγηση + διακόπτης δεξιά»   σε 4 αρχεία, με 3 περιθώρια
//   «τίτλος + εξήγηση + περιεχόμενο κάτω»  σε 5 αρχεία, με 2 μεγέθη τίτλου
//   «ετικέτα … τιμή»                        σε 3 αρχεία, με 2 στοιχίσεις
//   «αποθηκεύτηκε»                          σε 4 αρχεία, με 3 διαφορετικά λόγια
//
// Το τελευταίο είναι και το χειρότερο: η ίδια επιτυχία λεγόταν «Αποθηκεύτηκε
// ✓» σε πράσινο έντονο, «Αποθηκεύτηκε» σε ουδέτερο, και «Αποθηκεύτηκε» με
// τελίτσα. Ο χρήστης δεν μαθαίνει ποτέ πώς μοιάζει η επιτυχία όταν αλλάζει
// μορφή σε κάθε ενότητα της ΙΔΙΑΣ σελίδας.
//
// ΤΟ ΠΕΡΙΘΩΡΙΟ ΔΕΝ ΓΡΑΦΕΤΑΙ ΕΔΩ. Ζει στο `.po-settings` (app/globals.css), στο
// ΔΟΧΕΙΟ: έτσι η πρώτη γραμμή δεν σπρώχνει και η τελευταία δεν αφήνει
// περίγραμμα να κρέμεται δίπλα στο περίγραμμα της κάρτας. Οι συνιστώσες εδώ
// δεν ξέρουν αν είναι πρώτες ή τελευταίες, και δεν χρειάζεται.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { T, TT } from '@/components/Theme';

/** Δοχείο μιας ενότητας ρυθμίσεων: δίνει τον κοινό ρυθμό στα παιδιά του. */
export function SetList({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div className="po-settings" style={style}>{children}</div>;
}

/**
 * Η γραμμή ρύθμισης, σε μία μορφή που καλύπτει και τις δύο περιπτώσεις.
 *
 * Με `control`, ο διακόπτης κάθεται δεξιά στο ύψος του τίτλου — έτσι διαβάζεται
 * η στήλη των διακοπτών κατακόρυφα, με μια ματιά. Με `children`, το
 * περιεχόμενο (φόρμα, κουμπί, πεδίο) κατεβαίνει από κάτω, γιατί μια φόρμα
 * τριών πεδίων στριμωγμένη δεξιά από μια εξήγηση δύο σειρών δεν διαβάζεται.
 * Τα δύο συνδυάζονται: διακόπτης δεξιά, και ό,τι αποκαλύπτει από κάτω.
 */
export function SetRow({ title, desc, control, children }: {
  title: string;
  desc?: ReactNode;
  control?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: control ? 'center' : 'flex-start', justifyContent: 'space-between', gap: T.sp.lg }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...TT.body, fontWeight: 600 }}>{title}</div>
          {desc && <div style={{ ...TT.bodySm, color: 'var(--text-tertiary)', marginTop: 3 }}>{desc}</div>}
        </div>
        {control && <div style={{ flexShrink: 0 }}>{control}</div>}
      </div>
      {children && <div style={{ marginTop: 12 }}>{children}</div>}
    </div>
  );
}

/**
 * «Ετικέτα … τιμή»: στοιχείο που διαβάζεται, δεν αλλάζει.
 *
 * Η τιμή στοιχίζεται δεξιά και σε tabular ψηφία, ώστε δύο τέτοιες γραμμές
 * η μία κάτω από την άλλη να ευθυγραμμίζονται στο τέλος τους.
 */
export function SetFact({ label, value, muted = false }: { label: string; value: ReactNode; muted?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: T.sp.lg }}>
      <span style={{ ...TT.bodySm, color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ ...TT.body, fontWeight: 600, color: muted ? 'var(--text-tertiary)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', textAlign: 'right', overflowWrap: 'anywhere' }}>{value}</span>
    </div>
  );
}

/** Η μικρή ετικέτα που χωρίζει υποομάδες μέσα σε ενότητα. */
export function SetGroup({ children }: { children: ReactNode }) {
  return <div style={{ ...TT.label, color: 'var(--text-tertiary)', marginBottom: 2 }}>{children}</div>;
}

// ── Η ΑΠΟΘΗΚΕΥΣΗ, ΜΕ ΕΝΑ ΠΡΟΣΩΠΟ ──────────────────────────────────────────

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Η μία ένδειξη αποθήκευσης όλης της σελίδας.
 *
 * ΧΩΡΙΣ ΠΡΑΣΙΝΟ ΣΤΗΝ ΕΠΙΤΥΧΙΑ. Το πράσινο είναι σήμα κινδύνου που έχει
 * αντιστραφεί: όταν κάθε επιτυχία φωσφορίζει, η οθόνη γεμίζει χρώμα που δεν
 * λέει τίποτα, και το χρώμα παύει να σημαίνει κάτι όταν χρειαστεί. Η επιτυχία
 * είναι η κανονική κατάσταση και γράφεται με τα κανονικά γράμματα. Η αποτυχία
 * κρατά το χρώμα της, γιατί ζητά κίνηση.
 */
export function SaveNote({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  if (state === 'error') {
    return <span style={{ ...TT.bodySm, color: 'var(--negative)' }}>Δεν αποθηκεύτηκε. Δοκίμασε ξανά.</span>;
  }
  return (
    <span style={{ ...TT.bodySm, color: 'var(--text-secondary)', fontWeight: 600 }}>
      {state === 'saving' ? 'Αποθήκευση…' : 'Αποθηκεύτηκε'}
    </span>
  );
}

/**
 * Αποθήκευση χωρίς κουμπί, με μία αναμονή.
 *
 * ΓΙΑΤΙ ΟΧΙ ΚΟΥΜΠΙ. Στη σελίδα «Λογαριασμός» οι μισές ρυθμίσεις αποθηκεύονταν
 * μόνες τους (θέμα, ορίζοντας, προσβασιμότητα, δεδομένα κοινότητας) και οι
 * άλλες μισές ζητούσαν πάτημα. Ο χρήστης που έμαθε το πρώτο έφευγε από τις
 * ειδοποιήσεις χωρίς να έχει αποθηκεύσει τίποτα — και δεν του το έλεγε κανείς.
 * Μία συμπεριφορά, ένα πάτημα λιγότερο, καμία απώλεια.
 *
 * Η `save` κρατιέται σε αναφορά: αλλιώς κάθε απόδοση θα έφτιαχνε νέα συνάρτηση,
 * ο χρονοδιακόπτης θα ξαναστηνόταν, και η αναμονή δεν θα τελείωνε ποτέ όσο ο
 * χρήστης πληκτρολογεί.
 */
export function useAutosave<V>(save: (v: V) => Promise<boolean>, delay = 800) {
  const [state, setState] = useState<SaveState>('idle');
  const saveRef = useRef(save);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fade = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { saveRef.current = save; });
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (fade.current) clearTimeout(fade.current);
  }, []);

  const schedule = useCallback((v: V) => {
    if (timer.current) clearTimeout(timer.current);
    if (fade.current) clearTimeout(fade.current);
    setState('saving');
    timer.current = setTimeout(async () => {
      const ok = await saveRef.current(v);
      setState(ok ? 'saved' : 'error');
      // Η επιτυχία σβήνει μόνη της· το σφάλμα μένει μέχρι την επόμενη απόπειρα,
      // γιατί ζητά κίνηση από τον χρήστη.
      if (ok) fade.current = setTimeout(() => setState('idle'), 2200);
    }, delay);
  }, [delay]);

  return { state, schedule };
}
