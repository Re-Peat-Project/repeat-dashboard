import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

export type SegItem<V extends string> = { v: V; label: string; tip?: string; disabled?: boolean }
/** Compact segmented control: one value (or several with `multi`). Hover help through data-tip. */
export function Seg<V extends string>({ items, value, onChange, tip, className, multi }: {
  items: SegItem<V>[]; value: V | V[]; onChange: (v: any) => void; tip?: string; className?: string; multi?: boolean
}) {
  const item = (it: SegItem<V>) => (
    <ToggleGroupItem key={it.v} value={it.v} disabled={it.disabled} data-tip={it.tip}
      className="h-7 px-2.5 text-xs font-normal whitespace-nowrap data-[state=on]:bg-foreground data-[state=on]:text-background">{it.label}</ToggleGroupItem>
  )
  return multi
    ? <ToggleGroup type="multiple" variant="outline" size="sm" value={value as string[]} onValueChange={onChange} data-tip={tip} className={cn('h-7', className)}>{items.map(item)}</ToggleGroup>
    : <ToggleGroup type="single" variant="outline" size="sm" value={value as string} onValueChange={(v) => v && onChange(v)} data-tip={tip} className={cn('h-7', className)}>{items.map(item)}</ToggleGroup>
}
