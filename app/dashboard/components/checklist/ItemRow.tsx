'use client'
// ═══════════════════════════════════════════════════════════════════════════
// ΜΙΑ ΣΕΙΡΑ ΤΗΣ ΛΙΣΤΑΣ ΕΚΚΡΕΜΟΤΗΤΩΝ
// ─────────────────────────────────────────────────────────────────────────
// Η πυκνότερη οθόνη της καρτέλας: κατάσταση, προτεραιότητα, προθεσμία,
// εξάρτηση από άλλη εργασία, υποεργασίες, απόδειξη και μενού ενεργειών, σε μία
// γραμμή που πρέπει να διαβάζεται με μια ματιά.
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from 'react'
import { useCoarsePointer } from '@/components/useCoarsePointer'
import { T, fe } from '@/components/Theme'
import { isTaxTaskRef } from '@/lib/checklist/obligationTasks'
import { WHO_LABEL } from '@/lib/accounting/dossier'
import { fmtDate, isOverdue, daysUntil, getPri, priShowDot, priDotColor } from './calc'
import { relDays } from './Bits'
import type { ChecklistItem } from './model'


// ─── ItemRow ──────────────────────────────────────────────────────────────────
/** Μια ενέργεια του μενού σειράς. Ρητός τύπος ώστε το `danger` να είναι
 *  προαιρετικό και η λίστα να μπορεί να χτίζεται με συνθήκη. */
interface RowAction { label: string; sub: string; icon: string; danger?: boolean; fn: () => void }

