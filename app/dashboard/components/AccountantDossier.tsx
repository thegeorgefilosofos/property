'use client'
// ═══════════════════════════════════════════════════════════════════════════
// ΤΙ ΠΑΕΙ ΣΤΟΝ ΛΟΓΙΣΤΗ.
//
// Η ΟΘΟΝΗ ΕΧΕΙ ΕΝΑ ΜΟΝΟ ΚΑΘΗΚΟΝ: να κάνει ορατό μέσα σε δύο δευτερόλεπτα ότι
// από τα έντεκα πράγματα, τα έξι τα βγάζει το εργαλείο, τα τρία τα κάνει ο
// λογιστής, και μόνο δύο είναι δικά σου. Γι' αυτό η ομαδοποίηση είναι κατά
// ΠΟΙΟΝ και όχι κατά θέμα, και γι' αυτό η ομάδα «Χρειάζεται από εσένα» είναι
// πρώτη: είναι η μόνη που ζητά ενέργεια.
//
// ΚΑΘΕ ΓΡΑΜΜΗ ΛΕΕΙ ΤΟ ΓΙΑΤΙ ΤΗΣ. Ο χρήστης που δεν καταλαβαίνει γιατί ζητάμε
// ένα χαρτί, δεν το φέρνει. Το `why` δεν είναι διακόσμηση, είναι ο λόγος που
// θα σηκωθεί να ψάξει στο myAADE.
//
// ΤΑ ΜΠΛΟΚΑΡΙΣΤΙΚΑ ΞΕΧΩΡΙΖΟΥΝ ΧΩΡΙΣ ΝΑ ΟΥΡΛΙΑΖΟΥΝ. Μια ήσυχη ετικέτα, όχι
// κόκκινο. Οι παγίδες είναι συμβουλή, όχι κατηγορία: ο χρήστης δεν έφταιξε που
// δεν ήξερε ότι το τέλος ανθεκτικότητας δεν είναι έσοδό του.
//
// Η ΛΟΓΙΚΗ ΔΕΝ ΖΕΙ ΕΔΩ. Ποιος φέρνει τι, τι μπλοκάρει, ποιος βλέπει ισολογισμό:
// όλα στο lib/accounting/dossier.ts, δοκιμασμένα. Εδώ μόνο η εικόνα τους.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { T, TT, Badge } from '@/components/Theme'
import { ChevronRight, Download, Check as CheckIcon } from 'lucide-react'
import {
  requirementsFor, readiness, groupByWho, traps, defaultBookkeeping,
  statusForAccountant, LEGAL_FORM_LABEL, WHO_LABEL,
  type LegalForm, type BookKeeping, type Requirement, type Who,
} from '@/lib/accounting/dossier'
import type { PropertyStatus } from '@/lib/property/status'
import { exportAccountantDossier, type AccountantStatementLine, type AccountantMovement } from './accountantExport'

// ── Οι παραδοχές που ορίζουν τη λίστα ──────────────────────────────────────
export interface DossierProfile {
  form: LegalForm
  books: BookKeeping
  hasRenovation: boolean
  hasLoan: boolean
  ownershipChanged: boolean
}

export interface DossierState {
  profile: DossierProfile
  setProfile: (patch: Partial<DossierProfile>) => void
  /** Τα δικαιολογητικά που ο χρήστης δήλωσε ότι έχει ήδη. */
  have: string[]
  toggle: (id: string) => void
  loaded: boolean
  /** Μήνυμα αποτυχίας αποθήκευσης — δεν κρύβεται, αλλά δεν σταματά τη δουλειά. */
  error: string | null
}

const BOOKS_LABEL: Record<BookKeeping, string> = {
  none: 'Χωρίς βιβλία',
  single_entry: 'Απλογραφικά',
  double_entry: 'Διπλογραφικά',
}

const DEFAULTS: DossierProfile = { form: 'individual', books: 'none', hasRenovation: false, hasLoan: false, ownershipChanged: false }

