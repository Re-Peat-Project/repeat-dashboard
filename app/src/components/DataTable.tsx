import { useMemo, useState } from 'react'
import { useT } from '../lib/i18n'

export type Col<R> = { key: string; label: string; unit?: string; fmt?: (v: any, r: R) => string; align?: 'left' | 'right' }

/** Sortable, searchable table; the unit is shown in the header. */
export function DataTable<R extends Record<string, any>>({ rows, cols, searchKeys, onRow, selectedKey, rowKey, limit = 300, initialSort, placeholder }: {
  rows: R[]; cols: Col<R>[]; searchKeys: string[]; onRow?: (r: R) => void; selectedKey?: string | null; rowKey: string; limit?: number; initialSort?: { key: string; dir: 1 | -1 }; placeholder?: string
}) {
  const t = useT()
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>(initialSort ?? { key: cols[0].key, dir: 1 })
  const shown = useMemo(() => {
    const ql = q.trim().toLowerCase()
    const f = ql ? rows.filter((r) => searchKeys.some((k) => String(r[k] ?? '').toLowerCase().includes(ql))) : rows
    return [...f].sort((a, b) => {
      const x = a[sort.key], y = b[sort.key]
      if (x == null || Number.isNaN(x)) return 1
      if (y == null || Number.isNaN(y)) return -1
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir
    })
  }, [rows, q, sort, searchKeys])
  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder ?? t('Search KHG')} className="card mb-2 w-full px-2 py-1" />
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0" style={{ background: 'var(--surface)' }}><tr>
            {cols.map((c) => <th key={c.key} className={`cursor-pointer whitespace-nowrap px-2 py-1 ${c.align === 'right' ? 'text-right' : 'text-left'}`}
              onClick={() => setSort({ key: c.key, dir: sort.key === c.key ? ((-sort.dir) as 1 | -1) : 1 })}>
              {c.label}{c.unit ? <span className="muted"> ({c.unit})</span> : ''}{sort.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
            </th>)}
          </tr></thead>
          <tbody>
            {shown.slice(0, limit).map((r) => (
              <tr key={r[rowKey]} onClick={() => onRow?.(r)} className="cursor-pointer hover:opacity-80"
                style={{ background: selectedKey === r[rowKey] ? 'var(--seq-100)' : undefined, color: selectedKey === r[rowKey] ? '#0b0b0b' : undefined }}>
                {cols.map((c) => <td key={c.key} className={`px-2 py-0.5 ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>{c.fmt ? c.fmt(r[c.key], r) : r[c.key] ?? ''}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="muted mt-1 text-xs">{shown.length} / {rows.length}</div>
    </div>
  )
}
