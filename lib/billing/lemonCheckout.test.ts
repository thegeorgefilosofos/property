// npx tsx lib/billing/lemonCheckout.test.ts
//
// ΕΔΩ ΚΡΙΝΕΤΑΙ ΤΙ ΑΓΟΡΑΖΕΙ Ο ΠΕΛΑΤΗΣ ΚΑΙ ΜΕ ΤΙ ΟΡΟΥΣ.
// Το σώμα του αιτήματος καθορίζει την παραλλαγή, τη δοκιμή, τον κωδικό και τον
// λογαριασμό στον οποίο θα προσγειωθεί η πληρωμή. Ενα λάθος πεδίο εδώ δεν
// βγάζει σφάλμα: βγάζει χρέωση με άλλους όρους από αυτούς που είδε ο χρήστης.
import {
  checkoutIsLive, variantFor, variantKey, checkoutPayload, readCheckoutUrl, createCheckout,
} from './lemonCheckout'
import { apiConfigError, storeId } from './lemonApi'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } }

const LIVE = {
  LEMON_SQUEEZY_API_KEY: 'κλειδί',
  LEMON_STORE_ID: '12345',
  LEMON_VARIANTS: '811223:solo:monthly,811224:solo:annual,811225:owner:monthly',
}

// ── ΕΙΝΑΙ ΖΩΝΤΑΝΗ Η ΧΡΕΩΣΗ; ───────────────────────────────────────────────
// ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΘΕΡΑΠΕΥΕΤΑΙ: η προηγούμενη γραφή κοιτούσε ΜΟΝΟ τους συνδέσμους
// αγοράς. Με ξεχασμένο τον χάρτη παραλλαγών, το κουμπί ήταν ζωντανό, τα κείμενα
// έλεγαν «χρεώνουμε», και ο webhook απαντούσε 500 σε κάθε γεγονός: πληρωμένοι
// πελάτες χωρίς πακέτο, από την πρώτη εγγραφή.
ok('με τα τρία, ζωντανή', checkoutIsLive(LIVE))
ok('χωρίς κλειδί, όχι', !checkoutIsLive({ ...LIVE, LEMON_SQUEEZY_API_KEY: '' }))
ok('χωρίς κατάστημα, όχι', !checkoutIsLive({ ...LIVE, LEMON_STORE_ID: '' }))
ok('χωρίς παραλλαγές, όχι', !checkoutIsLive({ ...LIVE, LEMON_VARIANTS: '' }))
ok('χωρίς τίποτα, όχι', !checkoutIsLive({}))
// ΤΟ ΚΑΤΑΣΤΗΜΑ ΕΙΝΑΙ ΑΡΙΘΜΟΣ. Ενα αντιγραμμένο όνομα περνά αθόρυβα ως
// συμβολοσειρά και ο έμπορος απαντά 404 σε κάθε ταμείο.
ok('όνομα καταστήματος αντί για αριθμό δεν περνά',
  !checkoutIsLive({ ...LIVE, LEMON_STORE_ID: 'PropertyOS' }))
ok('και λέγεται ονομαστικά', apiConfigError({ ...LIVE, LEMON_STORE_ID: 'PropertyOS' }).includes('αριθμός'))
ok('η λείπουσα μεταβλητή λέγεται με το όνομά της',
  apiConfigError({}).includes('LEMON_SQUEEZY_API_KEY') && apiConfigError({}).includes('LEMON_STORE_ID'))
ok('το κατάστημα διαβάζεται καθαρό', storeId(LIVE) === '12345' && storeId({}) === '')

// ── Ο ΧΑΡΤΗΣ ΠΑΡΑΛΛΑΓΩΝ ───────────────────────────────────────────────────
ok('το κλειδί είναι πακέτο και κύκλος', variantKey('solo', 'annual') === 'solo:annual')
ok('η παραλλαγή βρίσκεται', variantFor(LIVE, 'solo', 'monthly') === '811223')
ok('και η ετήσια ξεχωριστά', variantFor(LIVE, 'solo', 'annual') === '811224')
ok('πακέτο χωρίς παραλλαγή δεν εφευρίσκεται', variantFor(LIVE, 'office', 'monthly') === '')
ok('άγνωστος κύκλος δεν μπαίνει στον χάρτη',
  variantFor({ LEMON_VARIANTS: '9:solo:weekly' }, 'solo', 'monthly') === '')

