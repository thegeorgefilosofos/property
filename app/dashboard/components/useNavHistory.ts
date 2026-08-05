'use client';

// ═══════════════════════════════════════════════════════════════════════════
// useNavHistory — η καρτέλα ζει στη διεύθυνση, όχι στη μνήμη.
// ─────────────────────────────────────────────────────────────────────────
// ΙΔΙΑ ΔΙΕΠΑΦΗ ΜΕ ΤΟ useState. Επιστρέφει `[nav, setNav]` ακριβώς όπως πριν,
// ώστε να μην αγγιχτεί κανένα από τα είκοσι σημεία που καλούν `setNav`. Ό,τι
// αλλάζει είναι ότι κάθε αλλαγή γράφεται στο ιστορικό του περιηγητή.
//
// ΓΙΑΤΙ useSyncExternalStore ΚΑΙ ΟΧΙ useState + useEffect
//
// Η διεύθυνση ΕΙΝΑΙ εξωτερική πηγή αλήθειας: την αλλάζει και ο χρήστης (πίσω,
// μπρος, πληκτρολόγηση στη γραμμή), όχι μόνο εμείς. Η προφανής υλοποίηση
// —`useState` και ένα effect που κάνει `setState` από το hash— έχει δύο
// πραγματικά προβλήματα, όχι στιλιστικά:
//
//   · Ο server ΔΕΝ βλέπει hash· δεν του στέλνεται ποτέ. Αν η αρχική κατάσταση
//     το διάβαζε, ο server θα απέδιδε «overview» και ο πελάτης «finances»:
//     ασυμφωνία ενυδάτωσης που ο React λύνει πετώντας και ξαναγράφοντας το
//     δέντρο — δηλαδή ένα ορατό τρεμόπαιγμα σε κάθε φόρτωση με hash.
//   · Το `setState` μέσα σε effect προκαλεί δεύτερο render μετά τη βαφή, άρα
//     ο χρήστης βλέπει την Επισκόπηση για ένα καρέ πριν εμφανιστεί η καρτέλα
//     που ζήτησε.
//
// Το `useSyncExternalStore` λύνει και τα δύο εξ ορισμού: δίνει ΞΕΧΩΡΙΣΤΟ
// στιγμιότυπο για τον server (η προεπιλογή) και για τον πελάτη (το hash), και
// ο React τα συμφιλιώνει χωρίς επιπλέον render.
//
// ΓΙΑΤΙ HASH ΚΑΙ ΟΧΙ ROUTE ΑΝΑ ΚΑΡΤΕΛΑ
// Το κομμάτι μετά το `#` δεν προκαλεί αίτημα: η αλλαγή καρτέλας δεν ξαναφορτώνει
// δεδομένα και δεν χρειάζεται νέο route. Ο πίνακας είναι ΜΙΑ σελίδα με πολλά
// πάνελ — με route ανά καρτέλα θα ξαναστηνόταν όλη η φόρτωση του ακινήτου σε
// κάθε κλικ, για μηδενικό όφελος.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useSyncExternalStore } from 'react';
import { parseNavHash, formatNavHash, shouldPush } from '@/lib/nav/history';

// Ο React καλεί το `subscribe` μία φορά· η συνάρτηση πρέπει να είναι σταθερή.
function subscribe(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange);
  // Το `hashchange` πιάνει την περίπτωση που ο χρήστης πληκτρολογεί το hash στη
  // γραμμή διευθύνσεων: εκεί ΔΕΝ εκπέμπεται popstate σε όλους τους περιηγητές,
  // και η οθόνη θα έμενε σε άλλη καρτέλα από τη διεύθυνση.
  window.addEventListener('hashchange', onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener('hashchange', onChange);
  };
}

export function useNavHistory(fallback: string): [string, (tab: string) => void] {
  // ΤΟ ΣΤΙΓΜΙΟΤΥΠΟ ΠΡΕΠΕΙ ΝΑ ΕΙΝΑΙ ΣΤΑΘΕΡΗ ΤΙΜΗ, ΟΧΙ ΝΕΟ ΑΝΤΙΚΕΙΜΕΝΟ.
  // Αν επέστρεφε `{tab, propertyId}`, ο React θα το έβλεπε αλλαγμένο σε κάθε
  // έλεγχο (νέα αναφορά) και θα έμπαινε σε ατέρμονο βρόχο render. Γι' αυτό
  // επιστρέφεται η καρτέλα ως συμβολοσειρά.
  const nav = useSyncExternalStore(
    subscribe,
    () => parseNavHash(window.location.hash, fallback).tab,
    () => fallback,   // στιγμιότυπο server: hash δεν υπάρχει εκεί
  );

  const setNav = useCallback((tab: string) => {
    const from = parseNavHash(window.location.hash, fallback);
    const to = { tab, propertyId: from.propertyId };
    if (!shouldPush(from, to)) return;
    const hash = formatNavHash(to);
    if (!hash) return;
    window.history.pushState(null, '', hash);
    // Το `pushState` ΔΕΝ εκπέμπει popstate — είναι ρητό στην προδιαγραφή. Χωρίς
    // αυτό το χειροκίνητο γεγονός, η διεύθυνση θα άλλαζε και η οθόνη όχι.
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, [fallback]);

  return [nav, setNav];
}
