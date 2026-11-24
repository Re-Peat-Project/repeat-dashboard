import { line } from 'd3-shape'

export function TableSparkline({ values, label, color }: { values: (number | null)[]; label: string; color: string }) {
  const width = 76
  const height = 18
  const max = Math.max(1, ...values.map((value) => value ?? 0))
  const x = (i: number) => 2 + i * (width - 4) / Math.max(1, values.length - 1)
  const y = (value: number) => height - 2 - value * (height - 4) / max
  const trend = line<number | null>().defined((value) => value != null).x((_, i) => x(i)).y((value) => y(value!))(values)
  const last = values.findLastIndex((value) => value != null)
  if (last < 0) return null

  return <svg role="img" aria-label={label} className="ml-auto block h-[18px] w-[76px]" viewBox={`0 0 ${width} ${height}`} style={{ color }}>
    <title>{label}</title>
    <path d={trend ?? undefined} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
    <circle cx={x(last)} cy={y(values[last]!)} r={1.7} fill="currentColor" />
  </svg>
}

export function TableValueBar({ value, max, color }: { value: number | null; max: number; color: string }) {
  if (value == null || !Number.isFinite(value)) return null
  const amount = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  return <span aria-hidden="true" className="mt-0.5 mb-0.5 block h-[3px] overflow-hidden rounded-full bg-border">
    <span className="block h-full rounded-full" style={{ width: `${100 * amount}%`, backgroundColor: color }} />
  </span>
}
