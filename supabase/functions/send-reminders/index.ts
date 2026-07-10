import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// Μυστικό cron: μόνο ο προγραμματιστής (pg_cron) που στέλνει το σωστό x-cron-secret
// μπορεί να πυροδοτήσει το sweep. Ίδιο μοτίβο με το ical-sync (least privilege — ΔΕΝ
// χρειάζεται πια το service-role key στην κλήση). Το function κρατά το δικό του
// service key εσωτερικά για τα queries.
const CRON_SECRET    = Deno.env.get('REMINDERS_CRON_SECRET') || ''
const FROM_EMAIL     = 'Property OS <onboarding@resend.dev>'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function buildEmail(events: any[], reminderType: string) {
  const typeLabel: Record<string, string> = {
    '7days': '7 μέρες', '3days': '3 μέρες', '1day': 'αύριο', 'today': 'ΣΗΜΕΡΑ', 'overdue': 'εκπρόθεσμα',
  }
  const catColors: Record<string, string> = {
    financial: '#1a73e8', bills: '#4285f4', maintenance: '#34a853', contract: '#a142f4', tenant: '#f29900', reminder: '#5f6368',
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
        <td style="padding:12px 0;border-bottom:1px solid #e8eaed;">
          <span style="display:inline-block;width:4px;height:36px;background:${color};border-radius:2px;vertical-align:middle;margin-right:10px;"></span>
          <span style="vertical-align:middle;">
            <span style="display:block;font-size:14px;color:#202124;font-weight:500;">${e.title}</span>
            <span style="display:block;font-size:11px;color:#80868b;font-family:monospace;">${label} · ${dateStr}</span>
          </span>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #e8eaed;text-align:right;vertical-align:middle;">
          ${e.amount ? `<span style="font-family:monospace;font-size:14px;color:#202124;font-weight:600;">${Number(e.amount).toLocaleString('el-GR', { style: 'currency', currency: 'EUR' })}</span>` : '<span style="color:#bdc1c6;">—</span>'}
        </td>
      </tr>`
  }).join('')

  const subject = isUrgent
    ? `Property OS — ${events.length} ${reminderType === 'overdue' ? 'εκπρόθεσμα γεγονότα' : 'γεγονότα ΣΗΜΕΡΑ'}`
    : `Property OS — ${events.length} γεγονότα σε ${typeLabel[reminderType]}`

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f3f4;font-family:-apple-system,'Inter',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
      <div style="width:36px;height:36px;background:#1a73e8;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;">
        <span style="color:#ffffff;font-weight:800;font-size:18px;">P</span>
      </div>
      <span style="font-size:16px;font-weight:700;color:#202124;margin-left:10px;">Property OS</span>
    </div>
    <div style="background:#ffffff;border:1px solid #e8eaed;border-radius:14px;padding:24px;">
      <div style="background:${isUrgent ? 'rgba(217,48,37,0.08)' : 'rgba(26,115,232,0.08)'};border:1px solid ${isUrgent ? 'rgba(217,48,37,0.25)' : 'rgba(26,115,232,0.22)'};border-radius:10px;padding:16px 20px;margin-bottom:20px;">
        <p style="margin:0 0 4px;font-size:11px;color:${isUrgent ? '#d93025' : '#1a73e8'};font-family:monospace;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">${isUrgent ? 'Απαιτείται Δράση' : 'Υπενθύμιση'}</p>
        <p style="margin:0;font-size:15px;color:#202124;font-weight:500;">${events.length} γεγονότα ${reminderType === 'overdue' ? 'είναι εκπρόθεσμα' : reminderType === 'today' ? 'πρέπει να διεκπεραιωθούν σήμερα' : `λήγουν σε ${typeLabel[reminderType]}`}</p>
        ${totalAmount > 0 ? `<p style="margin:6px 0 0;font-size:13px;color:#1a73e8;font-family:monospace;font-weight:600;">Σύνολο: ${totalAmount.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' })}</p>` : ''}
      </div>
      <table style="width:100%;border-collapse:collapse;">${eventRows}</table>
      <div style="text-align:center;margin-top:24px;">
        <a href="https://propertyos-psi.vercel.app/dashboard" style="display:inline-block;background:#1a73e8;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:100px;font-weight:700;font-size:14px;">Άνοιγμα Property OS →</a>
      </div>
    </div>
    <p style="text-align:center;font-size:11px;color:#80868b;margin-top:20px;">Property OS · Αυτόματη ειδοποίηση ημερολογίου</p>
  </div>
</body></html>`

  return { subject, html }
}

// Dunning email προς τον ιδιοκτήτη για ληξιπρόθεσμες δόσεις ενοικίου.
// Ίδιο στυλ με buildEmail (header, κάρτα, Google-blue accent, CTA) αλλά πάντα
// «urgent» (#d93025) και ΧΩΡΙΣ emoji — καθαρό, επαγγελματικό κείμενο.
function buildDunningEmail(rows: any[], tenantMap: Record<string, any>, propMap: Record<string, any>, today: Date, noticeLabel: string, noticeNumber: number) {
  const total = rows.reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0)

  const rowsHtml = rows.map((r: any) => {
    const tenant = r.tenant_id != null ? (tenantMap[r.tenant_id]?.full_name || null) : null
    const prop   = r.property_id != null ? (propMap[r.property_id]?.name || null) : null
    const primary = tenant || prop || '—'
    const period = (r.period_month != null && r.period_year != null)
      ? `${String(r.period_month).padStart(2, '0')}/${r.period_year}` : '—'
    const dueStr = r.due_date ? new Date(r.due_date).toLocaleDateString('el-GR') : '—'
    const daysOverdue = r.due_date ? Math.floor((today.getTime() - new Date(r.due_date).getTime()) / 86400000) : 0
    const secondary = [tenant && prop ? prop : null, `Περίοδος ${period}`, `Λήξη ${dueStr}`].filter(Boolean).join(' · ')
    return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #e8eaed;">
          <span style="display:inline-block;width:4px;height:36px;background:#d93025;border-radius:2px;vertical-align:middle;margin-right:10px;"></span>
          <span style="vertical-align:middle;">
            <span style="display:block;font-size:14px;color:#202124;font-weight:500;">${primary}</span>
            <span style="display:block;font-size:11px;color:#80868b;font-family:monospace;">${secondary}</span>
          </span>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #e8eaed;text-align:right;vertical-align:middle;">
          <span style="font-family:monospace;font-size:14px;color:#202124;font-weight:600;">${Number(r.amount || 0).toLocaleString('el-GR', { style: 'currency', currency: 'EUR' })}</span>
          <span style="display:block;font-size:11px;color:#d93025;font-family:monospace;font-weight:700;">${daysOverdue} ${daysOverdue === 1 ? 'μέρα' : 'μέρες'} καθυστέρηση</span>
        </td>
      </tr>`
  }).join('')

  const n = rows.length
  const subject = `Property OS — ${noticeLabel}: ληξιπρόθεσμο ενοίκιο (${n} ${n === 1 ? 'δόση' : 'δόσεις'})`

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f3f4;font-family:-apple-system,'Inter',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
      <div style="width:36px;height:36px;background:#1a73e8;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;">
        <span style="color:#ffffff;font-weight:800;font-size:18px;">P</span>
      </div>
      <span style="font-size:16px;font-weight:700;color:#202124;margin-left:10px;">Property OS</span>
    </div>
    <div style="background:#ffffff;border:1px solid #e8eaed;border-radius:14px;padding:24px;">
      <div style="background:rgba(217,48,37,0.08);border:1px solid rgba(217,48,37,0.25);border-radius:10px;padding:16px 20px;margin-bottom:20px;">
        <p style="margin:0 0 4px;font-size:11px;color:#d93025;font-family:monospace;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Ληξιπρόθεσμο Ενοίκιο</p>
        <p style="margin:0;font-size:15px;color:#202124;font-weight:500;">${n} ${n === 1 ? 'δόση ενοικίου είναι ληξιπρόθεσμη' : 'δόσεις ενοικίου είναι ληξιπρόθεσμες'}</p>
        <p style="margin:6px 0 0;font-size:12px;color:#80868b;font-family:monospace;font-weight:600;">${noticeLabel} (ειδοποίηση Νο ${noticeNumber})</p>
        ${total > 0 ? `<p style="margin:6px 0 0;font-size:13px;color:#d93025;font-family:monospace;font-weight:600;">Σύνολο ληξιπρόθεσμων: ${total.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' })}</p>` : ''}
      </div>
      <table style="width:100%;border-collapse:collapse;">${rowsHtml}</table>
      <div style="text-align:center;margin-top:24px;">
        <a href="https://propertyos-psi.vercel.app/dashboard" style="display:inline-block;background:#1a73e8;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:100px;font-weight:700;font-size:14px;">Άνοιγμα Property OS →</a>
      </div>
    </div>
    <p style="text-align:center;font-size:11px;color:#80868b;margin-top:20px;">Property OS · Αυτόματη ειδοποίηση ληξιπρόθεσμου ενοικίου</p>
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

Deno.serve(async (req) => {
  // Πύλη ασφαλείας: απαιτεί το σωστό x-cron-secret (το θέτει το pg_cron). Χωρίς
  // ρυθμισμένο μυστικό ή με λάθος τιμή → 401, ώστε το endpoint να μην πυροδοτείται δημόσια.
  const cronHeader = req.headers.get('x-cron-secret') || ''
  if (!CRON_SECRET || cronHeader !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }

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

    // ── Dunning pass: αυτόματο email στον ιδιοκτήτη για ληξιπρόθεσμες δόσεις ενοικίου ──
    // Ξεχωριστό pass πάνω στα prefs (ΟΧΙ μέσα στο calendar loop) ώστε ιδιοκτήτες
    // χωρίς calendar_events — που κόβονται από το `if (!events?.length) continue` —
    // να λαμβάνουν παρ' όλα αυτά dunning για το ενοίκιο.
    //
    // CADENCE + CAP GUARANTEE: at most `dunning_max` notices per instalment, spaced
    // ≥ `dunning_every_days` days, escalating tone; disabled when dunning_enabled=false.
    // Το notification_log ΔΕΝ ορίζεται στο SETUP_ALL.sql/migrations και χρησιμοποιείται
    // πολυμορφικά (π.χ. ο market-data-updater γράφει rows χωρίς event_id), άρα το event_id
    // είναι απλό nullable uuid ΧΩΡΙΣ foreign key προς calendar_events. Επομένως αποθηκεύουμε
    // το rent_payment id στο event_id με reminder_type='rent_overdue' και κάνουμε escalation
    // βάσει του πλήθους/χρόνου των προηγούμενων ειδοποιήσεων ανά δόση.
    let dunningSent = 0
    for (const pref of prefs) {
      if (!pref.reminder_email) continue

      // Per-owner dunning settings, ασφαλή defaults (columns may be null on old rows).
      const dunningEnabled = pref.dunning_enabled !== false
      const everyDays = Number.isFinite(pref.dunning_every_days) && pref.dunning_every_days > 0 ? pref.dunning_every_days : 7
      const maxNotices = Number.isFinite(pref.dunning_max) && pref.dunning_max > 0 ? pref.dunning_max : 3
      if (!dunningEnabled) continue

      const { data: overdueRent } = await supabase.from('rent_payments')
        .select('*').eq('user_id', pref.user_id).eq('paid', false).lt('due_date', todayStr)
      // Μόνο δόσεις με non-null due_date αυστηρά πριν από σήμερα (belt-and-suspenders·
      // η .lt() ήδη αποκλείει NULL due_date στην Postgres).
      const overdue = (overdueRent || []).filter((r: any) => r.due_date != null && r.due_date < todayStr)
      if (!overdue.length) continue

      const overdueIds = overdue.map((r: any) => r.id)
      if (!overdueIds.length) continue
      // ΟΛΑ τα προηγούμενα dunning logs για αυτές τις δόσεις με μία query.
      const { data: priorLogs } = await supabase.from('notification_log')
        .select('event_id, created_at').eq('reminder_type', 'rent_overdue')
        .in('event_id', overdueIds)

      // Per-instalment: COUNT προηγούμενων ειδοποιήσεων + MAX(created_at) (πιο πρόσφατη).
      const priorCount: Record<string, number> = {}
      const lastNotice: Record<string, number> = {}
      for (const l of priorLogs || []) {
        const id = l.event_id
        priorCount[id] = (priorCount[id] || 0) + 1
        const t = l.created_at ? new Date(l.created_at).getTime() : NaN
        if (Number.isFinite(t) && (lastNotice[id] === undefined || t > lastNotice[id])) lastNotice[id] = t
      }

      // Eligible τώρα ⇔ (count < maxNotices) ΚΑΙ (καμία προηγούμενη ή η πιο πρόσφατη
      // είναι παλαιότερη από everyDays μέρες: now - lastNoticeTime >= everyDays*86400000).
      const now = new Date().getTime()
      const spacingMs = everyDays * 86400000
      const toNotify = overdue.filter((r: any) => {
        const count = priorCount[r.id] || 0
        if (count >= maxNotices) return false
        const last = lastNotice[r.id]
        return last === undefined || (now - last) >= spacingMs
      })
      if (!toNotify.length) continue

      // Escalation: notice number αυτού του send = priorCount + 1 ανά δόση· χρησιμοποιούμε
      // το MAX μεταξύ των eligible δόσεων για τον τόνο του subject.
      const noticeNumber = Math.max(...toNotify.map((r: any) => (priorCount[r.id] || 0) + 1))
      const noticeLabel = noticeNumber >= 3 ? 'Τελική υπόμνηση' : noticeNumber === 2 ? 'Δεύτερη υπενθύμιση' : 'Υπενθύμιση'

      // Batched name lookups (κανένα N+1)· skip τα .in() όταν η λίστα ids είναι κενή.
      const tenantIds = [...new Set(toNotify.map((r: any) => r.tenant_id).filter((v: any) => v != null))]
      const propIds   = [...new Set(toNotify.map((r: any) => r.property_id).filter((v: any) => v != null))]
      const tenantMap: Record<string, any> = {}
      const propMap: Record<string, any> = {}
      if (tenantIds.length) {
        const { data: tRows } = await supabase.from('tenants').select('id, full_name').in('id', tenantIds)
        for (const t of tRows || []) tenantMap[t.id] = t
      }
      if (propIds.length) {
        const { data: pRows } = await supabase.from('user_properties').select('id, name').in('id', propIds)
        for (const p of pRows || []) propMap[p.id] = p
      }

      const { subject, html } = buildDunningEmail(toNotify, tenantMap, propMap, today, noticeLabel, noticeNumber)
      const ok = await sendEmail(pref.reminder_email, subject, html)
      if (ok) {
        await supabase.from('notification_log').insert(toNotify.map((r: any) => ({
          user_id: pref.user_id, event_id: r.id, reminder_type: 'rent_overdue', created_at: new Date().toISOString(),
        })))
        dunningSent++
      }
    }

    return new Response(JSON.stringify({ success: true, sent: totalSent, dunningSent }), { status: 200 })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})