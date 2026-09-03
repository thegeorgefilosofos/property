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
 * ΤΟ ΚΟΣΤΟΣ ΜΙΑΣ ΕΚΤΕΛΕΣΗΣ CI, ΜΕΤΡΗΜΕΝΟ ΚΑΙ ΟΧΙ ΕΙΚΑΖΟΜΕΝΟ.
 *
 * Εγραφε εδώ «4,5 λεπτά (μετρημένο)» και ήταν αλήθεια όταν γράφτηκε: ένα job,
 * λίγα βήματα. Στο μεταξύ το CI έγινε τέσσερα jobs που τρέχουν παράλληλα και
 * ο αριθμός δεν ξαναμετρήθηκε — δηλαδή ο φύλακας που φυλάει τα λεπτά έλεγε
 * ψέματα για τα λεπτά. Ξαναμετρήθηκε από την ίδια την εκτέλεση 33664038685
 * (ubuntu-latest, 02/09/2026), με χρέωση ανά job στρογγυλεμένη προς τα πάνω
 * όπως χρεώνει το GitHub:
 *
 *     verify                        6΄53΄΄ →  7
 *     Διάταξη σε δώδεκα συσκευές    5΄54΄΄ →  6
 *     Σαρώσεις περιηγητή           10΄14΄΄ → 11
 *     Ο,τι κρίνεται αφού ζωγραφιστεί 13΄33΄΄ → 14
 *     Ολα πράσινα                   3΄΄    →  1  (δάπεδο ενός λεπτού)
 *                                            ───
 *                                             39 λεπτά ανά εκτέλεση
 */
const CI_MINUTES_PER_RUN = 39

/**
 * ΤΑ ΥΠΟΛΟΙΠΑ ΠΟΥ ΞΥΠΝΟΥΝ ΑΠΟ ΣΥΜΒΑΝ, με τις ίδιες παραδοχές που ίσχυαν:
 *
 *   supabase-deploy: 2 δουλειές × 1 λεπτό (δάπεδο) × 40 push στο main =  80
 *   db-types:        1 δουλειά  × 2 λεπτά          × 20 push          =  40
 */
const OTHER_EVENT_MINUTES = 120

/**
 * ΠΟΣΕΣ ΠΛΗΡΕΙΣ ΕΚΤΕΛΕΣΕΙΣ CI ΤΟΝ ΜΗΝΑ ΧΩΡΑΝΕ. Δεν είναι επιθυμία, είναι ό,τι
 * περισσεύει: το όριο μείον τα προγραμματισμένα, μείον τα υπόλοιπα συμβάντα,
 * διά 39. Υπολογίζεται πιο κάτω και ΤΥΠΩΝΕΤΑΙ, ώστε το νούμερο να μη γίνει
 * ξανά παραδοχή που παλιώνει χωρίς να το πάρει κανείς είδηση.
 *
 * ΤΙ ΣΗΜΑΙΝΕΙ ΣΤΗΝ ΠΡΑΞΗ, ΚΑΙ ΠΡΕΠΕΙ ΝΑ ΤΟ ΞΕΡΕΙΣ: το δωρεάν επίπεδο ΔΕΝ
 * καλύπτει ρυθμό ανάπτυξης πολλών push την ημέρα με αυτό το CI. Η απάντηση
 * ΔΕΝ είναι να κοπούν έλεγχοι — κάθε ένας από αυτούς έπιασε πραγματικό
 * ελάττωμα. Είναι είτε πληρωμένο πλάνο είτε λιγότερα, μεγαλύτερα PR.
 *
 * Το «push: claude/**» αφαιρέθηκε από το ci.yml στις 02/09/2026 ακριβώς
 * γι' αυτόν τον λόγο: έτρεχε δεύτερη εκτέλεση σε κάθε push, που ακυρωνόταν
 * αφού είχε ήδη κάνει checkout και «npm ci» σε τέσσερα jobs.
 */
