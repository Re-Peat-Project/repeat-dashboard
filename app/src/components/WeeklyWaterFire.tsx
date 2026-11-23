import { LineChart } from './LineChart'
import { useT } from '../lib/i18n'
import { useStore } from '../lib/store'
import { weekEnd, type Sensor, type WeeklyHotspots, type WeekStat } from '../lib/waterTable'

const DAY_MS = 86400000

export function WeeklyWaterFire({ data, error, sensor, setSensor, regionName, weeks, counts, water, current, setWeek }: {
  data: WeeklyHotspots[Sensor] | undefined; error: boolean; sensor: Sensor; setSensor: (sensor: Sensor) => void
  regionName: string; weeks: string[]; counts: (number | null)[]; water: (WeekStat | null)[]; current: number; setWeek: (week: number) => void
}) {
  const t = useT()
  const lang = useStore((s) => s.lang)
  const numbers = new Intl.NumberFormat(lang, { maximumFractionDigits: 0 })
  const midweek = weeks.map((week) => new Date(Date.parse(week) + 3 * DAY_MS))
  const selectedRange: [Date, Date] = [new Date(weeks[current]), new Date(weekEnd(weeks[current]))]
  const xDomain: [Date, Date] = [new Date(weeks[0]), new Date(weekEnd(weeks[weeks.length - 1]))]
  const pickWeek = (date: Date) => setWeek(Math.max(0, Math.min(weeks.length - 1, Math.round((+date - +midweek[0]) / (7 * DAY_MS)))))
  const dates = new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const formatWeek = (date: Date) => `${dates.format(+date - 3 * DAY_MS)} – ${dates.format(+date + 3 * DAY_MS)}`
  return (
    <section className="card min-w-0 space-y-3 p-3" aria-labelledby="weekly-fire-water-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h3 id="weekly-fire-water-title" className="font-semibold">{t('Weekly hotspots and water levels')}</h3><p className="muted text-xs">{regionName}</p></div>
        <label className="flex items-center gap-2 text-xs">
          {t('Hotspot sensor')}
          <select value={sensor} onChange={(e) => setSensor(e.target.value as Sensor)} className="btn">
            <option value="viirs">VIIRS S-NPP</option>
            <option value="modis">MODIS FIRMS</option>
          </select>
        </label>
      </div>
      <p className="muted text-xs">{t('Both charts use the same week and region. Click either chart to change the week. The station type filter applies to water levels.')}</p>
      <p className="muted text-xs">{t('Counts include medium- and high-confidence land detections and exclude likely static sources. A gap means a full week of data is unavailable.')}</p>
      {error && <p role="status" className="muted text-sm">{t('Weekly hotspot counts are unavailable.')}</p>}
      {!error && !data && <p role="status" className="muted text-sm">{t('Loading weekly hotspot counts…')}</p>}
      {data && <LineChart title={t('Hotspot detections per week')} yLabel={t('Detections')} height={150} zeroBase area={false}
        discrete sync selectedRange={selectedRange} xDomain={xDomain} onDateSelect={pickWeek} formatDate={formatWeek} fmt={(v) => numbers.format(v)}
        series={[{ name: sensor === 'viirs' ? 'VIIRS S-NPP' : 'MODIS FIRMS', color: 'var(--s1)', points: counts.map((n, i) => ({ x: midweek[i], y: n ?? NaN })) }]} />}
      <LineChart title={t('Median water level per week')} yLabel="cm" height={150} discrete sync selectedRange={selectedRange} xDomain={xDomain} onDateSelect={pickWeek}
        formatDate={formatWeek} fmt={(v) => numbers.format(v)} series={[{ name: t('Median level'), color: 'var(--s2)', points: weeks.map((_, i) => ({ x: midweek[i], y: water[i]?.level ?? NaN })) }]} />
    </section>
  )
}
