// Τεστ για τη βάση γνώσης επικαιρότητας 2026 (lib/accounting/updates2026.ts).
import { REGULATORY_UPDATES_2026, updatesForAudience, updatesByArea } from './updates2026'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { if (cond) { passed++ } else { failed++; console.log('  ✗ ' + name) } }

// ── Ακεραιότητα δεδομένων ────────────────────────────────────────────────────
ok('υπάρχουν επίκαιροι κανόνες', REGULATORY_UPDATES_2026.length >= 10)
ok('μοναδικά ids', new Set(REGULATORY_UPDATES_2026.map(u => u.id)).size === REGULATORY_UPDATES_2026.length)
ok('κάθε κανόνας έχει τίτλο και περίληψη', REGULATORY_UPDATES_2026.every(u => u.title.length > 5 && u.summary.length > 30))
ok('κάθε κανόνας έχει νομική βάση και ισχύ', REGULATORY_UPDATES_2026.every(u => u.legalBasis.length > 0 && u.effective.length > 0))
ok('κάθε κανόνας έχει τουλάχιστον ένα audience', REGULATORY_UPDATES_2026.every(u => u.audiences.length > 0))
ok('έγκυρα severity', REGULATORY_UPDATES_2026.every(u => ['info', 'action', 'warning'].includes(u.severity)))
ok('όσα έχουν sourceHref είναι https', REGULATORY_UPDATES_2026.every(u => !u.sourceHref || u.sourceHref.startsWith('https://')))
ok('χωρίς αγγλικό "vs" στα κείμενα', REGULATORY_UPDATES_2026.every(u => !/\bvs\.?\b/i.test(u.title + ' ' + u.summary)))
ok('χωρίς em-dash με κενά', REGULATORY_UPDATES_2026.every(u => !u.summary.includes(' — ')))

// ── Φιλτράρισμα ανά προφίλ ───────────────────────────────────────────────────
const longTerm = updatesForAudience('long_term')
ok('long_term → περιλαμβάνει την τραπεζική πληρωμή', longTerm.some(u => u.id === 'rent-bank-payment'))
const shortTerm = updatesForAudience('short_term')
ok('short_term → περιλαμβάνει τις κόκκινες ζώνες ΑΜΑ', shortTerm.some(u => u.id === 'ama-red-zones'))
const borrower = updatesForAudience('borrower')
ok('borrower → περιλαμβάνει servicers και DSTI', borrower.some(u => u.id === 'servicers-5072') && borrower.some(u => u.id === 'dsti-ltv-limits'))
ok('all-audience κανόνας φαίνεται παντού', updatesForAudience('long_term').some(u => u.audiences.includes('all')))

// ── Φιλτράρισμα ανά περιοχή ──────────────────────────────────────────────────
ok('area short_term έχει κανόνες', updatesByArea('short_term').length >= 2)
ok('area servicers_funds έχει κανόνες', updatesByArea('servicers_funds').length >= 2)

console.log(`updates2026.ts — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`)
if (failed > 0) { process.exit(1) }
console.log('όλα πέρασαν')
