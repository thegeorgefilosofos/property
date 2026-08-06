// ═══════════════════════════════════════════════════════════════════════════
// ΕΝΑΣ ΤΡΟΠΟΣ ΝΑ ΓΡΑΨΕΙΣ ΚΑΙ ΝΑ ΞΕΡΕΙΣ ΑΝ ΕΓΙΝΕ
// ─────────────────────────────────────────────────────────────────────────
// Ο πελάτης του Supabase επιστρέφει `{ data, error }` και δεν πετά ποτέ. Το
// αποτέλεσμα, γραμμένο εκατόν εξήντα τρεις φορές μέσα στην εφαρμογή:
//
//     await supabase.from('checklist_items').update({ … }).eq('id', id)
//     notifyOk('Αποθηκεύτηκε')          // …ή και όχι. Κανείς δεν κοίταξε.
//
// Δύο εργαλεία υπήρχαν ήδη και κανένα δεν ταίριαζε εδώ:
//   · Η `must` πετάει, ώστε να γίνουν αληθινά τα υπάρχοντα try/catch. Σε
//     χειριστή κουμπιού χωρίς try/catch ανεβαίνει ως ασύλληπτη απόρριψη.
//   · Ο χειροκίνητος έλεγχος `const {error} = …; if (error) { notifyError(…) }`
//     είναι σωστός, αλλά γράφεται από την αρχή κάθε φορά — και κάθε φορά με
//     άλλη διατύπωση, άλλο επίπεδο λεπτομέρειας, άλλη απόφαση για το τι γίνεται
//     μετά.
//
// Η `saved` είναι το τρίτο: ρωτά αν πέτυχε, το λέει αν όχι, και επιστρέφει
// ψευδές ώστε ο καλών να σταματήσει. Μία γραμμή, ίδια παντού.
//
//     if (!await saved('Η εκκρεμότητα δεν αποθηκεύτηκε',
//         supabase.from('checklist_items').update({ … }).eq('id', id))) return
//
// Δεν πετά ΠΟΤΕ: το νόημά της είναι να μη χρειάζεται ο καλών να προστατευτεί.
// ═══════════════════════════════════════════════════════════════════════════
import { notifyError } from './Toast';
import { writeErrorMessage, type DbError } from '@/lib/supabase/writeResult';

interface WriteOutcome { error: DbError | null }

/**
 * Εκτελεί ένα γράψιμο και λέει στον χρήστη αν απέτυχε.
 *
 * @param what Τι ΔΕΝ έγινε, με τα λόγια της οθόνης. Γίνεται η αρχή του μηνύματος.
 * @returns `true` σε επιτυχία. `false` σε αποτυχία — και τότε ο χρήστης το έχει
 *          ήδη δει, οπότε ο καλών δεν έχει να πει τίποτα άλλο· έχει μόνο να
 *          σταματήσει.
 */
export async function saved(what: string, query: PromiseLike<WriteOutcome>): Promise<boolean> {
  let outcome: WriteOutcome;
  try {
    outcome = await query;
  } catch (e) {
    // Δίκτυο που έπεσε στη μέση: ο πελάτης ΠΕΤΑ εδώ, δεν επιστρέφει σφάλμα.
    // Η μία διαδρομή πρέπει να καλύπτει και τις δύο περιπτώσεις, αλλιώς μένει
    // ακριβώς το κενό που ήρθε να κλείσει.
    notifyError(writeErrorMessage(what, { message: e instanceof Error ? e.message : 'Σφάλμα δικτύου' }));
    return false;
  }
  if (outcome?.error) {
    notifyError(writeErrorMessage(what, outcome.error));
    return false;
  }
  return true;
}

/**
 * Το ίδιο, αλλά επιστρέφει και τα δεδομένα: για γραψίματα που συνεχίζουν με
 * `.select()`, όπου το αναγνωριστικό της νέας γραμμής χρειάζεται παρακάτω.
 *
 * Επιστρέφει `null` σε αποτυχία — ίδια σύμβαση, ίδια σιωπή μετά το μήνυμα.
 */
export async function savedData<T>(
  what: string,
  query: PromiseLike<{ data: T | null; error: DbError | null }>,
): Promise<T | null> {
  try {
    const { data, error } = await query;
    if (error) { notifyError(writeErrorMessage(what, error)); return null; }
    return data;
  } catch (e) {
    notifyError(writeErrorMessage(what, { message: e instanceof Error ? e.message : 'Σφάλμα δικτύου' }));
    return null;
  }
}
