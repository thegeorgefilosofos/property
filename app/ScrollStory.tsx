'use client'
import { useEffect, useRef, useState } from 'react'
import { PanelFX, PanelScan, PanelAssistant, PanelDashboard } from './ShowcasePanels'

// ═══════════════════════════════════════════════════════════════════════════
// ScrollStory, το scrollytelling της landing: το προϊόν μένει καρφωμένο
// (sticky) στα αριστερά και αλλάζει «πράξη» καθώς ο επισκέπτης διαβάζει τα
// βήματα δεξιά. Σάρωση → Βοηθός → Έλεγχος. Το ενεργό βήμα ορίζεται με
// IntersectionObserver σε ζώνη γύρω από το κέντρο της οθόνης, ώστε η αλλαγή
// να γίνεται εκεί που κοιτάει το μάτι. Σε στενές οθόνες η στήλη sticky
// κρύβεται και κάθε βήμα δείχνει το δικό του πάνελ inline.
// ΠΡΟΣΟΧΗ: κανένας πρόγονος αυτού του δέντρου δεν πρέπει να έχει transform ή
// overflow (πέρα από clip στο ριζικό div), αλλιώς σπάει το position: sticky.
// ═══════════════════════════════════════════════════════════════════════════

const ACTS = [
  {
    key: 'scan',
    over: '01 · Σάρωση',
    h: 'Δεν πληκτρολογείς. Φωτογραφίζεις.',
    p: 'Λογαριασμός ρεύματος, κοινόχρηστα, μισθωτήριο, ασφαλιστήριο. Φωτογραφίζεις και ο βοηθός αναγνωρίζει ποσό, πάροχο, προθεσμία, κατανάλωση και τα καταχωρεί στο σωστό ακίνητο.',
    b: ['Κάθε έγγραφο βρίσκει τη θέση του', 'Η προθεσμία μπαίνει αυτόματα στις υπενθυμίσεις', 'Τα ποσά καταλήγουν στις δαπάνες του ακινήτου'],
    Panel: PanelScan,
  },
  {
    key: 'assistant',
    over: '02 · Βοηθός',
    h: 'Μιλάει και σκέφτεται ελληνικά.',
    p: 'Ρωτάς τον βοηθό όπως έναν σύμβουλο, κι εκείνος σε κατευθύνει με βάση τα δεδομένα και τις ανάγκες σου. Σου δείχνει την επόμενη κίνηση ή σε παραπέμπει στον κατάλληλο επαγγελματία.',
    b: ['Απαντά με τα δικά σου στοιχεία, όχι με γενικότητες', 'Καταλαβαίνει παρόχους ρεύματος, ΕΝΦΙΑ, κοινόχρηστα και τιμολόγια', 'Σε πάει κατευθείαν στη σωστή οθόνη για να πράξεις'],
    Panel: PanelAssistant,
  },
  {
    key: 'control',
    over: '03 · Έλεγχος',
    // ΓΙΑΤΙ ΑΛΛΑΞΕ: η σελίδα είχε έξι τίτλους στο σχήμα «Δύο λέξεις. Δύο λέξεις.»
    // Το σχήμα είναι δυνατό μία φορά και μανιέρα την έκτη. Κρατήθηκε εκεί που το
    // αξίζει (η αντίθεση πληκτρολογώ/φωτογραφίζω) και άλλαξε παντού αλλού.
    h: 'Ό,τι κατέγραψες, σε μία εικόνα.',
    p: 'Όσα κατέγραψες γίνονται εικόνα: απόδοση, δαπάνες και συγκρίσεις παρόχων, ζωντανά. Όταν υπάρχει τρόπος να γλιτώσεις χρήματα, το βλέπεις πρώτος.',
    b: ['Καθαρή απόδοση και ταμειακή ροή ανά ακίνητο', 'Σύγκριση παρόχων με την πραγματική σου κατανάλωση', 'Πρόταση εξοικονόμησης μόνο όταν υπάρχει λόγος'],
    Panel: PanelDashboard,
  },
]

