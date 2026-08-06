// ═══════════════════════════════════════════════════════════════════════════
// PROPERTY OS — tokens.ts: τα σχεδιαστικά tokens, ΧΩΡΙΣ React
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΞΕΧΩΡΙΣΤΟ ΑΡΧΕΙΟ ΚΑΙ ΟΧΙ ΜΕΣΑ ΣΤΟ Theme.tsx:
//
// Το Theme.tsx είναι `'use client'`. Όταν ένα Server Component εισάγει κάτι από
// module πελάτη, ο Next ΔΕΝ του δίνει την πραγματική τιμή — του δίνει αναφορά
// πελάτη. Το `T` έφτανε στον server ως `undefined` και το `T.font.sans` έριχνε
//     TypeError: Cannot read properties of undefined (reading 'sans')
// στο SSR. Ολόκληρη η δημόσια σελίδα (αρχική, «Ποιοι είμαστε», Απόρρητο, Όροι,
// «χωρίς σύνδεση») έδειχνε το πλαίσιο σφάλματος αντί για περιεχόμενο.
//
// Δεν ήταν ορατό σε καμία δοκιμή: το `npm run build` περνά καθαρά, γιατί το
// σφάλμα συμβαίνει στην ΑΠΟΔΟΣΗ της σελίδας, όχι στη μεταγλώττιση. Γι' αυτό
// προστέθηκε και έλεγχος στο CI (scripts/check-server-imports.mjs) που κόβει
// κάθε νέα εισαγωγή token από module πελάτη μέσα σε Server Component.
//
// Εδώ μένει ό,τι είναι ΚΑΘΑΡΑ δεδομένα και συναρτήσεις — καμία εξάρτηση από
// React, άρα μπορεί να το εισάγει και ο server και ο πελάτης, με ασφάλεια.
// Το Theme.tsx τα ξανα-εξάγει, ώστε καμία υπάρχουσα εισαγωγή να μη χαλάσει.
// ═══════════════════════════════════════════════════════════════════════════

// ── Tokens (ίδια ονόματα με τα Bills, μηδενική αλλαγή νοοτροπίας) ─────────
export const T = {
  radius: { card: 14, inner: 10, badge: 100, btn: 10, pill: 100, modal: 18 },
  // Ύψη control — ΜΙΑ κλίμακα για κάθε κουμπί/πεδίο/chip, ώστε τίποτα να μη
  // «χοροπηδά» από οθόνη σε οθόνη: sm=chips, md=κανονικά πεδία, lg=κύρια πεδία.
  //
  // ΓΙΑΤΙ ΜΕΤΑΒΛΗΤΕΣ CSS ΚΑΙ ΟΧΙ ΑΡΙΘΜΟΙ. Η κλίμακα ήταν 32/36/40 — και τα τρία
  // κάτω από τα 44 εικονοστοιχεία που θέλει το δάχτυλο. Σε 215 σημεία γράφεται
  // ως inline style, όπου καμία media query δεν φτάνει: το `.btn { min-height:
  // 44px }` του globals.css δεν έσωζε τίποτα, γιατί η κλάση χρησιμοποιείται μία
  // φορά σε όλο το repo. Ως μεταβλητή, η ίδια γραμμή ανεβαίνει σε 44 όταν ο
  // δείκτης είναι δάχτυλο (globals.css, `@media (pointer: coarse)`) και μένει
  // σφιχτή στο ποντίκι. Μία αλλαγή, ένα σημείο, καμία διπλή κλίμακα.
  h: { sm: 'var(--h-sm)', md: 'var(--h-md)', lg: 'var(--h-lg)' },
  // Επικάλυψη παραθύρου — μία τιμή παντού (πριν υπήρχαν 7 διαφορετικές).
  scrim: 'rgba(0,0,0,0.55)',
  font: {
    // Γραμματοσειρές που φορτώνει self-hosted το app (globals.css): Inter + Roboto Mono.
    sans: "'Inter', system-ui, sans-serif",
    mono: "'Roboto Mono', 'JetBrains Mono', monospace",
    // Μεγάλοι αριθμοί «κεφαλίδας» (KPI): σφιχτή sans με tabular ψηφία, χωρίς τα
    // πλατιά κενά του monospace γύρω από κόμμα/τελεία. Το mono μένει για πυκνούς πίνακες.
    num:  "'Inter', system-ui, sans-serif",
  },
  sp: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, section: 32 },
  // Καμπύλες κίνησης Google (Material 3), μία πηγή για όλα τα transitions.
  ease: { standard: 'cubic-bezier(0.2, 0, 0, 1)', emphasized: 'cubic-bezier(0.3, 0, 0, 1)', decel: 'cubic-bezier(0, 0, 0, 1)' },
} as const;

