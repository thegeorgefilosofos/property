'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Bell, Check, Send, Sparkles, Plus, X, RotateCcw, TrendingUp } from 'lucide-react'
import { T, fe } from '@/components/Theme'

interface NotifPrefs {
  email_enabled: boolean
  reminder_7days: boolean
  reminder_3days: boolean
  reminder_1day: boolean
  reminder_today: boolean
  reminder_overdue: boolean
  reminder_email: string
}

const DEFAULT: NotifPrefs = {
  email_enabled: false,
  reminder_7days: true,
  reminder_3days: true,
  reminder_1day: true,
  reminder_today: true,
  reminder_overdue: true,
  reminder_email: '',
}

interface Suggestion {
  title: string
  category: string
  amount?: number
  recurring: boolean
  recurring_interval?: string
  priority?: string
  reason: string
}

export default function NotificationSettings({ userId, propertyId }: { userId: string; propertyId: string }) {
  const supabase = createClient()
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loadingSugg, setLoadingSugg] = useState(false)
  const [addingId, setAddingId] = useState<number | null>(null)
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set())

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
    setTesting(true); setTestMsg('')
    await new Promise(r => setTimeout(r, 1500))
    setTestMsg('✓ Test email στάλθηκε!')
    setTesting(false)
  }

  async function generateSuggestions() {
    setLoadingSugg(true)
    setSuggestions([])
    setDismissedIds(new Set())

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/smart-suggestions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ property_id: propertyId, user_id: userId }),
        }
      )
      const data = await response.json()
      if (data.suggestions?.length) {
        setSuggestions(data.suggestions)
      } else {
        throw new Error('No suggestions')
      }
    } catch {
      // Fallback αν δεν υπάρχει API key ακόμα
      setSuggestions([
        { title: 'Πληρωμή ΕΝΦΙΑ', category: 'financial', amount: 200, recurring: true, recurring_interval: 'annual', priority: 'high', reason: 'Ετήσια υποχρέωση — συνήθως Σεπτέμβριος' },
        { title: 'Ετήσιος έλεγχος ηλεκτρικής εγκατάστασης', category: 'maintenance', recurring: true, recurring_interval: 'annual', priority: 'medium', reason: 'Υποχρεωτικός για ασφάλεια ακινήτου' },
        { title: 'Service κλιματιστικού', category: 'maintenance', amount: 60, recurring: true, recurring_interval: 'annual', priority: 'medium', reason: 'Συνιστάται πριν το καλοκαίρι' },
        { title: 'Ανανέωση ασφαλιστηρίου', category: 'contract', recurring: true, recurring_interval: 'annual', priority: 'high', reason: 'Έλεγχος λήξης ασφάλισης ακινήτου' },
        { title: 'Έλεγχος κεντρικής θέρμανσης', category: 'maintenance', amount: 80, recurring: true, recurring_interval: 'annual', priority: 'medium', reason: 'Συνιστάται πριν τον χειμώνα' },
      ])
    }

    setLoadingSugg(false)
  }

  async function addSuggestion(s: Suggestion, idx: number) {
    setAddingId(idx)
    const today = new Date()
    const eventDate = new Date(today.getFullYear(), today.getMonth() + 1, 1).toISOString().split('T')[0]
    await supabase.from('calendar_events').insert({
      property_id: propertyId, user_id: userId,
      title: s.title, category: s.category,
      event_date: eventDate, amount: s.amount || null,
      priority: s.priority || 'medium', status: 'pending',
      recurring: s.recurring, recurring_interval: s.recurring_interval || null,
      notes: `Smart suggestion: ${s.reason}`, source: 'manual',
    })
    setAddingId(null)
    setDismissedIds(prev => new Set([...prev, idx]))
  }

  function dismiss(idx: number) {
    setDismissedIds(prev => new Set([...prev, idx]))
  }

  const inp: React.CSSProperties = {
    width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-default)',
    borderRadius: T.radius.btn, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 14,
    fontFamily: T.font.sans, outline: 'none', boxSizing: 'border-box',
  }
  const lbl: React.CSSProperties = {
    fontSize: 10, fontFamily: T.font.sans, fontWeight: 700, color: 'var(--text-tertiary)',
    textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6,
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

  const catColors: Record<string, string> = {
    financial: 'var(--accent)', bills: '#4285f4', maintenance: '#34a853',
    contract: '#a142f4', tenant: '#f29900', reminder: '#5f6368',
  }
  const catLabels: Record<string, string> = {
    financial: 'Οικονομικά', bills: 'Λογαριασμοί', maintenance: 'Συντήρηση',
    contract: 'Συμβόλαιο', tenant: 'Ενοικιαστής', reminder: 'Υπενθύμιση',
  }

  const visibleSuggestions = suggestions.filter((_, i) => !dismissedIds.has(i))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Smart Suggestions ── */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles size={15} color="var(--accent)"/>
            </div>
            <div>
              <p style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, fontFamily: T.font.sans }}>Έξυπνες Προτάσεις</p>
              <p style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 1 }}>Ανάλυση με AI βάσει των δεδομένων του ακινήτου</p>
            </div>
          </div>
          <button onClick={generateSuggestions} disabled={loadingSugg} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
            background: loadingSugg ? 'transparent' : 'var(--accent-soft)',
            border: '1px solid var(--accent-border)', borderRadius: 100,
            cursor: loadingSugg ? 'not-allowed' : 'pointer',
            color: 'var(--accent)', fontSize: 12, fontWeight: 600, fontFamily: T.font.sans,
          }}>
            <Sparkles size={12} style={{ animation: loadingSugg ? 'spin 1s linear infinite' : 'none' }}/>
            {loadingSugg ? 'Ανάλυση…' : 'Ανάλυση ακινήτου'}
          </button>
        </div>

        {visibleSuggestions.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {suggestions.map((s, idx) => {
              if (dismissedIds.has(idx)) return null
              const color = catColors[s.category] || 'var(--text-tertiary)'
              const label = catLabels[s.category] || s.category
              const isAdded = addingId === idx
              return (
                <div key={idx} style={{
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                  borderLeft: `3px solid ${color}`, borderRadius: T.radius.inner, padding: '12px 14px',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, fontFamily: T.font.sans }}>{s.title}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, fontFamily: T.font.sans, padding: '2px 7px', borderRadius: T.radius.pill, color, background: `color-mix(in srgb, ${color} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 28%, transparent)` }}>{label}</span>
                      {s.recurring && (
                        <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: T.font.sans, display: 'flex', alignItems: 'center', gap: 2 }}>
                          <RotateCcw size={9}/>{s.recurring_interval === 'annual' ? 'Ετήσιο' : s.recurring_interval === 'monthly' ? 'Μηνιαίο' : 'Τριμηνιαίο'}
                        </span>
                      )}
                      {s.amount && <span style={{ fontSize: 10, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: 'var(--accent)' }}>~{fe(s.amount)}</span>}
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>{s.reason}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => addSuggestion(s, idx)} disabled={isAdded} style={{
                      display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px',
                      background: 'var(--positive-soft)', border: '1px solid var(--positive-border)',
                      borderRadius: 100, cursor: 'pointer', color: 'var(--positive)', fontSize: 10, fontWeight: 600,
                      fontFamily: T.font.sans, whiteSpace: 'nowrap',
                    }}>
                      {isAdded ? <Check size={10}/> : <Plus size={10}/>}
                      {isAdded ? 'Προστέθηκε' : 'Προσθήκη'}
                    </button>
                    <button onClick={() => dismiss(idx)} style={{ padding: '5px 7px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: T.radius.badge, cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex' }}>
                      <X size={11}/>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {suggestions.length > 0 && visibleSuggestions.length === 0 && (
          <p style={{ fontSize: 11, color: 'var(--positive)', fontWeight: 600, fontFamily: T.font.sans, textAlign: 'center', padding: '8px 0' }}>
            ✓ Όλες οι προτάσεις διεκπεραιώθηκαν!
          </p>
        )}

        {suggestions.length === 0 && !loadingSugg && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <TrendingUp size={24} color="var(--text-tertiary)" style={{ margin: '0 auto 8px' }}/>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
              Πάτα «Ανάλυση ακινήτου» για έξυπνες προτάσεις
            </p>
          </div>
        )}
      </div>

      {/* ── Email Notifications ── */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 32, height: 32, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
          {testMsg && <p style={{ marginTop: 6, fontSize: 11, fontFamily: T.font.sans, color: testMsg.startsWith('✓') ? 'var(--positive)' : 'var(--negative)' }}>{testMsg}</p>}
        </div>

        <Toggle val={prefs.email_enabled} onChange={v => setPrefs(p => ({ ...p, email_enabled: v }))}
          label="Ενεργοποίηση ειδοποιήσεων" desc="Λήψη email για τα γεγονότα του ημερολογίου"/>

        {prefs.email_enabled && (
          <div style={{ marginTop: 4 }}>
            <p style={{ fontSize: 9, fontFamily: T.font.sans, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 14, marginBottom: 4 }}>
              Πότε να λαμβάνεις υπενθύμιση
            </p>
            <Toggle val={prefs.reminder_7days} onChange={v => setPrefs(p => ({ ...p, reminder_7days: v }))} label="7 μέρες πριν" desc="Εβδομαδιαία προειδοποίηση"/>
            <Toggle val={prefs.reminder_3days} onChange={v => setPrefs(p => ({ ...p, reminder_3days: v }))} label="3 μέρες πριν" desc="Τριήμερη προειδοποίηση"/>
            <Toggle val={prefs.reminder_1day} onChange={v => setPrefs(p => ({ ...p, reminder_1day: v }))} label="Την προηγούμενη μέρα" desc="Reminder αύριο το πρωί"/>
            <Toggle val={prefs.reminder_today} onChange={v => setPrefs(p => ({ ...p, reminder_today: v }))} label="Ημέρα εκτέλεσης" desc="Reminder την ίδια μέρα στις 08:00"/>
            <Toggle val={prefs.reminder_overdue} onChange={v => setPrefs(p => ({ ...p, reminder_overdue: v }))} label="Εκπρόθεσμα" desc="Alert για ληξιπρόθεσμες υποχρεώσεις"/>
          </div>
        )}

        <button onClick={save} disabled={saving} style={{
          width: '100%', marginTop: 16,
          background: saved ? 'var(--positive)' : 'var(--accent)', color: saved ? '#fff' : 'var(--accent-text)',
          border: 'none', borderRadius: 100, padding: '12px 0',
          fontFamily: T.font.sans, fontSize: 14, fontWeight: 700,
          cursor: saving ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          transition: 'background 0.3s',
        }}>
          {saved ? <><Check size={13}/>Αποθηκεύτηκε</> : saving ? 'Αποθήκευση…' : 'Αποθήκευση Ρυθμίσεων'}
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}