// ═══════════════════════════════════════════════════════════════════════════
// ΤΑ ΑΡΧΕΙΑ ΤΗΣ ΕΠΑΦΗΣ ΔΕΝ ΕΙΝΑΙ ΦΩΤΟΓΡΑΦΙΕΣ ΠΡΟΦΙΛ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΑΝΕΒΑΙΝΕΙ ΕΔΩ. Το κουμπί λέει «συμβόλαια, τιμολόγια ή φωτογραφίες» και
// δέχεται pdf, doc, xlsx. Ολα αυτά ανέβαιναν στον κάδο «avatars», που είναι
// δηλωμένος ΔΗΜΟΣΙΟΣ· αποθηκευόταν μάλιστα η δημόσια διεύθυνσή τους. Δηλαδή το
// μισθωτήριο του υδραυλικού και το τιμολόγιο με το ΑΦΜ του κατέβαιναν από
// οποιονδήποτε ήξερε τη διεύθυνση, χωρίς καμία ταυτοποίηση.
//
// ΚΑΙ ΤΟ Χ ΔΕΝ ΕΣΒΗΝΕ ΤΙΠΟΤΑ. Αφαιρούσε τη γραμμή από τη λίστα και το
// αντικείμενο έμενε στον κάδο για πάντα, κατεβάσιμο, χωρίς ο χρήστης να έχει
// πια τρόπο να το βρει. Το δεύτερο είναι σοβαρό ακριβώς επειδή ισχύει το πρώτο.
//
// ── ΤΑ ΠΑΛΙΑ ΑΡΧΕΙΑ ΔΕΝ ΞΕΧΝΙΟΥΝΤΑΙ ─────────────────────────────────────
// Ο,τι ανέβηκε ώς σήμερα κρατά δημόσια διεύθυνση μέσα στο `url`. Δεν
// μεταφέρεται αυτόματα (δεν σβήνουμε δεδομένα χρήστη χωρίς να το ζητήσει),
// αλλά ΔΙΑΒΑΖΕΤΑΙ και ΣΒΗΝΕΤΑΙ κανονικά: η διεύθυνση κουβαλά μέσα της τον
// κάδο και το μονοπάτι της, οπότε το «Χ» τα φτάνει κι εκείνα.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js';

/** Ο ιδιωτικός κάδος όπου πάνε από εδώ και πέρα. */
export const CONTACT_BUCKET = 'property-files';

export interface ContactFile {
  name: string;
  /** Δημόσια διεύθυνση. Μόνο στα παλιά αρχεία. */
  url: string;
  size: string;
  uploaded: string;
  /** Το μονοπάτι μέσα στον ιδιωτικό κάδο. Στα νέα αρχεία. */
  path?: string;
}

/** Ο κάδος και το μονοπάτι ενός αρχείου, όποιας εποχής. `null` όταν δεν βγαίνει. */
export function objectOf(file: ContactFile): { bucket: string; path: string } | null {
  const path = (file.path || '').trim();
  if (path) return { bucket: CONTACT_BUCKET, path };
  // ΤΟ ΠΑΛΙΟ ΑΡΧΕΙΟ ΕΧΕΙ ΜΟΝΟ ΔΙΕΥΘΥΝΣΗ, ΚΑΙ ΤΗ ΔΙΑΒΑΖΟΥΜΕ. Η μορφή είναι
  // «…/storage/v1/object/public/<κάδος>/<μονοπάτι>» και είναι η μόνη που
  // παράγει το ίδιο το Supabase.
  const m = /\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/.exec((file.url || '').trim());
  if (!m) return null;
  try {
    return { bucket: m[1], path: decodeURIComponent(m[2].split('?')[0]) };
  } catch {
    return { bucket: m[1], path: m[2].split('?')[0] };
  }
}

/**
 * Σβήνει τα αντικείμενα των αρχείων από την αποθήκευση.
 *
 * @returns τι δεν σβήστηκε, με λόγια. Κενό όταν όλα έφυγαν.
 */
export async function removeFiles(supabase: SupabaseClient, files: readonly ContactFile[]): Promise<string> {
  const byBucket = new Map<string, string[]>();
  for (const f of files) {
    const o = objectOf(f);
    if (!o) continue;
    const list = byBucket.get(o.bucket) ?? [];
    list.push(o.path);
    byBucket.set(o.bucket, list);
  }
  const failed: string[] = [];
  for (const [bucket, paths] of byBucket) {
    const { error } = await supabase.storage.from(bucket).remove(paths);
    if (error) failed.push(`${bucket}: ${error.message}`);
  }
  return failed.join(' · ');
}

/** Πόσο ζει ένας υπογεγραμμένος σύνδεσμος: μία ώρα, όσο κρατά μια δουλειά. */
export const LINK_SECONDS = 3600;

/**
 * Η διεύθυνση από την οποία ανοίγει το αρχείο.
 *
 * Στα νέα, υπογεγραμμένη και προσωρινή. Στα παλιά, η δημόσια που ήδη υπάρχει:
 * το να επιστρέψουμε κενό θα έκρυβε αρχείο που ο χρήστης έχει ανεβάσει.
 */
export async function linkFor(supabase: SupabaseClient, file: ContactFile): Promise<string> {
  const path = (file.path || '').trim();
  if (!path) return (file.url || '').trim();
  const { data, error } = await supabase.storage.from(CONTACT_BUCKET).createSignedUrl(path, LINK_SECONDS);
  // Κενό σημαίνει «δεν άνοιξε» και ο καλών το λέει· μια σιωπηλή άδεια
  // διεύθυνση θα άνοιγε καρτέλα στο πουθενά.
  if (error) return '';
  return data?.signedUrl || '';
}
