'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  CustomSelect,
  NumberInput,
  TextInput,
  DatePicker,
  Toggle,
  Textarea,
} from './UIComponents'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ─── Types ────────────────────────────────────────────────────────────────────

interface InventoryItem {
  id: string
  property_id: string
  user_id: string
  name: string
  category: string
  room: string
  brand: string
  model: string
  serial_number: string
  purchase_value: number
  current_value: number
  purchase_date: string
  warranty_expiry: string
  condition: string
  notes: string
  photo_url: string
  created_at: string
  updated_at: string
}

interface InventoryRepair {
  id: string
  item_id: string
  user_id: string
  repair_date: string
  cost: number
  technician: string
  description: string
}

interface InventoryHandover {
  id: string
  property_id: string
  handover_type: 'check_in' | 'check_out'
  tenant_name: string
  tenant_phone: string
  handover_date: string
  notes: string
  items_snapshot: HandoverItemSnapshot[]
  created_at: string
}

interface HandoverItemSnapshot {
  item_id: string
  name: string
  category: string
  condition_at_handover: string
  condition_notes: string
  photo_url: string
}

interface TabInventoryProps {
  propertyId: string
  userId: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  'Έπιπλα',
  'Ηλεκτρικές Συσκευές',
  'Ηλεκτρονικά',
  'Υδραυλικά',
  'Θέρμανση & Ψύξη',
  'Φωτιστικά',
  'Διακόσμηση',
  'Λοιπά',
]

const ROOMS = [
  'Σαλόνι',
  'Κουζίνα',
  'Κύριο Υπνοδωμάτιο',
  'Υπνοδωμάτιο 2',
  'Υπνοδωμάτιο 3',
  'Μπάνιο',
  'WC',
  'Χολ / Διάδρομος',
  'Μπαλκόνι',
  'Αποθήκη',
  'Γκαράζ',
  'Άλλο',
]

const CONDITIONS = ['Άριστη', 'Καλή', 'Μέτρια', 'Κακή', 'Εκτός Λειτουργίας']

const CONDITION_COLOR: Record<string, string> = {
  'Άριστη': 'var(--positive)',
  'Καλή': '#60a5fa',
  'Μέτρια': 'var(--warning)',
  'Κακή': 'var(--negative)',
  'Εκτός Λειτουργίας': 'var(--text-tertiary)',
}

const CATEGORY_ICONS: Record<string, string> = {
  'Έπιπλα': '🛋️',
  'Ηλεκτρικές Συσκευές': '🔌',
  'Ηλεκτρονικά': '💻',
  'Υδραυλικά': '🚿',
  'Θέρμανση & Ψύξη': '❄️',
  'Φωτιστικά': '💡',
  'Διακόσμηση': '🖼️',
  'Λοιπά': '📦',
}

// Depreciation years per category
const DEPRECIATION_YEARS: Record<string, number> = {
  'Έπιπλα': 10,
  'Ηλεκτρικές Συσκευές': 6,
  'Ηλεκτρονικά': 3,
  'Υδραυλικά': 15,
  'Θέρμανση & Ψύξη': 12,
  'Φωτιστικά': 8,
  'Διακόσμηση': 20,
  'Λοιπά': 8,
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function calcCurrentValue(item: InventoryItem): number {
  if (!item.purchase_value || !item.purchase_date) return item.purchase_value || 0
  const years = (Date.now() - new Date(item.purchase_date).getTime()) / (1000 * 60 * 60 * 24 * 365)
  const lifespan = DEPRECIATION_YEARS[item.category] || 8
  const ratio = Math.max(0, 1 - years / lifespan)
  return Math.round(item.purchase_value * ratio)
}

function formatEuro(n: number): string {
  return new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

function formatDate(d: string): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('el-GR')
}

function daysUntil(d: string): number {
  if (!d) return Infinity
  return Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

function warrantyStatus(expiry: string): { label: string; color: string } {
  if (!expiry) return { label: 'Χωρίς εγγύηση', color: 'var(--text-tertiary)' }
  const days = daysUntil(expiry)
  if (days < 0) return { label: 'Έληξε', color: 'var(--negative)' }
  if (days <= 30) return { label: `Λήγει σε ${days} μέρες`, color: 'var(--negative)' }
  if (days <= 90) return { label: `Λήγει σε ${days} μέρες`, color: 'var(--warning)' }
  return { label: `Ισχύει (${formatDate(expiry)})`, color: 'var(--positive)' }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const dot = (label: string, right?: React.ReactNode) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
      <p style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600 }}>{label}</p>
    </div>
    {right}
  </div>
)

function KPI({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '12px 14px' }}>
      <p style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6, fontWeight: 600 }}>{label}</p>
      <p style={{ fontSize: 16, fontFamily: 'JetBrains Mono, monospace', color: color || 'var(--text-primary)', fontWeight: 700 }}>{value}</p>
      {sub && <p style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 3 }}>{sub}</p>}
    </div>
  )
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 6,
      fontSize: 10,
      fontWeight: 700,
      color,
      background: color + '18',
      border: `1px solid ${color}30`,
      letterSpacing: '0.04em',
    }}>{label}</span>
  )
}

// ─── Photo Upload Component ────────────────────────────────────────────────────

function PhotoUpload({
  currentUrl,
  itemId,
  onUploaded,
}: {
  currentUrl: string
  itemId?: string
  onUploaded: (url: string) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState(currentUrl || '')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    if (!file) return
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { data, error } = await supabase.storage
      .from('inventory-photos')
      .upload(path, file, { upsert: true })
    if (error) {
      alert('Σφάλμα ανεβάσματος φωτογραφίας: ' + error.message)
      setUploading(false)
      return
    }
    const { data: urlData } = supabase.storage.from('inventory-photos').getPublicUrl(path)
    setPreview(urlData.publicUrl)
    onUploaded(urlData.publicUrl)
    setUploading(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        onClick={() => inputRef.current?.click()}
        style={{
          width: '100%',
          height: 120,
          borderRadius: 10,
          border: `1.5px dashed var(--border-accent)`,
          background: preview ? 'transparent' : 'var(--accent-dim)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: uploading ? 'wait' : 'pointer',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {preview ? (
          <img src={preview} alt="Φωτογραφία αντικειμένου" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 22, marginBottom: 4 }}>📷</p>
            <p style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {uploading ? 'Ανεβάζεται...' : 'Κλικ για φωτογραφία'}
            </p>
          </div>
        )}
        {preview && !uploading && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'rgba(0,0,0,0.55)', padding: '4px 8px',
            fontSize: 10, color: '#fff', textAlign: 'center',
          }}>
            Κλικ για αλλαγή
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
        }}
      />
    </div>
  )
}

