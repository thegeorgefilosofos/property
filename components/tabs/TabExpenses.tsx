"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  EXPENSE_CATEGORIES,
  type Expense,
  type Property,
  type PropertyData,
} from "@/lib/types";

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

  const labelClass = "text-xs text-ink-muted uppercase tracking-wider block mb-1.5";
  const inputClass =
    "w-full bg-elevated border border-frame rounded-lg px-3.5 py-2.5 text-ink text-sm focus:outline-none focus:border-gold transition-colors";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl text-ink">Δαπάνες</h2>
          <p
            className="text-xs text-ink-muted mt-0.5"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Σύνολο: €{total.toLocaleString("el-GR")}
          </p>
        </div>
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
          Νέα Δαπάνη
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
            Καταχώρηση Δαπάνης
          </h3>
          <div className="grid grid-cols-2 gap-4">
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
            <div>
              <label
                className={labelClass}
                style={{ fontFamily: "var(--font-mono)" }}
              >
                Κατηγορία
              </label>
              <select
                value={form.category}
                onChange={(e) =>
                  setForm((f) => ({ ...f, category: e.target.value }))
                }
                className={`${inputClass} cursor-pointer`}
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c} className="bg-elevated">
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label
              className={labelClass}
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Περιγραφή
            </label>
            <input
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              className={inputClass}
              placeholder="π.χ. Βαφή εξωτερικών τοίχων"
              required
            />
          </div>
          <div>
            <label
              className={labelClass}
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Ποσό (€)
            </label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={form.amount}
              onChange={(e) =>
                setForm((f) => ({ ...f, amount: e.target.value }))
              }
              className={inputClass}
              placeholder="0.00"
              required
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

      {/* List */}
      {expenses.length === 0 ? (
        <div className="bg-surface border border-frame rounded-xl p-10 text-center">
          <p
            className="text-ink-muted text-sm"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Δεν υπάρχουν καταχωρημένες δαπάνες
          </p>
        </div>
      ) : (
        <div className="bg-surface border border-frame rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-frame">
                  {["Ημερομηνία", "Κατηγορία", "Περιγραφή", "Ποσό", ""].map(
                    (h) => (
                      <th
                        key={h}
                        className="text-left px-4 py-3 text-xs text-ink-muted uppercase tracking-wider"
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
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
                    className="border-b border-frame last:border-0 hover:bg-elevated/50 transition-colors"
                  >
                    <td
                      className="px-4 py-3 text-sm text-ink-muted whitespace-nowrap"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {exp.date}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs bg-frame px-2 py-0.5 rounded text-ink-muted"
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        {exp.category}
                      </span>
                    </td>
                    <td
                      className="px-4 py-3 text-sm text-ink"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {exp.description}
                    </td>
                    <td
                      className="px-4 py-3 text-sm text-gold font-semibold whitespace-nowrap"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      €{exp.amount.toLocaleString("el-GR")}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDelete(exp.id)}
                        className="text-ink-dim hover:text-danger transition-colors"
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
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-frame bg-elevated/30">
                  <td
                    colSpan={3}
                    className="px-4 py-3 text-xs text-ink-muted uppercase tracking-wider text-right"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    Σύνολο
                  </td>
                  <td
                    className="px-4 py-3 text-sm text-gold font-semibold"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    €{total.toLocaleString("el-GR")}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
