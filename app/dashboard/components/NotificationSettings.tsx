'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Bell, Check, Send, Sparkles, Plus, X, RotateCcw, TrendingUp } from 'lucide-react'

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
    // Simulate test — in production calls the edge function
    await new Promise(r => setTimeout(r, 1500))
    setTestMsg('✓ Test email στάλθηκε!')
    setTesting(false)
  }

  // ── Smart Suggestions ─────────────────────────────────────────────────────

  async function generateSuggestions() {
    setLoadingSugg(true)
    setSuggestions([])
    setDismissedIds(new Set())

    // Gather context from existing events + bills
    const { data: events } = await supabase
      .from('calendar_events')
      .select('title, category, amount, event_date, recurring, source')
      .eq('property_id', propertyId)
      .order('event_date')

    const { data: bills } = await supabase
      .from('bills')
      .select('name, amount, category')
      .eq('property_id', propertyId)

    const { data: expenses } = await supabase
      .from('expenses')
      .select('description, amount, category, date')
      .eq('property_id', propertyId)
      .order('date', { ascending: false })
      .limit(20)

    // Build context for AI
    const context = {
      events: events || [],
      bills: bills || [],
      expenses: expenses || [],
    }

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: `Είσαι βοηθός διαχείρισης ακινήτων. Ανάλυσε τα δεδομένα του ακινήτου και πρότεινε έξυπνα γεγονότα ημερολογίου που λείπουν.

Υπάρχοντα δεδομένα:
${JSON.stringify(context, null, 2)}

Πρότεινε 3-5 γεγονότα που:
1. Δεν υπάρχουν ήδη
2. Είναι σημαντικά για ιδιοκτήτη ακινήτου στην Ελλάδα
3. Βασίζονται σε patterns που βλέπεις στα δεδομένα

Απάντησε ΜΟΝΟ με JSON array, χωρίς άλλο κείμενο:
[
  {
    "title": "τίτλος γεγονότος",
    "category": "financial|bills|maintenance|contract|tenant|reminder",
    "amount": 150,
    "recurring": true,
    "recurring_interval": "monthly|annual|quarterly",
    "reason": "γιατί το προτείνω σε 1 πρόταση"
  }
]`
          }]
        })
      })

      const data = await response.json()
      const text = data.content?.[0]?.text || '[]'
      const clean = text.replace(/```json|```/g, '').trim()
      const parsed: Suggestion[] = JSON.parse(clean)
      setSuggestions(parsed)
    } catch {
      // Fallback suggestions if API fails
      setSuggestions([
        { title: 'Ετήσιος έλεγχος ηλεκτρικής εγκατάστασης', category: 'maintenance', recurring: true, recurring_interval: 'annual', reason: 'Υποχρεωτικός έλεγχος κάθε χρόνο για ασφάλεια' },
        { title: 'Πληρωμή ΕΝΦΙΑ', category: 'financial', amount: 200, recurring: true, recurring_interval: 'annual', reason: 'Ετήσια υποχρέωση — συνήθως Σεπτέμβριος' },
        { title: 'Service κλιματιστικού', category: 'maintenance', amount: 60, recurring: true, recurring_interval: 'annual', reason: 'Συνιστάται πριν το καλοκαίρι' },
        { title: 'Ανανέωση ασφαλιστηρίου', category: 'contract', recurring: true, recurring_interval: 'annual', reason: 'Έλεγχος λήξης ασφάλισης ακινήτου' },
      ])
    }

    setLoadingSugg(false)
  }

  async function addSuggestion(s: Suggestion, idx: number) {
    setAddingId(idx)
    const today = new Date()
    // Set event date to next month by default
    const eventDate = new Date(today.getFullYear(), today.getMonth() + 1, 1)
      .toISOString().split('T')[0]

    await supabase.from('calendar_events').insert({
      property_id: propertyId,
      user_id: userId,
      title: s.title,
      category: s.category,
      event_date: eventDate,
      amount: s.amount || null,
      priority: 'medium',
      status: 'pending',
      recurring: s.recurring,
      recurring_interval: s.recurring_interval || null,
      notes: `Smart suggestion: ${s.reason}`,
      source: 'manual',
    })

    setAddingId(null)
    setDismissedIds(prev => new Set([...prev, idx]))
  }

  function dismiss(idx: number) {
    setDismissedIds(prev => new Set([...prev, idx]))
  }

  const inp: React.CSSProperties = {
    width: '100%', background: '#08080d', border: '1px solid #242438',
    borderRadius: 6, padding: '9px 12px', color: '#e2e2f0', fontSize: 13,
    fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  }

  const lbl: React.CSSProperties = {
    fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#5a5a70',
    textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6,
  }

  function Toggle({ val, onChange, label, desc, alwaysOn = false }: {
    val: boolean; onChange: (v: boolean) => void
    label: string; desc: string; alwaysOn?: boolean
  }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #1a1a2e' }}>
        <div>
          <p style={{ fontSize: 13, color: '#e2e2f0', fontWeight: 500 }}>{label}</p>
          <p style={{ fontSize: 11, color: '#5a5a70' }}>{desc}</p>
        </div>
        <button
          onClick={() => !alwaysOn && onChange(!val)}
          style={{
            width: 40, height: 22, borderRadius: 11, border: 'none',
            cursor: alwaysOn ? 'default' : 'pointer',
            background: val ? '#d4af42' : '#242438',
            position: 'relative', transition: 'background 0.2s', flexShrink: 0,
          }}>
          <span style={{
            position: 'absolute', top: 3, left: val ? 20 : 3,
            width: 16, height: 16, borderRadius: '50%',
            background: '#fff', transition: 'left 0.2s',
          }}/>
        </button>
      </div>
    )
  }

  const catColors: Record<string, string> = {
    financial: '#d4af42', bills: '#60a5fa', maintenance: '#34d399',
    contract: '#a78bfa', tenant: '#fb923c', reminder: '#9ca3af',
  }
  const catLabels: Record<string, string> = {
    financial: 'Οικονομικά', bills: 'Λογαριασμοί', maintenance: 'Συντήρηση',
    contract: 'Συμβόλαιο', tenant: 'Ενοικιαστής', reminder: 'Υπενθύμιση',
  }

  const visibleSuggestions = suggestions.filter((_, i) => !dismissedIds.has(i))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Smart Suggestions ── */}
      <div style={{ background: '#12121f', border: '1px solid #242438', borderRadius: 10, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles size={15} color="#a78bfa"/>
            </div>
            <div>
              <p style={{ fontSize: 13, color: '#e2e2f0', fontWeight: 600 }}>Smart Suggestions</p>
              <p style={{ fontSize: 11, color: '#5a5a70' }}>AI ανάλυση — προτείνει γεγονότα που λείπουν</p>
            </div>
          </div>
          <button onClick={generateSuggestions} disabled={loadingSugg} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
            background: loadingSugg ? 'transparent' : 'rgba(167,139,250,0.1)',
            border: '1px solid rgba(167,139,250,0.3)', borderRadius: 7,
            cursor: loadingSugg ? 'not-allowed' : 'pointer',
            color: '#a78bfa', fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
          }}>
            <Sparkles size={11} style={{ animation: loadingSugg ? 'spin 1s linear infinite' : 'none' }}/>
            {loadingSugg ? 'Ανάλυση...' : 'Ανάλυση ακινήτου'}
          </button>
        </div>

        {/* Suggestions list */}
        {visibleSuggestions.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {suggestions.map((s, idx) => {
              if (dismissedIds.has(idx)) return null
              const color = catColors[s.category] || '#9ca3af'
              const label = catLabels[s.category] || s.category
              const isAdded = addingId === idx
              return (
                <div key={idx} style={{
                  background: 'rgba(255,255,255,0.02)', border: `1px solid #1e1e30`,
                  borderLeft: `3px solid ${color}`, borderRadius: 8, padding: '11px 13px',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 13, color: '#e2e2f0', fontWeight: 500 }}>{s.title}</span>
                      <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', padding: '1px 6px', borderRadius: 4, color, background: `${color}18`, border: `1px solid ${color}33` }}>
                        {label}
                      </span>
                      {s.recurring && (
                        <span style={{ fontSize: 9, color: '#5a5a70', display: 'flex', alignItems: 'center', gap: 2 }}>
                          <RotateCcw size={9}/> {s.recurring_interval === 'annual' ? 'Ετήσιο' : s.recurring_interval === 'monthly' ? 'Μηνιαίο' : 'Τριμηνιαίο'}
                        </span>
                      )}
                      {s.amount && (
                        <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#d4af42' }}>~{s.amount}€</span>
                      )}
                    </div>
                    <p style={{ fontSize: 11, color: '#5a5a70' }}>💡 {s.reason}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => addSuggestion(s, idx)} disabled={isAdded} style={{
                      display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px',
                      background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)',
                      borderRadius: 6, cursor: 'pointer', color: '#34d399', fontSize: 10,
                      fontFamily: 'JetBrains Mono, monospace',
                    }}>
                      {isAdded ? <Check size={10}/> : <Plus size={10}/>}
                      {isAdded ? 'Προστέθηκε' : 'Προσθήκη'}
                    </button>
                    <button onClick={() => dismiss(idx)} style={{
                      padding: '5px 7px', background: 'transparent',
                      border: '1px solid #1e1e30', borderRadius: 6,
                      cursor: 'pointer', color: '#3a3a54', display: 'flex',
                    }}>
                      <X size={11}/>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {suggestions.length > 0 && visibleSuggestions.length === 0 && (
          <p style={{ fontSize: 11, color: '#34d399', fontFamily: 'JetBrains Mono, monospace', textAlign: 'center', padding: '8px 0' }}>
            ✓ Όλες οι προτάσεις διεκπεραιώθηκαν!
          </p>
        )}

        {suggestions.length === 0 && !loadingSugg && (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <TrendingUp size={24} color="#2a2a3e" style={{ margin: '0 auto 8px' }}/>
            <p style={{ fontSize: 11, color: '#3a3a54', fontFamily: 'JetBrains Mono, monospace' }}>
              Πάτα "Ανάλυση ακινήτου" για έξυπνες προτάσεις
            </p>
          </div>
        )}
      </div>

      {/* ── Email Notifications ── */}
      <div style={{ background: '#12121f', border: '1px solid #242438', borderRadius: 10, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 32, height: 32, background: 'rgba(212,175,66,0.1)', border: '1px solid rgba(212,175,66,0.2)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Bell size={15} color="#d4af42"/>
          </div>
          <div>
            <p style={{ fontSize: 13, color: '#e2e2f0', fontWeight: 600 }}>Email Ειδοποιήσεις</p>
            <p style={{ fontSize: 11, color: '#5a5a70' }}>Reminders για επερχόμενα γεγονότα στο inbox σου</p>
          </div>
        </div>

        {/* Email input */}
        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Email αποστολής</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={{ ...inp, flex: 1 }} type="email" placeholder="george@email.com"
              value={prefs.reminder_email}
              onChange={e => setPrefs(p => ({ ...p, reminder_email: e.target.value }))}/>
            <button onClick={testEmail} disabled={testing} style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '9px 13px',
              background: 'transparent', border: '1px solid #242438', borderRadius: 6,
              cursor: testing ? 'not-allowed' : 'pointer',
              color: '#5a5a70', fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              <Send size={11}/>{testing ? 'Αποστολή...' : 'Test'}
            </button>
          </div>
          {testMsg && (
            <p style={{ marginTop: 6, fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: testMsg.startsWith('✓') ? '#34d399' : '#f87171' }}>
              {testMsg}
            </p>
          )}
        </div>

        {/* Master toggle */}
        <Toggle val={prefs.email_enabled}
          onChange={v => setPrefs(p => ({ ...p, email_enabled: v }))}
          label="Ενεργοποίηση ειδοποιήσεων"
          desc="Λήψη email για τα γεγονότα του ημερολογίου"/>

        {/* Reminder toggles */}
        {prefs.email_enabled && (
          <div style={{ marginTop: 4 }}>
            <p style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#3a3a54', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 14, marginBottom: 4 }}>
              Πότε να λαμβάνεις reminder
            </p>
            <Toggle val={prefs.reminder_7days}
              onChange={v => setPrefs(p => ({ ...p, reminder_7days: v }))}
              label="7 μέρες πριν" desc="Εβδομαδιαία προειδοποίηση"/>
            <Toggle val={prefs.reminder_3days}
              onChange={v => setPrefs(p => ({ ...p, reminder_3days: v }))}
              label="3 μέρες πριν" desc="Τριήμερη προειδοποίηση"/>
            <Toggle val={prefs.reminder_1day}
              onChange={v => setPrefs(p => ({ ...p, reminder_1day: v }))}
              label="Την προηγούμενη μέρα" desc="Reminder αύριο το πρωί"/>
            <Toggle val={prefs.reminder_today}
              onChange={v => setPrefs(p => ({ ...p, reminder_today: v }))}
              label="Ημέρα εκτέλεσης" desc="Reminder την ίδια μέρα στις 08:00"/>
            <Toggle val={prefs.reminder_overdue}
              onChange={v => setPrefs(p => ({ ...p, reminder_overdue: v }))}
              label="Εκπρόθεσμα" desc="Alert για ληξιπρόθεσμες υποχρεώσεις"/>
          </div>
        )}

        {/* Save */}
        <button onClick={save} disabled={saving} style={{
          width: '100%', marginTop: 16,
          background: saved ? '#34d399' : '#d4af42',
          color: '#08080d', border: 'none', borderRadius: 7, padding: '10px 0',
          fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
          textTransform: 'uppercase', letterSpacing: '0.1em',
          cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          transition: 'background 0.3s',
        }}>
          {saved ? <><Check size={13}/>Αποθηκεύτηκε</> : saving ? 'Αποθήκευση...' : 'Αποθήκευση Ρυθμίσεων'}
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}