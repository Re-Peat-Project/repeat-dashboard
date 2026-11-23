import { describe, expect, it } from 'vitest'
import { contextCounts, inPeriod, lastFireMonth, limitFireMonths, type FireFilter, type Hotspot } from '../src/lib/investigation'

const filter: FireFilter = { year: 2026, start: 4, end: 9, high: true, peat: true }
const point: Hotspot = { lon: 105, lat: -3, date: null, ym: 202609, kind: 'viirs', conf: 'high', peat: true, frp: null }
describe('investigation selection', () => {
  it('keeps inclusive months and month-only records', () => {
    expect(inPeriod(point, filter)).toBe(true)
    expect(inPeriod({ ...point, ym: 202604 }, filter)).toBe(true)
    expect(inPeriod({ ...point, ym: 202603 }, filter)).toBe(false)
    expect(inPeriod({ ...point, ym: 202610 }, filter)).toBe(false)
  })
  it('separates sensors, confidence, and peat scope', () => {
    for (const patch of [{ kind: 'modis2026' }, { peat: false }, { conf: 'medium' }, { conf: 'low' }]) expect(inPeriod({ ...point, ...patch }, filter)).toBe(false)
    expect(inPeriod({ ...point, conf: 'medium', peat: false }, { ...filter, high: false, peat: false })).toBe(true)
    expect(inPeriod({ ...point, ym: 202509, kind: 'viirs' }, { ...filter, year: 2025 })).toBe(true)
    expect(inPeriod({ ...point, kind: 'modis2026' }, filter, 'modis2026')).toBe(true)
  })
  it('caps the latest year at the earlier of the current and last available month', () => {
    const november = new Date(2026, 10, 23)
    expect(lastFireMonth(2026, 202612, november)).toBe(11)
    expect(lastFireMonth(2026, 202610, november)).toBe(10)
    expect(lastFireMonth(2025, 202611, november)).toBe(12)
    expect(limitFireMonths({ ...filter, start: 12, end: 12 }, 11)).toEqual({ ...filter, start: 11, end: 11 })
  })
  it('preserves multiple intersecting areas and deduplicates each detection within an area', () => {
    const a = { ...point, licence: 'Area A | Area B | Area A' }
    const b = { ...point, licence: 'Area A' }
    expect(contextCounts([a, b, { ...point, licence: '' }], 'licence')).toEqual([['Area A', 2], ['Area B', 1]])
  })
})
