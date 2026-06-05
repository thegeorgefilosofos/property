"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PROPERTY_TYPES, type Property } from "@/lib/types";

interface Props {
  property: Property;
  userId: string;
  onUpdated: (p: Property) => void;
  onDeleted: (id: string) => void;
}

export default function TabSettings({
  property,
  userId,
  onUpdated,
  onDeleted,
}: Props) {
  const [form, setForm] = useState({
    name: property.name,
    prop_type: property.prop_type,
    address: property.address,
    sqm: property.sqm.toString(),
    ownership: property.ownership.toString(),
  });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function update(key: string, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
    setSaveMsg("");
    setError("");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const sqmNum = Number(form.sqm);
    const ownNum = Number(form.ownership);
    if (!form.name.trim()) { setError("Το όνομα είναι υποχρεωτικό"); return; }
    if (isNaN(sqmNum) || sqmNum <= 0) { setError("Μη έγκυρα τ.μ."); return; }
    if (isNaN(ownNum) || ownNum <= 0 || ownNum > 100) {
      setError("Το ποσοστό πρέπει να είναι 1–100");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { data, error: dbErr } = await supabase
      .from("user_properties")
      .update({
        name: form.name.trim(),
        prop_type: form.prop_type,
        address: form.address.trim(),
        sqm: sqmNum,
        ownership: ownNum,
      })
      .eq("id", property.id)
      .eq("user_id", userId)
      .select()
      .single();

    setSaving(false);
    if (dbErr) {
      setError(dbErr.message);
    } else {
      onUpdated(data as Property);
      setSaveMsg("Αποθηκεύτηκε επιτυχώς");
    }
  }

  async function handleDelete() {
    setDeleting(true);
    const supabase = createClient();

    // Delete property_data first
    await supabase
      .from("property_data")
      .delete()
      .eq("user_id", userId)
      .filter("data->>property_id", "eq", property.id);

    const { error: dbErr } = await supabase
      .from("user_properties")
      .delete()
      .eq("id", property.id)
      .eq("user_id", userId);

    setDeleting(false);
    if (dbErr) {
      setError(dbErr.message);
    } else {
      onDeleted(property.id);
    }
  }

  const labelClass = "text-xs text-ink-muted uppercase tracking-wider block mb-1.5";
  const inputClass =
    "w-full bg-elevated border border-frame rounded-lg px-3.5 py-2.5 text-ink text-sm focus:outline-none focus:border-gold transition-colors";

  return (
    <div className="space-y-6 max-w-lg">
      <h2 className="font-display text-2xl text-ink">Ρυθμίσεις</h2>

      {/* Edit form */}
      <div className="bg-surface border border-frame rounded-xl p-5">
        <h3
          className="text-xs text-ink-muted uppercase tracking-wider mb-5"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          Στοιχεία Ακινήτου
        </h3>
        <form onSubmit={handleSave} className="space-y-4">
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
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                className={labelClass}
                style={{ fontFamily: "var(--font-mono)" }}
              >
                Τ.Μ.
              </label>
              <input
                type="number"
                min="1"
                value={form.sqm}
                onChange={(e) => update("sqm", e.target.value)}
                className={inputClass}
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
              />
            </div>
          </div>

          {error && (
            <p
              className="text-xs text-danger"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {error}
            </p>
          )}
          {saveMsg && (
            <p
              className="text-xs text-success"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {saveMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-gold hover:bg-gold-light text-canvas font-semibold text-sm py-2.5 rounded-lg transition-colors disabled:opacity-50"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {saving ? "Αποθήκευση…" : "Αποθήκευση Αλλαγών"}
          </button>
        </form>
      </div>

      {/* Danger zone */}
      <div className="bg-surface border border-danger/30 rounded-xl p-5">
        <h3
          className="text-xs text-danger uppercase tracking-wider mb-3"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          Επικίνδυνη Ζώνη
        </h3>
        <p
          className="text-xs text-ink-muted mb-4"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          Η διαγραφή ακινήτου είναι μη αναστρέψιμη. Όλα τα δεδομένα θα χαθούν.
        </p>

        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-sm text-danger border border-danger/40 hover:bg-danger/10 px-4 py-2 rounded-lg transition-colors"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Διαγραφή Ακινήτου
          </button>
        ) : (
          <div className="space-y-3">
            <p
              className="text-xs text-danger font-semibold"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              Είστε σίγουροι; Αυτή η ενέργεια δεν μπορεί να αναιρεθεί.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 border border-frame text-ink-muted hover:text-ink text-sm py-2 rounded-lg transition-colors"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                Ακύρωση
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 bg-danger hover:bg-red-600 text-white text-sm font-semibold py-2 rounded-lg transition-colors disabled:opacity-50"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {deleting ? "Διαγραφή…" : "Ναι, Διαγραφή"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
