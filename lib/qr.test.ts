// Τεστ για τη ΤΟΠΙΚΗ δημιουργία QR.
//
// ΓΙΑΤΙ ΥΠΑΡΧΕΙ: τρία σημεία της εφαρμογής άλλαξαν από εξωτερική υπηρεσία
// (api.qrserver.com) σε τοπικό υπολογισμό. Η εξωτερική «απλώς δούλευε»· εδώ
// αναλαμβάνουμε εμείς την ορθότητα. Ένα QR πληρωμής που δεν σαρώνεται είναι
// χειρότερο από κανένα QR, γιατί ο μισθωτής νομίζει ότι φταίει το κινητό του.
//
// Ο έλεγχος γίνεται με ψεύτικο canvas που καταγράφει τα fillRect: δεν χρειάζεται
// browser και επαληθεύει αυτό που μετράει — ότι σχεδιάζεται σωστό πλέγμα με τη
// ΣΩΣΤΗ ζώνη ησυχίας (quiet zone), που είναι 4 modules κατά το πρότυπο.

import { drawQrToCanvas } from './qr'
import qrcode from 'qrcode-generator'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { if (cond) { passed++ } else { failed++; console.log('  ✗ ' + name) } }

interface Rect { x: number; y: number; w: number; h: number; fill: string }

/** Ελάχιστο canvas που καταγράφει τι ζωγραφίστηκε. */
function fakeCanvas() {
  const rects: Rect[] = []
  let fillStyle = '#000'
  const ctx = {
    get fillStyle() { return fillStyle },
    set fillStyle(v: string) { fillStyle = v },
    fillRect(x: number, y: number, w: number, h: number) { rects.push({ x, y, w, h, fill: fillStyle }) },
  }
  const canvas = {
    width: 0, height: 0, style: {} as Record<string, string>,
    getContext: () => ctx,
  }
  return { canvas: canvas as unknown as HTMLCanvasElement, rects }
}

const draw = (text: string, opts?: Parameters<typeof drawQrToCanvas>[2]) => {
  const { canvas, rects } = fakeCanvas()
  drawQrToCanvas(canvas, text, opts)
  return { canvas, rects, dark: rects.slice(1) }   // rects[0] = το λευκό φόντο
}

// ── Ζωγραφίζει κάτι και το φόντο μπαίνει πρώτο ────────────────────────────
{
  const { rects, dark } = draw('https://properwise.gr')
  ok('ζωγραφίζει φόντο πρώτα', rects.length > 0 && rects[0].fill === '#ffffff')
  ok('ζωγραφίζει σκούρα modules', dark.length > 20)
  ok('τα modules είναι στο χρώμα προσκηνίου', dark.every(r => r.fill === '#0d1b2e'))
}

// ── ΖΩΝΗ ΗΣΥΧΙΑΣ: 4 modules, το πρότυπο. Λιγότερα ⇒ αναξιόπιστη σάρωση ─────
{
  const size = 240
  const { canvas, dark } = draw('TEST')
  const px = canvas.width
  // Κανένα σκούρο module δεν πατά μέσα στη ζώνη ησυχίας.
  const minX = Math.min(...dark.map(r => r.x))
  const minY = Math.min(...dark.map(r => r.y))
  const maxX = Math.max(...dark.map(r => r.x + r.w))
  const maxY = Math.max(...dark.map(r => r.y + r.h))
  // Με margin 4 modules, το περιθώριο είναι 4/(count+8) του πλάτους.
  // Για το μικρότερο QR (21 modules) αυτό είναι 4/29 ≈ 13,8%.
  const marginRatio = minX / px
  ok('η ζώνη ησυχίας υπάρχει αριστερά', marginRatio > 0.10)
  ok('η ζώνη ησυχίας υπάρχει πάνω', minY / px > 0.10)
  ok('η ζώνη ησυχίας υπάρχει δεξιά', (px - maxX) / px > 0.10)
  ok('η ζώνη ησυχίας υπάρχει κάτω', (px - maxY) / px > 0.10)
  ok('η προεπιλογή δεν είναι μηδενική', minX > 0)
  ok('το canvas παίρνει το ζητούμενο μέγεθος', canvas.style.width === `${size}px` || canvas.style.width === '220px')
}

// ── Το περιεχόμενο επηρεάζει το αποτέλεσμα (δεν επιστρέφει σταθερό πλέγμα) ─
{
  const a = draw('ΑΑΑ').dark.length
  const b = draw('https://properwise.gr/portal/abc123def456').dark.length
  ok('διαφορετικό κείμενο → διαφορετικό QR', a !== b)
  ok('μεγαλύτερο κείμενο → περισσότερα modules', b > a)
}

