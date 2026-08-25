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

// Η ΠΑΡΑΓΡΑΦΟΣ ΚΑΙ ΤΑ ΣΗΜΕΙΑ ΕΛΕΓΧΟΥ ΕΛΕΓΑΝ ΤΑ ΙΔΙΑ. Η παράγραφος του δεύτερου
// βήματος έλεγε «απαντά με βάση τα δικά σου δεδομένα» και το πρώτο σημείο από
// κάτω «Απαντά με τα δικά σου στοιχεία, όχι με γενικότητες» — η ίδια πρόταση,
// δύο φορές, με απόσταση δώδεκα εικονοστοιχείων. Το ίδιο και στα άλλα δύο βήματα.
// Πλέον η παράγραφος λέει την ΥΠΟΣΧΕΣΗ και τα σημεία τον ΜΗΧΑΝΙΣΜΟ: τι ακριβώς
// συμβαίνει, πού καταλήγει, τι δεν χρειάζεται να κάνεις.
//
// Το μήκος κάθε παραγράφου είναι ΜΕΤΡΗΜΕΝΟ στη στήλη των 460 εικονοστοιχείων
// ώστε να γεμίζει δύο ολόκληρες γραμμές. Όποιος τις ξαναγράψει, να ξαναμετρήσει.
// ΟΙ ΤΡΕΙΣ ΠΕΡΙΓΡΑΦΕΣ ΧΩΡΑΝΕ ΣΕ ΔΥΟ ΓΡΑΜΜΕΣ, ΚΑΙ ΟΙ ΤΡΕΙΣ. Ήταν 110, 120 και 117
// χαρακτήρες σε στήλη που αφήνει περίπου πενήντα επτά: η καθεμία κατέβαινε τρίτη
// γραμμή με τρεις ή οκτώ χαρακτήρες πάνω της. Μια σειρά που κρέμεται μισή είναι
// ορατή ως ατέλεια πριν καν διαβαστεί. Το όριο για δύο γεμάτες γραμμές είναι 108.
//
// ΚΑΙ ΤΟ ΚΟΨΙΜΟ ΕΓΙΝΕ ΕΚΕΙ ΠΟΥ Η ΠΡΟΤΑΣΗ ΕΠΑΝΕΛΑΒΕ ΤΟΝ ΤΙΤΛΟ ΤΗΣ. Ο τίτλος λέει
// «Μιλάει και σκέφτεται ελληνικά» και η περιγραφή από κάτω ξανάλεγε «στα
// ελληνικά»· ο τίτλος λέει «Ό,τι κατέγραψες, σε μία εικόνα» και η περιγραφή
// ξεκινούσε «Όσα κατέγραψες γίνονται εικόνα». Κόπηκε η επανάληψη, όχι η ουσία.
const ACTS = [
  {
    key: 'scan',
    over: '01 · Σάρωση',
    nav: 'φωτογραφίζεις λογαριασμό ή μισθωτήριο και συμπληρώνεται μόνο του',
    h: 'Δεν πληκτρολογείς. Φωτογραφίζεις.',
    p: 'Λογαριασμός, μισθωτήριο ή ασφαλιστήριο, σε φωτογραφία ή PDF: συμπληρώνεται ό,τι θα πληκτρολογούσες.',
    b: ['Το ποσό καταλήγει στις δαπάνες του ακινήτου', 'Η προθεσμία μπαίνει αυτόματα στις υπενθυμίσεις', 'Το έγγραφο αρχειοθετείται στο σωστό ακίνητο'],
    Panel: PanelScan,
  },
  {
    key: 'assistant',
    over: '02 · Βοηθός',
    nav: 'ρωτάς στα ελληνικά και απαντά από τα δικά σου δεδομένα',
    h: 'Μιλάει και σκέφτεται ελληνικά.',
    p: 'Ρωτάς όπως θα ρωτούσες έναν σύμβουλο και η απάντηση βγαίνει από τα δικά σου δεδομένα, όχι από εγχειρίδια.',
    b: ['Καταλαβαίνει ΕΝΦΙΑ, κοινόχρηστα και τιμολόγια ρεύματος', 'Σε πάει κατευθείαν στη σωστή οθόνη για να πράξεις', 'Σε παραπέμπει σε επαγγελματία όταν χρειάζεται'],
    Panel: PanelAssistant,
  },
  {
    key: 'control',
    over: '03 · Έλεγχος',
    nav: 'όσα κατέγραψες γίνονται μία εικόνα',
    // ΓΙΑΤΙ ΑΛΛΑΞΕ: η σελίδα είχε έξι τίτλους στο σχήμα «Δύο λέξεις. Δύο λέξεις.»
    // Το σχήμα είναι δυνατό μία φορά και μανιέρα την έκτη. Κρατήθηκε εκεί που το
    // αξίζει (η αντίθεση πληκτρολογώ/φωτογραφίζω) και άλλαξε παντού αλλού.
    h: 'Ό,τι κατέγραψες, σε μία εικόνα.',
    p: 'Την ίδια στιγμή, χωρίς να ετοιμάσεις τίποτα και χωρίς να περιμένεις το τέλος του μήνα.',
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
        /* ΤΑ ΤΡΙΑ ΚΟΥΜΠΙΑ ΤΗΣ ΙΣΤΟΡΙΑΣ ΗΤΑΝ 38 ΨΗΛΑ, ΣΕ ΚΑΘΕ ΠΛΑΤΟΣ. Είναι ο μόνος
           τρόπος να πηδήξεις σε πράξη χωρίς να κυλήσεις, δηλαδή πραγματικός
           στόχος και όχι διακόσμηση και έμεναν έξι εικονοστοιχεία κάτω από τον
           κανόνα των 44. Το ύψος ανεβαίνει παντού: στον υπολογιστή ένα κουμπί
           λίγο ψηλότερο δεν χαλά τίποτα, στο τηλέφωνο το κάνει χτυπητό. */
        .story-dot { flex: 1; min-height: 44px; border-radius: 10px; border: 1px solid var(--border-subtle); background: transparent; color: var(--text-tertiary); font-family: inherit; font-size: 12px; font-weight: 700; letter-spacing: .06em; cursor: pointer; transition: color .3s, border-color .3s, background .3s; }
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
        {/* ═══ ΤΟ ΡΑΓΙ ΛΕΕΙ ΠΟΥ ΕΙΣΑΙ, ΤΙ ΘΑ ΔΕΙΣ ΚΑΙ ΟΤΙ ΘΑ ΜΕΤΑΚΙΝΗΘΕΙΣ ══════
            ΤΡΙΑ ΚΟΥΜΠΙΑ ΧΩΡΙΣ ΚΑΜΙΑ ΚΑΤΑΣΤΑΣΗ. Η ενεργή πράξη δηλωνόταν μόνο με
            την κλάση .on, δηλαδή με χρώμα. Μετρημένο σε πραγματικό Chromium και
            τα τρία έδιναν aria-pressed, aria-selected και aria-current κενά: ο
            αναγνώστης οθόνης άκουγε τρία ίδια κουμπιά και καμία ένδειξη για το
            ποιο παίζει. Το aria-pressed το λέει πλέον, με την ίδια συνθήκη που
            δίνει και το χρώμα.

            ΚΑΙ ΤΟ ΟΝΟΜΑ ΔΕΝ ΕΙΝΑΙ ΤΟ ΝΟΥΜΕΡΟ. Το πάνελ αριστερά είναι
            διακοσμητικό και ΜΕΝΕΙ aria-hidden: είναι κίνηση χωρίς περιεχόμενο
            και μια ψεύτικη απόδειξη με ψεύτικα ποσά δεν έχει τίποτα να πει σε
            όποιον δεν τη βλέπει. Άρα το κουμπί είναι η ΜΟΝΗ περιγραφή αυτού που
            αλλάζει και το «01» δεν περιγράφει τίποτα. Στην οθόνη μένει το κοντό
            «01 · Σάρωση» που χωράει στο ένα τρίτο του ραγιού, ενώ το aria-label
            λέει ολόκληρη την πράξη.

            ΤΟ ΟΝΟΜΑ ΞΕΚΙΝΑ ΜΕ ΤΟ ΟΡΑΤΟ ΚΕΙΜΕΝΟ, ΚΑΙ ΔΕΝ ΕΙΝΑΙ ΛΕΠΤΟΜΕΡΕΙΑ. Ένα
            aria-label που πετά το ορατό «01 · Σάρωση» σπάει τον χειρισμό με
            φωνή: ο χρήστης λέει ό,τι ΔΙΑΒΑΖΕΙ και το κουμπί δεν αποκρίνεται σε
            όνομα που δεν φαίνεται πουθενά. Το ορατό μπαίνει πρώτο αυτούσιο, η
            περιγραφή ακολουθεί.

            ΤΟ ΣΚΡΟΛ ΜΕΝΕΙ, ΓΙΑΤΙ ΕΙΝΑΙ Ο ΛΟΓΟΣ ΠΟΥ ΥΠΑΡΧΕΙ ΤΟ ΚΟΥΜΠΙ. Χωρίς τη
            μετακίνηση το πάτημα δεν κάνει ΤΙΠΟΤΑ αντιληπτό: αλλάζει ένα πάνελ
            που είναι ήδη κρυμμένο από τον αναγνώστη και ένα χρώμα. Το ραγί είναι
            συντόμευση προς την πράξη, όπως ένας σύνδεσμος αγκύρωσης και η
            κίνηση σέβεται ήδη το prefers-reduced-motion μέσα στο goTo. Αυτό που
            έλειπε δεν ήταν το σκρολ, ήταν η προειδοποίηση: το όνομα λέει πλέον
            «Πήγαινε στην πράξη 2 από 3», οπότε και η μετακίνηση και ο προορισμός
            ακούγονται ΠΡΙΝ το πάτημα, όχι μετά. */}
        <div className="story-rail">
          {ACTS.map((a, i) => (
            <button key={a.key} type="button" className={`story-dot${i === active ? ' on' : ''}`}
              aria-pressed={i === active}
              aria-label={`${a.over}. Πήγαινε στην πράξη ${i + 1} από ${ACTS.length}: ${a.nav}`}
              onClick={() => goTo(i)}>
              {a.over}
            </button>
          ))}
        </div>
      </div>

      {/* Δεξιά: τα βήματα της αφήγησης */}
      <div className="story-steps" ref={stepsRef}>
        {ACTS.map((a, i) => (
          <div key={a.key} data-idx={i} className={`story-step${i === active ? ' on' : ''}`}>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', margin: '0 0 14px' }}>{a.over}</p>
            {/* ═══ Ο ΤΙΤΛΟΣ ΔΕΝ ΣΠΑΕΙ ΣΤΑ ΔΥΟ ══════════════════════════════════
                «Δεν πληκτρολογείς. Φωτογραφίζεις.» είναι ΜΙΑ αντίθεση: κομμένη
                στη μέση, το «Φωτογραφίζεις.» πέφτει μόνο του σε δεύτερη σειρά και
                χάνει τη σύγκριση που κάνει τη φράση να δουλεύει.
                Το μέγεθος ήταν δεμένο στο πλάτος ΟΘΟΝΗΣ (2.6vw) ενώ ο τίτλος ζει
                σε στήλη 460 εικονοστοιχείων: στα 30 δεν χωράει και σε καμία
                οθόνη δεν θα χωρούσε. Μετριέται πλέον σε cqi, δηλαδή σε ποσοστό
                του πλάτους της ΣΤΗΛΗΣ, με τον συντελεστή βγαλμένο από τον
                ΜΑΚΡΥΤΕΡΟ από τους τρεις τίτλους — ώστε να χωρούν και οι τρεις σε
                μία σειρά, στο ίδιο μέγεθος.

                ΔΟΚΙΜΑΣΤΗΚΕ ΜΕ cqi ΚΑΙ ΓΥΡΙΣΕ ΠΙΣΩ ΣΕ vw. Οι μονάδες δοχείου
                απαιτούν να έχει όντως δηλωθεί δοχείο· όπου δεν βρεθεί, ο κανόνας
                υποχωρεί στο ΠΛΑΤΟΣ ΟΘΟΝΗΣ, οπότε σε μεγάλη οθόνη το μέγεθος
                κολλούσε στο ανώτατο και ο τίτλος ξανάσπαγε — δηλαδή η διόρθωση
                φαινόταν να μην έγινε καθόλου. Με ρητό ανώτατο 23 και μέτρο 460,
                ο μακρύτερος τίτλος χωράει σε μία σειρά ΚΑΙ ΣΤΙΣ ΔΥΟ περιπτώσεις.
                Το μέγεθος έπεσε από τα 30 στα 23: η ακεραιότητα της αντίθεσης
                αξίζει περισσότερο από επτά εικονοστοιχεία. */}
            <h3 style={{ fontSize: 'clamp(15px, 2vw, 23px)', fontWeight: 680, letterSpacing: '-0.03em', lineHeight: 1.15, color: 'var(--text-primary)', margin: '0 0 14px', maxWidth: 460 }}>{a.h}</h3>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 20px', maxWidth: 460 }}>{a.p}</p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {a.b.map((t, j) => (
                <li key={j} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
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
