// npx tsx lib/core/site.test.ts
//
// ΤΟ DOMAIN ΜΠΑΙΝΕΙ ΣΕ CANONICAL, ΣΕ SITEMAP, ΣΕ ΔΟΜΗΜΕΝΑ ΔΕΔΟΜΕΝΑ ΚΑΙ ΣΕ
// EMAIL. Μια κακογραμμένη τιμή δεν βγάζει σφάλμα — βγάζει διπλή κάθετο σε
// διακόσιες διευθύνσεις, και το μαθαίνεις από μηχανή αναζήτησης.
import { normalizeSite, siteUrl, SITE, SITE_HOST } from './site'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } }

const VERCEL = 'https://property-tan-gamma.vercel.app'

ok('κενό περιβάλλον δίνει τη διεύθυνση που ΑΠΑΝΤΑ', normalizeSite('') === VERCEL)
ok('undefined το ίδιο', normalizeSite(undefined) === VERCEL)
ok('έγκυρη τιμή περνά', normalizeSite('https://properwise.gr') === 'https://properwise.gr')
ok('κάθετος στο τέλος κόβεται', normalizeSite('https://properwise.gr/') === 'https://properwise.gr')
ok('πολλές κάθετοι κόβονται', normalizeSite('https://properwise.gr///') === 'https://properwise.gr')
ok('κενά γύρω αγνοούνται', normalizeSite('  https://properwise.gr  ') === 'https://properwise.gr')

// ΧΩΡΙΣ ΠΡΩΤΟΚΟΛΛΟ ΔΕΝ ΕΙΝΑΙ ΔΙΕΥΘΥΝΣΗ. Θα έδινε «properwise.gr/terms» σε
// canonical, που οι μηχανές διαβάζουν ως σχετική διαδρομή.
ok('χωρίς πρωτόκολλο απορρίπτεται', normalizeSite('properwise.gr') === VERCEL)
ok('http απορρίπτεται: το canonical είναι πάντα https', normalizeSite('http://properwise.gr') === VERCEL)
ok('διαδρομή μέσα στη ρίζα απορρίπτεται', normalizeSite('https://properwise.gr/app') === VERCEL)
ok('σκουπίδια απορρίπτονται', normalizeSite('όχι διεύθυνση') === VERCEL)

// ── Η ΕΝΩΣΗ ΔΕΝ ΔΙΠΛΑΣΙΑΖΕΙ ΚΑΘΕΤΟ ───────────────────────────────────────
ok('η διεύθυνση σελίδας ενώνεται καθαρά', siteUrl('/terms') === `${SITE}/terms`)
ok('καμία διπλή κάθετος', !siteUrl('/terms').replace('https://', '').includes('//'))
ok('η ρίζα δεν αφήνει κάθετο ορφανό', siteUrl('') === SITE)
ok('το SITE δεν τελειώνει σε κάθετο', !SITE.endsWith('/'))
ok('το SITE_HOST δεν κρατά πρωτόκολλο', !SITE_HOST.includes('://'))

console.log(fail === 0 ? `✓ site: ${pass} έλεγχοι πέρασαν` : `✗ site: ${fail} απέτυχαν από ${pass + fail}`)
if (fail > 0) process.exit(1)
