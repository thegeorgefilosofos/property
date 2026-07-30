'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Bell, Send } from 'lucide-react'
import { T, Btn, settingsField } from '@/components/Theme'
import { Toggle } from './UIComponents'

interface NotifPrefs {
  email_enabled: boolean
  reminder_7days: boolean
  reminder_3days: boolean
  reminder_1day: boolean
  reminder_today: boolean
  reminder_overdue: boolean
  reminder_email: string
  dunning_enabled: boolean
  dunning_every_days: number
  dunning_max: number
  /** Αλλαγές νομοθεσίας που αφορούν τα ακίνητα του χρήστη. */
  legal_updates: boolean
}

const DEFAULT: NotifPrefs = {
  email_enabled: false,
  reminder_7days: true,
  reminder_3days: true,
  reminder_1day: true,
  reminder_today: true,
  reminder_overdue: true,
  reminder_email: '',
  dunning_enabled: true,
  dunning_every_days: 7,
  dunning_max: 3,
  // ΠΡΟΕΠΙΛΟΓΗ ΑΝΑΜΜΕΝΗ, ΚΑΙ ΕΙΝΑΙ ΑΠΟΦΑΣΗ. Οι υπόλοιποι διακόπτες αφορούν
  // υπενθυμίσεις για πράγματα που ο χρήστης έχει ήδη καταχωρίσει. Αυτός αφορά
  // αλλαγές που συμβαίνουν ΧΩΡΙΣ να το ξέρει και του κοστίζουν: από 1/1/2026 τα
  // ενοίκια κατοικίας πρέπει να εισπράττονται μέσω τραπέζης, αλλιώς χάνεται η
  // τεκμαρτή έκπτωση 5%. Κανείς δεν ψάχνει ρύθμιση για κάτι που αγνοεί ότι ισχύει.
  legal_updates: true,
}

// Γραμμή διακόπτη με τίτλο/περιγραφή, με το κοινό MD3 Toggle (ίδιο με όλες τις Ρυθμίσεις).
//
// ΣΕ MODULE SCOPE, ΟΧΙ ΜΕΣΑ ΣΤΟ COMPONENT: όταν ένα component ορίζεται μέσα σε
// άλλο, κάθε render του γονέα φτιάχνει ΝΕΟ τύπο. Ο React δεν μπορεί να ξέρει ότι
// είναι «το ίδιο», οπότε αποσυναρμολογεί και ξαναχτίζει όλο το υποδέντρο: χάνεται
// το state, κόβεται το focus, ξαναρχίζουν τα animations. Εδώ ήταν επτά διακόπτες
// που ξαναγεννιούνταν σε κάθε πάτημα οποιουδήποτε από αυτούς.
function NotifRow({ val, onChange, label, desc }: {
  val: boolean; onChange: (v: boolean) => void; label: string; desc: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, fontFamily: T.font.sans }}>{label}</p>
        <p style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 1 }}>{desc}</p>
      </div>
      <Toggle on={val} onChange={onChange} size="sm" />
    </div>
  )
}

