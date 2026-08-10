// ═══════════════════════════════════════════════════════════════════════════
// docUtils — κοινά εργαλεία για τα «έγγραφα» modals (μισθωτήριο, αναπροσαρμογή,
// κατανομή). Μία υλοποίηση για μορφοποίηση, αρχειοθέτηση και φωνητική απάντηση,
// ώστε να μην επαναλαμβάνεται η ίδια λογική σε κάθε modal.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js';
import { speechRecognizer, type SpeechEvent } from '@/lib/core/speech';
// Το Αρχείο έχει ένα σπίτι: lib/data/documents.
import * as documents from '@/lib/data/documents';

/** Ημερομηνία σε ελληνική μορφή ΗΗ/ΜΜ/ΕΕΕΕ (ανεκτικό σε άκυρη είσοδο). */
export const grDate = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

/** Σημερινή ημερομηνία σε YYYY-MM-DD (τοπική, όχι UTC — ώστε να μη «γυρίζει» μέρα). */
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Ασφαλής μετατροπή σε αριθμό (κενό/άκυρο → 0). */
export const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// ── Αρχειοθέτηση PDF στα έγγραφα του ακινήτου ────────────────────────────────
export interface ArchiveInput {
  supabase: SupabaseClient;
  userId: string;
  propertyId: string;
  blob: Blob;
  fileName: string;      // χωρίς κατάληξη
  title: string;
  notes?: string;
  docDate?: string;      // YYYY-MM-DD — δίνει τη χρονολογική σειρά
  category?: string;     // π.χ. 'lease'
  supplier?: string;     // αντισυμβαλλόμενος (προαιρετικό σε παλιότερο schema)
}

/** Ανεβάζει το PDF και το καταχωρεί στα έγγραφα του ακινήτου. Η άμυνα για στήλη
 *  που δεν υπάρχει ακόμη στη βάση ζει στο στρώμα — εδώ ήξερε μόνο το `supplier`. */
export async function archivePdfToProperty(i: ArchiveInput): Promise<void> {
  const path = `${i.userId}/${i.propertyId}/document/${Date.now()}_${i.fileName}.pdf`;
  const { error: upErr } = await i.supabase.storage.from('property-files')
    .upload(path, i.blob, { upsert: false, contentType: 'application/pdf' });
  if (upErr) throw upErr;
  const { error } = await documents.add(i.supabase, i.propertyId, i.userId, {
    kind: 'document', category: i.category || 'document',
    title: i.title.slice(0, 200), notes: i.notes || null, doc_date: i.docDate || null,
    file_path: path, file_name: `${i.fileName}.pdf`, mime: 'application/pdf', size_bytes: i.blob.size,
    supplier: i.supplier || null,
  });
  if (error) throw error;
}

// ── Φωνητική απάντηση «ναι / αργότερα» ───────────────────────────────────────
// Οι τύποι της αναγνώρισης ομιλίας ζουν σε ένα σημείο (lib/core/speech.ts).
// Εδώ περιγράφονταν ιδιωτικά, και στη Νόα ως `any` — η ίδια διεπαφή, δύο φορές,
// με δύο διαφορετικά επίπεδα αλήθειας.
export { speechSupported } from '@/lib/core/speech';

/** Ακούει μία σύντομη απάντηση στα ελληνικά και καλεί onYes/onNo. Επιστρέφει
 *  false αν δεν υποστηρίζεται, ώστε ο καλών να μην αλλάξει κατάσταση. */
export function askByVoice(o: { onYes: () => void; onNo: () => void; onEnd?: () => void }): boolean {
  const SR = speechRecognizer();
  if (!SR) return false;
  const rec = new SR();
  rec.lang = 'el-GR'; rec.interimResults = false; rec.continuous = false; rec.maxAlternatives = 1;
  rec.onresult = (e: SpeechEvent) => {
    const said = String(e.results?.[0]?.[0]?.transcript || '').toLowerCase();
    if (/(ναι|ναί|αποθήκευσ|σώσ|φύλαξ)/.test(said)) o.onYes();
    else if (/(όχι|οχι|αργότερα|αργοτερα|ίσως|ισως|άκυρο)/.test(said)) o.onNo();
  };
  rec.onerror = () => o.onEnd?.();
  rec.onend = () => o.onEnd?.();
  try { rec.start(); } catch { o.onEnd?.(); return false; }
  return true;
}