/**
 * Η κατάσταση του φακέλου, μόνιμη ανά χρήστη και ΑΝΑ ΕΤΟΣ.
 *
 * Ζει σε hook και όχι μέσα στο component, γιατί την ίδια απάντηση («απλογραφικά
 * ή διπλογραφικά;») τη χρειάζεται και η καρτέλα Λογιστικής για να κρύψει τον
 * ισολογισμό από όποιον δεν τον έχει. Μία πηγή, δύο καταναλωτές.
 */
export function useAccountantDossier(userId: string, year: number, seed?: Partial<DossierProfile>): DossierState {
  const supabase = useMemo(() => createClient(), [])
  const [profile, setProfileState] = useState<DossierProfile>({ ...DEFAULTS, ...seed })
  const [have, setHave] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Το seed αλλάζει ταυτότητα σε κάθε render· κρατιέται σε ref ώστε να μην
  // ξαναφορτώνει ο φάκελος σε κάθε πληκτρολόγηση αλλού στην οθόνη.
  const seedRef = useRef(seed)
  useEffect(() => { seedRef.current = seed })

  // Γράφουμε ΜΟΝΟ μετά από πραγματική ενέργεια του χρήστη: η φόρτωση δεν πρέπει
  // να δημιουργεί γραμμή, αλλιώς κάθε άνοιγμα της καρτέλας θα «αποφάσιζε» για
  // λογαριασμό του χρήστη ότι είναι φυσικό πρόσωπο χωρίς βιβλία.
  const dirty = useRef(false)

  useEffect(() => {
    let alive = true
    dirty.current = false
    ;(async () => {
      setLoaded(false)
      const { data, error: err } = await supabase
        .from('accountant_dossier')
        .select('have_ids,legal_form,bookkeeping,has_renovation,has_loan,ownership_changed')
        .eq('user_id', userId).eq('year', year).maybeSingle()
      if (!alive) return
      if (data) {
        const row = data as Record<string, unknown>
        setProfileState({
          form: (row.legal_form as LegalForm) || 'individual',
          books: (row.bookkeeping as BookKeeping) || 'none',
          hasRenovation: !!row.has_renovation,
          hasLoan: !!row.has_loan,
          ownershipChanged: !!row.ownership_changed,
        })
        setHave(Array.isArray(row.have_ids) ? (row.have_ids as string[]) : [])
      } else {
        // Καμία γραμμή ακόμη: ξεκινάμε από ό,τι ξέρει ήδη η εφαρμογή (π.χ. έχει
        // δάνειο), χωρίς να γράψουμε τίποτα πριν αγγίξει ο χρήστης κάτι.
        setProfileState({ ...DEFAULTS, ...seedRef.current })
        setHave([])
        if (err) setError(err.message)
      }
      setLoaded(true)
    })()
    return () => { alive = false }
  }, [supabase, userId, year])

  const persist = useCallback(async (next: DossierProfile, nextHave: string[]) => {
    const { error: err } = await supabase.from('accountant_dossier').upsert({
      user_id: userId, year,
      have_ids: nextHave,
      legal_form: next.form, bookkeeping: next.books,
      has_renovation: next.hasRenovation, has_loan: next.hasLoan, ownership_changed: next.ownershipChanged,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,year' })
    setError(err ? (err.message || 'άγνωστο σφάλμα') : null)
  }, [supabase, userId, year])

  useEffect(() => {
    if (!loaded || !dirty.current) return
    void persist(profile, have)
  }, [loaded, profile, have, persist])

  const setProfile = useCallback((patch: Partial<DossierProfile>) => {
    dirty.current = true
    setProfileState(prev => {
      // Η αλλαγή νομικής μορφής παρασύρει τα βιβλία στην προεπιλογή της, εκτός
      // αν ο χρήστης δηλώνει ρητά βιβλία στην ίδια κίνηση.
      const next: DossierProfile = { ...prev, ...patch }
      if (patch.form && patch.books === undefined) next.books = defaultBookkeeping(patch.form)
      return next
    })
  }, [])

  const toggle = useCallback((id: string) => {
    dirty.current = true
    setHave(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }, [])

  return { profile, setProfile, have, toggle, loaded, error }
}

// ═══ Εικόνα ════════════════════════════════════════════════════════════════

const card: React.CSSProperties = { position: 'relative', background: 'var(--surface-raised)', border: 'none', borderRadius: 14, padding: 18, boxShadow: 'var(--elev-1)' }
const eyebrow: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontFamily: T.font.sans, margin: 0 }
const num: React.CSSProperties = { fontVariantNumeric: 'tabular-nums', fontFamily: T.font.sans }

/** Το τετραγωνάκι «το έχω». Μικρό, ήσυχο, με ένα μόνο χρώμα όταν είναι γεμάτο. */
function Mark({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={label} onClick={onChange}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, marginTop: 1, borderRadius: 6, flexShrink: 0, cursor: 'pointer', padding: 0,
        border: `1.5px solid ${checked ? 'var(--accent)' : 'var(--border-default)'}`, background: checked ? 'var(--accent)' : 'var(--bg-surface)', transition: 'border-color 0.14s, background 0.14s' }}>
      {checked && <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.3l2.2 2.2L9.5 3.6" stroke="var(--accent-text)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>}
    </button>
  )
}

