// Τεστ για τις προτεινόμενες ερωτήσεις που ανοίγουν τη συνομιλία με τη Νόα.
// Ο κρίσιμος κανόνας που ελέγχεται: ΠΟΤΕ νούμερο που δεν έδωσε ο χρήστης.
import { suggestedOpeners, greeting, eur, type OpenerContext } from './openers'
import { ASSISTANT_NAME } from './identity'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { if (cond) { passed++ } else { failed++; console.log('  ✗ ' + name) } }

const FULL: OpenerContext = {
  propertyName: 'Διαμέρισμα Κυψέλης',
  monthlyRent: 700, propertyValue: 180000, expensesYtd: 1450.5,
  openTasks: 3, hasLoan: true, propertyCount: 2,
}

// ── Μορφοποίηση ευρώ ────────────────────────────────────────────────────────
ok('ακέραιο χωρίς δεκαδικά', eur(700) === '700 €')
ok('δεκαδικά με κόμμα', eur(1450.5).includes(','))
ok('χιλιάδες με τελεία', eur(180000).includes('.'))

// ── Το πλήθος δεν ξεφεύγει ─────────────────────────────────────────────────
ok('το πολύ 4 προτάσεις', suggestedOpeners(FULL).length === 4)
ok('πάντα τουλάχιστον μία', suggestedOpeners({}).length >= 1)
ok('κενό context δεν σκάει', Array.isArray(suggestedOpeners()))

// ── Ο ΚΡΙΣΙΜΟΣ ΚΑΝΟΝΑΣ: κανένα επινοημένο νούμερο ──────────────────────────
{
  // Χωρίς κανένα δεδομένο, καμία πρόταση δεν επιτρέπεται να περιέχει ποσό σε €.
  const empty = suggestedOpeners({ propertyName: 'Γκαρσονιέρα' })
  ok('χωρίς δεδομένα → κανένα ποσό σε ευρώ', empty.every(s => !/\d+[.,]?\d*\s*€/.test(s)))
  ok('χωρίς δεδομένα → οδηγεί στη συμπλήρωση', empty.some(s => /χρειάζεσαι|λείπουν|καταχωρώ/.test(s)))
}
{
  // Με ενοίκιο αλλά χωρίς δαπάνες: μόνο το ενοίκιο εμφανίζεται ως ποσό.
  const s = suggestedOpeners({ monthlyRent: 550 }).join(' | ')
  ok('εμφανίζει το πραγματικό ενοίκιο', s.includes('550 €'))
  ok('δεν εφευρίσκει δαπάνες', !/Ξόδεψα/.test(s))
}
{
  // Μηδενικές/άκυρες τιμές δεν θεωρούνται δεδομένο.
  const s = suggestedOpeners({ monthlyRent: 0, expensesYtd: 0, propertyValue: null }).join(' | ')
  ok('το μηδέν δεν είναι δεδομένο', !/0 €/.test(s))
  ok('το null δεν είναι δεδομένο', !/null|undefined|NaN/.test(s))
}
ok('NaN δεν περνά ποτέ', !suggestedOpeners({ monthlyRent: NaN }).join(' ').includes('NaN'))
ok('αρνητικό ποσό αγνοείται', !suggestedOpeners({ monthlyRent: -300 }).join(' ').includes('300'))

// ── Προσωπικός τόνος: δεύτερο πρόσωπο, δικά ΣΟΥ νούμερα ────────────────────
{
  const s = suggestedOpeners(FULL).join(' | ')
  ok('μιλά σε δεύτερο πρόσωπο', /μου|σου|μένει|έχω/.test(s))
  ok('αναφέρει το ποσό του ενοικίου', s.includes('700 €'))
}
ok('κάθε πρόταση είναι ερώτηση', suggestedOpeners(FULL).every(s => s.trim().endsWith(';')))
ok('καμία κενή πρόταση', suggestedOpeners(FULL).every(s => s.trim().length > 10))
ok('χωρίς διπλότυπα', new Set(suggestedOpeners(FULL)).size === suggestedOpeners(FULL).length)

