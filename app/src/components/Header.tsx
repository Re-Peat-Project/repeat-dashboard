import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Moon, Search, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useT } from '@/lib/i18n'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { loadPriority, type PD } from '@/priority/core'
import { usePrio } from '@/priority/state'

const tab = 'relative px-1 py-2 text-center text-[11px] leading-tight transition-colors sm:px-3 sm:text-sm md:whitespace-nowrap'
const on = 'font-semibold text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded after:bg-foreground'
const off = 'text-muted-foreground hover:text-foreground'

export function Header() {
  const t = useT()
  const nav = useNavigate()
  const loc = useLocation()
  const { lang, setLang, theme, setTheme } = useStore()
  const [P, setP] = useState<PD | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => { loadPriority().then(setP).catch(() => {}) }, [])
  const inProfile = loc.pathname.startsWith('/khg/')
  // the tab opens the KHG viewed last, else the most urgent KHG of the 337
  const last = usePrio((s) => s.sel)
  const profileCode = last ?? (P ? P.id[P.ru337.findIndex((r) => r === 1)] ?? P.id[0] : '16.02.01')
  const link = ({ isActive }: { isActive: boolean }) => cn(tab, isActive ? on : off)
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-[var(--surface)]/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-x-2 px-3 md:px-5">
        <NavLink to="/" className="mr-3 py-2 text-[15px] font-semibold tracking-tight">RE-PEAT</NavLink>
        <nav className="order-last grid w-full grid-cols-5 items-end md:order-none md:flex md:w-auto" aria-label={t('Sections')}>
          <NavLink to="/" end className={link}>{t('National profile')}</NavLink>
          <NavLink to="/priority" className={link}>{t('KHG prioritisation')}</NavLink>
          <NavLink to={`/khg/${profileCode}`} className={() => cn(tab, inProfile ? on : off)}>{t('KHG profiles')}</NavLink>
          <NavLink to="/table" className={link}>{t('KHG table')}</NavLink>
          <NavLink to="/about" className={link}>{t('About')}</NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-2 py-1.5">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 justify-start font-normal text-muted-foreground sm:w-56"><Search className="size-3.5" />{t('Go to a KHG')}</Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 max-w-[var(--radix-popover-content-available-width)] p-0" align="end">
              <Command filter={(v, s) => (v.toLowerCase().includes(s.toLowerCase()) ? 1 : 0)}>
                <CommandInput placeholder={t('KHG name, code or province')} />
                <CommandList>
                  <CommandEmpty>{t('No KHG found')}</CommandEmpty>
                  <CommandGroup>
                    {P ? P.id.map((c, j) => (
                      <CommandItem key={c} value={`${P.name[j]} ${c} ${P.prov[j]}`} onSelect={() => { setOpen(false); nav(`/khg/${c}`) }}>
                        <span className="truncate">{P.name[j]}</span><span className="ml-auto shrink-0 text-xs text-muted-foreground">{P.type[j] ?? ''}</span>
                      </CommandItem>
                    )) : null}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <ToggleGroup type="single" variant="outline" size="sm" value={lang} onValueChange={(v) => v && setLang(v as 'en' | 'id')} aria-label={t('Language')}>
            <ToggleGroupItem value="en" className="h-8 px-2.5 text-xs data-[state=on]:bg-foreground data-[state=on]:text-background">EN</ToggleGroupItem>
            <ToggleGroupItem value="id" className="h-8 px-2.5 text-xs data-[state=on]:bg-foreground data-[state=on]:text-background">ID</ToggleGroupItem>
          </ToggleGroup>
          <Button variant="outline" size="icon" className="size-8" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? t('Light') : t('Dark')} data-tip={theme === 'dark' ? t('Light') : t('Dark')}>
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
        </div>
      </div>
    </header>
  )
}
