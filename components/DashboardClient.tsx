"use client";

import { useState, type CSSProperties } from "react";
import type { User } from "@supabase/supabase-js";
import type { Property } from "@/lib/types";
import { T } from "@/components/Theme";
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

  const addBtnStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "var(--accent)",
    color: "var(--accent-text)",
    fontSize: 12,
    fontWeight: 600,
    padding: "10px 20px",
    borderRadius: T.radius.inner,
    border: "none",
    cursor: "pointer",
    transition: "background 0.15s ease",
    fontFamily: T.font.mono,
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-base)",
        display: "flex",
        flexDirection: "column",
      }}
    >
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
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 24,
            paddingLeft: 16,
            paddingRight: 16,
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              style={{ width: 32, height: 32, color: "var(--text-tertiary)" }}
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
          <div style={{ textAlign: "center" }}>
            <p
              style={{
                color: "var(--text-primary)",
                fontSize: 12,
                marginBottom: 4,
                fontFamily: T.font.mono,
              }}
            >
              Δεν έχετε ακίνητα ακόμα
            </p>
            <p
              style={{
                color: "var(--text-secondary)",
                fontSize: 11,
                fontFamily: T.font.mono,
              }}
            >
              Προσθέστε το πρώτο σας ακίνητο για να ξεκινήσετε
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            style={addBtnStyle}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--accent-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--accent)";
            }}
          >
            <svg
              style={{ width: 16, height: 16 }}
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
          <div
            style={{
              background: "var(--bg-surface)",
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            <div
              style={{
                display: "flex",
                overflowX: "auto",
                paddingLeft: 20,
                paddingRight: 20,
              }}
            >
              {TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      position: "relative",
                      paddingTop: 14,
                      paddingBottom: 14,
                      paddingLeft: 16,
                      paddingRight: 16,
                      fontSize: 11,
                      whiteSpace: "nowrap",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      transition: "color 0.15s ease",
                      color: isActive
                        ? "var(--accent)"
                        : "var(--text-secondary)",
                      fontFamily: T.font.mono,
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive)
                        e.currentTarget.style.color = "var(--text-primary)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive)
                        e.currentTarget.style.color = "var(--text-secondary)";
                    }}
                  >
                    {tab.label}
                    {isActive && (
                      <span
                        style={{
                          position: "absolute",
                          bottom: 0,
                          left: 0,
                          right: 0,
                          height: 2,
                          background: "var(--accent)",
                          borderTopLeftRadius: T.radius.pill,
                          borderTopRightRadius: T.radius.pill,
                        }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab content */}
          <div
            style={{
              flex: 1,
              padding: 20,
              maxWidth: 1024,
              width: "100%",
              margin: "0 auto",
            }}
          >
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
