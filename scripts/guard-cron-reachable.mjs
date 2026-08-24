#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΜΙΑ ΣΥΝΑΡΤΗΣΗ ΠΟΥ ΤΗΝ ΚΑΛΕΙ ΧΡΟΝΟΜΕΤΡΟ ΔΕΝ ΕΠΙΤΡΕΠΕΤΑΙ ΝΑ ΖΗΤΑΕΙ JWT
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΣΦΑΛΜΑ, ΠΙΑΣΜΕΝΟ ΣΤΗΝ ΠΑΡΑΓΩΓΗ (24/08/2026). Η `purge-orphan-files`
// ανέβηκε και ήταν ACTIVE. Το χρονόμετρο ήταν στημένο. Ολα έδειχναν σωστά, και
// δεν επρόκειτο να δουλέψει ποτέ: στο supabase/config.toml έλειπε η δήλωσή της,
// άρα ίσχυσε η προεπιλογή `verify_jwt = true`. Το pg_cron καλεί με κεφαλίδα
// `x-cron-secret` και ΧΩΡΙΣ συνεδρία χρήστη, οπότε η πύλη της Supabase θα
// απαντούσε 401 πριν καν τρέξει μία γραμμή του κώδικα.
//
// ΓΙΑΤΙ ΕΙΝΑΙ ΤΟ ΧΕΙΡΟΤΕΡΟ ΕΙΔΟΣ ΣΦΑΛΜΑΤΟΣ. Δεν σκάει τίποτα. Η συνάρτηση
// φαίνεται ενεργή, το χρονόμετρο φαίνεται στημένο, και η ουρά απλώς δεν
// αδειάζει ποτέ. Στη συγκεκριμένη περίπτωση αυτό σήμαινε προσωπικά αρχεία
// σβησμένων λογαριασμών που μένουν για πάντα.
//
// ΔΥΟ ΚΑΝΟΝΕΣ:
//   1. Κάθε φάκελος στο supabase/functions (εκτός _shared) δηλώνεται στο
//      config.toml. Χωρίς δήλωση ισχύει σιωπηλά η κλειδωμένη προεπιλογή.
//   2. Οποια συνάρτηση καλείται από `cron.schedule` σε μετανάστευση, πρέπει να
//      έχει `verify_jwt = false`. Την ταυτότητα την κρίνει ο κώδικάς της με το
//      μυστικό, όχι η πύλη με JWT που δεν υπάρχει.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const FUNCS = 'supabase/functions'
const CONFIG = 'supabase/config.toml'
const MIGRATIONS = 'supabase/migrations'

if (!existsSync(CONFIG)) {
  console.error(`✗ Λείπει το ${CONFIG}`)
  process.exit(1)
}
const toml = readFileSync(CONFIG, 'utf8')

/** `[functions.όνομα]` και το `verify_jwt` του μπλοκ του. */
function declared(src) {
  const map = new Map()
  const blocks = src.split(/^\[functions\./m).slice(1)
  for (const b of blocks) {
    const name = b.slice(0, b.indexOf(']'))
    const m = /verify_jwt\s*=\s*(true|false)/.exec(b)
    map.set(name, m ? m[1] === 'true' : true)
  }
  return map
}

/** Ποιες συναρτήσεις καλεί χρονόμετρο: `/functions/v1/<όνομα>` μέσα σε cron.schedule. */
function scheduled(dir) {
  const names = new Set()
  for (const f of readdirSync(dir).filter(x => x.endsWith('.sql'))) {
    const sql = readFileSync(join(dir, f), 'utf8')
    if (!/cron\.schedule/i.test(sql)) continue
    for (const m of sql.matchAll(/\/functions\/v1\/([a-z0-9-]+)/gi)) names.add(m[1])
  }
  return names
}

const cfg = declared(toml)
const dirs = readdirSync(FUNCS, { withFileTypes: true })
  .filter(e => e.isDirectory() && e.name !== '_shared')
  .map(e => e.name)
  .sort()

const problems = []
for (const name of dirs)
  if (!cfg.has(name))
    problems.push(`${FUNCS}/${name} δεν δηλώνεται στο ${CONFIG}, άρα κλειδώνει σιωπηλά με verify_jwt = true`)

for (const name of [...scheduled(MIGRATIONS)].sort()) {
  if (!cfg.has(name)) {
    problems.push(`το χρονόμετρο καλεί την «${name}», που δεν δηλώνεται στο ${CONFIG}`)
    continue
  }
  if (cfg.get(name))
    problems.push(`το χρονόμετρο καλεί την «${name}», που έχει verify_jwt = true: κάθε εκτέλεση θα παίρνει 401`)
}

// Και το ανάποδο: δήλωση για φάκελο που δεν υπάρχει είναι δήλωση που σαπίζει.
for (const name of cfg.keys())
  if (!dirs.includes(name))
    problems.push(`το ${CONFIG} δηλώνει την «${name}», που δεν υπάρχει στο ${FUNCS}`)

if (problems.length) {
  console.error(`✗ ${problems.length} συναρτήσεις άκρης δεν είναι προσβάσιμες όπως νομίζουμε:\n`)
  for (const p of problems) console.error('  ' + p)
  console.error(`
  Το pg_cron καλεί με «x-cron-secret» και χωρίς συνεδρία χρήστη. Οι συναρτήσεις
  του χρονομέτρου κρίνουν μόνες τους την ταυτότητα (authorizeCron) και δηλώνονται:

      [functions.ΟΝΟΜΑ]
      enabled = true
      verify_jwt = false
`)
  process.exit(1)
}
console.log(`✓ ${dirs.length} συναρτήσεις άκρης δηλωμένες, και όσες καλεί χρονόμετρο είναι προσβάσιμες`)
