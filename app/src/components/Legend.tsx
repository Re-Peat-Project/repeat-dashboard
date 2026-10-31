import type { ReactNode } from 'react'

export const TERRAIN = ['rgb(36,86,120)', 'rgb(62,150,140)', 'rgb(150,190,120)', 'rgb(226,214,140)', 'rgb(196,150,96)', 'rgb(140,96,70)']   // dem_tiles.RAMP
export const FIELD = ['rgb(235,244,250)', 'rgb(173,208,232)', 'rgb(104,164,208)', 'rgb(52,117,175)', 'rgb(24,72,128)', 'rgb(8,35,82)']   // dem_tiles.FIELD_RAMP
export const SEQ = ['#cde2fb', '#86b6ef', '#3987e5', '#1c5cab', '#0d366b']

/** Continuous colour bar with the value range and unit: the key of a raster or a colour-by layer. */
export function RampLegend({ title, stops, lo, hi, fmt = (v) => String(Math.round(v * 10) / 10), note }: { title: string; stops: string[]; lo: number; hi: number; fmt?: (v: number) => string; note?: string }) {
  return (
    <div className="mt-1">
      <div className="text-xs font-medium">{title}</div>
      <div className="h-2 rounded" style={{ background: `linear-gradient(to right, ${stops.join(',')})`, minWidth: 150 }} role="img" aria-label={`${title}: ${fmt(lo)} – ${fmt(hi)}`} />
      <div className="muted flex justify-between text-[11px]"><span>{fmt(lo)}</span><span>{fmt((lo + hi) / 2)}</span><span>{fmt(hi)}</span></div>
      {note && <div className="muted text-[11px]">{note}</div>}
    </div>
  )
}

export const Swatch = ({ color, round, opacity = 1, children }: { color: string; round?: boolean; opacity?: number; children: ReactNode }) => (
  <div className="flex items-center gap-1.5 text-xs"><i className="chip" style={{ background: color, opacity, borderRadius: round ? '50%' : 2, marginRight: 0 }} />{children}</div>
)

/** Floating legend card over a map. */
export const LegendCard = ({ children }: { children: ReactNode }) => (
  <div className="card absolute bottom-6 left-3 flex max-h-[60%] max-w-[230px] flex-col gap-1 overflow-auto p-2" style={{ background: 'color-mix(in srgb, var(--surface) 92%, transparent)' }}>{children}</div>
)