export default function ScrollStory() {
  const [active, setActive] = useState(0)
  const stepsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = stepsRef.current
    if (!root) return
    const steps = Array.from(root.querySelectorAll<HTMLElement>('[data-idx]'))
    // Σε κάθε διέλευση ορίου, το ενεργό βήμα υπολογίζεται από τη γεωμετρία (ποιο
    // βήμα βρίσκεται στο μέσο της οθόνης) και όχι μόνο από το entry του event.
    // Έτσι η κατάσταση αυτοδιορθώνεται και στην ανάποδη κύλιση, χωρίς κολλήματα.
    const io = new IntersectionObserver(
      () => {
        const mid = window.innerHeight / 2
        let best = 0
        let bestDist = Infinity
        steps.forEach((s, i) => {
          const r = s.getBoundingClientRect()
          const d = r.top <= mid && r.bottom >= mid ? -1 : Math.abs(r.top + r.height / 2 - mid)
          if (d < bestDist) { bestDist = d; best = i }
        })
        setActive(best)
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 }
    )
    steps.forEach(s => io.observe(s))
    return () => io.disconnect()
  }, [])

  const goTo = (i: number) => {
    setActive(i)
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    stepsRef.current?.querySelector<HTMLElement>(`[data-idx="${i}"]`)?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'center' })
  }

  return (
    <div className="story-grid">
      <PanelFX />
      <style>{`
        .story-grid { display: grid; grid-template-columns: 1.05fr 1fr; gap: clamp(28px, 4vw, 64px); align-items: start; }
        .story-stick { position: sticky; top: clamp(72px, 12vh, 120px); }
        .story-frame { position: relative; height: clamp(400px, 52vh, 500px); border-radius: 18px; background: var(--bg-surface); border: 1px solid var(--border-default); overflow: hidden; box-shadow: 0 24px 70px -32px rgba(0,0,0,.35), 0 0 120px -50px color-mix(in srgb, var(--accent) 55%, transparent); container-type: inline-size; }
        .story-panel-inline { container-type: inline-size; }
        /* Σε στενό πλαίσιο (όχι στενή οθόνη), το πλευρικό μενού του πίνακα δεν χωρά. */
        @container (max-width: 470px) { .lp-rail { display: none; } }
        .story-panel { position: absolute; inset: 0; padding: clamp(18px, 2.4vw, 30px); display: flex; align-items: center; justify-content: center; opacity: 0; transform: translateY(14px) scale(.985); transition: opacity .5s cubic-bezier(.2,0,0,1), transform .5s cubic-bezier(.2,0,0,1); pointer-events: none; }
        .story-panel.on { opacity: 1; transform: none; pointer-events: auto; }
        .story-panel > * { width: 100%; max-width: 480px; }
        .story-rail { display: flex; gap: 8px; margin-top: 18px; }
        .story-dot { flex: 1; height: 38px; border-radius: 10px; border: 1px solid var(--border-subtle); background: transparent; color: var(--text-tertiary); font-family: inherit; font-size: 12px; font-weight: 700; letter-spacing: .06em; cursor: pointer; transition: color .3s, border-color .3s, background .3s; }
        .story-dot.on { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 45%, transparent); background: color-mix(in srgb, var(--accent) 8%, transparent); }
        .story-dot:hover { color: var(--text-primary); }
        .story-steps { display: flex; flex-direction: column; }
        /* 58vh και όχι 72vh: τρία βήματα × 72vh = 216vh διαδρομής, δηλαδή η
           ενότητα μόνη της έπιανε το 25% ολόκληρης της σελίδας. Στα 58vh η
           κάθε πράξη προλαβαίνει ακόμη να διαβαστεί και να «κλειδώσει» πριν
           αλλάξει η επόμενη — κάτω από ~50vh η εναλλαγή γίνεται νευρική. */
        .story-step { min-height: 58vh; display: flex; flex-direction: column; justify-content: center; opacity: .35; transition: opacity .45s cubic-bezier(.2,0,0,1); }
        .story-step.on { opacity: 1; }
        .story-panel-inline { display: none; }
        @media (max-width: 900px) {
          .story-grid { grid-template-columns: 1fr; }
          .story-stick { display: none; }
          .story-step { min-height: 0; opacity: 1; padding: 8px 0 40px; }
          .story-panel-inline { display: block; margin-top: 24px; border-radius: 16px; background: var(--bg-surface); border: 1px solid var(--border-default); padding: 18px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .story-panel { transition: none; }
          .story-step { transition: none; opacity: 1; }
        }
      `}</style>

      {/* Αριστερά: το καρφωμένο προϊόν που αλλάζει πράξη */}
      <div className="story-stick">
        <div className="story-frame" aria-hidden="true">
          {ACTS.map((a, i) => (
            <div key={a.key} className={`story-panel${i === active ? ' on' : ''}`}>
              <div><a.Panel /></div>
            </div>
          ))}
        </div>
        <div className="story-rail">
          {ACTS.map((a, i) => (
            <button key={a.key} type="button" className={`story-dot${i === active ? ' on' : ''}`} onClick={() => goTo(i)}>
              {a.over}
            </button>
          ))}
        </div>
      </div>

      {/* Δεξιά: τα βήματα της αφήγησης */}
      <div className="story-steps" ref={stepsRef}>
        {ACTS.map((a, i) => (
          <div key={a.key} data-idx={i} className={`story-step${i === active ? ' on' : ''}`}>
            <p style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', margin: '0 0 14px' }}>{a.over}</p>
            <h3 style={{ fontSize: 'clamp(22px, 2.6vw, 30px)', fontWeight: 680, letterSpacing: '-0.03em', lineHeight: 1.1, color: 'var(--text-primary)', margin: '0 0 14px' }}>{a.h}</h3>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 20px', maxWidth: 460 }}>{a.p}</p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {a.b.map((t, j) => (
                <li key={j} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 3 }}><path d="M20 6 9 17l-5-5" /></svg>
                  {t}
                </li>
              ))}
            </ul>
            <div className="story-panel-inline"><a.Panel /></div>
          </div>
        ))}
      </div>
    </div>
  )
}
