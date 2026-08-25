// npx tsx lib/core/download.test.ts
//
// ΓΙΑΤΙ ΓΡΑΦΤΗΚΕ. Το κατέβασμα αρχείου ήταν γραμμένο επτά φορές και οι επτά
// εκδοχές διέφεραν. Οι δύο διαφορές έσπαγαν το κατέβασμα σιωπηλά:
//
//   • χωρίς `appendChild` → στον Firefox δεν κατεβαίνει τίποτα, χωρίς μήνυμα
//   • ανάκληση της διεύθυνσης ΑΜΕΣΩΣ μετά το κλικ → ακυρώνει μεγάλα αρχεία
//
// Δεν ελέγχεται «αν κατέβηκε» — αυτό το ξέρει μόνο ο περιηγητής. Ελέγχεται η
// ΣΕΙΡΑ ΤΩΝ ΕΝΕΡΓΕΙΩΝ, που είναι ακριβώς αυτό που διέφερε ανάμεσα στα επτά.
import { downloadFile, downloadCsv, safeFilename } from './download'
import { stubObjectUrl } from './downloadCapture.testkit'

let pass = 0, fail = 0
function ok(name: string, cond: boolean) { if (cond) pass++; else { fail++; console.error('✗ ' + name) } }
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) pass++; else { fail++; console.error(`✗ ${name}\n   got  ${g}\n   want ${w}`) }
}

// ═══ ΤΟ ΟΝΟΜΑ ΑΡΧΕΙΟΥ ═════════════════════════════════════════════════════
eq('τα ελληνικά μένουν', safeFilename('Λογιστική αναφορά 2026.pdf'), 'Λογιστική αναφορά 2026.pdf')
eq('η κάθετος γίνεται ενωτικό', safeFilename('α/β:γ*δ?ε"ζ<η>θ|ι'), 'α-β-γ-δ-ε-ζ-η-θ-ι')
eq('πολλαπλά κενά γίνονται ένα', safeFilename('α    β'), 'α β')
eq('κενό όνομα παίρνει εφεδρεία', safeFilename('   '), 'αρχείο')
eq('και το εντελώς κενό', safeFilename(''), 'αρχείο')
ok('πολύ μεγάλο όνομα κόβεται', safeFilename('α'.repeat(400)).length <= 120)
ok('και δεν τελειώνει σε κενό μετά την κοπή', !safeFilename('α '.repeat(200)).endsWith(' '))

// ═══ Η ΣΕΙΡΑ ΤΩΝ ΕΝΕΡΓΕΙΩΝ — ΕΚΕΙ ΗΤΑΝ ΤΑ ΣΦΑΛΜΑΤΑ ══════════════════════════
{
  const events: string[] = []
  let revoked = false
  const anchor = {
    href: '', download: '', style: {} as Record<string, string>,
    click() { events.push('click') },
    remove() { events.push('remove') },
  }
  const g = globalThis as unknown as Record<string, unknown>
  const timers: Array<() => void> = []
  g.document = {
    createElement: () => anchor,
    body: { appendChild: () => events.push('appendChild') },
  }
  const restoreUrl = stubObjectUrl(
    () => { events.push('createObjectURL'); return 'blob:δοκιμή' },
    () => { revoked = true; events.push('revokeObjectURL') })
  const realTimeout = globalThis.setTimeout
  ;(globalThis as unknown as { setTimeout: unknown }).setTimeout =
    ((fn: () => void) => { timers.push(fn); return 0 }) as unknown as typeof setTimeout

  const okRet = downloadFile('περιεχόμενο', 'δοκιμή.txt')

  ok('επιστρέφει επιτυχία όταν υπάρχει έγγραφο', okRet)
  eq('η σειρά είναι: διεύθυνση, στο έγγραφο, κλικ, έξω',
    events, ['createObjectURL', 'appendChild', 'click', 'remove'])
  ok('ΔΕΝ ανακαλεί πριν προλάβει το κατέβασμα', !revoked)
  ok('το στοιχείο μπήκε στο έγγραφο πριν το κλικ',
    events.indexOf('appendChild') < events.indexOf('click'))
  ok('το όνομα πέρασε στο στοιχείο', anchor.download === 'δοκιμή.txt')
  ok('το στοιχείο είναι κρυφό', anchor.style.display === 'none')

  // Η ανάκληση γίνεται ΜΕΤΑ, με χρονοδιακόπτη.
  ok('η ανάκληση είναι προγραμματισμένη, όχι άμεση', timers.length === 1)
  timers[0]()
  ok('και όταν έρθει η ώρα της, γίνεται', revoked)

  ;(globalThis as unknown as { setTimeout: unknown }).setTimeout = realTimeout
  delete g.document
  restoreUrl()
}

