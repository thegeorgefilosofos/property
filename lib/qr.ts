import qrcodeImport from 'qrcode-generator';

// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΕΚΛΕΙΣΕ ΤΗΝ ΕΦΑΡΜΟΓΗ ΕΞΩ
//
// Εδώ υπήρχε, ΣΕ ΕΠΙΠΕΔΟ MODULE, η γραμμή:
//     qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
//
// Το qrcode-generator είναι πακέτο UMD. Ανάλογα με τον bundler και την έκδοσή
// του, το `import ... from` μπορεί να δώσει είτε την ίδια τη συνάρτηση με τις
// ιδιότητές της, είτε ένα περιτύλιγμα όπου οι ιδιότητες κρέμονται στο
// `.default`. Στη δεύτερη περίπτωση το `stringToBytesFuncs` είναι undefined και
// η γραμμή πετά `Cannot read properties of undefined (reading 'UTF-8')`.
//
// ΤΟ ΚΑΤΑΣΤΡΟΦΙΚΟ ΔΕΝ ΕΙΝΑΙ ΤΟ ΣΦΑΛΜΑ, ΕΙΝΑΙ ΤΟ ΠΟΥ ΣΥΜΒΑΙΝΕΙ. Σε επίπεδο
// module, η εξαίρεση σκάει ΠΡΙΝ αποδοθεί οτιδήποτε. Δεν χαλάει το QR: δεν
// φορτώνει ΚΑΝΕΝΑ κομμάτι του πίνακα ελέγχου που βρίσκεται στο ίδιο chunk. Η
// αρχική σελίδα δούλευε (δεν εισάγει QR), η εφαρμογή έδειχνε «Κάτι πήγε
// στραβά» και το «Δοκίμασε ξανά» ξαναφόρτωνε το ίδιο σπασμένο module.
//
// ΔΥΟ ΔΙΟΡΘΩΣΕΙΣ, ΟΧΙ ΜΙΑ:
//   1. Το interop λύνεται ρητά, αντί να θεωρείται δεδομένο.
//   2. Η κωδικοποίηση UTF-8 δεν δανείζεται πια από τα εσωτερικά της βιβλιοθήκης.
//      Είναι δύο γραμμές δικές μας, με TextEncoder, που κάνουν ακριβώς το ίδιο.
//      Καμία εξάρτηση από ιδιωτικό πεδίο τρίτου πακέτου, καμία ανάθεση σε
//      επίπεδο module.
// ═══════════════════════════════════════════════════════════════════════════

type QrFactory = typeof qrcodeImport & {
  stringToBytes?: (s: string) => number[];
  stringToBytesFuncs?: Record<string, (s: string) => number[]>;
};

/** Ξετυλίγει το UMD ό,τι σχήμα κι αν του δώσει ο bundler. */
const raw = qrcodeImport as unknown as { default?: unknown };
const qrcode = (typeof qrcodeImport === 'function' ? qrcodeImport : raw.default) as QrFactory;

/**
 * Σωστά bytes UTF-8.
 *
 * Το qrcode-generator κωδικοποιεί εξ ορισμού με `charCodeAt(i) & 0xff`, που
 * ΚΑΤΑΣΤΡΕΦΕΙ σιωπηλά κάθε μη-ASCII χαρακτήρα: το «Γ» (U+0393) γίνεται byte 147
 * και ο σαρωτής διαβάζει σκουπίδια. Σε ελληνική εφαρμογή αυτό αφορά τα πάντα:
 * όνομα ιδιοκτήτη σε QR πληρωμής, αιτιολογία «Ενοίκιο Ιουλίου», κάρτα επαφής,
 * ετικέτα απογραφής. Το QR παράγεται κανονικά και είναι άχρηστο.
 */
const utf8Bytes = (s: string): number[] => Array.from(new TextEncoder().encode(s));

/**
 * Εφαρμόζεται ΤΕΜΠΕΛΙΚΑ, την πρώτη φορά που ζωγραφίζεται QR και ποτέ σε επίπεδο
 * module. Έτσι ακόμη κι αν κάτι αλλάξει ξανά στο πακέτο ή στον bundler, το πολύ
 * να μη λειτουργήσει ΤΟ QR. Δεν κλείνει την εφαρμογή.
 */
