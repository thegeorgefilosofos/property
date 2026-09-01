// supabase/functions/market-data-updater/index.ts
// Τρέχει κάθε πρωί 08:00 UTC από το χρονοδιάγραμμα της βάσης (market-data-daily)
// ή κατά παραγγελία. Φέρνει Euribor, επιτόκια ΕΚΤ και τα ελληνικά μέσα
// στεγαστικά, ΜΕ ΗΜΕΡΟΜΗΝΙΑ ΚΑΙ ΠΗΓΗ ΑΝΑ ΤΙΜΗ· και τα γράφει στον market_rates.
// Deploy: supabase functions deploy market-data-updater --project-ref aromvduuxtcrzmwwvnej

import { createClient } from 'npm:@supabase/supabase-js@2.110.8'
import { authorizeCron } from '../_shared/auth.ts'
// Η ΤΡΟΦΟΔΟΣΙΑ ΖΕΙ ΜΙΑ ΦΟΡΑ, ΣΤΟ lib/market/ecb.ts. Το αρχείο δεν έχει καμία
// σχετική εισαγωγή ακριβώς για να φορτώνεται και από το Deno εδώ και από την
// εφαρμογή· η ροή ανάπτυξης παρακολουθεί τον φάκελο lib/market, ώστε μια αλλαγή
// του να ξανανεβάζει και αυτή τη συνάρτηση.
import { fetchLatest, nextProvenance, valuesOf, staleKeys, greekDay,
  type Provenance } from '../../../lib/market/ecb.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// Authorization gate: this function writes market_rates and can
