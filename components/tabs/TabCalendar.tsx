"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CalendarEvent, Property, PropertyData } from "@/lib/types";
import { T, EmptyState } from "@/components/Theme";

interface Props {
  property: Property;
  userId: string;
}

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

const EVENT_TYPES = [
  { value: "reminder", label: "Υπενθύμιση" },
  { value: "payment", label: "Πληρωμή" },
  { value: "visit", label: "Επίσκεψη" },
  { value: "other", label: "Άλλο" },
] as const;

const EVENT_STYLES: Record<CalendarEvent["type"], CSSProperties> = {
  reminder: {
    color: "var(--warning)",
    background: "var(--warning-soft)",
    border: "1px solid var(--warning-border)",
  },
  payment: {
    color: "var(--negative)",
    background: "var(--negative-soft)",
    border: "1px solid var(--negative-border)",
  },
  visit: {
    color: "var(--info)",
    background: "var(--info-soft)",
    border: "1px solid var(--info-border)",
  },
  other: {
    color: "var(--text-secondary)",
    background: "var(--bg-overlay)",
    border: "1px solid var(--border-default)",
  },
};

export default function TabCalendar({ property, userId }: Props) {
  const [propData, setPropData] = useState<PropertyData | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [dataId, setDataId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    date: new Date().toISOString().split("T")[0],
    description: "",
    type: "reminder" as CalendarEvent["type"],
  });

  const supabase = createClient();

  useEffect(() => {
    supabase
      .from("property_data")
      .select("*")
      .eq("user_id", userId)
      .filter("data->>property_id", "eq", property.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setPropData(data as PropertyData);
          setDataId(data.id);
          const evts: CalendarEvent[] = (data as PropertyData).data?.events ?? [];
          setEvents([...evts].sort((a, b) => a.date.localeCompare(b.date)));
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property.id, userId]);

  async function saveEvents(updated: CalendarEvent[]) {
    setSaving(true);
    if (dataId) {
      await supabase
        .from("property_data")
        .update({ data: { ...(propData?.data ?? {}), events: updated } })
        .eq("id", dataId);
    } else {
      const { data: newRow } = await supabase
        .from("property_data")
        .insert({
          user_id: userId,
          data: {
            property_id: property.id,
            expenses: [],
            bills: [],
            rental: { isRented: false },
            events: updated,
          },
        })
        .select()
        .single();
      if (newRow) {
        setPropData(newRow as PropertyData);
        setDataId(newRow.id);
      }
    }
    setSaving(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    const newEvent: CalendarEvent = {
      id: genId(),
      title: form.title.trim(),
      date: form.date,
      description: form.description.trim(),
      type: form.type,
    };
    const updated = [...events, newEvent].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    setEvents(updated);
    await saveEvents(updated);
    setForm({
      title: "",
      date: new Date().toISOString().split("T")[0],
      description: "",
      type: "reminder",
    });
    setShowForm(false);
  }

  async function handleDelete(id: string) {
    const updated = events.filter((ev) => ev.id !== id);
    setEvents(updated);
    await saveEvents(updated);
  }

  const today = new Date().toISOString().split("T")[0];
  const upcoming = events.filter((e) => e.date >= today);
  const past = events.filter((e) => e.date < today);

  const labelStyle: CSSProperties = {
    display: "block",
    marginBottom: 6,
    fontSize: 11,
    color: "var(--text-secondary)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    fontFamily: T.font.mono,
  };
  const inputStyle: CSSProperties = {
    width: "100%",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-subtle)",
    borderRadius: T.radius.inner,
    padding: "10px 14px",
    color: "var(--text-primary)",
    fontSize: 12,
    fontFamily: T.font.mono,
    outline: "none",
  };
  const cardStyle: CSSProperties = {
    background: "var(--bg-surface)",
    border: "1px solid var(--border-subtle)",
    borderRadius: T.radius.card,
  };
  const sectionHdrStyle: CSSProperties = {
    margin: 0,
    marginBottom: 12,
    fontSize: 11,
    color: "var(--text-secondary)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    fontFamily: T.font.mono,
  };

  function EventRow({ ev }: { ev: CalendarEvent }) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          padding: "12px 0",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: T.radius.badge,
                fontFamily: T.font.mono,
                ...EVENT_STYLES[ev.type],
              }}
            >
              {EVENT_TYPES.find((t) => t.value === ev.type)?.label}
            </span>
            <span
              style={{
                fontSize: 12,
                color: "var(--text-primary)",
                fontFamily: T.font.mono,
              }}
            >
              {ev.title}
            </span>
          </div>
          {ev.description && (
            <p
              style={{
                fontSize: 11,
                color: "var(--text-secondary)",
                marginTop: 4,
                fontFamily: T.font.mono,
              }}
            >
              {ev.description}
            </p>
          )}
          <p
            style={{
              fontSize: 11,
              color: "var(--text-tertiary)",
              marginTop: 4,
              fontFamily: T.font.mono,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {ev.date}
          </p>
        </div>
        <button
          onClick={() => handleDelete(ev.id)}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-tertiary)",
            cursor: "pointer",
            padding: 0,
            marginTop: 2,
            display: "inline-flex",
          }}
        >
          <svg
            style={{ width: 16, height: 16 }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <h2
          style={{
            fontFamily: T.font.sans,
            fontWeight: 800,
            fontSize: 22,
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          Ημερολόγιο
        </h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "var(--accent)",
            color: "var(--accent-text)",
            fontSize: 11,
            fontWeight: 600,
            padding: "6px 12px",
            borderRadius: T.radius.inner,
            border: "none",
            cursor: "pointer",
            fontFamily: T.font.mono,
          }}
        >
          <svg
            style={{ width: 14, height: 14 }}
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
          Νέο Γεγονός
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleAdd}
          style={{
            ...cardStyle,
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: 11,
              color: "var(--text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              fontFamily: T.font.mono,
            }}
          >
            Νέο Γεγονός
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
              gap: 16,
            }}
          >
            <div>
              <label style={labelStyle}>Τύπος</label>
              <select
                value={form.type}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    type: e.target.value as CalendarEvent["type"],
                  }))
                }
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                {EVENT_TYPES.map((t) => (
                  <option
                    key={t.value}
                    value={t.value}
                    style={{ background: "var(--bg-elevated)" }}
                  >
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Ημερομηνία</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                style={inputStyle}
              />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Τίτλος</label>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              style={inputStyle}
              placeholder="π.χ. Ανανέωση ασφαλιστηρίου"
              required
            />
          </div>
          <div>
            <label style={labelStyle}>Σημείωση</label>
            <input
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              style={inputStyle}
              placeholder="Προαιρετικά"
            />
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              style={{
                flex: 1,
                background: "transparent",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-secondary)",
                fontSize: 12,
                padding: "8px 0",
                borderRadius: T.radius.inner,
                cursor: "pointer",
                fontFamily: T.font.mono,
              }}
            >
              Ακύρωση
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                flex: 1,
                background: "var(--accent)",
                color: "var(--accent-text)",
                fontSize: 12,
                fontWeight: 600,
                padding: "8px 0",
                borderRadius: T.radius.inner,
                border: "none",
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.5 : 1,
                fontFamily: T.font.mono,
              }}
            >
              {saving ? "Αποθήκευση…" : "Προσθήκη"}
            </button>
          </div>
        </form>
      )}

      {events.length === 0 ? (
        <div style={cardStyle}>
          <EmptyState title="Δεν υπάρχουν καταχωρημένα γεγονότα" />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {upcoming.length > 0 && (
            <div style={{ ...cardStyle, padding: 20 }}>
              <h3 style={sectionHdrStyle}>Επερχόμενα ({upcoming.length})</h3>
              {upcoming.map((ev) => (
                <EventRow key={ev.id} ev={ev} />
              ))}
            </div>
          )}
          {past.length > 0 && (
            <div style={{ ...cardStyle, padding: 20, opacity: 0.6 }}>
              <h3 style={sectionHdrStyle}>Παρελθόν ({past.length})</h3>
              {past
                .slice()
                .reverse()
                .map((ev) => (
                  <EventRow key={ev.id} ev={ev} />
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
