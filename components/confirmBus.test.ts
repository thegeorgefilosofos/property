// Τεστ για τον δίαυλο επιβεβαίωσης.
//
// ΓΙΑΤΙ ΥΠΑΡΧΕΙ: ο δίαυλος στέκεται μπροστά από 25 ενέργειες, οι περισσότερες
// οριστικές διαγραφές. Κάθε λάθος του είναι σιωπηλό — δεν σκάει τίποτα:
//   • Αν μια ερώτηση χαθεί πριν προσαρτηθεί ο host, ο χρήστης πατά «Διαγραφή»
//     και δεν συμβαίνει απολύτως τίποτα. Θα ξαναπατήσει, νομίζοντας ότι κόλλησε.
//   • Αν μια ακύρωση διαβαστεί ως «ναι», σβήνονται δεδομένα που δεν αναιρούνται.
//   • Αν μια δεύτερη κλήση σκεπάσει την πρώτη, η πρώτη υπόσχεση δεν ψηφίζεται
//     ποτέ και ο handler που την περιμένει σταματά στη μέση, για πάντα.
//
// Ο δίαυλος είναι καθαρή JavaScript χωρίς React ακριβώς για να ελέγχεται εδώ,
// σε σκέτο Node: ο ψεύτικος host παρακάτω κάνει ό,τι κάνει και ο αληθινός —
// συνδέεται και απαντά.

import {
  confirmDialog, subscribeConfirm, CONFIRM_OK, CONFIRM_CANCEL, CONFIRM_TITLE,
  type ConfirmRequest,
} from './confirmBus'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { if (cond) { passed++ } else { failed++; console.log('  ✗ ' + name) } }

/** Ψεύτικος host: μαζεύει ό,τι του παραδοθεί, όπως το setState του αληθινού. */
function mountHost() {
  const seen: ConfirmRequest[] = []
  const off = subscribeConfirm(r => { seen.push(r) })
  return { seen, off, last: () => seen[seen.length - 1] }
}

/** Δίνει χρόνο στις μικρο-εργασίες να τρέξουν (η υπόσχεση ψηφίζεται εκεί). */
const tick = () => new Promise<void>(r => setTimeout(r, 0))

/** Τιμή της υπόσχεσης ΧΩΡΙΣ να την περιμένουμε — για να δούμε αν εκκρεμεί. */
function watch<Tv>(p: Promise<Tv>) {
  const box: { done: boolean; value?: Tv } = { done: false }
  p.then(v => { box.done = true; box.value = v })
  return box
}

