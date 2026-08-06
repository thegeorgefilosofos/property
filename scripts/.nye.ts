import { shortTermYearSummary, collectedLevyForYear } from '@/lib/tax/shortTermTax'
const nye = [{
  check_in: '2025-12-28', check_out: '2026-01-05', nights: 8,
  gross_guest_paid: 1216, climate_levy: 16, platform_fee: 0,
  amount_basis: 'gross', total: 1216, channel: 'airbnb',
}] as any
const meta = { sqm: 70, isHouse: false, individual: true }
for (const y of [2025, 2026]) {
  const s = shortTermYearSummary(nye, y, meta)
  console.log(`${y}: nights=${s.totalNights} levy=${s.levy} collected=${s.collectedLevy.toFixed(2)} shortfall=${s.levyShortfall.toFixed(2)} gross=${s.grossRevenue} net=${s.net.toFixed(2)}`)
}
console.log('collectedLevyForYear 2025 =', collectedLevyForYear(nye, 2025))
console.log('collectedLevyForYear 2026 =', collectedLevyForYear(nye, 2026))