// ─── Item Form Modal ───────────────────────────────────────────────────────────

const EMPTY_ITEM: Partial<InventoryItem> = {
  name: '',
  category: 'Έπιπλα',
  room: 'Σαλόνι',
  brand: '',
  model: '',
  serial_number: '',
  purchase_value: 0,
  purchase_date: '',
  warranty_expiry: '',
  condition: 'Καλή',
  notes: '',
  photo_url: '',
}

function ItemFormModal({
  item,
  onSave,
  onClose,
}: {
  item?: InventoryItem | null
  onSave: (data: Partial<InventoryItem>) => void
  onClose: () => void
}) {
  const [form, setForm] = useState<Partial<InventoryItem>>(item || EMPTY_ITEM)
  const [saving, setSaving] = useState(false)

  const set = (k: keyof InventoryItem, v: any) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.name?.trim()) { alert('Το όνομα αντικειμένου είναι υποχρεωτικό.'); return }
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 16,
        width: '100%', maxWidth: 620,
        maxHeight: '90vh',
        overflowY: 'auto',
        padding: 24,
        display: 'flex', flexDirection: 'column', gap: 20,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
            {item ? 'Επεξεργασία Αντικειμένου' : 'Νέο Αντικείμενο'}
          </p>
          <button onClick={onClose} style={{
            background: 'none', border: '1px solid var(--border-subtle)',
            borderRadius: 8, padding: '4px 10px', cursor: 'pointer',
            color: 'var(--text-secondary)', fontSize: 12,
          }}>Κλείσιμο</button>
        </div>

        {/* Photo */}
        {dot('Φωτογραφία')}
        <PhotoUpload
          currentUrl={form.photo_url || ''}
          onUploaded={url => set('photo_url', url)}
        />

        {/* Basic Info */}
        {dot('Βασικά Στοιχεία')}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <p style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6, fontWeight: 600 }}>Ονομασία *</p>
            <TextInput
              value={form.name || ''}
              onChange={v => set('name', v)}
              placeholder="π.χ. Πλυντήριο Ρούχων"
            />
          </div>
          <div>
            <p style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6, fontWeight: 600 }}>Κατηγορία</p>
            <CustomSelect
              value={form.category || 'Έπιπλα'}
              onChange={v => set('category', v)}
              options={CATEGORIES.map(c => ({ value: c, label: `${CATEGORY_ICONS[c]} ${c}` }))}
            />
          </div>
          <div>
            <p style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6, fontWeight: 600 }}>Χώρος / Δωμάτιο</p>
            <CustomSelect
              value={form.room || 'Σαλόνι'}
              onChange={v => set('room', v)}
              options={ROOMS.map(r => ({ value: r, label: r }))}
            />
          </div>
          <div>
            <p style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6, fontWeight: 600 }}>Μάρκα</p>
            <TextInput value={form.brand || ''} onChange={v => set('brand', v)} placeholder="π.χ. Bosch" />
          </div>
          <div>
            <p style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6, fontWeight: 600 }}>Μοντέλο</p>
            <TextInput value={form.model || ''} onChange={v => set('model', v)} placeholder="π.χ. Serie 6 WGB256A0GR" />
          </div>
          <div>
            <p style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6, fontWeight: 600 }}>Σειριακός Αριθμός</p>
            <TextInput value={form.serial_number || ''} onChange={v => set('serial_number', v)} placeholder="SN / IMEI" />
          </div>
          <div>
            <p style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6, fontWeight: 600 }}>Κατάσταση</p>
            <CustomSelect
              value={form.condition || 'Καλή'}
              onChange={v => set('condition', v)}
              options={CONDITIONS.map(c => ({ value: c, label: c }))}
            />
          </div>
        </div>

        {/* Financial */}
        {dot('Οικονομικά Στοιχεία')}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <p style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6, fontWeight: 600 }}>Αξία Αγοράς (€)</p>
            <NumberInput
              value={String(form.purchase_value || 0)}
              onChange={v => set('purchase_value', v)}
              suffix="€"
              min={0}
            />
          </div>
          <div>
            <p style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6, fontWeight: 600 }}>Ημερομηνία Αγοράς</p>
            <DatePicker value={form.purchase_date || ''} onChange={v => set('purchase_date', v)} />
          </div>
          <div>
            <p style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6, fontWeight: 600 }}>Λήξη Εγγύησης</p>
            <DatePicker value={form.warranty_expiry || ''} onChange={v => set('warranty_expiry', v)} />
          </div>
        </div>

        {/* Notes */}
        {dot('Σημειώσεις')}
        <Textarea
          value={form.notes || ''}
          onChange={v => set('notes', v)}
          placeholder="Πρόσθετες πληροφορίες, παρατηρήσεις κατάστασης..."
          rows={3}
        />

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '9px 18px', borderRadius: 10, border: '1px solid var(--border-subtle)',
            background: 'none', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer',
          }}>Ακύρωση</button>
          <button onClick={handleSave} disabled={saving} style={{
            padding: '9px 20px', borderRadius: 10,
            background: saving ? 'var(--border-subtle)' : 'var(--accent)',
            border: 'none', color: 'var(--bg-base)', fontSize: 12, fontWeight: 700, cursor: saving ? 'wait' : 'pointer',
          }}>{saving ? 'Αποθήκευση...' : 'Αποθήκευση'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Repair Modal ─────────────────────────────────────────────────────────────

function RepairModal({
  item,
  repairs,
  onAdd,
  onClose,
}: {
  item: InventoryItem
  repairs: InventoryRepair[]
  onAdd: (r: Partial<InventoryRepair>) => void
  onClose: () => void
}) {
  const [form, setForm] = useState({ repair_date: '', cost: 0, technician: '', description: '' })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  const handleAdd = async () => {
    if (!form.description.trim()) { alert('Η περιγραφή επισκευής είναι υποχρεωτική.'); return }
    setSaving(true)
    await onAdd(form)
    setForm({ repair_date: '', cost: 0, technician: '', description: '' })
    setSaving(false)
  }

  const itemRepairs = repairs.filter(r => r.item_id === item.id)
  const totalCost = itemRepairs.reduce((s, r) => s + (r.cost || 0), 0)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '85vh', overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Ιστορικό Επισκευών — {item.name}</p>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 12 }}>Κλείσιμο</button>
        </div>

        {itemRepairs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dot('Προηγούμενες Επισκευές', <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--negative)' }}>Σύνολο: {formatEuro(totalCost)}</span>)}
            {itemRepairs.map(r => (
              <div key={r.id} style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{r.description}</p>
                  <p style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: 'var(--negative)' }}>{formatEuro(r.cost)}</p>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{formatDate(r.repair_date)}{r.technician ? ` · ${r.technician}` : ''}</p>
              </div>
            ))}
          </div>
        )}

        {dot('Νέα Επισκευή')}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <p style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6, fontWeight: 600 }}>Ημερομηνία</p>
            <DatePicker value={form.repair_date} onChange={v => set('repair_date', v)} />
          </div>
          <div>
            <p style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6, fontWeight: 600 }}>Κόστος (€)</p>
            <NumberInput value={String(form.cost)} onChange={v => set('cost', v)} suffix="€" min={0} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <p style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6, fontWeight: 600 }}>Τεχνικός / Συνεργείο</p>
            <TextInput value={form.technician} onChange={v => set('technician', v)} placeholder="π.χ. Ηλεκτρολόγος Παπαδόπουλος" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <p style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6, fontWeight: 600 }}>Περιγραφή *</p>
            <Textarea value={form.description} onChange={v => set('description', v)} placeholder="Τι επισκευάστηκε..." rows={2} />
          </div>
        </div>
        <button onClick={handleAdd} disabled={saving} style={{ padding: '9px 20px', borderRadius: 10, background: saving ? 'var(--border-subtle)' : 'var(--accent)', border: 'none', color: 'var(--bg-base)', fontSize: 12, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', alignSelf: 'flex-end' }}>
          {saving ? 'Αποθήκευση...' : 'Καταχώρηση Επισκευής'}
        </button>
      </div>
    </div>
  )
}

