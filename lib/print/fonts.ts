// ═══════════════════════════════════════════════════════════════════════════
// Γραμματοσειρές για τα εκτυπώσιμα έγγραφα — ΧΩΡΙΣ εξωτερική κλήση
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΥΠΑΡΧΕΙ: οι τέσσερις γεννήτριες εγγράφων (κατάσταση ενοικιαστή,
// λογιστική αναφορά, αναφορά επενδυτή, λίστα εργασιών) άνοιγαν νέο παράθυρο
// και φόρτωναν γραμματοσειρές από το `fonts.googleapis.com`. Αποτέλεσμα: κάθε
// φορά που ο ιδιοκτήτης τύπωνε μια αναφορά, η διεύθυνση IP του γινόταν γνωστή
// στη Google — χωρίς να το έχει επιλέξει και χωρίς να το ξέρει.
//
// Η ίδια η εφαρμογή φιλοξενεί ΗΔΗ τις γραμματοσειρές τοπικά (public/fonts/,
// βλ. @font-face στο app/globals.css). Τα έγγραφα εκτύπωσης απλώς δεν είχαν
// ακολουθήσει, επειδή ανοίγουν με `window.open('')` και δεν κληρονομούν το CSS
// της εφαρμογής.
//
// ΓΙΑΤΙ ΑΠΟΛΥΤΑ URL: το `window.open('')` δίνει έγγραφο με base URL `about:blank`.
// Ένα σχετικό `/fonts/inter-greek.woff2` ΔΕΝ αναλύεται εκεί — θα έπεφτε σιωπηλά
// πίσω στην Arial και τα ελληνικά θα άλλαζαν όψη. Χτίζουμε λοιπόν απόλυτο URL
// από το `location.origin` του γονέα, που είναι πάντα το δικό μας origin.
//
// ΤΑ ΕΛΛΗΝΙΚΑ ΕΧΟΥΝ ΣΗΜΑΣΙΑ: το υποσύνολο `-greek` δεν είναι προαιρετικό. Χωρίς
// αυτό, ένα μισθωτήριο με «Παπαδόπουλος» θα τυπωνόταν σε γραμματοσειρά
// συστήματος, με άλλο ύψος x και άλλο βάρος από τους λατινικούς χαρακτήρες
// δίπλα του. Σε έγγραφο που πάει σε λογιστή, αυτό διαβάζεται ως προχειρότητα.
// ═══════════════════════════════════════════════════════════════════════════

/** Τα υποσύνολα που φιλοξενούμε, με το εύρος χαρακτήρων του καθενός. Ίδια
 *  ακριβώς με το app/globals.css — αν αλλάξει εκεί, αλλάζει κι εδώ. */
const SUBSETS: { file: string; range: string }[] = [
  {
    file: 'latin',
    range: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
  },
  {
    file: 'latin-ext',
    range: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF',
  },
  {
    file: 'greek',
    range: 'U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF',
  },
];

const FAMILIES: { family: string; prefix: string; weight: string }[] = [
  { family: 'Inter', prefix: 'inter', weight: '100 900' },
  { family: 'Roboto Mono', prefix: 'robotomono', weight: '400 600' },
];

/**
 * Η βάση για τα απόλυτα URL των γραμματοσειρών.
 *
 * Στον browser είναι το origin της εφαρμογής. Σε server render (ή σε τεστ)
 * δεν υπάρχει `location`, οπότε επιστρέφουμε κενό: τα URL γίνονται σχετικά,
 * που είναι σωστό για κάθε περιβάλλον όπου το έγγραφο ΔΕΝ ανοίγει σε
 * `about:blank`. Ποτέ δεν πέφτουμε πίσω σε εξωτερικό host.
 */
function originBase(): string {
  if (typeof location === 'undefined') return '';
  return location.origin;
}

/**
 * Το `<style>` με τους κανόνες @font-face, έτοιμο για το `<head>` κάθε
 * εκτυπώσιμου εγγράφου. Αντικαθιστά το `<link href="fonts.googleapis.com">`.
 *
 * Επιστρέφει ΟΛΟΚΛΗΡΟ το `<style>…</style>` ώστε τα σημεία κλήσης να μη
 * χρειάζεται να θυμούνται να το τυλίξουν.
 */
export function printFontFaces(): string {
  const base = originBase();
  const rules = FAMILIES.flatMap(f =>
    SUBSETS.map(s =>
      `@font-face{font-family:'${f.family}';font-style:normal;font-weight:${f.weight};` +
      `font-display:swap;src:url('${base}/fonts/${f.prefix}-${s.file}.woff2') format('woff2');` +
      `unicode-range:${s.range}}`
    )
  ).join('');
  return `<style>${rules}</style>`;
}

/** Η στοίβα γραμματοσειρών για τα έγγραφα. Μία, παντού ίδια. */
export const PRINT_FONT_STACK = "'Inter',system-ui,-apple-system,Segoe UI,Arial,sans-serif";
export const PRINT_MONO_STACK = "'Roboto Mono',ui-monospace,SFMono-Regular,Menlo,monospace";
