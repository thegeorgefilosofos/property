'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

const PILLARS = [
  {
    label: 'Οικονομική Εικόνα',
    text: 'Έσοδα, δαπάνες και απόδοση κάθε ακινήτου σε πραγματικό χρόνο. Gross και net yield μετά φόρων, αποσβέσεων και λειτουργικού κόστους.',
  },
  {
    label: 'Φορολογία 2026',
    text: 'Υπολογισμός φόρου εισοδήματος βάσει κλίμακας Ν.5246/2025. Αυτόματη ανάλυση με έκπτωση ηλεκτρονικής πληρωμής.',
  },
  {
    label: 'Χαρτοφυλάκιο έως 15 ακινήτων',
    text: 'Κατοικία, επαγγελματικός χώρος, αποθήκη, οικόπεδο, αγροτεμάχιο. Κάθε τύπος ακινήτου, ενιαία διαχείριση.',
  },
  {
    label: 'Δανεισμός και Απόκτηση',
    text: 'Ανάλυση στεγαστικού δανείου, κόστος αγοράς, συμβολαιογραφικά και φόρος μεταβίβασης. Σταθερό και κυμαινόμενο επιτόκιο.',
  },
  {
    label: 'Διαχείριση Μίσθωσης',
    text: 'Προφίλ ενοικιαστή, συμβόλαιο, ιστορικό πληρωμών, εγγύηση και έκτακτα έξοδα σε ένα ολοκληρωμένο περιβάλλον.',
  },
  {
    label: 'Τεκμηρίωση Ακινήτου',
    text: 'Απογραφή εξοπλισμού με απόσβεση, εγγυήσεις συσκευών, ασφαλιστήριο, ΕΝΦΙΑ, ΠΕΑ και αρχείο εγγράφων.',
  },
]

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false) }
    else router.push('/dashboard')
  }

  const field: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: '#0b0b1c', border: '1px solid #1c1c34',
    borderRadius: 8, padding: '11px 14px',
    color: '#e8e8f4', fontSize: 14, outline: 'none',
    fontFamily: 'inherit', transition: 'border-color .15s',
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#080810', display: 'flex',
      fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,sans-serif",
    }}>

      {/* LEFT */}
      <div style={{
        width: '46%', minWidth: 400,
        background: '#05050d',
        borderRight: '1px solid #0f0f22',
        display: 'flex', flexDirection: 'column',
        padding: '44px 52px 44px',
        overflowY: 'auto',
      }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 60 }}>
          <div style={{
            width: 32, height: 32, background: '#c9a84c',
            borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: '#05050d', fontSize: 16, fontWeight: 800 }}>P</span>
          </div>
          <span style={{ color: '#e8e8f4', fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em' }}>
            Property OS
          </span>
          <span style={{
            fontSize: 10, color: '#c9a84c',
            background: 'rgba(201,168,76,.1)', border: '1px solid rgba(201,168,76,.2)',
            borderRadius: 4, padding: '2px 8px', letterSpacing: '0.06em', fontWeight: 600,
          }}>BETA</span>
        </div>

        {/* Headline */}
        <div style={{ marginBottom: 52 }}>
          <h1 style={{
            fontSize: 33, fontWeight: 800, letterSpacing: '-0.04em',
            lineHeight: 1.1, margin: '0 0 20px', color: '#e8e8f4',
          }}>
            Το ακίνητό σου.<br />
            <span style={{ color: '#c9a84c' }}>Υπό έλεγχο.</span>
          </h1>
          <p style={{
            fontSize: 14, color: '#52527a', lineHeight: 1.72,
            margin: 0, maxWidth: 360, fontWeight: 400,
          }}>
            Επαγγελματική πλατφόρμα διαχείρισης για ιδιοκτήτες και διαχειριστές ακινήτων στην Ελλάδα. Πλήρης οικονομική εικόνα, ανάλυση απόδοσης και τεκμηρίωση κάθε ακινήτου.
          </p>
        </div>

        {/* Feature pillars */}
        <div style={{ flex: 1 }}>
          {PILLARS.map((p, i) => (
            <div key={i} style={{
              display: 'grid',
              gridTemplateColumns: '1px 1fr',
              gap: '0 20px',
              paddingBottom: i < PILLARS.length - 1 ? 20 : 0,
              marginBottom: i < PILLARS.length - 1 ? 20 : 0,
              borderBottom: i < PILLARS.length - 1 ? '1px solid #0d0d20' : 'none',
            }}>
              <div style={{ background: '#c9a84c', borderRadius: 1, opacity: 0.5 }} />
              <div>
                <p style={{
                  fontSize: 11, fontWeight: 700, color: '#b8b8d8',
                  margin: '0 0 4px', letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}>
                  {p.label}
                </p>
                <p style={{ fontSize: 12, color: '#3e3e62', margin: 0, lineHeight: 1.65 }}>
                  {p.text}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Pricing note */}
        <div style={{
          marginTop: 44, paddingTop: 28,
          borderTop: '1px solid #0d0d20',
        }}>
          <p style={{ fontSize: 12, color: '#c9a84c', fontWeight: 600, margin: '0 0 6px', letterSpacing: '-0.01em' }}>
            Δωρεάν για 3 μήνες
          </p>
          <p style={{ fontSize: 11, color: '#2e2e52', margin: 0, lineHeight: 1.7 }}>
            Το πρώτο ακίνητο χωρίς χρέωση για 90 ημέρες. Από €1.99 ανά μήνα μετά τη δοκιμαστική περίοδο. Χωρίς ετήσια δέσμευση, ακύρωση οποιαδήποτε στιγμή.
          </p>
        </div>
      </div>

      {/* RIGHT */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: '48px 40px',
      }}>
        <div style={{ width: '100%', maxWidth: 360 }}>

          <p style={{
            fontSize: 11, fontWeight: 600, color: '#c9a84c',
            letterSpacing: '0.08em', textTransform: 'uppercase',
            margin: '0 0 12px',
          }}>
            Σύνδεση
          </p>
          <h2 style={{
            fontSize: 26, fontWeight: 700, color: '#e8e8f4',
            letterSpacing: '-0.03em', margin: '0 0 8px',
          }}>
            Καλωσήρθες πίσω
          </h2>
          <p style={{ fontSize: 13, color: '#48486a', margin: '0 0 36px', lineHeight: 1.5 }}>
            Δεν έχεις λογαριασμό;{' '}
            <Link href="/signup" style={{ color: '#c9a84c', textDecoration: 'none', fontWeight: 500 }}>
              Εγγραφή δωρεάν
            </Link>
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            <div>
              <label style={{
                fontSize: 11, color: '#606090', fontWeight: 600,
                display: 'block', marginBottom: 8,
                textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>
                Email
              </label>
              <input
                type="email" value={email} required
                onChange={e => setEmail(e.target.value)}
                placeholder="onoma@email.com"
                style={field}
                onFocus={e => e.currentTarget.style.borderColor = 'rgba(201,168,76,.45)'}
                onBlur={e => e.currentTarget.style.borderColor = '#1c1c34'}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{
                  fontSize: 11, color: '#606090', fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>
                  Κωδικός
                </label>
                <span style={{ fontSize: 12, color: '#c9a84c', cursor: 'pointer' }}>
                  Ξέχασες τον κωδικό;
                </span>
              </div>
              <input
                type="password" value={password} required
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                style={field}
                onFocus={e => e.currentTarget.style.borderColor = 'rgba(201,168,76,.45)'}
                onBlur={e => e.currentTarget.style.borderColor = '#1c1c34'}
              />
            </div>

            {error && (
              <div style={{
                background: 'rgba(220,70,70,.08)', border: '1px solid rgba(220,70,70,.2)',
                borderRadius: 6, padding: '10px 14px', fontSize: 13, color: '#c87070',
              }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '13px',
              background: loading ? '#7a6230' : '#c9a84c',
              border: 'none', borderRadius: 8,
              color: '#05050d', fontSize: 14, fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              letterSpacing: '-0.01em', marginTop: 2,
              fontFamily: 'inherit', transition: 'background .2s, opacity .2s',
            }}>
              {loading ? 'Σύνδεση...' : 'Σύνδεση'}
            </button>

          </form>

          <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid #0f0f22' }}>
            <p style={{ fontSize: 11, color: '#26264a', textAlign: 'center', lineHeight: 1.7, margin: 0 }}>
              Με τη σύνδεση αποδέχεσαι τους{' '}
              <span style={{ color: '#40406a', cursor: 'pointer' }}>Όρους Χρήσης</span>
              {' '}και την{' '}
              <span style={{ color: '#40406a', cursor: 'pointer' }}>Πολιτική Απορρήτου</span>.
            </p>
          </div>

        </div>
      </div>
    </div>
  )
}