// ─── Overview Sub-tab ─────────────────────────────────────────────────────────

function OverviewTab({ items }: { items: InventoryItem[] }) {
  const totalPurchase = items.reduce((s, i) => s + (i.purchase_value || 0), 0)
  const totalCurrent = items.reduce((s, i) => s + calcCurrentValue(i), 0)
  const depreciation = totalPurchase - totalCurrent
  const insurableValue = Math.round(totalCurrent * 1.1)

  const byCategory = CATEGORIES.map(cat => {
    const catItems = items.filter(i => i.category === cat)
    const val = catItems.reduce((s, i) => s + calcCurrentValue(i), 0)
    return { cat, count: catItems.length, val }
  }).filter(x => x.count > 0)

  const warrantyExpiring = items.filter(i => {
    const d = daysUntil(i.warranty_expiry)
    return d >= 0 && d <= 90
  }).sort((a, b) => daysUntil(a.warranty_expiry) - daysUntil(b.warranty_expiry))

  const needsAttention = items.filter(i => i.condition === 'Κακή' || i.condition === 'Εκτός Λειτουργίας')

  const maxVal = Math.max(...byCategory.map(x => x.val), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <KPI label="Συνολικά Αντικείμενα" value={String(items.length)} sub={`${CATEGORIES.filter(c => items.some(i => i.category === c)).length} κατηγορίες`} />
        <KPI label="Αξία Αγοράς" value={formatEuro(totalPurchase)} color="var(--text-primary)" />
        <KPI label="Τρέχουσα Αξία" value={formatEuro(totalCurrent)} color="var(--positive)" sub="Μετά απόσβεση" />
        <KPI label="Ασφαλιστέα Αξία" value={formatEuro(insurableValue)} color="var(--info)" sub="+10% buffer" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* By category chart */}
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 16 }}>
          {dot('Κατανομή Αξίας ανά Κατηγορία')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {byCategory.sort((a, b) => b.val - a.val).map(({ cat, count, val }) => (
              <div key={cat}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{CATEGORY_ICONS[cat]} {cat} <span style={{ color: 'var(--text-tertiary)' }}>({count})</span></span>
                  <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-primary)' }}>{formatEuro(val)}</span>
                </div>
                <div style={{ height: 4, background: 'var(--border-subtle)', borderRadius: 2 }}>
                  <div style={{ height: 4, borderRadius: 2, background: 'var(--accent)', width: `${(val / maxVal) * 100}%`, transition: 'width 0.5s ease' }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Απόσβεση</span>
            <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--negative)' }}>-{formatEuro(depreciation)}</span>
          </div>
        </div>

        {/* Alerts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Warranty expiring */}
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 16, flex: warrantyExpiring.length > 0 ? '1' : 'none' }}>
            {dot('Εγγυήσεις που Λήγουν Σύντομα')}
            {warrantyExpiring.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', padding: '12px 0' }}>Καμία εγγύηση δεν λήγει τους επόμενους 3 μήνες</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {warrantyExpiring.slice(0, 4).map(item => {
                  const ws = warrantyStatus(item.warranty_expiry)
                  return (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'var(--bg-surface)', borderRadius: 8 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-primary)' }}>{item.name}</span>
                      <Badge label={ws.label} color={ws.color} />
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Needs attention */}
          {needsAttention.length > 0 && (
            <div style={{ background: 'var(--bg-elevated)', border: `1px solid var(--negative)30`, borderRadius: 12, padding: 16 }}>
              {dot('Χρειάζονται Προσοχή', <Badge label={`${needsAttention.length} αντικείμενα`} color="var(--negative)" />)}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {needsAttention.map(item => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'var(--bg-surface)', borderRadius: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-primary)' }}>{item.name}</span>
                    <Badge label={item.condition} color={CONDITION_COLOR[item.condition]} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Items Sub-tab ────────────────────────────────────────────────────────────

function ItemsTab({
  items,
  repairs,
  onAdd,
  onEdit,
  onDelete,
  onAddRepair,
}: {
  items: InventoryItem[]
  repairs: InventoryRepair[]
  onAdd: () => void
  onEdit: (item: InventoryItem) => void
  onDelete: (id: string) => void
  onAddRepair: (item: InventoryItem) => void
}) {
  const [filterCat, setFilterCat] = useState('Όλες')
  const [filterRoom, setFilterRoom] = useState('Όλα')
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  const filtered = items.filter(item => {
    const matchCat = filterCat === 'Όλες' || item.category === filterCat
    const matchRoom = filterRoom === 'Όλα' || item.room === filterRoom
    const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase()) || item.brand.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchRoom && matchSearch
  })

  const usedCategories = ['Όλες', ...CATEGORIES.filter(c => items.some(i => i.category === c))]
  const usedRooms = ['Όλα', ...ROOMS.filter(r => items.some(i => i.room === r))]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <TextInput value={search} onChange={setSearch} placeholder="Αναζήτηση αντικειμένου, μάρκας..." />
        </div>
        <div style={{ width: 160 }}>
          <CustomSelect
            value={filterCat}
            onChange={setFilterCat}
            options={usedCategories.map(c => ({ value: c, label: c === 'Όλες' ? 'Όλες οι Κατηγορίες' : `${CATEGORY_ICONS[c]} ${c}` }))}
          />
        </div>
        <div style={{ width: 160 }}>
          <CustomSelect
            value={filterRoom}
            onChange={setFilterRoom}
            options={usedRooms.map(r => ({ value: r, label: r === 'Όλα' ? 'Όλα τα Δωμάτια' : r }))}
          />
        </div>
        {/* View toggle */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['grid', 'list'] as const).map(m => (
            <button key={m} onClick={() => setViewMode(m)} style={{
              padding: '7px 12px', borderRadius: 8, fontSize: 11, cursor: 'pointer', fontWeight: 600,
              border: `1px solid ${viewMode === m ? 'var(--accent)' : 'var(--border-subtle)'}`,
              background: viewMode === m ? 'var(--accent)' : 'var(--bg-elevated)',
              color: viewMode === m ? 'var(--bg-base)' : 'var(--text-secondary)',
            }}>
              {m === 'grid' ? '⊞ Πλέγμα' : '☰ Λίστα'}
            </button>
          ))}
        </div>
        <button onClick={onAdd} style={{
          padding: '8px 16px', borderRadius: 10, background: 'var(--accent)', border: 'none',
          color: 'var(--bg-base)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
        }}>+ Νέο Αντικείμενο</button>
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-tertiary)' }}>
          <p style={{ fontSize: 28, marginBottom: 8 }}>📦</p>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
            {items.length === 0 ? 'Δεν έχετε καταχωρήσει αντικείμενα' : 'Δεν βρέθηκαν αποτελέσματα'}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            {items.length === 0 ? 'Προσθέστε έπιπλα, συσκευές και εξοπλισμό του ακινήτου' : 'Δοκιμάστε διαφορετικά φίλτρα'}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {filtered.map(item => {
            const curVal = calcCurrentValue(item)
            const ws = warrantyStatus(item.warranty_expiry)
            const itemRepairCost = repairs.filter(r => r.item_id === item.id).reduce((s, r) => s + (r.cost || 0), 0)
            return (
              <div key={item.id} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden' }}>
                {/* Photo */}
                <div style={{ height: 140, background: 'var(--bg-surface)', position: 'relative', overflow: 'hidden' }}>
                  {item.photo_url ? (
                    <img src={item.photo_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 32 }}>
                      {CATEGORY_ICONS[item.category]}
                    </div>
                  )}
                  <div style={{ position: 'absolute', top: 8, right: 8 }}>
                    <Badge label={item.condition} color={CONDITION_COLOR[item.condition]} />
                  </div>
                </div>
                {/* Content */}
                <div style={{ padding: '12px 14px' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>{item.name}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10 }}>
                    {CATEGORY_ICONS[item.category]} {item.category}{item.room ? ` · ${item.room}` : ''}{item.brand ? ` · ${item.brand}` : ''}
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Τρέχουσα Αξία</span>
                    <span style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: 'var(--positive)' }}>{formatEuro(curVal)}</span>
                  </div>
                  {item.warranty_expiry && (
                    <div style={{ fontSize: 10, color: ws.color, marginBottom: 8 }}>⏱ {ws.label}</div>
                  )}
                  {itemRepairCost > 0 && (
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 8 }}>🔧 Επισκευές: {formatEuro(itemRepairCost)}</div>
                  )}
                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
                    <button onClick={() => onEdit(item)} style={{ flex: 1, padding: '6px 0', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'none', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer' }}>Επεξεργασία</button>
                    <button onClick={() => onAddRepair(item)} style={{ flex: 1, padding: '6px 0', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'none', color: 'var(--warning)', fontSize: 11, cursor: 'pointer' }}>🔧 Επισκευή</button>
                    <button onClick={() => { if (confirm(`Διαγραφή "${item.name}";`)) onDelete(item.id) }} style={{ padding: '6px 8px', borderRadius: 7, border: '1px solid var(--negative)30', background: 'none', color: 'var(--negative)', fontSize: 11, cursor: 'pointer' }}>✕</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* List view */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 100px', gap: 10, padding: '6px 14px' }}>
            {['Αντικείμενο', 'Κατηγορία', 'Κατάσταση', 'Αξία Αγοράς', 'Τρέχουσα Αξία', ''].map(h => (
              <p key={h} style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>{h}</p>
            ))}
          </div>
          {filtered.map(item => {
            const curVal = calcCurrentValue(item)
            return (
              <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 100px', gap: 10, padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border-subtle)', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{item.name}</p>
                  <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{item.brand}{item.model ? ` · ${item.model}` : ''}{item.room ? ` · ${item.room}` : ''}</p>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{CATEGORY_ICONS[item.category]} {item.category}</p>
                <Badge label={item.condition} color={CONDITION_COLOR[item.condition]} />
                <p style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-secondary)' }}>{item.purchase_value ? formatEuro(item.purchase_value) : '—'}</p>
                <p style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: 'var(--positive)', fontWeight: 700 }}>{formatEuro(curVal)}</p>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => onEdit(item)} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'none', color: 'var(--text-secondary)', fontSize: 10, cursor: 'pointer' }}>✎</button>
                  <button onClick={() => onAddRepair(item)} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'none', color: 'var(--warning)', fontSize: 10, cursor: 'pointer' }}>🔧</button>
                  <button onClick={() => { if (confirm(`Διαγραφή "${item.name}";`)) onDelete(item.id) }} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--negative)30', background: 'none', color: 'var(--negative)', fontSize: 10, cursor: 'pointer' }}>✕</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Warranties Sub-tab ───────────────────────────────────────────────────────

