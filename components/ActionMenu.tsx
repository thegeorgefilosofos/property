'use client';

// ─────────────────────────────────────────────────────────────────────────────
// ActionMenu — the canonical dropdown for toolbar actions across the app.
//
// Ένα τυποποιημένο, καθαρό μενού: πλάκα-ενεργοποιητής με βέλος που περιστρέφεται,
// and a downward-opening card of icon + label + one-line description rows. Closes
// on outside-click or Esc, with a subtle fade/slide entrance. Uses the design
// tokens and Inter, so every toolbar reads as one system instead of a row of ten
// loose buttons. Reuse this anywhere several related actions crowd a header.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { T } from '@/components/Theme';

export interface ActionMenuItem {
  key: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  busyLabel?: string;
  danger?: boolean;
}

// Το πλάτος του μενού είναι γνωστό ΠΡΙΝ αποδοθεί, ώστε η στοίχιση να μπορεί να
// υπολογιστεί στο πάτημα και όχι μετά. Το ΑΝΩΤΑΤΟ υπάρχει γιατί το πλάτος ήταν
// ελεύθερο προς τα πάνω: με `minWidth` 258 και `maxWidth` όσο η οθόνη, μια
// περιγραφή 163 χαρακτήρων τέντωνε το μενού σε 1093 εικονοστοιχεία στα 1440.
// Ενα μενού 1093 πλάτους δεν είναι μενού, είναι λωρίδα.
const MENU_WIDTH = 258;
const MENU_MAX = 340;
// Απόσταση από κάθε άκρη της οθόνης και από το κουμπί.
const EDGE = 8;
const GAP = 6;

