import { asyncBufferFromUrl, parquetReadObjects } from 'hyparquet'
import { compressors } from 'hyparquet-compressors'

export const BASE = import.meta.env.BASE_URL
export const dataUrl = (path: string) => new URL(`${BASE}data/${path}`, location.href).href

const tables = new Map<string, Promise<Record<string, any>[]>>()

/** Read a Parquet table once and cache it. BigInt columns are converted to numbers. */
export function readTable<T = Record<string, any>>(path: string): Promise<T[]> {
  if (!tables.has(path)) {
    tables.set(path, (async () => {
      const file = await asyncBufferFromUrl({ url: dataUrl(path) })
      const rows = await parquetReadObjects({ file, compressors })
      for (const r of rows) for (const k in r) if (typeof r[k] === 'bigint') r[k] = Number(r[k])
      return rows
    })())
  }
  return tables.get(path) as Promise<T[]>
}

const jsons = new Map<string, Promise<any>>()
export function readJson<T = any>(path: string): Promise<T> {
  if (!jsons.has(path)) jsons.set(path, fetch(dataUrl(path)).then((r) => { if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.json() }))
  return jsons.get(path) as Promise<T>
}

export type CatalogEntry = { code: string; khg_id: string; name: string; province: string | null; bounds: [number, number, number, number]; dems: string[]; groundwater: string[] }
export type Manifest = {
  code: string; name: string; province: string | null; bounds: [number, number, number, number]; dems: string[]; dem_labels?: Record<string, { en: string; id: string }>
  vector: { id: string; group: string; label: { en: string; id: string }; source: string; dem: string | null; file: string; features?: number; mb: number; geometry?: string }[]
  raster: { id: string; dem: string; file: string; mb: number; res_m: number; cover_pct?: number; native_zoom: number; max_zoom: number; zoom_capped: boolean; z_range: [number, number]; source: string; note?: string }[]
  tables: { id: string; dem: string | null; file: string }[]
  points: { id: string; file: string; rows?: number; undated?: number }[]
  groundwater: { dem: string; run: string; stage: string; res_m: number; season: string; peat_table: string; managed_target: string; rain: string; et: string; files: { id: string; file: string }[]; rasters: { id: string; file: string; range: [number, number]; label: { en: string; id: string } }[]; station_scores?: any }[]
  missing: { id: string; dem?: string | null; reason: string }[]
}
export const loadCatalog = () => readJson<CatalogEntry[]>('catalog.json')
export const loadManifest = (code: string) => readJson<Manifest>(`khg/${code}/manifest.json`)
