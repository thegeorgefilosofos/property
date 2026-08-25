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

// ΠΕΝΤΕ ΠΡΟΤΥΠΑ, ΠΕΝΤΕ ΔΟΥΛΕΙΕΣ. Ήταν έξι: το «Ευχαριστία και επιστροφή»
// έλεγε «ευχαριστούμε» (όπως το «Αίτημα αξιολόγησης») και «έλα ξανά» (όπως η
// «Προσφορά επιστροφής»), χωρίς να ζητά ούτε αξιολόγηση ούτε να προσφέρει
// έκπτωση. Ένα πρότυπο που είναι ο αδύναμος συνδυασμός δύο άλλων δεν διαλέγεται
// ποτέ συνειδητά· απλώς μεγαλώνει τη λίστα από την οποία πρέπει να διαλέξεις.
export type MsgTemplateId = 'welcome' | 'checkin' | 'during' | 'review' | 'returning';

export interface MsgTemplate {
  id: MsgTemplateId;
  label: string;
  build: (c: MsgContext) => string;
}

const firstName = (name?: string | null) => (name || '').trim().split(/\s+/)[0] || '';
// Η ΗΜΕΡΑ ΑΦΙΞΗΣ ΠΟΥ ΔΙΑΒΑΖΕΙ Ο ΕΠΙΣΚΕΠΤΗΣ.
// Εδώ γραφόταν `new Date(d)` — μεσάνυχτα UTC — και μορφοποιούνταν σε ΤΟΠΙΚΗ
// ώρα. Σε ζώνη με αρνητική απόκλιση, η άφιξη «2026-01-01» έφτανε στο μήνυμα ως
// «31 Δεκεμβρίου». Δεν είναι εσωτερικός αριθμός: είναι το κείμενο που στέλνει ο
// ιδιοκτήτης στον πελάτη του, με το όνομά του από πάνω.
const fmtDate = (d?: string | null) => {
  const iso = (d || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return '';
  const dt = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('el-GR', { day: 'numeric', month: 'long' });
};
// ═══ «ΣΤΟ ΤΟ ΚΑΤΑΛΥΜΑ» ═══════════════════════════════════════════════════════
// Το `propRef` επέστρεφε «το κατάλυμα» ΜΕ το άρθρο και κάθε πρότυπο έγραφε από
// μπροστά ένα δεύτερο: «ευχαριστούμε για την κράτηση στο το κατάλυμα». Σε πέντε
// από τα έξι έτοιμα μηνύματα, δηλαδή σε ό,τι στέλνει ο ιδιοκτήτης στον πελάτη
// του με το όνομά του από πάνω. Το άρθρο ανήκει στη φράση, όχι στο όνομα.
const propName = (c: MsgContext) => (c.propertyName || '').trim();
/** «στο Emmeleia's Home» ή «στο κατάλυμα». Ένα άρθρο, εδώ. */
const atProp = (c: MsgContext) => `στο ${propName(c) || 'κατάλυμα'}`;
/** Σκέτο, για φράσεις που βάζουν μόνες τους την πρόθεση: «οδηγίες άφιξης για …». */
const forProp = (c: MsgContext) => propName(c) || 'το κατάλυμα';

export const MSG_TEMPLATES: MsgTemplate[] = [
  {
    id: 'welcome', label: 'Καλωσόρισμα',
    build: c => {
      const n = firstName(c.clientName);
      const hi = n ? `Γεια σου ${n}! ` : 'Γεια σου! ';
      const when = c.checkIn ? ` για τις ${fmtDate(c.checkIn)}` : '';
      return `${hi}Καλωσόρισες και ευχαριστούμε για την κράτηση${when} ${atProp(c)}. Είμαστε στη διάθεσή σου για οτιδήποτε χρειαστείς. Καλή διαμονή!`;
    },
  },
  {
    id: 'checkin', label: 'Οδηγίες άφιξης',
    build: c => {
      const n = firstName(c.clientName);
      const where = c.address ? ` Η διεύθυνση είναι: ${c.address}.` : '';
      const day = c.checkIn ? ` Σε περιμένουμε στις ${fmtDate(c.checkIn)}.` : '';
      return `${n ? n + ', ' : ''}ορίστε οι οδηγίες άφιξης για ${forProp(c)}.${where}${day} Μόλις φτάσεις κοντά, στείλε μας μήνυμα να συντονιστούμε για την παραλαβή των κλειδιών.`;
    },
  },
  {
    id: 'during', label: 'Κατά τη διαμονή',
    build: c => {
      const n = firstName(c.clientName);
      return `${n ? n + ', ' : ''}ελπίζουμε να περνάς υπέροχα ${atProp(c)}. Αν χρειαστείς οτιδήποτε, από μια σύσταση για φαγητό μέχρι κάποια βοήθεια στο κατάλυμα, γράψε μας ελεύθερα.`;
    },
  },
  {
    id: 'review', label: 'Αίτημα αξιολόγησης',
    build: c => {
      const n = firstName(c.clientName);
      return `${n ? n + ', ' : ''}ευχαριστούμε πολύ που έμεινες ${atProp(c)}. Ελπίζουμε να πέρασες τέλεια! Αν σου άρεσε, θα εκτιμούσαμε πολύ μια σύντομη αξιολόγηση, μας βοηθάει πραγματικά. Καλή συνέχεια!`;
    },
  },
  {
    id: 'returning', label: 'Προσφορά επιστροφής',
    build: c => {
      const n = firstName(c.clientName);
      const pct = c.discountPct && c.discountPct > 0 ? Math.round(c.discountPct) : 10;
      return `${n ? n + ', ' : ''}χαρήκαμε πολύ που σε φιλοξενήσαμε ${atProp(c)}! Επειδή είσαι από τους αγαπημένους μας επισκέπτες, θα θέλαμε να σου προσφέρουμε έκπτωση ${pct}% στην επόμενη διαμονή σου. Πες μας ποιες ημερομηνίες σκέφτεσαι και το κανονίζουμε.`;
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
