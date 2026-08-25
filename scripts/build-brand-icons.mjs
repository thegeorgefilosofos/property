#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΤΑ ΕΙΚΟΝΙΔΙΑ ΤΗΣ ΕΦΑΡΜΟΓΗΣ, ΑΠΟ ΤΗΝ ΙΔΙΑ ΓΕΩΜΕΤΡΙΑ ΜΕ ΤΟ ΣΗΜΑ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΠΡΟΒΛΗΜΑ ΠΟΥ ΛΥΝΕΙ. Το σήμα ζει σε ένα component, αλλά έξι δυαδικά
// αρχεία κρατούν αντίγραφό του: favicon, δύο εικονίδια εφαρμογής, δύο
// maskable, ένα apple-touch. Στη μετονομασία σε PROPERWISE θα έμεναν και τα
// έξι με το παλιό μπλε «P» — δηλαδή ο χρήστης θα εγκαθιστούσε PROPERWISE και
// θα έβλεπε το προηγούμενο σήμα στην αρχική οθόνη του κινητού του.
//
// ΓΕΝΝΙΟΥΝΤΑΙ, ΔΕΝ ΣΧΕΔΙΑΖΟΝΤΑΙ. Τα μονοπάτια έρχονται από το
// components/BrandMark.tsx. Οταν αλλάξει το σήμα, τρέχει αυτό και αλλάζουν
// και τα έξι μαζί.
//
// ── ΓΙΑΤΙ ΦΟΝΤΟ ΚΑΙ ΟΧΙ ΔΙΑΦΑΝΕΙΑ ───────────────────────────────────────
// Στην εφαρμογή το σήμα παίρνει το χρώμα του κειμένου δίπλα του. Το εικονίδιο
// όμως κάθεται σε καρτέλα περιηγητή, σε αρχική οθόνη κινητού, σε λίστα
// σελιδοδεικτών: επιφάνειες που δεν ελέγχουμε και που αλλάζουν χρώμα. Λευκό
// σήμα σε διαφάνεια εξαφανίζεται στη μισή από αυτές. Το σκούρο πλακίδιο είναι
// το φόντο του brand και το κάνει ορατό παντού.
//
// ── ΤΑ MASKABLE ΕΧΟΥΝ ΔΙΚΗ ΤΟΥΣ ΑΝΑΠΝΟΗ ─────────────────────────────────
// Το Android κόβει το εικονίδιο σε κύκλο, τετράγωνο με γωνίες ή σταγόνα, κατά
// το γούστο του κατασκευαστή. Ο,τι βγαίνει έξω από τον κεντρικό κύκλο του 80%
// μπορεί να κοπεί. Γι' αυτό το σήμα εκεί μπαίνει μικρότερο.
// ═══════════════════════════════════════════════════════════════════════════
import { chromePath } from './lib/chrome.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';
import { chromium } from 'playwright-core';

const CHROME = chromePath();
const NAVY = '#0B192C';
const WHITE = '#ffffff';

// Η γεωμετρία διαβάζεται από την πηγή της, χωρίς εισαγωγή TypeScript.
const src = readFileSync('components/BrandMark.tsx', 'utf8');
const block = /const SHAPE = \[([\s\S]*?)\n\];/.exec(src);
if (!block) throw new Error('Δεν βρέθηκε ο κατάλογος SHAPE στο BrandMark.tsx');
const SHAPE = [...block[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
const VIEWBOX = /const BRAND_VIEWBOX = '([^']+)'/.exec(src)[1];
const [, , VW, VH] = VIEWBOX.split(' ').map(Number);

/** Ενα εικονίδιο ως σελίδα HTML, έτοιμη για φωτογράφιση. */
function page(px, { rounded, inset }) {
  const paths = SHAPE.map(d => `<path d="${d}"/>`).join('');
  // Το σήμα κεντράρεται μέσα στο πλακίδιο, με την αναπνοή που του δίνει το inset.
  const box = 100 - inset * 2;
  return `<!doctype html><meta charset="utf-8"><body style="margin:0">
<div style="width:${px}px;height:${px}px;background:${NAVY};${rounded ? `border-radius:${Math.round(px * 0.22)}px;` : ''}display:flex;align-items:center;justify-content:center">
  <svg width="${box}%" height="${box}%" viewBox="${VIEWBOX}" fill="${WHITE}" fill-rule="nonzero">
    ${paths}
  </svg>
</div></body>`;
}