// push calendar events to every loan owner — it must never be publicly callable.
// Accepts the service-role bearer, an optional env secret, or the shared cron
// secret stored in public.cron_secrets (the zero-config path pg_cron uses).
const CRON_SECRET = Deno.env.get('MARKET_DATA_CRON_SECRET') || ''
async function authorized(req: Request): Promise<boolean> {
  return authorizeCron(req, { serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', envSecret: CRON_SECRET, supabase })
}

// ── ΓΙΑΤΙ ΔΕΝ ΥΠΑΡΧΕΙ ΠΙΑ ΠΙΝΑΚΑΣ ΤΙΜΟΛΟΓΙΩΝ ΕΔΩ ─────────────────────────────
// Εδώ ζούσε χειρόγραφος πίνακας 32 τιμολογίων ρεύματος, με σχόλιο «Source:
// bestenergydeals.gr + official provider sites (3/6/2026)». Δεν ήταν ενημέρωση:
// ήταν αντίγραφο στατικής λίστας που γραφόταν στη βάση κάθε μήνα.
//
// ΤΡΙΑ ΜΕΤΡΗΜΕΝΑ ΠΡΟΒΛΗΜΑΤΑ:
//
//  1. ΚΑΤΑΣΚΕΥΑΖΕ ΨΕΥΤΙΚΗ ΦΡΕΣΚΑΔΑ. Κάθε γραμμή σφραγιζόταν με `valid_month` τον
//     ΤΡΕΧΟΝΤΑ μήνα, ενώ οι τιμές ήταν του Ιουνίου. Τον Αύγουστο η βάση δήλωνε
//     ότι οι τιμές του Ιουνίου ισχύουν τον Αύγουστο.
//
//  2. ΔΙΑΦΩΝΟΥΣΕ ΜΕ ΤΗΝ ΟΘΟΝΗ. Ο κατάλογος του `BillsElectricity.tsx` έχει 100
//     τιμολόγια, αυτός εδώ είχε 32. Από τα 27 κοινά, τα ΟΚΤΩ είχαν άλλη τιμή ή
//     άλλο πάγιο — π.χ. myHome Enter πάγιο 5,00 εδώ και 7,50 στην οθόνη,
//     Blue Smart 0,155 εδώ και 0,138 στην οθόνη. Δύο αντίγραφα του ίδιου
//     καταλόγου, συντηρημένα από το ίδιο χέρι, είχαν ήδη αποκλίνει.
//
//  3. ΕΦΤΑΝΕ ΣΤΟΝ ΧΡΗΣΤΗ ΑΠΟ ΤΗΝ ΠΙΟ ΕΓΚΥΡΗ ΦΩΝΗ. Ο βοηθός διάβαζε ΜΟΝΟ τη
//     στήλη `kwh_day`, ταξινομημένη και ανακοίνωνε εύρος τιμών «αυτόν τον
//     μήνα» — αγνοώντας πάγια, κλιμάκια, ρήτρες αναπροσαρμογής και δεσμεύσεις.
//
// Τα τιμολόγια ρεύματος αλλάζουν την 1η κάθε μήνα με ανακοίνωση του παρόχου.
// Κατάλογος συντηρημένος με το χέρι ΔΕΝ μπορεί να είναι σωστός και μια λάθος
// «καλύτερη επιλογή» κοστίζει στον χρήστη δέσμευση δώδεκα μηνών. Η επίσημη
// σύγκριση γίνεται στο εργαλείο της ΡΑΑΕΥ, που έχει νομική υποχρέωση
// δημοσίευσης· εμείς δίνουμε αυτό που ΜΟΝΟ εμείς έχουμε — το πραγματικό
// ιστορικό κατανάλωσης του χρήστη.

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (!(await authorized(req))) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } })
  }
  console.log('=== Market Data Updater ===', new Date().toISOString())

  const now   = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const today = now.toISOString().slice(0, 10)

  // ── 1. Η προηγούμενη ταυτότητα, πριν από οτιδήποτε άλλο ────────────────────
  // Διαβάζεται ΠΡΩΤΗ γιατί ο κανόνας συγχώνευσης χτίζει πάνω της: ό,τι δεν
  // απαντήσει σήμερα μένει ακριβώς όπως ήταν, με την ΠΑΛΙΑ του ημερομηνία.
  const { data: last } = await supabase
    .from('market_rates')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const previous: Provenance = (last?.provenance ?? {}) as Provenance
  const fb: Record<string, number> = (last as Record<string, number>) ?? {}

  // ── 2. Ενα πέρασμα πάνω από όλες τις σειρές ────────────────────────────────
  const { fresh, problems } = await fetchLatest(now.toISOString())
  for (const p of problems) console.warn('δεν ήρθε:', p)

  const provenance = nextProvenance(previous, fresh)
  const values = valuesOf(provenance)
  const stale = staleKeys(provenance, today)
  for (const k of stale) console.warn(`παλιό: ${k} από ${greekDay(provenance[k]!.asOf)}`)

  // ── 3. Οι στήλες, από την ταυτότητα ────────────────────────────────────────
  // ΓΙΑΤΙ ΥΠΑΡΧΟΥΝ ΑΚΟΜΗ ΟΙ ΠΑΛΙΕΣ ΣΤΗΛΕΣ. Τις διαβάζουν ο βοηθός, η καρτέλα
  // Δάνειο και ο εβδομαδιαίος απολογισμός. Γράφονται από την ΙΔΙΑ ταυτότητα,
  // οπότε δεν μπορούν να αποκλίνουν από αυτήν.
  //
  // ΚΑΙ ΓΙΑΤΙ ΕΦΥΓΑΝ ΤΑ ΣΤΑΘΕΡΑ ΝΟΥΜΕΡΑ ΑΠΟ ΕΔΩ. Η προηγούμενη μορφή τελείωνε
  // κάθε γραμμή με `?? 2.18`, δηλαδή έγραφε στη βάση χειρόγραφο επιτόκιο του
  // 2026 σαν να ήταν μέτρηση, με σημερινή σφραγίδα και πηγή «fallback». Οταν
  // δεν ξέρουμε, η στήλη μένει κενή και η οθόνη το λέει.
  const rateRow: Record<string, unknown> = {
    euribor_1m:        values.euribor_1m        ?? fb.euribor_1m        ?? null,
    euribor_3m:        values.euribor_3m        ?? fb.euribor_3m        ?? null,
    euribor_6m:        values.euribor_6m        ?? fb.euribor_6m        ?? null,
    euribor_12m:       values.euribor_12m       ?? fb.euribor_12m       ?? null,
    ecb_rate:          values.ecb_rate          ?? fb.ecb_rate          ?? null,
    ecb_dfl:           values.ecb_dfl           ?? fb.ecb_dfl           ?? null,
    bog_housing_new:   values.bog_housing_new   ?? fb.bog_housing_new   ?? null,
    bog_housing_stock: values.bog_housing_stock ?? fb.bog_housing_stock ?? null,
    provenance,
    // Οι δύο παλιές στήλες πηγής κρατούν πλέον την ΗΜΕΡΟΜΗΝΙΑ ΠΑΡΑΤΗΡΗΣΗΣ, όχι
    // τη λέξη «live» ή «fallback». Οποιος τις διαβάζει μαθαίνει κάτι αληθινό.
    source_euribor: provenance.euribor_3m
      ? `ΕΚΤ, ${provenance.euribor_3m.basis} ${greekDay(provenance.euribor_3m.asOf)}` : null,
    source_bog: provenance.bog_housing_new
      ? `ΕΚΤ, ${provenance.bog_housing_new.basis} ${greekDay(provenance.bog_housing_new.asOf)}` : null,
    updated_at: now.toISOString(),
    rate_changed: false,
  }

  // ── 4. Σημαντική μεταβολή ──────────────────────────────────────────────────
  // ΜΟΝΟ ΟΤΑΝ ΗΡΘΕ ΟΝΤΩΣ ΝΕΑ ΠΑΡΑΤΗΡΗΣΗ. Η προηγούμενη μορφή σύγκρινε την τιμή
  // με τον εαυτό της όταν η πηγή δεν απαντούσε (`prev3m = fb ?? newRates`), άρα
  // η διαφορά ήταν πάντα μηδέν και η ειδοποίηση δεν χτυπούσε ποτέ σε πραγματική
  // μεταβολή που είχε χαθεί σε μια μέρα σιωπής.
  const prev3m = previous.euribor_3m?.value
  const new3m = fresh.euribor_3m?.value
  const delta3m = (prev3m !== undefined && new3m !== undefined) ? Math.abs(new3m - prev3m) : 0
  if (delta3m >= 0.10) {
    rateRow.rate_changed = true
    console.log(`Euribor τριμήνου ${prev3m}% → ${new3m}% (Δ ${delta3m.toFixed(2)})`)
  }

  const { error: rateErr } = await supabase.from('market_rates').insert(rateRow)
  if (rateErr) console.error('market_rates insert error:', rateErr)

  // Cleanup old entries (keep 365)
  const { data: old } = await supabase
    .from('market_rates').select('id').order('updated_at', { ascending: true })
  if (old && old.length > 365) {
    const toDelete = (old.slice(0, old.length - 365) as { id: string }[]).map(r => r.id)
    await supabase.from('market_rates').delete().in('id', toDelete)
  }

  // ── 5. Προθεσμίες προγραμμάτων ─────────────────────────────────────────────
  // Η μεταβολή του Euribor δεν γράφεται δεύτερη φορά εδώ: την καταγράφει ήδη το
  // βήμα 4 και τη στέλνει στους χρήστες ο εβδομαδιαίος απολογισμός αγοράς, που
  // διαβάζει τον ίδιο πίνακα. Το `notification_log` δεν χωρά καθολική
  // ειδοποίηση — οι στήλες του είναι (user_id, event_id, reminder_type) — και
  // κάθε προσπάθεια εγγραφής εκεί αποτύγχανε σιωπηλά.
  const programResults = await manageProgramDeadlines()

  // ── Response ────────────────────────────────────────────────────────────────
  // ΛΕΕΙ ΤΙ ΔΕΝ ΗΡΘΕ. Η προηγούμενη απάντηση έγραφε «success: true» ακόμη κι
  // όταν τέσσερα από τα οκτώ επιτόκια είχαν αποτύχει, γιατί μετρούσε μόνο αν
  // πέτυχε η εγγραφή στη βάση. Οποιος διάβαζε τα αρχεία του χρονοδιαγράμματος
  // δεν είχε τρόπο να το μάθει.
  const response = {
    success: !rateErr,
    timestamp: now.toISOString(),
    month,
    fetched: Object.keys(fresh).length,
    expected: Object.keys(provenance).length,
    problems,
    stale: stale.map(k => `${k}: ${greekDay(provenance[k]!.asOf)}`),
    significantChange: rateRow.rate_changed,
    programs: programResults,
  }

  console.log('Done:', JSON.stringify(response, null, 2))
  return new Response(JSON.stringify(response), {
    headers: { 'Content-Type': 'application/json' }
  })
})

