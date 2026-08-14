// ═══════════════════════════════════════════════════════════════════════════
// docUtils — κοινά εργαλεία για τα «έγγραφα» modals (μισθωτήριο, αναπροσαρμογή,
// κατανομή). Μία υλοποίηση για μορφοποίηση, αρχειοθέτηση και φωνητική απάντηση,
// ώστε να μην επαναλαμβάνεται η ίδια λογική σε κάθε modal.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js';
// Το Αρχείο έχει ένα σπίτι: lib/data/documents.
import * as documents from '@/lib/data/documents';
// Η ελληνική ημερομηνία έχει ένα σπίτι: lib/core/format.
export { grDate } from '@/lib/core/format';


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

// ── ΤΟ ΜΙΚΡΟΦΩΝΟ ΤΗΣ ΑΡΧΕΙΟΘΕΤΗΣΗΣ ΕΦΥΓΕ ─────────────────────────────────────
// Δύο παράθυρα (μισθωτήριο, αναπροσαρμογή) έβαζαν στρογγυλό κουμπί μικροφώνου
// ΔΙΠΛΑ στα δύο κουμπιά που έκαναν ακριβώς το ίδιο πράγμα: «Ίσως αργότερα» και
// «Ναι, αποθήκευσε». Δηλαδή τρίτος τρόπος να απαντηθεί ένα ναι/όχι που ήδη
// απαντιόταν με ένα πάτημα — και ο τρίτος ζητούσε άδεια μικροφώνου, περίμενε
// να μιλήσει ο χρήστης δυνατά στο γραφείο του, και αναγνώριζε δύο λέξεις.
// Ο,τι δεν θα πατηθεί ποτέ δεν κρύβεται· σβήνεται.
