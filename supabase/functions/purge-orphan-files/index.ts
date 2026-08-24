// ═══════════════════════════════════════════════════════════════════════════
// purge-orphan-files — σβήνει τα αρχεία σβησμένων λογαριασμών
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΥΠΑΡΧΕΙ. Η Postgres ΔΕΝ επιτρέπεται να σβήσει αρχείο: η Supabase το
// απαγορεύει με σκανδάλη και το λέει καθαρά, «Direct deletion from storage
// tables is not allowed. Use the Storage API instead» (42501). Οσο η
// `erase_account` προσπαθούσε, κάθε αρχείο διαγραμμένου λογαριασμού έμενε πίσω
// για πάντα, και η οθόνη έλεγε «διαγράφηκαν».
//
// Η αυτοδιαγραφή τα σβήνει πλέον μόνη της, από τη /api/account/delete, με τη
// συνεδρία του ίδιου του ανθρώπου. Ο ΑΥΤΟΜΑΤΟΣ καθαρισμός όμως τρέχει ολόκληρος
// μέσα στο pg_cron, όπου δεν υπάρχει API αποθήκευσης. Εκεί η `erase_account`
// γράφει τα ονόματα στην `storage_purge_queue`, και τη στραγγίζει αυτή εδώ.
//
// ΜΕ ΡΟΛΟ ΥΠΗΡΕΣΙΑΣ, ΚΑΙ ΑΥΤΟ ΕΙΝΑΙ ΣΩΣΤΟ ΕΔΩ. Ο λογαριασμός έχει ήδη σβηστεί
// όταν φτάνει η γραμμή στην ουρά: δεν υπάρχει συνεδρία να ρωτηθεί, και οι
// πολιτικές των κάδων ρωτούν πίνακες που έχουν αδειάσει. Η ουρά είναι η μόνη
// είσοδος, και τη γράφει μόνο η SECURITY DEFINER της διαγραφής.
//
// ΠΕΝΤΕ ΑΠΟΤΥΧΙΕΣ ΚΑΙ ΤΟ ΑΡΧΕΙΟ ΒΓΑΙΝΕΙ ΑΠΟ ΤΗ ΣΕΙΡΑ. Χωρίς αυτό, ένα όνομα
// που αρνείται για πάντα μονοπωλεί κάθε πέρασμα και κρατά πίσω του όλα τα άλλα.
// Το `last_error` μένει γραμμένο, ώστε να φαίνεται τι ήταν.
//
// Deploy: supabase functions deploy purge-orphan-files
// ═══════════════════════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2.110.8'
import { authorizeCron } from '../_shared/auth.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('LIFECYCLE_CRON_SECRET') || ''

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

type Row = { id: number; bucket_id: string; name: string }

/** Ομαδοποίηση ανά κάδο: το API αποθήκευσης δουλεύει με έναν κάδο τη φορά. */
function byBucket(rows: readonly Row[]): Map<string, Row[]> {
  const map = new Map<string, Row[]>()
  for (const r of rows) {
    const list = map.get(r.bucket_id)
    if (list) list.push(r)
    else map.set(r.bucket_id, [r])
  }
  return map
}

Deno.serve(async (req) => {
  if (!(await authorizeCron(req, { serviceKey: SERVICE_KEY, envSecret: CRON_SECRET, supabase })))
    return json({ error: 'unauthorized' }, 401)

  const { data, error } = await supabase.rpc('storage_purge_batch', { p_limit: 200 })
  if (error) return json({ error: error.message }, 502)

  const rows = (data ?? []) as Row[]
  if (rows.length === 0) return json({ deleted: 0, failed: 0 })

  let deleted = 0
  let failed = 0
  for (const [bucket, batch] of byBucket(rows)) {
    const { error: rmError } = await supabase.storage.from(bucket).remove(batch.map(r => r.name))
    const ids = batch.map(r => r.id)
    if (rmError) {
      failed += batch.length
      await supabase.rpc('storage_purge_done', { p_ids: ids, p_error: rmError.message })
      continue
    }
    deleted += batch.length
    await supabase.rpc('storage_purge_done', { p_ids: ids, p_error: null })
  }
  return json({ deleted, failed })
})