/**
 * ΤΟ ΔΑΠΕΔΟ: ΠΟΣΕΣ ΠΛΗΡΕΙΣ ΕΚΤΕΛΕΣΕΙΣ ΠΡΕΠΕΙ ΝΑ ΧΩΡΑΝΕ ΟΠΩΣΔΗΠΟΤΕ.
 *
 * Εδώ κρίνεται ο φύλακας. Το προηγούμενο σχήμα κρατούσε σταθερό «αποθεματικό»
 * και ρωτούσε αν το σύνολο ξεπερνά το όριο — ερώτηση που, με το αποθεματικό
 * υπολογισμένο ως «ό,τι περισσεύει», απαντιέται ΠΑΝΤΑ όχι. Ταυτολογία: ο
 * έλεγχος έμενε πράσινος ό,τι κι αν έμπαινε. Το έπιασε ο πάγκος μεταλλάξεων
 * με ένα cron κάθε πέντε λεπτά, που είναι ακριβώς το σφάλμα που φυλάει.
 *
 * Η σωστή ερώτηση δεν είναι «χωράνε τα προγραμματισμένα;» — πάντα χωράνε, αφού
 * είναι λίγα. Είναι «ΤΙ ΜΕΝΕΙ ΓΙΑ ΝΑ ΔΟΥΛΕΨΕΙ Ο ΑΝΘΡΩΠΟΣ;». Είκοσι πλήρεις
 * εκτελέσεις τον μήνα είναι το ελάχιστο για έναν κύκλο ανάπτυξης με PR: κάτω
 * από αυτό, ένα cron έφαγε τον χώρο του CI και πρέπει να το μάθεις ΕΔΩ και όχι
 * όταν σταματήσουν να τρέχουν τα workflows στη μέση του μήνα.
 */
const MIN_RUNS_PER_MONTH = 20

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

const eventBudget = MONTHLY_LIMIT - scheduled
const ciBudget = eventBudget - OTHER_EVENT_MINUTES
const affordableRuns = Math.floor(ciBudget / CI_MINUTES_PER_RUN)
const total = scheduled + eventBudget
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
console.log(`  ${fmt(eventBudget).padStart(5)} λεπτά  περισσεύουν για ό,τι ξυπνά από συμβάν`)
console.log(`  ${fmt(OTHER_EVENT_MINUTES).padStart(5)} λεπτά  από αυτά: supabase-deploy και db-types`)
console.log(`  ${fmt(total).padStart(5)} λεπτά  σύνολο, σε όριο ${fmt(MONTHLY_LIMIT)}`)
console.log(`\n  ΤΟ ΝΟΥΜΕΡΟ ΠΟΥ ΜΕΤΡΑΕΙ: με ${CI_MINUTES_PER_RUN} λεπτά ανά πλήρη εκτέλεση CI,`)
console.log(`  το δωρεάν όριο φτάνει για ${affordableRuns} εκτελέσεις τον μήνα — δηλαδή`)
console.log(`  ${(affordableRuns / 30).toFixed(1).replace('.', ',')} την ημέρα. Πάνω από αυτό θέλει πληρωμένο πλάνο.`)

if (affordableRuns < MIN_RUNS_PER_MONTH) {
  console.error(`\n✗ ΜΕΝΟΥΝ ${affordableRuns} ΕΚΤΕΛΕΣΕΙΣ CI ΤΟΝ ΜΗΝΑ, ΚΑΤΩ ΑΠΟ ΤΟ ΔΑΠΕΔΟ ΤΩΝ ${MIN_RUNS_PER_MONTH}.`)
  console.error(`  Τα προγραμματισμένα τρώνε ${fmt(scheduled)} από τα ${fmt(MONTHLY_LIMIT)} λεπτά.`)
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

console.log(`\n✅ Λεπτά Actions: ${fmt(scheduled)} προγραμματισμένα σε όριο ${fmt(MONTHLY_LIMIT)}, ${affordableRuns} πλήρεις εκτελέσεις CI τον μήνα.`)
