// Τεστ για το στρώμα δεδομένων του ημερολογίου (lib/data/calendar.ts).
// Τρέξε: npx tsx lib/data/calendar.test.ts
//
// ΤΙ ΚΛΕΙΔΩΝΕΙ ΕΔΩ. Η ΣΕΙΡΑ των αιτημάτων του `replaceSource`: πρώτα γράφει τα
// νέα, μετά σβήνει τα παλιά. Ήταν ανάποδα σε δέκα σημεία, και μια αποτυχία
// δικτύου στη μέση άφηνε τον χρήστη με ημερολόγιο χωρίς τις δόσεις του δανείου.
// Το τεστ καταγράφει κάθε κλήση και ελέγχει τη σειρά — αν κάποιος τη γυρίσει
// πίσω «για απλότητα», σπάει εδώ και όχι στην οθόνη κάποιου.
import * as calendar from './calendar'

let passed = 0, failed = 0
const fails: string[] = []
const ok = (name: string, cond: boolean) => { if (cond) passed++; else { failed++; if (fails.length < 80) fails.push(name) } }

// ── Ψεύτικος πελάτης: καταγράφει τι ζητήθηκε, με ποια σειρά ─────────────────
interface Call { op: string; table: string; payload?: unknown; filters: [string, unknown][] }

function fakeDb(rows: { id: string }[] = [], failOn?: string) {
  const calls: Call[] = []
  const make = (op: string, table: string, payload?: unknown) => {
    const call: Call = { op, table, payload, filters: [] }
    calls.push(call)
    const result = failOn === op ? { data: null, error: { message: 'δίκτυο', code: 'X' } } : { data: op === 'select' ? rows : null, error: null }
    const builder: Record<string, unknown> = {
      then: (res: (v: unknown) => unknown) => Promise.resolve(result).then(res),
    }
    for (const f of ['eq', 'in', 'like', 'gte', 'lte', 'order', 'limit', 'select', 'maybeSingle', 'single']) {
      builder[f] = (a?: unknown, b?: unknown) => { call.filters.push([f, b ?? a]); return builder }
    }
    return builder
  }
  const db = {
    from: (table: string) => ({
      select: (cols?: string) => make('select', table, cols),
      insert: (payload: unknown) => make('insert', table, payload),
      update: (payload: unknown) => make('update', table, payload),
      delete: () => make('delete', table),
    }),
  }
  return { db: db as unknown as calendar.Db, calls }
}

const scope = { propertyId: 'p1', userId: 'u1' }
const draft: calendar.EventDraft = { title: 'Δόση', category: 'financial', event_date: '2026-09-01' }

// ── row(): τα σταθερά που ξεχνιούνται ───────────────────────────────────────
const r = calendar.row(scope, 'loan', draft)
ok('row: ακίνητο', r.property_id === 'p1')
ok('row: χρήστης', r.user_id === 'u1')
ok('row: πηγή από τη σφραγίδα', r.source === 'loan')
ok('row: κατάσταση εκκρεμής', r.status === 'pending')
ok('row: προτεραιότητα μεσαία', r.priority === 'medium')
ok('row: όχι επαναλαμβανόμενο', r.recurring === false)
ok('row: ποσό κενό, όχι μηδέν', r.amount === null)
ok('row: δική του πηγή υπερισχύει',
   calendar.row(scope, 'loan', { ...draft, source: 'booking:1:in' }).source === 'booking:1:in')

// ── canonicalCategory(): οι παλιές κατηγορίες ──────────────────────────────
ok('κανονική περνά ίδια', calendar.canonicalCategory('bills') === 'bills')
ok('rent_due γίνεται financial', calendar.canonicalCategory('rent_due') === 'financial')
ok('lease_end γίνεται contract', calendar.canonicalCategory('lease_end') === 'contract')
ok('insurance_renewal γίνεται contract', calendar.canonicalCategory('insurance_renewal') === 'contract')
ok('άγνωστη γίνεται reminder', calendar.canonicalCategory('φφφ') === 'reminder')
ok('κενή γίνεται reminder', calendar.canonicalCategory(null) === 'reminder')

// ── eventPriority(): ό,τι έρχεται από το δίκτυο ────────────────────────────
ok('high περνά', calendar.eventPriority('high') === 'high')
ok('urgent δεν υπάρχει, γίνεται medium', calendar.eventPriority('urgent') === 'medium')
ok('κενό γίνεται medium', calendar.eventPriority(undefined) === 'medium')

