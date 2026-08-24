'use client';

// ═══════════════════════════════════════════════════════════════════════════
// PROPERTY OS, Theme.tsx (Κοινά Components Σχεδίασης v1.0)
// ─────────────────────────────────────────────────────────────────────────
// Τα δομικά στοιχεία που ήδη χρησιμοποιούν τα Bills tabs, εξαγμένα σε ΕΝΑ
// αρχείο ώστε ΟΛΑ τα tabs (Επισκόπηση, Δαπάνες, Ημερολόγιο, Ενοικιαστής,
// Αποδόσεις, Δάνειο, Απογραφή, Checklist, Επαφές) να τα εισάγουν από εδώ.
//
// Χρήση σε οποιοδήποτε tab:
//   import { T, fe, Card, SecHdr, KPIGrid, Badge, InfoBanner } from '@/components/Theme';
//
// Πηγή αλήθειας για τα tokens (χρώματα/κενά/ακτίνες) είναι το app/globals.css
// (Google Material Design 3). Εδώ δεν ορίζουμε χρώματα, μόνο τα καταναλώνουμε
// μέσω των σημασιολογικών μεταβλητών (--accent, --info, --positive, --warning,
// --negative, --bg-*, --text-*, --border-*).
// ═══════════════════════════════════════════════════════════════════════════

import { ReactNode, CSSProperties, useState, useEffect, useRef, useSyncExternalStore } from 'react';

// Τα tokens ζουν σε module ΧΩΡΙΣ React (components/tokens.ts) ώστε να μπορεί να
// τα εισάγει και Server Component. Εδώ ξανα-εξάγονται αυτούσια, ώστε τα ~600
// σημεία που γράφουν `from '@/components/Theme'` να μη χρειαστεί να αλλάξουν.
export { T, TT, formGrid, fieldRow, fixedCols, tileGrid, tileRow, fe, feAuto, feRate, feCompact, fp, feOr, fpOr, DASH, fn, fd, fdLong, localDay, histInputStyle, ABSENT, ABSENT_DATE, ABSENT_SHORT, grUpper } from './tokens';
export type { Tone } from './tokens';
import { T, TT, fe, isBlankMetric, type Tone } from './tokens';

