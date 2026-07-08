// ═══════════════════════════════════════════════════════════════════════════
// Πρότυπα μηνυμάτων προς πελάτες/επισκέπτες (καθαρή λογική, χωρίς React).
// Γεμίζουν με στοιχεία πελάτη/ακινήτου/διαμονής και ανοίγουν με ένα άγγιγμα σε
// WhatsApp/Viber. Στα ελληνικά, ζεστά, χωρίς παύλες, χωρίς αγγλισμούς.
// ═══════════════════════════════════════════════════════════════════════════

export interface MsgContext {
  clientName?: string | null;
  propertyName?: string | null;
  address?: string | null;
  checkIn?: string | null;   // YYYY-MM-DD
  checkOut?: string | null;  // YYYY-MM-DD
  ownerName?: string | null;
  discountPct?: number | null; // για πρόταση επιστροφής (προεπιλογή 10%)
}

export type MsgTemplateId = 'welcome' | 'checkin' | 'during' | 'review' | 'thanks' | 'returning';

export interface MsgTemplate {
  id: MsgTemplateId;
  label: string;
  build: (c: MsgContext) => string;
}

const firstName = (name?: string | null) => (name || '').trim().split(/\s+/)[0] || '';
const fmtDate = (d?: string | null) => {
  if (!d) return '';
  const t = new Date(d).getTime();
  if (isNaN(t)) return '';
  return new Date(d).toLocaleDateString('el-GR', { day: 'numeric', month: 'long' });
};
const propRef = (c: MsgContext) => (c.propertyName || 'το κατάλυμα').trim();

export const MSG_TEMPLATES: MsgTemplate[] = [
  {
    id: 'welcome', label: 'Καλωσόρισμα',
    build: c => {
      const n = firstName(c.clientName);
      const hi = n ? `Γεια σου ${n}! ` : 'Γεια σου! ';
      const when = c.checkIn ? ` για τις ${fmtDate(c.checkIn)}` : '';
      return `${hi}Καλωσόρισες και ευχαριστούμε για την κράτηση${when} στο ${propRef(c)}. Είμαστε στη διάθεσή σου για οτιδήποτε χρειαστείς. Καλή διαμονή!`;
    },
  },
  {
    id: 'checkin', label: 'Οδηγίες άφιξης',
    build: c => {
      const n = firstName(c.clientName);
      const where = c.address ? ` Η διεύθυνση είναι: ${c.address}.` : '';
      const day = c.checkIn ? ` Σε περιμένουμε στις ${fmtDate(c.checkIn)}.` : '';
      return `${n ? n + ', ' : ''}ορίστε οι οδηγίες άφιξης για ${propRef(c)}.${where}${day} Μόλις φτάσεις κοντά, στείλε μας μήνυμα να συντονιστούμε για την παραλαβή των κλειδιών.`;
    },
  },
  {
    id: 'during', label: 'Κατά τη διαμονή',
    build: c => {
      const n = firstName(c.clientName);
      return `${n ? n + ', ' : ''}ελπίζουμε να περνάς υπέροχα στο ${propRef(c)}. Αν χρειαστείς οτιδήποτε, από μια σύσταση για φαγητό μέχρι κάποια βοήθεια στο κατάλυμα, γράψε μας ελεύθερα.`;
    },
  },
  {
    id: 'review', label: 'Αίτημα αξιολόγησης',
    build: c => {
      const n = firstName(c.clientName);
      return `${n ? n + ', ' : ''}ευχαριστούμε πολύ που έμεινες στο ${propRef(c)}. Ελπίζουμε να πέρασες τέλεια! Αν σου άρεσε, θα εκτιμούσαμε πολύ μια σύντομη αξιολόγηση, μας βοηθάει πραγματικά. Καλή συνέχεια!`;
    },
  },
  {
    id: 'thanks', label: 'Ευχαριστία & επιστροφή',
    build: c => {
      const n = firstName(c.clientName);
      return `${n ? n + ', ' : ''}ευχαριστούμε που μας εμπιστεύτηκες. Θα χαρούμε πολύ να σε φιλοξενήσουμε ξανά στο ${propRef(c)}, όποτε θελήσεις. Καλό ταξίδι!`;
    },
  },
  {
    id: 'returning', label: 'Προσφορά επιστροφής',
    build: c => {
      const n = firstName(c.clientName);
      const pct = c.discountPct && c.discountPct > 0 ? Math.round(c.discountPct) : 10;
      return `${n ? n + ', ' : ''}χαρήκαμε πολύ που σε φιλοξενήσαμε στο ${propRef(c)}! Επειδή είσαι από τους αγαπημένους μας επισκέπτες, θα θέλαμε να σου προσφέρουμε έκπτωση ${pct}% στην επόμενη διαμονή σου. Πες μας ποιες ημερομηνίες σκέφτεσαι και το κανονίζουμε.`;
    },
  },
];

export function buildMessage(id: MsgTemplateId, c: MsgContext): string {
  const t = MSG_TEMPLATES.find(x => x.id === id);
  return t ? t.build(c) : '';
}

/** Deep link WhatsApp με προσυμπληρωμένο κείμενο. digits = διεθνής μορφή χωρίς +. */
export function whatsappLink(digits: string, text: string): string {
  const base = digits ? `https://wa.me/${digits}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(text)}`;
}

/** Deep link Viber. Το Viber δεν δέχεται αριθμό+κείμενο μαζί αξιόπιστα, οπότε
 *  χρησιμοποιούμε το forward με προσυμπληρωμένο κείμενο. */
export function viberLink(text: string): string {
  return `viber://forward?text=${encodeURIComponent(text)}`;
}
