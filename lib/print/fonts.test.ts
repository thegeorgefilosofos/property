// Τεστ για τις γραμματοσειρές των εκτυπώσιμων εγγράφων.
//
// ΓΙΑΤΙ ΥΠΑΡΧΕΙ: τέσσερις γεννήτριες αναφορών φόρτωναν γραμματοσειρές από το
// fonts.googleapis.com, οπότε η IP κάθε ιδιοκτήτη έφευγε στη Google σε κάθε
// εκτύπωση. Το CSP της εφαρμογής το απαγόρευε ήδη — αλλά τα έγγραφα ανοίγουν
// σε `about:blank`, όπου δεν υπάρχει κεφαλίδα CSP να εφαρμοστεί. Δηλαδή η
// άμυνα ΔΕΝ μπορεί να είναι το CSP· πρέπει να είναι τεστ.
//
// Το κρίσιμο τεστ δεν είναι «παράγει @font-face». Είναι δύο πράγματα που
// αποτυγχάνουν σιωπηλά: (1) ξένος host, (2) απουσία ελληνικού υποσυνόλου.
// Και τα δύο δίνουν έγγραφο που τυπώνεται μια χαρά — απλώς λάθος.

import { printFontFaces, PRINT_FONT_STACK, PRINT_MONO_STACK } from './fonts'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { if (cond) { passed++ } else { failed++; console.log('  ✗ ' + name) } }

// ── Καμία εξωτερική κλήση. Αυτό είναι ΟΛΟΚΛΗΡΟ το νόημα του αρχείου ────────
{
  const css = printFontFaces()
  ok('δεν αναφέρει fonts.googleapis.com', !css.includes('fonts.googleapis'))
  ok('δεν αναφέρει fonts.gstatic.com', !css.includes('gstatic'))
  ok('δεν αναφέρει κανέναν εξωτερικό host', !/https?:\/\/(?!$)/.test(css.replace(/url\('[^']*'\)/g, m => m.includes('://') && !m.includes('/fonts/') ? m : '')))

  // Κάθε url() δείχνει στο δικό μας /fonts/. Χωρίς `location` στο Node, η βάση
  // είναι κενή, άρα τα URL είναι σχετικά και ξεκινούν με /fonts/.
  const urls = Array.from(css.matchAll(/url\('([^']+)'\)/g)).map(m => m[1])
  ok('παράγει urls', urls.length > 0)
  ok('κάθε url δείχνει στο δικό μας /fonts/', urls.every(u => u.startsWith('/fonts/')))
  ok('κάθε url είναι .woff2', urls.every(u => u.endsWith('.woff2')))
}

// ── ΤΑ ΕΛΛΗΝΙΚΑ: χωρίς αυτό, «Παπαδόπουλος» πέφτει σε γραμματοσειρά συστήματος ──
{
  const css = printFontFaces()
  // Το ελληνικό εύρος του Unicode. Αν λείψει, το έγγραφο ΔΕΝ σπάει — απλώς
  // αλλάζει όψη στη μέση μιας λέξης, που είναι χειρότερο γιατί δεν το πιάνεις.
  ok('περιλαμβάνει ελληνικό unicode-range', css.includes('U+0370-0377'))
  ok('περιλαμβάνει ελληνικό αρχείο Inter', css.includes('/fonts/inter-greek.woff2'))
  ok('περιλαμβάνει ελληνικό αρχείο Roboto Mono', css.includes('/fonts/robotomono-greek.woff2'))
}

// ── Και οι δύο οικογένειες και τα τρία υποσύνολα ──────────────────────────
{
  const css = printFontFaces()
  for (const f of ['inter', 'robotomono']) {
    for (const s of ['latin', 'latin-ext', 'greek']) {
      ok(`υπάρχει ${f}-${s}`, css.includes(`/fonts/${f}-${s}.woff2`))
    }
  }
  ok('δηλώνει την οικογένεια Inter', css.includes("font-family:'Inter'"))
  ok('δηλώνει την οικογένεια Roboto Mono', css.includes("font-family:'Roboto Mono'"))
  const faces = (css.match(/@font-face/g) || []).length
  ok('έξι κανόνες @font-face (2 οικογένειες × 3 υποσύνολα)', faces === 6)
}

// ── Σχήμα: επιστρέφει ολόκληρο <style>, ώστε το σημείο κλήσης να μη χρειάζεται
//    να θυμηθεί να το τυλίξει (ήταν ακριβώς το είδος λάθους που θέλουμε να λείπει) ──
{
  const css = printFontFaces()
  ok('ξεκινά με <style>', css.startsWith('<style>'))
  ok('τελειώνει με </style>', css.endsWith('</style>'))
  ok('δεν περιέχει <link>', !css.includes('<link'))
}

// ── Οι στοίβες γραμματοσειρών έχουν εφεδρεία που υπάρχει παντού ────────────
{
  ok('η στοίβα κειμένου ξεκινά με Inter', PRINT_FONT_STACK.startsWith("'Inter'"))
  ok('η στοίβα κειμένου έχει εφεδρεία', PRINT_FONT_STACK.includes('sans-serif'))
  ok('η στοίβα αριθμών ξεκινά με Roboto Mono', PRINT_MONO_STACK.startsWith("'Roboto Mono'"))
  ok('η στοίβα αριθμών έχει εφεδρεία', PRINT_MONO_STACK.includes('monospace'))
}

// ── ΑΠΟΔΕΙΞΗ ΟΤΙ ΤΟ ΤΕΣΤ ΠΙΑΝΕΙ ΤΟ ΠΑΛΙΟ ΛΑΘΟΣ ────────────────────────────
// Ένα τεστ που περνά και με τον παλιό κώδικα δεν προστατεύει τίποτα. Ελέγχουμε
// ρητά ότι ο έλεγχός μας απορρίπτει τη συμβολοσειρά που είχαμε πραγματικά.
{
  const OLD = '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">'
  ok('ο έλεγχος ΠΙΑΝΕΙ την παλιά γραμμή <link>', OLD.includes('fonts.googleapis'))
  ok('ο έλεγχος ΞΕΧΩΡΙΖΕΙ παλιό από νέο', OLD.includes('fonts.googleapis') && !printFontFaces().includes('fonts.googleapis'))
}

console.log(`fonts.test.ts: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
