import { median } from 'd3-array'
import { readTable } from './data'

export const DRY_LEVEL = -40
const DAY = 86400000
const WEEK = 7 * DAY

type Reading = { kind: string; station_id: string; date: string; water_level_cm: number | null; flag: string | null }
type Station = { kind: string; station_id: string; lon: number | null; lat: number | null; khg: string | null; adm1: string | null }
export type WeeklyStation = Station & { lon: number; lat: number; levels: (number | null)[]; changes: (number | null)[] }
export type WaterData = { through: string; weeks: string[]; stations: WeeklyStation[] }
export type WaterSample = { lon: number; lat: number; level: number }
export type WeekStat = { level: number; count: number; dry: number; change: number | null }

const iso = (time: number) => new Date(time).toISOString().slice(0, 10)
const monday = (date: string) => {
  const time = Date.parse(date)
  return time - ((new Date(time).getUTCDay() + 6) % 7) * DAY
}

export function weekEnd(week: string) { return iso(Date.parse(week) + 6 * DAY) }

export function weeklyWater(readings: Reading[], roster: Station[]): WaterData {
  const located = new Map(roster.filter((s): s is Station & { lon: number; lat: number } =>
    s.lon != null && s.lat != null && Number.isFinite(s.lon) && Number.isFinite(s.lat)
    && s.lon >= 94 && s.lon <= 142 && s.lat >= -12.5 && s.lat <= 7)
    .map((s) => [`${s.kind}/${s.station_id}`, s]))
  const observed = new Map<string, Map<number, number[]>>()
  let first = Infinity, last = -Infinity, through = ''
  for (const r of readings) {
    if (r.flag || r.water_level_cm == null || !Number.isFinite(r.water_level_cm)) continue
    const key = `${r.kind}/${r.station_id}`
    if (!located.has(key)) continue
    const week = monday(r.date)
    if (!Number.isFinite(week)) continue
    first = Math.min(first, week); last = Math.max(last, week)
    if (r.date > through) through = r.date
    const station = observed.get(key) ?? new Map<number, number[]>()
    const values = station.get(week) ?? []
    values.push(r.water_level_cm)
    station.set(week, values)
    observed.set(key, station)
  }
  const times = Number.isFinite(first) ? Array.from({ length: (last - first) / WEEK + 1 }, (_, i) => first + i * WEEK) : []
  const stations = [...observed].map(([key, values]) => {
    const levels = times.map((week) => median(values.get(week) ?? []) ?? null)
    const firstMeasured = levels.findIndex((v) => v != null)
    const secondMeasured = levels.findIndex((v, i) => i > firstMeasured && v != null)
    const baseline = secondMeasured !== -1 ? (levels[firstMeasured]! + levels[secondMeasured]!) / 2 : null
    const changes = levels.map((level, i) => baseline != null && level != null && i >= secondMeasured ? level - baseline : null)
    return { ...located.get(key)!, levels, changes }
  })
  return { through, weeks: times.map(iso), stations }
}

let cached: Promise<WaterData> | undefined
export function loadWeeklyWater() {
  return cached ??= Promise.all([
    readTable<Reading>('national/sitmat_daily.parquet'),
    readTable<Station>('national/sitmat_stations.parquet'),
  ]).then(([readings, roster]) => weeklyWater(readings, roster))
}

export function waterWeek(stations: WeeklyStation[], week: number): WeekStat | null {
  const levels = stations.flatMap((s) => s.levels[week] == null ? [] : [s.levels[week]])
  if (!levels.length) return null
  const changes = stations.flatMap((s) => s.changes[week] == null ? [] : [s.changes[week]])
  return {
    level: median(levels)!, count: levels.length, dry: levels.filter((level) => level < DRY_LEVEL).length,
    change: changes.length >= 3 ? median(changes)! : null,
  }
}

export function waterRegions(data: WaterData, field: 'khg' | 'adm1', kind = 'all') {
  const groups = new Map<string, WeeklyStation[]>()
  for (const s of data.stations) {
    if ((kind !== 'all' && s.kind !== kind) || !s[field]) continue
    const id = s[field]!
    const group = groups.get(id) ?? []
    group.push(s)
    groups.set(id, group)
  }
  return [...groups].map(([id, stations]) => ({ id, stations, weeks: data.weeks.map((_, i) => waterWeek(stations, i)) }))
}
