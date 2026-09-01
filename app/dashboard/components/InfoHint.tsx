'use client'
import { T } from '@/components/Theme'
import { useState, useRef, useCallback, useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// Μικρό, ενιαίο ⓘ με premium popover που εμφανίζεται στο hover/focus. Portal →
// δεν κόβεται από overflow. Θεματικό (light/dark). Χρήση με μέτρο: μόνο εκεί που
// υπάρχει ουσιαστική εξήγηση να «ανοίξει έξυπνα», ώστε το UI να μένει καθαρό.
export function InfoHint({ children, size = 14, label = 'Περισσότερα' }: { children: ReactNode; size?: number; label?: string }) {
  const ref = useRef<HTMLButtonElement>(null)
  // ═══════════════════════════════════════════════════════════════════════
  // ΤΟ ΚΕΙΜΕΝΟ ΥΠΑΡΧΕΙ ΠΑΝΤΑ ΓΙΑ ΤΟΝ ΑΝΑΓΝΩΣΤΗ ΟΘΟΝΗΣ, ΟΧΙ ΜΟΝΟ ΑΝΟΙΧΤΟ
  // ─────────────────────────────────────────────────────────────────────
  // Το popover ζει σε portal και μπαίνει στο DOM ΜΟΝΟ όσο είναι ανοιχτό. Ο
  // χρήστης βοηθητικής τεχνολογίας άκουγε «Περισσότερα, κουμπί» και τίποτε
  // άλλο: η εξήγηση δεν ανακοινωνόταν ποτέ, γιατί δεν υπήρχε να ανακοινωθεί.
  //
  // ΚΑΙ ΤΟ ΒΑΡΟΣ ΜΕΓΑΛΩΣΕ ΟΤΑΝ ΜΠΗΚΑΝ ΑΠΟΠΟΙΗΣΕΙΣ ΑΠΟ ΠΙΣΩ. Όσο εδώ έμπαιναν
  // ορισμοί, το κόστος ήταν μικρό. Νομική επιφύλαξη που δεν ακούγεται είναι
  // υποβάθμιση, όχι καθάρισμα.
  //
  // Το ίδιο κείμενο γράφεται σε κρυφό κόμβο με σταθερό `id` και το κουμπί το
  // δείχνει με `aria-describedby`. Οπτικά δεν αλλάζει τίποτα.
  const descId = useId()
  const [pos, setPos] = useState<{ top: number; left: number; place: 'top' | 'bottom' } | null>(null)

  // ═══════════════════════════════════════════════════════════════════════
  // Η ΠΛΕΥΡΑ ΔΙΑΛΕΓΕΤΑΙ ΜΕ ΜΕΤΡΗΣΗ ΧΩΡΟΥ, ΟΧΙ ΜΕ ΜΑΝΤΕΨΙΑ ΥΨΟΥΣ
  // ─────────────────────────────────────────────────────────────────────
  // Ηταν `below + 140 > innerHeight ? 'top' : 'bottom'`, δηλαδή «υπόθεσε ότι
  // κάθε επεξήγηση είναι 140 ψηλή». Οσο εδώ έμπαιναν ορισμοί μιας σειράς, η
  // υπόθεση κρατούσε. Στην Αξιοποίηση μπαίνει πίσω από το κυκλάκι ΟΛΟ το
  // κείμενο ενός κανόνα: το άρθρο 47Α είναι 515 χαρακτήρες, δηλαδή περίπου
  // 250 εικονοστοιχεία. Με το 140 ο υπολογισμός έλεγε «χωράει από κάτω», το
  // popover έμπαινε κάτω και έβγαινε εκατό εικονοστοιχεία έξω από την οθόνη.
  //
  // Δεν χρειάζεται να ξέρουμε το ύψος: αρκεί να διαλέξουμε την πλευρά με τον
  // ΠΕΡΙΣΣΟΤΕΡΟ χώρο. Οποιο κι αν είναι το κείμενο, πάει εκεί που χωράει
  // περισσότερο· σε ισοπαλία κάτω, που είναι η φυσική φορά ανάγνωσης.
  const show = useCallback(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const roomBelow = window.innerHeight - r.bottom - 16
    const roomAbove = r.top - 16
    const place = roomBelow >= roomAbove ? 'bottom' : 'top'
    const top = place === 'bottom' ? r.bottom + 8 : r.top - 8
    let left = r.left + r.width / 2
    left = Math.max(150, Math.min(left, window.innerWidth - 150))
    setPos({ top, left, place })
  }, [])
  const hide = useCallback(() => setPos(null), [])

  return (
    <>
      {/* ΤΟ ΚΥΚΛΑΚΙ ΕΙΝΑΙ 14 ΕΙΚΟΝΟΣΤΟΙΧΕΙΑ ΚΑΙ ΠΑΤΙΕΤΑΙ ΜΕ ΔΑΧΤΥΛΟ. Χωρίς ζώνη
          αφής ήταν το μικρότερο χειριστήριο της εφαρμογής, στο ένα τρίτο του
          ορίου· ο σαρωτής ΔΕΝ το έβλεπε: ο ανιχνευτής στόχων ζητούσε
          κείμενο και το κουμπί έχει μόνο σχήμα. Το `po-tap-inline` δίνει αόρατη
          ζώνη 44 σε ύψος και 24 σε πλάτος, χωρίς να μεγαλώσει το σημάδι ούτε
          κατά ένα. Το πλάτος σταματά στα 24, το όριο του WCAG 2.5.8: με 44 θα
          άπλωνε δεκαπέντε εικονοστοιχεία ανά πλευρά και θα άρπαζε το πάτημα
          από τον σύνδεσμο που κάθεται συχνά ακριβώς πριν από το ⓘ. */}
      <button
        className="po-tap-inline"
        ref={ref} type="button" aria-label={label} aria-describedby={descId}
        // ═══════════════════════════════════════════════════════════════
        // ΤΟ ΚΥΚΛΑΚΙ ΔΕΝ ΑΝΟΙΓΕ ΜΕ ΔΑΧΤΥΛΟ. ΜΕΤΡΗΘΗΚΕ, ΔΕΝ ΕΙΚΑΖΕΤΑΙ.
        // ─────────────────────────────────────────────────────────────
        // Με πραγματικό πάτημα σε Chromium με αφή, ο αριθμός των popover
        // στο DOM ήταν μηδέν πριν και μηδέν μετά. Δηλαδή ό,τι έμπαινε εδώ
        // πίσω ήταν, στο κινητό, απροσπέλαστο.
        //
        // Ο ΛΟΓΟΣ ΕΙΝΑΙ Η ΑΚΟΛΟΥΘΙΑ ΣΥΜΒΑΤΟΤΗΤΑΣ ΤΟΥ ΠΕΡΙΗΓΗΤΗ. Σε αφή
        // στέλνει pointerdown, pointerup, ΜΕΤΑ mouseenter και τελευταίο
        // click. Το mouseenter καλούσε `show()` και γέμιζε το `pos`· όταν
        // έφτανε το click, το `pos ? hide() : show()` έβλεπε γεμάτο `pos`
        // και ΕΚΛΕΙΝΕ ό,τι είχε ανοίξει ένα χιλιοστό νωρίτερα.
        //
        // Τα pointer events ξέρουν ΤΙ άγγιξε: το `pointerType`. Η αιώρηση
        // ισχύει μόνο για ποντίκι, το πάτημα ανοίγει και κλείνει για όλους.
        // ═══════════════════════════════════════════════════════════════
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') show() }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') hide() }}
        // ΚΑΙ Η ΕΣΤΙΑΣΗ ΗΤΑΝ Η ΔΕΥΤΕΡΗ ΜΙΣΗ ΤΟΥ ΙΔΙΟΥ ΠΡΟΒΛΗΜΑΤΟΣ. Με το
        // `pointerType` το mouseenter έπαψε να ανοίγει σε αφή· το κυκλάκι
        // ΠΑΛΙ δεν άνοιγε: το πάτημα εστιάζει το κουμπί, το `onFocus` καλούσε
        // `show()` και το click που ερχόταν αμέσως μετά έβρισκε γεμάτο `pos`.
        // Μετρημένο με πραγματικό πάτημα: mousedown, focus, click, μηδέν popover.
        //
        // Η εστίαση αφορά ΤΟ ΠΛΗΚΤΡΟΛΟΓΙΟ· ο περιηγητής το ξέρει: το
        // `:focus-visible` είναι αληθές μόνο όταν η εστίαση ήρθε με Tab.
        onFocus={(e) => { if (e.target.matches(':focus-visible')) show() }}
        onBlur={hide}
        onClick={(e) => { e.stopPropagation(); pos ? hide() : show() }}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', verticalAlign: 'middle',
          width: size, height: size, borderRadius: '50%', border: 'none', padding: 0, margin: '0 0 0 4px',
          background: 'transparent', color: 'var(--text-tertiary)', cursor: 'help', flexShrink: 0, lineHeight: 0,
          transition: 'color 0.13s',
        }}
        onMouseOver={(e) => (e.currentTarget.style.color = 'var(--accent)')}
        onMouseOut={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
      >
        <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.3" />
          <path d="M8 7.2v3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="5.1" r="0.85" fill="currentColor" />
        </svg>
      </button>
      {/* Ο κρυφός κόμβος που δείχνει το `aria-describedby`. Το `.sr-only` του
          globals.css τον βγάζει από την εικόνα χωρίς να τον βγάλει από το
          δέντρο προσβασιμότητας. */}
      <span id={descId} className="sr-only">{children}</span>
      {pos && typeof document !== 'undefined' && createPortal(
        <div
          role="tooltip"
          style={{
            position: 'fixed', top: pos.top, left: pos.left,
            transform: `translate(-50%, ${pos.place === 'bottom' ? '0' : '-100%'})`,
            zIndex: 9999, maxWidth: 280, width: 'max-content',
            background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
            border: '1px solid var(--border-default)', borderRadius: 10,
            padding: '12px', fontSize: 12, lineHeight: 1.55, fontFamily: T.font.sans,
            boxShadow: 'var(--elev-3)', pointerEvents: 'none',
          }}
        >
          {children}
        </div>,
        document.body,
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ⓘ ΔΕΝ ΜΕΝΕΙ ΠΟΤΕ ΜΟΝΟ ΤΟΥ ΣΕ ΔΙΚΗ ΤΟΥ ΓΡΑΜΜΗ
// ─────────────────────────────────────────────────────────────────────────
// Ο χρήστης το φωτογράφισε σε tablet, στην Αναφορά της Αξιοποίησης: «Ποιοι
// φόροι και τέλη βαρύνουν ποια πλευρά, με ποιον συντελεστή και τι απαλλαγές
// υπάρχουν.» έπιανε δύο γραμμές και το κυκλάκι έπεφτε ΤΡΙΤΗ, μόνο του,
// αριστερά, χωρίς τίποτα δίπλα του. Δεν είναι στιγμιαίο: συμβαίνει όποτε το
// κείμενο γεμίζει τη γραμμή ώς την άκρη, δηλαδή σε συγκεκριμένα πλάτη και σε
// κάθε μεγάλωμα γραμματοσειράς.
//
// Το κείμενο σπάει στο ΤΕΛΕΥΤΑΙΟ κενό του: η τελευταία λέξη μπαίνει μαζί με το
// κυκλάκι σε κουτί που δεν τυλίγει. Αν δεν χωρούν, κατεβαίνουν ΜΑΖΙ — που
// είναι το ζητούμενο. Ο τυπογράφος το λέει ορφανό· εδώ κοστίζει μια γραμμή
// κενή σε κάθε τέτοια σειρά.
// ═══════════════════════════════════════════════════════════════════════════
export function HintedText({ text, label, children, style }: {
  text: string
  label: string
  children: ReactNode
  style?: React.CSSProperties
}) {
  const cut = text.lastIndexOf(' ')
  const head = cut > 0 ? text.slice(0, cut + 1) : ''
  const tail = cut > 0 ? text.slice(cut + 1) : text
  return (
    <span style={style}>
      {head}
      <span style={{ whiteSpace: 'nowrap' }}>
        {tail}
        <InfoHint label={label}>{children}</InfoHint>
      </span>
    </span>
  )
}