// ── Program deadline management ───────────────────────────────────────────────
// ΤΡΕΙΣ ΣΤΗΛΕΣ ΠΟΥ ΔΕΝ ΥΠΑΡΧΟΥΝ ΕΚΑΝΑΝ ΑΥΤΗ ΤΗ ΣΥΝΑΡΤΗΣΗ ΝΑ ΜΗΝ ΚΑΝΕΙ ΤΙΠΟΤΑ.
//
// Ο πίνακας `loan_programs` έχει κλειδί `program_id` και κατάσταση `status`.
// Δεν έχει `is_active`, δεν έχει `expired_at`, δεν έχει `id`. Το φίλτρο
// `.neq('status', 'ended')` απορριπτόταν ολόκληρο με 42703, το `programs`
// γύριζε null και ο βρόχος δεν έτρεχε ΠΟΤΕ.
//
// Το cron τρέχει κάθε πρωί στις 08:00 UTC και επέστρεφε καθαρή, άδεια λίστα.
// Δηλαδή: ληγμένα προγράμματα («Σπίτι μου ΙΙ», «Εξοικονομώ») έμεναν για πάντα
// ενεργά στην καρτέλα Δάνειο και καμία υπενθύμιση προθεσμίας στις 90, 60, 30,
// 14 και 7 ημέρες δεν δημιουργήθηκε ποτέ. Ο ιδιοκτήτης έχανε την προθεσμία
// επιδότησης και τίποτα δεν του το είπε.
//
// Η μία πηγή αλήθειας για το «ενεργό» είναι το `status`: η όψη
// `active_loan_programs` φιλτράρει ήδη με
// `coalesce(status,'active') <> 'ended' and (deadline is null or deadline >= current_date)`.
// Μια στήλη `is_active` θα ήταν δεύτερη και θα απέκλιναν.
async function manageProgramDeadlines() {
  const today = new Date()
  const { data: programs } = await supabase
    .from('loan_programs')
    .select('*')
    .neq('status', 'ended')
    .not('deadline', 'is', null)

  const results: string[] = []

  for (const prog of (programs ?? [])) {
    const dl       = new Date(prog.deadline)
    const daysLeft = Math.ceil((dl.getTime() - today.getTime()) / 86400000)

    if (daysLeft < 0) {
      await supabase.from('loan_programs')
        .update({ status: 'ended' })
        .eq('program_id', prog.program_id)
      results.push(`EXPIRED: ${prog.name}`)
    } else {
      if (prog.deadline_urgent !== (daysLeft <= 30)) {
        await supabase.from('loan_programs')
          .update({ deadline_urgent: daysLeft <= 30 })
          .eq('program_id', prog.program_id)
      }
      if ([90, 60, 30, 14, 7].includes(daysLeft)) {
        await createProgramReminders(prog, daysLeft)
        results.push(`REMINDER_${daysLeft}d: ${prog.name}`)
      }
      results.push(`OK: ${prog.name} (${daysLeft} ημέρες)`)
    }
  }
  return results
}

/** Το πρόγραμμα, όσο το χρειάζει η υπενθύμιση. */
interface ProgramRow {
  program_id: string;
  name: string;
  deadline: string;
  deadline_urgent?: boolean | null;
  deadline_label?: string | null;
}

async function createProgramReminders(prog: ProgramRow, daysLeft: number) {
  const { data: loans } = await supabase
    .from('loans').select('user_id, property_id').eq('status', 'active')

  for (const loan of (loans ?? [])) {
    const { data: existing } = await supabase
      .from('calendar_events').select('id')
      .eq('user_id', loan.user_id)
      .like('title', `%${prog.name}%`)
      .gte('event_date', prog.deadline)
      .limit(1)

    if (existing?.length) continue

    await supabase.from('calendar_events').insert({
      user_id:     loan.user_id,
      property_id: loan.property_id,
      title:       `${prog.name} · Λήγει σε ${daysLeft} ημέρες`,
      category:    'financial',
      event_date:  prog.deadline,
      priority:    daysLeft <= 14 ? 'high' : daysLeft <= 30 ? 'medium' : 'low',
      status:      'pending',
      notes:       prog.deadline_label ?? `Προθεσμία προγράμματος ${prog.name}.`,
      source:      'system',
    })
  }
}