// ═══ ΤΟ ΠΛΑΣΤΟ ΔΕΝ ΠΑΤΑΕΙ ΤΟΝ ΚΑΤΑΣΚΕΥΑΣΤΗ URL ════════════════════════════
// Οσο οι σουίτες έγραφαν «globalThis.URL = { createObjectURL }», ο αληθινός
// κατασκευαστής χανόταν. Κανένας έλεγχος δεν το έβλεπε, γιατί ο κώδικας του
// κατεβάσματος δεν καλεί «new URL». Το καλεί όμως ο μεταγλωττιστής tsx σε κάθε
// δυναμική εισαγωγή και στον Node 22.23 τα άγκιστρά του τρέχουν στο ίδιο
// πεδίο. Το CI έσκαγε με «URL is not a constructor» σε μια σουίτα Excel.
{
  const restore = stubObjectUrl(() => 'blob:x', () => {})
  ok('το «new URL» δουλεύει όσο στέκει το πλαστό',
    new URL('file:///a/b.ts').pathname === '/a/b.ts')
  ok('και η πλαστή μέθοδος είναι όντως στη θέση της',
    (URL as unknown as { createObjectURL: () => string }).createObjectURL() === 'blob:x')
  restore()
  ok('η επαναφορά αφήνει τον κατασκευαστή ακέραιο',
    new URL('file:///a/b.ts').pathname === '/a/b.ts')
}

// ═══ ΧΩΡΙΣ ΕΓΓΡΑΦΟ (ΔΙΑΚΟΜΙΣΤΗΣ): ΔΕΝ ΣΚΑΕΙ ══════════════════════════════
ok('στον διακομιστή επιστρέφει false αντί να πετάξει', downloadFile('x', 'y.txt') === false)

// ═══ ΤΟ BOM ΤΟΥ ΕΛΛΗΝΙΚΟΥ EXCEL ═══════════════════════════════════════════
// Χωρίς αυτό, το Excel σε ελληνικά Windows διαβάζει Windows-1253 και κάθε
// ελληνικός χαρακτήρας γίνεται σκουπίδι. Δύο από τα επτά αντίγραφα το είχαν.
{
  let captured = ''
  const g = globalThis as unknown as Record<string, unknown>
  const anchor = { href: '', download: '', style: {} as Record<string, string>, click() {}, remove() {} }
  g.document = { createElement: () => anchor, body: { appendChild: () => {} } }
  const restoreUrl = stubObjectUrl(
    (b: never) => { captured = String((b as { __t?: string }).__t ?? ''); return 'blob:x' },
    () => {})
  const RealBlob = globalThis.Blob
  ;(globalThis as unknown as { Blob: unknown }).Blob =
    function (parts: string[]) { return { __t: parts.join('') } } as unknown as typeof Blob
  // Ο χρονοδιακόπτης της ανάκλησης δεν αφήνεται να χτυπήσει μετά το τέλος της
  // δοκιμής: θα έτρεχε σε κόσμο που η δοκιμή έχει ήδη ξεστήσει.
  const realTimeout2 = globalThis.setTimeout
  ;(globalThis as unknown as { setTimeout: unknown }).setTimeout = (() => 0) as unknown as typeof setTimeout

  downloadCsv('Ονομασία;Αξία', 'α.csv')
  ok('το CSV ξεκινά με τον δείκτη σειράς byte', captured.charCodeAt(0) === 0xFEFF)
  ok('και το περιεχόμενο ακολουθεί ακέραιο', captured.slice(1) === 'Ονομασία;Αξία')

  ;(globalThis as unknown as { Blob: unknown }).Blob = RealBlob
  ;(globalThis as unknown as { setTimeout: unknown }).setTimeout = realTimeout2
  delete g.document
  restoreUrl()
}

console.log(fail === 0 ? `✓ download: ${pass} έλεγχοι πέρασαν` : `✗ download: ${fail} απέτυχαν από ${pass + fail}`)
if (fail > 0) process.exit(1)
