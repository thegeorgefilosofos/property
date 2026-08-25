// npx tsx lib/billing/lemonPlanChange.test.ts
//
// ΕΔΩ ΚΡΙΝΕΤΑΙ ΑΝ Η ΚΑΡΤΑ ΧΡΕΩΝΕΤΑΙ ΣΗΜΕΡΑ Η ΤΗΝ ΕΠΟΜΕΝΗ ΑΝΑΝΕΩΣΗ.
// Ενα «invoice_immediately» σε υποβάθμιση εκδίδει πιστωτικό που δεν
// υποσχεθήκαμε· ένα «disable_prorations» σε αναβάθμιση δίνει ακριβότερο πακέτο
// δωρεάν ώς την ανανέωση. Καμία από τις δύο δεν βγάζει σφάλμα πουθενά.
import {
  classifyChange, planDrops, changePayload, readSubscriptionState, changePlan, subscriptionState,
  cancelSubscription, needsCancelling,
} from './lemonPlanChange'
import type { PlanId, BillingCycle } from './plans'

/** Συντομογραφία: «owner/annual» → σημείο. */
const at = (plan: PlanId, cycle: BillingCycle = 'monthly') => ({ plan, cycle })

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } }

// ── ΑΝΕΒΑΙΝΕΙ Η ΚΑΤΕΒΑΙΝΕΙ; ───────────────────────────────────────────────
ok('solo → owner ανεβαίνει', classifyChange(at('solo'), at('owner')) === 'upgrade')
ok('owner → agency ανεβαίνει', classifyChange(at('owner'), at('agency')) === 'upgrade')
ok('agency → office ανεβαίνει', classifyChange(at('agency'), at('office')) === 'upgrade')
ok('office → solo κατεβαίνει', classifyChange(at('office'), at('solo')) === 'downgrade')
ok('owner → solo κατεβαίνει', classifyChange(at('owner'), at('solo')) === 'downgrade')
ok('ίδιο πακέτο και κύκλος δεν είναι αλλαγή', classifyChange(at('owner'), at('owner')) === 'same')
ok('από το «χωρίς συνδρομή» κάθε πακέτο είναι αναβάθμιση', classifyChange(at('free'), at('solo')) === 'upgrade')

// Η ΣΕΙΡΑ ΔΕΝ ΒΓΑΙΝΕΙ ΑΠΟ ΤΗΝ ΤΙΜΗ. Ο ετήσιος «Ιδιοκτήτης» (42,90 €) κοστίζει
// περισσότερο από τον μηνιαίο «Ιδιοκτήτη+» (9,90 €) και όμως δίνει λιγότερα.
ok('το πακέτο κυριαρχεί του κύκλου', classifyChange(at('solo', 'annual'), at('owner', 'monthly')) === 'upgrade')
ok('και προς την άλλη κατεύθυνση', classifyChange(at('owner', 'monthly'), at('solo', 'annual')) === 'downgrade')

// Ο ΚΥΚΛΟΣ ΛΥΝΕΙ ΤΗΝ ΙΣΟΠΑΛΙΑ, ΓΙΑΤΙ ΕΙΝΑΙ ΧΡΗΜΑΤΑ. Χωρίς αυτό, η μετάβαση σε
// ετήσια θα περνούσε ως «τίποτα δεν άλλαξε» και ο πελάτης θα έμενε στη μηνιαία.
ok('μηνιαία → ετήσια ανεβαίνει', classifyChange(at('owner'), at('owner', 'annual')) === 'upgrade')
ok('ετήσια → μηνιαία κατεβαίνει', classifyChange(at('owner', 'annual'), at('owner')) === 'downgrade')

// ── ΚΑΙ ΤΙ ΚΡΑΤΙΕΤΑΙ ─────────────────────────────────────────────────────
ok('η πτώση πακέτου κρατά', planDrops(at('agency'), at('solo')) === true)
ok('η αλλαγή κύκλου δεν κρατά τίποτα', planDrops(at('owner', 'annual'), at('owner')) === false)
ok('η αναβάθμιση δεν κρατά τίποτα', planDrops(at('solo'), at('agency')) === false)

