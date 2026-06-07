import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FROM_EMAIL     = 'Property OS <onboarding@resend.dev>'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function buildEmail(events: any[], reminderType: string) {
  const typeLabel: Record<string, string> = {
    '7days': '7 μέρες', '3days': '3 μέρες', '1day': 'αύριο', 'today': 'ΣΗΜΕΡΑ', 'overdue': 'εκπρόθεσμα',
  }
  const catColors: Record<string, string> = {
    financial: '#d4af42', bills: '#60a5fa', maintenance: '#34d399', contract: '#a78bfa', tenant: '#fb923c', reminder: '#9ca3af',
  }
  const catLabels: Record<string, string> = {
    financial: 'Οικονομικά', bills: 'Λογαριασμοί', maintenance: 'Συντήρηση', contract: 'Συμβόλαιο', tenant: 'Ενοικιαστής', reminder: 'Υπενθύμιση',
  }
  const isUrgent = reminderType === 'today' || reminderType === 'overdue'
  const totalAmount = events.reduce((s: number, e: any) => s + (e.amount || 0), 0)

  const eventRows = events.map(e => {
    const color = catColors[e.category] || '#9ca3af'
    const label = catLabels[e.category] || e.category
    const dateStr = e.event_date ? new Date(e.event_date).toLocaleDateString('el-GR') : ''
    return `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #1e1e30;">
          <span style="display:inline-block;width:4px;height:36px;background:${color};border-radius:2px;vertical-align:middle;margin-right:10px;"></span>
          <span style="vertical-align:middle;">
            <span style="display:block;font-size:14px;color:#e2e2f0;font-weight:500;">${e.title}</span>
            <span style="display:block;font-size:11px;color:#5a5a70;font-family:monospace;">${label} · ${dateStr}</span>
          </span>
        </td>
        <td style="padding:10px 0;border-bottom:1px solid #1e1e30;text-align:right;vertical-align:middle;">
          ${e.amount ? `<span style="font-family:monospace;font-size:14px;color:#d4af42;font-weight:600;">${Number(e.amount).toLocaleString('el-GR', { style: 'currency', currency: 'EUR' })}</span>` : '<span style="color:#3a3a54;">—</span>'}
        </td>
      </tr>`
  }).join('')

  const subject = isUrgent
    ? `⚠️ Property OS — ${events.length} ${reminderType === 'overdue' ? 'εκπρόθεσμα γεγονότα' : 'γεγονότα ΣΗΜΕΡΑ'}`
    : `🔔 Property OS — ${events.length} γεγονότα σε ${typeLabel[reminderType]}`

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#08080d;font-family:-apple-system,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:28px;">
      <div style="width:36px;height:36px;background:#d4af42;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;">
        <span style="color:#08080d;font-weight:800;font-size:18px;">P</span>
      </div>
      <span style="font-size:16px;font-weight:700;color:#e2e2f0;margin-left:10px;">Property OS</span>
    </div>
    <div style="background:${isUrgent ? 'rgba(248,113,113,0.1)' : 'rgba(212,175,66,0.08)'};border:1px solid ${isUrgent ? 'rgba(248,113,113,0.3)' : 'rgba(212,175,66,0.25)'};border-radius:10px;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-size:11px;color:${isUrgent ? '#f87171' : '#d4af42'};font-family:monospace;text-transform:uppercase;letter-spacing:0.08em;">${isUrgent ? '⚠ Απαιτείται Δράση' : '🔔 Υπενθύμιση'}</p>
      <p style="margin:0;font-size:15px;color:#e2e2f0;font-weight:500;">${events.length} γεγονότα ${reminderType === 'overdue' ? 'είναι εκπρόθεσμα' : reminderType === 'today' ? 'πρέπει να διεκπεραιωθούν σήμερα' : `λήγουν σε ${typeLabel[reminderType]}`}</p>
      ${totalAmount > 0 ? `<p style="margin:6px 0 0;font-size:13px;color:#d4af42;font-family:monospace;">Σύνολο: ${totalAmount.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' })}</p>` : ''}
    </div>
    <div style="background:#12121f;border:1px solid #242438;border-radius:10px;padding:0 20px;margin-bottom:24px;">
      <table style="width:100%;border-collapse:collapse;">${eventRows}</table>
    </div>
    <div style="text-align:center;margin-bottom:28px;">
      <a href="https://propertyos-psi.vercel.app/dashboard" style="display:inline-block;background:#d4af42;color:#08080d;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:13px;font-family:monospace;text-transform:uppercase;letter-spacing:0.08em;">Άνοιγμα Property OS →</a>
    </div>
    <p style="text-align:center;font-size:11px;color:#3a3a54;font-family:monospace;">Property OS · Αυτόματη ειδοποίηση ημερολογίου</p>
  </div>
</body></html>`

  return { subject, html }
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  })
  return res.ok
}

Deno.serve(async (_req) => {
  const today = new Date(); today.setHours(0,0,0,0)
  const todayStr = today.toISOString().split('T')[0]
  const in1day  = new Date(today); in1day.setDate(today.getDate()+1)
  const in3days = new Date(today); in3days.setDate(today.getDate()+3)
  const in7days = new Date(today); in7days.setDate(today.getDate()+7)
  const fmt = (d: Date) => d.toISOString().split('T')[0]

  try {
    const { data: prefs } = await supabase.from('notification_preferences').select('*').eq('email_enabled', true)
    if (!prefs?.length) return new Response(JSON.stringify({ message: 'No users' }), { status: 200 })

    let totalSent = 0

    for (const pref of prefs) {
      if (!pref.reminder_email) continue
      const { data: events } = await supabase.from('calendar_events').select('*').eq('user_id', pref.user_id).eq('status', 'pending')
      if (!events?.length) continue

      const checks = [
        { type: '7days', enabled: pref.reminder_7days, date: fmt(in7days) },
        { type: '3days', enabled: pref.reminder_3days, date: fmt(in3days) },
        { type: '1day',  enabled: pref.reminder_1day,  date: fmt(in1day)  },
        { type: 'today', enabled: true,                 date: todayStr     },
      ]

      for (const check of checks) {
        if (!check.enabled) continue
        const matching = events.filter((e: any) => e.event_date === check.date)
        if (!matching.length) continue
        const { data: sent } = await supabase.from('notification_log').select('event_id').in('event_id', matching.map((e:any)=>e.id)).eq('reminder_type', check.type)
        const sentIds = new Set((sent||[]).map((l:any)=>l.event_id))
        const toSend  = matching.filter((e:any) => !sentIds.has(e.id))
        if (!toSend.length) continue
        const { subject, html } = buildEmail(toSend, check.type)
        const ok = await sendEmail(pref.reminder_email, subject, html)
        if (ok) {
          await supabase.from('notification_log').insert(toSend.map((e:any) => ({ user_id: pref.user_id, event_id: e.id, reminder_type: check.type })))
          totalSent++
        }
      }

      const overdue = events.filter((e:any) => e.event_date < todayStr)
      if (overdue.length) {
        const { data: sentOD } = await supabase.from('notification_log').select('event_id').in('event_id', overdue.map((e:any)=>e.id)).eq('reminder_type','overdue')
        const sentODIds = new Set((sentOD||[]).map((l:any)=>l.event_id))
        const toSendOD  = overdue.filter((e:any) => !sentODIds.has(e.id))
        if (toSendOD.length) {
          const { subject, html } = buildEmail(toSendOD, 'overdue')
          const ok = await sendEmail(pref.reminder_email, subject, html)
          if (ok) {
            await supabase.from('notification_log').insert(toSendOD.map((e:any) => ({ user_id: pref.user_id, event_id: e.id, reminder_type: 'overdue' })))
            totalSent++
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true, sent: totalSent }), { status: 200 })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})