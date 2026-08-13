// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΚΕΙΜΕΝΟ ΕΝΟΣ PDF, ΧΩΡΙΣ ΒΙΒΛΙΟΘΗΚΗ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΕΞΥΠΗΡΕΤΕΙ. Ένα και μόνο έγγραφο: το μηνιαίο δελτίο της ΕΛΣΤΑΤ για την
// αναπροσαρμογή μισθωμάτων. Από εκεί χρειαζόμαστε δύο ποσοστά και ένα έτος,
// δηλαδή ψηφία.
//
// ΓΙΑΤΙ ΟΧΙ ΕΤΟΙΜΗ ΒΙΒΛΙΟΘΗΚΗ. Οι αναγνώστες PDF είναι μεγάλα πακέτα με δικό
// τους ιστορικό ευπαθειών, και θα έμπαιναν στο δέντρο εξαρτήσεων ολόκληρης της
// εφαρμογής για να διαβάζουν μία σελίδα τον μήνα, εκτός εφαρμογής, σε
// προγραμματισμένο έλεγχο. Το κομμάτι που χρειαζόμαστε είναι ενενήντα γραμμές:
// αποσυμπίεση των ρευμάτων περιεχομένου και αντιστοίχιση των κωδικών χαρακτήρα
// μέσω του πίνακα ToUnicode που κουβαλά το ίδιο το αρχείο.
//
// ── ΤΙ ΔΕΝ ΕΙΝΑΙ ─────────────────────────────────────────────────────────
// Δεν είναι αναγνώστης PDF γενικής χρήσης. Δεν καταλαβαίνει κρυπτογραφημένα
// αρχεία, δεν σέβεται τη σειρά των στηλών, δεν βγάζει εικόνες, και οι
// γραμματοσειρές χωρίς πίνακα ToUnicode βγαίνουν κενές. Στο δελτίο της ΕΛΣΤΑΤ
// μέρος των ελληνικών γλυφών όντως χάνεται έτσι — και δεν πειράζει, γιατί τα
// ψηφία ζουν σε λατινική γραμματοσειρά με κανονικό πίνακα και βγαίνουν καθαρά.
// Αυτό είναι εξάλλου ο λόγος που η `parseAnnouncement` δεν ψάχνει ελληνικές
// φράσεις παρά μόνο αριθμούς.
// ═══════════════════════════════════════════════════════════════════════════
import { inflateSync } from 'node:zlib';

/** Ένα αντικείμενο του αρχείου: «N 0 obj … endobj», κρατημένο ως bytes σε latin1. */
type Objects = Map<number, string>;

/**
 * Ένας πίνακας ToUnicode, με το πλάτος του κωδικού.
 *
 * ΓΙΑΤΙ ΤΟ ΠΛΑΤΟΣ ΕΧΕΙ ΣΗΜΑΣΙΑ. Το ίδιο δελτίο γράφει τα ελληνικά με σύνθετη
 * γραμματοσειρά (δύο bytes ανά χαρακτήρα, σε δεκαεξαδικές συμβολοσειρές) και τα
 * ΨΗΦΙΑ με απλή (ένα byte, σε κανονικές συμβολοσειρές). Χωρίς τη διάκριση, τα
 * ψηφία διαβάζονταν ανά δύο και χάνονταν όλα — δηλαδή ακριβώς αυτό που ψάχνουμε.
 */
interface ToUnicode {
  map: Map<number, string>;
  twoByte: boolean;
}

/** Δύο δεκαεξαδικά ψηφία ανά byte, σε UTF-16 με τα ψηλά bytes πρώτα. */
function utf16be(hex: string): string {
  let out = '';
  for (let i = 0; i + 3 < hex.length + 1; i += 4) {
    const unit = parseInt(hex.slice(i, i + 4).padEnd(4, '0'), 16);
    if (Number.isFinite(unit)) out += String.fromCharCode(unit);
  }
  return out;
}

