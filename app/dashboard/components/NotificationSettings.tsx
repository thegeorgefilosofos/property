'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Bell, Mail, Check, AlertTriangle, Send } from 'lucide-react'

interface NotifPrefs {
  email_enabled: boolean
  reminder_7days: boolean
  reminder_3days: boolean
  reminder_1day: boolean
  reminder_email: string
}

const DEFAULT: NotifPrefs = {
  email_enabled: true,
  reminder_7days: true,
  reminder_3days: true,
  reminder_1day: true,
  reminder_email: '',
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
    if (data) setPrefs(data)
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
    setTesting(true); setTestMsg('')
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-reminders`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true, email: prefs.reminder_email }),
      })
      setTestMsg(res.ok ? '✓ Test email στάλθηκε!' : '✗ Σφάλμα αποστολής')
    } catch { setTestMsg('✗ Σφάλμα σύνδεσης') }
    setTesting(false)
  }

  const inp: React.CSSProperties = {
    width: '100%', background: '#08080d', border: '1px solid #242438',
    borderRadius: 6, padding: '9px 12px', color: '#e2e2f0', fontSize: 13,
    fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  }

  function Toggle({ val, onChange, label, desc }: { val: boolean; onChange: (v: boolean) => void; label: string; desc: string }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #1a1a2e' }}>
        <div>
          <p style={{ fontSize: 13, color: '#e2e2f0', fontWeight: 500 }}>{label}</p>
          <p style={{ fontSize: 11, color: '#5a5a70' }}>{desc}</p>
        </div>
        <button onClick={() => onChange(!val)} style={{
          width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
          background: val ? '#d4af42' : '#242438', position: 'relative', transition: 'background 0.2s', flexShrink: 0,
        }}>
          <span style={{ position: 'absolute', top: 3, left: val ? 20 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }}/>
        </button>
      </div>
    )
  }

  return (
    <div style={{ background: '#12121f', border: '1px solid #242438', borderRadius: 10, padding: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <div style={{ width: 32, height: 32, background: 'rgba(212,175,66,0.1)', border: '1px solid rgba(212,175,66,0.2)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Bell size={15} color="#d4af42"/>
        </div>
        <div>
          <p style={{ fontSize: 13, color: '#e2e2f0', fontWeight: 600 }}>Email Ειδοποιήσεις</p>
          <p style={{ fontSize: 11, color: '#5a5a70' }}>Λαμβάνεις reminders για επερχόμενα γεγονότα</p>
        </div>
      </div>

      {/* Email input */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#5a5a70', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
          Email αποστολής
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={{ ...inp, flex: 1 }} type="email" placeholder="george@email.com"
            value={prefs.reminder_email} onChange={e => setPrefs(p => ({ ...p, reminder_email: e.target.value }))}/>
          <button onClick={testEmail} disabled={testing} style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '9px 14px',
            background: 'transparent', border: '1px solid #242438', borderRadius: 6,
            cursor: testing ? 'not-allowed' : 'pointer', color: '#5a5a70', fontSize: 11,
            fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            <Send size={11}/>{testing ? 'Στολή...' : 'Test'}
          </button>
        </div>
        {testMsg && <p style={{ marginTop: 6, fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: testMsg.startsWith('✓') ? '#34d399' : '#f87171' }}>{testMsg}</p>}
      </div>

      {/* Master toggle */}
      <Toggle val={prefs.email_enabled} onChange={v => setPrefs(p => ({ ...p, email_enabled: v }))}
        label="Ενεργοποίηση ειδοποιήσεων" desc="Λήψη email για τα γεγονότα του ημερολογίου"/>

      {/* Reminder toggles */}
      {prefs.email_enabled && (
        <div style={{ marginTop: 4, opacity: prefs.email_enabled ? 1 : 0.4, transition: 'opacity 0.2s' }}>
          <p style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#3a3a54', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4, marginTop: 12 }}>
            Πότε να λαμβάνεις reminder
          </p>
          <Toggle val={prefs.reminder_7days} onChange={v => setPrefs(p => ({ ...p, reminder_7days: v }))}
            label="7 μέρες πριν" desc="Εβδομαδιαία προειδοποίηση"/>
          <Toggle val={prefs.reminder_3days} onChange={v => setPrefs(p => ({ ...p, reminder_3days: v }))}
            label="3 μέρες πριν" desc="Τριήμερη προειδοποίηση"/>
          <Toggle val={prefs.reminder_1day} onChange={v => setPrefs(p => ({ ...p, reminder_1day: v }))}
            label="Την προηγούμενη μέρα" desc="Reminder αύριο το πρωί"/>
          <div style={{ padding: '12px 0', borderBottom: '1px solid #1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: 13, color: '#e2e2f0', fontWeight: 500 }}>Ημέρα εκτέλεσης</p>
              <p style={{ fontSize: 11, color: '#5a5a70' }}>Πάντα ενεργό — reminder ημέρας</p>
            </div>
            <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#34d399', background: 'rgba(52,211,153,0.1)', padding: '3px 8px', borderRadius: 4 }}>Πάντα ON</span>
          </div>
          <div style={{ padding: '12px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: 13, color: '#e2e2f0', fontWeight: 500 }}>Εκπρόθεσμα</p>
              <p style={{ fontSize: 11, color: '#5a5a70' }}>Alert για ληξιπρόθεσμες υποχρεώσεις</p>
            </div>
            <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#f87171', background: 'rgba(248,113,113,0.1)', padding: '3px 8px', borderRadius: 4 }}>Πάντα ON</span>
          </div>
        </div>
      )}

      {/* Info box */}
      <div style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.15)', borderRadius: 8, padding: '10px 13px', marginTop: 16, marginBottom: 16, display: 'flex', gap: 10 }}>
        <AlertTriangle size={13} color="#60a5fa" style={{ flexShrink: 0, marginTop: 1 }}/>
        <p style={{ fontSize: 11, color: '#60a5fa', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.5 }}>
          Τα emails αποστέλλονται κάθε πρωί στις 08:00. Χρειάζεται deploy της Edge Function στο Supabase και ρύθμιση του cron job.
        </p>
      </div>

      {/* Save */}
      <button onClick={save} disabled={saving} style={{
        width: '100%', background: saved ? '#34d399' : '#d4af42', color: '#08080d',
        border: 'none', borderRadius: 7, padding: '10px 0',
        fontFamily: 'JetBrains Mono, monospace', fontSize: 11, textTransform: 'uppercase',
        letterSpacing: '0.1em', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        transition: 'background 0.3s',
      }}>
        {saved ? <><Check size={13}/>Αποθηκεύτηκε</> : saving ? 'Αποθήκευση...' : 'Αποθήκευση Ρυθμίσεων'}
      </button>
    </div>
  )
}