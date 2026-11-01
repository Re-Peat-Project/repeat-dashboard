import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { loadCatalog, type CatalogEntry } from '../lib/data'
import { useT } from '../lib/i18n'
import { useStore } from '../lib/store'

export function Header() {
  const t = useT()
  const nav = useNavigate()
  const { lang, setLang, theme, setTheme, basemap, setBasemap } = useStore()
  const [cat, setCat] = useState<CatalogEntry[]>([])
  useEffect(() => { loadCatalog().then(setCat) }, [])
  const link = ({ isActive }: { isActive: boolean }) => `px-2 py-1 rounded ${isActive ? 'font-semibold' : 'muted'}`
  return (
    <header className="card mx-3 mt-3 flex flex-wrap items-center gap-3 px-3 py-2">
      <div className="font-semibold">RE-PEAT</div>
      <NavLink to="/" end className={link}>{t('Fire situation')}</NavLink>
      <NavLink to="/compare" className={link}>{t('Compare KHG')}</NavLink>
      <NavLink to="/investigation" className={link}>{t('Investigation')}</NavLink>
      <select className="card px-2 py-1" value="" onChange={(e) => e.target.value && nav(`/khg/${e.target.value}`)} aria-label={t('KHG profile')}>
        <option value="">{t('KHG profile')}: {t('Choose a KHG')}</option>
        {cat.map((c) => <option key={c.code} value={c.code}>{c.name.replace(/^KHG /, '')} ({c.province})</option>)}
      </select>
      <div className="ml-auto flex items-center gap-2">
        <span className="muted text-xs">{t('Basemap')}</span>
        <button className="btn" aria-pressed={basemap === 'satellite'} onClick={() => setBasemap('satellite')}>{t('Satellite')}</button>
        <button className="btn" aria-pressed={basemap === 'light'} onClick={() => setBasemap('light')}>{t('Map')}</button>
        <button className="btn" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
        <button className="btn" aria-pressed={lang === 'id'} onClick={() => setLang('id')}>ID</button>
        <button className="btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? t('Light') : t('Dark')}</button>
      </div>
    </header>
  )
}