// ── ΤΟ ΣΩΜΑ ΤΟΥ ΑΙΤΗΜΑΤΟΣ ─────────────────────────────────────────────────
const wish = (over: Record<string, unknown> = {}) => ({
  storeId: '12345', variantId: '811223',
  buyer: { userId: 'u-1', email: 'a@b.gr', name: 'Γιώργος' },
  redirectUrl: 'https://property.gr/dashboard?checkout=ok',
  skipTrial: false,
  ...over,
});

type Body = { data: { attributes: Record<string, never>; relationships: Record<string, never> } }
const attrs = (w: Parameters<typeof checkoutPayload>[0]) =>
  (checkoutPayload(w) as unknown as Body).data.attributes as unknown as Record<string, Record<string, unknown>>
const rels = (w: Parameters<typeof checkoutPayload>[0]) =>
  (checkoutPayload(w) as unknown as Body).data.relationships as unknown as Record<string, { data: { id: string; type: string } }>

{
  const a = attrs(wish()), r = rels(wish())
  ok('το κατάστημα και η παραλλαγή πάνε στις σχέσεις',
    r.store.data.id === '12345' && r.store.data.type === 'stores'
    && r.variant.data.id === '811223' && r.variant.data.type === 'variants')
  // ΤΟ `user_id` ΕΙΝΑΙ Ο ΜΟΝΟΣ ΣΥΝΔΕΣΜΟΣ ΤΗΣ ΠΛΗΡΩΜΗΣ ΜΕ ΤΟΝ ΛΟΓΑΡΙΑΣΜΟ:
  // χωρίς αυτό, ο webhook δεν ξέρει ποιος πλήρωσε και η συνδρομή δεν
  // προσγειώνεται πουθενά.
  ok('ο λογαριασμός ταξιδεύει ως custom data',
    (a.checkout_data.custom as Record<string, string>).user_id === 'u-1')
  ok('το ταχυδρομείο και το όνομα προσυμπληρώνονται',
    a.checkout_data.email === 'a@b.gr' && a.checkout_data.name === 'Γιώργος')
  // ΜΟΝΟ Η ΠΑΡΑΛΛΑΓΗ ΠΟΥ ΔΙΑΛΕΧΤΗΚΕ. Αλλιώς το ταμείο δείχνει επιλογέα με όλες
  // τις παραλλαγές: ο πελάτης που πάτησε «ετήσια» φεύγει με μηνιαία.
  ok('κλειδώνεται η μία παραλλαγή',
    JSON.stringify(a.product_options.enabled_variants) === '["811223"]')
  ok('ο πελάτης γυρίζει πίσω', a.product_options.redirect_url === 'https://property.gr/dashboard?checkout=ok')
  ok('το ταμείο δεν είναι ενσωματωμένο', a.checkout_options.embed === false)
}
// ── Η ΔΟΚΙΜΗ ΕΙΝΑΙ ΜΙΑ ΑΝΑ ΛΟΓΑΡΙΑΣΜΟ ────────────────────────────────────
// Χωρίς αυτή τη σημαία, ακύρωση τη δεύτερη ημέρα και ένα νέο πάτημα δίνουν
// καθαρές 30 ημέρες, ίδιος λογαριασμός, ίδια κάρτα, επ' άπειρον.
ok('πρώτη συνδρομή: με δοκιμή', attrs(wish()).checkout_options.skip_trial === false)
ok('δεύτερη συνδρομή: χωρίς δοκιμή', attrs(wish({ skipTrial: true })).checkout_options.skip_trial === true)
// ── ΚΩΔΙΚΟΣ, ΛΗΞΗ, ΔΟΚΙΜΑΣΤΙΚΗ ΛΕΙΤΟΥΡΓΙΑ ────────────────────────────────
ok('χωρίς κωδικό δεν μπαίνει κενό πεδίο', attrs(wish()).checkout_data.discount_code === undefined)
ok('ο κωδικός ταξιδεύει όταν υπάρχει',
  attrs(wish({ discountCode: 'ΔΟΚΙΜΗ' })).checkout_data.discount_code === 'ΔΟΚΙΜΗ')