/**
 * Το περιεχόμενο ενός ρεύματος, αποσυμπιεσμένο όταν χρειάζεται.
 *
 * Επιστρέφει `null` όταν το αντικείμενο δεν έχει ρεύμα ή όταν η αποσυμπίεση
 * αποτυγχάνει: μισοδιαβασμένα bytes είναι χειρότερα από τίποτα.
 */
function streamOf(body: string): string | null {
  const m = /stream\r?\n/.exec(body);
  if (!m) return null;
  const end = body.lastIndexOf('endstream');
  if (end < 0) return null;
  const raw = body.slice(m.index + m[0].length, end);
  if (!body.slice(0, m.index).includes('FlateDecode')) return raw;
  try {
    return inflateSync(Buffer.from(raw, 'latin1')).toString('latin1');
  } catch {
    return null;
  }
}

/** Οι πίνακες ToUnicode του αρχείου: αριθμός αντικειμένου προς αντιστοίχιση κωδικών. */
function unicodeMaps(objs: Objects): Map<number, ToUnicode> {
  const maps = new Map<number, ToUnicode>();
  for (const [num, body] of objs) {
    const s = streamOf(body);
    if (!s || (!s.includes('beginbfchar') && !s.includes('beginbfrange'))) continue;
    const mp = new Map<number, string>();
    for (const blk of s.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const p of blk[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
        mp.set(parseInt(p[1], 16), utf16be(p[2]));
      }
    }
    // Οι σειρές δίνουν αρχή, τέλος και την πρώτη τιμή· τα ενδιάμεσα προκύπτουν.
    for (const blk of s.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      for (const p of blk[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
        const lo = parseInt(p[1], 16), hi = parseInt(p[2], 16), base = parseInt(p[3], 16);
        for (let i = lo; i <= hi && i - lo < 65536; i++) mp.set(i, String.fromCharCode(base + (i - lo)));
      }
    }
    // Ένας πίνακας που δεν έχει ούτε έναν κωδικό μέσα στο πρώτο byte είναι
    // σύνθετης γραμματοσειράς: οι κωδικοί του διαβάζονται ανά δύο bytes.
    if (mp.size) maps.set(num, { map: mp, twoByte: ![...mp.keys()].some(k => k <= 255) });
  }
  return maps;
}

/** Οι χαρακτήρες μιας κανονικής συμβολοσειράς PDF, με τις διαφυγές λυμένες. */
function literalBytes(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '\\') { out.push(s.charCodeAt(i)); continue; }
    const c = s[++i];
    if (c === undefined) break;
    if (c >= '0' && c <= '7') {
      let oct = c;
      while (oct.length < 3 && s[i + 1] >= '0' && s[i + 1] <= '7') oct += s[++i];
      out.push(parseInt(oct, 8));
    } else if (c === 'n') out.push(10);
    else if (c === 'r') out.push(13);
    else if (c === 't') out.push(9);
    else if (c === 'b') out.push(8);
    else if (c === 'f') out.push(12);
    else if (c !== '\n' && c !== '\r') out.push(s.charCodeAt(i));
  }
  return out;
}

/** Ποια γραμματοσειρά δείχνει σε ποιον πίνακα ToUnicode. */
function fontMaps(objs: Objects): Map<number, number> {
  const out = new Map<number, number>();
  for (const [num, body] of objs) {
    if (!/\/Type\s*\/Font/.test(body)) continue;
    const m = /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(body);
    if (m) out.set(num, Number(m[1]));
  }
  return out;
}

