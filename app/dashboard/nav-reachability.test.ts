// ═══════════════════════════════════════════════════════════════════════════
// ΚΑΘΕ ΚΑΡΤΕΛΑ ΠΡΕΠΕΙ ΝΑ ΕΧΕΙ ΔΡΟΜΟ, ΟΧΙ ΜΟΝΟ ΑΔΕΙΑ.
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΚΕΝΟ ΠΟΥ ΚΛΕΙΝΕΙ:
// Το lib/nav/disclosure.test.ts επαληθεύει ότι η ΑΠΟΦΑΣΗ ορατότητας είναι
// σωστή — «ο επαγγελματίας βλέπει Χαρτοφυλάκιο από την αρχή» περνούσε καθαρά.
// Κανείς όμως δεν επαλήθευε ότι υπάρχει ΚΟΥΜΠΙ να το ανοίξει.
//
// Και δεν υπήρχε. Το 'portfolio' αποδιδόταν μόνο όταν nav==='portfolio', καμία
// γραμμή δεν έθετε ποτέ αυτή την τιμή, και το NAV_GROUPS δεν το περιλάμβανε.
// Ο μόνος δρόμος ήταν το ⌘K — δηλαδή σε tablet ή κινητό, κανένας. Μια βασική
// καρτέλα του επαγγελματία ήταν αόρατη, με το test της να λέει «ναι, ορατή».
//
// Άδεια ≠ διαδρομή. Εδώ ελέγχεται η διαδρομή, διαβάζοντας τον ίδιο τον κώδικα
// της πλοήγησης αντί για τη λογική πίσω του.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CORE_TABS, PROFESSIONAL_CORE_TABS } from '../../lib/nav/disclosure'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { if (cond) { passed++ } else { failed++; console.log('  ✗ ' + name) } }

const src = readFileSync(join(process.cwd(), 'app/dashboard/page.tsx'), 'utf8')

/**
 * Κόβει ένα const block με όνομα `name` από την πηγή, ΧΩΡΙΣ τα σχόλιά του.
 *
 * Το ξεγύμνωμα σχολίων δεν είναι καλλωπισμός: η πρώτη εκδοχή αυτού του τεστ
 * περνούσε ακόμη και με το σφάλμα ξαναβαλμένο, επειδή η λέξη 'portfolio'
 * υπήρχε μέσα στο επεξηγηματικό σχόλιο του NAV_GROUPS και το regex τη
 * μετρούσε σαν κανονική εγγραφή. Ένα τεστ που δεν πέφτει όταν πρέπει είναι
 * χειρότερο από κανένα τεστ: δίνει σιγουριά χωρίς να τη δικαιολογεί.
 */
function block(name: string): string {
  const start = src.indexOf(`const ${name}`)
  if (start < 0) return ''
  const end = src.indexOf('\n];', start)
  if (end < 0) return ''
  return src.slice(start, end)
    .replace(/\/\*[\s\S]*?\*\//g, '')   // σχόλια /* … */
    .replace(/\/\/[^\n]*/g, '')          // σχόλια // …
}

const navItemIds = [...block('NAV_ITEMS').matchAll(/id:\s*'([a-z]+)'/g)].map(m => m[1])
const groupIds   = [...block('NAV_GROUPS').matchAll(/'([a-z]+)'/g)].map(m => m[1])

// Καρτέλες με ΤΕΚΜΗΡΙΩΜΕΝΟ δρόμο εκτός του μενού. Κάθε εγγραφή εδώ είναι
// υπόσχεση ότι ο δρόμος υπάρχει και ελέγχθηκε με το μάτι — όχι παραθυράκι.
const REACHED_ELSEWHERE: Record<string, string> = {
  overview: 'το λογότυπο της πλαϊνής μπάρας και το κουμπί «πίσω» οδηγούν εδώ',
}

ok('το NAV_ITEMS διαβάστηκε', navItemIds.length > 10)
ok('το NAV_GROUPS διαβάστηκε', groupIds.length > 10)

// ── 1. Κάθε καρτέλα έχει δρόμο ────────────────────────────────────────────
for (const id of navItemIds) {
  const reachable = groupIds.includes(id) || id in REACHED_ELSEWHERE
  ok(`η καρτέλα «${id}» έχει δρόμο (μενού ή τεκμηριωμένη εξαίρεση)`, reachable)
}

// ── 2. Καμία ομάδα δεν δείχνει σε ανύπαρκτη καρτέλα ───────────────────────
for (const id of groupIds) {
  ok(`το «${id}» του μενού αντιστοιχεί σε υπαρκτή καρτέλα`, navItemIds.includes(id))
}

// ── 3. Οι ΒΑΣΙΚΕΣ καρτέλες φτάνονται από το μενού, όχι μόνο από ⌘K ────────
// Αυτό ακριβώς αστόχησε: το portfolio ήταν βασικό για τον επαγγελματία και
// ταυτόχρονα εκτός μενού.
for (const id of [...CORE_TABS, ...PROFESSIONAL_CORE_TABS]) {
  ok(`η βασική καρτέλα «${id}» φτάνεται χωρίς πληκτρολόγιο`,
     groupIds.includes(id) || id in REACHED_ELSEWHERE)
}

// ── 4. Η κάτω μπάρα παράγεται, δεν ξαναγράφεται στο χέρι ─────────────────
// Όσο ήταν χειρόγραφη, προωθούσε το «Αρχείο» (μη-βασικό) και έθαβε τη
// «Λογιστική» (βασική) κάτω από το «Μενού»: η ιεράρχηση έλεγε ένα και η οθόνη
// έκανε άλλο. Αν κάποιος την ξαναγράψει με σταθερά, αυτό πέφτει.
const bottom = block('BOTTOM_NAV')
ok('η κάτω μπάρα παράγεται από τις CORE_TABS', bottom.includes('CORE_TABS'))
ok('η κάτω μπάρα δεν ξαναγράφει ετικέτες με το χέρι',
   !/label:\s*'(?!Μενού)[^']+'/.test(bottom.replace(/label:\s*'Μενού'/g, '')))

// ── 5. Η μπάρα δεν «δείχνει τα πάντα» όσο φορτώνει ───────────────────────
// Το showAllTabsPref έγραφε `navShowAll || !navPrefsLoaded`. Επειδή το
// navPrefsLoaded ξεκινά false, ΚΑΘΕ φόρτωση περνούσε από κατάσταση «δείξε τα
// πάντα»: δεκαεπτά καρτέλες, οι μισές αχνές και άσχετες με το ακίνητο, που μετά
// μάζευαν σε έξι. Το fail-open για ΑΠΟΤΥΧΙΑ ανάγνωσης είναι σωστό και μένει —
// αλλά πρέπει να ξεχωρίζει από το «φορτώνει ακόμη».
{
  const pref = /const showAllTabsPref\s*=\s*([^\n;]+)/.exec(src)
  ok('το showAllTabsPref υπάρχει', !!pref)
  const expr = pref ? pref[1] : ''
  ok('δεν εξαρτάται από το «δεν φορτώθηκε ακόμη»', !/!\s*navPrefsLoaded/.test(expr))
  ok('κρατά το fail-open για πραγματική αποτυχία', /navPrefsFailed/.test(expr))
  ok('σέβεται τη ρητή επιλογή του χρήστη', /navShowAll/.test(expr))
  ok('η αποτυχία ανάγνωσης σηκώνει τη σημαία', /setNavPrefsFailed\(true\)/.test(src))
}

console.log(`dashboard/nav-reachability.test.ts: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