function WarrantiesTab({ items }: { items: InventoryItem[] }) {
  const withWarranty = items.filter(i => i.warranty_expiry).sort((a, b) => new Date(a.warranty_expiry).getTime() - new Date(b.warranty_expiry).getTime())
  const expired = withWarranty.filter(i => daysUntil(i.warranty_expiry) < 0)
  const expiringSoon = withWarranty.filter(i => { const d = daysUntil(i.warranty_expiry); return d >= 0 && d <= 90 })
  const valid = withWarranty.filter(i => daysUntil(i.warranty_expiry) > 90)

  const Section = ({ title, color, list }: { title: string; color: string; list: InventoryItem[] }) => (
    list.length > 0 ? (
      <div style={{ background: 'var(--bg-elevated)', border: `1px solid ${color}25`, borderRadius: 12, padding: 16 }}>
        {dot(title, <Badge label={`${list.length}`} color={color} />)}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {list.map(item => {
            const ws = warrantyStatus(item.warranty_expiry)
            return (
              <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 12, alignItems: 'center', padding: '8px 12px', background: 'var(--bg-surface)', borderRadius: 8 }}>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{item.name}</p>
                  <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{item.brand}{item.model ? ` · ${item.model}` : ''} · {CATEGORY_ICONS[item.category]} {item.category}</p>
                </div>
                {item.serial_number && (
                  <p style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-tertiary)' }}>SN: {item.serial_number}</p>
                )}
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Αγορά: {formatDate(item.purchase_date)}</p>
                <Badge label={ws.label} color={ws.color} />
              </div>
            )
          })}
        </div>
      </div>
    ) : null
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <KPI label="Ληγμένες Εγγυήσεις" value={String(expired.length)} color="var(--negative)" />
        <KPI label="Λήγουν ≤90 Μέρες" value={String(expiringSoon.length)} color="var(--warning)" />
        <KPI label="Σε Ισχύ" value={String(valid.length)} color="var(--positive)" />
      </div>
      <Section title="Λήγουν Σύντομα (≤90 Μέρες)" color="var(--warning)" list={expiringSoon} />
      <Section title="Ληγμένες Εγγυήσεις" color="var(--negative)" list={expired} />
      <Section title="Εγγυήσεις σε Ισχύ" color="var(--positive)" list={valid} />
      {withWarranty.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-tertiary)' }}>
          <p style={{ fontSize: 28, marginBottom: 8 }}>📋</p>
          <p style={{ fontSize: 13 }}>Δεν έχετε καταχωρήσει ημερομηνίες εγγύησης</p>
        </div>
      )}
    </div>
  )
}