/** Τα ονόματα γραμματοσειρών της σελίδας προς τα αντικείμενά τους. */
function pageFonts(objs: Objects, body: string): Map<string, number> {
  const ref = /\/Resources\s+(\d+)\s+0\s+R/.exec(body);
  const src = ref ? objs.get(Number(ref[1])) ?? '' : body;
  const block = /\/Font\s*<<([\s\S]*?)>>/.exec(src);
  const out = new Map<string, number>();
  if (block) {
    for (const m of block[1].matchAll(/\/([A-Za-z0-9#]+)\s+(\d+)\s+0\s+R/g)) out.set(m[1], Number(m[2]));
  }
  return out;
}

/**
 * Το κείμενο ενός PDF, σελίδα προς σελίδα, χωρισμένο με κενές γραμμές.
 *
 * Όσα δεν αντιστοιχίζονται σε Unicode παραλείπονται σιωπηλά: το ζητούμενο είναι
 * τα ψηφία, και ένα ερωτηματικό στη θέση ενός γράμματος δεν βοηθά κανέναν.
 */
export function pdfText(data: Uint8Array): string {
  const s = Buffer.from(data).toString('latin1');
  const objs: Objects = new Map();
  for (const m of s.matchAll(/(\d+)\s+0\s+obj\b/g)) {
    const start = (m.index ?? 0) + m[0].length;
    const end = s.indexOf('endobj', start);
    objs.set(Number(m[1]), s.slice(start, end < 0 ? undefined : end));
  }

  const maps = unicodeMaps(objs);
  const fonts = fontMaps(objs);
  const pages: string[] = [];

  for (const [, body] of [...objs].sort((a, b) => a[0] - b[0])) {
    if (!/\/Type\s*\/Page\b/.test(body) || !body.includes('/Contents')) continue;
    const names = pageFonts(objs, body);

    // Το /Contents είναι είτε μία αναφορά είτε πίνακας αναφορών.
    const arr = /\/Contents\s*\[([\s\S]*?)\]/.exec(body);
    const refs = arr
      ? [...arr[1].matchAll(/(\d+)\s+0\s+R/g)].map(m => Number(m[1]))
      : [...body.matchAll(/\/Contents\s+(\d+)\s+0\s+R/g)].map(m => Number(m[1]));

    let buf = '';
    for (const r of refs) {
      const c = streamOf(objs.get(r) ?? '');
      if (c) buf += c + '\n';
    }

    let cur: ToUnicode | undefined;
    const out: string[] = [];
    const tokens = /\/([A-Za-z0-9#]+)\s+[\d.-]+\s+Tf|(\((?:\\[\s\S]|[^\\()])*\)|<[0-9A-Fa-f\s]*>)\s*Tj|\[([\s\S]*?)\]\s*TJ|(TD|Td|T\*|ET)/g;
    for (const tk of buf.matchAll(tokens)) {
      if (tk[1]) {
        cur = maps.get(fonts.get(names.get(tk[1]) ?? -1) ?? -1);
        continue;
      }
      if (tk[4]) { out.push('\n'); continue; }

      // Οι δύο μορφές συμβολοσειράς, με τη σειρά που εμφανίζονται μέσα στον
      // πίνακα: οι ενδιάμεσοι αριθμοί του TJ είναι μετατοπίσεις, όχι κείμενο.
      const payload = tk[2] ?? tk[3] ?? '';
      for (const p of payload.matchAll(/<([0-9A-Fa-f\s]*)>|\(((?:\\[\s\S]|[^\\()])*)\)/g)) {
        if (p[1] !== undefined) {
          const hex = p[1].replace(/\s+/g, '');
          for (let i = 0; i < hex.length; i += 4) {
            out.push(cur?.map.get(parseInt(hex.slice(i, i + 4).padEnd(4, '0'), 16)) ?? '');
          }
        } else {
          const bytes = literalBytes(p[2] ?? '');
          const step = cur?.twoByte ? 2 : 1;
          for (let i = 0; i < bytes.length; i += step) {
            const code = step === 2 ? (bytes[i] << 8) | (bytes[i + 1] ?? 0) : bytes[i];
            // Χωρίς πίνακα, το byte διαβάζεται ως έχει: τα ψηφία και τα σημεία
            // στίξης έχουν τον ίδιο κωδικό σε κάθε συνηθισμένη κωδικοποίηση.
            out.push(cur?.map.get(code) ?? (code >= 32 && code < 127 ? String.fromCharCode(code) : ''));
          }
        }
      }
    }
    pages.push(out.join(''));
  }

  return pages.join('\n\n');
}
