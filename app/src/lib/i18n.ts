import { useCallback } from 'react'
import { useStore } from './store'
import investigationID from './investigation_id.json'

// Keys are the English text; a missing entry falls back to English.
const ID: Record<string, string> = {
  'National overview': 'Ringkasan nasional', 'KHG profile': 'Profil KHG', 'Choose a KHG': 'Pilih KHG',
  'Peat hydrological units': 'Kesatuan hidrologis gambut', 'Search KHG': 'Cari KHG', 'Rank': 'Peringkat', 'KHG': 'KHG', 'Province': 'Provinsi',
  'Island': 'Pulau', 'Score': 'Skor', 'Class': 'Kelas', 'Peat (km²)': 'Gambut (km²)', 'Area (km²)': 'Luas (km²)',
  'Hotspots 2026 per month': 'Titik panas 2026 per bulan', 'Hotspots per month': 'Titik panas per bulan', 'medium confidence': 'kepercayaan sedang', 'high confidence': 'kepercayaan tinggi',
  'Water level at SiTMAT stations': 'Muka air di stasiun SiTMAT', 'community': 'masyarakat', 'concession': 'konsesi',
  'Open profile': 'Buka profil', 'Weights are provisional and not yet agreed with the team.': 'Bobot masih sementara dan belum disepakati tim.',
  'Layers': 'Lapisan', 'Neraca air': 'Neraca air', 'Fire': 'Api', 'DEM': 'DEM', 'Opacity': 'Opasitas', 'Not available for this DEM': 'Tidak tersedia untuk DEM ini',
  'Climatic balance per sub-KHG': 'Neraca iklim per sub-KHG', 'Groundwater model': 'Model air tanah', 'in development': 'dalam pengembangan',
  'Water-table stations': 'Stasiun muka air', 'Sub-KHG units': 'Unit sub-KHG', 'Colour by': 'Warna berdasarkan', 'Year': 'Tahun', 'All': 'Semua',
  'Monthly water balance (mm)': 'Neraca air bulanan (mm)', 'Rain and evapotranspiration (mm/day)': 'Hujan dan evapotranspirasi (mm/hari)',
  'Mean water-table depth (cm)': 'Kedalaman muka air rata-rata (cm)', 'Rain': 'Hujan', 'Evapotranspiration': 'Evapotranspirasi',
  'Station scores': 'Skor stasiun', 'Rank correlation': 'Korelasi peringkat', 'Bias (cm)': 'Bias (cm)', 'RMSE (cm)': 'RMSE (cm)', 'stations': 'stasiun',
  'Boundary': 'Batas', 'Hydrology': 'Hidrologi', 'Interventions': 'Intervensi', 'Land status': 'Status lahan', 'Ranking': 'Peringkat', 'Light': 'Terang', 'Dark': 'Gelap',
  'Hotspots': 'Titik panas', 'Relief': 'Relief', 'Not ranked (small KHG)': 'Tidak diperingkat (KHG kecil)', 'high': 'tinggi', 'medium': 'sedang', 'low': 'rendah',
 'Fire history': 'Riwayat kebakaran', 'This year': 'Tahun ini', 'Canals': 'Kanal', 'Reset': 'Atur ulang', 'Default': 'Bawaan', 'History': 'Riwayat', 'Equal': 'Sama',
  'Minimum peat': 'Gambut minimum', 'Missing canals': 'Kanal tidak ada', 'Ignore': 'Abaikan', 'Average': 'Rata-rata', 'Hotspot confidence': 'Kepercayaan titik panas',
  'Medium + high': 'Sedang + tinggi', 'High only': 'Hanya tinggi', 'Rank change vs default weights': 'Perubahan peringkat terhadap bobot bawaan', 'ranked': 'diperingkat',
  'Bars': 'Batang', 'Table': 'Tabel', 'Team KHG': 'KHG tim', 'Not ranked': 'Tidak diperingkat', 'National focus: high': 'Fokus nasional: tinggi',
  'National focus: medium': 'Fokus nasional: sedang', 'National focus: low': 'Fokus nasional: rendah', 'Burned peat per year': 'Gambut terbakar per tahun', 'VIIRS hotspots per year': 'Titik panas VIIRS per tahun',
  'Burned share': 'Porsi terbakar', 'Repeat burns': 'Terbakar berulang', 'Hotspots 2015 to 2025': 'Titik panas 2015 hingga 2025', 'Hotspots this year': 'Titik panas tahun ini', 'Burned area this year': 'Luas terbakar tahun ini',
  'Primary canals': 'Kanal primer', 'Secondary canals': 'Kanal sekunder', 'Tertiary canals': 'Kanal tersier',
  'Indicators by KHG': 'Indikator per KHG', 'Same colour scale in every panel: 5th to 95th percentile': 'Skala warna sama di setiap panel: persentil ke-5 hingga ke-95',
  'Intervention need: high': 'Kebutuhan intervensi: tinggi', 'Intervention need: medium': 'Kebutuhan intervensi: sedang', 'Intervention need: low': 'Kebutuhan intervensi: rendah',
  'Water deficit': 'Defisit air', 'Area (ha)': 'Luas (ha)', 'Village': 'Desa', 'District': 'Kecamatan', 'Regency': 'Kabupaten', 'Type': 'Tipe',
  'Compare KHG': 'Bandingkan KHG', 'Sort by': 'Urutkan', 'National rank': 'Peringkat nasional', 'Station-based deficit': 'Defisit berbasis stasiun', 'Model stations': 'Stasiun model',
  'Climatic balance': 'Neraca iklim', 'per 100 km² of KHG': 'per 100 km² KHG', 'Model results are in development.': 'Hasil model masih dalam pengembangan.',
  'Basemap': 'Peta dasar', 'Satellite': 'Satelit', 'Map': 'Peta',
  'Satellite image only': 'Citra satelit saja', 'DEM relief': 'Relief DEM',
  'Near': 'Dekat', 'Wider': 'Lebih luas',
  'Select a KHG in the ranking or on the map. Same colour scale in every panel: 5th to 95th percentile of the ranked KHG; the marker shows the selected KHG.': 'Pilih KHG di peringkat atau di peta. Skala warna sama di setiap panel: persentil ke-5 hingga ke-95 KHG yang diperingkat; penanda menunjukkan KHG terpilih.',
  'Maps': 'Peta', 'Layer': 'Lapisan', 'Groundwater model: mean depth, dry season': 'Model air tanah: kedalaman rata-rata, musim kering', 'Groundwater model: days deeper than 40 cm': 'Model air tanah: hari lebih dalam dari 40 cm',
  'Mean depth': 'Kedalaman rata-rata', 'season length': 'panjang musim', 'Days deeper than 40 cm': 'Hari lebih dalam dari 40 cm', 'Same scale for every KHG': 'Skala sama untuk semua KHG', 'Height tint is scaled to each KHG': 'Warna tinggi diskalakan per KHG',
  'Indonesia': 'Indonesia', 'Hotspots on peat': 'Titik panas di gambut', 'All hotspots': 'Semua titik panas', 'no stations inside this KHG': 'tidak ada stasiun di dalam KHG ini',
  'Weights and filters': 'Bobot dan filter', 'Selected KHG': 'KHG terpilih',
  'Loading': 'Memuat', 'not testable, too few stations': 'tidak dapat diuji, stasiun terlalu sedikit', 'Month only (no day) for part of 2026': 'Hanya bulan (tanpa hari) untuk sebagian 2026',
}

Object.assign(ID, investigationID)

export function useT() {
  const lang = useStore((s) => s.lang)
  return useCallback((en: string) => (lang === 'id' ? ID[en] ?? en : en), [lang])   // stable between renders: effects list it as a dependency
}
export const labelOf = (l: { en: string; id: string }, lang: 'en' | 'id') => l[lang] ?? l.en
export const dictionary = ID
