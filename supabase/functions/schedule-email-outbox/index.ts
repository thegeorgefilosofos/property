// ─────────────────────────────────────────────────────────────────────────
// schedule-email-outbox — the cadence guard in front of the outbox drain.
//
// Runs on a cron a few minutes before the drain. For each recipient with due,
// UNPLANNED pending rows it applies the anti-spam policy (emailPolicy.scheduleBatch):
// consolidates same-day obligations into one digest, keeps one opportunity and one
// lifecycle, spreads them across the day's slots, and defers the overflow. So the
// drain only ever sends a measured, staggered set — never ten emails at 08:00.
//
// The state gate: a fresh enqueue has send_window = NULL. This scheduler stamps
// send_window on every row it plans (and inserts digests already stamped), so it
// NEVER re-processes a planned row, and the drain only sends rows that are either
// planned (send_window not null) or transactional. Time math is Europe/Athens, so
// quiet hours actually hold for Greek users. Caps count already-scheduled volume,
// not just what is already sent. Nothing here sends — it only schedules.
//
// Deploy (once a domain is verified): supabase functions deploy schedule-email-outbox
// then schedule it a couple of minutes before the drain (see the migration).
// ─────────────────────────────────────────────────────────────────────────
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { scheduleBatch, policyFor, type OutboxRow } from '../_shared/emailPolicy.ts'
import { CATALOG, DIGESTS } from '../_shared/emailCopy.ts'
import { authorizeCron } from '../_shared/auth.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET  = Deno.env.get('LIFECYCLE_CRON_SECRET') || ''
const TZ = 'Europe/Athens'

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })
const titleOf = (copyId: string): string => {
  try { return ({ ...CATALOG, ...DIGESTS })[copyId]?.({ appUrl: 'https://propertyos.gr' })?.subject || copyId } catch { return copyId }
}

async function authorized(req: Request): Promise<boolean> {
  return authorizeCron(req, { serviceKey: SERVICE_KEY, envSecret: CRON_SECRET, supabase })
}

// ── Europe/Athens time helpers (Deno Deploy runs in UTC) ────────────────────
function athensOffsetMs(d: Date): number {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(d).reduce((a, x) => (a[x.type] = x.value, a), {} as Record<string, string>)
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour === 24 ? 0 : +p.hour, +p.minute, +p.second)
  return asUTC - d.getTime()  // ms Athens is ahead of UTC
}
function athensYMD(d: Date): [number, number, number] {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  const [Y, M, D] = s.split('-').map(Number); return [Y, M, D]
}
// An 'HH:MM' Athens wall-clock today → UTC ISO. 'now' → now.
function atToday(clock: string): string {
  if (clock === 'now') return new Date().toISOString()
  const now = new Date(); const off = athensOffsetMs(now); const [Y, M, D] = athensYMD(now)
  const [h, m] = clock.split(':').map(Number)
  return new Date(Date.UTC(Y, M - 1, D, h, m) - off).toISOString()
}
function startOfAthensDayISO(): string {
  const now = new Date(); const off = athensOffsetMs(now); const [Y, M, D] = athensYMD(now)
  return new Date(Date.UTC(Y, M - 1, D, 0, 0) - off).toISOString()
}
// Next day's morning slot, in UTC ISO — where deferred rows go.
function tomorrowMorningISO(): string {
  const t = new Date(atToday('08:30')); t.setDate(t.getDate() + 1); return t.toISOString()
}