// ── ΕΛΛΗΝΙΚΑ: όχι απλώς «δεν σκάει» — ΣΩΣΤΗ κωδικοποίηση UTF-8 ─────────────
//
// Το qrcode-generator κωδικοποιεί εξ ορισμού με `charCodeAt(i) & 0xff`, που
// σιωπηλά καταστρέφει κάθε μη-ASCII χαρακτήρα: το QR παράγεται κανονικά, δεν
// πετά καμία εξαίρεση και ο σαρωτής διαβάζει σκουπίδια. Ένα τεστ «δεν πέταξε
// εξαίρεση» θα περνούσε ενώ κάθε ελληνικό QR θα ήταν άχρηστο. Ελέγχουμε τα BYTES.
{
  // Ο κωδικοποιητής UTF-8 εφαρμόζεται ΤΕΜΠΕΛΙΚΑ, στην πρώτη σχεδίαση και όχι σε
  // επίπεδο module. Ήταν σε επίπεδο module και έριχνε ΟΛΗ την εφαρμογή όταν το
  // interop του πακέτου άλλαξε σχήμα. Η κλήση εδώ είναι ρητή ώστε η σειρά να
  // μην είναι τυχαία εξάρτηση από προηγούμενα μπλοκ αυτού του αρχείου.
  draw('warm-up')

  const bytes = qrcode.stringToBytes('Γ')
  const expected = Array.from(new TextEncoder().encode('Γ'))   // [0xCE, 0x93]
  ok('το «Γ» κωδικοποιείται ως 2 bytes UTF-8', bytes.length === 2)
  ok('τα bytes είναι ακριβώς τα σωστά', JSON.stringify(bytes) === JSON.stringify(expected))
  ok('ΔΕΝ χρησιμοποιείται ο προεπιλεγμένος (καταστροφικός) encoder', bytes[0] !== (0x393 & 0xff))

  const full = 'Γιώργος Παπαδόπουλος, Ερμού 15, Αθήνα'
  ok('πλήρης ελληνική συμβολοσειρά → σωστά bytes',
    JSON.stringify(qrcode.stringToBytes(full)) === JSON.stringify(Array.from(new TextEncoder().encode(full))))
  ok('το ASCII μένει ανέπαφο',
    JSON.stringify(qrcode.stringToBytes('GR16 0110')) === JSON.stringify(Array.from(new TextEncoder().encode('GR16 0110'))))

  let threw = false, n = 0
  try { n = draw(full).dark.length } catch { threw = true }
  ok('ελληνικοί χαρακτήρες δεν πετούν εξαίρεση', !threw)
  ok('ελληνικοί χαρακτήρες παράγουν modules', n > 20)
}

// ── Πραγματικά φορτία της εφαρμογής ────────────────────────────────────────
{
  // EPC QR πληρωμής (SEPA Credit Transfer) — αυτό που σαρώνει ο μισθωτής.
  const epc = `BCD\n002\n1\nSCT\n\nΓεώργιος Παπαδόπουλος\nGR1601101250000000012300695\nEUR650.00\n\n\nΕνοίκιο Ιουλίου 2026`
  let threw = false, n = 0
  try { n = draw(epc, { size: 240 }).dark.length } catch { threw = true }
  ok('EPC πληρωμής: χωρίς εξαίρεση', !threw)
  ok('EPC πληρωμής: παράγει QR', n > 100)

  // vCard επαφής με ελληνικά.
  const vcard = 'BEGIN:VCARD\nVERSION:3.0\nFN:Νίκος Υδραυλικός\nTEL:6941234567\nEMAIL:nikos@example.gr\nEND:VCARD'
  let threw2 = false, n2 = 0
  try { n2 = draw(vcard, { size: 240 }).dark.length } catch { threw2 = true }
  ok('vCard: χωρίς εξαίρεση', !threw2)
  ok('vCard: παράγει QR', n2 > 100)
}

// ── Ακραίες περιπτώσεις ────────────────────────────────────────────────────
{
  let threw = false
  try { draw('') } catch { threw = true }
  ok('κενό κείμενο δεν ρίχνει την εφαρμογή', !threw)

  // Υπερμεγέθες φορτίο: το qrcode-generator πετά σκέτο string. Επειδή η
  // qrDataUrl καλείται σε render, μια εξαίρεση θα έριχνε την καρτέλα.
  let threw3 = false
  let rects3 = -1
  try { rects3 = draw('Χ'.repeat(5000)).rects.length } catch { threw3 = true }
  ok('υπερμεγέθες κείμενο δεν πετά εξαίρεση', !threw3)
  ok('υπερμεγέθες κείμενο → δεν ζωγραφίζεται τίποτα', rects3 === 0)

  // Χωρίς 2d context (παλιό/κλειδωμένο περιβάλλον): βγαίνει ήσυχα.
  const noCtx = { width: 0, height: 0, style: {} as Record<string, string>, getContext: () => null }
  let threw2 = false
  try { drawQrToCanvas(noCtx as unknown as HTMLCanvasElement, 'x') } catch { threw2 = true }
  ok('χωρίς 2d context δεν πετά εξαίρεση', !threw2)
}

console.log(`qr.test.ts: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
