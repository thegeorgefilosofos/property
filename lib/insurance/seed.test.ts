// npx tsx lib/insurance/seed.test.ts
//
// ΤΟ ΚΕΝΟ ΠΟΥ ΚΛΕΙΝΕΙ. Η σάρωση εγγράφου διαβάζει ήδη ασφαλιστική, αριθμό
// συμβολαίου, ασφάλιστρο και λήξη από τη φωτογραφία και τα γράφει στο ακίνητο.
// Η οθόνη της Ασφάλειας διαβάζει ΑΛΛΟ αποθετήριο. Ο ιδιοκτήτης φωτογράφιζε το
// συμβόλαιό του, η εφαρμογή το διάβαζε σωστά και μετά του ζητούσε να
// ξαναγράψει τα ίδια στοιχεία με το χέρι.
import { seedInsurance, normalizeInsurer } from './seed'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } }
const eq = (n: string, got: unknown, want: unknown) =>
  ok(`${n}\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`, JSON.stringify(got) === JSON.stringify(want))

const DEFAULTS = { insProvider: 'hellas_direct' }
const KNOWN = [
  { value: 'interamerican', label: 'Interamerican' },
  { value: 'hellas_direct', label: 'Hellas Direct' },
  { value: 'ethniki', label: 'Εθνική Ασφαλιστική' },
]

// ═══ ΤΟ ΧΑΡΤΙ ΣΥΜΠΛΗΡΩΝΕΙ ΤΗΝ ΑΝΕΓΓΙΧΤΗ ΠΡΟΕΠΙΛΟΓΗ ══════════════════════
{
  const p = seedInsurance(
    { insProvider: 'hellas_direct' },
    { insurance_company: 'Interamerican', insurance_amount: 245, insurance_expiry: '2027-03-15' },
    DEFAULTS, KNOWN)
  eq('η ασφαλιστική έρχεται από το συμβόλαιο', p.insProvider, 'interamerican')
  eq('το ασφάλιστρο επίσης', p.insCustomPrice, '245')
  eq('και η ημερομηνία ανανέωσης', p.insRenewalDate, '2027-03-15')
}

// ═══ Η ΕΠΙΛΟΓΗ ΤΟΥ ΧΡΗΣΤΗ ΕΙΝΑΙ ΙΕΡΗ ═══════════════════════════════════
// Ό,τι έχει πειράξει ο ιδιοκτήτης μένει ανέπαφο: αυτός ξέρει.
{
  const p = seedInsurance(
    { insProvider: 'ethniki', insCustomPrice: '300', insRenewalDate: '2026-12-01' },
    { insurance_company: 'Interamerican', insurance_amount: 245, insurance_expiry: '2027-03-15' },
    DEFAULTS, KNOWN)
  eq('τίποτα δεν αλλάζει', p, {})
}

// ═══ ΜΕΡΙΚΗ ΣΥΜΠΛΗΡΩΣΗ ═════════════════════════════════════════════════
// Ο χρήστης διόρθωσε το ασφάλιστρο, δεν έβαλε ημερομηνία. Το ένα μένει, το
// άλλο συμπληρώνεται.
{
  const p = seedInsurance(
    { insProvider: 'hellas_direct', insCustomPrice: '199' },
    { insurance_company: 'Hellas Direct', insurance_amount: 245, insurance_expiry: '2027-03-15' },
    DEFAULTS, KNOWN)
  ok('το διορθωμένο ασφάλιστρο δεν πατιέται', p.insCustomPrice === undefined)
  eq('η ημερομηνία συμπληρώνεται', p.insRenewalDate, '2027-03-15')
  ok('και η ίδια ασφαλιστική δεν ξαναγράφεται', p.insProvider === undefined)
}

// ═══ ΤΟ ΧΑΡΤΙ ΔΕΝ ΓΡΑΦΕΙ ΟΠΩΣ Ο ΚΑΤΑΛΟΓΟΣ ══════════════════════════════
// «INTERAMERICAN Ε.Α.Ε.Ζ.» απέναντι σε «Interamerican». Χωρίς κανονικοποίηση
// καμία σάρωση δεν θα ταίριαζε ποτέ και το χαρακτηριστικό θα φαινόταν
// σπασμένο ενώ θα ήταν απλώς αυστηρό.
{
  eq('πεζά, χωρίς τόνους και σημεία', normalizeInsurer('Εθνική Ασφαλιστική Α.Ε.'), 'εθνικη ασφαλιστικη α ε')
  const p = seedInsurance({}, { insurance_company: 'INTERAMERICAN Ε.Α.Ε.Ζ.' }, DEFAULTS, KNOWN)
  eq('ταιριάζει με πρόθεμα', p.insProvider, 'interamerican')
}

// ═══ ΑΣΦΑΛΙΣΤΙΚΗ ΕΚΤΟΣ ΚΑΤΑΛΟΓΟΥ ═══════════════════════════════════════
// Ο κατάλογος δεν είναι πλήρης και δεν προσποιείται ότι είναι. Το όνομα από το
// χαρτί κρατιέται αντί να χαθεί.
{
  const p = seedInsurance({}, { insurance_company: 'Μικρή Τοπική Ασφαλιστική' }, DEFAULTS, KNOWN)
  ok('δεν επιλέγεται λάθος εταιρεία', p.insProvider === undefined)
  eq('το όνομα κρατιέται', p.insCustomPlanName, 'Μικρή Τοπική Ασφαλιστική')
}

// ═══ ΤΙΠΟΤΑ ΑΠΟ ΤΟ ΤΙΠΟΤΑ ══════════════════════════════════════════════
// Κενό αντικείμενο σημαίνει «μην γράψεις». Μια περιττή εγγραφή σε κάθε φόρτωση
// γεννά συμβάν realtime που ξαναφορτώνει την ίδια οθόνη.
{
  eq('χωρίς στοιχεία ακινήτου, καμία εγγραφή', seedInsurance({}, {}, DEFAULTS, KNOWN), {})
  eq('κενές συμβολοσειρές δεν είναι δεδομένα',
    seedInsurance({}, { insurance_company: '   ', insurance_expiry: '' }, DEFAULTS, KNOWN), {})
  eq('μηδενικό ασφάλιστρο δεν γράφεται',
    seedInsurance({}, { insurance_amount: 0 }, DEFAULTS, KNOWN), {})
}

// ═══ ΑΚΥΡΗ ΗΜΕΡΟΜΗΝΙΑ ══════════════════════════════════════════════════
{
  eq('σκουπίδι δεν περνά', seedInsurance({}, { insurance_expiry: 'άγνωστη' }, DEFAULTS, KNOWN), {})
  eq('χρονοσφραγίδα κόβεται στην ημέρα',
    seedInsurance({}, { insurance_expiry: '2027-03-15T00:00:00Z' }, DEFAULTS, KNOWN).insRenewalDate, '2027-03-15')
}

// ═══ ΤΑ ΟΡΙΣΜΑΤΑ ΜΕΝΟΥΝ ΑΘΙΚΤΑ ═════════════════════════════════════════
{
  const st = { insProvider: 'hellas_direct' }, pr = { insurance_company: 'Interamerican' }
  const a = JSON.stringify(st), b = JSON.stringify(pr)
  seedInsurance(st, pr, DEFAULTS, KNOWN)
  ok('καμία μεταλλαγή', JSON.stringify(st) === a && JSON.stringify(pr) === b)
}

console.log(fail === 0 ? `✓ seed: ${pass} έλεγχοι πέρασαν` : `✗ seed: ${fail} απέτυχαν από ${pass + fail}`)
if (fail > 0) process.exit(1)