const TARGETS = [
  { file: 'public/icons/icon-192.png', px: 192, rounded: true, inset: 16 },
  { file: 'public/icons/icon-512.png', px: 512, rounded: true, inset: 16 },
  // Χωρίς γωνίες: τις βάζει το ίδιο το λειτουργικό και διπλές φαίνονται.
  { file: 'public/icons/maskable-192.png', px: 192, rounded: false, inset: 26 },
  { file: 'public/icons/maskable-512.png', px: 512, rounded: false, inset: 26 },
  // Το iOS βάζει μόνο του τη γωνία και ΔΕΝ δέχεται διαφάνεια.
  { file: 'public/icons/apple-touch-icon.png', px: 180, rounded: false, inset: 18 },
  // Οι τρεις μικρές μπαίνουν μέσα στο favicon.ico. Ιδιο σχήμα: το πρωτότυπο
  // είναι γεμίσματα και δεν χρειάζεται απλοποίηση για να διαβαστεί μικρό.
  { file: '.brand-icons/16.png', px: 16, rounded: false, inset: 8 },
  { file: '.brand-icons/32.png', px: 32, rounded: false, inset: 8 },
  { file: '.brand-icons/48.png', px: 48, rounded: false, inset: 8 },
];

// ── ΚΑΙ ΤΟ ΔΙΑΝΥΣΜΑΤΙΚΟ, ΠΟΥ ΕΙΝΑΙ ΑΥΤΟ ΠΟΥ ΒΛΕΠΟΥΝ ΟΙ ΣΥΓΧΡΟΝΟΙ ΠΕΡΙΗΓΗΤΕΣ ──
// Το `app/icon.svg` προηγείται του favicon.ico όπου υποστηρίζεται και είναι
// το μόνο που μένει καθαρό σε οθόνη υψηλής πυκνότητας.
//
// ΧΩΡΙΣ ΠΑΡΑΘΥΡΑ, ΟΠΩΣ ΚΑΙ ΤΑ ΜΙΚΡΑ PNG. Το αρχείο λέει 48, αλλά ο περιηγητής
// το δείχνει στα 16 ή 32 της καρτέλας. Μετρήθηκε σε πραγματικό Chromium: εκεί
// τα παράθυρα γίνονται γκρίζα μουτζούρα και καταπίνουν το «P».
const ICON_BOX = 30;
const svg = `<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="48" height="48" rx="11" fill="${NAVY}"/>
  <g transform="translate(${((48 - ICON_BOX * VW / VH) / 2).toFixed(2)} ${((48 - ICON_BOX) / 2).toFixed(2)}) scale(${(ICON_BOX / VH).toFixed(4)})" fill="${WHITE}" fill-rule="nonzero">
${SHAPE.map(d => `    <path d="${d}"/>`).join('\n')}
  </g>
</svg>
`;
writeFileSync('app/icon.svg', svg);