export function ActionMenu({
  label,
  icon,
  items,
  align = 'right',
  title,
}: {
  label: string;
  icon?: React.ReactNode;
  items: ActionMenuItem[];
  align?: 'left' | 'right';
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // ══════════════════════════════════════════════════════════════════════════
  // ΤΟ ΜΕΝΟΥ ΕΒΓΑΙΝΕ 111 ΕΙΚΟΝΟΣΤΟΙΧΕΙΑ ΕΞΩ ΑΠΟ ΤΗΝ ΟΘΟΝΗ
  //
  // ΜΕΤΡΗΜΕΝΟ, ΟΧΙ ΕΙΚΑΣΜΕΝΟ: στα 375 και στα 430 το αριστερό άκρο του έβγαινε
  // στο -111. Το μενού είναι 258 πλατύ και ήταν αγκυρωμένο ΔΕΞΙΑ του κουμπιού
  // («right: 0»), οπότε όταν το κουμπί κάθεται κοντά στην αριστερή άκρη, το
  // μενού απλώνεται προς τα έξω. Δεν δημιουργεί κύλιση, άρα δεν το έπιανε
  // κανένας έλεγχος υπερχείλισης: απλώς τέσσερις από τις έξι ενέργειες ήταν
  // αδιάβαστες και μισές από αυτές απάτητες.
  //
  // Η ΘΕΣΗ ΥΠΟΛΟΓΙΖΕΤΑΙ ΣΤΟ ΠΑΤΗΜΑ, δηλαδή σε χειριστή συμβάντος, όπου η
  // μέτρηση του DOM είναι θεμιτή και δεν κοστίζει δεύτερη απόδοση. Και είναι
  // `fixed`: έτσι το μενού δεν κόβεται ούτε από κάρτα με `overflow: hidden`.
  // ΑΓΚΥΡΩΝΕΤΑΙ ΑΠΟ ΤΗΝ ΑΚΡΗ ΠΟΥ ΞΕΡΟΥΜΕ, ΟΧΙ ΑΠΟ ΤΟ ΠΛΑΤΟΣ ΠΟΥ ΜΑΝΤΕΥΟΥΜΕ.
  // Πρώτη προσπάθεια ήταν «λογάριασε το πλάτος και βάλε left»: το πραγματικό
  // πλάτος βγήκε 291 αντί για 258 (το περιεχόμενο ζητά περισσότερα) και το μενού
  // ακούμπησε την ΔΕΞΙΑ άκρη χωρίς περιθώριο. Αγκυρωμένο στη δεξιά άκρη, το
  // περιθώριο είναι εγγυημένο· το `maxWidth` κρατά και την αριστερή μέσα.
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);

  // ══════════════════════════════════════════════════════════════════════════
  // Η ΑΓΚΥΡΑ ΕΙΧΕ ΓΙΝΕΙ ΚΕΛΙ
  //
  // Η προηγούμενη τοποθέτηση κρατούσε μία άκρη καρφωμένη στο κουμπί και άφηνε
  // το πλάτος να προκύψει από την απόσταση ώς την απέναντι άκρη της οθόνης.
  // Ετσι το μενού δεν έβγαινε ποτέ έξω, αλλά ΜΕΤΡΗΜΕΝΟ ΣΤΟΝ ΠΑΓΚΟ πλήρωνε το
  // αντίτιμο και από τις δύο μεριές:
  //
  //   στα 390 · Επαφές          139 πλάτος, κάθε περιγραφή σε 3 γραμμές
  //   στα 390 · Απογραφή        183 πλάτος, μία γραμμή σε ΟΚΤΩ σειρές, 182 ψηλή
  //   στα 390 · Λογιστική       227 πλάτος, μενού 604 ψηλό σε οθόνη 844
  //   στα 1440 · Απογραφή      1093 πλάτος
  //
  // Δηλαδή στο κινητό το μενού στριμωχνόταν στον χώρο ΑΡΙΣΤΕΡΑ του κουμπιού και
  // αγνοούσε μισή οθόνη, ενώ στον υπολογιστή απλωνόταν όσο το άφηνε το κείμενο.
  //
  // ΤΩΡΑ ΤΟ ΠΛΑΤΟΣ ΕΙΝΑΙ ΑΠΟΦΑΣΗ ΚΑΙ Η ΘΕΣΗ ΑΚΟΛΟΥΘΕΙ. Διαλέγουμε ένα πλάτος
  // μέσα στη ζώνη 258 ώς 340 (ή όσο επιτρέπει η οθόνη, αν είναι στενότερη),
  // στοιχίζουμε την επιθυμητή άκρη στο κουμπί και μετά ΣΠΡΩΧΝΟΥΜΕ όλο το κουτί
  // μέσα στα όρια. Το κουτί δεν παραμορφώνεται ποτέ: ή χωρά όπως θέλει ο
  // σχεδιασμός, ή μετακινείται. Μόνο σε οθόνη στενότερη από 356 μικραίνει.
  //
  // ΚΑΙ ΤΟ ΥΨΟΣ ΕΧΕΙ ΟΡΙΟ. Το μενού της Λογιστικής έβγαινε 40 εικονοστοιχεία
  // κάτω από την οθόνη, δηλαδή οι δύο τελευταίες ενέργειες ήταν απάτητες χωρίς
  // να υπάρχει καμία ένδειξη ότι υπάρχουν. Το ανώτατο ύψος είναι ο χώρος ώς την
  // κάτω άκρη και ό,τι περισσεύει κυλά μέσα στο μενού.
  const place = useCallback(() => {
    const b = btnRef.current?.getBoundingClientRect();
    if (!b) return;
    const vw = window.innerWidth;
    const width = Math.min(MENU_MAX, Math.max(0, vw - 2 * EDGE));
    const wanted = align === 'left' ? b.left : b.right - width;
    const left = Math.min(Math.max(EDGE, wanted), vw - EDGE - width);
    const top = b.bottom + GAP;
    setPos({ top, left, width, maxHeight: Math.max(0, window.innerHeight - top - EDGE) });
  }, [align]);

  useEffect(() => {
    if (!open) return;
    // rAF and cleanup run outside the effect body, so no synchronous setState here.
    const raf = requestAnimationFrame(() => setShown(true));
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    // Ανοιχτό μενού σε συντεταγμένες οθόνης πρέπει να ακολουθεί ό,τι το μετακινεί.
    const onMove = () => place();
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
      setShown(false);
    };
  }, [open, place]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        ref={btnRef}
        onClick={() => { place(); setOpen(o => !o); }}
        className="po-hov-accent"
        style={{
          // ΤΟ ΜΕΝΟΥ ΕΙΝΑΙ ΚΟΥΜΠΙ, ΟΧΙ ΚΟΥΜΠΑΚΙ. Με `T.h.sm` έβγαινε 32 ενώ το
          // `Btn` δίπλα του είναι 36: μετρημένο στις Επαφές, «Περισσότερα» και
          // «Σάρωση κάρτας» στην ίδια σειρά με τέσσερα εικονοστοιχεία διαφορά.
          display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: T.h.md, padding: '0 13px', borderRadius: T.radius.modal,
          border: `1px solid ${open ? 'var(--accent)' : 'var(--border-default)'}`, background: 'var(--bg-surface)',
          color: open ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 'var(--fs-base)', fontWeight: 500, cursor: 'pointer',
          fontFamily: T.font.sans, transition: 'background-color 0.13s, border-color 0.13s, color 0.13s, box-shadow 0.13s, transform 0.13s, opacity 0.13s', whiteSpace: 'nowrap',
        }}
      >
        {icon}
        {label}
        <ChevronDown size={14} style={{ transition: 'transform 0.18s ease', transform: open ? 'rotate(180deg)' : 'none', opacity: 0.7 }} />
      </button>

      {open && pos && (
        <div
          role="menu"
          style={{
            position: 'fixed', top: pos.top, left: pos.left,
            width: pos.width, minWidth: Math.min(MENU_WIDTH, pos.width),
            maxHeight: pos.maxHeight, overflowY: 'auto', overscrollBehavior: 'contain',
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12,
            boxShadow: 'var(--elev-3)', padding: 6, zIndex: 200,
            opacity: shown ? 1 : 0, transform: shown ? 'translateY(0)' : 'translateY(-4px)',
            transition: 'opacity 0.14s ease, transform 0.14s ease',
          }}
        >
          {items.map(it => {
            const inert = it.disabled || it.busy;
            return (
              <button
                key={it.key}
                type="button"
                role="menuitem"
                disabled={inert}
                onClick={() => { if (inert) return; setOpen(false); it.onClick(); }}
                className="po-hov-row"
                style={{
                  display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', padding: '9px 10px',
                  borderRadius: 8, border: 'none', background: 'transparent', cursor: inert ? 'default' : 'pointer',
                  opacity: it.disabled ? 0.5 : 1, fontFamily: T.font.sans, transition: 'background 0.12s',
                }}
              >
                {it.icon && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8,
                    background: 'var(--bg-elevated)', color: it.danger ? 'var(--negative)' : 'var(--text-secondary)', flexShrink: 0,
                  }}>{it.icon}</span>
                )}
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 'var(--fs-base)', fontWeight: 600, color: it.danger ? 'var(--negative)' : 'var(--text-primary)', lineHeight: 1.3 }}>
                    {it.busy ? (it.busyLabel || 'Δημιουργία…') : it.label}
                  </span>
                  {it.description && (
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.35, marginTop: 1 }}>
                      {it.description}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
