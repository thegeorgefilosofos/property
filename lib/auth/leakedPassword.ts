// ═══════════════════════════════════════════════════════════════════════════
// ΔΙΑΡΡΕΥΣΑΝΤΕΣ ΚΩΔΙΚΟΙ — ΧΩΡΙΣ ΝΑ ΦΥΓΕΙ Ο ΚΩΔΙΚΟΣ ΑΠΟ ΤΟΝ ΠΕΡΙΗΓΗΤΗ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΚΕΝΟ. Ο ελεγκτής της Supabase προειδοποιεί ότι η προστασία διαρρευσάντων
// κωδικών είναι απενεργοποιημένη. Δεν είναι «ένα κλικ»: στη Supabase είναι
// χαρακτηριστικό ΕΠΙ ΠΛΗΡΩΜΗ. Το `lib/auth/password.ts` έβαλε στη θέση της μια
// τοπική λίστα δεκαοκτώ προφανών κωδικών — τίμια ενδιάμεση λύση, αλλά δεκαοκτώ
// έναντι εξακοσίων εκατομμυρίων.
//
// ΤΟ ΚΕΝΟ ΠΟΥ ΜΕΝΕΙ ΕΙΝΑΙ ΤΟ ΣΗΜΑΝΤΙΚΟ. Ο κίνδυνος δεν είναι ο αδύναμος
// κωδικός — αυτόν τον πιάνει η πολιτική ισχύος. Είναι ο ΙΣΧΥΡΟΣ κωδικός που ο
// χρήστης έχει ήδη χρησιμοποιήσει σε άλλη υπηρεσία που έσπασε. Το
// «Kalokairi2024!» περνά κάθε έλεγχο ισχύος και βρίσκεται σε λίστες διαρροών.
// Ο επιτιθέμενος δεν μαντεύει· δοκιμάζει ζεύγη email/κωδικού που ήδη ξέρει.
//
// Η ΛΥΣΗ ΕΙΝΑΙ ΔΩΡΕΑΝ ΚΑΙ ΠΙΟ ΙΔΙΩΤΙΚΗ ΑΠΟ ΤΗΝ ΕΠΙ ΠΛΗΡΩΜΗ. Το Have I Been
// Pwned δίνει «k-anonymity»: υπολογίζουμε SHA-1 του κωδικού ΤΟΠΙΚΑ και
// στέλνουμε ΜΟΝΟ τα πρώτα πέντε δεκαεξαδικά ψηφία. Ο διακομιστής γυρίζει κάθε
// διαρρεύσαντα κωδικό που αρχίζει έτσι — τυπικά 300 ως 900 υποψήφιους — και η
// σύγκριση γίνεται εδώ.
//
//     ο κωδικός                    ΔΕΝ φεύγει ποτέ
//     ο πλήρης κατακερματισμός     ΔΕΝ φεύγει ποτέ
//     φεύγουν 5 ψηφία              ταιριάζουν σε ~1 στους 900 κωδικούς
//
// Δεν χρειάζεται κλειδί, λογαριασμός ή συνδρομή.
//
// ΤΟ `Add-Padding` ΔΕΝ ΕΙΝΑΙ ΔΙΑΚΟΣΜΗΤΙΚΟ. Χωρίς αυτό, το ΜΕΓΕΘΟΣ της
// απάντησης διαφέρει ανά πρόθεμα και όποιος βλέπει την κρυπτογραφημένη κίνηση
// μπορεί να στενέψει το πρόθεμα από το μέγεθος. Με padding, όλες οι απαντήσεις
// γεμίζουν με ψεύτικες εγγραφές ώστε να μοιάζουν ίδιες. Οι ψεύτικες έχουν
// πλήθος μηδέν — γι' αυτό το μηδέν διαβάζεται ως «δεν βρέθηκε».
//
// ΑΠΟΤΥΓΧΑΝΕΙ ΑΝΟΙΧΤΑ, ΚΑΙ ΑΥΤΟ ΕΙΝΑΙ ΑΠΟΦΑΣΗ. Αν το δίκτυο ή η υπηρεσία δεν
// απαντήσει, επιστρέφεται `null` και η εγγραφή προχωρά. Ένας έλεγχος
// βελτίωσης δεν επιτρέπεται να κλειδώσει έξω πραγματικό πελάτη επειδή έπεσε
// τρίτη υπηρεσία. Η πολιτική ισχύος από κάτω παραμένει υποχρεωτική.
// ═══════════════════════════════════════════════════════════════════════════

