"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Property, PropertyData } from "@/lib/types";

interface Props {
  property: Property;
  userId: string;
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-elevated border border-frame rounded-xl p-5">
      <p
        className="text-xs text-ink-muted uppercase tracking-wider mb-2"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {label}
      </p>
      <p
        className="text-xl text-ink font-semibold"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {value}
      </p>
      {sub && (
        <p
          className="text-xs text-ink-muted mt-1"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start py-3 border-b border-frame last:border-0">
      <span
        className="text-xs text-ink-muted uppercase tracking-wider"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {label}
      </span>
      <span
        className="text-sm text-ink text-right max-w-[60%]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {value}
      </span>
    </div>
  );
}

export default function TabOverview({ property, userId }: Props) {
  const [propData, setPropData] = useState<PropertyData | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("property_data")
      .select("*")
      .eq("user_id", userId)
      .filter("data->>property_id", "eq", property.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setPropData(data as PropertyData);
      });
  }, [property.id, userId]);

  const value = propData?.data?.value;
  const ownedValue =
    value ? (value * property.ownership) / 100 : null;
  const expenses = propData?.data?.expenses ?? [];
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-6">
      {/* Property title */}
      <div>
        <h1 className="font-display text-3xl text-ink">{property.name}</h1>
        <p
          className="text-xs text-ink-muted mt-1 tracking-wider"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {property.prop_type}
          {property.address ? ` · ${property.address}` : ""}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Εμβαδόν"
          value={`${property.sqm} τ.μ.`}
        />
        <StatCard
          label="Ιδιοκτησία"
          value={`${property.ownership}%`}
        />
        {value ? (
          <StatCard
            label="Αξία"
            value={`€${value.toLocaleString("el-GR")}`}
            sub={ownedValue ? `Δικό σας: €${Math.round(ownedValue).toLocaleString("el-GR")}` : undefined}
          />
        ) : (
          <StatCard label="Αξία" value="—" sub="Δεν έχει οριστεί" />
        )}
        <StatCard
          label="Δαπάνες"
          value={`€${totalExpenses.toLocaleString("el-GR")}`}
          sub="Συνολικά"
        />
      </div>

      {/* Details */}
      <div className="bg-surface border border-frame rounded-xl p-5">
        <h3
          className="text-xs text-ink-muted uppercase tracking-wider mb-4"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          Στοιχεία Ακινήτου
        </h3>
        <InfoRow label="Τύπος" value={property.prop_type} />
        <InfoRow
          label="Διεύθυνση"
          value={property.address || "Δεν έχει οριστεί"}
        />
        <InfoRow label="Εμβαδόν" value={`${property.sqm} τ.μ.`} />
        <InfoRow label="Ποσοστό ιδιοκτησίας" value={`${property.ownership}%`} />
        {value && (
          <InfoRow
            label="Εκτιμώμενη αξία"
            value={`€${value.toLocaleString("el-GR")}`}
          />
        )}
      </div>

      {/* Ownership bar */}
      <div className="bg-surface border border-frame rounded-xl p-5">
        <h3
          className="text-xs text-ink-muted uppercase tracking-wider mb-4"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          Ποσοστό Ιδιοκτησίας
        </h3>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-elevated rounded-full overflow-hidden">
            <div
              className="h-full bg-gold rounded-full transition-all"
              style={{ width: `${property.ownership}%` }}
            />
          </div>
          <span
            className="text-sm text-gold font-semibold w-12 text-right"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {property.ownership}%
          </span>
        </div>
        {property.ownership < 100 && (
          <p
            className="text-xs text-ink-muted mt-2"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Υπόλοιπο {100 - property.ownership}% ανήκει σε άλλους ιδιοκτήτες
          </p>
        )}
      </div>
    </div>
  );
}