// ── Προτεραιότητα: το επείγον πρώτο ────────────────────────────────────────
{
  const s = suggestedOpeners({ ...FULL, overdueRent: 1400 })
  ok('το ληξιπρόθεσμο ενοίκιο μπαίνει πρώτο', s[0].includes('1.400 €') || s[0].includes('1400 €'))
  ok('αναφέρει τι οφείλεται', /χρωστάει/.test(s[0]))
}
{
  const s = suggestedOpeners({ openTasks: 5 })
  ok('πολλές εκκρεμότητες → ρωτά για την πιο επείγουσα', s.some(x => /5 εκκρεμότητες/.test(x)))
}
ok('μία εκκρεμότητα σε ενικό', suggestedOpeners({ openTasks: 1 }).some(s => /εκκρεμότητά μου/.test(s)))
ok('μηδέν εκκρεμότητες → δεν αναφέρονται', !suggestedOpeners({ openTasks: 0 }).join(' ').includes('εκκρεμότητ'))

// ── Ανά περίπτωση χρήστη ───────────────────────────────────────────────────
ok('με δάνειο → ερώτηση για το δάνειο', suggestedOpeners({ hasLoan: true }).some(s => /δάνει/.test(s)))
ok('χωρίς δάνειο → καμία ερώτηση δανείου', !suggestedOpeners({ monthlyRent: 500 }).join(' ').includes('δάνει'))
ok('βραχυχρόνια → ερώτηση διανυκτέρευσης', suggestedOpeners({ isShortTerm: true }).some(s => /διανυκτέρευση/.test(s)))
ok('μακροχρόνια → καμία διανυκτέρευση', !suggestedOpeners({ monthlyRent: 500 }).join(' ').includes('διανυκτέρευση'))
ok('πολλά ακίνητα → σύγκριση', suggestedOpeners({ propertyCount: 3, monthlyRent: 500 }).some(s => /αποδίδει καλύτερα/.test(s)))
ok('ένα ακίνητο → καμία σύγκριση', !suggestedOpeners({ propertyCount: 1, monthlyRent: 500 }).join(' ').includes('αποδίδει καλύτερα'))

// ── Το όνομα του ακινήτου μπαίνει όπου έχει νόημα ──────────────────────────
ok('χρησιμοποιεί το όνομα ακινήτου', suggestedOpeners({ propertyName: 'Μεζονέτα Βούλας', expensesYtd: 900 }).join(' ').includes('Μεζονέτα Βούλας'))
ok('κενό όνομα δεν αφήνει κενά', !suggestedOpeners({ propertyName: '   ', expensesYtd: 900 }).join(' ').includes('  '))

// ── Χαιρετισμός: λέει ΤΙ ΞΕΡΕΙ, όχι τι είναι ───────────────────────────────
{
  const g = greeting(ASSISTANT_NAME, FULL)
  ok('χαιρετισμός με το όνομα', g.includes(ASSISTANT_NAME))
  ok('χαιρετισμός λέει τι βλέπει', /Βλέπω/.test(g))
  ok('χαιρετισμός τονίζει «τα δικά σου»', /δικά σου νούμερα/.test(g))
  ok('χαιρετισμός αναφέρει πλήθος ακινήτων', g.includes('2 ακινήτων'))
}
{
  const g = greeting(ASSISTANT_NAME, { propertyName: 'Στούντιο Παγκρατίου' })
  ok('χωρίς δεδομένα → δεν ισχυρίζεται ότι βλέπει', !/Βλέπω/.test(g))
  ok('χωρίς δεδομένα → λέει τι χρειάζεται', /καταχωρήσεις/.test(g))
  ok('χωρίς δεδομένα → αναφέρει το ακίνητο', g.includes('Στούντιο Παγκρατίου'))
}
// ── Πληθυντικός ευγενείας: ΟΛΟΚΛΗΡΟΣ, όχι μεικτός ─────────────────────────
//
// ΠΡΟΣΟΧΗ ΣΤΟ ΕΡΓΑΛΕΙΟ: το `\b` της JavaScript είναι ASCII-only ΑΚΟΜΗ ΚΑΙ με
// το flag /u — το /\bσου\b/ ΔΕΝ ταιριάζει ποτέ σε ελληνικό κείμενο. Ένας
// έλεγχος γραμμένος έτσι περνά πάντα και δεν προστατεύει από τίποτα. Εδώ
// χρησιμοποιούμε ρητά όρια με κενά/σημεία στίξης.
const hasWord = (s: string, w: string) => new RegExp(`(^|[\\s(«"'])${w}([\\s)»"'!.,;:]|$)`).test(s)

