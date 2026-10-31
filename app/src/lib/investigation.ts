export type Hotspot = { lon: number; lat: number; date: string | null; ym: number; conf: string; peat: boolean; kind: string; frp: number | null; licence?: string; village?: string; dmpg?: string; forest?: string; burn_years?: string }
export type FireFilter = { year: number; start: number; end: number; high: boolean; peat: boolean }
export function inPeriod(p: { ym: number; conf: string; peat: boolean; kind: string }, f: FireFilter) {
  return p.kind === 'viirs' && Math.floor(p.ym / 100) === f.year && p.ym % 100 >= f.start && p.ym % 100 <= f.end && (f.high ? p.conf === 'high' : ['medium', 'high'].includes(p.conf)) && (!f.peat || p.peat)
}
export function contextCounts(points: Hotspot[], field: keyof Hotspot) {
  const counts = new Map<string, number>()
  for (const p of points) for (const label of new Set(String(p[field] || '').split(' | ').filter(Boolean))) counts.set(label, (counts.get(label) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1])
}
export const monthDate = (ym: number) => new Date(Math.floor(ym / 100), ym % 100 - 1, 15)