/** Το αποτέλεσμα του ελέγχου. `null` = ο έλεγχος δεν έτρεξε (δίκτυο/υπηρεσία). */
export interface LeakCheck {
  /** Βρέθηκε σε γνωστή διαρροή; */
  leaked: boolean
  /** Σε πόσες καταγεγραμμένες διαρροές εμφανίστηκε. */
  count: number
}

const ENDPOINT = 'https://api.pwnedpasswords.com/range/'

/** SHA-1 σε κεφαλαία δεκαεξαδικά, με το Web Crypto του περιηγητή. */
async function sha1Hex(text: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) return null
  const bytes = new TextEncoder().encode(text)
  const digest = await subtle.digest('SHA-1', bytes)
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

/**
 * Είναι ο κωδικός σε γνωστή διαρροή;
 *
 * @param password ο κωδικός — δεν φεύγει από τη συσκευή
 * @param signal   προαιρετική ακύρωση (ο χρήστης συνεχίζει να πληκτρολογεί)
 */
export async function checkLeakedPassword(
  password: string,
  signal?: AbortSignal,
): Promise<LeakCheck | null> {
  if (!password || password.length < 4) return null

  const hash = await sha1Hex(password)
  if (!hash) return null

  const prefix = hash.slice(0, 5)
  const suffix = hash.slice(5)

  let body: string
  try {
    const res = await fetch(ENDPOINT + prefix, {
      signal,
      headers: { 'Add-Padding': 'true' },
    })
    if (!res.ok) return null
    body = await res.text()
  } catch {
    return null                       // δίκτυο, ακύρωση ή υπηρεσία εκτός: ανοιχτά
  }

  return parseRange(body, suffix)
}

/**
 * Η ανάλυση της απάντησης, χωριστά ώστε να ελέγχεται χωρίς δίκτυο.
 *
 * Μορφή γραμμής: «<35 δεκαεξαδικά>:<πλήθος>». Οι γραμμές με πλήθος μηδέν είναι
 * το padding και αγνοούνται — αλλιώς κάθε κωδικός θα έβγαινε διαρρεύσας.
 */
export function parseRange(body: string, suffix: string): LeakCheck {
  const want = suffix.toUpperCase()
  for (const line of body.split('\n')) {
    const sep = line.indexOf(':')
    if (sep < 0) continue
    if (line.slice(0, sep).trim().toUpperCase() !== want) continue
    const count = Number.parseInt(line.slice(sep + 1).trim(), 10)
    if (!Number.isFinite(count) || count <= 0) return { leaked: false, count: 0 }
    return { leaked: true, count }
  }
  return { leaked: false, count: 0 }
}

/** Πόσο σοβαρά να το πει η οθόνη. Το πλήθος αλλάζει το μήνυμα, όχι μόνο το «ναι». */
export function leakMessage(r: LeakCheck | null): string | null {
  if (!r || !r.leaked) return null
  if (r.count >= 100_000) {
    return 'Αυτός ο κωδικός εμφανίζεται σε γνωστές διαρροές πάνω από 100.000 φορές. Διάλεξε άλλον.'
  }
  return 'Αυτός ο κωδικός έχει εμφανιστεί σε γνωστή διαρροή δεδομένων. Διάλεξε άλλον.'
}
