"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  EXPENSE_CATEGORIES,
  type Expense,
  type Property,
  type PropertyData,
} from "@/lib/types";
import { T, EmptyState } from "@/components/Theme";

interface Props {
  property: Property;
  userId: string;
}

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function TabExpenses({ property, userId }: Props) {
  const [propData, setPropData] = useState<PropertyData | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [dataId, setDataId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    category: "Επισκευή",
    description: "",
    amount: "",
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
          setExpenses((data as PropertyData).data?.expenses ?? []);
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property.id, userId]);

  async function saveExpenses(updated: Expense[]) {
    setSaving(true);
    if (dataId) {
      await supabase
        .from("property_data")
        .update({
          data: { ...(propData?.data ?? {}), expenses: updated },
        })
        .eq("id", dataId);
    } else {
      const { data: newRow } = await supabase
        .from("property_data")
        .insert({
          user_id: userId,
          data: {
            property_id: property.id,
            expenses: updated,
            bills: [],
            rental: { isRented: false },
            events: [],
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
    const amount = Number(form.amount);
    if (!form.description.trim() || isNaN(amount) || amount <= 0) return;
    const newExp: Expense = {
      id: genId(),
      date: form.date,
      category: form.category,
      description: form.description.trim(),
      amount,
    };
    const updated = [newExp, ...expenses];
    setExpenses(updated);
    await saveExpenses(updated);
    setForm({
      date: new Date().toISOString().split("T")[0],
      category: "Επισκευή",
      description: "",
      amount: "",
    });
    setShowForm(false);
  }

  async function handleDelete(id: string) {
    const updated = expenses.filter((e) => e.id !== id);
    setExpenses(updated);
    await saveExpenses(updated);
  }

  const total = expenses.reduce((s, e) => s + e.amount, 0);

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
  const cellStyle: CSSProperties = { padding: "12px 16px" };
  const thStyle: CSSProperties = {
    ...cellStyle,
    textAlign: "left",
    fontSize: 11,
    color: "var(--text-secondary)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    fontFamily: T.font.mono,
  };
  const numFont: CSSProperties = {
    fontFamily: T.font.mono,
    fontVariantNumeric: "tabular-nums",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <h2
            style={{
              fontFamily: T.font.sans,
              fontWeight: 800,
              fontSize: 22,
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            Δαπάνες
          </h2>
          <p
            style={{
              fontSize: 11,
              color: "var(--text-secondary)",
              marginTop: 2,
              ...numFont,
            }}
          >
            Σύνολο: €{total.toLocaleString("el-GR")}
          </p>
        </div>
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
          Νέα Δαπάνη
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
            Καταχώρηση Δαπάνης
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
              gap: 16,
            }}
          >
            <div>
              <label style={labelStyle}>Ημερομηνία</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Κατηγορία</label>
              <select
                value={form.category}
                onChange={(e) =>
                  setForm((f) => ({ ...f, category: e.target.value }))
                }
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option
                    key={c}
                    value={c}
                    style={{ background: "var(--bg-elevated)" }}
                  >
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label style={labelStyle}>Περιγραφή</label>
            <input
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              style={inputStyle}
              placeholder="π.χ. Βαφή εξωτερικών τοίχων"
              required
            />
          </div>
          <div>
            <label style={labelStyle}>Ποσό (€)</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={form.amount}
              onChange={(e) =>
                setForm((f) => ({ ...f, amount: e.target.value }))
              }
              style={inputStyle}
              placeholder="0.00"
              required
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

      {/* List */}
      {expenses.length === 0 ? (
        <div style={cardStyle}>
          <EmptyState title="Δεν υπάρχουν καταχωρημένες δαπάνες" />
        </div>
      ) : (
        <div style={{ ...cardStyle, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <div className="table-wrap">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  {["Ημερομηνία", "Κατηγορία", "Περιγραφή", "Ποσό", ""].map(
                    (h) => (
                      <th key={h} style={thStyle}>
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {expenses.map((exp) => (
                  <tr
                    key={exp.id}
                    style={{ borderBottom: "1px solid var(--border-subtle)" }}
                  >
                    <td
                      style={{
                        ...cellStyle,
                        fontSize: 12,
                        color: "var(--text-secondary)",
                        whiteSpace: "nowrap",
                        ...numFont,
                      }}
                    >
                      {exp.date}
                    </td>
                    <td style={cellStyle}>
                      <span
                        style={{
                          fontSize: 11,
                          background: "var(--bg-overlay)",
                          padding: "2px 8px",
                          borderRadius: T.radius.badge,
                          color: "var(--text-secondary)",
                          fontFamily: T.font.mono,
                        }}
                      >
                        {exp.category}
                      </span>
                    </td>
                    <td
                      style={{
                        ...cellStyle,
                        fontSize: 12,
                        color: "var(--text-primary)",
                        fontFamily: T.font.mono,
                      }}
                    >
                      {exp.description}
                    </td>
                    <td
                      style={{
                        ...cellStyle,
                        fontSize: 12,
                        color: "var(--accent)",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        ...numFont,
                      }}
                    >
                      €{exp.amount.toLocaleString("el-GR")}
                    </td>
                    <td style={cellStyle}>
                      <button
                        onClick={() => handleDelete(exp.id)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--text-tertiary)",
                          cursor: "pointer",
                          padding: 0,
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
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <td
                    colSpan={3}
                    style={{
                      ...cellStyle,
                      fontSize: 11,
                      color: "var(--text-secondary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      textAlign: "right",
                      fontFamily: T.font.mono,
                    }}
                  >
                    Σύνολο
                  </td>
                  <td
                    style={{
                      ...cellStyle,
                      fontSize: 12,
                      color: "var(--accent)",
                      fontWeight: 600,
                      ...numFont,
                    }}
                  >
                    €{total.toLocaleString("el-GR")}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
