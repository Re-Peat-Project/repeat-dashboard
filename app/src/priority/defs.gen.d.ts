// Types for the generated definitions module (defs.gen.js).
type Fmt = (v: number, nd?: number) => string
export function makeDefs(f: { t: (s: string, v?: Record<string, unknown>) => string; fx: Fmt; fmt: Fmt }): {
  TYPE_ORDER: string[]
  TYPE_LABEL: Record<string, string>
  TYPE_NOTE: Record<string, string>
  TYPE_RULE: Record<string, string>
  DIMS: [string, string, string][]
  DIM_TIP: Record<string, string>
  SCORE_NOTE: string
  IND: Record<string, [string, string, (v: number) => string]>
  IV_ORDER: string[]
  IV_SHORT: Record<string, string>
  IV_NOTE: Record<string, string>
  IV_COL: Record<string, string>
  FIELD_SRC: Record<string, [string, string]>
  pc: (v: number, d?: number) => string
}
