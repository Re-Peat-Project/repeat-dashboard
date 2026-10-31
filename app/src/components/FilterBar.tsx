import type { ReactNode } from 'react'
import { useT } from '../lib/i18n'
import { useStore } from '../lib/store'

/** One or two thumbs on one track. `lo` and `hi` are the same value for a single slider. */
function Slider({ min, max, lo, hi, onChange, label, ticks }: { min: number; max: number; lo: number; hi: number; onChange: (lo: number, hi: number) => void; label: [string, string]; ticks?: [number, string][] }) {
  const pct = (v: number) => `calc(6px + (100% - 12px) * ${(v - min) / Math.max(1, max - min)})`
  const range = lo !== hi || label[0] !== label[1]
  return (
    <div className="min-w-[200px] flex-1" style={{ maxWidth: 360 }}>
      <div className="dr">
        <div className="tr" />
        <div className="fill" style={{ left: pct(range ? lo : min), width: `calc(${pct(range ? hi : lo)} - ${pct(range ? lo : min)})` }} />
        {range && <input type="range" min={min} max={max} step={1} value={lo} aria-label={label[0]} onChange={(e) => onChange(Math.min(+e.target.value, hi), hi)} style={{ zIndex: lo >= hi - 1 && lo > min ? 3 : 2 }} />}
        <input type="range" min={min} max={max} step={1} value={hi} aria-label={label[1]} onChange={(e) => onChange(range ? lo : +e.target.value, range ? Math.max(+e.target.value, lo) : +e.target.value)} style={{ zIndex: 2 }} />
      </div>
      {ticks && <div className="muted relative h-3 text-[10px]">{ticks.map(([v, l]) => <span key={v} className="absolute -translate-x-1/2" style={{ left: pct(v) }}>{l}</span>)}</div>}
    </div>
  )
}

/** Fire filter shared by the national page and the KHG workspace: year and month sliders, confidence, peat. */
export function FilterBar({ years, count, children }: { years: number[]; count?: number | null; children?: ReactNode }) {
  const t = useT()
  const lang = useStore((s) => s.lang)
  const f = useStore((s) => s.fire)
  const set = useStore((s) => s.setFire)
  const months = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(lang, { month: 'short' }).format(new Date(2026, i, 1)))
  const y0 = Math.min(...years), y1 = Math.max(...years)
  const yearTicks: [number, string][] = [...new Set([y0, 2015, 2020, y1].filter((y) => y >= y0 && y <= y1 && (y === y1 || y1 - y > 2)))].map((y) => [y, String(y)])
  return (
    <div className="card flex flex-wrap items-start gap-x-5 gap-y-2 px-3 py-2 text-sm" role="group" aria-label={t('Fire filter')}>
      <div className="min-w-[200px] flex-1" style={{ maxWidth: 340 }}>
        <div className="flex items-baseline gap-2"><span className="muted text-xs">{t('Year')}</span><b>{f.year}</b><span className="muted text-xs" title={t('Detections are satellite observations, not individual fire events.')}>VIIRS ⓘ</span></div>
        <Slider min={y0} max={y1} lo={f.year} hi={f.year} label={[t('Year'), t('Year')]} ticks={yearTicks} onChange={(_, hi) => set({ year: hi })} />
      </div>
      <div className="min-w-[200px] flex-1" style={{ maxWidth: 340 }}>
        <div className="flex items-baseline gap-2"><span className="muted text-xs">{t('Months')}</span><b>{months[f.start - 1]}{f.end !== f.start ? ` – ${months[f.end - 1]}` : ''}</b>
          {(f.start !== 1 || f.end !== 12) && <button className="btn text-[11px]" onClick={() => set({ start: 1, end: 12 })}>{t('Full year')}</button>}</div>
        <Slider min={1} max={12} lo={f.start} hi={f.end} label={[t('From'), t('To')]} ticks={[[1, months[0]], [4, months[3]], [7, months[6]], [10, months[9]], [12, months[11]]]} onChange={(lo, hi) => set({ start: lo, end: hi })} />
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-3">
        <div className="flex gap-1">
          <button className="btn text-xs" aria-pressed={f.high} onClick={() => set({ high: true })}>{t('High confidence')}</button>
          <button className="btn text-xs" aria-pressed={!f.high} onClick={() => set({ high: false })}>{t('Medium + high')}</button>
        </div>
        <div className="flex gap-1">
          <button className="btn text-xs" aria-pressed={f.peat} onClick={() => set({ peat: true })}>{t('Hotspots on peat')}</button>
          <button className="btn text-xs" aria-pressed={!f.peat} onClick={() => set({ peat: false })}>{t('All hotspots')}</button>
        </div>
        {children}
      </div>
      {count != null && <span className="ml-auto pt-2 font-semibold">{count.toLocaleString()} <span className="muted text-xs font-normal">{t('hotspot detections')}</span></span>}
    </div>
  )
}