let encoderReady = false;
function ensureUtf8Encoder(): void {
  if (encoderReady) return;
  encoderReady = true;
  try { qrcode.stringToBytes = utf8Bytes; } catch { /* το QR θα βγει ASCII-only */ }
}

// ═══════════════════════════════════════════════════════════════════════════
// Δημιουργία QR ΤΟΠΙΚΑ στη συσκευή, χωρίς καμία εξωτερική κλήση (privacy-by-design,
// GDPR Άρθ. 25). Χρησιμοποιεί τη δοκιμασμένη υλοποίηση qrcode-generator (Kazuhiko
// Arase, MIT, μηδενικές εξαρτήσεις) και σχεδιάζει σε canvas.
//
// Επίπεδο διόρθωσης σφαλμάτων 'M' (~15%): η τυπική ισορροπία μεγέθους/ανθεκτικότητας
// για συνδέσμους. Χρώμα πολύ σκούρο navy σε λευκό: υψηλή αντίθεση για αξιόπιστη σάρωση.
// ═══════════════════════════════════════════════════════════════════════════

export function drawQrToCanvas(
  canvas: HTMLCanvasElement,
  text: string,
  opts?: { size?: number; margin?: number; dark?: string; light?: string },
): void {
  const size = opts?.size ?? 220;
  const margin = opts?.margin ?? 4;        // quiet zone σε modules (πρότυπο: 4)
  const dark = opts?.dark ?? '#0d1b2e';    // near-black navy, ~16:1 σε λευκό
  const light = opts?.light ?? '#ffffff';

  // Το qr.make() πετά ΣΚΕΤΟ string ('code length overflow') όταν το κείμενο δεν
  // χωρά ούτε στη μεγαλύτερη έκδοση. Επειδή η qrDataUrl καλείται μέσα σε render,
  // μια ανεξέλεγκτη εξαίρεση θα έριχνε ολόκληρη την καρτέλα — π.χ. αν ένα είδος
  // απογραφής ήρθε από εισαγωγή CSV με τεράστια περιγραφή. Καλύτερα κενό QR
  // παρά λευκή οθόνη.
  ensureUtf8Encoder();
  const qr = qrcode(0, 'M');               // 0 = αυτόματη επιλογή έκδοσης
  try {
    qr.addData(text);                      // byte mode (UTF-8, βλ. παραπάνω)
    qr.make();
  } catch {
    return;
  }

  const count = qr.getModuleCount();
  const total = count + margin * 2;
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 3) : 1;
  const px = Math.round(size * dpr);

  canvas.width = px;
  canvas.height = px;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const cell = px / total;
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = dark;
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) {
        // Στρογγυλοποίηση ακμών ώστε τα κελιά να ενώνονται χωρίς κενά (αξιόπιστη σάρωση).
        const x = Math.round((c + margin) * cell);
        const y = Math.round((r + margin) * cell);
        const w = Math.round((c + margin + 1) * cell) - x;
        const h = Math.round((r + margin + 1) * cell) - y;
        ctx.fillRect(x, y, w, h);
      }
    }
  }
}

/** Το ίδιο QR ως data: URL, για χρήση σε `<img src>` και σε παράθυρα εκτύπωσης.
 *
 *  ΓΙΑΤΙ ΥΠΑΡΧΕΙ: τρία σημεία της εφαρμογής έστελναν το περιεχόμενο του QR σε
 *  εξωτερική υπηρεσία (`api.qrserver.com`) μέσα στο query string — δηλαδή
 *  ονοματεπώνυμο, τηλέφωνο και email επαφής, IBAN και ποσό πληρωμής, στοιχεία
 *  απογραφής. Αυτά είναι προσωπικά δεδομένα τρίτων που έφευγαν από τη συσκευή
 *  χωρίς λόγο. Ο υπολογισμός γίνεται τοπικά σε χιλιοστά του δευτερολέπτου.
 *
 *  Επιστρέφει κενή συμβολοσειρά εκτός browser (SSR), ώστε ο caller να μη σκάει. */
export function qrDataUrl(
  text: string,
  opts?: { size?: number; margin?: number; dark?: string; light?: string },
): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  drawQrToCanvas(canvas, text, opts);
  return canvas.toDataURL('image/png');
}
