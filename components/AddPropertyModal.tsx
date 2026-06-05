"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PROPERTY_TYPES, type Property } from "@/lib/types";

interface Props {
  userId: string;
  onClose: () => void;
  onAdd: (property: Property) => void;
}

export default function AddPropertyModal({ userId, onClose, onAdd }: Props) {
  const [form, setForm] = useState({
    name: "",
    prop_type: "Κατοικία",
    address: "",
    sqm: "",
    value: "",
    ownership: "100",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function update(key: string, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!form.name.trim()) {
      setError("Το όνομα είναι υποχρεωτικό");
      return;
    }
    const sqmNum = Number(form.sqm);
    const ownNum = Number(form.ownership);
    if (isNaN(sqmNum) || sqmNum <= 0) {
      setError("Μη έγκυρα τ.μ.");
      return;
    }
    if (isNaN(ownNum) || ownNum <= 0 || ownNum > 100) {
      setError("Το ποσοστό πρέπει να είναι 1–100");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    const { data, error: dbErr } = await supabase
      .from("user_properties")
      .insert({
        user_id: userId,
        name: form.name.trim(),
        prop_type: form.prop_type,
        address: form.address.trim(),
        sqm: sqmNum,
        ownership: ownNum,
      })
      .select()
      .single();

    if (dbErr) {
      setError(dbErr.message);
      setLoading(false);
      return;
    }

    // Store value in property_data if provided
    if (form.value && Number(form.value) > 0) {
      await supabase.from("property_data").insert({
        user_id: userId,
        data: {
          property_id: data.id,
          value: Number(form.value),
          expenses: [],
          bills: [],
          rental: { isRented: false },
          events: [],
        },
      });
    }

    onAdd(data as Property);
  }

  const labelClass = "text-xs text-ink-muted uppercase tracking-wider block mb-1.5";
  const inputClass =
    "w-full bg-elevated border border-frame rounded-lg px-3.5 py-2.5 text-ink text-sm focus:outline-none focus:border-gold transition-colors placeholder-ink-dim";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(8,8,13,0.85)" }}
    >
      <div className="bg-surface border border-frame rounded-xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-frame">
          <h2
            className="text-ink text-sm tracking-wider uppercase"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Προσθήκη Ακινήτου
          </h2>
          <button
            onClick={onClose}
            className="text-ink-muted hover:text-ink transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label
              className={labelClass}
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Όνομα *
            </label>
            <input
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              className={inputClass}
              placeholder="π.χ. Βίλα Γλυφάδα"
            />
          </div>

          <div>
            <label
              className={labelClass}
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Τύπος
            </label>
            <select
              value={form.prop_type}
              onChange={(e) => update("prop_type", e.target.value)}
              className={`${inputClass} cursor-pointer`}
            >
              {PROPERTY_TYPES.map((t) => (
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
              Διεύθυνση
            </label>
            <input
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
              className={inputClass}
              placeholder="π.χ. Λεωφόρος Βουλιαγμένης 42, Αθήνα"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                className={labelClass}
                style={{ fontFamily: "var(--font-mono)" }}
              >
                Τ.Μ. *
              </label>
              <input
                type="number"
                min="1"
                value={form.sqm}
                onChange={(e) => update("sqm", e.target.value)}
                className={inputClass}
                placeholder="120"
              />
            </div>
            <div>
              <label
                className={labelClass}
                style={{ fontFamily: "var(--font-mono)" }}
              >
                Ιδιοκτησία %
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={form.ownership}
                onChange={(e) => update("ownership", e.target.value)}
                className={inputClass}
                placeholder="100"
              />
            </div>
          </div>

          <div>
            <label
              className={labelClass}
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Αξία (€)
            </label>
            <input
              type="number"
              min="0"
              value={form.value}
              onChange={(e) => update("value", e.target.value)}
              className={inputClass}
              placeholder="250000"
            />
          </div>

          {error && (
            <p
              className="text-xs text-danger"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-frame text-ink-muted hover:text-ink hover:border-frame-light text-sm py-2.5 rounded-lg transition-colors"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Ακύρωση
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-gold hover:bg-gold-light text-canvas font-semibold text-sm py-2.5 rounded-lg transition-colors disabled:opacity-50"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {loading ? "Αποθήκευση…" : "Αποθήκευση"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