async function run() {

  // ── Η ουρά πριν τον host ────────────────────────────────────────────────
  // Το πρώτο πράγμα που κάνει ο χρήστης μπορεί να είναι μια διαγραφή, πριν
  // προλάβει να «ζωντανέψει» ο host. Η ερώτηση πρέπει να τον περιμένει.
  {
    const answer = watch(confirmDialog({ title: 'Διαγραφή', message: 'Σίγουρα;' }))
    await tick()
    ok('χωρίς host η ερώτηση ΔΕΝ αυτο-απαντιέται', !answer.done)

    const host = mountHost()
    ok('μόλις συνδεθεί ο host, η ερώτηση παραδίδεται', host.seen.length === 1)
    ok('παραδίδεται με τα κείμενα που δόθηκαν',
      host.last().title === 'Διαγραφή' && host.last().message === 'Σίγουρα;')

    host.last().settle(true)
    await tick()
    ok('και απαντιέται κανονικά', answer.done && answer.value === true)
    host.off()
  }

  // ── Η ακύρωση δίνει false, σε ΚΑΘΕ μορφή της ────────────────────────────
  // Escape, κλικ έξω, «Άκυρο» και το × καταλήγουν όλα στην ίδια settle(false).
  {
    const host = mountHost()
    const cancelled = confirmDialog('Διαγραφή;')
    host.last().settle(false)
    ok('η ακύρωση δίνει false', await cancelled === false)

    // Fail-closed: μόνο ρητό `true` περνά. Ένα ξεχασμένο όρισμα δεν διαγράφει.
    for (const bad of [undefined, null, 0, '', 'true', 1]) {
      const p = confirmDialog('Διαγραφή;')
      host.last().settle(bad as never)
      ok(`«${String(bad)}» διαβάζεται ως ακύρωση, όχι ως «ναι»`, await p === false)
    }
    host.off()
  }

  // ── Δεύτερη κλήση: η πρώτη ΔΕΝ χάνεται ──────────────────────────────────
  // Το native confirm πάγωνε τη σελίδα, άρα δεύτερη κλήση ήταν αδύνατη. Τώρα
  // ένα διπλό κλικ στο ίδιο κουμπί «Διαγραφή» ξανακαλεί τον handler.
  {
    const host = mountHost()
    const first = watch(confirmDialog({ title: 'Πρώτη', tone: 'negative' }))
    const second = watch(confirmDialog({ title: 'Δεύτερη' }))
    await tick()

    ok('η δεύτερη κλήση απαντιέται αμέσως με false', second.done && second.value === false)
    ok('η πρώτη ΜΕΝΕΙ ανοιχτή και περιμένει τον χρήστη', !first.done)
    ok('ο host δεν είδε ποτέ τη δεύτερη — δεν σκέπασε την πρώτη',
      host.seen.length === 1 && host.last().title === 'Πρώτη')

    // Και το κρίσιμο: η πρώτη είναι ακόμη απαντήσιμη — ο handler της δεν κόλλησε.
    host.last().settle(true)
    await tick()
    ok('η πρώτη απαντιέται κανονικά μετά την απόρριψη της δεύτερης', first.done && first.value === true)

    // Μόλις αδειάσει η θέση, η επόμενη ερώτηση περνά κανονικά.
    const third = watch(confirmDialog({ title: 'Τρίτη' }))
    await tick()
    ok('μετά την απάντηση ο δίαυλος ξεκλειδώνει', !third.done && host.last().title === 'Τρίτη')
    host.last().settle(false)
    await tick()
    host.off()
  }

  // ── Διπλή απάντηση στο ΙΔΙΟ αίτημα δεν πειράζει το επόμενο ──────────────
  // Escape και κλικ έξω μπορούν να φτάσουν στο ίδιο tick. Αν η δεύτερη settle
  // ακύρωνε το αίτημα που μόλις μπήκε στη θέση του, ο διάλογος θα «έκλεινε
  // μόνος του» και ο χρήστης θα έβλεπε μια διαγραφή να μην εκτελείται.
  {
    const host = mountHost()
    const a = watch(confirmDialog({ title: 'Α' }))
    const reqA = host.last()
    reqA.settle(true)
    const b = watch(confirmDialog({ title: 'Β' }))
    reqA.settle(false)                 // αργοπορημένο Escape του ΠΡΟΗΓΟΥΜΕΝΟΥ
    await tick()
    ok('η αργοπορημένη απάντηση δεν αλλάζει την πρώτη', a.value === true)
    ok('ούτε ακυρώνει το επόμενο αίτημα', !b.done && host.seen.length === 2)
    host.last().settle(true)
    await tick()
    ok('το επόμενο αίτημα απαντά μόνο του', b.value === true)
    host.off()
  }

  // ── Οι προεπιλογές: ΕΝΑ «Άκυρο» σε όλη την εφαρμογή ─────────────────────
  // Με 25 σημεία κλήσης, αν το κάθε ένα έγραφε τα δικά του κείμενα, θα είχαμε
  // ξανά την ασυνέπεια που φτιάχνουμε εδώ.
  {
    const host = mountHost()
    void confirmDialog('Διαγραφή δανείου;')
    const r = host.last()
    ok('ο τίτλος έχει προεπιλογή', r.title === CONFIRM_TITLE)
    ok('η σκέτη συμβολοσειρά γίνεται μήνυμα (μετάβαση 1:1 από το confirm())', r.message === 'Διαγραφή δανείου;')
    ok('προεπιλεγμένο «Επιβεβαίωση»', r.confirmLabel === CONFIRM_OK)
    ok('προεπιλεγμένο «Άκυρο»', r.cancelLabel === CONFIRM_CANCEL)
    ok('ουδέτερος τόνος όταν δεν ζητηθεί άλλος', r.tone === 'neutral')
    r.settle(false)

    void confirmDialog({ message: 'x', confirmLabel: '   ', cancelLabel: '' })
    ok('κενές ετικέτες πέφτουν στις προεπιλογές, δεν αφήνουν άδειο κουμπί',
      host.last().confirmLabel === CONFIRM_OK && host.last().cancelLabel === CONFIRM_CANCEL)
    host.last().settle(false)

    void confirmDialog({ message: 'x', tone: 'negative' })
    ok('ο καταστροφικός τόνος περνά', host.last().tone === 'negative')
    host.last().settle(false)

    // Το μοναδικό μήνυμα με παραγράφους (διαγραφή ακινήτου) πρέπει να φτάνει
    // ΑΚΕΡΑΙΟ στον host — εκείνος το αποδίδει με white-space: pre-line.
    void confirmDialog({ message: '  Πρώτη.\n\nΔεύτερη.  ' })
    ok('οι αλλαγές γραμμής επιβιώνουν, τα άκρα καθαρίζονται',
      host.last().message === 'Πρώτη.\n\nΔεύτερη.')
    host.last().settle(false)
    await tick()
    host.off()
  }

  // ── Ο host μπορεί να ξανασυνδεθεί χωρίς να χαθεί ανοιχτή ερώτηση ────────
  // Στο dev ο React προσαρτά/αποπροσαρτά/ξαναπροσαρτά (StrictMode). Αν η
  // αποσύνδεση έριχνε την ανοιχτή ερώτηση, στο dev δεν θα δούλευε καμία
  // διαγραφή που ξεκίνησε νωρίς — και θα φαινόταν «τυχαίο».
  {
    const first = mountHost()
    const answer = watch(confirmDialog({ title: 'Επιβιώνει' }))
    await tick()
    first.off()

    const second = mountHost()
    ok('ο νέος host παραλαμβάνει την ανοιχτή ερώτηση',
      second.seen.length === 1 && second.last().title === 'Επιβιώνει')
    ok('και η ερώτηση δεν ακυρώθηκε στο μεταξύ', !answer.done)
    second.last().settle(true)
    await tick()
    ok('απαντιέται από τον νέο host', answer.value === true)
    second.off()
  }

  console.log(`confirmBus.test.ts: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

void run()
