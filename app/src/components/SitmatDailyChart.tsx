import { useEffect, useMemo, useState } from 'react'
import { median } from 'd3-array'
import { LineChart, type Series } from './LineChart'
import { readTable } from '../lib/data'
import { useT } from '../lib/i18n'
import { useStore } from '../lib/store'

type DailyReading = { kind: string; station_id: string; date: string; water_level_cm: number | null; flag: string | null }
type Station = { kind: string; station_id: string; adm1: string | null; khg: string | null }

export function SitmatDailyChart({ scope, focus, level, kind }: { scope: string; focus: string; level: 'adm1' | 'khg'; kind: string }) {
  const t = useT()
  const lang = useStore((s) => s.lang)
  const [data, setData] = useState<{ daily: DailyReading[]; stations: Station[] }>()
  const [error, setError] = useState(false)
  useEffect(() => {
    Promise.all([readTable<DailyReading>('national/sitmat_daily.parquet'), readTable<Station>('national/sitmat_stations.parquet')])
      .then(([daily, stations]) => setData({ daily, stations }), () => setError(true))
  }, [])

  const series = useMemo<Series[]>(() => {
    if (!data) return []
    const stationSet = focus ? new Set(data.stations.filter((s) => s[level] === focus).map((s) => `${s.kind}/${s.station_id}`)) : null
    return ['community', 'concession'].filter((stationType) => kind === 'all' || kind === stationType).map((stationType) => {
      const daily = new Map<string, Map<string, number>>()
      for (const r of data.daily) {
        if (r.kind !== stationType || r.flag || r.water_level_cm == null || !Number.isFinite(r.water_level_cm)) continue
        if (stationSet && !stationSet.has(`${r.kind}/${r.station_id}`)) continue
        const levels = daily.get(r.date) ?? new Map<string, number>()
        levels.set(r.station_id, r.water_level_cm)
        daily.set(r.date, levels)
      }
      const points = [...daily].sort(([a], [b]) => a.localeCompare(b)).map(([date, levels]) => ({ x: new Date(date), y: median(levels.values())!, count: levels.size }))
      return { name: t(stationType), color: stationType === 'community' ? 'var(--s5)' : 'var(--s6)', points }
    }).filter((s) => s.points.length)
  }, [data, focus, level, kind, t])

  if (error) return <p role="alert" className="card p-4">{t('Could not load the SiTMAT observations.')}</p>
  if (!data) return <p role="status" className="card p-4">{t('Loading SiTMAT observations…')}</p>
  return <LineChart title={`${t('Water level at SiTMAT stations')} · ${scope}`} yLabel="cm" series={series} discrete
    fmt={(v) => `${v.toLocaleString(lang, { maximumFractionDigits: 1, minimumFractionDigits: 1 })} cm`}
    formatDate={(date) => date.toISOString().slice(0, 10)} countLabel={t('reporting stations')}
    note={t('Daily median of unflagged readings. The number and mix of reporting stations can change each day. Positive values are above the local ground reference.')}
  />
}
