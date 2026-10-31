import { create } from 'zustand'
import type { FireFilter } from './investigation'

type Lang = 'en' | 'id'
type Theme = 'light' | 'dark'
type Basemap = 'satellite' | 'light'
const read = <T extends string>(k: string, d: T): T => { try { return (localStorage.getItem(k) as T) || d } catch { return d } }
const write = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private window */ } }

type S = {
  fire: FireFilter; setFire: (p: Partial<FireFilter>) => void
  lang: Lang; theme: Theme; basemap: Basemap; setBasemap: (b: Basemap) => void; selected: string | null; hover: string | null; hoverDate: Date | null
  setLang: (l: Lang) => void; setHover: (id: string | null) => void; setHoverDate: (d: Date | null) => void; setTheme: (t: Theme) => void; select: (id: string | null) => void
}
export const useStore = create<S>((set) => ({
  fire: { year: 2026, start: 1, end: 12, high: true, peat: true }, setFire: (p) => set((s) => ({ fire: { ...s.fire, ...p } })),
  basemap: read<Basemap>('basemap', 'light'), setBasemap: (basemap) => { write('basemap', basemap); set({ basemap }) },
  lang: read<Lang>('lang', 'en'), theme: read<Theme>('theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'), selected: null, hover: null, hoverDate: null,
  setHoverDate: (hoverDate) => set({ hoverDate }),
  setHover: (hover) => set({ hover }),
  setLang: (lang) => { write('lang', lang); set({ lang }) },
  setTheme: (theme) => { write('theme', theme); document.documentElement.dataset.theme = theme; set({ theme }) },
  select: (selected) => set({ selected }),
}))
document.documentElement.dataset.theme = useStore.getState().theme
