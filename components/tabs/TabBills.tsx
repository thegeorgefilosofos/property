"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  BILL_TYPES,
  type Bill,
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

export default function TabBills({ property, userId }: Props) {
  const [propData, setPropData] = useState<PropertyData | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [dataId, setDataId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    type: "ΔΕΗ",
    issuer: "",
    amount: "",
    date: new Date().toISOString().split("T")[0],
    paid: false,
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
          setBills((data as PropertyData).data?.bills ?? []);
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property.id, userId]);

  async function saveBills(updated: Bill[]) {
    setSaving(true);
    if (dataId) {
      await supabase
        .from("property_data")
        .update({ data: { ...(propData?.data ?? {}), bills: updated } })
        .eq("id", dataId);
    } else {
      const { data: newRow } = await supabase
        .from("property_data")
        .insert({
          user_id: userId,
          data: {
            property_id: property.id,
            expenses: [],
            bills: updated,
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
    if (isNaN(amount) || amount <= 0) return;
    const newBill: Bill = {
      id: genId(),
      type: form.type,
      issuer: form.issuer.trim() || form.type,
      amount,
      date: form.date,
      paid: form.paid,
    };
    const updated = [newBill, ...bills];
    setBills(updated);
    await saveBills(updated);
    setForm({
      type: "ΔΕΗ",
      issuer: "",
      amount: "",
      date: new Date().toISOString().split("T")[0],
      paid: false,
    });
    setShowForm(false);
  }

  async function togglePaid(id: string) {
    const updated = bills.map((b) =>
      b.id === id ? { ...b, paid: !b.paid } : b
    );
    setBills(updated);
    await saveBills(updated);
  }

  async function handleDelete(id: string) {
    const updated = bills.filter((b) => b.id !== id);
    setBills(updated);
    await saveBills(updated);
  }

  const pending = bills.filter((b) => !b.paid);
  const totalPending = pending.reduce((s, b) => s + b.amount, 0);

  const labelClass = "text-xs text-ink-muted uppercase tracking-wider block mb-1.5";
  const inputClass =
    "w-full bg-elevated border border-frame rounded-lg px-3.5 py-2.5 text-ink text-sm focus:outline-none focus:border-gold transition-colors";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl text-ink">Λογαριασμοί</h2>
          {totalPending > 0 && (
            <p
              className="text-xs text-danger mt-0.5"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {pending.length} εκκρεμείς · €{totalPending.toLocaleString("el-GR")}
            </p>
          )}
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
          Νέος Λογαριασμός
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
            Νέος Λογαριασμός
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
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                className={`${inputClass} cursor-pointer`}
              >
                {BILL_TYPES.map((t) => (
                  <option key={t} value={t} className="bg-elevated">
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                className={labelClass}
                style={{ fontFamily: "var(--font-mono)" }}
              >
                Εκδότης
              </label>
              <input
                value={form.issuer}
                onChange={(e) =>
                  setForm((f) => ({ ...f, issuer: e.target.value }))
                }
                className={inputClass}
                placeholder="Προαιρετικό"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
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
                onChange={(e) =>
                  setForm((f) => ({ ...f, date: e.target.value }))
                }
                className={inputClass}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.paid}
              onChange={(e) =>
                setForm((f) => ({ ...f, paid: e.target.checked }))
              }
              className="w-4 h-4 accent-gold"
            />
            <span
              className="text-sm text-ink-muted"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Έχει εξοφληθεί
            </span>
          </label>
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

      {bills.length === 0 ? (
        <div className="bg-surface border border-frame rounded-xl p-10 text-center">
          <p
            className="text-ink-muted text-sm"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Δεν υπάρχουν καταχωρημένοι λογαριασμοί
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {bills.map((bill) => (
            <div
              key={bill.id}
              className={`flex items-center gap-3 bg-surface border rounded-xl px-4 py-3 transition-all ${
                bill.paid ? "border-frame opacity-60" : "border-frame hover:border-frame-light"
              }`}
            >
              <button
                onClick={() => togglePaid(bill.id)}
                className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                  bill.paid
                    ? "bg-success border-success"
                    : "border-frame-light hover:border-gold"
                }`}
              >
                {bill.paid && (
                  <svg
                    className="w-3 h-3 text-canvas"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs bg-frame px-2 py-0.5 rounded text-ink-muted"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {bill.type}
                  </span>
                  {bill.issuer !== bill.type && (
                    <span
                      className="text-sm text-ink truncate"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {bill.issuer}
                    </span>
                  )}
                </div>
                <p
                  className="text-xs text-ink-muted mt-0.5"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {bill.date}
                </p>
              </div>

              <span
                className={`text-sm font-semibold whitespace-nowrap ${
                  bill.paid ? "text-ink-muted" : "text-gold"
                }`}
                style={{ fontFamily: "var(--font-mono)" }}
              >
                €{bill.amount.toLocaleString("el-GR")}
              </span>

              <button
                onClick={() => handleDelete(bill.id)}
                className="text-ink-dim hover:text-danger transition-colors ml-1"
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
          ))}
        </div>
      )}
    </div>
  );
}