async function main() {
  // ── replaceSource(): Η ΣΕΙΡΑ ───────────────────────────────────────────────
  {
    const { db, calls } = fakeDb([{ id: 'old1' }, { id: 'old2' }])
    await calendar.replaceSource(db, scope, { source: 'loan' }, [draft, draft])
    const ops = calls.map(c => c.op)
    ok('replaceSource: τρία βήματα', ops.length === 3)
    ok('replaceSource: πρώτα διαβάζει τα παλιά', ops[0] === 'select')
    ok('replaceSource: ΜΕΤΑ γράφει τα νέα', ops[1] === 'insert')
    ok('replaceSource: ΤΕΛΕΥΤΑΙΑ σβήνει τα παλιά', ops[2] === 'delete')
    ok('replaceSource: σβήνει ΑΚΡΙΒΩΣ τα παλιά αναγνωριστικά',
       JSON.stringify(calls[2].filters.find(f => f[0] === 'in')?.[1]) === JSON.stringify(['old1', 'old2']))
    ok('replaceSource: όλα σε έναν πίνακα', calls.every(c => c.table === 'calendar_events'))
  }

  // Αν η εγγραφή αποτύχει, ΔΕΝ σβήνεται τίποτα: ο χρήστης μένει με διπλά, όχι με άδειο.
  {
    const { db, calls } = fakeDb([{ id: 'old1' }], 'insert')
    const { error } = await calendar.replaceSource(db, scope, { source: 'loan' }, [draft])
    ok('replaceSource: η αποτυχία εγγραφής επιστρέφεται', !!error)
    ok('replaceSource: καμία διαγραφή μετά από αποτυχία', !calls.some(c => c.op === 'delete'))
  }

  // Χωρίς νέα γεγονότα, το `clearSource` απλώς σβήνει.
  {
    const { db, calls } = fakeDb([{ id: 'old1' }])
    await calendar.clearSource(db, scope, { source: 'budget' })
    ok('clearSource: δεν γράφει τίποτα', !calls.some(c => c.op === 'insert'))
    ok('clearSource: σβήνει', calls.some(c => c.op === 'delete'))
  }

  // Καμία παλιά γραμμή: ούτε διαγραφή, δηλαδή ούτε άσκοπο αίτημα.
  {
    const { db, calls } = fakeDb([])
    await calendar.replaceSource(db, scope, { source: 'loan' }, [draft])
    ok('replaceSource: χωρίς παλιά, καμία διαγραφή', !calls.some(c => c.op === 'delete'))
  }

  // ── insert(): παρτίδες ─────────────────────────────────────────────────────
  {
    const { db, calls } = fakeDb()
    const many = Array.from({ length: 45 }, () => calendar.row(scope, 'loan', draft))
    await calendar.insert(db, many)
    const inserts = calls.filter(c => c.op === 'insert')
    ok('insert: 45 γραμμές σε τρεις παρτίδες', inserts.length === 3)
    ok('insert: πρώτη παρτίδα 20', (inserts[0].payload as unknown[]).length === calendar.BATCH)
    ok('insert: τελευταία παρτίδα 5', (inserts[2].payload as unknown[]).length === 5)
  }

  {
    const { db, calls } = fakeDb([], 'insert')
    const { error } = await calendar.insert(db, Array.from({ length: 45 }, () => calendar.row(scope, 'loan', draft)))
    ok('insert: σταματά στην πρώτη αποτυχία', !!error && calls.filter(c => c.op === 'insert').length === 1)
  }

  // ── upsertBySource(): δεν σβήνει ποτέ ──────────────────────────────────────
  {
    const { db, calls } = fakeDb([{ id: 'e1' }])
    await calendar.upsertBySource(db, scope, 'tenant:t1:', [{ ...draft, source: 'tenant:t1:rent_due' }])
    ok('upsertBySource: καμία διαγραφή', !calls.some(c => c.op === 'delete'))
    ok('upsertBySource: γράφει ό,τι λείπει', calls.some(c => c.op === 'insert'))
    ok('upsertBySource: χωρίς refresh δεν ενημερώνει', !calls.some(c => c.op === 'update'))
  }

  // ── remove(): ένα αίτημα για πολλά ─────────────────────────────────────────
  {
    const { db, calls } = fakeDb()
    await calendar.remove(db, ['a', 'b', 'c'])
    ok('remove: ένα και μόνο αίτημα για τρία', calls.filter(c => c.op === 'delete').length === 1)
    ok('remove: με φίλτρο in', calls[0].filters.some(f => f[0] === 'in'))
  }

}

// ── report ─────────────────────────────────────────────────────────────────
main().then(() => {
  console.log(`\ndata/calendar.ts — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`)
  if (failed) { console.log('FAILED:\n' + fails.map(f => '  ✗ ' + f).join('\n')); process.exit(1) }
  console.log('όλα πέρασαν')
})