// ═══ Skeleton, placeholder φόρτωσης (αντικαθιστά τα «Φόρτωση…») ══════════
export function Skeleton({ w = '100%', h = 14, r = 8, style }: { w?: number | string; h?: number | string; r?: number; style?: CSSProperties }) {
  return <div className="skeleton" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

// ═══ SkeletonKPIs, σειρά από skeleton κάρτες μετρικών ═════════════════════
export function SkeletonKPIs({ n = 4 }: { n?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 150px), 1fr))`, gap: 10, marginBottom: 16 }}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="kpi-card" style={{ pointerEvents: 'none' }}>
          <Skeleton w={70} h={9} style={{ marginBottom: 12 }} />
          <Skeleton w={90} h={20} />
        </div>
      ))}
    </div>
  );
}

// ═══ Spinner, κυκλικός δείκτης φόρτωσης (Google style) ════════════════════
export function Spinner({ size = 22, label }: { size?: number; label?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 40 }}>
      <div style={{ width: size, height: size, borderRadius: '50%', border: `${Math.max(2, size / 12)}px solid var(--border-subtle)`, borderTopColor: 'var(--accent)', animation: 'spin 0.7s linear infinite' }} />
      {label && <span style={{ ...TT.bodySm, color: 'var(--text-tertiary)' }}>{label}</span>}
    </div>
  );
}

// ── Σημασιολογικοί τόνοι, ρόλοι, όχι αυθαίρετα χρώματα ────────────────────
const toneVars = (tone: Tone) => {
  if (tone === 'neutral')
    return { color: 'var(--text-secondary)', bg: 'var(--bg-elevated)', border: 'var(--border-subtle)' };
  // Το μελάνι ΔΕΝ είναι ο τόνος. Το χαρτί του σήματος είναι tint του ίδιου
  // τόνου, οπότε μελάνι και χαρτί έλκονταν μεταξύ τους και η αντίθεση έπεφτε
  // κάτω από το όριο σε κάθε τόνο. Το `-on-container` είναι ο ίδιος τόνος
  // μετακινημένος όσο χρειάζεται — βλ. app/globals.css.
  return { color: `var(--${tone}-on-container)`, bg: `var(--${tone}-soft)`, border: `var(--${tone}-border)` };
};

// ═══ Card, η βασική επιφάνεια κάθε ενότητας ═══════════════════════════════
//
// ΓΙΑΤΙ ΕΧΕΙ PROPS ΚΑΙ ΔΕΝ ΕΙΝΑΙ ΜΙΑ ΣΤΑΘΕΡΗ ΕΠΙΦΑΝΕΙΑ: μετρήθηκαν 13 χειρόγραφα
// αντίγραφα της «κάρτας ενότητας» στην εφαρμογή, με 5 διαφορετικά paddings και
// δύο επιφάνειες που ΕΠΙΤΗΔΕΣ δεν έχουν ορατή περίμετρο (καρτέλα Λογιστικής).
// Η αιτία δεν ήταν αμέλεια: το primitive δεν κάλυπτε αυτές τις πραγματικές
// ανάγκες, οπότε όποιος τις είχε έγραφε δικό του αντικείμενο από την αρχή.
// Οι προεπιλογές μένουν ΑΚΡΙΒΩΣ όπως πριν, ώστε καμία υπάρχουσα χρήση να μην
// αλλάξει όψη.
const CARD_PAD = { sm: T.sp.lg, md: 18, lg: T.sp.xl } as const;

export function Card({ children, style, className, pad = 'sm', gap = true, elevation = 'raised', tabIndex }: {
  children: ReactNode; style?: CSSProperties; className?: string;
  /** Εστιάσιμη κάρτα: το tap σε κινητό αποκαλύπτει ό,τι το hover σε desktop (focus-within). */
  tabIndex?: number;
  /** Εσωτερικό περιθώριο: sm=16 (προεπιλογή), md=18, lg=20. */
  pad?: 'sm' | 'md' | 'lg';
  /** false = χωρίς κάτω περιθώριο, όταν η κάρτα ζει μέσα σε flex/grid με δικό του gap. */
  gap?: boolean;
  /** 'flat' = καμία ορατή περίμετρος, μόνο βάθος (η γλώσσα της καρτέλας Λογιστικής). */
  elevation?: 'raised' | 'flat';
}) {
  const flat = elevation === 'flat';
  return (
    <div className={className} tabIndex={tabIndex} style={{
      background: 'var(--surface-raised)',
      border: flat ? 'none' : '1px solid var(--border-raised)',
      borderRadius: T.radius.card, padding: CARD_PAD[pad], marginBottom: gap ? T.sp.lg : 0,
      boxShadow: flat ? 'var(--elev-1)' : 'var(--highlight-inset), var(--elev-1)', ...style,
    }}>
      {children}
    </div>
  );
}

// ═══ useOverlayShell — η συμπεριφορά κάθε επικάλυψης, μία φορά ════════════
// Escape, εστίαση μέσα και επιστροφή μετά, κλείδωμα κύλισης φόντου. Ήταν
// γραμμένη στο Modal και ΘΑ ξαναγραφόταν στο SideSheet — δηλαδή θα φτιάχναμε
// ακριβώς τη διπλοεγγραφή που ήρθαμε να σβήσουμε. Ζει εδώ, τη μοιράζονται.
// ── Η ΣΤΟΙΒΑ ΤΩΝ ΑΝΟΙΧΤΩΝ ΕΠΙΚΑΛΥΨΕΩΝ ────────────────────────────────────
// ΤΟ ΣΦΑΛΜΑ, ΜΕΤΡΗΜΕΝΟ. Κάθε επικάλυψη έδενε δικό της ακροατή Escape στο
// `document`. Όταν ένα παράθυρο ανοίγει ΜΕΣΑ σε ντοσιέ —«Επεξεργασία» μέσα
// στην καρτέλα επαφής, «Σάρωση απόδειξης» μέσα στην καρτέλα ενοικιαστή— και
// τα δύο άκουγαν, και ένα Escape έκλεινε ΚΑΙ ΤΑ ΔΥΟ: ο χρήστης ήθελε να
// κλείσει τη φόρμα και βρισκόταν πίσω στη λίστα, με το ντοσιέ χαμένο.
// Οκτώ ζευγάρια σε πέντε οθόνες.
//
// Εδώ μένει ποια είναι ανοιχτή και με ποια σειρά. Στο Escape απαντά ΜΟΝΟ η
// κορυφαία, και το z-index ανεβαίνει με το βάθος — αλλιώς Modal και SideSheet
// είχαν ΤΟ ΙΔΙΟ 1000 και κέρδιζε όποιο έτυχε να γραφτεί τελευταίο στο DOM.
// Η φόρμα επεξεργασίας ζωγραφιζόταν ΚΑΤΩ από το πέπλο του ντοσιέ: ο χρήστης
// πατούσε «Επεξεργασία» και δεν έβλεπε τίποτα.
const overlayStack: symbol[] = [];
const overlayWatchers = new Set<() => void>();
const notifyOverlays = () => overlayWatchers.forEach(fn => fn());
export const OVERLAY_BASE_Z = 1000;

/**
 * Υπάρχει ανοιχτό παράθυρο ή ντοσιέ αυτή τη στιγμή;
 *
 * Το χρειάζεται όποια ΟΘΟΝΗ ακούει Escape για δικό της λόγο — οι Εκκρεμότητες
 * το χρησιμοποιούν για να καθαρίσουν τη μαζική επιλογή. Χωρίς αυτό, ο χρήστης
 * που διάλεξε δέκα εργασίες, πάτησε «Διαγραφή» και μετά μετάνιωσε με Escape
 * ακύρωνε την ερώτηση ΚΑΙ έχανε τις δέκα επιλογές: πλήρωνε την ακύρωση
 * ξαναδιαλέγοντας τα πάντα.
 *
 * Η εναλλακτική ήταν να απαριθμεί κάθε οθόνη τα δικά της παράθυρα με το χέρι
 * (`showTemplates || showAddModal || !!receiptItem || …`) — κατάλογος που
 * ξεμένει πίσω την επόμενη φορά που θα προστεθεί παράθυρο, σιωπηλά.
 */
export const isOverlayOpen = (): boolean => overlayStack.length > 0;

function useOverlayShell(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Πού γυρίζει η εστίαση όταν κλείσει. Χωρίς αυτό, ο χρήστης πληκτρολογίου
  // πέφτει στο <body> και ξαναρχίζει το Tab από την κορυφή της σελίδας.
  const returnTo = useRef<HTMLElement | null>(null);
  // Σταθερή ταυτότητα ανά επικάλυψη, χωρίς ref: το `useState` με αρχικοποιητή
  // τρέχει ΜΙΑ φορά και διαβάζεται ελεύθερα στην απόδοση — ένα ref δεν
  // επιτρέπεται να διαβαστεί εκεί, και το Symbol πρέπει να είναι διαθέσιμο στην
  // απόδοση για να βγει το βάθος από τη στοίβα.
  const [id] = useState(() => Symbol('overlay'));

  // Το βάθος ΔΙΑΒΑΖΕΤΑΙ από τη στοίβα, δεν αντιγράφεται σε state. Ένα
  // `setDepth` μέσα σε effect θα προκαλούσε δεύτερη απόδοση όλου του
  // παραθύρου σε κάθε άνοιγμα — και η στοίβα είναι εξωτερικό σύστημα, οπότε
  // αυτό ακριβώς είναι η δουλειά του useSyncExternalStore.
  const depth = useSyncExternalStore(
    (cb) => { overlayWatchers.add(cb); return () => { overlayWatchers.delete(cb); }; },
    () => Math.max(0, overlayStack.indexOf(id)),
    () => 0,
  );

  useEffect(() => {
    if (!open) return;
    overlayStack.push(id);
    notifyOverlays();
    const onKey = (e: KeyboardEvent) => {
      // Μόνο η κορυφαία απαντά, και στο Escape και στο Tab. Οι από κάτω αγνοούν.
      if (overlayStack[overlayStack.length - 1] !== id) return;
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;

      // ── Η ΕΣΤΙΑΣΗ ΕΒΓΑΙΝΕ ΑΠΟ ΤΟ ΠΑΡΑΘΥΡΟ ─────────────────────────────
      // Το παράθυρο έπαιρνε σωστά την εστίαση στο άνοιγμα και τη γύριζε στο
      // κλείσιμο, αλλά ΤΙΠΟΤΑ δεν την κρατούσε μέσα. Ο χρήστης πληκτρολογίου
      // που πατούσε Tab μετά το τελευταίο κουμπί έβγαινε στη σελίδα ΑΠΟ ΚΑΤΩ:
      // σε στοιχεία που δεν βλέπει (τα σκεπάζει το πέπλο) και που δεν μπορεί
      // να πατήσει με το ποντίκι. Ο δείκτης εστίασης εξαφανιζόταν και η
      // πλοήγηση γινόταν μαντεψιά — ενώ ο αναγνώστης οθόνης συνέχιζε να λέει
      // «διάλογος». Το ίδιο έκανε και το Shift+Tab προς τα πίσω.
      //
      // Ο κανόνας ζει ΕΔΩ και όχι στο κάθε παράθυρο: το Modal και το SideSheet
      // μοιράζονται αυτό το κέλυφος, οπότε διορθώνονται και τα δύο μαζί, και
      // κάθε επόμενη επικάλυψη το παίρνει χωρίς να το ζητήσει.
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(el => el.offsetParent !== null || el === document.activeElement);
      if (!items.length) { e.preventDefault(); panel.focus(); return; }

      const first = items[0], last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!active || !panel.contains(active)) { e.preventDefault(); first.focus(); return; }
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = overlayStack.lastIndexOf(id);
      if (i !== -1) overlayStack.splice(i, 1);
      notifyOverlays();
    };
  }, [open, onClose, id]);

  // ── ΕΣΤΙΑΣΗ ΜΕΣΑ, ΚΑΙ ΕΠΙΣΤΡΟΦΗ ΜΕΤΑ ───────────────────────────────────
  // Το ίδιο το πλαίσιο, όχι το πρώτο κουμπί: το πρώτο κουμπί κάθε παραθύρου
  // είναι το «×», και μια εστίαση που ξεκινά από το κλείσιμο διαβάζεται σαν
  // πρόταση να φύγεις. Με tabIndex -1 ο αναγνώστης οθόνης διαβάζει τον τίτλο
  // και το Tab συνεχίζει από εκεί, μέσα στο παράθυρο.
  //
  // ΤΟ `autoFocus` ΔΕΝ ΠΑΤΙΕΤΑΙ ΠΙΑ. Ο React το εφαρμόζει στη φάση commit, που
  // τρέχει ΠΡΙΝ από αυτό το effect — οπότε το `panelRef.focus()` έπαιρνε πίσω
  // την εστίαση και το πεδίο έμενε άδειο. Στο «Νέα εργασία σε επιλεγμένα» και
  // στο «Νέα εκκρεμότητα» ο δρομέας δεν ήταν πουθενά: ο χρήστης άνοιγε παράθυρο
  // για να γράψει και έπρεπε πρώτα να κλικάρει. Αν κάτι ΜΕΣΑ στο πλαίσιο έχει
  // ήδη την εστίαση, δεν του την παίρνουμε.
  useEffect(() => {
    if (!open) return;
    returnTo.current = (document.activeElement as HTMLElement | null) ?? null;
    const panel = panelRef.current;
    const inside = panel && returnTo.current && panel.contains(returnTo.current);
    if (!inside) panel?.focus();
    const back = inside ? null : returnTo.current;
    return () => { if (back?.isConnected) back.focus(); };
  }, [open]);

  // ── ΤΟ ΦΟΝΤΟ ΔΕΝ ΚΥΛΑ ───────────────────────────────────────────────────
  // Με ανοιχτό παράθυρο, το σύρσιμο πάνω στο σκοτεινό φόντο κυλούσε τη σελίδα
  // από πίσω: ο χρήστης έκλεινε το παράθυρο και έβρισκε άλλο σημείο της λίστας
  // από αυτό που άφησε. Κλειδώνει η `.app-content`, που είναι ο πραγματικός
  // κύλινδρος της εφαρμογής (το `body` δεν κυλά — το κέλυφος έχει overflow
  // hidden), και το `document.body` για τις δημόσιες σελίδες που δεν το έχουν.
  useEffect(() => {
    if (!open) return;
    const targets = [document.querySelector<HTMLElement>('.app-content'), document.body]
      .filter((el): el is HTMLElement => !!el);
    const prev = targets.map(el => el.style.overflow);
    targets.forEach(el => { el.style.overflow = 'hidden'; });
    return () => { targets.forEach((el, i) => { el.style.overflow = prev[i]; }); };
  }, [open]);

  return { panelRef, z: OVERLAY_BASE_Z + depth * 10 };
}

// ═══ SideSheet, ΜΙΑ επιφάνεια για κάθε ντοσιέ ═════════════════════════════
// ΤΟ ΠΡΟΒΛΗΜΑ, ΜΕΤΡΗΜΕΝΟ. Τρία πλαϊνά ντοσιέ — επαφής, επισκέπτη, ενοικιαστή —
// γραμμένα ξεχωριστά, με:
//     πλάτος   460 / 720 / 980
//     φόντο    --bg-base / --bg-surface / --bg-surface
//     σκιά     -24px 0 80px rgba(...) / var(--elev-3) / var(--elev-3)
//     κλείσιμο «×» πάνω δεξιά / «‹» πάνω αριστερά / κλικ στο φόντο μόνο
// Τρία ίδια πράγματα που έμοιαζαν με τρεις διαφορετικές εφαρμογές — και μόνο
// το ένα κλείδωνε την κύλιση του φόντου, μόνο το ένα άκουγε Escape.
//
// ΓΙΑΤΙ ΞΕΧΩΡΙΣΤΟ ΑΠΟ ΤΟ Modal: το ντοσιέ ΔΕΝ είναι παράθυρο. Είναι δεύτερη
// στήλη με πλήρες ύψος, που ανοίγει δίπλα στη λίστα και κρατά το πλαίσιο του
// «πού είμαι». Ένα κεντραρισμένο παράθυρο θα έκρυβε τη λίστα από την οποία
// ήρθε ο χρήστης. Ίδια συμπεριφορά (useOverlayShell), άλλη γεωμετρία.
export function SideSheet({ open, onClose, ariaLabel, width = 640, header, footer, children }: {
  open: boolean; onClose: () => void;
  /** Υποχρεωτικό: ο αναγνώστης οθόνης δεν βλέπει την κεφαλίδα σου. */
  ariaLabel: string;
  width?: number;
  /** Η κεφαλίδα του ντοσιέ. Το κουμπί κλεισίματος μπαίνει από το ίδιο το SideSheet. */
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const { panelRef, z } = useOverlayShell(open, onClose);
  if (!open) return null;
  return (
    <div onClick={onClose} role="dialog" aria-modal="true" aria-label={ariaLabel}
      style={{ position: 'fixed', inset: 0, background: T.scrim, backdropFilter: 'blur(2px)', display: 'flex', justifyContent: 'flex-end', zIndex: z, overscrollBehavior: 'contain' }}>
      <div ref={panelRef} tabIndex={-1} onClick={e => e.stopPropagation()}
        style={{ width: `min(${width}px, 100%)`, height: '100%', background: 'var(--bg-surface)', borderLeft: '1px solid var(--border-subtle)', boxShadow: 'var(--elev-3)', display: 'flex', flexDirection: 'column', overflow: 'hidden', outline: 'none', overscrollBehavior: 'contain', animation: 'sheetIn 0.22s cubic-bezier(0.2,0,0,1) both' }}>
        <style>{`@keyframes sheetIn{from{transform:translateX(28px);opacity:0}to{transform:none;opacity:1}}
          @media (prefers-reduced-motion: reduce){@keyframes sheetIn{from{opacity:1}to{opacity:1}}}`}</style>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '18px 24px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>{header}</div>
          <button onClick={onClose} aria-label="Κλείσιμο"
            style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 11, margin: -7, fontFamily: T.font.sans, flexShrink: 0 }}>×</button>
        </div>

        <div style={{ flex: 1, padding: T.sp.xxl, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: T.sp.xl }}>
          {children}
        </div>

        {footer && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: T.sp.sm, padding: '14px 24px', borderTop: '1px solid var(--border-subtle)', flexShrink: 0, flexWrap: 'wrap' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══ Modal, ΜΙΑ επιφάνεια για κάθε παράθυρο ═══════════════════════════════
// Πριν, κάθε modal έφτιαχνε μόνο του overlay/πλαίσιο: 7 διαφορετικές
// διαφάνειες και 8 διαφορετικά radius, οπότε το app έμοιαζε με πολλά apps.
// Εδώ ορίζεται μία φορά: ίδιο scrim, ίδιο radius, ίδια κεφαλίδα (εικονίδιο +
// τίτλος + υπότιτλος + ×), ίδιο padding, ίδιο υποσέλιδο ενεργειών.
// Κλείνει με κλικ στο φόντο ή Escape· το περιεχόμενο κυλά, header/footer όχι.
export function Modal({ open, onClose, title, ariaLabel, subtitle, icon, width = 620, children, footer, footerInfo }: {
  open: boolean; onClose: () => void;
  /** Δέχεται και JSX (π.χ. τίτλος με <InfoHint>). Για τεχνολογίες υποβοήθησης δώσε ariaLabel. */
  title: ReactNode; ariaLabel?: string; subtitle?: ReactNode; icon?: ReactNode;
  width?: number; children: ReactNode; footer?: ReactNode; footerInfo?: ReactNode;
}) {
  const { panelRef, z } = useOverlayShell(open, onClose);
  if (!open) return null;
  return (
    <div onClick={onClose} role="dialog" aria-modal="true" aria-label={ariaLabel ?? (typeof title === 'string' ? title : undefined)}
      style={{ position: 'fixed', inset: 0, background: T.scrim, backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: z, padding: T.sp.lg, overscrollBehavior: 'contain' }}>
      <div ref={panelRef} tabIndex={-1} onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.modal, width: `min(${width}px, 100%)`, maxHeight: '92dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: 'var(--elev-3)', outline: 'none', overscrollBehavior: 'contain' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 24px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          {icon && (
            <div style={{ width: T.h.lg, height: T.h.lg, borderRadius: 10, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...TT.h2 }}>{title}</div>
            {subtitle && <div style={{ ...TT.bodySm, marginTop: 1 }}>{subtitle}</div>}
          </div>
          {/* Το padding ήταν 4, δηλαδή στόχος ~21×30: ένα «×» που αστοχεί στο
              δάχτυλο κλείνει άλλο πράγμα από αυτό που ήθελε ο χρήστης. */}
          <button onClick={onClose} aria-label="Κλείσιμο"
            style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 11, margin: -7, fontFamily: T.font.sans }}>×</button>
        </div>

        <div style={{ padding: T.sp.xxl, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: T.sp.xl }}>
          {children}
        </div>

        {(footer || footerInfo) && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: T.sp.md, padding: '14px 24px', borderTop: '1px solid var(--border-subtle)', flexShrink: 0, flexWrap: 'wrap' }}>
            <span style={{ ...TT.bodySm }}>{footerInfo}</span>
            <div style={{ display: 'flex', gap: T.sp.sm }}>{footer}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══ SecHdr, επικεφαλίδα ενότητας (η τελεία + uppercase label των Bills) ══
export function SecHdr({ label, sub, right }: { label: string; sub?: string; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...TT.label, fontSize: 10 }}>{label}</div>
        {sub && <div style={{ ...TT.caption, fontSize: 10, marginTop: 2 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

// ═══ PageTitle, τίτλος σελίδας/tab ════════════════════════════════════════
//
// ΤΟ `over` ΜΠΗΚΕ ΓΙΑ ΝΑ ΠΑΨΟΥΝ ΔΥΟ ΚΑΡΤΕΛΕΣ ΝΑ ΓΡΑΦΟΥΝ ΔΙΚΗ ΤΟΥΣ ΚΕΦΑΛΙΔΑ.
// Δέκα καρτέλες χρησιμοποιούν αυτό το component. Η Αξιοποίηση και η Πρόσκληση
// έστηναν στο χέρι το ίδιο ακριβώς σχήμα (ετικέτα από πάνω, μεγάλος τίτλος,
// κείμενο από κάτω), με δικά τους περιθώρια — δηλαδή δώδεκα καρτέλες με το ίδιο
// νόημα και τρεις διαφορετικές αποστάσεις. Ο τίτλος τους δεν είναι όνομα
// σελίδας αλλά πρόταση, και χρειάζονταν μια γραμμή από πάνω που να λέει «πού
// είσαι». Αυτή είναι η γραμμή.
export function PageTitle({ over, title, sub, lede, right, titleHint }: { over?: string; title: string; sub?: string; lede?: string; right?: ReactNode; titleHint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: T.sp.xxl, flexWrap: 'wrap' as const }}>
      <div style={{ minWidth: 0 }}>
        {over && <div style={{ ...TT.label, color: 'var(--text-tertiary)', marginBottom: 8 }}>{over}</div>}
        <h1 title={titleHint} style={{ ...TT.display, margin: 0 }}>{title}</h1>
        {sub && <div style={{ ...TT.caption, fontSize: 12, marginTop: 4 }}>{sub}</div>}
        {/* Η εισαγωγή είναι κείμενο σώματος, όχι λεζάντα: το `sub` των δέκα
            καρτελών είναι 12 εικονοστοιχεία και μια παράγραφος τριών σειρών σε
            αυτό το μέγεθος διαβάζεται ως ψιλά γράμματα.

            ΤΟ ΜΕΤΡΟ ΤΟ ΟΡΙΖΕΙ Η ΣΤΗΛΗ ΤΗΣ ΟΘΟΝΗΣ, ΟΧΙ ΑΥΤΟ ΤΟ ΑΡΧΕΙΟ. Ήταν
            καρφωμένο στα 640 εικονοστοιχεία, ενώ κάθε καρτέλα ορίζει ήδη το δικό
            της πλάτος (η Αξιοποίηση στα 900): η εισαγωγή έκοβε στα δύο τρίτα και
            άφηνε τριακόσια κενά δεξιά, με ΟΛΟ το υπόλοιπο περιεχόμενο από κάτω να
            φτάνει ως την άκρη. Δύο διαφορετικά δεξιά περιθώρια στην ίδια οθόνη,
            και το πάνω πάνω. */}
        {lede && <p style={{ ...TT.body, color: 'var(--text-secondary)', margin: '10px 0 0' }}>{lede}</p>}
      </div>
      {right && <div style={{ display: 'flex', gap: 8 }}>{right}</div>}
    </div>
  );
}

// ═══ KPIGrid, η σειρά μετρικών στην κορυφή κάθε tab ═══════════════════════
export interface KPIItem {
  label: string; value: string; sub?: string; tone?: Tone;
  /** Εξήγηση στο hover/long-press. Χωρίς αυτό, η Επισκόπηση αναγκαζόταν να
   *  γράψει δικά της πλακίδια για να κρατήσει τις επεξηγήσεις της — και έτσι
   *  απέκτησε δεύτερο, παράλληλο σύστημα καρτών. */
  title?: string;
  /** Χρώμα για τη γραμμή `sub` (π.χ. μεταβολή vs πέρσι). */
  subTone?: Tone;
}

const TONE_COLOR: Record<string, string> = {
  positive: 'var(--positive)', negative: 'var(--negative)',
  warning: 'var(--warning)', info: 'var(--info)', accent: 'var(--accent)',
};

export function KPIGrid({ items, columns }: { items: KPIItem[]; columns?: number }) {
  // ── ΜΙΑ ΣΕΙΡΑ ΜΗΔΕΝΙΚΑ ΔΕΝ ΕΙΝΑΙ ΣΥΝΟΨΗ ────────────────────────────────
  // Σε άδεια οθόνη το Αρχείο τύπωνε «ΣΥΝΟΛΟ ΑΡΧΕΙΩΝ 0 · ΕΓΓΡΑΦΑ 0 ·
  // ΦΩΤΟΓΡΑΦΙΕΣ 0 · ΚΑΤΗΓΟΡΙΕΣ 0» και από κάτω, με εικονίδιο και κουμπί,
  // «Δεν έχεις ακόμη κανένα χαρτί εδώ». Η ίδια πληροφορία τέσσερις φορές με
  // αριθμούς και μία με λόγια — και τα τέσσερα πλακίδια δεν μετρούσαν τίποτα.
  //
  // Ο κανόνας ΥΠΗΡΧΕ ήδη, γραμμένος στο χέρι σε δύο οθόνες (`items.length > 0 &&
  // <KPIGrid…>` σε Checklist και Επαφές) και παραλειμμένος στις υπόλοιπες
  // δώδεκα. Εδώ γράφεται ΜΙΑ φορά, στο primitive, οπότε ισχύει παντού.
  //
  // ΜΟΝΟ όταν ΚΑΝΕΝΑ πλακίδιο δεν μετράει κάτι. Ένα μηδενικό δίπλα σε νούμερο
  // είναι απάντηση («εκκρεμότητες: 0») και μένει.
  if (!items.length || items.every(k => isBlankMetric(k.value))) return null;

  // Ρευστό πλέγμα: γεμίζει όσες στήλες χωράνε (min 150px) και «σπάει» μόνο του
  // σε 2 ή 1 στήλες σε tablet/κινητό, χωρίς media queries, δουλεύει παντού.
  const cols = columns ?? items.length;
  return (
    <div className="kpi-row" style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${Math.max(140, Math.floor(920 / cols))}px), 1fr))`, gap: 12, marginBottom: 16 }}>
      {items.map((k, i) => {
        const toned = !!(k.tone && k.tone !== 'neutral');
        return (
        // Οι κάρτες με τόνο γίνονται εστιάσιμες, ώστε το tap σε κινητό να
        // αποκαλύπτει το χρώμα όπως ο κέρσορας (focus-within). Οι ουδέτερες όχι,
        // για να μη γεμίζει το tab order.
        <div key={i} className="kpi-card" title={k.title} tabIndex={toned ? 0 : undefined} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="kpi-label">{k.label}</div>
          {/* Ουδέτερο by default· ο σημασιολογικός τόνος αποκαλύπτεται στο hover ή
              στο άγγιγμα (data-tone + globals.css), για χαμηλού θορύβου look. */}
          <div className="kpi-value" style={{ marginBottom: 0 }} data-tone={toned ? k.tone : undefined}>{k.value}</div>
          {k.sub && <div style={{ fontSize: 10, lineHeight: 1.4, fontWeight: k.subTone ? 600 : 400, color: (k.subTone && TONE_COLOR[k.subTone]) || 'var(--text-tertiary)', fontFamily: T.font.sans }}>{k.sub}</div>}
        </div>
        );
      })}
    </div>
  );
}

// ═══ Badge, μικρή ετικέτα κατάστασης (Πληρώθηκε, Ενεργό…) ════════════════
//
// ΤΑ ΕΝΝΕΑ ΕΙΚΟΝΟΣΤΟΙΧΕΙΑ ΗΤΑΝ ΚΕΦΑΛΑΙΑ ΕΛΛΗΝΙΚΑ. Το Badge γράφει με
// `text-transform: uppercase` και letter-spacing, δηλαδή στο πιο δύσκολο
// σχήμα για μικρό μέγεθος: χωρίς κάτω ουρές και χωρίς ψηλά γράμματα, το μάτι
// δεν έχει σε τι να πιαστεί και διαβάζει σχήμα αντί για λέξη. Έντεκα
// εικονοστοιχεία σε Badge και Chip, ένα μέγεθος και για τα δύο.
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  const tv = toneVars(tone);
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: T.radius.badge, background: tv.bg, border: `1px solid ${tv.border}`, color: tv.color, fontFamily: T.font.sans, whiteSpace: 'nowrap' as const, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>
      {children}
    </span>
  );
}

// ═══ Chip, κανονική «pill» ετικέτα (mixed-case, σε αντίθεση με το uppercase Badge)
// Ένα ενιαίο primitive για όλα τα chips των Ρυθμίσεων: ίδια γεωμετρία παντού
// (padding/radius/μέγεθος/βάρος). Το gap:6 αφήνει μικρή τελεία/εικονίδιο να
// καθίσει μέσα (π.χ. ο παλλόμενος live-dot). Το title περνά για tooltip.
export function Chip({ children, tone = 'neutral', title }: { children: ReactNode; tone?: Tone; title?: string }) {
  const tv = toneVars(tone);
  return (
    <span title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: T.radius.pill, background: tv.bg, border: `1px solid ${tv.border}`, color: tv.color, fontFamily: T.font.sans, whiteSpace: 'nowrap' as const, letterSpacing: '0.01em', lineHeight: 1.4 }}>
      {children}
    </span>
  );
}

// ═══ ΤΟ TierBadge ΕΦΥΓΕ ═══════════════════════════════════════════════════
// Ηταν ένα «χτυπημένο νόμισμα» — ακτινική μεταλλική διαβάθμιση, ανάγλυφη
// στεφάνη, εσωτερικό αυλάκι, γυαλάδα που έτρεχε στο hover — με ένα σπιτάκι
// μέσα, για να πει στον χρήστη ότι είναι ιδιώτης. Κάτι που ήδη ξέρει.
//
// Δεν πατιόταν, δεν άλλαζε, δεν προειδοποιούσε, και καθόταν στην πιο ακριβή
// θέση της εφαρμογής: δίπλα στο όνομα του ακινήτου, στην κορυφή κάθε οθόνης.
// Στις άλλες τρεις θέσεις του ήταν επανάληψη — το πακέτο γράφεται δίπλα του με
// το όνομά του. Ο ίδιος του ο κώδικας το είχε ήδη παραδεχτεί μία φορά, όταν
// αφαιρέθηκε το κείμενο «ΙΔΙΟΤΗΤΑ · Επαγγελματίας» που το συνόδευε.
//
// Και το σκεύωμα δεν ταίριαζε πουθενά: η υπόλοιπη διεπαφή είναι επίπεδη και
// ήσυχη, με μία σκιά ανά επίπεδο. Ενα μετάλλιο με τέσσερις inset σκιές είναι
// άλλη γλώσσα.
// ═══════════════════════════════════════════════════════════════════════════

// ═══ InfoBanner, η γραμμή ειδοποίησης με την τελεία (dot) των Bills ═══════
export function InfoBanner({ children, tone = 'info' }: { children: ReactNode; tone?: Tone }) {
  const tv = toneVars(tone);
  return (
    <div style={{ background: tv.bg, border: `1px solid ${tv.border}`, borderRadius: T.radius.inner, padding: '10px 16px', marginBottom: 10, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: tv.color, flexShrink: 0, marginTop: 6 }}/>
      <div style={{ flex: 1, fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

// ═══ pressable — ΤΟ ΠΛΗΚΤΡΟΛΟΓΙΟ ΓΙΑ ΟΣΑ ΔΕΝ ΕΙΝΑΙ ΚΟΥΜΠΙΑ ════════════════
//
// ΤΟ ΣΦΑΛΜΑ, ΜΕΤΡΗΜΕΝΟ: τριάντα έξι στοιχεία της εφαρμογής έχουν `onClick`
// πάνω σε `<div>`. Ένα `div` δεν εστιάζεται με Tab, δεν ενεργοποιείται με Enter
// ή κενό, και ο αναγνώστης οθόνης το ανακοινώνει ως κείμενο — δηλαδή δεν
// υπάρχει. Πρακτικά: κάρτα ακινήτου, γραμμή απογραφής, επιλογή ασφαλιστηρίου,
// ημέρα ημερολογίου — όλα αδύνατα χωρίς ποντίκι.
//
// ΤΟ ΠΡΟΣΩΠΟ ΠΟΥ ΤΟ ΠΛΗΡΩΝΕΙ ΕΙΝΑΙ ΓΡΑΜΜΕΝΟ ΣΤΗ ΣΤΡΑΤΗΓΙΚΗ: ο πενηντάρης που
// τον αγχώνει ο λογιστής. Ο ίδιος άνθρωπος, δέκα χρόνια μετά ή με τρέμουλο,
// δεν σημαδεύει με ποντίκι. Και η οδηγία προσβασιμότητας για ψηφιακές υπηρεσίες
// προς καταναλωτές δεν είναι πια σύσταση.
//
// ΓΙΑΤΙ ΒΟΗΘΟΣ ΚΑΙ ΟΧΙ COMPONENT. Ένα `<Pressable>` που τυλίγει, θα ήταν
// `<button>` — και `<button>` ΔΕΝ επιτρέπεται να περιέχει άλλο `<button>`. Οι
// μισές από αυτές τις γραμμές έχουν μέσα τους κουμπιά «Επεξεργασία» και
// «Διαγραφή»: το τύλιγμα θα παρήγαγε άκυρο HTML και θα έσπαγε την πλοήγηση με
// Tab. Ο βοηθός δίνει τις ίδιες ιδιότητες χωρίς να αγγίξει ούτε τη διάταξη ούτε
// τη δομή — μηδενικό οπτικό ρίσκο, μία πηγή αλήθειας.
//
//     <div {...pressable(() => onEdit(item), `Επεξεργασία ${item.name}`)} style={…}>
//
// ΜΙΑ ΕΞΑΙΡΕΣΗ, ΜΕΤΡΗΜΕΝΗ, ΣΕ ΤΡΙΑ ΣΗΜΕΙΑ. Το JSX spread κρύβει τις ιδιότητες
// από τη στατική ανάλυση: ο μεταγλωττιστής του React παύει να βλέπει τι δέχεται
// το στοιχείο, και αρχίζει να αναφέρει τις μεταλλάξεις `currentTarget.style`
// των ΔΙΠΛΑΝΩΝ χειριστών (hover γραμμένο επιτακτικά αντί για CSS). Εκεί οι
// ιδιότητες γράφονται ρητά — δύο λέξεις παραπάνω είναι φθηνότερες από μια
// καστάνια που ανεβαίνει, και ο αναγνώστης του JSX βλέπει αμέσως ότι το div
// είναι κουμπί.
//
// ΤΟ ΚΕΝΟ ΘΕΛΕΙ preventDefault, ΑΛΛΙΩΣ Η ΣΕΛΙΔΑ ΚΥΛΑΕΙ. Είναι η προεπιλεγμένη
// ενέργεια του πλήκτρου, και χωρίς αυτό ο χρήστης πατά «κενό» για να ανοίξει μια
// γραμμή και η οθόνη πηδά μια σελίδα κάτω.
export function pressable<E extends { key: string; preventDefault: () => void }>(
  onActivate: () => void,
  label?: string,
  /**
   * ΓΙΑ ΟΣΑ ΑΝΟΙΓΟΥΝ ΚΑΙ ΚΛΕΙΝΟΥΝ. Χωρίς αυτό, ο αναγνώστης οθόνης ακούει
   * «κουμπί» και τίποτα άλλο: δεν μαθαίνει ούτε ότι υπάρχει κρυμμένο
   * περιεχόμενο ούτε αν είναι ήδη ανοιχτό. Ο χρήστης που βλέπει το βελάκι το
   * ξέρει· ο χρήστης που ακούει, όχι.
   *
   * Μένει `undefined` όταν δεν δίνεται, οπότε καμία υπάρχουσα χρήση δεν
   * αποκτά ιδιότητα που δεν της ταιριάζει.
   */
  expanded?: boolean,
): {
  role: 'button'; tabIndex: 0; 'aria-label': string | undefined;
  'aria-expanded': boolean | undefined;
  onClick: () => void; onKeyDown: (e: E) => void;
} {
  return {
    role: 'button',
    tabIndex: 0,
    'aria-label': label,
    'aria-expanded': expanded,
    onClick: onActivate,
    onKeyDown: (e: E) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      onActivate();
    },
  };
}

// ═══ Btn, κουμπιά σε 3 ρόλους ═════════════════════════════════════════════
export function Btn({ children, onClick, variant = 'secondary', disabled, type }: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost'; disabled?: boolean; type?: 'button' | 'submit';
}) {
  const base: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    // Το padding έδινε ύψος ~38: κάτω από το ελάχιστο μέγεθος αφής, σε 148
    // σημεία. Το `minHeight` από την κοινή κλίμακα το ανεβάζει στα 44 όταν ο
    // δείκτης είναι δάχτυλο, χωρίς να αλλάξει τίποτα στο ποντίκι.
    minHeight: T.h.md,
    padding: '9px 18px', borderRadius: T.radius.btn,
    fontSize: 12, fontWeight: 700, fontFamily: T.font.sans,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
    transition: 'background-color 0.15s cubic-bezier(0.2,0,0,1), border-color 0.15s cubic-bezier(0.2,0,0,1), color 0.15s cubic-bezier(0.2,0,0,1), box-shadow 0.15s cubic-bezier(0.2,0,0,1), transform 0.15s cubic-bezier(0.2,0,0,1), opacity 0.15s cubic-bezier(0.2,0,0,1)',
    // ΠΑΧΟΣ ΚΑΙ ΕΙΔΟΣ ΕΙΝΑΙ ΓΕΩΜΕΤΡΙΑ: κρατούν το ύψος ίδιο και στις τρεις
    // παραλλαγές, ώστε το περίγραμμα του δευτερεύοντος να μη μετακινεί τα
    // διπλανά του. Το ΧΡΩΜΑ όμως είναι όψη και ζει στο CSS — το `border`
    // ολόκληρο εδώ έγραφε `transparent` ενσωματωμένα και νικούσε την κλάση:
    // μετρήθηκε ότι το δευτερεύον κουμπί ΔΕΝ είχε καθόλου ορατό περίγραμμα.
    borderWidth: 1, borderStyle: 'solid',
  };
  // ── ΤΟ ΧΡΩΜΑ ΕΦΥΓΕ ΑΠΟ ΕΔΩ, ΚΑΙ ΑΥΤΟ ΕΙΝΑΙ ΟΛΟ ΤΟ ΝΟΗΜΑ ────────────────
  //
  // Οι τρεις παραλλαγές ζωγράφιζαν τον εαυτό τους σε `style`, δηλαδή ΜΕΣΑ στο
  // στοιχείο. Το ενσωματωμένο style κερδίζει κάθε κανόνα κλάσης: όσο το χρώμα
  // γραφόταν εδώ, κανένα `:hover` δεν μπορούσε ΠΟΤΕ να ισχύσει. Μετρήθηκε στον
  // περιηγητή — και οι τρεις παραλλαγές έδιναν ακριβώς το ίδιο χρώμα πριν και
  // μετά την αιώρηση.
  //
  // Εδώ μένει η ΓΕΩΜΕΤΡΙΑ (διάταξη, περιθώρια, ακτίνα, γραμματοσειρά). Η ΟΨΗ —
  // φόντο, χρώμα κειμένου, περίγραμμα, και οι τρεις καταστάσεις τους — ζει στο
  // `.po-btn[data-variant]` του globals.css, όπου το CSS ξέρει τι είναι
  // αιώρηση, τι είναι πάτημα, τι είναι εστίαση με πληκτρολόγιο και τι είναι
  // οθόνη αφής.
  //
  // Η ΤΡΙΤΕΥΟΥΣΑ ΕΝΕΡΓΕΙΑ ΔΕΝ ΕΙΝΑΙ ΜΠΛΕ. Το `--info` είναι διαφορετικό και πιο
  // βαθύ μπλε από το `--accent` της κύριας: το «Ακύρωση» τραβούσε το μάτι
  // περισσότερο από το «Αποθήκευση» δίπλα του. Ενα μπλε, και μόνο στην κύρια.
  // ── ΤΟ ΚΥΡΙΟ ΚΟΥΜΠΙ ΤΗΣ ΕΦΑΡΜΟΓΗΣ ΔΕΝ ΕΙΧΕ ΑΙΩΡΗΣΗ ──────────────────────
  //
  // Το `transition` από πάνω απαριθμούσε έξι ιδιότητες — background, border,
  // color, shadow, transform, opacity — και ΚΑΜΙΑ τους δεν άλλαζε ποτέ: δεν
  // υπήρχε ούτε `:hover`, ούτε `:active`, ούτε κατάσταση εστίασης. Νεκρή
  // δήλωση σε πεντακόσια σημεία, και ένα κουμπί που δεν απαντά στο ποντίκι.
  //
  // Η ΑΠΑΝΤΗΣΗ ΕΙΝΑΙ CSS, ΟΧΙ JAVASCRIPT. Η εφαρμογή έχει ήδη 310 χειροκίνητους
  // χειριστές `onMouseEnter/onMouseLeave` που γράφουν `style.background` —
  // δηλαδή αιώρηση που δεν ξέρει τι είναι `:focus-visible`, δεν ξέρει τι είναι
  // αφή, και ξαναγράφεται σε κάθε στοιχείο από την αρχή. Εδώ μπαίνει ΜΙΑ κλάση
  // (`po-btn` στο globals.css) και ο ρόλος δηλώνεται με `data-variant`.
  //
  // ΚΑΙ ΤΟ `disabled` ΓΙΝΕΤΑΙ ΑΛΗΘΙΝΟ. Το component δεχόταν `disabled` και
  // απλώς δεν περνούσε το `onClick`: το κουμπί έμενε εστιάσιμο, ανακοινωνόταν
  // ως ενεργό από τους αναγνώστες οθόνης, και το `:disabled` του CSS δεν
  // ταίριαζε ποτέ. Τώρα δηλώνεται στο ίδιο το στοιχείο.
  return (
    <button
      type={type ?? 'button'}
      className="po-btn"
      data-variant={variant}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      style={base}
    >{children}</button>
  );
}

// ═══ ExportButton, κοινό κουμπί εξαγωγής Excel (ίδιο σε όλα τα tabs) ═══════
//
// ΕΙΧΕ ΔΕΥΤΕΡΟ ΚΟΥΜΠΙ ΠΟΥ ΖΗΤΟΥΣΕ ΑΠΟ ΤΟΝ ΧΡΗΣΤΗ ΝΑ ΔΙΑΛΕΞΕΙ:
//
//     «Μορφοποιημένο»           Έτοιμο για εκτύπωση, ελληνικό «1.234,56 €»
//     «Επεξεργάσιμο (δεδομένα)» Ζωντανά αριθμητικά κελιά + άθροισμα SUM
//
// Δηλαδή ζητούσε να διαλέξει αν το αρχείο του θα αθροίζεται. Η πρώτη επιλογή —
// η ΠΡΟΕΠΙΛΟΓΗ — έγραφε τα ποσά ως κείμενο: ο λογιστής επέλεγε τη στήλη και το
// Excel έδειχνε «Άθροισμα: 0», με το πράσινο τριγωνάκι «αριθμός αποθηκευμένος
// ως κείμενο» σε κάθε γραμμή. Δεν είναι επιλογή του χρήστη το αν το αρχείο του
// είναι σωστό. Έμεινε ένα κουμπί, και ένα αρχείο που κάνει και τα δύο: φαίνεται
// ελληνικά (από τη μορφή του κελιού) ΚΑΙ αθροίζεται.
export function ExportButton({ onClick, label = 'Εξαγωγή Excel', disabled }: { onClick: () => void; label?: string; disabled?: boolean }) {
  const icon = <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>;
  const base: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, height: T.h.md, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap' };
  return (
    <button onClick={disabled ? undefined : onClick} title="Εξαγωγή σε Excel (.xlsx)" disabled={disabled}
      className="po-hov-row"
      style={{ ...base, padding: '0 14px', borderRadius: T.radius.pill }}>
      {icon}{label}
    </button>
  );
}

// ═══ EmptyState, κενή κατάσταση με πρόσκληση σε δράση (όχι σκέτο «κενό») ══
//
// ΤΟ `icon` ΔΕΝ ΕΙΝΑΙ ΚΑΛΛΩΠΙΣΜΟΣ. Μετρήθηκε ότι το 86% των κενών καταστάσεων
// της εφαρμογής είναι χειρόγραφες, με 7 διαφορετικά αρχέτυπα, 20 paddings και
// 6 μεγέθη τίτλου — και η δομική αιτία ήταν ακριβώς αυτή η παράλειψη: όποιος
// ήθελε εικονίδιο δεν μπορούσε να χρησιμοποιήσει το primitive, οπότε έγραφε
// δικό του από την αρχή. Ένα primitive που δεν καλύπτει τη συνηθισμένη ανάγκη
// δεν αγνοείται από αμέλεια· παρακάμπτεται από ανάγκη.
// ═══ EmptyState ═══════════════════════════════════════════════════════════
// ΤΟ ΚΕΝΟ ΔΕΝ ΕΠΙΤΡΕΠΕΤΑΙ ΝΑ ΠΙΑΝΕΙ ΠΕΡΙΣΣΟΤΕΡΟ ΧΩΡΟ ΑΠΟ ΤΟ ΠΕΡΙΕΧΟΜΕΝΟ.
//
// Μια οθόνη σαν την Απογραφή ή τον Ενοικιαστή έχει έξι ως οκτώ κενές
// καταστάσεις. Με την προηγούμενη διάταξη κάθε μία έπιανε ~258px, δηλαδή πάνω
// από δύο ολόκληρες οθόνες κύλισης για να πει «δεν υπάρχει τίποτα ακόμη».
//
// ΤΙ ΜΕΤΡΗΘΗΚΕ (τρεις πραγματικές κενές καταστάσεις, οθόνη 1280px):
//   πριν  · εικονίδιο 44px από πάνω, υπόδειξη σε 380px, περιθώριο 40px → 775px, 8 γραμμές
//   μετά  · εικονίδιο 18px πλάι στον τίτλο, υπόδειξη σε 620px, περιθώριο 26px → 474px, 5 γραμμές
//
// Το κέρδος δεν είναι το περιθώριο· είναι το ΠΛΑΤΟΣ. Στα 380px και μέγεθος 11
// μια πρόταση 150 χαρακτήρων σπάει σε τρεις γραμμές. Στα 620px χωρά σε δύο, και
// διαβάζεται σαν πρόταση αντί για στήλη. Το εικονίδιο δεν χάθηκε — μετακόμισε
// δίπλα στον τίτλο, όπου κάνει την ίδια δουλειά με το ένα τρίτο του ύψους.
export function EmptyState({ title, hint, action, icon }: { title: string; hint?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div style={{ textAlign: 'center' as const, padding: '26px 20px', color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 6 }}>
        {icon && <span aria-hidden style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--text-tertiary)', flexShrink: 0 }}>{icon}</span>}
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{title}</span>
      </div>
      {hint && <div style={{ fontSize: 12, lineHeight: 1.6, margin: '0 auto', textWrap: 'pretty' as const }}>{hint}</div>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

// ═══ Grid helpers, τα g2/g3/g4 των Bills, μία φορά για όλους ══════════════
// Ρευστά πλέγματα: «auto-fit + minmax(min(100%, Xpx))» ώστε σε στενές οθόνες
// (κινητό/tablet) να πέφτουν αυτόματα σε λιγότερες στήλες ή μία, ενώ σε desktop
// κρατούν την επιθυμητή διάταξη. Το «min(100%, …)» εγγυάται ότι ποτέ δεν
// ξεπερνούν το πλάτος του γονέα (μηδενική οριζόντια κύλιση).
/**
 * ΤΟ ΚΑΔΡΟ ΤΗΣ ΚΑΡΤΕΛΑΣ — ΕΝΑ, ΓΙΑ ΝΑ ΜΗ ΜΕΤΑΚΙΝΕΙΤΑΙ Η ΑΚΡΗ.
 *
 * ΤΟ ΣΦΑΛΜΑ, ΜΕΤΡΗΜΕΝΟ. Πέντε καρτέλες έστηναν δικό τους κέλυφος πάνω από το
 * κοινό `.app-content`, με πέντε διαφορετικές αποφάσεις: 880 κεντραρισμένο,
 * 920 ΚΑΡΦΩΜΕΝΟ ΑΡΙΣΤΕΡΑ, 900 καρφωμένο αριστερά, 1080 κεντραρισμένο, 1100
 * κεντραρισμένο — και δύο από αυτές πρόσθεταν και δεύτερο περιθώριο 28/24 πάνω
 * στο 24 που δίνει ήδη το κέλυφος. Οι υπόλοιπες δώδεκα δεν έβαζαν τίποτα.
 *
 * Σε οθόνη 1600 εικονοστοιχείων, η δεξιά άκρη του περιεχομένου κουνιόταν σε
 * ΚΑΘΕ αλλαγή καρτέλας, και σε δύο από αυτές το περιεχόμενο κατέβαινε κιόλας.
 * Κανένα από αυτά δεν είναι σφάλμα που σπάει κάτι· όλα μαζί είναι ο λόγος που
 * το προϊόν διαβάζεται σαν δώδεκα προϊόντα.
 *
 * Το μέτρο μένει παράμετρος, γιατί μια φόρμα ρυθμίσεων και ένας πίνακας
 * αποσβέσεων δεν θέλουν το ίδιο πλάτος. Η ΣΤΟΙΧΙΣΗ όμως δεν είναι παράμετρος:
 * ό,τι έχει μέτρο, κεντράρεται.
 */
export const pageShell = (measure: number): CSSProperties => ({
  fontFamily: T.font.sans,
  maxWidth: measure,
  marginLeft: 'auto',
  marginRight: 'auto',
});

// ── Κοινό πεδίο εισόδου Ρυθμίσεων ─────────────────────────────────────────
// Μία γεωμετρία (ύψος/ακτίνα/border/χρώματα) για όλα τα «χειροποίητα» inputs των
// Ρυθμίσεων, ώστε να μη διαφέρουν μεταξύ τους. Το focus ring μπαίνει με την κλάση
// `po-field` (globals.css), χωρίς ανά-input JS handlers.
export const settingsField: CSSProperties = {
  width: '100%', height: T.h.lg, padding: '0 14px', borderRadius: T.radius.inner,
  border: '1px solid var(--border-default)', background: 'var(--bg-surface)',
  color: 'var(--text-primary)', fontSize: 14, fontFamily: T.font.sans, outline: 'none', boxSizing: 'border-box',
};

export const g2: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14, marginBottom: 14 };
export const g3: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 14, marginBottom: 14 };
export const g4: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: 14, marginBottom: 14 };
