import { HashRouter, Route, Routes } from 'react-router-dom'
import { Header } from './components/Header'
import { TipLayer } from './components/Tip'
import Compare from './pages/Compare'
import Hypotheses from './pages/Hypotheses'
import Khg from './pages/Khg'
import National from './pages/National'

// hash routing: works on GitHub Pages and Netlify without rewrite rules
export default function App() {
  return (
    <HashRouter>
      <Header />
      <TipLayer />
      <Routes>
        <Route path="/" element={<National />} />
        <Route path="/khg/:code" element={<Khg />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/investigation" element={<Hypotheses />} />
      </Routes>
    </HashRouter>
  )
}
