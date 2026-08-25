#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Ο ΑΓΩΓΟΣ ΠΕΘΑΝΕ ΑΠΟ ΤΟΝ ΙΔΙΟ ΤΟΥ ΤΟΝ ΕΛΕΓΧΟ ΥΓΕΙΑΣ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΕΓΙΝΕ, ΜΕ ΗΜΕΡΟΜΗΝΙΕΣ. Στις 28 Ιουλίου 2026 μπήκε το `health.yml` με
// πρόγραμμα `*/15`. Στις 11 Αυγούστου, δεκατέσσερις μέρες μετά, σταμάτησαν να
// τρέχουν ΟΛΑ τα workflows — και το CI, που δεν χρειάζεται ούτε ένα μυστικό.
// Καθε εκτέλεση τερμάτιζε σε τρία ώς επτά δευτερόλεπτα χωρίς να ανεβάσει καν
// αρχείο καταγραφής. Δεν έσπασε κώδικας: ΤΕΛΕΙΩΣΑΝ ΤΑ ΛΕΠΤΑ.
//
// Η ΑΡΙΘΜΗΤΙΚΗ ΠΟΥ ΔΕΝ ΕΚΑΝΕ ΚΑΝΕΙΣ:
//
//     96 εκτελέσεις/ημέρα × 2 δουλειές × 1 λεπτό = 192 λεπτά/ημέρα
//     2.000 λεπτά (δωρεάν όριο ιδιωτικού) ÷ 192  = 10,4 ημέρες
//
// ΤΡΙΑ ΠΡΑΓΜΑΤΑ ΠΟΥ ΚΑΝΟΥΝ ΑΥΤΟ ΤΟ ΛΑΘΟΣ ΑΟΡΑΤΟ:
//
//   1. Η ΧΡΕΩΣΗ ΕΙΝΑΙ ΑΝΑ ΔΟΥΛΕΙΑ, ΟΧΙ ΑΝΑ ΕΚΤΕΛΕΣΗ και στρογγυλοποιείται
//      ΠΑΝΩ στο λεπτό. Μια δουλειά δέκα δευτερολέπτων που ρωτά «υπάρχει
//      ανοιχτό issue;» κοστίζει όσο μια δουλειά εξήντα δευτερολέπτων.
//   2. ΤΟ `*/15` ΔΙΑΒΑΖΕΤΑΙ ΩΣ ΣΥΧΝΟΤΗΤΑ, ΟΧΙ ΩΣ ΚΟΣΤΟΣ. Κανείς δεν
//      πολλαπλασιάζει με το 2.880 όταν το γράφει.
//   3. Η ΑΠΟΤΥΧΙΑ ΕΙΝΑΙ ΑΦΩΝΗ. Δεν υπάρχει καταγραφή να διαβάσεις, δεν
//      υπάρχει μήνυμα λάθους και επειδή σκάνε ΟΛΑ ταυτόχρονα το πρώτο
//      συμπέρασμα είναι «ληγμένο μυστικό» — που στέλνει σε λάθος κατεύθυνση.
//
// ΤΙ ΕΠΙΒΑΛΛΕΙ ΑΥΤΟΣ Ο ΦΥΛΑΚΑΣ. Διαβάζει κάθε workflow, απαριθμεί τα cron του
// πάνω σε ΠΡΑΓΜΑΤΙΚΟ ημερολόγιο ενός έτους, μετρά τις δουλειές και βγάζει
// λεπτά τον μήνα. Αν το προγραμματισμένο κόστος συν το αποθεματικό των
// workflows που ξυπνούν από push ξεπερνά το όριο, κοκκινίζει ΕΔΩ αντί να
// σβήσει σιωπηλά ο αγωγός σε δέκα μέρες.
//
// ΔΕΝ μετρά διάρκειες: δεν τις ξέρει στατικά. Μετρά το ΔΑΠΕΔΟ (ένα λεπτό ανά
// δουλειά), που είναι το ελάχιστο δυνατό κόστος. Οταν ούτε το δάπεδο δεν
// χωράει, καμία βελτιστοποίηση δεν σώζει το πρόγραμμα.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync } from 'node:fs'