/** Μία γραμμή καταλόγου: τι, γιατί, πού, και αν μπλοκάρει. */
function Row({ r, checked, onToggle, interactive }: { r: Requirement; checked: boolean; onToggle: () => void; interactive: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '11px 0', borderTop: '1px solid var(--border-subtle)' }}>
      {interactive
        ? <Mark checked={checked} onChange={onToggle} label={r.title} />
        : (
          <span title="Το ετοιμάζει το Property OS" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, marginTop: 1, borderRadius: 6, flexShrink: 0, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-tertiary)' }}>
            <CheckIcon size={11} />
          </span>
        )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, fontFamily: T.font.sans, lineHeight: 1.35, color: checked ? 'var(--text-secondary)' : 'var(--text-primary)' }}>{r.title}</span>
          {r.blocking && !checked && <Badge>Απαραίτητο</Badge>}
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '3px 0 0', lineHeight: 1.5, fontFamily: T.font.sans }}>{r.why}</p>
        {r.source && <p style={{ fontSize: 11.5, color: 'var(--text-tertiary)', margin: '3px 0 0', fontFamily: T.font.sans }}>Πού: {r.source}</p>}
      </div>
    </div>
  )
}

export interface DossierExportSource {
  propName: string
  ownerAfm?: string
  statementLines: AccountantStatementLine[]
  provisionMonthly: number
  book: AccountantMovement[]
  /** Κενά στα δεδομένα, γραμμένα από την καρτέλα (π.χ. «καμία δαπάνη για το 2026»). */
  gaps?: string[]
}