const expiry = (w: Parameters<typeof checkoutPayload>[0]) => attrs(w).expires_at as unknown as string | undefined
ok('χωρίς λήξη δεν μπαίνει κενό πεδίο', expiry(wish()) === undefined)
ok('η λήξη ταξιδεύει', expiry(wish({ expiresAt: '2026-08-20T12:00:00.000Z' })) === '2026-08-20T12:00:00.000Z')
ok('χωρίς email δεν μπαίνει κενή τιμή',
  attrs(wish({ buyer: { userId: 'u-1' } })).checkout_data.email === undefined)

// ── Η ΑΝΑΓΝΩΣΗ ΤΗΣ ΑΠΑΝΤΗΣΗΣ ──────────────────────────────────────────────
const reply = (url: unknown) => ({ data: { attributes: { url } } })
const URL_OK = 'https://propertyos.lemonsqueezy.com/checkout/custom/abc'
ok('η διεύθυνση βγαίνει', readCheckoutUrl(reply(URL_OK)) === URL_OK)
ok('χωρίς data, τίποτα', readCheckoutUrl({}) === null && readCheckoutUrl(null) === null)
ok('χωρίς url, τίποτα', readCheckoutUrl(reply(undefined)) === null)
// Ο σύνδεσμος καταλήγει σε `window.location.href`: χωρίς τον έλεγχο, μια
// απάντηση που δεν είναι αυτή που περιμέναμε γίνεται ανοιχτή ανακατεύθυνση.
ok('το javascript: δεν περνά', readCheckoutUrl(reply('javascript:alert(1)')) === null)
ok('το http:// δεν περνά', readCheckoutUrl(reply('http://propertyos.lemonsqueezy.com/x')) === null)
ok('η σχετική διαδρομή δεν περνά', readCheckoutUrl(reply('/checkout/x')) === null)

async function asyncChecks() {
  {
    const seen: { url: string; init?: RequestInit }[] = []
    const fake = (async (url: string, init?: RequestInit) => {
      seen.push({ url, init })
      return { ok: true, status: 200, json: async () => reply(URL_OK) } as unknown as Response
    }) as unknown as typeof fetch
    const out = await createCheckout(wish(), 'κλειδί', fake)
    ok('το ταμείο ανοίγει', out.url === URL_OK && out.error === '')
    ok('με POST στο σωστό endpoint',
      seen[0].init?.method === 'POST' && seen[0].url.endsWith('/v1/checkouts'))
    const h = seen[0].init?.headers as Record<string, string>
    // ΤΟ ΚΛΕΙΔΙ ΤΑΞΙΔΕΥΕΙ ΩΣ ΚΕΦΑΛΙΔΑ: οι διευθύνσεις καταλήγουν σε αρχεία
    // καταγραφής ενδιάμεσων και σε αναφορές σφαλμάτων.
    ok('το κλειδί πάει σε κεφαλίδα', h.Authorization === 'Bearer κλειδί' && !seen[0].url.includes('κλειδί'))
    ok('με τον τύπο του JSON:API', h['Content-Type'] === 'application/vnd.api+json')
  }
  {
    // ΤΟ ΣΩΜΑ ΤΟΥ ΣΦΑΛΜΑΤΟΣ ΛΕΕΙ ΠΟΙΟ ΠΕΔΙΟ ΕΦΤΑΙΞΕ. Χωρίς αυτό, ένα 422 σε
    // ρύθμιση οκτώ παραλλαγών είναι κυνήγι στα τυφλά.
    const fake = (async () => ({
      ok: false, status: 422, text: async () => '{"errors":[{"detail":"variant not found"}]}',
    } as unknown as Response)) as unknown as typeof fetch
    const out = await createCheckout(wish(), 'κ', fake)
    ok('η άρνηση του εμπόρου λέει και το γιατί',
      out.url === null && out.error.includes('422') && out.error.includes('variant not found'))
  }
  {
    const fake = (async () => { throw new Error('δίκτυο') }) as unknown as typeof fetch
    const out = await createCheckout(wish(), 'κ', fake)
    ok('το πεσμένο δίκτυο δεν πετάει έξω', out.url === null && out.error === 'δίκτυο')
  }
}

asyncChecks().then(() => {
  console.log(fail === 0 ? `✓ lemonCheckout: ${pass} έλεγχοι πέρασαν` : `✗ lemonCheckout: ${fail} απέτυχαν από ${pass + fail}`)
  if (fail > 0) process.exit(1)
})
