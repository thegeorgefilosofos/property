import { emailHeader } from '../_shared/emailTemplates.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.110.8'
import { APP_URL } from '../_shared/site.ts'
import { authorizeCron } from '../_shared/auth.ts'
// Οι τύποι των γραμμών βγαίνουν από τα ίδια τα migrations (npm run db-types).
// Η εισαγωγή είναι μόνο τύπων: σβήνεται στη μεταγλώττιση και δεν φτάνει στο Deno.
import type { CalendarEventsRow, NotificationLogRow, RentPaymentsRow, TenantsRow, UserPropertiesRow } from '../../../lib/supabase/tables.ts'
import { eur } from '../_shared/format.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// Μυστικό cron: μόνο ο προγραμματιστής (pg_cron) που στέλνει το σωστό x-cron-secret
// μπορεί να πυροδοτήσει το sweep. Ίδιο μοτίβο με το ical-sync (least privilege — ΔΕΝ
// χρειάζεται πια το service-role key στην κλήση). Το function κρατά το δικό του
// service key εσωτερικά για τα queries.
const CRON_SECRET    = Deno.env.get('REMINDERS_CRON_SECRET') || ''
const FROM_EMAIL     = Deno.env.get('RESEND_FROM') || 'PROPERWISE <onboarding@resend.dev>'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Τα δύο ερωτήματα ονόματος: ζητούν δύο στήλες, όχι ολόκληρη τη γραμμή.
type TenantName   = Pick<TenantsRow, 'id' | 'full_name'>
type PropertyName = Pick<UserPropertiesRow, 'id' | 'name'>

// Πύλη ασφαλείας cron (zero-config): εξουσιοδότηση αν η κλήση φέρει (α) το
// service-role key (Authorization: Bearer), (β) το προαιρετικό x-cron-secret env,
// ή (γ) το κοινό μυστικό cron που είναι αποθηκευμένο στη ΒΔ (public.cron_secrets).
// Η (γ) είναι η κύρια, μηδενικής-ρύθμισης οδός: το pg_cron στέλνει την ίδια τιμή
// από τον πίνακα και το function την επαληθεύει με τον service-role client του —
// άρα δεν χρειάζεται κανένα χειροκίνητο μυστικό στο dashboard.
async function authorized(req: Request): Promise<boolean> {
  return authorizeCron(req, { serviceKey: SUPABASE_KEY, envSecret: CRON_SECRET, supabase })
}

// ── Κείμενο χρήστη μέσα σε HTML email ──────────────────────────────────────
// Ο τίτλος γεγονότος, η κατηγορία, το όνομα μισθωτή και το όνομα ακινήτου τα
// γράφει ο χρήστης και ΜΠΑΙΝΑΝ ΑΥΤΟΥΣΙΑ σε HTML που φεύγει από το domain μας.
// Ένας τίτλος γεγονότος σαν
//
//     </span><a href="https://…">Πάτησε για να μη διακοπεί ο λογαριασμός σου</a>
//
// έφτιαχνε ολόκληρο μήνυμα ψαρέματος μέσα σε γνήσιο, υπογεγραμμένο email του
// προϊόντος — με το λογότυπό μας από πάνω. Εδώ σταματά: το κείμενο μένει κείμενο.
const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

