'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ΥΠΕΝΘΥΜΙΣΗ ΣΕ WHATSAPP Ή VIBER — ΕΝΑ ΣΤΟΙΧΕΙΟ, ΚΑΘΕ ΚΑΤΗΓΟΡΙΑ
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΥΠΑΡΧΕΙ ΞΕΧΩΡΙΣΤΑ. Η ίδια ανάγκη εμφανίζεται σε επτά σημεία: συνδρομή
// που ανανεώνεται, ασφαλιστήριο που λήγει, λογαριασμός που πρέπει να πληρωθεί,
// συντήρηση καυστήρα, απεντόμωση, ανελκυστήρας, δημοτικά τέλη. Γραμμένη επτά
// φορές θα ήταν επτά ελαφρώς διαφορετικά μηνύματα και επτά σημεία να ξεχαστεί
// το ένα όταν αλλάξει κάτι.
//
// ΓΙΑΤΙ ΣΥΝΔΕΣΜΟΙ ΚΑΙ ΟΧΙ ΑΠΟΣΤΟΛΗ. Το WhatsApp και το Viber ανοίγουν με έτοιμο
// το κείμενο και ο χρήστης πατά «αποστολή» — καμία υπηρεσία στη μέση, κανένα
// κόστος ανά μήνυμα, κανένας αριθμός που φεύγει από τη συσκευή του. Το SMS θα
// απαιτούσε πληρωμένο πάροχο για να πει την ίδια πρόταση.
//
// Η ΜΟΡΦΗ ΤΟΥ ΜΗΝΥΜΑΤΟΣ ΕΙΝΑΙ ΚΑΝΟΝΑΣ, ΟΧΙ ΠΑΡΑΜΕΤΡΟΣ. Τι λήγει, πότε, πόσο
// κοστίζει και τι μπορείς να κάνεις πριν χρεωθείς. Με αυτή τη σειρά, γιατί ο
// παραλήπτης διαβάζει την πρώτη γραμμή σε ειδοποίηση κλειδωμένης οθόνης.
// ═══════════════════════════════════════════════════════════════════════════

import { TT } from '@/components/Theme';
import { whatsappLink, viberLink } from '@/lib/clients/messages';
import { localDay } from '@/components/Theme';
import { fe } from '@/lib/core/format';

export interface ReminderSubject {
  /** Τι λήγει: «Netflix», «Ασφάλεια κατοικίας, Interamerican». */
  what: string;
  /** Πότε, ως YYYY-MM-DD. */
  when: string;
  /** Πόσο, όταν το ξέρουμε. Το μηδέν και το άγνωστο δεν μπαίνουν στο κείμενο. */
  amount?: number | null;
  /** Τι μπορεί να κάνει ο παραλήπτης. Μία πρόταση, ή τίποτα. */
  action?: string;
}

/**
 * Το κείμενο της υπενθύμισης. Εξάγεται χωριστά ώστε να δοκιμάζεται, και ώστε
 * να μπορεί να μπει και αλλού (αντιγραφή, σημείωση) χωρίς το κουμπί.
 */
export function reminderText(s: ReminderSubject): string {
  const when = /^\d{4}-\d{2}-\d{2}$/.test(s.when)
    ? localDay(s.when).toLocaleDateString('el-GR')
    : s.when;
  const parts = [`Υπενθύμιση: ${s.what} στις ${when}`];
  if (s.amount && s.amount > 0) parts.push(`Ποσό ${fe(s.amount)}`);
  if (s.action) parts.push(s.action);
  return `${parts.join('. ')}.`;
}

/**
 * Δύο σύνδεσμοι, χωρίς εικονίδια και χωρίς πλαίσιο.
 *
 * Το `digits` είναι ο αριθμός του παραλήπτη σε διεθνή μορφή χωρίς το «+», όταν
 * τον ξέρουμε — π.χ. ο τεχνικός που θα κάνει τη συντήρηση. Χωρίς αυτόν, το
 * WhatsApp ανοίγει και ρωτά σε ποιον, που είναι η σωστή συμπεριφορά όταν ο
 * χρήστης στέλνει υπενθύμιση στον ΕΑΥΤΟ του.
 */
export function ReminderLinks({ subject, digits = '' }: { subject: ReminderSubject; digits?: string }) {
  const text = reminderText(subject);
  const style = { ...TT.caption, color: 'var(--accent)', textDecoration: 'none' } as const;
  return (
    <span style={{ display: 'flex', gap: 14, flexShrink: 0 }}>
      <a href={whatsappLink(digits, text)} target="_blank" rel="noopener noreferrer" style={style}>WhatsApp</a>
      <a href={viberLink(text)} style={style}>Viber</a>
    </span>
  );
}
