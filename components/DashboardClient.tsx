"use client";

import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { Property } from "@/lib/types";
import DashboardHeader from "./DashboardHeader";
import AddPropertyModal from "./AddPropertyModal";
import TabOverview from "./tabs/TabOverview";
import TabExpenses from "./tabs/TabExpenses";
import TabBills from "./tabs/TabBills";
import TabCalendar from "./tabs/TabCalendar";
import TabRentalROI from "./tabs/TabRentalROI";
import TabSettings from "./tabs/TabSettings";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "expenses", label: "Δαπάνες" },
  { id: "bills", label: "Λογαριασμοί" },
  { id: "calendar", label: "Ημερολόγιο" },
  { id: "rental", label: "Ενοίκιο & ROI" },
  { id: "settings", label: "Ρυθμίσεις" },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface Props {
  user: User;
  initialProperties: Property[];
}

export default function DashboardClient({ user, initialProperties }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [properties, setProperties] = useState<Property[]>(initialProperties);
  const [selected, setSelected] = useState<Property | null>(
    initialProperties[0] ?? null
  );
  const [showAddModal, setShowAddModal] = useState(false);

  function handleAddProperty(p: Property) {
    setProperties((prev) => [p, ...prev]);
    setSelected(p);
    setShowAddModal(false);
    setActiveTab("overview");
  }

  function handlePropertyUpdated(updated: Property) {
    setProperties((prev) =>
      prev.map((p) => (p.id === updated.id ? updated : p))
    );
    setSelected(updated);
  }

  function handlePropertyDeleted(id: string) {
    const remaining = properties.filter((p) => p.id !== id);
    setProperties(remaining);
    setSelected(remaining[0] ?? null);
    setActiveTab("overview");
  }

  function renderTab() {
    if (!selected) return null;
    switch (activeTab) {
      case "overview":
        return <TabOverview property={selected} userId={user.id} />;
      case "expenses":
        return <TabExpenses property={selected} userId={user.id} />;
      case "bills":
        return <TabBills property={selected} userId={user.id} />;
      case "calendar":
        return <TabCalendar property={selected} userId={user.id} />;
      case "rental":
        return <TabRentalROI property={selected} userId={user.id} />;
      case "settings":
        return (
          <TabSettings
            property={selected}
            userId={user.id}
            onUpdated={handlePropertyUpdated}
            onDeleted={handlePropertyDeleted}
          />
        );
      default:
        return null;
    }
  }

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      <DashboardHeader
        user={user}
        properties={properties}
        selectedProperty={selected}
        onSelectProperty={(p) => {
          setSelected(p);
          setActiveTab("overview");
        }}
        onAddProperty={() => setShowAddModal(true)}
      />

      {properties.length === 0 ? (
        /* Empty state */
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4">
          <div className="w-16 h-16 rounded-2xl bg-surface border border-frame flex items-center justify-center">
            <svg
              className="w-8 h-8 text-ink-dim"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
          </div>
          <div className="text-center">
            <p
              className="text-ink text-sm mb-1"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Δεν έχετε ακίνητα ακόμα
            </p>
            <p
              className="text-ink-muted text-xs"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Προσθέστε το πρώτο σας ακίνητο για να ξεκινήσετε
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-gold hover:bg-gold-light text-canvas text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4v16m8-8H4"
              />
            </svg>
            Προσθήκη Ακινήτου
          </button>
        </div>
      ) : (
        <>
          {/* Tab bar */}
          <div className="bg-surface border-b border-frame">
            <div className="flex overflow-x-auto px-5">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative py-3.5 px-4 text-xs whitespace-nowrap transition-colors ${
                    activeTab === tab.id
                      ? "text-gold"
                      : "text-ink-muted hover:text-ink"
                  }`}
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {tab.label}
                  {activeTab === tab.id && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold rounded-t-full" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Tab content */}
          <div className="flex-1 p-5 max-w-5xl w-full mx-auto">
            {renderTab()}
          </div>
        </>
      )}

      {showAddModal && (
        <AddPropertyModal
          userId={user.id}
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddProperty}
        />
      )}
    </div>
  );
}