export default function NotificationSettings({ userId }: { userId: string }) {
  const supabase = createClient()
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveErr, setSaveErr] = useState(false)
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [testing, setTesting] = useState(false)

  useEffect(() => { load() }, [userId])

  async function load() {
    const { data } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    if (data) setPrefs(p => ({ ...p, ...data }))
  }

  async function save() {
    setSaving(true); setSaveErr(false); setSaved(false)
    const row = { ...prefs, user_id: userId, updated_at: new Date().toISOString() }
    let { error } = await supabase.from('notification_preferences').upsert(row, { onConflict: 'user_id' })
    // ΑΜΥΝΤΙΚΗ ΓΡΑΦΗ: η στήλη `legal_updates` προστίθεται με migration
    // (supabase/migrations/20260730092000_checklist_actuals.sql). Αν δεν έχει
    // τρέξει ακόμη στη βάση, ξαναδοκιμάζουμε ΧΩΡΙΣ αυτήν, ώστε ο χρήστης να μη
    // χάνει και τις επτά υπόλοιπες ρυθμίσεις του εξαιτίας μιας νέας.
    if (error && /legal_updates/i.test(error.message)) {
      const { legal_updates: _omit, ...rest } = row
      void _omit
      ;({ error } = await supabase.from('notification_preferences').upsert(rest, { onConflict: 'user_id' }))
    }
    setSaving(false)
    if (error) { setSaveErr(true); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function testEmail() {
    const email = prefs.reminder_email.trim()
    if (!email) { setTestMsg({ ok: false, text: 'Βάλε πρώτα το email σου.' }); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setTestMsg({ ok: false, text: 'Η μορφή του email δεν είναι σωστή.' }); return }
    setTesting(true); setTestMsg(null)
    // Στέλνουμε πραγματικό δοκιμαστικό email, ώστε να επιβεβαιωθεί ότι φτάνει.
    let ok = false
    let reason = ''
    try {
      const { data, error } = await supabase.functions.invoke('send-test-notification', { body: { email } })
      if (error) {
        // Μη-2xx: διάβασε το σώμα της απόκρισης της function για τον πραγματικό λόγο.
        try { const body = await (error as { context?: Response }).context?.json?.(); reason = (body?.detail || body?.error || '') as string; } catch { /* ignore */ }
        console.error('Δοκιμαστικό email — σφάλμα function:', error, reason)
      } else {
        const res = data as { sent?: boolean; error?: string; detail?: string } | null
        ok = !!res?.sent
        if (!ok) { reason = res?.detail || res?.error || ''; console.error('Δοκιμαστικό email — δεν στάλθηκε:', res) }
      }
    } catch (e) { console.error('Δοκιμαστικό email — εξαίρεση:', e) }
    setTesting(false)
    if (ok) { setTestMsg({ ok: true, text: `Στάλθηκε δοκιμαστικό email στο ${email}. Έλεγξε τα εισερχόμενά σου.` }); return }
    // Σαφές, ειλικρινές μήνυμα ανάλογα με τον λόγο (χωρίς τεχνικό θόρυβο στον χρήστη).
    const low = reason.toLowerCase()
    const text = /testing emails|verify a domain|not allowed|403|only send/.test(low)
      ? 'Το email δεν στάλθηκε: ο πάροχος επιτρέπει αποστολή μόνο σε επαληθευμένη διεύθυνση/τομέα ακόμη. Θα ενεργοποιηθεί με την επίσημη διεύθυνση αποστολής.'
      : 'Δεν στάλθηκε το δοκιμαστικό email. Δοκίμασε ξανά σε λίγο.'
    setTestMsg({ ok: false, text })
  }

  const lbl: React.CSSProperties = {
    fontSize: 12, fontFamily: T.font.sans, fontWeight: 500, color: 'var(--text-secondary)',
    display: 'block', marginBottom: 6,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Ειδοποιήσεις email ── */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 32, height: 32, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: T.radius.inner, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Bell size={15} color="var(--accent)"/>
          </div>
          <div>
            <p style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, fontFamily: T.font.sans }}>Ειδοποιήσεις email</p>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 1 }}>Υπενθυμίσεις για επερχόμενα γεγονότα στα εισερχόμενά σου</p>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label htmlFor="notif-email" style={lbl}>Email αποστολής</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input id="notif-email" className="po-field" style={{ ...settingsField, flex: 1 }} type="email" placeholder="ονομα@email.com"
              value={prefs.reminder_email} onChange={e => setPrefs(p => ({ ...p, reminder_email: e.target.value }))}/>
            <Btn variant="secondary" onClick={testEmail} disabled={testing}><Send size={11}/>{testing ? 'Αποστολή…' : 'Δοκιμή'}</Btn>
          </div>
          {testMsg && <p style={{ marginTop: 6, fontSize: 11, fontFamily: T.font.sans, color: testMsg.ok ? 'var(--positive)' : 'var(--negative)' }}>{testMsg.text}</p>}
        </div>

        <NotifRow val={prefs.email_enabled} onChange={v => setPrefs(p => ({ ...p, email_enabled: v }))}
          label="Ενεργοποίηση ειδοποιήσεων" desc="Λήψη email για τα γεγονότα του ημερολογίου"/>

        {prefs.email_enabled && (
          <div style={{ marginTop: 4 }}>
            <p style={{ fontSize: 9, fontFamily: T.font.sans, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 14, marginBottom: 4 }}>
              Πότε να λαμβάνεις υπενθύμιση
            </p>
            <NotifRow val={prefs.reminder_7days} onChange={v => setPrefs(p => ({ ...p, reminder_7days: v }))} label="7 ημέρες πριν" desc="Εβδομαδιαία προειδοποίηση"/>
            <NotifRow val={prefs.reminder_3days} onChange={v => setPrefs(p => ({ ...p, reminder_3days: v }))} label="3 ημέρες πριν" desc="Τριήμερη προειδοποίηση"/>
            <NotifRow val={prefs.reminder_1day} onChange={v => setPrefs(p => ({ ...p, reminder_1day: v }))} label="Την προηγούμενη ημέρα" desc="Υπενθύμιση αύριο το πρωί"/>
            <NotifRow val={prefs.reminder_today} onChange={v => setPrefs(p => ({ ...p, reminder_today: v }))} label="Ημέρα εκτέλεσης" desc="Υπενθύμιση την ίδια ημέρα στις 08:00"/>
            <NotifRow val={prefs.reminder_overdue} onChange={v => setPrefs(p => ({ ...p, reminder_overdue: v }))} label="Εκπρόθεσμα" desc="Ειδοποίηση για ληξιπρόθεσμες υποχρεώσεις"/>
          </div>
        )}

        {/* ── Ληξιπρόθεσμο ενοίκιο (dunning) ── */}
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
          <p style={{ fontSize: 9, fontFamily: T.font.sans, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Ληξιπρόθεσμο ενοίκιο
          </p>
          <NotifRow val={prefs.dunning_enabled} onChange={v => setPrefs(p => ({ ...p, dunning_enabled: v }))}
            label="Αυτόματες ειδοποιήσεις για ληξιπρόθεσμο ενοίκιο" desc="Διακριτική ενημέρωση με email όταν μια δόση καθυστερεί."/>
          {prefs.dunning_enabled && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
              <div style={{ flex: 1, minWidth: 150 }}>
                <label htmlFor="dunning-every" style={lbl}>Ανά πόσες ημέρες</label>
                <input id="dunning-every" className="po-field" type="number" min={1} max={30} style={settingsField} value={prefs.dunning_every_days}
                  onChange={e => setPrefs(p => ({ ...p, dunning_every_days: Math.max(1, Math.min(30, parseInt(e.target.value) || 7)) }))}/>
                <p style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 4 }}>Ελάχιστο διάστημα μεταξύ ειδοποιήσεων για την ίδια δόση.</p>
              </div>
              <div style={{ flex: 1, minWidth: 150 }}>
                <label htmlFor="dunning-max" style={lbl}>Μέγιστες ειδοποιήσεις</label>
                <input id="dunning-max" className="po-field" type="number" min={1} max={12} style={settingsField} value={prefs.dunning_max}
                  onChange={e => setPrefs(p => ({ ...p, dunning_max: Math.max(1, Math.min(12, parseInt(e.target.value) || 3)) }))}/>
                <p style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 4 }}>Ανώτατος αριθμός ειδοποιήσεων ανά δόση.</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Αλλαγές νομοθεσίας ── */}
        {/* Η ΜΗΧΑΝΗ ΥΠΗΡΧΕ ΚΑΙ ΗΤΑΝ ΑΠΟΣΥΝΔΕΔΕΜΕΝΗ. Το lib/accounting/updates2026.ts
            κρατά τους ισχύοντες κανόνες με νομική βάση, ισχύ και επίσημη πηγή, και
            κανένας διακόπτης δεν τους αφορούσε: επτά διακόπτες για προθεσμίες
            ημερολογίου, κανένας για το ότι άλλαξε ο νόμος. */}
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
          <p style={{ fontSize: 9, fontFamily: T.font.sans, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Νομοθεσία
          </p>
          <NotifRow val={prefs.legal_updates} onChange={v => setPrefs(p => ({ ...p, legal_updates: v }))}
            label="Αλλαγές νομοθεσίας που αφορούν τα ακίνητά μου"
            desc="Μόνο όσες ζητούν κίνηση από εσένα, με τη νομική βάση και σύνδεσμο στην επίσημη πηγή. Εμφανίζονται και ως εκκρεμότητες στο ακίνητο που αφορούν."/>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
          {saveErr && <span style={{ fontSize: 12, color: 'var(--negative)', fontFamily: T.font.sans }}>Δεν αποθηκεύτηκε. Δοκίμασε ξανά.</span>}
          {saved && <span style={{ fontSize: 12, color: 'var(--positive)', fontFamily: T.font.sans, fontWeight: 600 }}>Αποθηκεύτηκε ✓</span>}
          <Btn variant="primary" onClick={save} disabled={saving}>{saving ? 'Αποθήκευση…' : 'Αποθήκευση'}</Btn>
        </div>
      </div>
    </div>
  )
}