// ── Τυπογραφική κλίμακα, ΜΙΑ πηγή αλήθειας για μεγέθη/βάρη/spacing.
// Στόχος: «Google οπτική» ομοιομορφία, ίδιοι τίτλοι/ετικέτες/τιμές παντού.
// Χρήση: <div style={{ ...TT.label }}>…</div>  ή  style={TT.kpi}
export const TT = {
  display: { fontFamily: T.font.sans, fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15, color: 'var(--text-primary)' },
  // Μικρότερο display για μεγάλους αριθμούς μέσα σε κάρτες (π.χ. ανταμοιβές).
  displaySm: { fontFamily: T.font.sans, fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15, color: 'var(--text-primary)' },
  h1:      { fontFamily: T.font.sans, fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.25, color: 'var(--text-primary)' },
  h2:      { fontFamily: T.font.sans, fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.3,  color: 'var(--text-primary)' },
  // Ετικέτα ενότητας, η uppercase «τελεία» των Bills, τυποποιημένη.
  label:   { fontFamily: T.font.sans, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: 'var(--text-secondary)' },
  body:    { fontFamily: T.font.sans, fontSize: 13, fontWeight: 400, lineHeight: 1.55, color: 'var(--text-primary)' },
  bodySm:  { fontFamily: T.font.sans, fontSize: 12, fontWeight: 400, lineHeight: 1.5,  color: 'var(--text-secondary)' },
  caption: { fontFamily: T.font.sans, fontSize: 11, fontWeight: 400, lineHeight: 1.45, color: 'var(--text-tertiary)' },
  // Μεγάλοι αριθμοί KPI: σφιχτή sans (num) + tabular. Το πυκνό mono μένει για πίνακες.
  kpi:     { fontFamily: T.font.num, fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' as const, letterSpacing: '-0.01em', lineHeight: 1, color: 'var(--text-primary)' },
  mono:    { fontFamily: T.font.mono, fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums' as const, color: 'var(--text-primary)' },
} as const;

// ── ΑΡΙΘΜΟΙ ────────────────────────────────────────────────────────────────
// Οι τύποι ζουν στο `lib/core/format.ts` και επανεξάγονται εδώ. Ο λόγος: τους
// χρειάζεται και ο πυρήνας (insights, δάνεια, αποδόσεις παράγουν κείμενο για
// τον χρήστη), αλλά το `lib/` δεν επιτρέπεται να εισάγει από το `components/`.
// Οι οθόνες συνεχίζουν να γράφουν `import { fe } from '@/components/Theme'`.
export { fe, feAuto, feRate, fp, fn, feOr, fpOr, DASH, isBlankMetric, ABSENT, ABSENT_DATE, ABSENT_SHORT } from '@/lib/core/format';

export const fd = (d: string | Date) =>
  new Date(d).toLocaleDateString('el-GR', { day: '2-digit', month: 'short', year: 'numeric' });

// Πλήρης μορφή χωρίς συντομογραφία μήνα («30 Ιουνίου 2026»).
export const fdLong = (d: string | Date) =>
  new Date(d).toLocaleDateString('el-GR', { day: 'numeric', month: 'long', year: 'numeric' });

// ── Σημασιολογικοί τόνοι, ρόλοι, όχι αυθαίρετα χρώματα ─────────────────────
export type Tone = 'accent' | 'info' | 'positive' | 'warning' | 'negative' | 'neutral';
