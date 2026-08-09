// ═══════════════════════════════════════════════════════════════════════════
// ΔΙΑΒΑΣΜΑ ΞΕΝΟΥ ΦΥΛΛΟΥ EXCEL, ΜΕ ΟΡΙΑ
// ─────────────────────────────────────────────────────────────────────────
// Ένα σημείο για ό,τι μπαίνει στην εφαρμογή από αρχείο που δεν φτιάξαμε εμείς.
// Επιβάλλει τρία όρια που καμία οθόνη δεν επέβαλλε μόνη της:
//
//   ΜΕΓΕΘΟΣ   Ένα φύλλο 200 MB δεν είναι κατάσταση εξόδων, είναι επίθεση
//             μνήμης. Το όριο κόβει πριν καν ξεκινήσει η ανάγνωση.
//   ΧΡΟΝΟΣ    Ο αναλυτής μπορεί να κολλήσει σε φύλλο φτιαγμένο γι' αυτό. Ο
//             εργάτης τερματίζεται και ο χρήστης παίρνει μήνυμα, όχι παγωμένη
//             οθόνη.
//   ΑΠΟΜΟΝΩΣΗ Η ανάγνωση γίνεται σε Web Worker, με δικό του καθολικό
//             περιβάλλον. Μόλυνση πρωτοτύπου από κακόβουλο φύλλο μένει εκεί.
//
// ΓΙΑΤΙ ΥΠΑΡΧΕΙ ΕΦΕΔΡΕΙΑ. Αν ο περιηγητής δεν φτιάξει εργάτη, το αρχείο
// διαβάζεται στο κύριο νήμα, όπως γινόταν πάντα. Η εναλλακτική θα ήταν να
// αρνηθούμε να διαβάσουμε το αρχείο ΤΟΥ ΙΔΙΟΥ ΤΟΥ ΧΡΗΣΤΗ — και το να μη
// δουλεύει η εισαγωγή είναι βέβαιη ζημιά, ενώ ο κίνδυνος είναι υποθετικός.
// Η εφεδρεία δηλώνεται εδώ ρητά, δεν συμβαίνει σιωπηλά.
// ═══════════════════════════════════════════════════════════════════════════

/** Ένα φύλλο εξόδων δεν ξεπερνά τα δέκα megabyte. Ό,τι μεγαλύτερο δεν είναι φύλλο εξόδων. */
export const MAX_SHEET_BYTES = 10 * 1024 * 1024;

/** Δεκαπέντε δευτερόλεπτα φτάνουν και για δεκάδες χιλιάδες γραμμές. */
export const SHEET_TIMEOUT_MS = 15_000;

export class SheetError extends Error {}

/**
 * Διαβάζει το πρώτο φύλλο ενός αρχείου Excel και το επιστρέφει ως CSV.
 *
 * @throws SheetError με ελληνικό μήνυμα έτοιμο για την οθόνη.
 */
export async function readSheetAsCsv(file: File): Promise<string> {
  if (file.size > MAX_SHEET_BYTES) {
    throw new SheetError(`Το αρχείο είναι πολύ μεγάλο (όριο ${Math.round(MAX_SHEET_BYTES / 1024 / 1024)} MB).`);
  }
  const buffer = await file.arrayBuffer();

  if (typeof Worker !== 'undefined') {
    try {
      return await inWorker(buffer);
    } catch (e) {
      if (e instanceof SheetError) throw e;
      // Ο εργάτης δεν ξεκίνησε καθόλου: πέφτουμε στο κύριο νήμα.
    }
  }
  return inMainThread(buffer);
}

function inWorker(buffer: ArrayBuffer): Promise<string> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('../../app/dashboard/components/sheetWorker.ts', import.meta.url));
    } catch (e) { reject(e); return; }

    const timer = setTimeout(() => {
      worker.terminate();
      reject(new SheetError('Το αρχείο άργησε πολύ να διαβαστεί. Δοκίμασε να το αποθηκεύσεις ως CSV.'));
    }, SHEET_TIMEOUT_MS);

    worker.onmessage = (ev: MessageEvent<{ csv?: string; error?: string }>) => {
      clearTimeout(timer); worker.terminate();
      if (ev.data.error || typeof ev.data.csv !== 'string') reject(new SheetError(ev.data.error || 'Το αρχείο δεν διαβάστηκε.'));
      else resolve(ev.data.csv);
    };
    worker.onerror = () => { clearTimeout(timer); worker.terminate(); reject(new Error('worker')); };
    worker.postMessage({ buffer }, [buffer]);
  });
}

async function inMainThread(buffer: ArrayBuffer): Promise<string> {
  const XLSX = (await import('xlsx-js-style')).default;
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const first = wb.SheetNames[0];
  if (!first) throw new SheetError('Το αρχείο δεν έχει φύλλα.');
  return XLSX.utils.sheet_to_csv(wb.Sheets[first], { dateNF: 'yyyy-mm-dd' });
}
