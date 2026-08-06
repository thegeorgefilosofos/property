// supabase/functions/market-data-updater/index.ts
// Τρέχει κάθε πρωί 07:00 UTC (cron) ή on-demand
// Ενημερώνει: ECB Euribor + ΤτΕ rates (market_rates) + energy_tariffs
// Deploy: supabase functions deploy market-data-updater --project-ref aromvduuxtcrzmwwvnej

import { createClient } from 'npm:@supabase/supabase-js@2.110.8'
import { authorizeCron } from '../_shared/auth.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// Authorization gate: this function writes market_rates / energy_tariffs and can
// push calendar events to every loan owner — it must never be publicly callable.
// Accepts the service-role bearer, an optional env secret, or the shared cron
// secret stored in public.cron_secrets (the zero-config path pg_cron uses).
const CRON_SECRET = Deno.env.get('MARKET_DATA_CRON_SECRET') || ''
async function authorized(req: Request): Promise<boolean> {
  return authorizeCron(req, { serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', envSecret: CRON_SECRET, supabase })
}

// ── ECB SDW API helper ────────────────────────────────────────────────────────
async function fetchECBSeries(seriesKey: string, lastN = 1): Promise<number | null> {
  const url = `https://data-api.ecb.europa.eu/service/data/${seriesKey}?lastNObservations=${lastN}&format=jsondata`
  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const seriesData = Object.values(data?.dataSets?.[0]?.series ?? {})?.[0] as any
    const obs = seriesData?.observations ?? {}
    const lastKey = Object.keys(obs).map(Number).sort((a,b)=>b-a)[0]
    const val = obs[String(lastKey)]?.[0]
    return typeof val === 'number' && !isNaN(val) ? Math.round(val * 1000) / 1000 : null
  } catch (e) {
    console.error(`ECB fetch error for ${seriesKey}:`, e)
    return null
  }
}

// ── ECB series ────────────────────────────────────────────────────────────────
const SERIES = {
  euribor_3m:        'FM/B.U2.EUR.RT0.MM.EURIBOR3MD_.HSTA',
  euribor_1m:        'FM/B.U2.EUR.RT0.MM.EURIBOR1MD_.HSTA',
  euribor_6m:        'FM/B.U2.EUR.RT0.MM.EURIBOR6MD_.HSTA',
  euribor_12m:       'FM/B.U2.EUR.RT0.MM.EURIBOR1YD_.HSTA',
  ecb_rate:          'FM/B.U2.EUR.RT0.MR.MRR_FR.IR.HSTA',
  ecb_dfl:           'FM/B.U2.EUR.RT0.MR.DFR.IR.HSTA',
  bog_housing_new:   'MIR/M.GR.B.A2C.F.R.A.2250.EUR.N',
  bog_housing_stock: 'MIR/M.GR.B.A2C.I.R.A.2250.EUR.N',
}

// ── Real Greek energy tariffs June 2026 ──────────────────────────────────────
// Source: bestenergydeals.gr + official provider sites (3/6/2026)
// Ενημερώνεται κάθε 1η του μήνα όταν ανακοινώνουν τα πράσινα/κίτρινα τιμολόγια
const ENERGY_TARIFFS = [
  // ΔΕΗ ─────────────────────────────────────────────────────────────────────
  { provider:'dei', provider_label:'ΔΕΗ', tariff_id:'dei_enter',      name:'myHome Enter',            badge:'ΜΠΛΕ',    type:'fixed',    kwh_day:0.1450, kwh_night:null,   flat_monthly:null, fixed:5.00, fixed_ebill:3.50, contract_months:12, no_fixed:false, dynamic:false },
  { provider:'dei', provider_label:'ΔΕΗ', tariff_id:'dei_entertwo',   name:'myHome EnterTwo',         badge:'ΜΠΛΕ',    type:'fixed',    kwh_day:0.1450, kwh_night:0.0950, flat_monthly:null, fixed:5.00, fixed_ebill:3.50, contract_months:24, no_fixed:false, dynamic:false },
  { provider:'dei', provider_label:'ΔΕΗ', tariff_id:'dei_online',     name:'myHome Online',           badge:'ΜΠΛΕ',    type:'fixed',    kwh_day:0.1420, kwh_night:null,   flat_monthly:null, fixed:5.00, fixed_ebill:3.50, contract_months:12, no_fixed:false, dynamic:false },
  { provider:'dei', provider_label:'ΔΕΗ', tariff_id:'dei_maxima',     name:'myHome Maxima',           badge:'ΜΠΛΕ',    type:'fixed',    kwh_day:0.1320, kwh_night:null,   flat_monthly:null, fixed:5.00, fixed_ebill:3.50, contract_months:12, no_fixed:false, dynamic:false, kwh_tier2:0.1220, tier2_threshold:600 },
  { provider:'dei', provider_label:'ΔΕΗ', tariff_id:'dei_plan',       name:'myHome Plan',             badge:'ΜΠΛΕ',    type:'flat',     kwh_day:0,      kwh_night:null,   flat_monthly:60.00,fixed:0,    fixed_ebill:null, contract_months:12, no_fixed:false, dynamic:false },
  { provider:'dei', provider_label:'ΔΕΗ', tariff_id:'dei_4all',       name:'myHome 4All',             badge:'ΚΙΤΡΙΝΟ', type:'variable', kwh_day:0.1370, kwh_night:null,   flat_monthly:null, fixed:5.00, fixed_ebill:3.50, contract_months:0,  no_fixed:false, dynamic:false, kwh_tier2:0.1870, tier2_threshold:500 },
  { provider:'dei', provider_label:'ΔΕΗ', tariff_id:'dei_4students',  name:'myHome 4Students',        badge:'ΚΙΤΡΙΝΟ', type:'variable', kwh_day:0.1290, kwh_night:null,   flat_monthly:null, fixed:3.00, fixed_ebill:null, contract_months:0,  no_fixed:false, dynamic:false, kwh_tier2:0.1850, tier2_threshold:150 },
  { provider:'dei', provider_label:'ΔΕΗ', tariff_id:'dei_prasino',    name:'Γ1 Πράσινο Ειδικό',      badge:'ΠΡΑΣΙΝΟ', type:'variable', kwh_day:0.1440, kwh_night:null,   flat_monthly:null, fixed:5.00, fixed_ebill:3.50, contract_months:0,  no_fixed:false, dynamic:false },
  { provider:'dei', provider_label:'ΔΕΗ', tariff_id:'dei_prasino_n',  name:'Γ1Ν Πράσινο Νυχτερινό',  badge:'ΠΡΑΣΙΝΟ', type:'variable', kwh_day:0.1440, kwh_night:0.1160, flat_monthly:null, fixed:5.00, fixed_ebill:3.50, contract_months:0,  no_fixed:false, dynamic:false },
  { provider:'dei', provider_label:'ΔΕΗ', tariff_id:'dei_dynamic',    name:'myHome Dynamic',          badge:'ΔΥΝΑΜΙΚΟ',type:'dynamic',  kwh_day:0,      kwh_night:null,   flat_monthly:null, fixed:5.00, fixed_ebill:null, contract_months:0,  no_fixed:false, dynamic:true  },
  // Ήρων ────────────────────────────────────────────────────────────────────
  { provider:'heron', provider_label:'Ήρων', tariff_id:'heron_basic',      name:'Basic Home',             badge:'ΠΡΑΣΙΝΟ', type:'variable', kwh_day:0.1642, kwh_night:null, flat_monthly:null, fixed:7.00,  fixed_ebill:null, contract_months:0,  no_fixed:false, dynamic:false },
  { provider:'heron', provider_label:'Ήρων', tariff_id:'heron_blue_smart', name:'Blue Smart',             badge:'ΜΠΛΕ',    type:'fixed',    kwh_day:0.1550, kwh_night:null, flat_monthly:null, fixed:7.95,  fixed_ebill:null, contract_months:12, no_fixed:false, dynamic:false },
  { provider:'heron', provider_label:'Ήρων', tariff_id:'heron_blue_max',   name:'Blue Generous Max',      badge:'ΜΠΛΕ',    type:'fixed',    kwh_day:0.1650, kwh_night:null, flat_monthly:null, fixed:13.90, fixed_ebill:null, contract_months:18, no_fixed:false, dynamic:false },
  { provider:'heron', provider_label:'Ήρων', tariff_id:'heron_stable',     name:'Ήρων Σταθερό Οικιακό',  badge:'ΜΠΛΕ',    type:'fixed',    kwh_day:0.1480, kwh_night:null, flat_monthly:null, fixed:7.20,  fixed_ebill:null, contract_months:12, no_fixed:false, dynamic:false },
  { provider:'heron', provider_label:'Ήρων', tariff_id:'heron_ena',        name:'Ε.ΝΑ (Virtual Net Metering)', badge:'VNM', type:'vnm',  kwh_day:0.1290, kwh_night:null, flat_monthly:null, fixed:7.00,  fixed_ebill:null, contract_months:0,  no_fixed:false, dynamic:false },
  // Protergia ───────────────────────────────────────────────────────────────
  { provider:'protergia', provider_label:'Protergia', tariff_id:'prot_flow',     name:'Value Flow',          badge:'ΚΙΤΡΙΝΟ', type:'variable', kwh_day:0.13767, kwh_night:null, flat_monthly:null, fixed:5.00, fixed_ebill:null, contract_months:0,  no_fixed:false, dynamic:false },
  { provider:'protergia', provider_label:'Protergia', tariff_id:'prot_sure_18',  name:'Value Sure 18M 2.0',  badge:'ΜΠΛΕ',    type:'fixed',    kwh_day:0.1450,  kwh_night:null, flat_monthly:null, fixed:5.00, fixed_ebill:null, contract_months:18, no_fixed:false, dynamic:false },
  { provider:'protergia', provider_label:'Protergia', tariff_id:'prot_sure_12',  name:'Value Sure 12M',      badge:'ΜΠΛΕ',    type:'fixed',    kwh_day:0.1520,  kwh_night:null, flat_monthly:null, fixed:5.00, fixed_ebill:null, contract_months:12, no_fixed:false, dynamic:false },
  { provider:'protergia', provider_label:'Protergia', tariff_id:'prot_standard', name:'Value Standard',      badge:'ΠΡΑΣΙΝΟ', type:'variable', kwh_day:0.1590,  kwh_night:null, flat_monthly:null, fixed:5.00, fixed_ebill:null, contract_months:0,  no_fixed:false, dynamic:false },
  { provider:'protergia', provider_label:'Protergia', tariff_id:'prot_lite2',    name:'Value Lite 2.0',      badge:'ΠΡΑΣΙΝΟ', type:'variable', kwh_day:0.16267, kwh_night:null, flat_monthly:null, fixed:0,    fixed_ebill:null, contract_months:0,  no_fixed:true,  dynamic:false },
  { provider:'protergia', provider_label:'Protergia', tariff_id:'prot_dynamic',  name:'Dynamic One Home',    badge:'ΔΥΝΑΜΙΚΟ',type:'dynamic',  kwh_day:0,       kwh_night:null, flat_monthly:null, fixed:0,    fixed_ebill:null, contract_months:0,  no_fixed:false, dynamic:true  },
  // (Volterra: καταργήθηκε — ο πάροχος δεν λειτουργεί πλέον στη λιανική.)
  // ΣΗΜΕΙΩΣΗ: αυτός ο πίνακας είναι υποσύνολο/παλαιότερος του πλήρους καταλόγου
  // στο app (BillsElectricity.tsx — 11 πάροχοι, οικιακά+επαγγελματικά). Πριν
  // ενεργοποιηθεί το DB-first διάβασμα, πρέπει να συγχρονιστεί με εκείνο τον κατάλογο.
  // NRG ─────────────────────────────────────────────────────────────────────
  { provider:'nrg', provider_label:'NRG', tariff_id:'nrg_now',    name:'NRG Now Οικιακό', badge:'ΠΡΑΣΙΝΟ', type:'variable', kwh_day:0.1595, kwh_night:null, flat_monthly:null, fixed:6.90, fixed_ebill:null, contract_months:0,  no_fixed:false, dynamic:false },
  { provider:'nrg', provider_label:'NRG', tariff_id:'nrg_adjust', name:'NRG adjust 1.0',  badge:'ΜΠΛΕ',    type:'fixed',    kwh_day:0.1580, kwh_night:null, flat_monthly:null, fixed:9.90, fixed_ebill:null, contract_months:12, no_fixed:false, dynamic:false },
  // Zenith ──────────────────────────────────────────────────────────────────
  { provider:'zenith', provider_label:'Zenith', tariff_id:'zen_start', name:'Power Home Start', badge:'ΠΡΑΣΙΝΟ', type:'variable', kwh_day:0.1595, kwh_night:null, flat_monthly:null, fixed:6.80, fixed_ebill:null, contract_months:0, no_fixed:false, dynamic:false },
  // Elin ────────────────────────────────────────────────────────────────────
  { provider:'elin', provider_label:'Elin', tariff_id:'elin_green', name:'Home Green', badge:'ΠΡΑΣΙΝΟ', type:'variable', kwh_day:0.1598, kwh_night:null, flat_monthly:null, fixed:7.10, fixed_ebill:null, contract_months:0, no_fixed:false, dynamic:false },
  // enerwave (πρώην Elpedison — μετονομασία Νοε 2025, HelleniQ Energy) ─────────
  { provider:'enerwave', provider_label:'enerwave (πρώην Elpedison)', tariff_id:'elp_bright', name:'enerwave Bright',   badge:'ΜΠΛΕ',    type:'fixed',    kwh_day:0.1690, kwh_night:null, flat_monthly:null, fixed:3.00, fixed_ebill:null, contract_months:12, no_fixed:false, dynamic:false },
  { provider:'enerwave', provider_label:'enerwave (πρώην Elpedison)', tariff_id:'elp_one',    name:'enerwave One Home', badge:'ΠΡΑΣΙΝΟ', type:'variable', kwh_day:0.1706, kwh_night:null, flat_monthly:null, fixed:5.00, fixed_ebill:null, contract_months:0,  no_fixed:false, dynamic:false },
  // Volton ──────────────────────────────────────────────────────────────────
  { provider:'volton', provider_label:'Volton', tariff_id:'volton_green', name:'Volton Easy',      badge:'ΠΡΑΣΙΝΟ', type:'variable', kwh_day:0.1442, kwh_night:null, flat_monthly:null, fixed:5.00, fixed_ebill:null, contract_months:0,  no_fixed:false, dynamic:false },
  { provider:'volton', provider_label:'Volton', tariff_id:'volton_blue',  name:'Volton Blue Flat', badge:'ΜΠΛΕ',    type:'fixed',    kwh_day:0.1590, kwh_night:null, flat_monthly:null, fixed:9.90, fixed_ebill:null, contract_months:18, no_fixed:false, dynamic:false },
  // Enerwave ────────────────────────────────────────────────────────────────
  { provider:'enerwave', provider_label:'Enerwave', tariff_id:'enrw_saver',  name:'Reward Saver',  badge:'ΠΡΑΣΙΝΟ', type:'variable', kwh_day:0.1490, kwh_night:null, flat_monthly:null, fixed:0,    fixed_ebill:null, contract_months:0,  no_fixed:true,  dynamic:false },
  { provider:'enerwave', provider_label:'Enerwave', tariff_id:'enrw_stable', name:'Reward Stable', badge:'ΜΠΛΕ',    type:'fixed',    kwh_day:0.1690, kwh_night:null, flat_monthly:null, fixed:12.90,fixed_ebill:null, contract_months:18, no_fixed:false, dynamic:false },
  // Φυσικό Αέριο Ελλάδος ────────────────────────────────────────────────────
  { provider:'fysiko_aerio', provider_label:'Φυσικό Αέριο Ελλάδος', tariff_id:'fa_oikia', name:'Oikia Green', badge:'ΠΡΑΣΙΝΟ', type:'variable', kwh_day:0.14265, kwh_night:null, flat_monthly:null, fixed:5.00, fixed_ebill:null, contract_months:0, no_fixed:false, dynamic:false },
]

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (!(await authorized(req))) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } })
  }
  console.log('=== Market Data Updater ===', new Date().toISOString())

  const now   = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // ── 1. Fetch ECB rates in parallel ─────────────────────────────────────────
  const rateResults = await Promise.all(
    Object.entries(SERIES).map(async ([key, series]) => {
      const val = await fetchECBSeries(series)
      console.log(`${key}: ${val ?? 'NULL — fallback'}`)
      return [key, val] as const
    })
  )
  const fetched = Object.fromEntries(rateResults)

  // ── 2. Load last known good values ─────────────────────────────────────────
  const { data: last } = await supabase
    .from('market_rates')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const fb: Record<string, number> = (last as Record<string, number>) ?? {}

  // ── 3. Build rate record ────────────────────────────────────────────────────
  const newRates = {
    euribor_3m:        fetched.euribor_3m        ?? fb.euribor_3m        ?? 2.18,
    euribor_1m:        fetched.euribor_1m        ?? fb.euribor_1m        ?? 2.05,
    euribor_6m:        fetched.euribor_6m        ?? fb.euribor_6m        ?? 2.30,
    euribor_12m:       fetched.euribor_12m       ?? fb.euribor_12m       ?? 2.45,
    ecb_rate:          fetched.ecb_rate          ?? fb.ecb_rate          ?? 2.40,
    ecb_dfl:           fetched.ecb_dfl           ?? fb.ecb_dfl           ?? 2.25,
    bog_housing_new:   fetched.bog_housing_new   ?? fb.bog_housing_new   ?? 3.43,
    bog_housing_stock: fetched.bog_housing_stock ?? fb.bog_housing_stock ?? 3.50,
    source_euribor: fetched.euribor_3m   ? 'ECB EMMI live' : 'fallback',
    source_bog:     fetched.bog_housing_new ? 'ECB MIR live' : 'fallback',
    updated_at: now.toISOString(),
    rate_changed: false,
  }

  // Detect significant change
  const prev3m = fb.euribor_3m ?? newRates.euribor_3m
  const delta3m = Math.abs(newRates.euribor_3m - prev3m)
  if (delta3m >= 0.10) {
    newRates.rate_changed = true
    console.log(`⚠️ Euribor change: ${prev3m}% → ${newRates.euribor_3m}%`)
  }

  // ── 4. Insert market rates ──────────────────────────────────────────────────
  const { error: rateErr } = await supabase.from('market_rates').insert(newRates)
  if (rateErr) console.error('market_rates insert error:', rateErr)

  // Cleanup old entries (keep 365)
  const { data: old } = await supabase
    .from('market_rates').select('id').order('updated_at', { ascending: true })
  if (old && old.length > 365) {
    const toDelete = old.slice(0, old.length - 365).map((r: any) => r.id)
    await supabase.from('market_rates').delete().in('id', toDelete)
  }

  // ── 5. Upsert energy tariffs ────────────────────────────────────────────────
  const tariffRows = ENERGY_TARIFFS.map(t => ({
    ...t,
    valid_month: month,
    source: 'bestenergydeals.gr + official-sites',
    updated_at: now.toISOString(),
  }))

  const { error: tariffErr } = await supabase
    .from('energy_tariffs')
    .upsert(tariffRows, { onConflict: 'tariff_id,valid_month' })

  if (tariffErr) {
    console.error('energy_tariffs upsert error:', tariffErr)
  } else {
    console.log(`✓ energy_tariffs: ${tariffRows.length} τιμολόγια για ${month}`)
  }

  // ── 6. Manage program deadlines ─────────────────────────────────────────────
  const programResults = await manageProgramDeadlines()

  // ── 7. Log a significant change ─────────────────────────────────────────────
  // NB: this previously tried to insert into `notification_log`, whose columns are
  // (user_id, event_id, reminder_type) — none of which fit a global market alert —
  // so every insert failed and was swallowed. `notification_log` is strictly a
  // per-user event-reminder ledger. User-facing rate-change alerts are delivered
  // by the weekly `send-market-digest` job (which reads `market_rates`), so here we
  // just record the change to the function log for observability.
  if (newRates.rate_changed) {
    console.log(`⚠ Euribor 3M ${prev3m.toFixed(2)}% → ${newRates.euribor_3m.toFixed(2)}% (Δ ${delta3m.toFixed(2)}%) — picked up by the weekly market digest.`)
  }

  // ── Response ────────────────────────────────────────────────────────────────
  const response = {
    success: !rateErr && !tariffErr,
    timestamp: now.toISOString(),
    month,
    rates: {
      euribor_3m:      newRates.euribor_3m,
      euribor_1m:      newRates.euribor_1m,
      ecb_rate:        newRates.ecb_rate,
      bog_housing_new: newRates.bog_housing_new,
    },
    sources: {
      euribor: newRates.source_euribor,
      bog:     newRates.source_bog,
    },
    energy_tariffs: {
      count: tariffRows.length,
      month,
      error: tariffErr?.message ?? null,
    },
    significantChange: newRates.rate_changed,
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
// γύριζε null, και ο βρόχος δεν έτρεχε ΠΟΤΕ.
//
// Το cron τρέχει κάθε πρωί στις 08:00 UTC και επέστρεφε καθαρή, άδεια λίστα.
// Δηλαδή: ληγμένα προγράμματα («Σπίτι μου ΙΙ», «Εξοικονομώ») έμεναν για πάντα
// ενεργά στην καρτέλα Δάνειο, και καμία υπενθύμιση προθεσμίας στις 90, 60, 30,
// 14 και 7 ημέρες δεν δημιουργήθηκε ποτέ. Ο ιδιοκτήτης έχανε την προθεσμία
// επιδότησης και τίποτα δεν του το είπε.
//
// Η μία πηγή αλήθειας για το «ενεργό» είναι το `status`: η όψη
// `active_loan_programs` φιλτράρει ήδη με
// `coalesce(status,'active') <> 'ended' and (deadline is null or deadline >= current_date)`.
// Μια στήλη `is_active` θα ήταν δεύτερη, και θα απέκλιναν.
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

async function createProgramReminders(prog: any, daysLeft: number) {
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
      title:       `${prog.name} — Λήγει σε ${daysLeft} ημέρες`,
      category:    'financial',
      event_date:  prog.deadline,
      priority:    daysLeft <= 14 ? 'high' : daysLeft <= 30 ? 'medium' : 'low',
      status:      'pending',
      notes:       prog.deadline_label ?? `Προθεσμία προγράμματος ${prog.name}.`,
      source:      'system',
    })
  }
}