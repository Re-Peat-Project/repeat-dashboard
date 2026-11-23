import { describe, expect, it } from 'vitest'
import { weeklyWater, waterWeek, weeklyHotspotCounts } from '../src/lib/waterTable'
import { waterContours, waterHexes } from '../src/lib/waterSurface'
import { hotspotCells } from '../src/lib/hotspotGlyphs'

describe('weekly SiTMAT views', () => {
  it('keeps covered weeks with zero detections distinct from unavailable weeks', () => {
    const weeks = ['2026-11-02', '2026-11-09', '2026-11-16']
    const data = {
      weeks: [weeks[0], weeks[2]],
      counts: { national: { [weeks[0]]: 17 }, province: { Riau: { [weeks[0]]: 3 } }, khg_id: { 'KHG.1': { [weeks[2]]: 1 } } },
    }
    expect(weeklyHotspotCounts(data, weeks, '', 'adm1')).toEqual([17, null, 0])
    expect(weeklyHotspotCounts(data, weeks, 'Riau', 'adm1')).toEqual([3, null, 0])
    expect(weeklyHotspotCounts(data, weeks, 'KHG.1', 'khg')).toEqual([0, null, 1])
  })

  it('counts each station once and withholds changes until three stations have a baseline', () => {
    const roster = ['a', 'b', 'c'].map((station_id) => ({ station_id, kind: 'community', lon: 101, lat: 0, khg: 'KHG.1', adm1: 'Riau' }))
    const reading = (station_id: string, date: string, water_level_cm: number, flag: string | null = null) =>
      ({ station_id, kind: 'community', date, water_level_cm, flag })
    const rows = [reading('a', '2026-11-16', -30), reading('a', '2026-11-18', -50),
      reading('a', '2026-11-17', -500, 'range'), reading('a', '2026-11-23', -60),
      reading('b', '2026-11-16', -20), reading('b', '2026-11-23', -30),
      reading('c', '2026-11-23', -40)]
    const data = weeklyWater(rows, roster)
    expect(data.weeks).toEqual(['2026-11-16', '2026-11-23'])
    expect(data.stations[0].levels).toEqual([-40, -60])
    expect(data.stations[0].changes).toEqual([null, -10])
    expect(waterWeek(data.stations, 1)).toEqual({ level: -40, count: 3, dry: 1, change: null })
  })

  it('bins measured levels and draws contours only with spatial support', () => {
    const points = [{ lon: 101, lat: 0, level: -50 }, { lon: 101.12, lat: 0, level: -55 }, { lon: 101.06, lat: 0.1, level: -60 }]
    const hex = waterHexes(points, 40)
    expect(hex.features[0].properties).toMatchObject({ count: 3, level: -55, dry: 3 })
    expect(waterContours(points.slice(0, 2), [100.5, -0.5, 102, 0.5]).features).toHaveLength(0)
    expect(waterContours(points, [100.5, -0.5, 102, 0.5]).features.length).toBeGreaterThan(0)
    expect(waterContours(points, [104, 1, 106, 2]).features).toHaveLength(0)
  })
})

describe('weighted hotspot clusters', () => {
  it('sums detections in the filtered cells instead of counting grid rows', () => {
    const row = { ix: 14, iy: 15, ym: 202611, conf: 'high', kind: 'modis2026', peat: true, n: 11 }
    const grid = [row, { ...row, conf: 'medium', n: 21 }, { ...row, ym: 202610 }, { ...row, kind: 'viirs' }, { ...row, peat: false }]
    const data = hotspotCells(grid, { year: 2026, start: 11, end: 11, high: false, peat: true }, 'modis2026')
    expect(data.features).toHaveLength(1)
    expect(data.features[0].properties).toEqual({ high: 11, medium: 21, total: 32 })
  })
})
