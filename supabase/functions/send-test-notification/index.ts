// ─────────────────────────────────────────────────────────────────────────
// send-test-notification — στέλνει ΠΡΑΓΜΑΤΙΚΟ δοκιμαστικό email ειδοποίησης, ώστε
// ο χρήστης να επιβεβαιώσει ότι όντως φτάνει στα εισερχόμενά του (όχι απλός
// έλεγχος μορφής). Καλείται από τις Ρυθμίσεις → Ειδοποιήσεις («Δοκιμή»).
//
// Ασφάλεια: εκτελείται με το JWT του καλούντος (όχι service role). Στέλνει ΕΝΑ
// email στη διεύθυνση που όρισε ο ίδιος ο συνδεδεμένος χρήστης.
//
// Ενεργοποίηση:
//   supabase functions deploy send-test-notification
//   (RESEND_API_KEY / SUPABASE_URL / SUPABASE_ANON_KEY υπάρχουν ήδη)
// ─────────────────────────────────────────────────────────────────────────

import { NO_RESEND_KEY } from '../_shared/resendKey.ts'
import { emailHeader } from '../_shared/emailTemplates.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.110.8'
import { APP_URL } from '../_shared/site.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON  = Deno.env.get('SUPABASE_ANON_KEY')!
const FROM_EMAIL     = Deno.env.get('RESEND_FROM') || 'PROPERWISE <onboarding@resend.dev>'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

