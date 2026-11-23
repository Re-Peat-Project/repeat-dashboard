import { lazy, Suspense, useEffect } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { ArrowDown } from 'lucide-react'
import { useT } from '@/lib/i18n'
import National from './National'
import Summary from './Summary'
const WaterTableProfile = lazy(() => import('./WaterTableProfile'))

export default function NationalProfile() {
  const t = useT()
  const [q] = useSearchParams()
  const { hash } = useLocation()
  const water = q.get('v') === 'water'
  const showStatus = !water && (hash === '#fire-by-land-status' || q.get('v') === 'status')
  useEffect(() => {
    if (showStatus) document.getElementById('fire-by-land-status')?.scrollIntoView()
    else window.scrollTo(0, 0)
  }, [showStatus, hash, water])

  const tabStyle = (active: boolean) => `border-b-2 px-3 py-2 text-sm ${active ? 'border-foreground font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground'}`

  return (
    <main className="mx-auto max-w-[1680px] space-y-6 px-3 pt-4 pb-10 md:px-5">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border">
        <h1 className="text-2xl font-semibold tracking-tight">{t('National profile')}</h1>
        {!water && <Link to="/#fire-by-land-status" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          onClick={() => { if (showStatus) document.getElementById('fire-by-land-status')?.scrollIntoView() }}>
          {t('Fire by land status')}<ArrowDown className="size-4" aria-hidden />
        </Link>}
        <nav className="flex w-full gap-1" aria-label={t('National profile views')}>
          <Link to="/" className={tabStyle(!water)} aria-current={!water ? 'page' : undefined}>{t('Fire')}</Link>
          <Link to="/?v=water" className={tabStyle(water)} aria-current={water ? 'page' : undefined}>{t('Water Table Profile')}</Link>
        </nav>
      </header>
      {water ? <Suspense fallback={<p className="muted">{t('Loading SiTMAT observations…')}</p>}><WaterTableProfile /></Suspense> : <>
      <National />
      <section id="fire-by-land-status" className="min-h-screen scroll-mt-32 space-y-3 border-t border-border pt-5 lg:scroll-mt-16" aria-labelledby="land-status-title">
        <h2 id="land-status-title" className="text-xl font-semibold tracking-tight">{t('Fire by land status')}</h2>
        <Summary />
      </section>
      </>}
    </main>
  )
}