const DIR = '.github/workflows/'

/** Δωρεάν λεπτά Actions τον μήνα, ιδιωτικό αποθετήριο, προσωπικός λογαριασμός. */
const MONTHLY_LIMIT = 2000

/**
 * Αποθεματικό για όσα ξυπνούν από push ή pull request. Πόσα push θα γίνουν δεν
 * προβλέπεται στατικά, οπότε κρατιέται ρητό μερίδιο με γραμμένο τον λογαριασμό
 * του. Οι διάρκειες ΔΕΝ είναι εικασία: βγήκαν από τα ίδια τα ιστορικά του
 * αποθετηρίου (διάμεσος 42 επιτυχημένων εκτελέσεων CI, 139 του deploy).
 *
 *   CI:              4,5 λεπτά (μετρημένο) × 1 δουλειά  × 150 push/μήνα = 675
 *   supabase-deploy: 2 δουλειές × 1 λεπτό (δάπεδο)      ×  40 push main =  80
 *   db-types:        1 δουλειά  × 2 λεπτά               ×  20 push      =  40
 *
 * ΤΟ ΝΟΥΜΕΡΟ ΠΟΥ ΠΡΕΠΕΙ ΝΑ ΞΕΡΕΙΣ: 150 push τον μήνα, δηλαδή πέντε την ημέρα.
 * Στο διάστημα 30 Ιουλίου ώς 14 Αυγούστου 2026 το CI έτρεξε 474 φορές σε 15
 * ημέρες — τριάντα μία την ημέρα, ρυθμός ελέγχου και όχι ανάπτυξης. Με εκείνον
 * τον ρυθμό το CI μόνο του θέλει 4.275 λεπτά και ΚΑΝΕΝΑ πρόγραμμα δεν χωράει.
 * Αν ο ρυθμός μείνει εκεί, η απάντηση δεν είναι να κοπούν άλλοι έλεγχοι· είναι
 * ότι το δωρεάν επίπεδο δεν καλύπτει αυτόν τον ρυθμό και πρέπει να το ξέρεις.
 */
const EVENT_RESERVE = 795

/** Ενα λεπτό ανά δουλειά είναι το ελάχιστο που χρεώνει το GitHub. */
const FLOOR_MINUTES_PER_JOB = 1

// ── Ανάλυση cron ────────────────────────────────────────────────────────────
// Πέντε πεδία: λεπτό ώρα ημέρα-μήνα μήνας ημέρα-εβδομάδας. Στηρίζονται `*`,
// `*/n`, `a-b`, `a-b/n`, `a,b,c` και σκέτος αριθμός.
function fieldMatches(spec, value, min, max) {
  for (const part of spec.split(',')) {
    const [range, stepRaw] = part.split('/')
    const step = stepRaw ? Number(stepRaw) : 1
    let lo, hi
    if (range === '*') { lo = min; hi = max }
    else if (range.includes('-')) { const [a, b] = range.split('-').map(Number); lo = a; hi = b }
    else { lo = hi = Number(range) }
    if (Number.isNaN(lo) || Number.isNaN(hi)) return false
    if (value < lo || value > hi) continue
    if ((value - lo) % step === 0) return true
  }
  return false
}

/**
 * Πόσες φορές πυροδοτεί ένα cron μέσα σε έναν χρόνο. Μετριέται πάνω σε
 * πραγματικό ημερολόγιο (2027, μη δίσεκτο) και όχι με τον κανόνα «30 ημέρες»:
 * ένα `0 7 21 * *` και ένα `0 6 6-14 * *` δίνουν διαφορετικά νούμερα ανά μήνα
 * και η προσέγγιση θα έκρυβε ακριβώς τη διαφορά που μας ενδιαφέρει.
 *
 * Το GitHub αγνοεί την ημέρα-εβδομάδας όταν η ημέρα-μήνα δεν είναι `*` (και
 * αντίστροφα): τα δύο πεδία ενώνονται με Η, όχι με ΚΑΙ. Αυτό τηρείται.
 */
