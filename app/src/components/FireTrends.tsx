import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { LineChart, type Series } from './LineChart'
import { Seg } from './Seg'
import { useT } from '../lib/i18n'
import { monthDate, type FireFilter } from '../lib/investigation'
import { useStore } from '../lib/store'

type MonthlyFire = { kind: string; ym: number; conf: string; peat: boolean; n: number; khg_id?: string }

export function FireTrends({ data, khgData, khg, scope, fire, kind, sensorLabel, cutoff, viirsCutoff, onMonth }: {
  data: MonthlyFire[]; khgData: MonthlyFire[]; khg: string | null; scope: string; fire: FireFilter
  kind: string; sensorLabel: string; cutoff?: string | null; viirsCutoff?: string | null; onMonth: (month: number) => void
}) {
  const t = useT()
  const { lang } = useStore()
  const [view, setView] = useState<'monthly' | 'seasons'>('monthly')
  const [reference, setReference] = useState(2015)
  const seasons = view === 'seasons'
  const seriesKind = seasons ? 'viirs' : kind
  const calendar = useMemo(() => new Set(data.filter((r) => r.kind === seriesKind).map((r) => r.ym)), [data, seriesKind])
  const totals = useMemo(() => {
    const counts = new Map<number, [number, number]>()
    for (const r of khg ? khgData : data) {
      if (r.kind !== seriesKind || (khg && r.khg_id !== khg) || (fire.peat && !r.peat)) continue
      if (r.conf !== 'high' && r.conf !== 'medium') continue
      const values = counts.get(r.ym) ?? [0, 0]
      values[r.conf === 'high' ? 0 : 1] += r.n
      counts.set(r.ym, values)
    }
    return counts
  }, [khg, khgData, data, fire.peat, seriesKind])

  const month = new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-GB', { month: 'short' })
  const date = new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  const shownCutoff = seasons ? viirsCutoff : cutoff
  const cutoffYear = shownCutoff ? Number(shownCutoff.slice(0, 4)) : null
  const mappedMonths = [...calendar].filter((ym) => Math.floor(ym / 100) === fire.year).map((ym) => ym % 100)
  const lastMonth = Math.max(1, ...mappedMonths)
  const cutoffMonth = shownCutoff ? Number(shownCutoff.slice(5, 7)) : 0
  const finalDay = cutoffYear == null ? 0 : new Date(Date.UTC(cutoffYear, cutoffMonth, 0)).getUTCDate()
  const comparisonMonths = cutoffMonth - (shownCutoff && Number(shownCutoff.slice(8, 10)) < finalDay ? 1 : 0)
  const comparisonEnd = Math.min(comparisonMonths, lastMonth)
  const compareEndLabel = comparisonEnd > 0 ? month.format(monthDate(fire.year * 100 + comparisonEnd)) : ''
  const completeYears = seasons ? [...new Set([...calendar].map((ym) => Math.floor(ym / 100)))].filter((year) =>
    year !== cutoffYear && Array.from({ length: 12 }, (_, i) => calendar.has(year * 100 + i + 1)).every(Boolean)).sort((a, b) => a - b) : []
  const referenceChoices = completeYears.filter((year) => year !== fire.year)
  const referenceYear = referenceChoices.includes(reference) ? reference : referenceChoices[0]
  const meanYears = completeYears.filter((year) => year >= 2015 && year < fire.year && year !== cutoffYear)
  const monthValues = (year: number, end: number, value: (ym: number) => number) => Array.from({ length: end }, (_, i) => {
    const ym = year * 100 + i + 1
    return { x: monthDate(fire.year * 100 + i + 1), y: calendar.has(ym) ? value(ym) : NaN }
  })
  const combined = (ym: number) => {
    const counts = totals.get(ym) ?? [0, 0]
    return counts[0] + (fire.high ? 0 : counts[1])
  }
  const series: Series[] = seasons ? [
    { name: String(fire.year), color: 'var(--s2)', points: monthValues(fire.year, comparisonEnd, combined) },
    ...(referenceYear ? [{ name: `${referenceYear} ${t('(full year)')}`, color: 'var(--s7)', points: monthValues(referenceYear, 12, combined) }] : []),
    ...(meanYears.length ? [{ name: `${t('mean')} ${meanYears[0]}–${meanYears[meanYears.length - 1]}`, color: 'var(--muted)', dash: '4 3',
      points: monthValues(fire.year, comparisonEnd, (ym) => meanYears.reduce((sum, year) => sum + combined(year * 100 + ym % 100), 0) / meanYears.length) }] : []),
  ] : (fire.high ? [0] : [0, 1]).map((i) => ({
    name: t(i === 0 ? 'High confidence' : 'medium confidence'), color: i === 0 ? 'var(--s8)' : 'var(--s7)',
    points: monthValues(fire.year, lastMonth, (ym) => totals.get(ym)?.[i] ?? 0),
  }))
  const selectedRange: [Date, Date] | undefined = seasons && !comparisonEnd ? undefined :
    [new Date(fire.year, seasons ? 0 : fire.start - 1, 1), new Date(fire.year, seasons ? comparisonEnd : fire.end, 0, 23, 59, 59)]
  const xDomain: [Date, Date] = [new Date(fire.year, 0, 1), new Date(fire.year, seasons ? 12 : lastMonth, 0, 23, 59, 59)]
  const summary = [scope, seasons ? 'VIIRS S-NPP' : sensorLabel, String(fire.year), t(fire.peat ? 'Hotspots on peat' : 'All hotspots'), t(fire.high ? 'High confidence' : 'Medium + high')]
  if (shownCutoff && cutoffYear === fire.year) summary.push(t('Data available to {d}').replace('{d}', date.format(new Date(shownCutoff))))

  return (
    <section className="min-w-0 space-y-2" aria-labelledby="fire-trends-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="fire-trends-title" className="text-base font-semibold">{t('Fire trends')}</h3>
        <Link to={khg ? `/?v=water&khg=${encodeURIComponent(khg)}` : '/?v=water'} className="text-xs underline underline-offset-2">{t('View water levels and hotspots')}</Link>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Seg value={view} onChange={setView} items={[{ v: 'monthly', label: t('Monthly activity') }, { v: 'seasons', label: t('Compare seasons') }]} />
        {seasons && referenceYear && <label className="flex items-center gap-2 text-xs">{t('Reference year')}
          <select className="btn" value={referenceYear} onChange={(e) => setReference(Number(e.target.value))}>
            {referenceChoices.map((year) => <option value={year} key={year}>{year}</option>)}
          </select>
        </label>}
      </div>
      <p className="muted text-xs" aria-live="polite">{summary.join(' · ')}</p>
      <LineChart title={seasons ? t('VIIRS seasonal comparison') : t('Hotspots per month')} yLabel={t('Detections')} series={series} xDomain={xDomain}
        selectedRange={selectedRange} monthOfYear formatDate={(d) => month.format(d)} discrete zeroBase area={false}
        fmt={(v) => Math.round(v).toLocaleString(lang)} onDateSelect={seasons ? undefined : (d) => onMonth(d.getMonth() + 1)}
        note={seasons
          ? compareEndLabel ? t('The shaded months through {month} are comparable. The reference year also shows the rest of its season.').replace('{month}', compareEndLabel) : t('No complete VIIRS months available for this comparison.')
          : t('Shading marks the months shown on the map. Click the chart to select a month. The monthly tally can include likely static sources.')}
      />
    </section>
  )
}