function buildEmail(events: CalendarEventsRow[], reminderType: string) {
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
  const totalAmount = events.reduce((s, e) => s + (e.amount || 0), 0)

  const eventRows = events.map(e => {
    const color = catColors[e.category] || '#9ca3af'
    const label = catLabels[e.category] || e.category
    const dateStr = e.event_date ? new Date(e.event_date).toLocaleDateString('el-GR') : ''
    return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #e8eaed;">
          <span style="display:inline-block;width:4px;height:36px;background:${color};border-radius:2px;vertical-align:middle;margin-right:10px;"></span>
          <span style="vertical-align:middle;">
            <span style="display:block;font-size:14px;color:#202124;font-weight:500;">${esc(e.title)}</span>
            <span style="display:block;font-size:11px;color:#80868b;font-family:monospace;">${esc(label)} · ${dateStr}</span>
          </span>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #e8eaed;text-align:right;vertical-align:middle;">
          ${e.amount ? `<span style="font-family:monospace;font-size:14px;color:#202124;font-weight:600;">${eur(e.amount)}</span>` : '<span style="color:#bdc1c6;font-size:12px;">Χωρίς ποσό</span>'}
        </td>
      </tr>`
  }).join('')

  const subject = isUrgent
    ? `PROPERWISE · ${events.length} ${reminderType === 'overdue' ? 'εκπρόθεσμα γεγονότα' : 'γεγονότα ΣΗΜΕΡΑ'}`
    : `PROPERWISE · ${events.length} γεγονότα σε ${typeLabel[reminderType]}`

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f3f4;font-family:-apple-system,'Inter',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    ${emailHeader()}
    <div style="background:#ffffff;border:1px solid #e8eaed;border-radius:14px;padding:24px;">
      <div style="background:${isUrgent ? 'rgba(217,48,37,0.08)' : 'rgba(26,115,232,0.08)'};border:1px solid ${isUrgent ? 'rgba(217,48,37,0.25)' : 'rgba(26,115,232,0.22)'};border-radius:10px;padding:16px 20px;margin-bottom:20px;">
        <p style="margin:0 0 4px;font-size:11px;color:${isUrgent ? '#d93025' : '#1a73e8'};font-family:monospace;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">${isUrgent ? 'Απαιτείται Δράση' : 'Υπενθύμιση'}</p>
        <p style="margin:0;font-size:15px;color:#202124;font-weight:500;">${events.length} γεγονότα ${reminderType === 'overdue' ? 'είναι εκπρόθεσμα' : reminderType === 'today' ? 'πρέπει να διεκπεραιωθούν σήμερα' : `λήγουν σε ${typeLabel[reminderType]}`}</p>
        ${totalAmount > 0 ? `<p style="margin:6px 0 0;font-size:13px;color:#1a73e8;font-family:monospace;font-weight:600;">Σύνολο: ${eur(totalAmount)}</p>` : ''}
      </div>
      <table style="width:100%;border-collapse:collapse;">${eventRows}</table>
      <div style="text-align:center;margin-top:24px;">
        <a href="${APP_URL}/dashboard" style="display:inline-block;background:#1a73e8;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:100px;font-weight:700;font-size:14px;">Άνοιγμα PROPERWISE</a>
      </div>
    </div>
    <p style="text-align:center;font-size:11px;color:#80868b;margin-top:20px;">PROPERWISE · Αυτόματη ειδοποίηση ημερολογίου</p>
  </div>
</body></html>`

  return { subject, html }
}

// Dunning email προς τον ιδιοκτήτη για ληξιπρόθεσμες δόσεις ενοικίου.
// Ίδιο στυλ με buildEmail (header, κάρτα, Google-blue accent, CTA) αλλά πάντα
// «urgent» (#d93025) και ΧΩΡΙΣ emoji — καθαρό, επαγγελματικό κείμενο.
function buildDunningEmail(rows: RentPaymentsRow[], tenantMap: Record<string, TenantName>, propMap: Record<string, PropertyName>, today: Date, noticeLabel: string, noticeNumber: number) {
  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0)

  const rowsHtml = rows.map(r => {
    const tenant = r.tenant_id != null ? (tenantMap[r.tenant_id]?.full_name || null) : null
    const prop   = r.property_id != null ? (propMap[r.property_id]?.name || null) : null
    const primary = tenant || prop || 'Χωρίς όνομα'
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
            <span style="display:block;font-size:14px;color:#202124;font-weight:500;">${esc(primary)}</span>
            <span style="display:block;font-size:11px;color:#80868b;font-family:monospace;">${esc(secondary)}</span>
          </span>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #e8eaed;text-align:right;vertical-align:middle;">
          <span style="font-family:monospace;font-size:14px;color:#202124;font-weight:600;">${eur(r.amount || 0)}</span>
          <span style="display:block;font-size:11px;color:#d93025;font-family:monospace;font-weight:700;">${daysOverdue} ${daysOverdue === 1 ? 'μέρα' : 'μέρες'} καθυστέρηση</span>
        </td>
      </tr>`
  }).join('')

  const n = rows.length
  const subject = `PROPERWISE · ${noticeLabel}: ληξιπρόθεσμο ενοίκιο (${n} ${n === 1 ? 'δόση' : 'δόσεις'})`

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f3f4;font-family:-apple-system,'Inter',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    ${emailHeader()}
    <div style="background:#ffffff;border:1px solid #e8eaed;border-radius:14px;padding:24px;">
      <div style="background:rgba(217,48,37,0.08);border:1px solid rgba(217,48,37,0.25);border-radius:10px;padding:16px 20px;margin-bottom:20px;">
        <p style="margin:0 0 4px;font-size:11px;color:#d93025;font-family:monospace;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Ληξιπρόθεσμο Ενοίκιο</p>
        <p style="margin:0;font-size:15px;color:#202124;font-weight:500;">${n} ${n === 1 ? 'δόση ενοικίου είναι ληξιπρόθεσμη' : 'δόσεις ενοικίου είναι ληξιπρόθεσμες'}</p>
        <p style="margin:6px 0 0;font-size:12px;color:#80868b;font-family:monospace;font-weight:600;">${noticeLabel} (ειδοποίηση Νο ${noticeNumber})</p>
        ${total > 0 ? `<p style="margin:6px 0 0;font-size:13px;color:#d93025;font-family:monospace;font-weight:600;">Σύνολο ληξιπρόθεσμων: ${eur(total)}</p>` : ''}
      </div>
      <table style="width:100%;border-collapse:collapse;">${rowsHtml}</table>
      <div style="text-align:center;margin-top:24px;">
        <a href="${APP_URL}/dashboard" style="display:inline-block;background:#1a73e8;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:100px;font-weight:700;font-size:14px;">Άνοιγμα PROPERWISE</a>
      </div>
    </div>
    <p style="text-align:center;font-size:11px;color:#80868b;margin-top:20px;">PROPERWISE · Αυτόματη ειδοποίηση ληξιπρόθεσμου ενοικίου</p>
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
  if (!(await authorized(req))) {
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

    // ── ΣΕ ΠΟΙΟΝ ΕΠΙΤΡΕΠΕΤΑΙ ΝΑ ΣΤΑΛΕΙ ────────────────────────────────────
    // Η `reminder_email` είναι ελεύθερο κείμενο που γράφει ο χρήστης: μπορεί να
    // είναι γείτονας, πρώην, άγνωστος. Το μήνυμα φεύγει από ΤΟ ΔΙΚΟ ΜΑΣ domain,
    // με το δικό μας λογότυπο, σε άνθρωπο που δεν το ζήτησε ποτέ.
    //
    // Η απάντηση δεν κρίνεται εδώ. Τη δίνει η `reminder_recipients` της βάσης,
    // που είναι η ΜΙΑ πηγή: η διεύθυνση του ίδιου του λογαριασμού περνά (την
    // επαλήθευσε η εγγραφή), κάθε άλλη μόνο αφού επιβεβαιωθεί, και η αλλαγή
    // διεύθυνσης ακυρώνει την επιβεβαίωση. Αν αύριο γραφτεί δεύτερος αποστολέας,
    // θα ρωτήσει το ίδιο πράγμα και θα πάρει την ίδια απάντηση.
    const { data: allowed } = await supabase.rpc('reminder_recipients')
    const inbox = new Map<string, string>()
    for (const r of ((allowed || []) as { user_id: string; email: string | null }[])) {
      if (r.email) inbox.set(r.user_id, r.email)
    }
    /** Η επιτρεπτή διεύθυνση αυτού του ιδιοκτήτη, ή κενό: τότε δεν στέλνεται τίποτα. */
    const mailbox = (userId: string) => inbox.get(userId) || ''

    // ── ΚΑΙ ΤΑ ΔΥΟ ΠΕΡΑΣΜΑΤΑ ΦΤΑΝΟΥΝ ΜΟΝΟ ΣΤΟΝ ΙΔΙΟΚΤΗΤΗ ──────────────────
    // Το ημερολόγιο και το ληξιπρόθεσμο ενοίκιο γράφουν στο mailbox(user_id).
    // Το tenants.email δεν το διαβάζει κανένας αποστολέας: 3 σύνδεσμοι
    // mailto: στη διεπαφή, 0 κλήσεις προς τον πάροχο αποστολής.
    // Η οθόνη ρυθμίσεων το λέει πλέον ρητά, αντί για «διακριτική ενημέρωση»
    // με κλιμάκωση και όριο ανά δόση, που διαβαζόταν ως όχληση οφειλέτη.
    //
    // ΤΙ ΘΑ ΧΡΕΙΑΖΟΤΑΝ ΓΙΑ ΝΑ ΦΤΑΣΕΙ ΣΤΟΝ ΜΙΣΘΩΤΗ. Οχι σιωπηλά: μήνυμα από
    // το δικό μας domain σε τρίτον που δεν το ζήτησε είναι χειρότερο από το
    // κενό. Θα χρειαζόταν, με αυτή τη σειρά:
    //   1. Συγκατάθεση του ίδιου του μισθωτή, με το μοτίβο επιβεβαίωσης της
    //      reminder_recipients: token, λήξη 48 ωρών, ακύρωση σε αλλαγή.
    //   2. Στήλες tenants.email_verified/_token/_token_at και trigger
    //      επαναεπιβεβαίωσης, όπως το 20260810070000 για τον ιδιοκτήτη.
    //   3. Σύνδεσμο διαγραφής σε κάθε μήνυμα, και έλεγχο άρνησης πριν από
    //      κάθε αποστολή, όχι μόνο στην πρώτη.
    //   4. Ενημέρωση απορρήτου και υπεργολάβων: ο μισθωτής γίνεται
    //      παραλήπτης, δεν είναι πια μόνο όνομα μέσα σε μήνυμα.
    //   5. Δικό του πρότυπο κειμένου. Το σημερινό dunning απευθύνεται στον
    //      ιδιοκτήτη («Ανοιγμα PROPERWISE»), δεν διαβάζεται από τρίτον.

    let totalSent = 0

    for (const pref of prefs) {
      const to = mailbox(pref.user_id)
      if (!to) continue
      const { data: events } = await supabase.from('calendar_events').select('*').eq('user_id', pref.user_id).eq('status', 'pending')
      if (!events?.length) continue

      const checks = [
        { type: '7days', enabled: pref.reminder_7days, date: fmt(in7days) },
        { type: '3days', enabled: pref.reminder_3days, date: fmt(in3days) },
        { type: '1day',  enabled: pref.reminder_1day,  date: fmt(in1day)  },
        // ΗΤΑΝ ΣΤΑΘΕΡΟ `true`. Ο διακόπτης «Ημέρα εκτέλεσης» υπήρχε στην οθόνη
        // ρυθμίσεων, δεν είχε στήλη στη βάση, και εδώ αγνοούνταν ολότελα: ό,τι κι
        // αν επέλεγε ο χρήστης, το μήνυμα της ίδιας ημέρας έφευγε.
        { type: 'today', enabled: pref.reminder_today !== false, date: todayStr },
      ]

      for (const check of checks) {
        if (!check.enabled) continue
        const matching = events.filter(e => e.event_date === check.date)
        if (!matching.length) continue
        const { data: sent } = await supabase.from('notification_log').select('event_id').in('event_id', matching.map(e=>e.id)).eq('reminder_type', check.type)
        const sentIds = new Set(((sent||[]) as Pick<NotificationLogRow,'event_id'>[]).map(l=>l.event_id))
        const toSend  = matching.filter(e => !sentIds.has(e.id))
        if (!toSend.length) continue
        const { subject, html } = buildEmail(toSend, check.type)
        const ok = await sendEmail(to, subject, html)
        if (ok) {
          await supabase.from('notification_log').insert(toSend.map(e => ({ user_id: pref.user_id, event_id: e.id, reminder_type: check.type })))
          totalSent++
        }
      }

      // Το ίδιο ίσχυε για τα εκπρόθεσμα: ο διακόπτης υπήρχε και κανείς δεν τον διάβαζε.
      const overdue = pref.reminder_overdue === false ? [] : events.filter(e => e.event_date < todayStr)
      if (overdue.length) {
        const { data: sentOD } = await supabase.from('notification_log').select('event_id').in('event_id', overdue.map(e=>e.id)).eq('reminder_type','overdue')
        const sentODIds = new Set(((sentOD||[]) as Pick<NotificationLogRow,'event_id'>[]).map(l=>l.event_id))
        const toSendOD  = overdue.filter(e => !sentODIds.has(e.id))
        if (toSendOD.length) {
          const { subject, html } = buildEmail(toSendOD, 'overdue')
          const ok = await sendEmail(to, subject, html)
          if (ok) {
            await supabase.from('notification_log').insert(toSendOD.map(e => ({ user_id: pref.user_id, event_id: e.id, reminder_type: 'overdue' })))
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
    // Το notification_log ΔΕΝ ορίζεται σε καμία μετανάστευση και χρησιμοποιείται
    // πολυμορφικά (π.χ. ο market-data-updater γράφει rows χωρίς event_id), άρα το event_id
    // είναι απλό nullable uuid ΧΩΡΙΣ foreign key προς calendar_events. Επομένως αποθηκεύουμε
    // το rent_payment id στο event_id με reminder_type='rent_overdue' και κάνουμε escalation
    // βάσει του πλήθους/χρόνου των προηγούμενων ειδοποιήσεων ανά δόση.
    let dunningSent = 0
    for (const pref of prefs) {
      const to = mailbox(pref.user_id)
      if (!to) continue

      // Per-owner dunning settings, ασφαλή defaults (columns may be null on old rows).
      const dunningEnabled = pref.dunning_enabled !== false
      const everyDays = Number.isFinite(pref.dunning_every_days) && pref.dunning_every_days > 0 ? pref.dunning_every_days : 7
      const maxNotices = Number.isFinite(pref.dunning_max) && pref.dunning_max > 0 ? pref.dunning_max : 3
      if (!dunningEnabled) continue

      const { data: overdueRent } = await supabase.from('rent_payments')
        .select('*').eq('user_id', pref.user_id).eq('paid', false).lt('due_date', todayStr)
      // Μόνο δόσεις με non-null due_date αυστηρά πριν από σήμερα (belt-and-suspenders·
      // η .lt() ήδη αποκλείει NULL due_date στην Postgres).
      const overdue = ((overdueRent || []) as RentPaymentsRow[]).filter(r => r.due_date != null && r.due_date < todayStr)
      if (!overdue.length) continue

      const overdueIds = overdue.map(r => r.id)
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
      const toNotify = overdue.filter(r => {
        const count = priorCount[r.id] || 0
        if (count >= maxNotices) return false
        const last = lastNotice[r.id]
        return last === undefined || (now - last) >= spacingMs
      })
      if (!toNotify.length) continue

      // Escalation: notice number αυτού του send = priorCount + 1 ανά δόση· χρησιμοποιούμε
      // το MAX μεταξύ των eligible δόσεων για τον τόνο του subject.
      const noticeNumber = Math.max(...toNotify.map(r => (priorCount[r.id] || 0) + 1))
      const noticeLabel = noticeNumber >= 3 ? 'Τελική υπόμνηση' : noticeNumber === 2 ? 'Δεύτερη υπενθύμιση' : 'Υπενθύμιση'

      // Batched name lookups (κανένα N+1)· skip τα .in() όταν η λίστα ids είναι κενή.
      const tenantIds = [...new Set(toNotify.map(r => r.tenant_id).filter((v): v is string => v != null))]
      const propIds   = [...new Set(toNotify.map(r => r.property_id).filter((v): v is string => v != null))]
      const tenantMap: Record<string, TenantName> = {}
      const propMap: Record<string, PropertyName> = {}
      if (tenantIds.length) {
        const { data: tRows } = await supabase.from('tenants').select('id, full_name').in('id', tenantIds)
        for (const t of (tRows || []) as TenantName[]) tenantMap[t.id] = t
      }
      if (propIds.length) {
        const { data: pRows } = await supabase.from('user_properties').select('id, name').in('id', propIds)
        for (const p of (pRows || []) as PropertyName[]) propMap[p.id] = p
      }

      const { subject, html } = buildDunningEmail(toNotify, tenantMap, propMap, today, noticeLabel, noticeNumber)
      const ok = await sendEmail(to, subject, html)
      if (ok) {
        await supabase.from('notification_log').insert(toNotify.map(r => ({
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