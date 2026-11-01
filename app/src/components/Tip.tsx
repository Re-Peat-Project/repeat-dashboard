import { useEffect, useRef, useState } from 'react'

/** Hover help: any element with a data-tip attribute shows its text next to the pointer (the national dashboard's help labels). One instance, mounted once. */
export function TipLayer() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null)
  const el = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const find = (e: Event) => (e.target as HTMLElement | null)?.closest?.('[data-tip]') as HTMLElement | null
    const move = (e: MouseEvent) => { const n = find(e); const text = n?.dataset.tip; setTip(text ? { text, x: e.clientX, y: e.clientY } : null) }
    const hide = () => setTip(null)
    document.addEventListener('mousemove', move); document.addEventListener('mouseleave', hide); document.addEventListener('scroll', hide, true)
    return () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseleave', hide); document.removeEventListener('scroll', hide, true) }
  }, [])
  if (!tip) return null
  const w = el.current?.offsetWidth ?? 280
  const left = Math.min(tip.x + 14, window.innerWidth - w - 8), top = tip.y + 18 > window.innerHeight - 90 ? tip.y - 60 : tip.y + 18
  return <div ref={el} role="tooltip" className="card pointer-events-none fixed z-50 max-w-xs whitespace-pre-line px-2 py-1 text-xs shadow-lg" style={{ left, top, background: 'var(--surface)' }}>{tip.text}</div>
}
