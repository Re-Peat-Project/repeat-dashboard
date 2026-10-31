/** Shape of national/scoring.json: the KHG list (names, province, island, area, peat) the pages read. */
export type Param = { id: string; group: 'hist' | 'now' | 'canal'; label: string; unit: string }
export type ScoringData = {
  meta: { weights: Record<string, number>; min_area: number; min_peat: number; period_now: string; validation?: any }
  params: Param[]
  khg: {
    id: string[]; name: string[]; prov: string[]; island: string[]; area: number[]; peat: (number | null)[]; conf: string[]; team: string[]
    ref_rank: (number | null)[]; has: number[]; v: (number | null)[][]; n1h?: (number | null)[]
  }
}
