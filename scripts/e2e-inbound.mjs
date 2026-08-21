#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
//  Η ΠΟΡΤΑ ΤΟΥ ΤΑΧΥΔΡΟΜΕΙΟΥ, ΔΟΚΙΜΑΣΜΕΝΗ ΣΕ ΠΡΑΓΜΑΤΙΚΟ ΔΙΑΚΟΜΙΣΤΗ
// ─────────────────────────────────────────────────────────────────────────
//  ΤΙ ΠΡΟΣΘΕΤΕΙ ΠΑΝΩ ΑΠΟ ΤΙΣ ΜΟΝΑΔΙΑΙΕΣ ΔΟΚΙΜΕΣ. Εκείνες ελέγχουν τις
//  συναρτήσεις. Εδώ ελέγχεται ότι η ΔΙΑΔΡΟΜΗ υπάρχει, ότι ο διαμεσολαβητής δεν
//  τη στέλνει σε φόρμα εισόδου, και ότι απαντά αυτό που λέει ότι απαντά — σε
//  διακομιστή που τρέχει, με το πραγματικό runtime.
//
//  ΤΟ ΚΡΙΣΙΜΟ ΕΙΝΑΙ ΤΟ ΠΡΩΤΟ: μια διαδρομή webhook που παίρνει 307 προς τη
//  σύνδεση δεν φαίνεται πουθενά ως σφάλμα. Απλώς δεν φτάνει ποτέ τίποτα.
//
//  ΧΡΗΣΗ:
//     E2E_INBOUND_SECRET=whsec_… node scripts/e2e-inbound.mjs
//  με τον διακομιστή να τρέχει με ΤΟ ΙΔΙΟ `RESEND_WEBHOOK_SECRET`. Χωρίς τη
//  μεταβλητή, τρέχουν μόνο οι έλεγχοι που δεν χρειάζονται μυστικό.
// ═══════════════════════════════════════════════════════════════════════════
import { createHmac } from 'node:crypto'

const B = process.env.E2E_BASE || 'http://localhost:3000'
const URL_ = B + '/api/inbound'
const SECRET = process.env.E2E_INBOUND_SECRET || ''

let pass = 0, fail = 0
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n) } }

const keyOf = s => Buffer.from(s.replace(/^whsec_/, ''), 'base64')

/** Οι κεφαλίδες μιας γνήσιας παράδοσης, όπως τις γράφει ο πάροχος. */
function signed(body, { id = 'msg_e2e', driftSeconds = 0 } = {}) {
  const ts = String(Math.floor(Date.now() / 1000) + driftSeconds)
  const sig = createHmac('sha256', keyOf(SECRET)).update(`${id}.${ts}.${body}`, 'utf8').digest('base64')
  return { 'content-type': 'application/json', 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': `v1,${sig}` }
}

const post = (body, headers) => fetch(URL_, { method: 'POST', headers: headers || { 'content-type': 'application/json' }, body, redirect: 'manual' })

const received = (over = {}) => JSON.stringify({
  type: 'email.received',
  created_at: '2026-08-21T09:12:00.000Z',
  data: {
    email_id: 'e2e-' + Math.random().toString(16).slice(2),
    from: 'ΔΕΗ <no-reply@example.com>',
    to: ['a3f19c7d0b2e4681@propertyos.gr'],
    cc: [], bcc: [], received_for: [],
    message_id: '<e2e@mail>', subject: 'Λογαριασμός ρεύματος', attachments: [],
    ...over,
  },
})

// ── Ο ΔΙΑΜΕΣΟΛΑΒΗΤΗΣ ΔΕΝ ΤΗΝ ΑΓΓΙΖΕΙ ──────────────────────────────────────
{
  const r = await post('{}')
  ok('η διαδρομή απαντά η ίδια, χωρίς ανακατεύθυνση σε σύνδεση', r.status !== 307 && r.status !== 302)
  ok('χωρίς υπογραφή, 401 και τίποτα άλλο', r.status === 401)
  const body = await r.json().catch(() => ({}))
  ok('η απάντηση δεν λέει ΓΙΑΤΙ απέτυχε ο έλεγχος', JSON.stringify(body) === '{"error":"unauthorized"}')
}
{
  const r = await post('{}', { 'content-type': 'application/json', 'webhook-id': 'x', 'webhook-timestamp': String(Math.floor(Date.now() / 1000)), 'webhook-signature': 'v1,YWJj' })
  ok('πλαστή υπογραφή, 401', r.status === 401)
}
{
  const r = await fetch(URL_, { method: 'GET', redirect: 'manual' })
  ok('το GET δεν σερβίρεται ως σελίδα', r.status === 405 || r.status === 404)
}

// ── ΜΕ ΤΟ ΜΥΣΤΙΚΟ: ΟΙ ΑΠΑΝΤΗΣΕΙΣ ΠΟΥ ΥΠΟΣΧΕΤΑΙ Η ΤΕΚΜΗΡΙΩΣΗ ───────────────
if (!SECRET) {
  console.log('  (χωρίς E2E_INBOUND_SECRET: οι υπογεγραμμένοι έλεγχοι παραλείφθηκαν)')
} else {
  {
    const body = JSON.stringify({ type: 'email.delivered', data: { email_id: 'x' } })
    const r = await post(body, signed(body))
    ok('γεγονός που δεν μας αφορά παίρνει 200', r.status === 200)
  }
  {
    const body = JSON.stringify({ type: 'email.received', data: { subject: 'χωρίς αναγνωριστικό' } })
    const r = await post(body, signed(body))
    ok('ΓΕΓΟΝΟΣ ΠΑΡΑΛΑΒΗΣ ΠΟΥ ΔΕΝ ΔΙΑΒΑΣΤΗΚΕ ΠΑΙΡΝΕΙ 422, ώστε να φανεί στον πίνακα του παρόχου', r.status === 422)
  }
  {
    const body = 'δεν είναι JSON'
    const r = await post(body, signed(body))
    ok('σώμα που δεν είναι JSON παίρνει 400', r.status === 400)
  }
  {
    const body = received()
    const r = await post(body, signed(body, { driftSeconds: -3600 }))
    ok('ΜΙΑ ΩΡΑ ΠΑΛΙΑ ΥΠΟΓΡΑΦΗ ΔΕΝ ΞΑΝΑΠΑΙΖΕΤΑΙ', r.status === 401)
  }
  {
    const body = received()
    const r = await post(body, signed(body))
    const domain = process.env.NEXT_PUBLIC_INBOUND_DOMAIN || ''
    if (!domain) {
      ok('ΧΩΡΙΣ ΡΥΘΜΙΣΜΕΝΟ ΤΟΜΕΑ ΤΟ ΛΕΕΙ ΜΕ 500, δεν καταπίνει το μήνυμα', r.status === 500)
      const b = await r.json().catch(() => ({}))
      ok('και ο κωδικός λέει «δεν ρυθμίστηκε»', b.error === 'not_configured')
    } else {
      ok('με ρυθμισμένο τομέα, το γεγονός γίνεται δεκτό', r.status === 200 || r.status === 502)
    }
  }
  {
    const body = received({ to: ['info@propertyos.gr'], received_for: [] })
    const r = await post(body, signed(body))
    ok('μήνυμα σε ανθρώπινη διεύθυνση δεν είναι σφάλμα', r.status === 200 || r.status === 500)
  }
}

console.log(`\n/api/inbound — ${pass} πέρασαν, ${fail} απέτυχαν`)
if (fail) process.exit(1)
