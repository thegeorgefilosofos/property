// npx tsx lib/accounting/zip.test.ts
//
// Ο φάκελος πρέπει να ΑΝΟΙΓΕΙ. Δεν υπάρχει «σχεδόν έγκυρο» ZIP: ή το διαβάζει ο
// υπολογιστής του λογιστή ή χάθηκε η δουλειά. Οι έλεγχοι εδώ ξαναδιαβάζουν τα
// bytes όπως θα τα διάβαζε ένας extractor, χωρίς καμία βιβλιοθήκη.
import { buildZip, crc32 } from './zip';

let pass = 0, fail = 0;
function ok(name: string, cond: boolean) { if (cond) { pass++; } else { fail++; console.error(`✗ ${name}`); } }
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; } else { fail++; console.error(`✗ ${name}\n   got  ${g}\n   want ${w}`); }
}

const u32 = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const u16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const dec = new TextDecoder();

/** Ελάχιστος αναγνώστης: διατρέχει τον κεντρικό κατάλογο, όπως κάθε extractor. */
function readZip(z: Uint8Array) {
  const eocd = z.length - 22;
  if (u32(z, eocd) !== 0x06054b50) throw new Error('χωρίς EOCD στο τέλος');
  const count = u16(z, eocd + 10);
  const cdSize = u32(z, eocd + 12);
  const cdOff = u32(z, eocd + 16);
  eqInternal(cdOff + cdSize, eocd);
  const out: { path: string; text: string; crcOk: boolean; dir: boolean }[] = [];
  let p = cdOff;
  for (let i = 0; i < count; i++) {
    if (u32(z, p) !== 0x02014b50) throw new Error(`χαλασμένη εγγραφή καταλόγου #${i}`);
    const crc = u32(z, p + 16), size = u32(z, p + 24), nlen = u16(z, p + 28);
    const lo = u32(z, p + 42);
    const path = dec.decode(z.subarray(p + 46, p + 46 + nlen));
    if (u32(z, lo) !== 0x04034b50) throw new Error(`η εγγραφή «${path}» δεν δείχνει σε τοπική κεφαλίδα`);
    const lnlen = u16(z, lo + 26), lxlen = u16(z, lo + 28);
    const start = lo + 30 + lnlen + lxlen;
    const data = z.subarray(start, start + size);
    out.push({ path, text: dec.decode(data), crcOk: crc32(data) === crc, dir: path.endsWith('/') });
    p += 46 + nlen + u16(z, p + 30) + u16(z, p + 32);
  }
  return out;
}
function eqInternal(a: number, b: number) { if (a !== b) throw new Error(`ασυμφωνία μεγέθους καταλόγου: ${a} ≠ ${b}`); }

// ═══ Ο ΦΑΚΕΛΟΣ ΠΟΥ ΘΑ ΣΤΑΛΕΙ ═══════════════════════════════════════════════
{
  const z = buildZip([
    { path: '00_ΔΙΑΒΑΣΕ_ΜΕ.txt', data: 'Φάκελος για τον λογιστή\n' },
    { path: '02_ΕΣΟΔΑ/Εσοδα_2026.csv', data: 'Ημερομηνία;Ποσό\n01/01/2026;500,00\n' },
    { path: '05_ΤΙ_ΛΕΙΠΕΙ.txt', data: 'Λείπουν 2 πράγματα.' },
  ], new Date('2026-07-29T10:20:30'));

  const e = readZip(z);
  ok('όλα τα CRC συμφωνούν', e.every(x => x.crcOk));
  ok('ο υποφάκελος δηλώνεται ρητά', e.some(x => x.dir && x.path === '02_ΕΣΟΔΑ/'));
  eq('τρία αρχεία, ένας φάκελος', e.length, 4);
  // Τα ελληνικά ονόματα επιβιώνουν — αυτό ήταν όλο το νόημα της σημαίας UTF-8.
  ok('ελληνικά ονόματα ακέραια', e.some(x => x.path === '05_ΤΙ_ΛΕΙΠΕΙ.txt'));
  eq('το περιεχόμενο γυρίζει αυτούσιο', e.find(x => x.path === '05_ΤΙ_ΛΕΙΠΕΙ.txt')?.text, 'Λείπουν 2 πράγματα.');
  ok('σημαία UTF-8 σε κάθε τοπική κεφαλίδα', u16(z, 6) === 0x0800);
  ok('μέθοδος αποθήκευσης (χωρίς συμπίεση)', u16(z, 8) === 0);
  // Η σειρά είναι η σειρά ανάγνωσης: 01, 02, … Ο λογιστής διαβάζει από πάνω.
  eq('η σειρά διατηρείται', e.filter(x => !x.dir).map(x => x.path),
    ['00_ΔΙΑΒΑΣΕ_ΜΕ.txt', '02_ΕΣΟΔΑ/Εσοδα_2026.csv', '05_ΤΙ_ΛΕΙΠΕΙ.txt']);
}

// ═══ ΑΝΤΟΧΗ ════════════════════════════════════════════════════════════════
{
  const empty = buildZip([]);
  ok('άδειος φάκελος δεν σκάει', u32(empty, empty.length - 22) === 0x06054b50);
  eq('και δεν έχει εγγραφές', u16(empty, empty.length - 12), 0);
}
{
  // Δυαδικά δεδομένα (π.χ. .xlsx) πρέπει να περνούν byte προς byte.
  const bin = new Uint8Array(1000).map((_, i) => (i * 37) % 256);
  const z = buildZip([{ path: '01_ΣΥΝΟΨΗ/Λογιστικη.xlsx', data: bin }]);
  const e = readZip(z);
  ok('τα δυαδικά δεδομένα δεν αλλοιώνονται', e.every(x => x.crcOk));
  eq('βαθύς υποφάκελος δηλώθηκε', e.filter(x => x.dir).map(x => x.path), ['01_ΣΥΝΟΨΗ/']);
}
{
  // Γνωστή τιμή αναφοράς: CRC-32 του «123456789» είναι 0xCBF43926.
  eq('CRC-32 σε γνωστή τιμή', crc32(new TextEncoder().encode('123456789')).toString(16), 'cbf43926');
}

console.log(fail === 0 ? `✓ zip: ${pass} έλεγχοι πέρασαν` : `✗ zip: ${fail} απέτυχαν από ${pass + fail}`);
if (fail > 0) process.exit(1);