function firesPerYear(expr) {
  const [mi, ho, dom, mo, dow] = expr.trim().split(/\s+/)
  if (!dow) return null
  let n = 0
  const d = new Date(Date.UTC(2027, 0, 1, 0, 0, 0))
  const end = Date.UTC(2028, 0, 1, 0, 0, 0)
  // Πρώτα οι μέρες, μετά τα λεπτά της μέρας: 365 × 1440 έλεγχοι είναι ακριβοί
  // σε χρόνο, οπότε η μέρα απορρίπτεται μία φορά αντί για 1.440.
  while (d.getTime() < end) {
    const okMonth = fieldMatches(mo, d.getUTCMonth() + 1, 1, 12)
    if (okMonth) {
      const domStar = dom === '*', dowStar = dow === '*'
      const okDom = fieldMatches(dom, d.getUTCDate(), 1, 31)
      const okDow = fieldMatches(dow, d.getUTCDay(), 0, 6)
      const okDay = domStar && dowStar ? true
        : domStar ? okDow
        : dowStar ? okDom
        : (okDom || okDow)
      if (okDay) {
        for (let h = 0; h < 24; h++) {
          if (!fieldMatches(ho, h, 0, 23)) continue
          for (let m = 0; m < 60; m++) if (fieldMatches(mi, m, 0, 59)) n++
        }
      }
    }
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return n
}

// ── Ανάγνωση των workflows ──────────────────────────────────────────────────
// Χωρίς εξάρτηση από αναλυτή YAML: τα αρχεία είναι δικά μας και η μορφή τους
// σταθερή. Ο φύλακας πρέπει να τρέχει με σκέτο node, όπως και το health-check.
function parse(file) {
  const src = readFileSync(DIR + file, 'utf8')
  const crons = [...src.matchAll(/^\s*-\s*cron:\s*['"]?([^'"\n#]+?)['"]?\s*(?:#.*)?$/gm)].map(m => m[1].trim())
  const jobsAt = src.search(/^jobs:\s*$/m)
  if (jobsAt < 0) return { file, crons, jobs: 0, conditional: [] }

  // ΤΙ ΧΡΕΩΝΕΤΑΙ ΚΑΙ ΤΙ ΟΧΙ. Ενα workflow μπορεί να δηλώνει δουλειές που στην
  // υγιή διαδρομή δεν τρέχουν ποτέ — το `notify-failure` με `if: failure()`
  // περιμένει μια διακοπή που ελπίζουμε να μη συμβεί. Αν μετρηθούν, το
  // πρόγραμμα φαίνεται διπλάσιο από όσο είναι και ο φύλακας βγάζει ψεύτικο
  // συναγερμό. Ενας φύλακας που κράζει άδικα μαθαίνει τον κόσμο να τον
  // παρακάμπτει, οπότε γίνεται χειρότερος από ανύπαρκτο.
  //
  // Μετριέται λοιπόν η ΥΓΙΗΣ διαδρομή: όσες δουλειές τρέχουν όταν όλα πάνε
  // καλά. Οι `failure()` και `cancelled()` εξαιρούνται — και μαζί τους η
  // παραδοχή, γραμμένη: όταν η παραγωγή πέφτει, ο λογαριασμός ανεβαίνει.
  const body = src.slice(jobsAt)
  const heads = [...body.matchAll(/^ {2}([A-Za-z0-9_-]+):\s*$/gm)]
  const conditional = []
  let jobs = 0
  for (let i = 0; i < heads.length; i++) {
    const seg = body.slice(heads[i].index, heads[i + 1]?.index ?? body.length)
    const cond = seg.match(/^ {4}if:\s*(.+)$/m)?.[1]?.trim() ?? ''
    if (/\b(failure|cancelled)\s*\(\s*\)/.test(cond)) { conditional.push(heads[i][1]); continue }
    jobs++
  }
  return { file, crons, jobs, conditional }
}

const flows = readdirSync(DIR).filter(f => /\.ya?ml$/.test(f)).map(parse)

const rows = []
let scheduled = 0
for (const f of flows) {
  if (!f.crons.length) continue
  for (const c of f.crons) {
    const year = firesPerYear(c)
    if (year === null) {
      console.error(`✗ Ακατανόητο cron στο ${f.file}: «${c}»`)
      process.exit(1)
    }
    const perMonth = year / 12
    const minutes = perMonth * f.jobs * FLOOR_MINUTES_PER_JOB
    scheduled += minutes
    rows.push({ file: f.file, cron: c, perMonth, jobs: f.jobs, minutes })
  }
}

const total = scheduled + EVENT_RESERVE
const fmt = n => n.toLocaleString('el-GR', { maximumFractionDigits: 0 })

rows.sort((a, b) => b.minutes - a.minutes)
console.log('Προγραμματισμένο κόστος Actions (δάπεδο: ένα λεπτό ανά δουλειά)\n')
for (const r of rows) {
  console.log(
    `  ${String(fmt(r.minutes)).padStart(5)} λεπτά/μήνα   ` +
    `${r.file.replace(/\.ya?ml$/, '').padEnd(18)} ` +
    `${fmt(r.perMonth).padStart(5)} εκτελέσεις × ${r.jobs} ${r.jobs === 1 ? 'δουλειά' : 'δουλειές'}   «${r.cron}»`
  )
}
const skipped = flows.filter(f => f.crons.length && f.conditional.length)
if (skipped.length) {
  console.log('\n  Δεν χρεώνονται, τρέχουν μόνο σε αποτυχία:')
  for (const f of skipped) console.log(`    ${f.file.replace(/\.ya?ml$/, '')} → ${f.conditional.join(', ')}`)
}
console.log(`\n  ${fmt(scheduled).padStart(5)} λεπτά  προγραμματισμένα`)
console.log(`  ${fmt(EVENT_RESERVE).padStart(5)} λεπτά  αποθεματικό για push και pull request`)
console.log(`  ${fmt(total).padStart(5)} λεπτά  σύνολο, σε όριο ${fmt(MONTHLY_LIMIT)}`)

if (total > MONTHLY_LIMIT) {
  console.error(`\n✗ ΥΠΕΡΒΑΣΗ ΚΑΤΑ ${fmt(total - MONTHLY_LIMIT)} ΛΕΠΤΑ ΤΟΝ ΜΗΝΑ.`)
  console.error('\n  Οταν αδειάσει το όριο, ΚΑΘΕ workflow του αποθετηρίου τερματίζει σε')
  console.error('  δευτερόλεπτα χωρίς αρχείο καταγραφής — και το CI μαζί, παρότι δεν')
  console.error('  χρειάζεται κανένα μυστικό. Συνέβη στις 11 Αυγούστου 2026.')
  console.error('\n  ΔΙΟΡΘΩΣΗ, ΜΕ ΣΕΙΡΑ ΑΠΟΔΟΣΗΣ:')
  console.error('   1. Αραίωσε το πυκνότερο πρόγραμμα της λίστας από πάνω.')
  console.error('   2. Ενωσε δουλειές που ζουν στην ίδια εκτέλεση: κάθε δουλειά')
  console.error('      χρεώνεται ξεχωριστό λεπτό ακόμη κι αν κρατήσει δέκα δευτερόλεπτα.')
  console.error('   3. Για παρακολούθηση πυκνότερη της ώρας, βγάλε την από τους runners:')
  console.error('      pg_cron και pg_net υπάρχουν στο δωρεάν επίπεδο της Supabase.')
  process.exit(1)
}

console.log(`\n✅ Λεπτά Actions: ${fmt(total)}/${fmt(MONTHLY_LIMIT)} τον μήνα, με ${fmt(MONTHLY_LIMIT - total)} περιθώριο.`)