export function ItemRow({ item, allItems, onToggle, onEdit, onDelete, onAddToCalendar, onScanReceipt, onDuplicate, onSelect, selected, selectMode }: {
  item: ChecklistItem; allItems: ChecklistItem[]; onToggle: () => void; onEdit: () => void; onDelete: () => void
  onAddToCalendar: () => void; onScanReceipt: () => void; onDuplicate: () => void
  onSelect?: () => void; selected?: boolean; selectMode?: boolean
}) {
  const [hov, setHov] = useState(false)
  // ═══ ΤΟ ΜΕΝΟΥ ΤΗΣ ΣΕΙΡΑΣ ΗΤΑΝ ΑΟΡΑΤΟ ΣΕ ΚΑΘΕ ΚΙΝΗΤΟ ══════════════════════
  // Η διαφάνεια του «···» ήταν δεμένη ΜΟΝΟ στο `hov`, δηλαδή σε δείκτη που
  // αιωρείται. Σε οθόνη αφής δεν υπάρχει αιώρηση: το `hov` έμενε false για
  // πάντα, άρα το κουμπί έμενε στο opacity 0. Μαζί του έμεναν απρόσιτες ΟΛΕΣ οι
  // ενέργειες της εργασίας, γιατί ζουν όλες πίσω από αυτό το μενού.
  //
  // ΜΕΤΡΗΜΕΝΟ ΣΕ ΠΡΑΓΜΑΤΙΚΟ CHROMIUM ΜΕ hasTouch, ΣΤΑ 390: δύο κουμπιά
  // «Ενέργειες» με opacity ακριβώς 0. Δεν φαινόταν σε καμία σάρωση, γιατί ο
  // πάγκος έσπερνε τις εκκρεμότητες με λάθος ονόματα στηλών και η οθόνη
  // μετριόταν πάντα άδεια.
  //
  // Το ίδιο ιδίωμα με το Αρχείο και τις Επαφές: σε δάχτυλο, πάντα ορατό.
  const coarse = useCoarsePointer()
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 })

  const overdue = isOverdue(item.due_date, item.status); const due = daysUntil(item.due_date)
  const done = item.status === 'done'
  const dependsOn = item.depends_on ? allItems.find(i => i.id === item.depends_on) : null
  const blocked = !!(dependsOn && dependsOn.status !== 'done')

  // Διακριτικό «pop» μόνο στη μετάβαση εκκρεμές→ολοκληρωμένο μέσα στη ζωή της σειράς
  // (όχι στο πρώτο mount ήδη-ολοκληρωμένων), ώστε να μη «χοροπηδάει» όλη η λίστα στο load.
  const [pop, setPop] = useState(false)
  const prevDone = useRef(done)
  useEffect(() => {
    if (done && !prevDone.current) { setPop(true); const t = setTimeout(() => setPop(false), 440); prevDone.current = done; return () => clearTimeout(t) }
    prevDone.current = done
  }, [done])

  useEffect(() => {
    if (!showMenu) return
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) && menuBtnRef.current && !menuBtnRef.current.contains(e.target as Node)) setShowMenu(false)
    }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [showMenu])

  const openMenu = () => {
    if (menuBtnRef.current) {
      const r = menuBtnRef.current.getBoundingClientRect()
      const menuH = 372 // ύψος μενού· αναποδογύρισε προς τα πάνω αν δεν χωράει κάτω
      const down = r.bottom + menuH + 8 < window.innerHeight
      setMenuPos({ top: down ? r.bottom + 6 : Math.max(8, r.top - menuH - 6), right: window.innerWidth - r.right })
    }
    setShowMenu(s => !s)
  }

  // Ο κύκλος ολοκλήρωσης γέμιζε πράσινος. Σε λίστα με δεκαοκτώ εργασίες, τα
  // πράσινα κουμπάκια γίνονταν το πιο δυνατό χρώμα της οθόνης — και το χρώμα
  // του σήματος έμενε για τα δευτερεύοντα. Η ολοκλήρωση είναι ενέργεια του
  // χρήστη, όχι ετυμηγορία: παίρνει το χρώμα των ενεργειών.
  const cbColor = done ? 'var(--accent)' : overdue ? 'var(--negative)' : 'var(--border-default)'
  const cbBg = done ? 'var(--accent)' : 'transparent'
  // Ένα και μόνο control ανά σειρά: όταν είναι ενεργή η «Επιλογή» (ή η σειρά είναι
  // επιλεγμένη) εμφανίζεται το τετράγωνο checkbox επιλογής· αλλιώς το στρογγυλό toggle
  // ολοκλήρωσης. Ποτέ και τα δύο μαζί — τέλος στο «διπλό checkbox».
  const selecting = !!selectMode || !!selected

  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onClick={selecting ? () => onSelect?.() : undefined}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', background: selected ? 'var(--accent-soft)' : hov ? 'var(--bg-elevated)' : 'transparent', border: 'none', borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.12s', opacity: blocked && !selected ? 0.6 : 1, position: 'relative', cursor: selecting ? 'pointer' : 'default' }}>

      {selecting ? (
        // Τετράγωνο checkbox επιλογής (μαζικές ενέργειες)
        <button type="button" aria-label={selected ? 'Αποεπιλογή εργασίας' : 'Επιλογή εργασίας'} onClick={e => { e.stopPropagation(); onSelect?.() }}
          style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, border: '2px solid ' + (selected ? 'var(--accent)' : 'var(--border-default)'), background: selected ? 'var(--accent)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s' }}>
          {selected && <svg aria-hidden="true" width="10" height="10" viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3" fill="none" stroke="var(--accent-text)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </button>
      ) : (
        // Στρογγυλό toggle ολοκλήρωσης (Gmail/Linear pattern).
        // Το πλαίσιο των 20 είναι ΣΧΗΜΑ, όχι κουμπί με λεκτικό: το δάπεδο των 44
        // θα το τέντωνε σε 20 επί 44 και θα χάλαγε τον κύκλο. Η κλάση po-box
        // δίνει αόρατη ζώνη 44 επί 44 γύρω του, χωρίς να κουνηθεί η διάταξη.
        <button type="button" className="po-box" onClick={() => { if (!blocked) onToggle() }} aria-label={done ? 'Αναίρεση ολοκλήρωσης' : 'Ολοκλήρωση'}
          style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, border: '2px solid ' + cbColor, background: cbBg, cursor: blocked ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s', animation: pop ? 'taskCheckPop 0.44s cubic-bezier(.34,1.56,.64,1)' : undefined }}
          onMouseEnter={e => { if (!done && !blocked) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-soft)' } }}
          onMouseLeave={e => { if (!done && !blocked) { e.currentTarget.style.borderColor = overdue ? 'var(--negative)' : 'var(--border-default)'; e.currentTarget.style.background = 'transparent' } }}>
          {done && (
            <svg aria-hidden="true" width="10" height="10" viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3" fill="none" stroke="var(--text-inverse)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={pop ? { strokeDasharray: 16, animation: 'taskCheckDraw 0.32s ease 0.08s both' } : undefined}/></svg>
          )}
        </button>
      )}

      {/* Ήρεμη, σαρώσιμη σειρά: τελεία προτεραιότητας + τίτλος + προθεσμία + μία ένδειξη (ανάθεση).
          Δευτερεύοντα (ετικέτες, κόστος, υπο-εργασίες, σχόλια, επανάληψη) ζουν στην προβολή λεπτομερειών. */}
      {/* ΣΕ 320 ΜΕ ΜΕΓΑΛΩΜΕΝΟ ΚΕΙΜΕΝΟ Η ΠΡΟΘΕΣΜΙΑ ΔΕΝ ΧΩΡΑΕΙ ΔΙΠΛΑ ΣΤΟΝ ΤΙΤΛΟ.
          Μετρημένο σε κλίμακα ×1,3: το «20 Νοε 2025 · πριν 285 ημέρες» έβγαινε
          26 εικονοστοιχεία έξω από την κάρτα, γιατί η σειρά δεν τύλιγε ποτέ.
          Τυλίγει· και η ίδια η προθεσμία δεν ξεπερνά το πλάτος της γραμμής. */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 10px' }}>
        {priShowDot(item.priority) && <span title={'Προτεραιότητα: ' + getPri(item.priority).label} style={{ width: 7, height: 7, borderRadius: '50%', background: item.priority === 'critical' ? priDotColor(item.priority) : 'transparent', border: item.priority === 'critical' ? 'none' : '1.5px solid var(--text-tertiary)', boxSizing: 'border-box', flexShrink: 0 }} />}
        <span style={{ fontSize: 14, fontWeight: 500, color: done || blocked ? 'var(--text-secondary)' : 'var(--text-primary)', textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.6 : 1, fontFamily: T.font.sans, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'opacity 0.3s ease, color 0.3s ease' }}>
          {item.description}
        </span>
        {item.due_date && (
          <span style={{ flexShrink: 0, maxWidth: '100%', fontSize: 11, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: overdue && !done ? 'var(--negative)' : due !== null && due <= 3 && due >= 0 && !done ? 'var(--warning)' : 'var(--text-tertiary)', fontWeight: (overdue || (due !== null && due <= 3)) && !done ? 700 : 400 }}>
            {fmtDate(item.due_date)}{overdue && !done && due !== null ? ` · πριν ${relDays(due)}` : ''}{!overdue && due !== null && due <= 3 && due >= 0 && !done ? ` · ${due === 0 ? 'σήμερα' : 'σε ' + relDays(due)}` : ''}
          </span>
        )}
        {item.assigned_contact_name && (
          <span title={'Ανατέθηκε σε ' + item.assigned_contact_name} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: 150, fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
            <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7, flexShrink: 0 }}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.assigned_contact_name}</span>
          </span>
        )}
        {/* ΠΟΙΟΣ ΤΟ ΚΑΝΕΙ, με τις ίδιες λέξεις που χρησιμοποιεί ο φάκελος του
            λογιστή. «Το κάνει ο λογιστής» πάνω σε μια γραμμή είναι η διαφορά
            μεταξύ μιας λίστας που αγχώνει και μιας που καθησυχάζει. */}
        {item._who && item._who !== 'owner' && (
          <span title={WHO_LABEL[item._who]} style={{ flexShrink: 0, padding: '1px 8px', borderRadius: T.radius.pill, border: '1px solid var(--border-subtle)', fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans, whiteSpace: 'nowrap' }}>
            {WHO_LABEL[item._who]}
          </span>
        )}
        {/* ΤΟ ΠΑΡΑΣΤΑΤΙΚΟ ΚΑΙ ΤΟ ΠΟΣΟ ΤΟΥ. Φαίνεται μόνο όταν υπάρχει αρχείο:
            ποσό χωρίς χαρτί δεν εμφανίζεται πουθενά σε αυτή την οθόνη. */}
        {item._receipt && item.actual_cost > 0 && (
          <span title={`Παραστατικό: ${item._receipt.name}`} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>
            <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
            {fe(item.actual_cost)}
          </span>
        )}
        {/* Η «Πηγή» ήταν γαλάζιος σύνδεσμος σε ΚΑΘΕ θεσμική υποχρέωση: σε
            λίστα με δεκαοκτώ γραμμές, δεκαοκτώ σύνδεσμοι που κανείς δεν πατά
            δύο φορές. Η ημερομηνία εξακολουθεί να χρειάζεται επαλήθευση, οπότε
            ο σύνδεσμος δεν χάθηκε: ζει στο μενού ενεργειών της σειράς, μαζί με
            τα υπόλοιπα. Έξω από τη σειρά, μέσα στη σειρά όταν τον θέλεις. */}
      </div>

      {/* Μία διακριτική ενέργεια «···» — όλες οι λειτουργίες μαζεμένες, καθαρή σειρά. */}
      {!selecting && (
        <button ref={menuBtnRef} type="button" className="po-box" onClick={openMenu} title="Ενέργειες" aria-label="Ενέργειες"
          style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '1px solid ' + (showMenu ? 'var(--border-default)' : 'transparent'), background: showMenu ? 'var(--bg-elevated)' : 'transparent', color: 'var(--text-secondary)', opacity: hov || coarse || showMenu ? 1 : 0, transition: 'opacity 0.15s, background 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)' }}
          onMouseLeave={e => { if (!showMenu) e.currentTarget.style.background = 'transparent' }}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>
        </button>
      )}

      {showMenu && (
        <div ref={menuRef} style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 6, zIndex: 9999, minWidth: 230, boxShadow: 'var(--elev-3)' }}>
          {([
            { label: 'Επεξεργασία', sub: '', icon: 'M12 20h9 M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z', fn: () => { onEdit(); setShowMenu(false) } },
            // Οι ΦΟΡΟΛΟΓΙΚΕΣ προθεσμίες δεν ξαναγράφονται στο ημερολόγιο από εδώ:
            // τις γράφει ήδη η Επισκόπηση/Ημερολόγιο με το κλειδί `tax:<id>`. Δύο
            // κουμπιά για το ίδιο γεγονός σήμαινε δύο εγγραφές, δύο μήνες μακριά.
            ...(isTaxTaskRef(item._ref) ? [] : [
              { label: 'Προγραμμάτισε υπενθύμιση', sub: item.due_date ? 'Στο ημερολόγιο + email' : 'Χρειάζεται προθεσμία', icon: 'M3 4h18v18H3z M16 2v4 M8 2v4 M3 10h18', fn: () => { onAddToCalendar(); setShowMenu(false) } },
            ]),
            // ΤΟ ΠΟΣΟ ΜΠΑΙΝΕΙ ΜΟΝΟ ΜΕ ΦΩΤΟΓΡΑΦΙΑ. Εδώ υπήρχε «Καταχώρηση δαπάνης»
            // που ζητούσε ποσό στο χέρι χωρίς συνημμένο: η δαπάνη δεν έφτανε ποτέ
            // στο Αρχείο και το πραγματικό κόστος έμενε 0.
            { label: item._receipt ? 'Άλλαξε το παραστατικό' : 'Φωτογράφισε το τιμολόγιο', sub: item._receipt ? `Τώρα: ${item._receipt.name}` : 'Ποσό, αρχείο και δαπάνη με μία κίνηση', icon: 'M14.5 4h-5L7 7H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2h-3z M12 17a4 4 0 100-8 4 4 0 000 8z', fn: () => { onScanReceipt(); setShowMenu(false) } },
            { label: 'Υπενθύμιση σε WhatsApp', sub: 'Άνοιγμα με έτοιμο μήνυμα', icon: 'M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z', fn: () => { window.open(`https://wa.me/?text=${encodeURIComponent('Υπενθύμιση: ' + item.description + (item.due_date ? ` έως ${fmtDate(item.due_date)}` : ''))}`, '_blank'); setShowMenu(false) } },
            { label: 'Υπενθύμιση σε Viber', sub: 'Άνοιγμα με έτοιμο μήνυμα', icon: 'M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z', fn: () => { window.open(`viber://forward?text=${encodeURIComponent('Υπενθύμιση: ' + item.description + (item.due_date ? ` έως ${fmtDate(item.due_date)}` : ''))}`, '_blank'); setShowMenu(false) } },
            { label: 'Αντιγραφή', sub: 'Δημιουργία αντιγράφου', icon: 'M9 9h13v13H9z M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1', fn: () => { onDuplicate(); setShowMenu(false) } },
            // Η επίσημη πηγή της προθεσμίας. Ήταν γαλάζιος σύνδεσμος πάνω στη
            // σειρά, σε κάθε θεσμική υποχρέωση· εδώ είναι μία γραμμή σε μενού
            // που ανοίγει όποιος τη θέλει και η λίστα ξαναβρίσκει την ησυχία της.
            ...(item._src ? [
              { label: 'Επίσημη πηγή', sub: 'Άνοιγμα σε νέα καρτέλα', icon: 'M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6 M15 3h6v6 M10 14L21 3', fn: () => { window.open(item._src!, '_blank', 'noopener,noreferrer'); setShowMenu(false) } },
            ] : []),
            { label: 'Διαγραφή', sub: '', icon: 'M3 6h18 M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2 M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6', danger: true, fn: () => { onDelete(); setShowMenu(false) } },
          ] as RowAction[]).map((a, i) => (
            <button key={i} type="button" onClick={a.fn}
              style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '9px 12px', borderRadius: T.radius.inner, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s' }}
              onMouseEnter={e => (e.currentTarget.style.background = a.danger ? 'var(--negative-dim)' : 'var(--bg-surface)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={a.danger ? 'var(--negative)' : 'var(--text-tertiary)'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>{a.icon.split(' M').map((seg, j) => <path key={j} d={(j === 0 ? '' : 'M') + seg} />)}</svg>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, color: a.danger ? 'var(--negative)' : 'var(--text-primary)', fontWeight: 500, fontFamily: T.font.sans }}>{a.label}</div>
                {a.sub ? <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>{a.sub}</div> : null}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Η BoardCard έφυγε μαζί με την όψη kanban που την αποδίδε.

