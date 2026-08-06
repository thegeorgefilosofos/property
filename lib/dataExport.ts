import { createClient } from '@/lib/supabase/client';
import { athensToday } from './core/time';

// ═══════════════════════════════════════════════════════════════════════════
// ΦΟΡΗΤΟΤΗΤΑ ΔΕΔΟΜΕΝΩΝ (GDPR, άρθρο 20) — ΜΙΑ ΔΙΑΔΡΟΜΗ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΥΠΗΡΧΕ ΠΡΙΝ: ΔΥΟ εξαγωγές «όλων των δεδομένων», και οι δύο στην ίδια οθόνη
// Ρυθμίσεων, με δύο ξεχωριστές υλοποιήσεις:
//
//   · «Εξαγωγή δεδομένων» μέσα στη ζώνη διαγραφής λογαριασμού → RPC
//     `export_my_data`, που ανακαλύπτει ΔΥΝΑΜΙΚΑ κάθε πίνακα με στήλη `user_id`.
//   · «Εξαγωγή όλων των δεδομένων σου» στην ενότητα «Δεδομένα & Απόρρητο» →
//     αυτό το αρχείο, με ΧΕΙΡΟΓΡΑΦΗ λίστα εννέα πινάκων συν τεσσάρων ακόμη
//     μέσω `property_id`.
//
// Η βάση έχει ΠΕΝΗΝΤΑ ΕΝΝΕΑ πίνακες με `user_id`. Δηλαδή το κουμπί που έλεγε
// «όλων των δεδομένων σου» παρέδιδε περίπου το ένα πέμπτο τους — και η λίστα
// έμενε πίσω σιωπηλά με κάθε νέο πίνακα, γιατί κανένας έλεγχος δεν συνδέει μια
// σταθερά TypeScript με το σχήμα της βάσης.
//
// Σε αίτημα φορητότητας δεδομένων αυτό δεν είναι ατέλεια οθόνης: είναι ελλιπής
// απάντηση σε νόμιμο αίτημα, με ετικέτα που βεβαιώνει το αντίθετο.
//
// ΤΩΡΑ: μία διαδρομή, η αυθεντική. Το RPC ζει δίπλα στο σχήμα και δεν μπορεί να
// μείνει πίσω από αυτό — ο βρόχος του διαβάζει το `information_schema`. Η ίδια
// τεχνική με τη `delete_my_account`, που σβήνει από τους ίδιους ακριβώς πίνακες:
// ό,τι κατεβάζεις είναι ό,τι διαγράφεται.
// ═══════════════════════════════════════════════════════════════════════════

export interface ExportResult {
  ok: boolean;
  error?: string;
  /** Πόσοι πίνακες είχαν έστω μία γραμμή. */
  tables?: number;
  rows?: number;
}

type Row = Record<string, unknown>;

/**
 * Κατεβάζει ΟΛΑ τα δεδομένα του συνδεδεμένου χρήστη σε ένα αρχείο JSON.
 *
 * Δεν δέχεται `userId`: η ταυτότητα βγαίνει από το `auth.uid()` μέσα στο RPC.
 * Ένα αναγνωριστικό που έρχεται από τον πελάτη σε λειτουργία εξαγωγής όλων των
 * δεδομένων είναι παράμετρος που δεν θέλεις να μπορεί να αλλάξει κανείς.
 */
export async function exportAllData(): Promise<ExportResult> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc('export_my_data');
    if (error) return { ok: false, error: error.message || 'Η εξαγωγή απέτυχε.' };
    if (!data) return { ok: false, error: 'Η εξαγωγή δεν επέστρεψε δεδομένα.' };

    const payload = data as { data?: Record<string, Row[]> };
    const tablesObj = payload.data ?? {};
    const tables = Object.keys(tablesObj).length;
    const rows = Object.values(tablesObj).reduce<number>(
      (sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);

    download(JSON.stringify(data, null, 2), `propertyos-data-${athensToday()}.json`);
    return { ok: true, tables, rows };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Η εξαγωγή απέτυχε.' };
  }
}

/** Λήψη αρχείου στον περιηγητή. Ένα σημείο, ώστε να μη γράφεται σε κάθε καλούντα. */
function download(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
