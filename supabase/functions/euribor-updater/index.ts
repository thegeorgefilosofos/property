// supabase/functions/euribor-updater/index.ts
// Τρέχει κάθε πρωί 07:00 UTC — τραβάει Euribor από ECB & ΤτΕ
// Deploy: npx supabase functions deploy euribor-updater --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// ECB Statistical Data Warehouse API — public, no auth needed
const ECB_EURIBOR_3M = 'https://data-api.ecb.europa.eu/service/data/FM/B.U2.EUR.RT0.MM.EURIBOR3MD_.HSTA?lastNObservations=1&format=jsondata'
const ECB_EURIBOR_1M = 'https://data-api.ecb.europa.eu/service/data/FM/B.U2.EUR.RT0.MM.EURIBOR1MD_.HSTA?lastNObservations=1&format=jsondata'
const ECB_RATE       = 'https://data-api.ecb.europa.eu/service/data/FM/B.U2.EUR.RT0.MR.MRR_FR.IR.HSTA?lastNObservations=1&format=jsondata'

async function fetchECBRate(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } })
    if (!res.ok) return null
    const data = await res.json()
    const obs = data?.dataSets?.[0]?.series?.['0:0:0:0:0:0:0']?.observations
    if (!obs) return null
    const lastKey = Object.keys(obs).sort().pop()
    if (!lastKey) return null
    const val = obs[lastKey]?.[0]
    return typeof val === 'number' ? Math.round(val * 1000) / 1000 : null
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  // Allow cron trigger
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  const [euribor3m, euribor1m, ecbRate] = await Promise.all([
    fetchECBRate(ECB_EURIBOR_3M),
    fetchECBRate(ECB_EURIBOR_1M),
    fetchECBRate(ECB_RATE),
  ])

  // Fallback to last known values if ECB API fails
  const { data: last } = await supabase
    .from('market_rates')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const newRates = {
    euribor_3m: euribor3m ?? last?.euribor_3m ?? 2.18,
    euribor_1m: euribor1m ?? last?.euribor_1m ?? 2.05,
    ecb_rate:   ecbRate   ?? last?.ecb_rate   ?? 2.40,
    updated_at: new Date().toISOString(),
  }

  // Keep history — insert new row
  const { error } = await supabase.from('market_rates').insert(newRates)

  // Log result
  console.log('Euribor update:', newRates, error ? `ERROR: ${error.message}` : 'OK')

  // Also check Spiti mou II deadline & create calendar reminders
  await checkProgramDeadlines(supabase)

  return new Response(JSON.stringify({
    success: !error,
    rates: newRates,
    source: euribor3m ? 'ECB API' : 'fallback',
  }), { headers: { 'Content-Type': 'application/json' } })
})

async function checkProgramDeadlines(supabase: any) {
  const SPITI_DEADLINE = new Date('2026-08-31')
  const today = new Date()
  const daysLeft = Math.ceil((SPITI_DEADLINE.getTime() - today.getTime()) / 86400000)

  // Only send reminders at 60, 30, 14, 7 days before
  if (![60, 30, 14, 7].includes(daysLeft)) return

  // Get all users with first_home loans
  const { data: loans } = await supabase
    .from('loans')
    .select('user_id, property_id')
    .eq('loan_type', 'first_home')
    .eq('status', 'active')

  if (!loans?.length) return

  for (const loan of loans) {
    // Check if reminder already exists
    const { data: existing } = await supabase
      .from('calendar_events')
      .select('id')
      .eq('user_id', loan.user_id)
      .eq('property_id', loan.property_id)
      .like('title', '%Σπίτι μου ΙΙ%')
      .gte('event_date', SPITI_DEADLINE.toISOString().split('T')[0])
      .limit(1)

    if (existing?.length) continue

    // Create reminder event
    await supabase.from('calendar_events').insert({
      user_id: loan.user_id,
      property_id: loan.property_id,
      title: `⚠️ Σπίτι μου ΙΙ — Deadline σε ${daysLeft} μέρες (31/08/2026)`,
      category: 'financial',
      event_date: SPITI_DEADLINE.toISOString().split('T')[0],
      priority: daysLeft <= 14 ? 'high' : 'medium',
      status: 'pending',
      notes: 'Τελευταία ημέρα συμβασιοποίησης Σπίτι μου ΙΙ — ελέγξτε greece20.gov.gr',
      source: 'system',
    })
  }
}