// Ο ίδιος ο ελεγκτής πρέπει να δουλεύει — αλλιώς όλα από κάτω είναι θόρυβος.
ok('hasWord: βρίσκει «σου» στα ελληνικά', hasWord('Γεια σου!', 'σου'))
ok('hasWord: βρίσκει «σας»', hasWord('Γεια σας, ορίστε', 'σας'))
ok('hasWord: δεν μπερδεύεται με υποσυμβολοσειρά', !hasWord('τα δικά σου', 'δικ'))
ok('hasWord: αρνητικό όταν λείπει', !hasWord('Γεια σας', 'σου'))

{
  const f = greeting(ASSISTANT_NAME, FULL, true)
  ok('ευγενικός τύπος: ρήμα', f.includes('Ρωτήστε με'))
  ok('ευγενικός τύπος: χαιρετισμός', f.includes('Γεια σας'))
  ok('ευγενικός τύπος: κτητικό', f.includes('τα δικά σας νούμερα'))
  ok('ευγενικός τύπος: κανένα «σου»', !hasWord(f, 'σου'))
  const inf = greeting(ASSISTANT_NAME, FULL, false)
  ok('οικείος τύπος: ρήμα', inf.includes('Ρώτα με'))
  ok('οικείος τύπος: χαιρετισμός', inf.includes('Γεια σου'))
  ok('οικείος τύπος: κανένα «σας»', !hasWord(inf, 'σας'))
}
{
  // Ο ευγενικός τύπος διατηρείται ΚΑΙ στην κατάσταση «χωρίς δεδομένα».
  const f = greeting(ASSISTANT_NAME, { propertyName: 'Κυψέλη' }, true)
  ok('κενό + ευγενικός: χαιρετισμός', f.includes('Γεια σας'))
  ok('κενό + ευγενικός: ρήμα β΄ πληθ.', f.includes('καταχωρήσετε'))
  ok('κενό + ευγενικός: κανένα «σου»', !hasWord(f, 'σου'))
}
{
  // Ο έλεγχος ΠΡΕΠΕΙ να πέφτει αν επιστρέψει το μεικτό ύφος. Το αποδεικνύουμε
  // με το ίδιο το ελαττωματικό κείμενο που διορθώθηκε.
  const buggy = 'Γεια σου! Είμαι Άριελ. Ρωτήστε με για τα δικά σου νούμερα.'
  ok('ο έλεγχος ΠΙΑΝΕΙ το παλιό μεικτό ύφος', hasWord(buggy, 'σου'))
}

// ── null = «δεν ξέρω ακόμη», ΟΧΙ «δεν έχεις τίποτα» ───────────────────────
{
  const g = greeting(ASSISTANT_NAME, null)
  ok('null → δεν ισχυρίζεται ότι βλέπει', !/Βλέπω/.test(g))
  ok('null → ΔΕΝ λέει ότι δεν έχεις δεδομένα', !/καταχωρήσεις|καταχωρήσετε/.test(g))
  ok('null → δηλώνει ότι φορτώνει', /Κοιτάζω/.test(g))
  ok('null + ευγενικός', greeting(ASSISTANT_NAME, null, true).includes('Γεια σας'))
  const o = suggestedOpeners(null)
  ok('null → δίνει προτάσεις', o.length >= 3)
  ok('null → κανένα επινοημένο ποσό', o.every(s => !/\d+[.,]?\d*\s*€/.test(s)))
  ok('null → καμία πρόταση «τι λείπει»', !o.join(' ').includes('λείπουν'))
}
ok('ένα ακίνητο → ενικός', greeting(ASSISTANT_NAME, { propertyName: 'Κυψέλη', monthlyRent: 400 }).includes('του Κυψέλη'))
{
  const g = greeting(ASSISTANT_NAME, { monthlyRent: 400, expensesYtd: 200, hasLoan: true })
  ok('απαριθμεί σωστά με «και»', /τα ενοίκια, τις δαπάνες και το δάνειο/.test(g))
}
ok('ένα μόνο στοιχείο χωρίς «και»', !/ και /.test(greeting('Α', { monthlyRent: 400 }).split('Βλέπω')[1]?.split('.')[0] || ''))

console.log(`assistant/openers.test.ts: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