Deno.serve(async (req) => {
  if (!(await authorized(req))) return json({ error: 'unauthorized' }, 401)

  // Single-flight: if another run holds the advisory lock, exit cleanly so two
  // overlapping cron ticks never plan the same rows.
  const { data: gotLock } = await supabase.rpc('try_email_schedule_lock')
  if (gotLock === false) return json({ skipped: 'locked' })

  try {
  const nowISO = new Date().toISOString()
  const weekAgoISO = new Date(Date.now() - 7 * 864e5).toISOString()
  const dayStartISO = startOfAthensDayISO()

  // Only FRESH, non-transactional rows that are due: send_window IS NULL means the
  // scheduler has not planned them yet. Transactional bypasses the scheduler and the
  // drain sends it immediately.
  const { data: pending, error } = await supabase
    .from('email_outbox')
    .select('id,copy_id,to_email,to_name,category,params,scheduled_for')
    .eq('status', 'pending').is('send_window', null).neq('category', 'transactional')
    .lte('scheduled_for', nowISO).order('scheduled_for', { ascending: true }).limit(2000)
  if (error) return json({ error: error.message }, 500)
  if (!pending?.length) return json({ recipients: 0, scheduled: 0, digests: 0 })

  const byRecipient = new Map<string, typeof pending>()
  for (const r of pending) { if (!byRecipient.has(r.to_email)) byRecipient.set(r.to_email, []); byRecipient.get(r.to_email)!.push(r) }

  let scheduled = 0, digestsMade = 0
  for (const [email, rows] of byRecipient) {
    try {
      // Non-transactional volume already committed (sent OR already planned) this
      // Athens-day / rolling week — so a later run cannot hand out a fresh budget.
      const { data: committed } = await supabase
        .from('email_outbox')
        .select('sent_at,scheduled_for,status,send_window')
        .eq('to_email', email).neq('category', 'transactional').gte('scheduled_for', weekAgoISO)
        .or('status.eq.sent,send_window.not.is.null')
      const eff = (r: { sent_at?: string; scheduled_for?: string }) => r.sent_at || r.scheduled_for || ''
      const sentThisWeekNonTx = (committed || []).length
      const sentTodayNonTx = (committed || []).filter(r => eff(r) >= dayStartISO).length

      const batch: OutboxRow[] = rows.map(r => ({ id: r.id, copyId: r.copy_id }))
      const { rows: decisions, digests } = scheduleBatch(batch, { recipientKey: email, sentTodayNonTx, sentThisWeekNonTx })

      // Digest inserts — one row the drain will send; members get skipped.
      for (const dg of digests) {
        const members = rows.filter(r => dg.memberIds.includes(r.id))
        const digestItems = members.map(m => ({ title: titleOf(m.copy_id) }))
        const day = dayStartISO.slice(0, 10)
        const { error: dErr } = await supabase.from('email_outbox').insert({
          copy_id: dg.copyId, to_email: email, to_name: members[0]?.to_name ?? null,
          category: 'operational', priority: 2, send_window: 'morning',
          params: { ...(members[0]?.params || {}), digestItems },
          dedup_key: `${dg.copyId}:${email}:${day}`, scheduled_for: atToday(dg.at),
        })
        if (!dErr) digestsMade++   // duplicate (same dedup_key) silently no-ops
      }

      // Row-level decisions.
      for (const d of decisions) {
        const pol = policyFor(rows.find(r => r.id === d.id)!.copy_id)
        if (d.viaDigest) {
          await supabase.from('email_outbox').update({ status: 'skipped', last_error: `merged:${d.viaDigest}` }).eq('id', d.id).eq('status', 'pending')
        } else if (d.action === 'defer') {
          await supabase.from('email_outbox').update({ scheduled_for: tomorrowMorningISO() }).eq('id', d.id).eq('status', 'pending').is('send_window', null)
        } else {
          await supabase.from('email_outbox').update({ priority: pol.priority, send_window: pol.slot, scheduled_for: atToday(d.at) }).eq('id', d.id).eq('status', 'pending')
          scheduled++
        }
      }
    } catch (e) {
      console.error('schedule failed for', email, e instanceof Error ? e.message : e)
    }
  }

  return json({ recipients: byRecipient.size, scheduled, digests: digestsMade })
  } finally {
    await supabase.rpc('release_email_schedule_lock')
  }
})
