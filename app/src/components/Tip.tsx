import { useEffect, useRef, useState } from 'react'

const HTML = /<(b|br|span|small|i)\b/
/** Hover help: any element with a data-tip attribute shows its text next to the pointer. Tips with markup (<b>, <br>, <span>) are
 * built by the prioritisation pages from escaped values and render as HTML. One instance, mounted once. */
export function TipLayer() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null)
  const el = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const find = (e: Event) => (e.target as HTMLElement | null)?.closest?.('[data-tip]') as HTMLElement | null
    const move = (e: MouseEvent) => { const n = find(e); const text = n?.dataset.tip; setTip(text ? { text, x: e.clientX, y: e.clientY } : null) }
    const focus = (e: FocusEvent) => {
      const n = find(e), rect = n?.getBoundingClientRect(), text = n?.dataset.tip
      if (rect && text) setTip({ text, x: rect.right, y: rect.top })
    }
    const hide = () => setTip(null)
    document.addEventListener('mousemove', move); document.addEventListener('mouseleave', hide); document.addEventListener('scroll', hide, true)
    document.addEventListener('focusin', focus); document.addEventListener('focusout', hide)
    return () => {
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseleave', hide); document.removeEventListener('scroll', hide, true)
      document.removeEventListener('focusin', focus); document.removeEventListener('focusout', hide)
    }
  }, [])
  if (!tip) return null
  const w = el.current?.offsetWidth ?? 280, h = el.current?.offsetHeight ?? 60
  const left = tip.x + 14 + w > window.innerWidth - 8 ? Math.max(8, tip.x - w - 14) : tip.x + 14
  const top = tip.y + 18 + h > window.innerHeight - 8 ? Math.max(8, tip.y - h - 14) : tip.y + 18
  const cls = 'card tiph pointer-events-none fixed z-[60] max-w-xs px-2.5 py-1.5 text-xs leading-snug shadow-lg'
  return HTML.test(tip.text)
    ? <div ref={el} role="tooltip" className={cls} style={{ left, top, background: 'var(--surface)' }} dangerouslySetInnerHTML={{ __html: tip.text }} />
    : <div ref={el} role="tooltip" className={cls + ' whitespace-pre-line'} style={{ left, top, background: 'var(--surface)' }}>{tip.text}</div>
}