// ── ΤΟ ΣΩΜΑ ΤΗΣ ΑΝΑΒΑΘΜΙΣΗΣ ──────────────────────────────────────────────
{
  const body = changePayload({ subscriptionId: '99', variantId: '811225', kind: 'upgrade', onTrial: false })
  const data = body.data as { type: string; id: string; attributes: Record<string, unknown> }
  ok('τύπος JSON:API', data.type === 'subscriptions')
  ok('το αναγνωριστικό ταξιδεύει ως κείμενο', data.id === '99')
  ok('η παραλλαγή είναι αριθμός', data.attributes.variant_id === 811225)
  ok('η αναβάθμιση τιμολογείται αμέσως', data.attributes.invoice_immediately === true)
  ok('η αναβάθμιση ΔΕΝ ακυρώνει την αναλογία', data.attributes.disable_prorations === undefined)
  ok('χωρίς δοκιμή, καμία ημερομηνία δοκιμής', data.attributes.trial_ends_at === undefined)
}

// ── ΤΟ ΣΩΜΑ ΤΗΣ ΥΠΟΒΑΘΜΙΣΗΣ ──────────────────────────────────────────────
{
  const body = changePayload({ subscriptionId: '99', variantId: '811223', kind: 'downgrade', onTrial: false })
  const attrs = (body.data as { attributes: Record<string, unknown> }).attributes
  ok('η υποβάθμιση δεν επιστρέφει χρήματα', attrs.disable_prorations === true)
  ok('η υποβάθμιση δεν τιμολογείται σήμερα', attrs.invoice_immediately === undefined)
  ok('η παραλλαγή αλλάζει κανονικά', attrs.variant_id === 811223)
}

// ── ΜΕΣΑ ΣΤΗ ΔΟΚΙΜΗ, ΤΙΠΟΤΑ ΔΕΝ ΧΡΕΩΝΕΤΑΙ ───────────────────────────────
{
  const body = changePayload({
    subscriptionId: '99', variantId: '811225', kind: 'upgrade',
    onTrial: true, trialEndsAt: '2026-09-19T10:00:00.000000Z',
  })
  const attrs = (body.data as { attributes: Record<string, unknown> }).attributes
  ok('αναβάθμιση σε δοκιμή δεν χρεώνει σήμερα', attrs.invoice_immediately === undefined)
  ok('αναβάθμιση σε δοκιμή ακυρώνει την αναλογία', attrs.disable_prorations === true)
  ok('η λήξη της δοκιμής καρφώνεται', attrs.trial_ends_at === '2026-09-19T10:00:00.000000Z')
}
{
  const body = changePayload({ subscriptionId: '99', variantId: '811223', kind: 'downgrade', onTrial: true, trialEndsAt: '  ' })
  const attrs = (body.data as { attributes: Record<string, unknown> }).attributes
  ok('κενή ημερομηνία δοκιμής δεν στέλνεται', attrs.trial_ends_at === undefined)
  ok('υποβάθμιση σε δοκιμή, καμία αναλογία', attrs.disable_prorations === true)
}