// ─── Handover Sub-tab ─────────────────────────────────────────────────────────

function HandoverTab({
  items,
  handovers,
  propertyId,
  userId,
  onHandoverSaved,
}: {
  items: InventoryItem[]
  handovers: InventoryHandover[]
  propertyId: string
  userId: string
  onHandoverSaved: () => void
}) {
  const [mode, setMode] = useState<'list' | 'new'>('list')
  const [handoverType, setHandoverType] = useState<'check_in' | 'check_out'>('check_in')
  const [tenantName, setTenantName] = useState('')
  const [tenantPhone, setTenantPhone] = useState('')
  const [handoverDate, setHandoverDate] = useState('')
  const [notes, setNotes] = useState('')
  const [itemConditions, setItemConditions] = useState<Record<string, { condition: string; notes: string }>>({})
  const [saving, setSaving] = useState(false)

  const initConditions = () => {
    const init: Record<string, { condition: string; notes: string }> = {}
    items.forEach(item => {
      init[item.id] = { condition: item.condition, notes: '' }
    })
    setItemConditions(init)
  }

  useEffect(() => {
    if (mode === 'new') initConditions()
  }, [mode, items])

  const setItemCond = (id: string, field: 'condition' | 'notes', val: string) => {
    setItemConditions(prev => ({ ...prev, [id]: { ...prev[id], [field]: val } }))
  }

  const handleSave = async () => {
    if (!tenantName.trim()) { alert('Το ονοματεπώνυμο ενοικιαστή είναι υποχρεωτικό.'); return }
    setSaving(true)
    const snapshot: HandoverItemSnapshot[] = items.map(item => ({
      item_id: item.id,
      name: item.name,
      category: item.category,
      condition_at_handover: itemConditions[item.id]?.condition || item.condition,
      condition_notes: itemConditions[item.id]?.notes || '',
      photo_url: item.photo_url || '',
    }))
    const { error } = await supabase.from('inventory_handovers').insert({
      property_id: propertyId,
      user_id: userId,
      handover_type: handoverType,
      tenant_name: tenantName,
      tenant_phone: tenantPhone,
      handover_date: handoverDate || new Date().toISOString().split('T')[0],
      notes,
      items_snapshot: snapshot,
    })
    if (error) { alert('Σφάλμα αποθήκευσης: ' + error.message); setSaving(false); return }
    setMode('list')
    onHandoverSaved()
    setSaving(false)
  }

  const printHandover = (h: InventoryHandover) => {
    const snap = h.items_snapshot || []
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`
      <html><head><title>Πρωτόκολλο Παράδοσης</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; margin: 30px; color: #111; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        .sub { color: #666; margin-bottom: 20px; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th { background: #f4f4f4; padding: 8px 10px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; border-bottom: 2px solid #ddd; }
        td { padding: 8px 10px; border-bottom: 1px solid #eee; vertical-align: top; }
        tr:nth-child(even) td { background: #fafafa; }
        .sig { margin-top: 48px; display: flex; gap: 60px; }
        .sig-box { flex: 1; border-top: 1px solid #999; padding-top: 8px; font-size: 11px; color: #666; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; }
        .good { background: #dcfce7; color: #166534; }
        .ok { background: #dbeafe; color: #1e40af; }
        .mid { background: #fef9c3; color: #854d0e; }
        .bad { background: #fee2e2; color: #991b1b; }
        .dead { background: #f3f4f6; color: #4b5563; }
        @media print { button { display: none; } }
      </style></head><body>
      <h1>Πρωτόκολλο ${h.handover_type === 'check_in' ? 'Παράδοσης' : 'Παραλαβής'}</h1>
      <div class="sub">
        Ενοικιαστής: <strong>${h.tenant_name}</strong>${h.tenant_phone ? ` · ${h.tenant_phone}` : ''}<br>
        Ημερομηνία: <strong>${formatDate(h.handover_date)}</strong><br>
        Τύπος: <strong>${h.handover_type === 'check_in' ? 'Check-In (Είσοδος Ενοικιαστή)' : 'Check-Out (Έξοδος Ενοικιαστή)'}</strong>
      </div>
      ${h.notes ? `<p><em>Σημειώσεις: ${h.notes}</em></p>` : ''}
      <table>
        <thead><tr><th>Αντικείμενο</th><th>Κατηγορία</th><th>Κατάσταση</th><th>Παρατηρήσεις</th></tr></thead>
        <tbody>
          ${snap.map(s => {
            const condClass: Record<string, string> = { 'Άριστη': 'good', 'Καλή': 'ok', 'Μέτρια': 'mid', 'Κακή': 'bad', 'Εκτός Λειτουργίας': 'dead' }
            return `<tr>
              <td>${s.name}</td>
              <td>${s.category}</td>
              <td><span class="badge ${condClass[s.condition_at_handover] || 'ok'}">${s.condition_at_handover}</span></td>
              <td>${s.condition_notes || '—'}</td>
            </tr>`
          }).join('')}
        </tbody>
      </table>
      <div class="sig">
        <div class="sig-box">Υπογραφή Ιδιοκτήτη</div>
        <div class="sig-box">Υπογραφή Ενοικιαστή</div>
        <div class="sig-box">Ημερομηνία & Σφραγίδα</div>
      </div>
      <button onclick="window.print()" style="margin-top:24px;padding:8px 16px;cursor:pointer">🖨️ Εκτύπωση</button>
      </body></html>
    `)
    w.document.close()
  }

  if (mode === 'new') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Νέο Πρωτόκολλο Παράδοσης</p>
          <button onClick={() => setMode('list')} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'none', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>← Πίσω</button>
        </div>

        {/* Type */}
        {dot('Τύπος Παράδοσης')}
        <div style={{ display: 'flex', gap: 10 }}>
          {(['check_in', 'check_out'] as const).map(t => (
            <button key={t} onClick={() => setHandoverType(t)} style={{
              flex: 1, padding: '12px 0', borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: 13,
              border: `1px solid ${handoverType === t ? 'var(--accent)' : 'var(--border-subtle)'}`,
              background: handoverType === t ? 'var(--accent)' : 'var(--bg-elevated)',
              color: handoverType === t ? 'var(--bg-base)' : 'var(--text-secondary)',
            }}>
              {t === 'check_in' ? '🔑 Check-In — Είσοδος Ενοικιαστή' : '🚪 Check-Out — Έξοδος Ενοικιαστή'}
            </button>
          ))}
        </div>

        {/* Tenant info */}
        {dot('Στοιχεία Ενοικιαστή')}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <p style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6, fontWeight: 600 }}>Ονοματεπώνυμο *</p>
            <TextInput value={tenantName} onChange={setTenantName} placeholder="π.χ. Ιωάννης Παπαδόπουλος" />
          </div>
          <div>
            <p style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6, fontWeight: 600 }}>Τηλέφωνο</p>
            <TextInput value={tenantPhone} onChange={setTenantPhone} placeholder="π.χ. 6912345678" />
          </div>
          <div>
            <p style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6, fontWeight: 600 }}>Ημερομηνία Παράδοσης</p>
            <DatePicker value={handoverDate} onChange={setHandoverDate} />
          </div>
          <div>
            <p style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6, fontWeight: 600 }}>Γενικές Σημειώσεις</p>
            <TextInput value={notes} onChange={setNotes} placeholder="Παρατηρήσεις κατά την παράδοση..." />
          </div>
        </div>

        {/* Item conditions */}
        {dot('Κατάσταση Αντικειμένων', <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{items.length} αντικείμενα</span>)}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(item => (
            <div key={item.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 160px 1fr', gap: 12, alignItems: 'center', padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border-subtle)' }}>
              {item.photo_url ? (
                <img src={item.photo_url} alt={item.name} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }} />
              ) : (
                <div style={{ width: 40, height: 40, background: 'var(--bg-surface)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{CATEGORY_ICONS[item.category]}</div>
              )}
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{item.name}</p>
                <p style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{item.category}{item.room ? ` · ${item.room}` : ''}</p>
              </div>
              <CustomSelect
                value={itemConditions[item.id]?.condition || item.condition}
                onChange={v => setItemCond(item.id, 'condition', v)}
                options={CONDITIONS.map(c => ({ value: c, label: c }))}
              />
              <TextInput
                value={itemConditions[item.id]?.notes || ''}
                onChange={v => setItemCond(item.id, 'notes', v)}
                placeholder="Παρατηρήσεις..."
              />
            </div>
          ))}
        </div>

        {items.length === 0 && (
          <div style={{ padding: '16px', background: 'rgba(251,146,60,0.1)', borderRadius: 10, border: '1px solid var(--warning)30' }}>
            <p style={{ fontSize: 12, color: 'var(--warning)' }}>⚠️ Δεν έχετε αντικείμενα στην απογραφή. Προσθέστε αντικείμενα πρώτα από την καρτέλα "Αντικείμενα".</p>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={() => setMode('list')} style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid var(--border-subtle)', background: 'none', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>Ακύρωση</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '9px 22px', borderRadius: 10, background: saving ? 'var(--border-subtle)' : 'var(--accent)', border: 'none', color: 'var(--bg-base)', fontSize: 12, fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}>
            {saving ? 'Αποθήκευση...' : '📋 Αποθήκευση Πρωτοκόλλου'}
          </button>
        </div>
      </div>
    )
  }

  // List mode
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {dot('Πρωτόκολλα Παράδοσης')}
        <button onClick={() => setMode('new')} style={{ padding: '8px 16px', borderRadius: 10, background: 'var(--accent)', border: 'none', color: 'var(--bg-base)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          + Νέο Πρωτόκολλο
        </button>
      </div>

      {handovers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <p style={{ fontSize: 28, marginBottom: 8 }}>📋</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 4 }}>Δεν έχετε πρωτόκολλα παράδοσης</p>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Δημιουργήστε ένα πρωτόκολλο check-in ή check-out</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {handovers.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(h => {
            const snap = h.items_snapshot || []
            const condBad = snap.filter(s => s.condition_at_handover === 'Κακή' || s.condition_at_handover === 'Εκτός Λειτουργίας').length
            return (
              <div key={h.id} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Badge
                        label={h.handover_type === 'check_in' ? '🔑 Check-In' : '🚪 Check-Out'}
                        color={h.handover_type === 'check_in' ? 'var(--positive)' : 'var(--info)'}
                      />
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{h.tenant_name}</p>
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      {formatDate(h.handover_date)}{h.tenant_phone ? ` · ${h.tenant_phone}` : ''}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {condBad > 0 && <Badge label={`${condBad} προβληματικά`} color="var(--negative)" />}
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{snap.length} αντικείμενα</span>
                    <button onClick={() => printHandover(h)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'none', color: 'var(--accent)', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                      🖨️ Εκτύπωση
                    </button>
                  </div>
                </div>
                {h.notes && <p style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: 8 }}>{h.notes}</p>}
                {/* Quick summary of items with issues */}
                {condBad > 0 && (
                  <div style={{ padding: '8px 12px', background: 'rgba(248,113,113,0.08)', borderRadius: 8, border: '1px solid var(--negative)25' }}>
                    <p style={{ fontSize: 10, color: 'var(--negative)', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Αντικείμενα με Προβλήματα</p>
                    {snap.filter(s => s.condition_at_handover === 'Κακή' || s.condition_at_handover === 'Εκτός Λειτουργίας').map((s, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', padding: '2px 0' }}>
                        <span>{s.name}</span>
                        <span style={{ color: 'var(--negative)' }}>{s.condition_at_handover}{s.condition_notes ? ` — ${s.condition_notes}` : ''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Exports Sub-tab ──────────────────────────────────────────────────────────

function ExportsTab({ items, repairs }: { items: InventoryItem[]; repairs: InventoryRepair[] }) {
  const exportCSV = () => {
    const headers = ['Ονομασία', 'Κατηγορία', 'Δωμάτιο', 'Μάρκα', 'Μοντέλο', 'Σειριακός', 'Κατάσταση', 'Αξία Αγοράς (€)', 'Τρέχουσα Αξία (€)', 'Ημ/νία Αγοράς', 'Λήξη Εγγύησης', 'Σημειώσεις']
    const rows = items.map(i => [
      i.name, i.category, i.room, i.brand, i.model, i.serial_number, i.condition,
      i.purchase_value || '', calcCurrentValue(i),
      i.purchase_date, i.warranty_expiry, i.notes,
    ])
    const csv = [headers, ...rows].map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'απογραφη.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const exportPDF = () => {
    const totalPurchase = items.reduce((s, i) => s + (i.purchase_value || 0), 0)
    const totalCurrent = items.reduce((s, i) => s + calcCurrentValue(i), 0)
    const byCategory = CATEGORIES.map(cat => {
      const catItems = items.filter(i => i.category === cat)
      return { cat, count: catItems.length, val: catItems.reduce((s, i) => s + calcCurrentValue(i), 0) }
    }).filter(x => x.count > 0)

    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`
      <html><head><title>Απογραφή Ακινήτου</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 30px; }
        h1 { font-size: 20px; font-weight: bold; margin-bottom: 4px; }
        .subtitle { color: #666; font-size: 12px; margin-bottom: 24px; }
        .kpis { display: flex; gap: 12px; margin-bottom: 24px; }
        .kpi { flex: 1; background: #f8f8f8; border-radius: 8px; padding: 12px; }
        .kpi-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: #888; margin-bottom: 4px; }
        .kpi-value { font-size: 16px; font-weight: bold; font-family: monospace; }
        h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #888; margin: 20px 0 10px; border-bottom: 1px solid #eee; padding-bottom: 6px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { background: #f4f4f4; padding: 7px 8px; text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 2px solid #ddd; }
        td { padding: 7px 8px; border-bottom: 1px solid #f0f0f0; }
        tr:nth-child(even) td { background: #fafafa; }
        .badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 9px; font-weight: bold; }
        .cat-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f0f0f0; }
        .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #eee; font-size: 10px; color: #999; text-align: center; }
        @media print { button { display: none; } }
      </style></head><body>
      <h1>Απογραφή Ακινήτου</h1>
      <div class="subtitle">Ημερομηνία έκδοσης: ${new Date().toLocaleDateString('el-GR')} · Σύνολο: ${items.length} αντικείμενα</div>

      <div class="kpis">
        <div class="kpi"><div class="kpi-label">Αξία Αγοράς</div><div class="kpi-value">${formatEuro(totalPurchase)}</div></div>
        <div class="kpi"><div class="kpi-label">Τρέχουσα Αξία</div><div class="kpi-value">${formatEuro(totalCurrent)}</div></div>
        <div class="kpi"><div class="kpi-label">Απόσβεση</div><div class="kpi-value">-${formatEuro(totalPurchase - totalCurrent)}</div></div>
        <div class="kpi"><div class="kpi-label">Ασφαλιστέα Αξία (+10%)</div><div class="kpi-value">${formatEuro(Math.round(totalCurrent * 1.1))}</div></div>
      </div>

      <h2>Ανάλυση ανά Κατηγορία</h2>
      ${byCategory.sort((a, b) => b.val - a.val).map(({ cat, count, val }) =>
        `<div class="cat-row"><span>${CATEGORY_ICONS[cat]} ${cat} (${count} αντικείμενα)</span><span style="font-family:monospace;font-weight:bold">${formatEuro(val)}</span></div>`
      ).join('')}

      <h2>Αναλυτική Απογραφή</h2>
      <table>
        <thead><tr><th>Αντικείμενο</th><th>Κατηγορία</th><th>Μάρκα / Μοντέλο</th><th>Κατάσταση</th><th>Αξία Αγοράς</th><th>Τρέχουσα Αξία</th><th>Λήξη Εγγύησης</th></tr></thead>
        <tbody>
          ${items.map(i => {
            const condColors: Record<string, string> = { 'Άριστη': '#dcfce7', 'Καλή': '#dbeafe', 'Μέτρια': '#fef9c3', 'Κακή': '#fee2e2', 'Εκτός Λειτουργίας': '#f3f4f6' }
            const condText: Record<string, string> = { 'Άριστη': '#166534', 'Καλή': '#1e40af', 'Μέτρια': '#854d0e', 'Κακή': '#991b1b', 'Εκτός Λειτουργίας': '#4b5563' }
            return `<tr>
              <td><strong>${i.name}</strong>${i.notes ? `<br><small style="color:#999">${i.notes}</small>` : ''}</td>
              <td>${i.category}</td>
              <td>${[i.brand, i.model].filter(Boolean).join(' ')}</td>
              <td><span class="badge" style="background:${condColors[i.condition]||'#f3f4f6'};color:${condText[i.condition]||'#666'}">${i.condition}</span></td>
              <td style="font-family:monospace">${i.purchase_value ? formatEuro(i.purchase_value) : '—'}</td>
              <td style="font-family:monospace;font-weight:bold">${formatEuro(calcCurrentValue(i))}</td>
              <td>${i.warranty_expiry ? formatDate(i.warranty_expiry) : '—'}</td>
            </tr>`
          }).join('')}
        </tbody>
      </table>

      <div class="footer">Property OS · Απογραφή Ακινήτου · ${new Date().toLocaleDateString('el-GR')}</div>
      <button onclick="window.print()" style="margin-top:16px;padding:8px 20px;cursor:pointer;font-size:12px">🖨️ Εκτύπωση / Αποθήκευση PDF</button>
      </body></html>
    `)
    w.document.close()
  }

  const totalCurrent = items.reduce((s, i) => s + calcCurrentValue(i), 0)
  const totalRepairCost = repairs.reduce((s, r) => s + (r.cost || 0), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {dot('Εξαγωγές Δεδομένων')}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* PDF */}
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 28, textAlign: 'center' }}>📄</div>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center' }}>Απογραφή PDF</p>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.6 }}>
            Πλήρης απογραφή με KPI σύνοψη, ανάλυση ανά κατηγορία, λίστα αντικειμένων και στοιχεία απόσβεσης.
          </p>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 8, padding: '10px 14px', fontSize: 11, color: 'var(--text-tertiary)' }}>
            <p>📦 {items.length} αντικείμενα</p>
            <p>💰 Τρέχουσα αξία: <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--positive)' }}>{formatEuro(totalCurrent)}</span></p>
          </div>
          <button onClick={exportPDF} style={{ padding: '10px 0', borderRadius: 10, background: 'var(--accent)', border: 'none', color: 'var(--bg-base)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            📄 Εξαγωγή PDF
          </button>
        </div>

        {/* CSV */}
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 28, textAlign: 'center' }}>📊</div>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center' }}>Εξαγωγή CSV</p>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.6 }}>
            Αρχείο Excel-συμβατό με όλες τις στήλες. Ιδανικό για λογιστή ή ασφαλιστή.
          </p>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 8, padding: '10px 14px', fontSize: 11, color: 'var(--text-tertiary)' }}>
            <p>📋 {items.length} γραμμές + headers</p>
            <p>🔧 Επισκευές: <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--negative)' }}>{formatEuro(totalRepairCost)}</span></p>
          </div>
          <button onClick={exportCSV} style={{ padding: '10px 0', borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            📊 Εξαγωγή CSV
          </button>
        </div>
      </div>

      {/* Insurance tip */}
      <div style={{ padding: '14px 16px', background: 'rgba(96,165,250,0.08)', borderRadius: 10, border: '1px solid var(--info)25' }}>
        <p style={{ fontSize: 11, color: 'var(--info)', fontWeight: 600, marginBottom: 4 }}>💡 Συμβουλή για Ασφάλιση</p>
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Η ασφαλιστέα αξία περιεχομένου βάσει της απογραφής σας ανέρχεται σε <strong style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--info)' }}>{formatEuro(Math.round(totalCurrent * 1.1))}</strong> (τρέχουσα αξία +10% buffer). Χρησιμοποιήστε αυτό το νούμερο στο συμβόλαιο ασφάλισης περιεχομένου. Μπορείτε να μεταβείτε στην καρτέλα Λογαριασμοί → Ασφάλεια για να ενημερώσετε το ποσό κάλυψης.
        </p>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TabInventory({ propertyId, userId }: TabInventoryProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'items' | 'warranties' | 'handover' | 'exports'>('overview')
  const [items, setItems] = useState<InventoryItem[]>([])
  const [repairs, setRepairs] = useState<InventoryRepair[]>([])
  const [handovers, setHandovers] = useState<InventoryHandover[]>([])
  const [loading, setLoading] = useState(true)
  const [showItemForm, setShowItemForm] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [repairItem, setRepairItem] = useState<InventoryItem | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [itemsRes, repairsRes, handoversRes] = await Promise.all([
      supabase.from('inventory_items').select('*').eq('property_id', propertyId).order('created_at', { ascending: false }),
      supabase.from('inventory_repairs').select('*').eq('user_id', userId).order('repair_date', { ascending: false }),
      supabase.from('inventory_handovers').select('*').eq('property_id', propertyId).order('created_at', { ascending: false }),
    ])
    if (itemsRes.data) setItems(itemsRes.data)
    if (repairsRes.data) setRepairs(repairsRes.data)
    if (handoversRes.data) setHandovers(handoversRes.data as InventoryHandover[])
    setLoading(false)
  }, [propertyId, userId])

  useEffect(() => { fetchData() }, [fetchData])

  const handleSaveItem = async (data: Partial<InventoryItem>) => {
    if (editingItem) {
      await supabase.from('inventory_items').update({ ...data, updated_at: new Date().toISOString() }).eq('id', editingItem.id)
    } else {
      await supabase.from('inventory_items').insert({ ...data, property_id: propertyId, user_id: userId })
    }
    setShowItemForm(false)
    setEditingItem(null)
    fetchData()
  }

  const handleDeleteItem = async (id: string) => {
    await supabase.from('inventory_items').delete().eq('id', id)
    fetchData()
  }

  const handleAddRepair = async (data: Partial<InventoryRepair>) => {
    if (!repairItem) return
    await supabase.from('inventory_repairs').insert({ ...data, item_id: repairItem.id, user_id: userId })
    fetchData()
  }

  const TABS = [
    { key: 'overview', label: 'Επισκόπηση' },
    { key: 'items', label: 'Αντικείμενα' },
    { key: 'warranties', label: 'Εγγυήσεις' },
    { key: 'handover', label: 'Παράδοση' },
    { key: 'exports', label: 'Εξαγωγές' },
  ] as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Modals */}
      {(showItemForm || editingItem) && (
        <ItemFormModal
          item={editingItem}
          onSave={handleSaveItem}
          onClose={() => { setShowItemForm(false); setEditingItem(null) }}
        />
      )}
      {repairItem && (
        <RepairModal
          item={repairItem}
          repairs={repairs}
          onAdd={handleAddRepair}
          onClose={() => setRepairItem(null)}
        />
      )}

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Απογραφή</p>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Διαχείριση εξοπλισμού, εγγυήσεων και πρωτοκόλλων παράδοσης
        </p>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10,
              border: `1px solid ${activeTab === tab.key ? 'var(--accent)' : 'var(--border-subtle)'}`,
              background: activeTab === tab.key ? 'var(--accent)' : 'var(--bg-elevated)',
              color: activeTab === tab.key ? 'var(--bg-base)' : 'var(--text-secondary)',
              cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.2s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-tertiary)' }}>
          <p style={{ fontSize: 14 }}>Φόρτωση απογραφής...</p>
        </div>
      ) : (
        <>
          {activeTab === 'overview' && <OverviewTab items={items} />}
          {activeTab === 'items' && (
            <ItemsTab
              items={items}
              repairs={repairs}
              onAdd={() => { setEditingItem(null); setShowItemForm(true) }}
              onEdit={item => { setEditingItem(item); setShowItemForm(true) }}
              onDelete={handleDeleteItem}
              onAddRepair={item => setRepairItem(item)}
            />
          )}
          {activeTab === 'warranties' && <WarrantiesTab items={items} />}
          {activeTab === 'handover' && (
            <HandoverTab
              items={items}
              handovers={handovers}
              propertyId={propertyId}
              userId={userId}
              onHandoverSaved={fetchData}
            />
          )}
          {activeTab === 'exports' && <ExportsTab items={items} repairs={repairs} />}
        </>
      )}
    </div>
  )
}