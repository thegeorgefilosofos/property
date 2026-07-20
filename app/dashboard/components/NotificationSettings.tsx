'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Bell, Check, Send } from 'lucide-react'
import { T } from '@/components/Theme'

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
}

export default function NotificationSettings({ userId }: { userId: string }) {
  const supabase = createClient()
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState('')

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
    setSaving(true)
    await supabase.from('notification_preferences').upsert(
      { ...prefs, user_id: userId, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function testEmail() {
    if (!prefs.reminder_email) { setTestMsg('Βάλε πρώτα email'); return }
    // Έντιμο: δεν στέλνουμε δοκιμαστικό email εδώ — απλώς επιβεβαιώνουμε τη μορφή.
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(prefs.reminder_email)
    setTestMsg(valid ? 'Η μορφή του email είναι σωστή. Αποθήκευσε για να λαμβάνεις ειδοποιήσεις.' : 'Η μορφή του email δεν είναι σωστή')
  }

  const inp: React.CSSProperties = {
    width: '100%', height: 40, background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
    borderRadius: 4, padding: '10px 16px', color: 'var(--text-primary)', fontSize: 14,
    fontFamily: T.font.sans, letterSpacing: 0, outline: 'none', boxSizing: 'border-box',
  }
  const lbl: React.CSSProperties = {
    fontSize: 12, fontFamily: T.font.sans, fontWeight: 500, color: 'var(--text-secondary)',
    letterSpacing: '0.5px', display: 'block', marginBottom: 6,
  }

  function Toggle({ val, onChange, label, desc }: {
    val: boolean; onChange: (v: boolean) => void; label: string; desc: string
  }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, fontFamily: T.font.sans }}>{label}</p>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 1 }}>{desc}</p>
        </div>
        <button role="switch" aria-checked={val} onClick={() => onChange(!val)} style={{
          width: 40, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', padding: 0,
          background: val ? 'var(--accent)' : 'var(--border-strong)', position: 'relative', transition: 'background 0.2s', flexShrink: 0,
        }}>
          <span style={{ position: 'absolute', top: 2, left: val ? 18 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transition: 'left 0.2s cubic-bezier(0.2,0,0,1)' }}/>
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Email Notifications ── */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 32, height: 32, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: T.radius.inner, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Bell size={15} color="var(--accent)"/>
          </div>
          <div>
            <p style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, fontFamily: T.font.sans }}>Email Ειδοποιήσεις</p>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 1 }}>Υπενθυμίσεις για επερχόμενα γεγονότα στο inbox σου</p>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Email αποστολής</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={{ ...inp, flex: 1 }} type="email" placeholder="george@email.com"
              value={prefs.reminder_email} onChange={e => setPrefs(p => ({ ...p, reminder_email: e.target.value }))}/>
            <button onClick={testEmail} disabled={testing} style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '10px 14px',
              background: 'transparent', border: '1px solid var(--border-default)', borderRadius: T.radius.btn,
              cursor: testing ? 'not-allowed' : 'pointer', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600,
              fontFamily: T.font.sans, whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              <Send size={11}/>{testing ? 'Αποστολή…' : 'Δοκιμή'}
            </button>
          </div>
          {testMsg && <p style={{ marginTop: 6, fontSize: 11, fontFamily: T.font.sans, color: /είναι σωστή/.test(testMsg) ? 'var(--positive)' : 'var(--negative)' }}>{testMsg}</p>}
        </div>

        <Toggle val={prefs.email_enabled} onChange={v => setPrefs(p => ({ ...p, email_enabled: v }))}
          label="Ενεργοποίηση ειδοποιήσεων" desc="Λήψη email για τα γεγονότα του ημερολογίου"/>

        {prefs.email_enabled && (
          <div style={{ marginTop: 4 }}>
            <p style={{ fontSize: 9, fontFamily: T.font.sans, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 14, marginBottom: 4 }}>
              Πότε να λαμβάνεις υπενθύμιση
            </p>
            <Toggle val={prefs.reminder_7days} onChange={v => setPrefs(p => ({ ...p, reminder_7days: v }))} label="7 μέρες πριν" desc="Εβδομαδιαία προειδοποίηση"/>
            <Toggle val={prefs.reminder_3days} onChange={v => setPrefs(p => ({ ...p, reminder_3days: v }))} label="3 μέρες πριν" desc="Τριήμερη προειδοποίηση"/>
            <Toggle val={prefs.reminder_1day} onChange={v => setPrefs(p => ({ ...p, reminder_1day: v }))} label="Την προηγούμενη μέρα" desc="Υπενθύμιση αύριο το πρωί"/>
            <Toggle val={prefs.reminder_today} onChange={v => setPrefs(p => ({ ...p, reminder_today: v }))} label="Ημέρα εκτέλεσης" desc="Υπενθύμιση την ίδια μέρα στις 08:00"/>
            <Toggle val={prefs.reminder_overdue} onChange={v => setPrefs(p => ({ ...p, reminder_overdue: v }))} label="Εκπρόθεσμα" desc="Ειδοποίηση για ληξιπρόθεσμες υποχρεώσεις"/>
          </div>
        )}

        {/* ── Ληξιπρόθεσμο ενοίκιο (dunning) ── */}
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
          <p style={{ fontSize: 9, fontFamily: T.font.sans, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Ληξιπρόθεσμο ενοίκιο
          </p>
          <Toggle val={prefs.dunning_enabled} onChange={v => setPrefs(p => ({ ...p, dunning_enabled: v }))}
            label="Αυτόματες ειδοποιήσεις για ληξιπρόθεσμο ενοίκιο" desc="Διακριτική ενημέρωση με email όταν μια δόση καθυστερεί."/>
          {prefs.dunning_enabled && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
              <div style={{ flex: 1, minWidth: 150 }}>
                <label style={lbl}>Ανά πόσες μέρες</label>
                <input type="number" min={1} max={30} style={inp} value={prefs.dunning_every_days}
                  onChange={e => setPrefs(p => ({ ...p, dunning_every_days: Math.max(1, Math.min(30, parseInt(e.target.value) || 7)) }))}/>
                <p style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 4 }}>Ελάχιστο διάστημα μεταξύ ειδοποιήσεων για την ίδια δόση.</p>
              </div>
              <div style={{ flex: 1, minWidth: 150 }}>
                <label style={lbl}>Μέγιστες ειδοποιήσεις</label>
                <input type="number" min={1} max={12} style={inp} value={prefs.dunning_max}
                  onChange={e => setPrefs(p => ({ ...p, dunning_max: Math.max(1, Math.min(12, parseInt(e.target.value) || 3)) }))}/>
                <p style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 4 }}>Ανώτατος αριθμός ειδοποιήσεων ανά δόση.</p>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={save} disabled={saving} style={{
            background: saved ? 'var(--positive)' : 'var(--accent)', color: 'var(--accent-text)',
            border: 'none', borderRadius: 100, padding: '10px 22px',
            fontFamily: T.font.sans, fontSize: 13, fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            transition: 'background 0.3s',
          }}>
            {saved ? <><Check size={13}/>Αποθηκεύτηκε</> : saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}