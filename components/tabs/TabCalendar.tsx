"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CalendarEvent, Property, PropertyData } from "@/lib/types";

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

const EVENT_COLORS: Record<CalendarEvent["type"], string> = {
  reminder: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  payment: "text-red-400 bg-red-400/10 border-red-400/30",
  visit: "text-blue-400 bg-blue-400/10 border-blue-400/30",
  other: "text-ink-muted bg-frame border-frame-light",
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

  const labelClass = "text-xs text-ink-muted uppercase tracking-wider block mb-1.5";
  const inputClass =
    "w-full bg-elevated border border-frame rounded-lg px-3.5 py-2.5 text-ink text-sm focus:outline-none focus:border-gold transition-colors";

  function EventRow({ ev }: { ev: CalendarEvent }) {
    return (
      <div className="flex items-start gap-3 py-3 border-b border-frame last:border-0">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-xs px-2 py-0.5 rounded border ${EVENT_COLORS[ev.type]}`}
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {EVENT_TYPES.find((t) => t.value === ev.type)?.label}
            </span>
            <span
              className="text-sm text-ink"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {ev.title}
            </span>
          </div>
          {ev.description && (
            <p
              className="text-xs text-ink-muted mt-1"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {ev.description}
            </p>
          )}
          <p
            className="text-xs text-ink-dim mt-1"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {ev.date}
          </p>
        </div>
        <button
          onClick={() => handleDelete(ev.id)}
          className="text-ink-dim hover:text-danger transition-colors mt-0.5"
        >
          <svg
            className="w-4 h-4"
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
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl text-ink">Ημερολόγιο</h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 bg-gold hover:bg-gold-light text-canvas text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          <svg
            className="w-3.5 h-3.5"
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
          className="bg-surface border border-frame rounded-xl p-5 space-y-4"
        >
          <h3
            className="text-xs text-ink-muted uppercase tracking-wider"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Νέο Γεγονός
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                className={labelClass}
                style={{ fontFamily: "var(--font-mono)" }}
              >
                Τύπος
              </label>
              <select
                value={form.type}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    type: e.target.value as CalendarEvent["type"],
                  }))
                }
                className={`${inputClass} cursor-pointer`}
              >
                {EVENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value} className="bg-elevated">
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                className={labelClass}
                style={{ fontFamily: "var(--font-mono)" }}
              >
                Ημερομηνία
              </label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label
              className={labelClass}
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Τίτλος
            </label>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className={inputClass}
              placeholder="π.χ. Ανανέωση ασφαλιστηρίου"
              required
            />
          </div>
          <div>
            <label
              className={labelClass}
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Σημείωση
            </label>
            <input
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              className={inputClass}
              placeholder="Προαιρετικά"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="flex-1 border border-frame text-ink-muted hover:text-ink text-sm py-2 rounded-lg transition-colors"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Ακύρωση
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-gold hover:bg-gold-light text-canvas text-sm font-semibold py-2 rounded-lg transition-colors disabled:opacity-50"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {saving ? "Αποθήκευση…" : "Προσθήκη"}
            </button>
          </div>
        </form>
      )}

      {events.length === 0 ? (
        <div className="bg-surface border border-frame rounded-xl p-10 text-center">
          <p
            className="text-ink-muted text-sm"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Δεν υπάρχουν καταχωρημένα γεγονότα
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {upcoming.length > 0 && (
            <div className="bg-surface border border-frame rounded-xl p-5">
              <h3
                className="text-xs text-ink-muted uppercase tracking-wider mb-3"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                Επερχόμενα ({upcoming.length})
              </h3>
              {upcoming.map((ev) => (
                <EventRow key={ev.id} ev={ev} />
              ))}
            </div>
          )}
          {past.length > 0 && (
            <div className="bg-surface border border-frame rounded-xl p-5 opacity-60">
              <h3
                className="text-xs text-ink-muted uppercase tracking-wider mb-3"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                Παρελθόν ({past.length})
              </h3>
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
