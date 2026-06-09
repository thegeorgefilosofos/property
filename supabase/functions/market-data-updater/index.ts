// supabase/functions/market-data-updater/index.ts
// Τρέχει κάθε πρωί 07:00 UTC
// Τραβάει: ECB Euribor 3M/1M + ECB Policy Rate + ΤτΕ avg mortgage (ECB MIR)
// Deploy: npx supabase functions deploy market-data-updater --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// ─── ECB SDW API helpers ───────────────────────────────────────────────────────
async function fetchECBSeries(seriesKey: string, lastN = 1): Promise<number | null> {
  const url = `https://data-api.ecb.europa.eu/service/data/${seriesKey}?lastNObservations=${lastN}&format=jsondata`
  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const data = await res.json()
    // ECB API returns observations as { "0": value, ... } keyed by time index
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

// ─── All ECB series we fetch ───────────────────────────────────────────────────
const SERIES = {
  // Euribor — EMMI published via ECB
  euribor_3m: 'FM/B.U2.EUR.RT0.MM.EURIBOR3MD_.HSTA',
  euribor_1m: 'FM/B.U2.EUR.RT0.MM.EURIBOR1MD_.HSTA',
  euribor_6m: 'FM/B.U2.EUR.RT0.MM.EURIBOR6MD_.HSTA',
  euribor_12m:'FM/B.U2.EUR.RT0.MM.EURIBOR1YD_.HSTA',
  // ECB policy rates
  ecb_rate:   'FM/B.U2.EUR.RT0.MR.MRR_FR.IR.HSTA',
  ecb_dfl:    'FM/B.U2.EUR.RT0.MR.DFR.IR.HSTA',    // Deposit facility rate
  // Greek MFI interest rates (ΤτΕ via ECB MIR)
  // Housing loans to households — floating + up to 1yr initial rate fixation
  bog_housing_new:   'MIR/M.GR.B.A2C.F.R.A.2250.EUR.N',  // new loans
  bog_housing_stock: 'MIR/M.GR.B.A2C.I.R.A.2250.EUR.N',  // outstanding stock
}

Deno.serve(async (req) => {
  console.log('=== Market Data Updater ===', new Date().toISOString())

  // 1. Fetch all in parallel
  const results = await Promise.all(
    Object.entries(SERIES).map(async ([key, series]) => {
      const val = await fetchECBSeries(series)
      console.log(`${key}: ${val ?? 'NULL (will use fallback)'}`)
      return [key, val] as const
    })
  )
  const fetched = Object.fromEntries(results)

  // 2. Load last known good values as fallback
  const { data: last } = await supabase
    .from('market_rates')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const fb = last ?? {}

  // 3. Build update record
  const newRates = {
    euribor_3m:        fetched.euribor_3m       ?? fb.euribor_3m       ?? 2.18,
    euribor_1m:        fetched.euribor_1m       ?? fb.euribor_1m       ?? 2.05,
    euribor_6m:        fetched.euribor_6m       ?? fb.euribor_6m       ?? 2.30,
    euribor_12m:       fetched.euribor_12m      ?? fb.euribor_12m      ?? 2.45,
    ecb_rate:          fetched.ecb_rate         ?? fb.ecb_rate         ?? 2.40,
    ecb_dfl:           fetched.ecb_dfl          ?? fb.ecb_dfl          ?? 2.25,
    bog_housing_new:   fetched.bog_housing_new  ?? fb.bog_housing_new  ?? 3.43,
    bog_housing_stock: fetched.bog_housing_stock?? fb.bog_housing_stock?? 3.50,
    source_euribor: fetched.euribor_3m ? 'ECB EMMI live' : 'fallback',
    source_bog:     fetched.bog_housing_new ? 'ECB MIR live' : 'fallback',
    updated_at: new Date().toISOString(),
    rate_changed: false,
  }

  // 4. Detect significant change (>= 0.10% shift in Euribor 3M)
  const prev3m = fb.euribor_3m ?? newRates.euribor_3m
  const delta3m = Math.abs(newRates.euribor_3m - prev3m)
  const significantChange = delta3m >= 0.10

  if (significantChange) {
    console.log(`⚠️ Significant Euribor change: ${prev3m}% → ${newRates.euribor_3m}% (Δ${delta3m.toFixed(3)}%)`)
    newRates.rate_changed = true
  }

  // 5. Upsert into market_rates (keep last 365 rows, delete older)
  const { error: insertError } = await supabase.from('market_rates').insert(newRates)
  if (insertError) console.error('Insert error:', insertError)

  // 6. Cleanup — keep last 365 entries
  const { data: old } = await supabase
    .from('market_rates')
    .select('id')
    .order('updated_at', { ascending: true })
  if (old && old.length > 365) {
    const toDelete = old.slice(0, old.length - 365).map(r => r.id)
    await supabase.from('market_rates').delete().in('id', toDelete)
    console.log(`Cleaned up ${toDelete.length} old entries`)
  }

  // 7. Auto-manage program deadlines
  const programResults = await manageProgramDeadlines()

  // 8. Send alert notification if significant change
  if (significantChange) {
    await supabase.from('notification_log').insert({
      type: 'market_alert',
      title: `Euribor άλλαξε: ${fmtPct(prev3m)} → ${fmtPct(newRates.euribor_3m)}`,
      body: `Euribor 3M μεταβλήθηκε κατά ${delta3m.toFixed(2)}%. Ελέγξτε τις κυμαινόμενες δόσεις σας.`,
      data: { prev: prev3m, current: newRates.euribor_3m, delta: delta3m },
      created_at: new Date().toISOString(),
    }).catch(() => {}) // non-critical
  }

  const response = {
    success: !insertError,
    timestamp: newRates.updated_at,
    rates: {
      euribor_3m: newRates.euribor_3m,
      euribor_1m: newRates.euribor_1m,
      ecb_rate: newRates.ecb_rate,
      bog_housing_new: newRates.bog_housing_new,
    },
    sources: {
      euribor: newRates.source_euribor,
      bog: newRates.source_bog,
    },
    significantChange,
    programs: programResults,
  }

  console.log('Result:', JSON.stringify(response, null, 2))
  return new Response(JSON.stringify(response), { headers: { 'Content-Type': 'application/json' } })
})

// ─── Program deadline management ──────────────────────────────────────────────
async function manageProgramDeadlines() {
  const today = new Date()
  const { data: programs } = await supabase
    .from('loan_programs')
    .select('*')
    .eq('is_active', true)
    .not('deadline', 'is', null)

  const results: string[] = []

  for (const prog of (programs ?? [])) {
    const dl = new Date(prog.deadline)
    const daysLeft = Math.ceil((dl.getTime() - today.getTime()) / 86400000)

    if (daysLeft < 0) {
      // Auto-deactivate
      await supabase.from('loan_programs')
        .update({ is_active: false, status: 'expired', expired_at: today.toISOString() })
        .eq('id', prog.id)
      results.push(`EXPIRED: ${prog.name}`)
      console.log(`✗ Auto-deactivated expired program: ${prog.name}`)

    } else {
      // Update urgency flag
      const shouldBeUrgent = daysLeft <= 30
      if (shouldBeUrgent !== prog.deadline_urgent) {
        await supabase.from('loan_programs')
          .update({ deadline_urgent: shouldBeUrgent })
          .eq('id', prog.id)
      }

      // Create calendar reminders at key milestones
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
  // Get users with matching active loans
  const { data: loans } = await supabase
    .from('loans')
    .select('user_id, property_id')
    .eq('status', 'active')

  for (const loan of (loans ?? [])) {
    // Check if reminder already exists
    const { data: existing } = await supabase
      .from('calendar_events')
      .select('id')
      .eq('user_id', loan.user_id)
      .like('title', `%${prog.name}%`)
      .gte('event_date', prog.deadline)
      .limit(1)

    if (existing?.length) continue

    await supabase.from('calendar_events').insert({
      user_id: loan.user_id,
      property_id: loan.property_id,
      title: `⚠️ ${prog.name} — Λήγει σε ${daysLeft} ημέρες`,
      category: 'financial',
      event_date: prog.deadline,
      priority: daysLeft <= 14 ? 'high' : daysLeft <= 30 ? 'medium' : 'low',
      status: 'pending',
      notes: prog.deadline_note ?? `Deadline προγράμματος ${prog.name}. Ελέγξτε ${prog.source_url}`,
      source: 'system',
    })
  }
}

function fmtPct(n: number) { return `${n.toFixed(2)}%` }