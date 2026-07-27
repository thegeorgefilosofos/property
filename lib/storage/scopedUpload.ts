// ═══════════════════════════════════════════════════════════════════════════
// scopedUpload — ΜΙΑ υλοποίηση για ανέβασμα αρχείου σε φάκελο του ίδιου του
// χρήστη. Κάθε μονοπάτι ξεκινά με το uid («<auth.uid()>/…»), ώστε οι πολιτικές
// αποθήκευσης να μπορούν να απομονώνουν τα αρχεία ανά χρήστη με
// `(storage.foldername(name))[1] = auth.uid()::text`.
//
// Χωρίς αυτό, τα δημόσια buckets (avatars, inventory-photos) είχαν επίπεδα
// μονοπάτια και η μόνη δυνατή προστασία ήταν «ανά bucket», δηλαδή κάθε
// συνδεδεμένος χρήστης μπορούσε να σβήσει το αρχείο άλλου.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ScopedUploadResult {
  /** Πλήρες μονοπάτι με το πρόθεμα του χρήστη — χρειάζεται για getPublicUrl/remove. */
  path: string;
  error: { message: string } | null;
}

/**
 * Ανεβάζει το αρχείο στο `<uid>/<relPath>` του bucket.
 * @param relPath μονοπάτι ΧΩΡΙΣ το uid (π.χ. «contacts/1712.jpg»)
 */
export async function uploadUserScoped(
  supabase: SupabaseClient,
  bucket: string,
  relPath: string,
  file: File,
  opts?: { upsert?: boolean; contentType?: string },
): Promise<ScopedUploadResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { path: '', error: { message: 'Χρειάζεται σύνδεση για το ανέβασμα αρχείου.' } };
  const path = `${user.id}/${relPath}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, opts);
  return { path, error: error ? { message: error.message } : null };
}
