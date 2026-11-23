import { lazy, Suspense, useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Header } from './components/Header'
import { TipLayer } from './components/Tip'
import { usePrio } from './priority/state'

// one chunk per page, loaded when the page opens
const NationalProfile = lazy(() => import('./pages/NationalProfile'))
const Priority = lazy(() => import('./pages/Priority'))
const KhgProfile = lazy(() => import('./pages/KhgProfile'))
const KhgTable = lazy(() => import('./pages/KhgTable'))
const Khg = lazy(() => import('./pages/Khg'))
const ModelRunComparison = import.meta.env.DEV ? lazy(() => import('./pages/Compare')) : null

function CompareRedirect() {
  const code = usePrio((s) => s.sel) ?? '16.02.01'
  const { search } = useLocation()
  return <Navigate to={{ pathname: `/khg/${code}`, search }} replace />
}

function ScrollToPage() {
  const { pathname } = useLocation()
  useEffect(() => { if (pathname !== '/') window.scrollTo(0, 0) }, [pathname])
  return null
}

// hash routing: works on GitHub Pages and Netlify without rewrite rules
export default function App() {
  return (
    <HashRouter>
      <ScrollToPage />
      <Header />
      <TipLayer />
      <Suspense fallback={<div className="muted p-6">…</div>}>
        <Routes>
          <Route path="/" element={<NationalProfile />} />
          <Route path="/priority" element={<Priority />} />
          <Route path="/khg/:code" element={<KhgProfile />} />
          <Route path="/table" element={<KhgTable />} />
          <Route path="/about" element={<Navigate to="/" replace />} />
          <Route path="/workspace/:code" element={<Khg />} />
          <Route path="/summary" element={<Navigate to="/?v=status" replace />} />
          <Route path="/compare" element={<CompareRedirect />} />
          {ModelRunComparison && <Route path="/dev/model-runs" element={<ModelRunComparison />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </HashRouter>
  )
}
