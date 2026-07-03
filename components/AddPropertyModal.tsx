"use client";

import { useState, type CSSProperties } from "react";
import { createClient } from "@/lib/supabase/client";
import { PROPERTY_TYPES, type Property } from "@/lib/types";
import { T } from "@/components/Theme";

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
    outline: "none",
    transition: "border-color 0.15s ease",
  };

  const onFocusBorder = (e: React.FocusEvent<HTMLElement>) => {
    e.currentTarget.style.borderColor = "var(--accent)";
  };
  const onBlurBorder = (e: React.FocusEvent<HTMLElement>) => {
    e.currentTarget.style.borderColor = "var(--border-subtle)";
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(0,0,0,0.32)",
      }}
    >
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: T.radius.card,
          width: "100%",
          maxWidth: 448,
          boxShadow: "var(--shadow-lg)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 24px",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <h2
            style={{
              color: "var(--text-primary)",
              fontSize: 12,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              margin: 0,
              fontFamily: T.font.mono,
            }}
          >
            Προσθήκη Ακινήτου
          </h2>
          <button
            onClick={onClose}
            style={{
              color: "var(--text-secondary)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              transition: "color 0.15s ease",
              display: "flex",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-secondary)";
            }}
          >
            <svg
              style={{ width: 20, height: 20 }}
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
        <form
          onSubmit={handleSubmit}
          style={{
            padding: "20px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div>
            <label style={labelStyle}>Όνομα *</label>
            <input
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              style={inputStyle}
              onFocus={onFocusBorder}
              onBlur={onBlurBorder}
              placeholder="π.χ. Βίλα Γλυφάδα"
            />
          </div>

          <div>
            <label style={labelStyle}>Τύπος</label>
            <select
              value={form.prop_type}
              onChange={(e) => update("prop_type", e.target.value)}
              style={{ ...inputStyle, cursor: "pointer" }}
              onFocus={onFocusBorder}
              onBlur={onBlurBorder}
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
              onFocus={onFocusBorder}
              onBlur={onBlurBorder}
              placeholder="π.χ. Λεωφόρος Βουλιαγμένης 42, Αθήνα"
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={labelStyle}>Τ.Μ. *</label>
              <input
                type="number"
                min="1"
                value={form.sqm}
                onChange={(e) => update("sqm", e.target.value)}
                style={inputStyle}
                onFocus={onFocusBorder}
                onBlur={onBlurBorder}
                placeholder="120"
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
                onFocus={onFocusBorder}
                onBlur={onBlurBorder}
                placeholder="100"
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Αξία (€)</label>
            <input
              type="number"
              min="0"
              value={form.value}
              onChange={(e) => update("value", e.target.value)}
              style={inputStyle}
              onFocus={onFocusBorder}
              onBlur={onBlurBorder}
              placeholder="250000"
            />
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

          <div style={{ display: "flex", gap: 12, paddingTop: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                border: "1px solid var(--border-subtle)",
                color: "var(--text-secondary)",
                fontSize: 12,
                padding: "10px 0",
                borderRadius: T.radius.inner,
                background: "transparent",
                cursor: "pointer",
                transition: "all 0.15s ease",
                fontFamily: T.font.mono,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--text-primary)";
                e.currentTarget.style.borderColor = "var(--border-default)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--text-secondary)";
                e.currentTarget.style.borderColor = "var(--border-subtle)";
              }}
            >
              Ακύρωση
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                flex: 1,
                background: "var(--accent)",
                color: "var(--accent-text)",
                fontWeight: 600,
                fontSize: 12,
                padding: "10px 0",
                borderRadius: T.radius.inner,
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.5 : 1,
                transition: "background 0.15s ease",
                fontFamily: T.font.mono,
              }}
              onMouseEnter={(e) => {
                if (!loading)
                  e.currentTarget.style.background = "var(--accent-hover)";
              }}
              onMouseLeave={(e) => {
                if (!loading)
                  e.currentTarget.style.background = "var(--accent)";
              }}
            >
              {loading ? "Αποθήκευση…" : "Αποθήκευση"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
