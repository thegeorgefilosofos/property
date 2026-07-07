// Καθαρή λογική στατιστικών για τα συγκριτικά ακίνητα (ενοικίαση + πώληση).
// Χωρίς React/DOM ώστε να δοκιμάζεται με tsx (δες comparableStats.test.ts).

export interface SaleComp {
  asking_price?: number;
  price_per_sqm?: number;
  days_on_market?: number;
  sold_price?: number;
}

// Διάμεσος θετικών τιμών (τα <= 0 αγνοούνται). Κενό => 0.
export const median = (arr: number[]): number => {
  const s = arr.filter(n => n > 0).sort((a, b) => a - b);
  if (!s.length) return 0;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// Μέσος όρος θετικών τιμών. Κενό => 0.
export const mean = (arr: number[]): number => {
  const s = arr.filter(n => n > 0);
  return s.length ? s.reduce((a, b) => a + b, 0) / s.length : 0;
};

// Συγκεντρωτικά στατιστικά πώλησης (€/τ.μ. ανά ΤΚ, χρόνος στην αγορά, πωλήσεις).
export function saleStats(view: SaleComp[]) {
  const prices = view.map(c => c.asking_price || 0);
  const sqmPrices = view.map(c => c.price_per_sqm || 0).filter(p => p > 0).sort((a, b) => a - b);
  const doms = view.map(c => c.days_on_market || 0);
  return {
    avgPrice: mean(prices),
    avgPriceSqm: mean(sqmPrices),
    medPriceSqm: median(sqmPrices),
    minPriceSqm: sqmPrices[0] || 0,
    maxPriceSqm: sqmPrices[sqmPrices.length - 1] || 0,
    avgDom: Math.round(mean(doms)),
    soldCount: view.filter(c => (c.sold_price || 0) > 0).length,
    count: sqmPrices.length,
  };
}
