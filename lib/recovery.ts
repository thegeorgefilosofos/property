// ═══════════════════════════════════════════════════════════════════════════
// ΕΞΟΔΟΣ ΚΙΝΔΥΝΟΥ ΑΠΟ ΠΑΛΙΟ BUILD.
//
// ΤΟ ΠΡΟΒΛΗΜΑ ΠΟΥ ΛΥΝΕΙ:
// Όταν ο service worker σερβίρει chunk προηγούμενου build μαζί με HTML του
// νέου, η εφαρμογή πέφτει σε «Κάτι πήγε στραβά». Το κουμπί «Δοκίμασε ξανά»
// καλεί το reset() του React, που ξαναφορτώνει ΤΑ ΙΔΙΑ σπασμένα modules. Ο
// χρήστης πατά, ξαναβλέπει το ίδιο, πατά ξανά. Δεν υπάρχει διέξοδος μέσα από
// την εφαρμογή: πρέπει να ξέρει να καθαρίσει δεδομένα ιστότοπου, πράγμα που
// κανένας ιδιοκτήτης ακινήτου δεν ξέρει και ούτε οφείλει να ξέρει.
//
// ΤΙ ΚΑΝΕΙ:
// Ξεγράφει τους service workers, σβήνει ΟΛΕΣ τις caches και επαναφορτώνει.
// Δεν αγγίζει localStorage ούτε τη συνεδρία: ο χρήστης δεν χάνει ούτε τα
// δεδομένα του ούτε τη σύνδεσή του, μόνο τα αποθηκευμένα αρχεία του build.
//
// ΜΙΑ ΦΟΡΑ ΑΝΑ ΣΥΝΕΔΡΙΑ, ΜΕ ΣΗΜΑΙΑ:
// Χωρίς φρένο, ένα σφάλμα που ΔΕΝ οφείλεται σε παλιά cache θα έστελνε τον
// χρήστη σε ατέρμονο κύκλο επαναφορτώσεων, που είναι χειρότερο από το αρχικό
// πρόβλημα. Η σημαία ζει στο sessionStorage: σβήνει μόλις κλείσει η καρτέλα,
// οπότε την επόμενη φορά η επαναφορά είναι πάλι διαθέσιμη.
// ═══════════════════════════════════════════════════════════════════════════

const FLAG = 'pos-recovered-once';

/** Έχει ήδη γίνει απόπειρα επαναφοράς σε αυτή τη συνεδρία; */
export function alreadyRecovered(): boolean {
  try { return sessionStorage.getItem(FLAG) === '1'; } catch { return true; }
}

/**
 * Καθαρίζει ό,τι μπορεί να κρατά παλιό build και επαναφορτώνει.
 *
 * @param force Παρακάμπτει τη σημαία, για το κουμπί που πατά ο χρήστης ρητά.
 * @returns true αν ξεκίνησε επαναφορά. Η σελίδα φορτώνει ξανά αμέσως μετά.
 */
export async function recoverFromStaleBuild(force = false): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!force && alreadyRecovered()) return false;

  try { sessionStorage.setItem(FLAG, '1'); } catch { /* ιδιωτική περιήγηση */ }

  // Και τα δύο σε Promise.allSettled: αν ένα αποτύχει, το άλλο πρέπει να γίνει.
  await Promise.allSettled([
    (async () => {
      if (!('serviceWorker' in navigator)) return;
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.allSettled(regs.map(r => r.unregister()));
    })(),
    (async () => {
      if (!('caches' in window)) return;
      const keys = await caches.keys();
      await Promise.allSettled(keys.map(k => caches.delete(k)));
    })(),
  ]);

  // replace και όχι reload: δεν αφήνει τη σπασμένη κατάσταση στο ιστορικό, ώστε
  // το «πίσω» να μην ξαναφέρει τον χρήστη στην οθόνη σφάλματος.
  window.location.replace(window.location.href);
  return true;
}
