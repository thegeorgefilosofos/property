"use client";

import { useState, type CSSProperties } from "react";
import { createClient } from "@/lib/supabase/client";
import { PROPERTY_TYPES, type Property } from "@/lib/types";
import { T } from "@/components/Theme";

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

  const labelStyle: CSSProperties = {
    fontSize: 11,
    color: "var(--text-secondary)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    display: "block",
    marginBottom: 6,
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

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
        maxWidth: 512,
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
        Ρυθμίσεις
      </h2>

      {/* Edit form */}
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: T.radius.card,
          padding: 20,
        }}
      >
        <h3
          style={{
            fontSize: 11,
            color: "var(--text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginTop: 0,
            marginBottom: 20,
            fontFamily: T.font.mono,
          }}
        >
          Στοιχεία Ακινήτου
        </h3>
        <form
          onSubmit={handleSave}
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          <div>
            <label style={labelStyle}>Όνομα *</label>
            <input
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Τύπος</label>
            <select
              value={form.prop_type}
              onChange={(e) => update("prop_type", e.target.value)}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              {PROPERTY_TYPES.map((t) => (
                <option
                  key={t}
                  value={t}
                  style={{ background: "var(--bg-elevated)" }}
                >
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Διεύθυνση</label>
            <input
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
              style={inputStyle}
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
            }}
          >
            <div>
              <label style={labelStyle}>Τ.Μ.</label>
              <input
                type="number"
                min="1"
                value={form.sqm}
                onChange={(e) => update("sqm", e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Ιδιοκτησία %</label>
              <input
                type="number"
                min="1"
                max="100"
                value={form.ownership}
                onChange={(e) => update("ownership", e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {error && (
            <p
              style={{
                fontSize: 11,
                color: "var(--negative)",
                margin: 0,
                fontFamily: T.font.mono,
              }}
            >
              {error}
            </p>
          )}
          {saveMsg && (
            <p
              style={{
                fontSize: 11,
                color: "var(--positive)",
                margin: 0,
                fontFamily: T.font.mono,
              }}
            >
              {saveMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            style={{
              width: "100%",
              background: "var(--accent)",
              color: "var(--accent-text)",
              fontWeight: 600,
              fontSize: 12,
              padding: "10px 0",
              borderRadius: T.radius.inner,
              border: "none",
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.5 : 1,
              fontFamily: T.font.mono,
            }}
          >
            {saving ? "Αποθήκευση…" : "Αποθήκευση Αλλαγών"}
          </button>
        </form>
      </div>

      {/* Danger zone */}
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--negative-border)",
          borderRadius: T.radius.card,
          padding: 20,
        }}
      >
        <h3
          style={{
            fontSize: 11,
            color: "var(--negative)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginTop: 0,
            marginBottom: 12,
            fontFamily: T.font.mono,
          }}
        >
          Επικίνδυνη Ζώνη
        </h3>
        <p
          style={{
            fontSize: 11,
            color: "var(--text-secondary)",
            marginTop: 0,
            marginBottom: 16,
            fontFamily: T.font.mono,
          }}
        >
          Η διαγραφή ακινήτου είναι μη αναστρέψιμη. Όλα τα δεδομένα θα χαθούν.
        </p>

        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            style={{
              fontSize: 12,
              color: "var(--negative)",
              border: "1px solid var(--negative-border)",
              padding: "8px 16px",
              borderRadius: T.radius.inner,
              background: "transparent",
              cursor: "pointer",
              fontFamily: T.font.mono,
            }}
          >
            Διαγραφή Ακινήτου
          </button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p
              style={{
                fontSize: 11,
                color: "var(--negative)",
                fontWeight: 600,
                margin: 0,
                fontFamily: T.font.mono,
              }}
            >
              Είστε σίγουροι; Αυτή η ενέργεια δεν μπορεί να αναιρεθεί.
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{
                  flex: 1,
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-secondary)",
                  fontSize: 12,
                  padding: "8px 0",
                  borderRadius: T.radius.inner,
                  background: "transparent",
                  cursor: "pointer",
                  fontFamily: T.font.mono,
                }}
              >
                Ακύρωση
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  flex: 1,
                  background: "var(--negative)",
                  color: "#ffffff",
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "8px 0",
                  borderRadius: T.radius.inner,
                  border: "none",
                  cursor: deleting ? "not-allowed" : "pointer",
                  opacity: deleting ? 0.5 : 1,
                  fontFamily: T.font.mono,
                }}
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
