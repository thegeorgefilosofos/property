// npx tsx lib/billing/lemonPortal.test.ts
//
// ΕΔΩ ΚΡΙΝΕΤΑΙ ΑΝ Ο ΣΥΝΔΡΟΜΗΤΗΣ ΜΠΟΡΕΙ ΝΑ ΑΚΥΡΩΣΕΙ.
// Από τον σύνδεσμο αυτόν περνούν οι τρεις υποσχέσεις των Ορων: ακύρωση μέσα
// από την εφαρμογή, παραστατικά, αλλαγή κάρτας. Ενα κουμπί που πάει στο
// πουθενά είναι χειρότερο από κουμπί που λείπει: ο χρήστης νομίζει ότι
// ακύρωσε.
import { readPortalUrl, portalUrlOf, API_KEY_ENV } from './lemonPortal'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } }

const PORTAL = 'https://propertyos.lemonsqueezy.com/billing?expires=1&signature=abc'
const reply = (url: unknown) => ({ data: { attributes: { urls: { customer_portal: url } } } })

// ── Η ανάγνωση της απάντησης ──────────────────────────────────────────────
ok('ο σύνδεσμος βγαίνει από τα τέσσερα επίπεδα', readPortalUrl(reply(PORTAL)) === PORTAL)
ok('τα κενά κόβονται', readPortalUrl(reply('  ' + PORTAL + '  ')) === PORTAL)
// ΚΑΘΕ ΕΠΙΠΕΔΟ ΜΠΟΡΕΙ ΝΑ ΛΕΙΠΕΙ, και ένα `undefined` που φτάνει στην οθόνη ως
// σύνδεσμος γίνεται κουμπί που πάει στο πουθενά.
ok('χωρίς data, τίποτα', readPortalUrl({}) === null)
ok('χωρίς attributes, τίποτα', readPortalUrl({ data: {} }) === null)
ok('χωρίς urls, τίποτα', readPortalUrl({ data: { attributes: {} } }) === null)
ok('χωρίς πύλη, τίποτα', readPortalUrl(reply(undefined)) === null)
ok('το κενό και το άκυρο, τίποτα',
  readPortalUrl(null) === null && readPortalUrl('κείμενο') === null && readPortalUrl(reply(42)) === null)
// ΜΟΝΟ `https://`. Ο σύνδεσμος καταλήγει σε `window.location.href` του
// περιηγητή· χωρίς τον έλεγχο, μια απάντηση που δεν είναι αυτή που περιμέναμε
// γίνεται ανοιχτή ανακατεύθυνση ή `javascript:`.
ok('το javascript: δεν περνά', readPortalUrl(reply('javascript:alert(1)')) === null)
ok('το http:// δεν περνά', readPortalUrl(reply('http://propertyos.lemonsqueezy.com/billing')) === null)
ok('η σχετική διαδρομή δεν περνά', readPortalUrl(reply('/billing')) === null)
ok('το κενό κείμενο δεν περνά', readPortalUrl(reply('   ')) === null)

// ── Το αίτημα ─────────────────────────────────────────────────────────────
ok('το όνομα της μεταβλητής γράφεται μία φορά', API_KEY_ENV === 'LEMON_SQUEEZY_API_KEY')

async function asyncChecks() {
  {
    const seen: { url: string; init?: RequestInit }[] = []
    const fake = (async (url: string, init?: RequestInit) => {
      seen.push({ url, init })
      return { ok: true, status: 200, json: async () => reply(PORTAL) } as unknown as Response
    }) as unknown as typeof fetch
    const out = await portalUrlOf('sub_42', 'κλειδί', fake)
    ok('ο σύνδεσμος επιστρέφεται', out.url === PORTAL && out.error === '')
    ok('ρωτιέται η ΣΥΓΚΕΚΡΙΜΕΝΗ συνδρομή', seen[0].url.endsWith('/v1/subscriptions/sub_42'))
    // ΤΟ ΚΛΕΙΔΙ ΤΑΞΙΔΕΥΕΙ ΩΣ ΚΕΦΑΛΙΔΑ, ΟΧΙ ΩΣ ΠΑΡΑΜΕΤΡΟΣ: στη διεύθυνση θα
    // κατέληγε σε αρχεία καταγραφής ενδιάμεσων.
    const headers = seen[0].init?.headers as Record<string, string>
    ok('το κλειδί πάει σε κεφαλίδα', headers.Authorization === 'Bearer κλειδί' && !seen[0].url.includes('κλειδί'))
    ok('η απάντηση δεν έρχεται από κρυφή μνήμη', seen[0].init?.cache === 'no-store')
  }
  {
    // ΤΟ ΑΝΑΓΝΩΡΙΣΤΙΚΟ ΞΕΦΕΥΓΕΙ. Δεν έρχεται από το αίτημα, αλλά ένα «../»
    // στη βάση δεν πρέπει να μπορεί να αλλάξει τη διαδρομή του API.
    const seen: string[] = []
    const fake = (async (url: string) => {
      seen.push(url)
      return { ok: true, status: 200, json: async () => reply(PORTAL) } as unknown as Response
    }) as unknown as typeof fetch
    await portalUrlOf('../orders/9', 'κ', fake)
    ok('το αναγνωριστικό δεν αλλάζει διαδρομή', !seen[0].includes('/orders/'))
  }
  {
    const fake = (async () => ({ ok: false, status: 404, json: async () => ({}) } as unknown as Response)) as unknown as typeof fetch
    const out = await portalUrlOf('sub_1', 'κ', fake)
    ok('η άρνηση του εμπόρου λέγεται', out.url === null && out.error.includes('404'))
  }
  {
    const fake = (async () => { throw new Error('δίκτυο') }) as unknown as typeof fetch
    const out = await portalUrlOf('sub_1', 'κ', fake)
    ok('το πεσμένο δίκτυο δεν πετάει έξω', out.url === null && out.error === 'δίκτυο')
  }
  {
    // Απάντηση χωρίς πύλη: ΔΕΝ είναι σφάλμα, είναι «δεν υπάρχει σύνδεσμος».
    const fake = (async () => ({ ok: true, status: 200, json: async () => reply(undefined) } as unknown as Response)) as unknown as typeof fetch
    const out = await portalUrlOf('sub_1', 'κ', fake)
    ok('απάντηση χωρίς πύλη δεν είναι σφάλμα', out.url === null && out.error === '')
  }
}

asyncChecks().then(() => {
  console.log(fail === 0 ? `✓ lemonPortal: ${pass} έλεγχοι πέρασαν` : `✗ lemonPortal: ${fail} απέτυχαν από ${pass + fail}`)
  if (fail > 0) process.exit(1)
})
