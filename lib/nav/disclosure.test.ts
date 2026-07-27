// Τεστ για τη σταδιακή αποκάλυψη καρτελών.
import {
  CORE_TABS, PROFESSIONAL_CORE_TABS, coreTabs,
  isTabVisible, visibleTabs, hiddenCount, reveal, sanitizeRevealed,
} from './disclosure'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { if (cond) { passed++ } else { failed++; console.log('  ✗ ' + name) } }

const ALL = [
  'portfolio', 'overview', 'calendar', 'finances', 'accounting', 'loan', 'tenant', 'clients',
  'pricing', 'inventory', 'documents', 'checklist', 'contacts', 'roi', 'comparison', 'referral', 'settings',
]

// ── Βασικές καρτέλες ────────────────────────────────────────────────────────
ok('ο ιδιώτης ξεκινά με 6 καρτέλες', coreTabs('individual').length === 6)
ok('ο επαγγελματίας ξεκινά με 8', coreTabs('professional').length === 8)
ok('ο επαγγελματίας έχει Χαρτοφυλάκιο + Πελάτη', PROFESSIONAL_CORE_TABS.every(t => coreTabs('professional').includes(t)))
ok('ο ιδιώτης ΔΕΝ έχει Χαρτοφυλάκιο εξαρχής', !coreTabs('individual').includes('portfolio'))
ok('κάθε βασική είναι υπαρκτό id', CORE_TABS.every(t => ALL.includes(t)))
ok('οι Ρυθμίσεις είναι πάντα ορατές', isTabVisible('settings'))
ok('η Λογιστική είναι βασική (ο λόγος που ήρθε)', isTabVisible('accounting'))

// ── Νέος χρήστης, ένα ακίνητο, κανένα δεδομένο ─────────────────────────────
const fresh = { profileType: 'individual' as const, signals: { propertyCount: 1, daysSinceSignup: 0 } }
ok('νέος χρήστης βλέπει ακριβώς 6 καρτέλες', visibleTabs(ALL, fresh).length === 6)
ok('νέος χρήστης δεν βλέπει Δάνειο', !isTabVisible('loan', fresh))
ok('νέος χρήστης δεν βλέπει Τιμολόγηση', !isTabVisible('pricing', fresh))
ok('νέος χρήστης δεν βλέπει Σύγκριση', !isTabVisible('comparison', fresh))
ok('νέος χρήστης δεν βλέπει Πρόγραμμα Πρόσκλησης', !isTabVisible('referral', fresh))
ok('κρύβονται 11 από 17', hiddenCount(ALL, fresh) === 11)
ok('η σειρά διατηρείται', visibleTabs(ALL, fresh)[0] === 'overview')

// ── Τα δεδομένα αποκαλύπτουν ────────────────────────────────────────────────
ok('δάνειο → εμφανίζεται το Δάνειο', isTabVisible('loan', { signals: { hasLoan: true } }))
ok('βραχυχρόνια → εμφανίζεται η Τιμολόγηση', isTabVisible('pricing', { signals: { isShortTerm: true } }))
ok('δεύτερο ακίνητο → Σύγκριση', isTabVisible('comparison', { signals: { propertyCount: 2 } }))
ok('δεύτερο ακίνητο → Αποδόσεις', isTabVisible('roi', { signals: { propertyCount: 2 } }))
ok('ένα ακίνητο → όχι Σύγκριση', !isTabVisible('comparison', { signals: { propertyCount: 1 } }))
ok('απογραφή με είδη → Απογραφή', isTabVisible('inventory', { signals: { hasInventory: true } }))
ok('έγγραφα → Αρχείο', isTabVisible('documents', { signals: { hasDocuments: true } }))
ok('επαφές → Επαφές', isTabVisible('contacts', { signals: { hasContacts: true } }))
ok('ανοιχτές εργασίες → Εκκρεμότητες', isTabVisible('checklist', { signals: { openTasks: 2 } }))
ok('καμία εργασία → όχι Εκκρεμότητες', !isTabVisible('checklist', { signals: { openTasks: 0 } }))
ok('7η ημέρα → Πρόγραμμα Πρόσκλησης', isTabVisible('referral', { signals: { daysSinceSignup: 7 } }))
ok('6η ημέρα → όχι ακόμη', !isTabVisible('referral', { signals: { daysSinceSignup: 6 } }))

// ── Η επίσκεψη αποκαλύπτει μόνιμα ──────────────────────────────────────────
ok('αποκαλυμμένη καρτέλα παραμένει ορατή', isTabVisible('loan', { revealed: ['loan'] }))
ok('η αποκάλυψη δεν επηρεάζει τις άλλες', !isTabVisible('pricing', { revealed: ['loan'] }))
ok('reveal προσθέτει', reveal(['loan'], 'pricing').join() === 'loan,pricing')
ok('reveal δεν διπλογράφει', reveal(['loan'], 'loan').length === 1)
ok('reveal επιστρέφει ΙΔΙΑ αναφορά όταν δεν αλλάζει κάτι', (() => { const a = ['loan']; return reveal(a, 'loan') === a })())

// ── «Δες τα όλα» ───────────────────────────────────────────────────────────
const all = { profileType: 'individual' as const, showAll: true, signals: { propertyCount: 1 } }
ok('showAll δείχνει τα πάντα', visibleTabs(ALL, all).length === ALL.length)
ok('showAll → μηδέν κρυφές', hiddenCount(ALL, all) === 0)

// ── Άγνωστα ids: ποτέ ορατά «για καλό και για κακό» ────────────────────────
ok('άγνωστο id δεν εμφανίζεται από μόνο του', !isTabVisible('kati_allo', { signals: { hasLoan: true } }))
ok('άγνωστο id εμφανίζεται μόνο με ρητή αποκάλυψη', isTabVisible('kati_allo', { revealed: ['kati_allo'] }))

// ── Κενή/χαλασμένη είσοδος ─────────────────────────────────────────────────
ok('χωρίς είσοδο → μόνο οι βασικές', visibleTabs(ALL).length === 6)
ok('κενά σήματα δεν αποκαλύπτουν', !isTabVisible('loan', { signals: {} }))
ok('sanitize πετά άγνωστα', sanitizeRevealed(['loan', 'χαζο', 'pricing'], ALL).join() === 'loan,pricing')
ok('sanitize πετά διπλότυπα', sanitizeRevealed(['loan', 'loan'], ALL).length === 1)
ok('sanitize πετά μη-κείμενα', sanitizeRevealed(['loan', 42, null, {}], ALL).join() === 'loan')
ok('sanitize σε null → κενό', sanitizeRevealed(null, ALL).length === 0)
ok('sanitize σε string → κενό', sanitizeRevealed('loan', ALL).length === 0)

// ── Ο επαγγελματίας δεν χάνει τα εργαλεία του ──────────────────────────────
const pro = { profileType: 'professional' as const, signals: { propertyCount: 1, daysSinceSignup: 0 } }
ok('ο επαγγελματίας βλέπει Χαρτοφυλάκιο από την αρχή', isTabVisible('portfolio', pro))
ok('ο επαγγελματίας βλέπει Πελάτη από την αρχή', isTabVisible('clients', pro))
ok('ο επαγγελματίας βλέπει 8 καρτέλες', visibleTabs(ALL, pro).length === 8)

console.log(`nav/disclosure.test.ts: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