// ── ΠΟΙΑ ΣΥΝΔΡΟΜΗ ΕΧΕΙ ΝΟΗΜΑ ΝΑ ΑΚΥΡΩΘΕΙ ────────────────────────────────
// Οποια ΔΕΝ έχει τελειώσει. Μια ήδη ακυρωμένη θα έβγαζε σφάλμα από τον
// έμπορο και ο καλών θα το διάβαζε ως «η ακύρωση δεν έγινε»: θα μπλόκαρε
// διαγραφή λογαριασμού που δεν είχε κανέναν λόγο να μπλοκαριστεί.
ok('η δοκιμή ακυρώνεται', needsCancelling('on_trial') === true)
ok('η ενεργή ακυρώνεται', needsCancelling('active') === true)
ok('η ξαναδοκιμαζόμενη ακυρώνεται', needsCancelling('past_due') === true)
ok('η παγωμένη ακυρώνεται', needsCancelling('paused') === true)
ok('η απλήρωτη ακυρώνεται', needsCancelling('unpaid') === true)
ok('η ήδη ακυρωμένη δεν ξαναακυρώνεται', needsCancelling('cancelled') === false)
ok('η ληγμένη δεν ακυρώνεται', needsCancelling('expired') === false)
ok('χωρίς κατάσταση, τίποτα να ακυρωθεί', needsCancelling(null) === false)

// ── Η ΑΝΑΓΝΩΣΗ ΤΗΣ ΑΠΑΝΤΗΣΗΣ ─────────────────────────────────────────────
{
  const s = readSubscriptionState({ data: { attributes: {
    status: 'on_trial', variant_id: 811225,
    renews_at: '2026-09-19T10:00:00.000000Z', trial_ends_at: '2026-09-19T10:00:00.000000Z',
  } } })
  ok('η κατάσταση διαβάζεται', s.status === 'on_trial')
  ok('η παραλλαγή γίνεται κείμενο', s.variantId === '811225')
  ok('η ανανέωση διαβάζεται', s.renewsAt === '2026-09-19T10:00:00.000000Z')
  ok('η λήξη δοκιμής διαβάζεται', s.trialEndsAt === '2026-09-19T10:00:00.000000Z')
}
{
  const s = readSubscriptionState({ data: { attributes: { status: 'ενεργή', variant_id: null, renews_at: '', trial_ends_at: null } } })
  ok('άγνωστη κατάσταση δεν ερμηνεύεται', s.status === null)
  ok('κενή παραλλαγή γίνεται null', s.variantId === null)
  ok('κενή ανανέωση γίνεται null', s.renewsAt === null)
}
{
  const s = readSubscriptionState(null)
  ok('κενή απάντηση δεν σκάει', s.status === null && s.renewsAt === null)
  const t = readSubscriptionState({})
  ok('απάντηση χωρίς data δεν σκάει', t.status === null && t.variantId === null)
}

