// ═══════════════════════════════════════════════════════════════════════════
// ΦΩΤΟΓΡΑΦΙΕΣ ΑΙΤΗΜΑΤΩΝ ΒΛΑΒΗΣ: ΜΙΑ ΥΠΟΓΡΑΦΗ, ΔΥΟ ΟΘΟΝΕΣ.
//
// Το bucket «maintenance-photos» είναι ιδιωτικό, οπότε στο
// maintenance_requests.photos αποθηκεύεται ΔΙΑΔΡΟΜΗ, όχι διεύθυνση. Το
// PortalShare την περνούσε ωμή σε <img src>: ο περιηγητής τη διάβαζε ως
// σχετικό URL πάνω στο /dashboard, ζητούσε /<token>/<αρχείο>, έπαιρνε 404 και
// ο ιδιοκτήτης έβλεπε δύο τετράγωνα 44 επί 44 με το εικονίδιο σπασμένης
// εικόνας σε κάθε αίτημα που είχε φωτογραφίες.
//
// Η υπογραφή υπήρχε ήδη και δούλευε, αλλά ζούσε κλειδωμένη μέσα στο
// MaintenanceView του TabTenantCare. Μετακόμισε εδώ αυτούσια, με το ίδιο
// bucket, την ίδια διάρκεια και την ίδια μεταχείριση των παλιών εγγραφών,
// ώστε οι δύο οθόνες που δείχνουν τα ΙΔΙΑ αιτήματα να μη μπορούν να
// αποκλίνουν.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js';

/** Το ιδιωτικό bucket όπου ανεβάζει η πύλη τις φωτογραφίες του ενοικιαστή. */
const BUCKET = 'maintenance-photos';

/** 7 ημέρες, όσο και πριν: αρκετό ώστε να ζήσει ένας σύνδεσμος προς συνεργείο. */
const SIGN_SECONDS = 604800;

/** Ο,τι χρειάζεται η υπογραφή: ταυτότητα αιτήματος και αποθηκευμένες διαδρομές. */
export interface PhotoRequest { id: string; photos?: string[] | null }

// Από παλιές εγγραφές μπορεί να έχει μείνει ολόκληρο public URL. Κρατάμε ό,τι
// ακολουθεί το «/maintenance-photos/» ώστε να υπογράφεται κι εκείνο σωστά.
function maintPhotoPath(stored: string): string {
  const marker = `/${BUCKET}/`;
  const i = stored.indexOf(marker);
  return i >= 0 ? stored.slice(i + marker.length) : stored;
}

/**
 * Κλειδί για τις εξαρτήσεις του effect. Αλλάζει μόνο όταν αλλάξει αίτημα ή
 * φωτογραφία: κάθε φόρτωση φτιάχνει νέο πίνακα, οπότε ο πίνακας ως εξάρτηση
 * θα ξαναζητούσε υπογραφή σε κάθε απόδοση.
 */
export function photosKey(list: PhotoRequest[]): string {
  return list.map(r => `${r.id}:${(r.photos || []).join(',')}`).join('|');
}

/**
 * Προσωρινά URL ανά αίτημα (id προς λίστα). Μία κλήση δικτύου για όλες τις
 * φωτογραφίες όλων των αιτημάτων, κενό αντικείμενο όταν δεν υπάρχει καμία.
 * Η ανάγνωση περνά από την πολιτική owns_portal_token του storage.objects,
 * που ο ιδιοκτήτης την περνά ήδη στην ίδια συνεδρία.
 */
export async function signMaintenancePhotos(
  supabase: SupabaseClient,
  list: PhotoRequest[],
): Promise<Record<string, string[]>> {
  const items: { id: string; path: string }[] = [];
  for (const r of list) {
    if (!Array.isArray(r.photos)) continue;
    for (const ph of r.photos) { if (ph) items.push({ id: r.id, path: maintPhotoPath(ph) }); }
  }
  if (items.length === 0) return {};
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(items.map(i => i.path), SIGN_SECONDS);
  if (!data) return {};
  const map: Record<string, string[]> = {};
  data.forEach((d, i) => { if (d.signedUrl) (map[items[i].id] ||= []).push(d.signedUrl); });
  return map;
}