export default function AccountantDossier({
  state, year, properties, exportSource,
}: {
  state: DossierState
  year: number
  properties: readonly { name: string; status: PropertyStatus }[]
  exportSource: DossierExportSource
}) {
  const { profile, setProfile, have, toggle, error } = state
  const [assumptionsOpen, setAssumptionsOpen] = useState(false)
  const [downloaded, setDownloaded] = useState(false)

  const statuses = useMemo(() => properties.map(p => p.status), [properties])
  const reqs = useMemo(() => requirementsFor({
    form: profile.form, books: profile.books, statuses,
    hasRenovation: profile.hasRenovation, hasLoan: profile.hasLoan, ownershipChanged: profile.ownershipChanged,
  }), [profile, statuses])

  // Ό,τι φτιάχνει το εργαλείο μετριέται ως έτοιμο: ΕΙΝΑΙ έτοιμο, βγαίνει μέσα
  // στον φάκελο. Εκεί φεύγει το μισό άγχος, και είναι αλήθεια, όχι παρηγοριά.
  const appIds = useMemo(() => reqs.filter(r => r.who === 'app').map(r => r.id), [reqs])
  const haveAll = useMemo(() => [...new Set([...appIds, ...have])], [appIds, have])
  const ready = useMemo(() => readiness(reqs, haveAll), [reqs, haveAll])
  const groups = useMemo(() => groupByWho(reqs), [reqs])
  const warnings = useMemo(() => traps(reqs), [reqs])

  const perWho = (who: Who) => {
    const items = reqs.filter(r => r.who === who)
    return { total: items.length, done: items.filter(r => haveAll.includes(r.id)).length }
  }

  function download() {
    exportAccountantDossier({
      year,
      propName: exportSource.propName,
      ownerAfm: exportSource.ownerAfm,
      statementLines: exportSource.statementLines,
      provisionMonthly: exportSource.provisionMonthly,
      book: exportSource.book,
      requirements: reqs,
      haveIds: haveAll,
      readinessMessage: ready.message,
      properties: properties.map(p => ({ name: p.name, status: statusForAccountant(p.status) })),
      formLabel: LEGAL_FORM_LABEL[profile.form],
      booksLabel: BOOKS_LABEL[profile.books],
      gaps: exportSource.gaps,
    })
    setDownloaded(true)
    setTimeout(() => setDownloaded(false), 2600)
  }

  const pct = ready.total > 0 ? Math.round((ready.done / ready.total) * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── Ο αριθμός που ηρεμεί ─────────────────────────────────────────── */}
      <div style={{ ...card, padding: '20px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <p style={eyebrow}>Τι πάει στον λογιστή · {year}</p>
            <p style={{ fontSize: 19, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans, letterSpacing: '-0.01em', lineHeight: 1.45, margin: '10px 0 0' }}>
              {ready.message}
            </p>
          </div>
          <button onClick={download} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: T.h.md, padding: '0 17px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: T.font.sans, flexShrink: 0 }}>
            <Download size={14} />{downloaded ? 'Κατέβηκε' : 'Κατέβασε τον φάκελο'}
          </button>
        </div>

        {/* Πρόοδος: μία λεπτή γραμμή, χωρίς ποσοστά σε μεγάλα γράμματα. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0 0' }}>
          <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: 'var(--accent)', transition: 'width 0.3s' }} />
          </div>
          <span style={{ ...num, fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>{ready.done} / {ready.total}</span>
        </div>

        {/* Ποιος κάνει τι, σε τρεις αριθμούς. Η ουσία όλης της οθόνης. */}
        <div style={{ display: 'flex', gap: 26, margin: '16px 0 0', paddingTop: 14, borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
          {(['owner', 'app', 'accountant'] as Who[]).map(w => {
            const c = perWho(w)
            if (c.total === 0) return null
            return (
              <div key={w}>
                <p style={{ ...eyebrow, fontSize: 9.5 }}>{WHO_LABEL[w]}</p>
                <p style={{ ...num, fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', margin: '5px 0 0', lineHeight: 1 }}>
                  {c.done}<span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-tertiary)' }}> / {c.total}</span>
                </p>
              </div>
            )
          })}
        </div>

        {/* Τι θα βρει μέσα, πριν το κατεβάσει. Η αρίθμηση είναι η υπόσχεση: ο
            λογιστής ανοίγει και ξέρει πού είναι το καθετί. */}
        <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '14px 0 0', fontFamily: T.font.sans, lineHeight: 1.6 }}>
          Ο φάκελος περιέχει 01_ΣΥΝΟΨΗ · 02_ΕΣΟΔΑ · 03_ΕΞΟΔΑ · 04_ΔΙΚΑΙΟΛΟΓΗΤΙΚΑ και ένα 05_ΤΙ_ΛΕΙΠΕΙ που λέει ρητά τι δεν βρέθηκε.
        </p>

        {error && (
          <p style={{ fontSize: 11.5, color: 'var(--negative)', margin: '12px 0 0', fontFamily: T.font.sans, lineHeight: 1.5 }}>
            Οι σημειώσεις δεν αποθηκεύτηκαν: {error}. Θα χαθούν αν κλείσεις τη σελίδα — έλεγξε ότι έχει εφαρμοστεί το migration accountant_dossier.
          </p>
        )}
      </div>

      {/* ── Οι ομάδες: πρώτα τα δικά σου ──────────────────────────────────── */}
      {groups.map(g => {
        const interactive = g.who !== 'app'
        const done = g.items.filter(r => haveAll.includes(r.id)).length
        return (
          <div key={g.who} style={card}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, paddingBottom: 4 }}>
              <div style={{ minWidth: 0 }}>
                <p style={eyebrow}>{g.label}</p>
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '5px 0 0', fontFamily: T.font.sans, lineHeight: 1.5 }}>
                  {g.who === 'owner' ? 'Τα μόνα που ζητούν ενέργεια από εσένα. Σημείωσε ό,τι έχεις ήδη βρει.'
                    : g.who === 'app' ? 'Βγαίνουν από τα δεδομένα σου και μπαίνουν μέσα στον φάκελο.'
                      : 'Τα ετοιμάζει ο λογιστής από όσα του δίνεις. Σημείωσε ό,τι έχει ήδη γίνει.'}
                </p>
              </div>
              <span style={{ ...num, fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, flexShrink: 0 }}>{done} / {g.items.length}</span>
            </div>
            <div style={{ marginTop: 10 }}>
              {g.items.map(r => (
                <Row key={r.id} r={r} checked={haveAll.includes(r.id)} interactive={interactive} onToggle={() => toggle(r.id)} />
              ))}
            </div>
          </div>
        )
      })}

      {/* ── Παγίδες: συμβουλή, όχι κατηγορία ──────────────────────────────── */}
      {warnings.length > 0 && (
        <div style={card}>
          <p style={eyebrow}>Πριν το στείλεις</p>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '5px 0 14px', fontFamily: T.font.sans, lineHeight: 1.5 }}>
            {warnings.length === 1 ? 'Ένα σημείο που κοστίζει, όταν πάει στραβά.' : `${warnings.length} σημεία που κοστίζουν, όταν πάνε στραβά.`}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 12, alignItems: 'start' }}>
            {warnings.map(t => (
              <div key={t.title} style={{ paddingLeft: 12, borderLeft: '2px solid var(--border-default)' }}>
                <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', margin: 0, fontFamily: T.font.sans, lineHeight: 1.4 }}>{t.title}</p>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0', fontFamily: T.font.sans, lineHeight: 1.55 }}>{t.trap}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Οι παραδοχές: κλειστές, γιατί σπάνια αλλάζουν ─────────────────── */}
      <div style={card}>
        <button onClick={() => setAssumptionsOpen(o => !o)} aria-expanded={assumptionsOpen} className="acc-toggle"
          style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
          <ChevronRight size={16} style={{ color: 'var(--text-tertiary)', flexShrink: 0, transform: assumptionsOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.18s' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={eyebrow}>Από τι βγαίνει αυτή η λίστα</p>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '4px 0 0', fontFamily: T.font.sans }}>
              {LEGAL_FORM_LABEL[profile.form]} · {BOOKS_LABEL[profile.books]}
              {properties.length > 0 && ` · ${properties.length === 1 ? '1 ακίνητο' : `${properties.length} ακίνητα`}`}
            </p>
          </div>
        </button>

        {assumptionsOpen && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px', fontFamily: T.font.sans }}>Νομική μορφή</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(Object.keys(LEGAL_FORM_LABEL) as LegalForm[]).map(f => (
                  <button key={f} onClick={() => setProfile({ form: f })}
                    style={{ height: T.h.sm, padding: '0 13px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontFamily: T.font.sans, transition: 'all 0.15s',
                      fontWeight: profile.form === f ? 600 : 500,
                      border: `1px solid ${profile.form === f ? 'var(--accent)' : 'var(--border-subtle)'}`,
                      background: profile.form === f ? 'var(--accent)' : 'var(--bg-surface)',
                      color: profile.form === f ? 'var(--accent-text)' : 'var(--text-secondary)' }}>{LEGAL_FORM_LABEL[f]}</button>
                ))}
              </div>
            </div>

            {/* Τα βιβλία υπάρχουν μόνο όπου υπάρχουν. Ο ιδιώτης δεν βλέπει τη λέξη. */}
            {profile.form !== 'individual' && (
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px', fontFamily: T.font.sans }}>Βιβλία</p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(['single_entry', 'double_entry'] as BookKeeping[]).map(b => (
                    <button key={b} onClick={() => setProfile({ books: b })}
                      style={{ height: T.h.sm, padding: '0 13px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontFamily: T.font.sans, transition: 'all 0.15s',
                        fontWeight: profile.books === b ? 600 : 500,
                        border: `1px solid ${profile.books === b ? 'var(--accent)' : 'var(--border-subtle)'}`,
                        background: profile.books === b ? 'var(--accent)' : 'var(--bg-surface)',
                        color: profile.books === b ? 'var(--accent-text)' : 'var(--text-secondary)' }}>{BOOKS_LABEL[b]}</button>
                  ))}
                </div>
                <p style={{ fontSize: 11.5, color: 'var(--text-tertiary)', margin: '8px 0 0', fontFamily: T.font.sans, lineHeight: 1.5 }}>
                  Ο ισολογισμός και το προσάρτημα υπάρχουν μόνο στα διπλογραφικά. Οι ΟΕ/ΕΕ περνούν σε διπλογραφικά πάνω από όριο τζίρου.
                </p>
              </div>
            )}

            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px', fontFamily: T.font.sans }}>Μέσα στο {year}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {([
                  ['hasRenovation', 'Έγιναν εργασίες ανακαίνισης ή βελτίωσης', 'Προσθέτει τα τιμολόγια και τις άδειες που ζητά ο λογιστής.'],
                  ['hasLoan', 'Υπάρχει δάνειο για το ακίνητο', 'Χρειάζεται η ετήσια βεβαίωση τόκων από την τράπεζα.'],
                  ['ownershipChanged', 'Άλλαξε κάτι στην ιδιοκτησία (αγορά, πώληση, κληρονομιά)', 'Τότε και μόνο τότε υποβάλλεται Ε9.'],
                ] as [keyof DossierProfile, string, string][]).map(([key, label, hint]) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
                    <Mark checked={!!profile[key]} onChange={() => setProfile({ [key]: !profile[key] } as Partial<DossierProfile>)} label={label} />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 12.5, color: 'var(--text-primary)', margin: 0, fontFamily: T.font.sans, lineHeight: 1.4 }}>{label}</p>
                      <p style={{ fontSize: 11.5, color: 'var(--text-tertiary)', margin: '2px 0 0', fontFamily: T.font.sans, lineHeight: 1.45 }}>{hint}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {properties.length > 0 && (
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px', fontFamily: T.font.sans }}>Τα ακίνητά σου</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {properties.map((p, i) => (
                    <div key={`${p.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, fontFamily: T.font.sans }}>
                      <span style={{ flex: 1, minWidth: 0, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                      <span style={{ color: 'var(--text-tertiary)' }}>{statusForAccountant(p.status)}</span>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 11.5, color: 'var(--text-tertiary)', margin: '8px 0 0', fontFamily: T.font.sans, lineHeight: 1.5 }}>
                  Η κατάσταση κάθε ακινήτου ορίζει τι ζητά ο λογιστής. Αλλάζει από την Επισκόπηση του ακινήτου.
                </p>
              </div>
            )}

            <p style={{ ...TT.caption, margin: 0, lineHeight: 1.55 }}>
              Ο κατάλογος λέει ποια παραστατικά χρειάζονται και ποιος τα φέρνει. Δεν υποκαθιστά τη φορολογική συμβουλή του λογιστή σου.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
