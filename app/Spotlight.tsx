'use client';

// ═══════════════════════════════════════════════════════════════════════════
// Φωτισμός κάρτας που ακολουθεί τον δείκτη.
//
// ΓΙΑΤΙ ΥΠΑΡΧΕΙ: οι κάρτες της landing είναι επίπεδες επιφάνειες σε σκοτεινό
// φόντο. Το hover τους σήκωνε 3px και τίποτε άλλο, δηλαδή η σελίδα αντιδρούσε
// στο ΠΟΙΑ κάρτα κοιτάς αλλά όχι στο ΠΟΥ κοιτάς μέσα της. Ένα απαλό φως που
// γεννιέται εκεί ακριβώς που είναι ο δείκτης δίνει στην επιφάνεια υλικότητα:
// παύει να είναι εικόνα κάρτας και γίνεται αντικείμενο κάτω από φως.
//
// ΓΙΑΤΙ ΕΝΑΣ ΑΚΡΟΑΤΗΣ ΚΑΙ ΟΧΙ ΕΝΑΣ ΑΝΑ ΚΑΡΤΑ: η σελίδα έχει πάνω από είκοσι
// κάρτες. Είκοσι listeners για το ίδιο συμβάν είναι είκοσι φορές η ίδια δουλειά
// σε κάθε κίνηση του ποντικιού. Ένας στη ρίζα, με closest(), κάνει το ίδιο.
//
// ΓΙΑΤΙ display: contents: το περιτύλιγμα δεν επιτρέπεται να έχει δικό του κουτί.
// Οι ενότητες από μέσα βασίζονται σε πλέγματα και σε sticky· ένα επιπλέον div
// στη μέση θα άλλαζε τη διάταξη. Με display: contents το στοιχείο εξαφανίζεται
// από το layout αλλά μένει στο δέντρο του DOM, οπότε τα συμβάντα φτάνουν κανονικά.
//
// ΚΟΣΤΟΣ: η θέση γράφεται μία φορά ανά καρέ (requestAnimationFrame). Χωρίς αυτό,
// ένα pointermove μπορεί να πυροδοτηθεί εκατοντάδες φορές το δευτερόλεπτο και
// κάθε φορά να γράφει στο style, δηλαδή να ζητά από τον browser νέο βάψιμο.
//
// ΣΕ ΟΘΟΝΗ ΑΦΗΣ δεν εμφανίζεται καθόλου: το CSS το κλειδώνει πίσω από
// @media (hover: hover). Ένα φως που «κολλάει» εκεί που ακούμπησε το δάχτυλο
// είναι θόρυβος, όχι εφέ.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef } from 'react';

export default function Spotlight({ children }: { children: React.ReactNode }) {
  const frame = useRef(0);
  const pending = useRef<{ el: HTMLElement; x: number; y: number } | null>(null);

  useEffect(() => () => { if (frame.current) cancelAnimationFrame(frame.current); }, []);

  const onMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Μόνο πραγματικό ποντίκι. Το άγγιγμα και η γραφίδα αφήνουν στάσιμο φως.
    if (e.pointerType !== 'mouse') return;
    const target = e.target as HTMLElement | null;
    const card = target?.closest<HTMLElement>('.lp-card');
    if (!card) return;
    const r = card.getBoundingClientRect();
    pending.current = { el: card, x: e.clientX - r.left, y: e.clientY - r.top };
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const p = pending.current;
      if (!p) return;
      p.el.style.setProperty('--sx', `${p.x}px`);
      p.el.style.setProperty('--sy', `${p.y}px`);
    });
  }, []);

  return <div style={{ display: 'contents' }} onPointerMove={onMove}>{children}</div>;
}