async function asyncChecks() {
  // ── Η ΠΑΡΑΛΛΑΓΗ ΠΟΥ ΔΕΝ ΕΙΝΑΙ ΑΡΙΘΜΟΣ ΔΕΝ ΦΤΑΝΕΙ ΠΟΤΕ ΣΤΟ ΔΙΚΤΥΟ ──────
  {
    let called = false
    const out = await changePlan(
      { subscriptionId: '99', variantId: 'owner-monthly', kind: 'upgrade', onTrial: false },
      'κλειδί',
      (async () => { called = true; return new Response('{}') }) as unknown as typeof fetch,
    )
    ok('λάθος παραλλαγή σταματά πριν το αίτημα', !called && out.after === null && out.error.includes('owner-monthly'))
  }

  // ── ΤΟ ΑΙΤΗΜΑ ΠΑΕΙ ΜΕ PATCH, ΣΤΗ ΣΩΣΤΗ ΔΙΕΥΘΥΝΣΗ ──────────────────────
  {
    let seen: { url: string; init: RequestInit } | null = null
    const fake = (async (url: string, init: RequestInit) => {
      seen = { url, init }
      return new Response(JSON.stringify({ data: { attributes: { status: 'active', variant_id: 811225, renews_at: '2026-09-19T10:00:00.000000Z' } } }), { status: 200 })
    }) as unknown as typeof fetch
    const out = await changePlan({ subscriptionId: '99', variantId: '811225', kind: 'upgrade', onTrial: false }, 'κλειδί', fake)
    const call = seen as unknown as { url: string; init: RequestInit } | null
    ok('η διεύθυνση είναι της συνδρομής', call?.url === 'https://api.lemonsqueezy.com/v1/subscriptions/99')
    ok('η μέθοδος είναι PATCH', call?.init.method === 'PATCH')
    ok('το κλειδί ταξιδεύει ως κεφαλίδα', String((call?.init.headers as Record<string, string>)?.Authorization) === 'Bearer κλειδί')
    ok('η απάντηση διαβάζεται', out.error === '' && out.after?.status === 'active' && out.after?.variantId === '811225')
  }

  // ── ΤΟ ΣΦΑΛΜΑ ΤΟΥ ΕΜΠΟΡΟΥ ΕΠΙΣΤΡΕΦΕΤΑΙ, ΔΕΝ ΠΕΤΑΓΕΤΑΙ ────────────────
  {
    const fake = (async () => new Response('{"errors":[{"detail":"variant not found"}]}', { status: 422 })) as unknown as typeof fetch
    const out = await changePlan({ subscriptionId: '99', variantId: '811225', kind: 'downgrade', onTrial: false }, 'κλειδί', fake)
    ok('το 422 λέγεται', out.after === null && out.error.includes('422') && out.error.includes('variant not found'))
  }
  {
    const fake = (async () => { throw new Error('δίκτυο') }) as unknown as typeof fetch
    const out = await changePlan({ subscriptionId: '99', variantId: '811225', kind: 'upgrade', onTrial: false }, 'κλειδί', fake)
    ok('το πεσμένο δίκτυο δεν πετάει έξω', out.after === null && out.error === 'δίκτυο')
  }

  // ── Η ΑΚΥΡΩΣΗ ────────────────────────────────────────────────────────
  {
    let seen: { url: string; method: string } | null = null
    const fake = (async (url: string, init: RequestInit) => {
      seen = { url, method: String(init.method) }
      return new Response(JSON.stringify({ data: { attributes: { status: 'cancelled', variant_id: 1, renews_at: null, ends_at: 'X' } } }), { status: 200 })
    }) as unknown as typeof fetch
    const out = await cancelSubscription('99', 'κλειδί', fake)
    const call = seen as unknown as { url: string; method: string } | null
    ok('η ακύρωση είναι DELETE στη συνδρομή',
      call?.method === 'DELETE' && call?.url === 'https://api.lemonsqueezy.com/v1/subscriptions/99')
    ok('και διαβάζει την κατάσταση που γύρισε', out.error === '' && out.after?.status === 'cancelled')
  }
  {
    const fake = (async () => new Response('{"errors":[{"detail":"not found"}]}', { status: 404 })) as unknown as typeof fetch
    const out = await cancelSubscription('99', 'κλειδί', fake)
    ok('η αποτυχία ακύρωσης λέγεται', out.after === null && out.error.includes('404'))
  }

  // ── Η ΑΝΑΓΝΩΣΗ ΠΡΙΝ ΤΗΝ ΑΛΛΑΓΗ ────────────────────────────────────────
  {
    let method = 'άγνωστη'
    const fake = (async (_url: string, init: RequestInit) => {
      method = String(init.method)
      return new Response(JSON.stringify({ data: { attributes: { status: 'on_trial', variant_id: 1, renews_at: 'X', trial_ends_at: 'X' } } }), { status: 200 })
    }) as unknown as typeof fetch
    const out = await subscriptionState('99', 'κλειδί', fake)
    ok('η ανάγνωση είναι GET', method === 'GET')
    ok('η δοκιμή αναγνωρίζεται', out.after?.status === 'on_trial' && out.after?.trialEndsAt === 'X')
  }
}

asyncChecks().then(() => {
  console.log(fail === 0 ? `✓ lemonPlanChange: ${pass} έλεγχοι πέρασαν` : `✗ lemonPlanChange: ${fail} απέτυχαν από ${pass + fail}`)
  if (fail > 0) process.exit(1)
})