function testEmailHtml(): { subject: string; html: string } {
  const subject = 'Δοκιμαστική ειδοποίηση από το PROPERWISE'
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f3f4;font-family:-apple-system,'Inter',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    ${emailHeader()}
    <div style="background:#ffffff;border:1px solid #e8eaed;border-radius:14px;padding:28px 24px;">
      <p style="margin:0 0 6px;font-size:11px;color:#1a73e8;font-family:monospace;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Δοκιμή</p>
      <h1 style="margin:0 0 12px;font-size:22px;color:#202124;font-weight:800;letter-spacing:-0.5px;">Οι ειδοποιήσεις σου δουλεύουν</h1>
      <p style="margin:0;font-size:14px;color:#5f6368;line-height:1.6;">
        Αυτό είναι ένα δοκιμαστικό email. Αν το βλέπεις, η διεύθυνσή σου είναι σωστή και θα λαμβάνεις κανονικά τις υπενθυμίσεις για ενοίκια, λογαριασμούς και γεγονότα του ημερολογίου σου.
      </p>
    </div>
    <p style="text-align:center;font-size:11px;color:#80868b;margin-top:20px;">PROPERWISE · Δοκιμαστικό μήνυμα που ζήτησες από τις ρυθμίσεις.</p>
  </div>
  </body></html>`
  return { subject, html }
}

/**
 * ΤΟ ΜΗΝΥΜΑ ΕΠΙΒΕΒΑΙΩΣΗΣ, ΟΤΑΝ Η ΔΙΕΥΘΥΝΣΗ ΔΕΝ ΕΙΝΑΙ Η ΔΙΚΗ ΣΟΥ.
 *
 * Ο παραλήπτης μπορεί να μην έχει ιδέα ποιοι είμαστε: το μήνυμα λέει ΠΟΙΟΣ το
 * ζήτησε, ΤΙ θα λαμβάνει, και ότι αν δεν το περίμενε, δεν χρειάζεται να κάνει
 * τίποτα. Ένα «αγνόησέ το» είναι πιο σεβαστικό από ένα κουμπί απόρριψης, γιατί
 * χωρίς το πάτημα δεν στέλνεται ούτως ή άλλως τίποτα.
 */
function confirmEmailHtml(link: string, owner: string): { subject: string; html: string } {
  const subject = 'Επιβεβαίωση διεύθυνσης για υπενθυμίσεις PROPERWISE'
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f3f4;font-family:-apple-system,'Inter',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    ${emailHeader()}
    <div style="background:#ffffff;border:1px solid #e8eaed;border-radius:14px;padding:28px 24px;">
      <h1 style="margin:0 0 12px;font-size:22px;color:#202124;font-weight:800;letter-spacing:-0.5px;">Να στέλνουμε τις υπενθυμίσεις εδώ;</h1>
      <p style="margin:0 0 16px;font-size:14px;color:#5f6368;line-height:1.6;">
        Ο κάτοχος του λογαριασμού ${owner} όρισε αυτή τη διεύθυνση για τις υπενθυμίσεις του PROPERWISE: λογαριασμοί, ενοίκια και γεγονότα ημερολογίου.
      </p>
      <p style="margin:0 0 22px;font-size:14px;color:#5f6368;line-height:1.6;">
        Αν το περιμένεις, επιβεβαίωσέ το. <strong style="color:#202124;">Αν όχι, αγνόησε αυτό το μήνυμα</strong>: χωρίς επιβεβαίωση δεν στέλνεται τίποτα άλλο σε αυτή τη διεύθυνση.
      </p>
      <a href="${link}" style="display:inline-block;background:#1a73e8;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:100px;font-weight:700;font-size:14px;">Επιβεβαίωση διεύθυνσης</a>
      <p style="margin:18px 0 0;font-size:12px;color:#80868b;line-height:1.6;">Ο σύνδεσμος λήγει σε 48 ώρες.</p>
    </div>
    <p style="text-align:center;font-size:11px;color:#80868b;margin-top:20px;">PROPERWISE · Το μήνυμα στάλθηκε επειδή ζητήθηκε επιβεβαίωση αυτής της διεύθυνσης.</p>
  </div>
  </body></html>`
  return { subject, html }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401)

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, { global: { headers: { Authorization: authHeader } } })
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) return json({ error: 'unauthorized' }, 401)

  // ── ΠΟΤΕ ΔΕΝ ΣΤΕΛΝΕΤΑΙ ΔΙΕΥΘΥΝΣΗ ΑΠΟ ΤΟ ΣΩΜΑ ΤΟΥ ΑΙΤΗΜΑΤΟΣ ────────────────
  // Δύο πράγματα μπορεί να ζητήσει αυτή η function, και κανένα από τα δύο δεν
  // δέχεται παραλήπτη από τον πελάτη:
  //
  //   • ΔΟΚΙΜΗ, στη διεύθυνση του ΙΔΙΟΥ του λογαριασμού. Την επαλήθευσε η εγγραφή.
  //   • ΕΠΙΒΕΒΑΙΩΣΗ, στη διεύθυνση που ο χρήστης ΑΠΟΘΗΚΕΥΣΕ στις ρυθμίσεις — και
  //     τη διαβάζουμε από τη ΒΑΣΗ, όχι από το αίτημα.
  //
  // Έτσι ο πελάτης δεν μπορεί να διαλέξει παραλήπτη ούτε περιεχόμενο: το κείμενο
  // και στις δύο περιπτώσεις είναι δικό μας και σταθερό.
  const accountEmail = String(userData.user.email || '').trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountEmail)) return json({ error: 'invalid_email' }, 400)

  // Ποια διεύθυνση θέλει να επιβεβαιώσει; Το ερώτημα εκδίδει και το διακριτικό.
  const { data: issued } = await supabase.rpc('issue_reminder_email_token')
  const row = (Array.isArray(issued) ? issued[0] : issued) as { email?: string; token?: string } | null
  const saved = String(row?.email || '').trim()
  const needsConfirm = !!saved && saved.toLowerCase() !== accountEmail.toLowerCase()
  const email = needsConfirm ? saved : accountEmail

  if (!RESEND_API_KEY) return json({ error: 'no_resend_key', detail: NO_RESEND_KEY }, 500)

  // ── Δέκα μηνύματα την ημέρα, και τέλος ───────────────────────────────────
  // Ο παραλήπτης είναι είτε η διεύθυνση του λογαριασμού είτε η αποθηκευμένη, και
  // το κείμενο είναι δικό μας και στις δύο περιπτώσεις — άρα δεν είναι
  // αναμεταδότης. Ήταν όμως ΑΠΕΡΙΟΡΙΣΤΟΣ: ένας βρόχος στην κονσόλα του
  // φυλλομετρητή χρέωνε τον λογαριασμό Resend όσο αντέχει η γραμμή, και έκαιγε
  // τη φήμη αποστολής του domain με χιλιάδες πανομοιότυπα μηνύματα.
  //
  // Δέκα είναι γενναιόδωρο για μια δοκιμή που ή δουλεύει ή δεν δουλεύει.
  const { data: quota } = await supabase.rpc('bump_send_quota', {
    p_kind: 'test_notification', p_units: 1, p_max: 10, p_window: '24 hours',
  })
  if (!quota?.allowed) {
    return json({
      error: 'daily_cap',
      detail: 'Έφτασες τις 10 δοκιμαστικές ειδοποιήσεις για σήμερα. Αν δεν έφτασε καμία, το πρόβλημα δεν είναι η δοκιμή.',
      resetsAt: quota?.resets_at ?? null,
    }, 429)
  }

  const { subject, html } = needsConfirm
    ? confirmEmailHtml(`${APP_URL}/epivevaiosi-email/${row?.token}`, accountEmail)
    : testEmailHtml()
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: email, subject, html }),
    })
    if (!res.ok) {
      // Επίστρεψε το πραγματικό μήνυμα του Resend (π.χ. sandbox: μόνο η δική σου
      // διεύθυνση επιτρέπεται χωρίς επαληθευμένο domain), για σαφή διάγνωση.
      const detail = await res.text().catch(() => '')
      return json({ error: 'send_failed', status: res.status, detail: detail.slice(0, 500) }, 502)
    }
  } catch (err) {
    return json({ error: 'fetch_failed', detail: String(err) }, 500)
  }
  return json({ sent: true, mode: needsConfirm ? 'confirm' : 'test', to: email })
})
