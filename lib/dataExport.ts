import { createClient } from '@/lib/supabase/client';
import { athensToday } from './core/time';
import { downloadFile } from '@/lib/core/download';

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
//
// ΚΑΙ ΜΙΑ ΔΕΥΤΕΡΗ ΔΙΟΡΘΩΣΗ, ΣΤΟ ΙΔΙΟ ΣΗΜΕΙΟ. Το «κάθε πίνακας με στήλη
// `user_id`» έπιανε 62 από τους 78: έμεναν έξω `organizations`, `referrals`,
// `accountant_clients` και `accountant_requests`, που λένε τον χρήστη
// `owner_user_id`, `referrer_user_id` ή `accountant_id`. Από το
// 20260815120000_the_export_matches_the_promise.sql ο κανόνας είναι η ΣΧΕΣΗ και
// όχι το όνομα: κάθε στήλη με ξένο κλειδί προς `auth.users(id)`, συν το
// `user_id` για τον έναν πίνακα που δεν έχει κλειδί. Σύνολο 66, και ο
// λογαριασμός ο ίδιος στο κλειδί `account`.
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

    downloadFile(JSON.stringify(data, null, 2), `propertyos-data-${athensToday()}.json`, 'application/json');
    return { ok: true, tables, rows };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Η εξαγωγή απέτυχε.' };
  }
}

// Η λήψη ζει στο lib/core/download.ts. Αυτό το αντίγραφο ήταν το ΠΙΟ σωστό από
// τα επτά — είχε appendChild — αλλά ανακαλούσε τη διεύθυνση ΑΜΕΣΩΣ μετά το
// κλικ, δηλαδή έπασχε από τη μία από τις δύο αστοχίες. Η εξαγωγή δεδομένων
// είναι δικαίωμα του ΓΚΠΔ: δεν επιτρέπεται να αποτυγχάνει σιωπηλά.