mkdirSync('.brand-icons', { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
for (const t of TARGETS) {
  const p = await browser.newPage({ viewport: { width: t.px, height: t.px } });
  await p.setContent(page(t.px, t));
  // ΠΑΝΤΑ `omitBackground`, ΚΑΙ ΟΧΙ ΓΙΑ ΤΗ ΔΙΑΦΑΝΕΙΑ. Το πλακίδιο είναι έτσι κι
  // αλλιώς αδιαφανές· αυτό που αλλάζει είναι ότι το PNG βγαίνει σε RGBA. Χωρίς
  // αυτό, το `next build` σταματούσε με «The PNG is not in RGBA format» όταν
  // διάβαζε το favicon.ico και ολόκληρο το build έπεφτε για ένα εικονίδιο.
  await p.locator('div').first().screenshot({ path: t.file, omitBackground: true });
  await p.close();
}
await browser.close();

// ── ΑΠΟ RGB ΣΕ RGBA, ΓΙΑΤΙ ΤΟ BUILD ΤΟ ΑΠΑΙΤΕΙ ──────────────────────────────
// ΤΟ ΣΦΑΛΜΑ. Το `next build` σταματούσε ολόκληρο σε ένα εικονίδιο:
//
//   ./app/favicon.ico  Format error decoding Ico: The PNG is not in RGBA format!
//
// Ο Chromium γράφει PNG τύπου 2 (RGB) όταν η εικόνα είναι εντελώς αδιαφανής,
// και τύπου 6 (RGBA) μόνο όταν υπάρχει έστω ένα διάφανο εικονοστοιχείο. Τα
// μεγάλα εικονίδια έχουν στρογγυλεμένες γωνίες, άρα διαφάνεια, άρα RGBA. Τα
// τρία μικρά του favicon είναι γεμάτα πλακίδια, άρα RGB.
//
// ΓΙΑΤΙ ΟΧΙ ΜΙΣΗ ΔΙΑΦΑΝΕΙΑ ΓΙΑ ΝΑ ΞΕΓΕΛΑΣΤΕΙ Ο ΚΩΔΙΚΟΠΟΙΗΤΗΣ. Θα δούλευε και
// θα ήταν αλλοίωση του σχεδίου για να βολέψει ένα εργαλείο. Η μετατροπή είναι
// πενήντα γραμμές και δεν αγγίζει ούτε ένα εικονοστοιχείο: ξετυλίγει το PNG,
// προσθέτει κανάλι άλφα γεμάτο 255 και το ξανατυλίγει.
const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

/** Το PNG με κανάλι άλφα, αν δεν το έχει ήδη. Μόνο 8 bit, χωρίς πλέξη. */
function toRgba(png) {
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  const depth = png[24], color = png[25], interlace = png[28];
  if (color === 6) return png;
  if (color !== 2 || depth !== 8 || interlace !== 0)
    throw new Error(`Απροσδόκητο PNG: βάθος ${depth}, τύπος ${color}, πλέξη ${interlace}`);

  // Ολα τα IDAT μαζί, με τη σειρά τους: ένα PNG μπορεί να τα σπάσει σε πολλά.
  const parts = [];
  for (let i = 8; i < png.length;) {
    const len = png.readUInt32BE(i);
    const type = png.toString('ascii', i + 4, i + 8);
    if (type === 'IDAT') parts.push(png.subarray(i + 8, i + 8 + len));
    i += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(parts));

  // Ξετύλιγμα των πέντε φίλτρων του PNG, γραμμή γραμμή.
  const out = Buffer.alloc(height * (1 + width * 4));
  const cur = Buffer.alloc(width * 3);
  const prev = Buffer.alloc(width * 3);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (1 + width * 3)];
    const line = raw.subarray(y * (1 + width * 3) + 1, (y + 1) * (1 + width * 3));
    for (let x = 0; x < width * 3; x++) {
      const a = x >= 3 ? cur[x - 3] : 0, b = prev[x], c = x >= 3 ? prev[x - 3] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 0xff;
    }
    out[y * (1 + width * 4)] = 0;  // ξανατυλίγεται χωρίς φίλτρο
    for (let x = 0; x < width; x++) {
      const o = y * (1 + width * 4) + 1 + x * 4;
      out[o] = cur[x * 3]; out[o + 1] = cur[x * 3 + 1]; out[o + 2] = cur[x * 3 + 2]; out[o + 3] = 255;
    }
    cur.copy(prev);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    png.subarray(0, 8),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(out, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── ΤΟ .ico ΦΤΙΑΧΝΕΤΑΙ ΜΕ ΤΟ ΧΕΡΙ, ΚΑΙ ΕΙΝΑΙ ΑΠΛΟΥΣΤΕΡΟ ΑΠ' ΟΣΟ ΑΚΟΥΓΕΤΑΙ ──
// Από τα Windows Vista και μετά, το ICO δέχεται ΑΥΤΟΥΣΙΑ δεδομένα PNG μέσα
// στις εγγραφές του. Δηλαδή δεν χρειάζεται μετατροπή σε bitmap: μόνο μια
// κεφαλίδα έξι byte, μια εγγραφή δεκαέξι byte ανά μέγεθος και τα PNG από πίσω.
const imgs = [16, 32, 48].map(n => toRgba(readFileSync(`.brand-icons/${n}.png`)));
const head = Buffer.alloc(6);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(imgs.length, 4);
let offset = 6 + imgs.length * 16;
const dir = [];
imgs.forEach((img, i) => {
  const px = [16, 32, 48][i];
  const e = Buffer.alloc(16);
  e.writeUInt8(px === 256 ? 0 : px, 0); e.writeUInt8(px === 256 ? 0 : px, 1);
  e.writeUInt8(0, 2); e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
  e.writeUInt32LE(img.length, 8); e.writeUInt32LE(offset, 12);
  offset += img.length; dir.push(e);
});
writeFileSync('app/favicon.ico', Buffer.concat([head, ...dir, ...imgs]));

console.log(`✓ ${TARGETS.length - 3} εικονίδια εφαρμογής, app/icon.svg και favicon.ico με τρία μεγέθη`);
