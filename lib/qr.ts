import qrcode from 'qrcode-generator';

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

  const qr = qrcode(0, 'M');               // 0 = αυτόματη επιλογή έκδοσης
  qr.addData(text);                        // byte mode (default) για URL
  qr.make();

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
