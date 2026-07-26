// ═══════════════════════════════════════════════════════════════════════════
// docUtils — κοινά εργαλεία για τα «έγγραφα» modals (μισθωτήριο, αναπροσαρμογή,
// κατανομή). Μία υλοποίηση για μορφοποίηση, αρχειοθέτηση και φωνητική απάντηση,
// ώστε να μην επαναλαμβάνεται η ίδια λογική σε κάθε modal.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js';

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

/** Ανεβάζει το PDF και το καταχωρεί στα έγγραφα του ακινήτου. Σε παλιότερη βάση
 *  χωρίς τη στήλη supplier, ξαναδοκιμάζει χωρίς αυτήν. */
export async function archivePdfToProperty(i: ArchiveInput): Promise<void> {
  const path = `${i.userId}/${i.propertyId}/document/${Date.now()}_${i.fileName}.pdf`;
  const { error: upErr } = await i.supabase.storage.from('property-files')
    .upload(path, i.blob, { upsert: false, contentType: 'application/pdf' });
  if (upErr) throw upErr;
  const base = {
    property_id: i.propertyId, user_id: i.userId, kind: 'document', category: i.category || 'document',
    title: i.title.slice(0, 200), notes: i.notes || null, doc_date: i.docDate || null,
    file_path: path, file_name: `${i.fileName}.pdf`, mime: 'application/pdf', size_bytes: i.blob.size,
  };
  let { error } = await i.supabase.from('property_documents').insert({ ...base, supplier: i.supplier || null });
  if (error && /supplier/i.test(error.message)) ({ error } = await i.supabase.from('property_documents').insert(base));
  if (error) throw error;
}

// ── Φωνητική απάντηση «ναι / αργότερα» ───────────────────────────────────────
interface SpeechEvent { results?: { [i: number]: { [j: number]: { transcript?: string } } } }
interface SpeechRec { lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number; start(): void; onresult: (e: SpeechEvent) => void; onerror: () => void; onend: () => void }

/** Υποστηρίζει ο browser αναγνώριση ομιλίας; (για απόκρυψη του μικροφώνου) */
export function speechSupported(): boolean {
  const g = globalThis as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return !!(g.SpeechRecognition || g.webkitSpeechRecognition);
}

/** Ακούει μία σύντομη απάντηση στα ελληνικά και καλεί onYes/onNo. Επιστρέφει
 *  false αν δεν υποστηρίζεται, ώστε ο καλών να μην αλλάξει κατάσταση. */
export function askByVoice(o: { onYes: () => void; onNo: () => void; onEnd?: () => void }): boolean {
  const g = globalThis as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  const SR = g.SpeechRecognition || g.webkitSpeechRecognition;
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
