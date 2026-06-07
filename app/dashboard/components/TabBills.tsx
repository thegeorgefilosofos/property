'use client';

import { useState } from 'react';
import BillsDashboard from './BillsDashboard';
import BillsElectricity from './BillsElectricity';
import BillsCommon from './BillsCommon';
import BillsProviders from './BillsProviders';
import BillsInsurance from './BillsInsurance';
import BillsServices from './BillsServices';

interface Props {
  propertyId: string;
  userId: string;
  propertyName?: string;
  propertyAddress?: string;
}

const TABS = [
  { id: 'dashboard', label: '📊 Dashboard', desc: 'Σύνοψη, ιστορικό, ημερολόγιο πληρωμών, σύγκριση αγοράς' },
  { id: 'electricity', label: '⚡ Ρεύμα', desc: 'Πάροχος, kWh, VNM / E.NA, ανάλυση λογαριασμού, σύγκριση παρόχων' },
  { id: 'common', label: '🏛 Κοινόχρηστα', desc: 'Διαχείριση κτηρίου (Billys/Comfy), ταμείο, έκτακτες εισφορές' },
  { id: 'providers', label: '📶 Πάροχοι', desc: 'Internet, TV, Νερό, Θέρμανση, Security — με επίσημες πηγές' },
  { id: 'insurance', label: '🛡️ Ασφάλεια & Συνδρομές', desc: 'Ασφάλεια κατοικίας, streaming, cloud, πάγιες συνδρομές' },
  { id: 'services', label: '🔧 Υπηρεσίες', desc: 'ΕΝΦΙΑ, καθαρισμός, κηπουρός, πισίνα, κλιματιστικά' },
] as const;

export default function TabBills({ propertyId, userId, propertyName = 'Ακίνητό μου', propertyAddress = '' }: Props) {
  const [activeTab, setActiveTab] = useState<typeof TABS[number]['id']>('dashboard');

  return (
    <div style={{ fontFamily: 'Inter,sans-serif', color: 'var(--text-primary)' }}>

      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>
          Λογαριασμοί & Πάγιες Δαπάνες
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
          Πλήρης καταγραφή, ανάλυση και παρακολούθηση όλων των σταθερών εξόδων του ακινήτου
        </div>
      </div>

      {/* Tab navigation */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{
              padding: '9px 16px',
              borderRadius: '10px',
              border: `1px solid ${activeTab === t.id ? 'var(--accent)' : 'var(--border-subtle)'}`,
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              fontFamily: 'Inter,sans-serif',
              background: activeTab === t.id ? 'var(--accent)' : 'var(--bg-elevated)',
              color: activeTab === t.id ? 'var(--bg-base)' : 'var(--text-secondary)',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab description */}
      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '16px', paddingLeft: '2px', minHeight: '16px' }}>
        {TABS.find(t => t.id === activeTab)?.desc}
      </div>

      {/* Content */}
      {activeTab === 'dashboard' && <BillsDashboard propertyId={propertyId} userId={userId} propertyName={propertyName} propertyAddress={propertyAddress} />}
      {activeTab === 'electricity' && <BillsElectricity propertyId={propertyId} userId={userId} />}
      {activeTab === 'common' && <BillsCommon propertyId={propertyId} userId={userId} />}
      {activeTab === 'providers' && <BillsProviders propertyId={propertyId} userId={userId} />}
      {activeTab === 'insurance' && <BillsInsurance propertyId={propertyId} userId={userId} />}
      {activeTab === 'services' && <BillsServices propertyId={propertyId} userId={userId} />}
    </div>
  );
}