// ─────────────────────────────────────────────────────────────────────────
// schedule-email-outbox — the cadence guard in front of the outbox drain.
//
// Runs on a cron a few minutes before the drain. For each recipient with due
// pending rows it applies the anti-spam policy (emailPolicy.scheduleBatch):
// consolidates same-day obligations into one digest, keeps one opportunity and
// one lifecycle, spreads them across the day's slots, and defers the overflow to
// tomorrow. So the drain only ever sends a measured, staggered set — never ten
// emails at 08:00. The drain itself stays dumb (send what is due now).
//
// Auth is zero-config (service-role bearer / x-cron-secret / cron_secrets), same
// as the drain. Idempotent: only touches rows still 'pending', and a digest row
// is deduped by dedup_key. Nothing here sends — it only schedules.
//
// Deploy (once a domain is verified): supabase functions deploy schedule-email-outbox
// then: select cron.schedule('email-outbox-schedule','*/5 * * * *',
//        $$ select net.http_post(... this function ...) $$);
// ─────────────────────────────────────────────────────────────────────────
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { scheduleBatch, policyFor, SLOT_TIME, type OutboxRow } from '../_shared/emailPolicy.ts'
import { CATALOG } from '../_shared/emailCopy.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET  = Deno.env.get('LIFECYCLE_CRON_SECRET') || ''

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

async function authorized(req: Request): Promise<boolean> {
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (SERVICE_KEY && bearer === SERVICE_KEY) return true
  const header = req.headers.get('x-cron-secret') || ''
  if (CRON_SECRET && header === CRON_SECRET) return true
  if (header) {
    const { data } = await supabase.from('cron_secrets').select('secret').eq('name', 'email_cron').maybeSingle()
    if (data?.secret && header === data.secret) return true
  }
  return false
}

// 'HH:MM' clock (today, UTC-safe enough for scheduling) → ISO timestamp.
function atToday(clock: string): string {
  if (clock === 'now') return new Date().toISOString()
  const [h, m] = clock.split(':').map(Number)
  const d = new Date(); d.setHours(h, m, 0, 0)
  return d.toISOString()
}
const subjectOf = (copyId: string): string => {
  try { return CATALOG[copyId]?.({ appUrl: 'https://propertyos.gr' })?.subject || copyId } catch { return copyId }
}

Deno.serve(async (req) => {
  if (!(await authorized(req))) return json({ error: 'unauthorized' }, 401)

  const since = new Date(Date.now() - 7 * 864e5).toISOString()
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)

  // Pending rows due today or earlier, oldest first.
  const { data: pending, error } = await supabase
    .from('email_outbox')
    .select('id,copy_id,to_email,to_name,category,params,scheduled_for')
    .eq('status', 'pending')
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(2000)
  if (error) return json({ error: error.message }, 500)
  if (!pending?.length) return json({ scheduled: 0, digests: 0 })

  // Group by recipient.
  const byRecipient = new Map<string, typeof pending>()
  for (const r of pending) { const k = r.to_email; if (!byRecipient.has(k)) byRecipient.set(k, []); byRecipient.get(k)!.push(r) }

  let scheduled = 0, digestsMade = 0

  for (const [email, rows] of byRecipient) {
    // How much non-transactional already went out today / this rolling week.
    const { data: sentRows } = await supabase
      .from('email_outbox')
      .select('priority,sent_at')
      .eq('to_email', email).eq('status', 'sent').gte('sent_at', since)
    const sentTodayNonTx = (sentRows || []).filter(s => s.priority > 1 && s.sent_at >= startOfDay.toISOString()).length
    const sentThisWeekNonTx = (sentRows || []).filter(s => s.priority > 1).length

    const batch: OutboxRow[] = rows.map(r => ({ id: r.id, copyId: r.copy_id }))
    const { rows: decisions, digests } = scheduleBatch(batch, { recipientKey: email, sentTodayNonTx, sentThisWeekNonTx })

    // Digest inserts — one row that the drain will send; members get skipped.
    for (const dg of digests) {
      const members = rows.filter(r => dg.memberIds.includes(r.id))
      const digestItems = members.map(m => ({ title: subjectOf(m.copy_id) }))
      const day = startOfDay.toISOString().slice(0, 10)
      await supabase.from('email_outbox').insert({
        copy_id: dg.copyId, to_email: email, to_name: members[0]?.to_name ?? null,
        category: 'operational', priority: 2, send_window: 'morning',
        params: { ...(members[0]?.params || {}), digestItems },
        dedup_key: `${dg.copyId}:${email}:${day}`, scheduled_for: atToday(dg.at),
      })
      digestsMade++
    }

    // Row-level decisions.
    for (const d of decisions) {
      const pol = policyFor(rows.find(r => r.id === d.id)!.copy_id)
      if (d.viaDigest) {
        await supabase.from('email_outbox').update({ status: 'skipped', last_error: `merged:${d.viaDigest}` }).eq('id', d.id).eq('status', 'pending')
      } else if (d.action === 'defer') {
        const tomorrow = new Date(atToday(SLOT_TIME.morning)); tomorrow.setDate(tomorrow.getDate() + 1)
        await supabase.from('email_outbox').update({ status: 'pending', scheduled_for: tomorrow.toISOString() }).eq('id', d.id).eq('status', 'pending')
      } else {
        await supabase.from('email_outbox').update({ priority: pol.priority, send_window: pol.slot, scheduled_for: atToday(d.at) }).eq('id', d.id).eq('status', 'pending')
        scheduled++
      }
    }
  }

  return json({ recipients: byRecipient.size, scheduled, digests: digestsMade })
})
