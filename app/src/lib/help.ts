type L = { en: string; id: string }
/** Hover help texts: what a layer, mode or DEM shows. The source line comes from the manifest. */
export const MODE_HELP: Record<string, L> = {
  fire: { en: 'VIIRS hotspots (375 m) and burnt-area polygons on peat, by year and month.', id: 'Titik panas VIIRS (375 m) dan poligon area terbakar di gambut, menurut tahun dan bulan.' },
  water: { en: 'Climatic water balance per sub-KHG, the station-based deficit and the groundwater model (in development).', id: 'Neraca air iklim per sub-KHG, defisit berbasis stasiun dan model air tanah (dalam pengembangan).' },
  land: { en: 'Where hotspots and burns fall on licences, forest area, villages and DMPG villages. A spatial overlap does not establish responsibility.', id: 'Letak titik panas dan area terbakar pada izin, kawasan hutan, desa dan desa DMPG. Tumpang tindih spasial tidak menentukan tanggung jawab.' },
  action: { en: 'Proposed canal blocks, the water they hold back, canal flow direction and the budget estimate. Design outputs, not completed works.', id: 'Usulan sekat kanal, air yang ditahan, arah aliran kanal dan estimasi anggaran. Keluaran desain, bukan pekerjaan yang telah selesai.' },
}
export const DEM_HELP: Record<string, L> = {
  lidar: { en: 'LiDAR terrain model, where the KHG has one.', id: 'Model medan LiDAR, bila KHG memilikinya.' },
  deltadtm: { en: 'DeltaDTM global terrain model after the repeat-dem correction.', id: 'Model medan global DeltaDTM setelah koreksi repeat-dem.' },
  demnas: { en: 'DEMNAS (BIG) after the repeat-dem correction.', id: 'DEMNAS (BIG) setelah koreksi repeat-dem.' },
}
export const LAYER_HELP: Record<string, L> = {
  khg: { en: 'Boundary of the peat hydrological unit (KHG).', id: 'Batas kesatuan hidrologis gambut (KHG).' },
  canals: { en: 'Mapped canals by class: primary, secondary, tertiary.', id: 'Kanal terpetakan menurut kelas: primer, sekunder, tersier.' },
  canal_segments: { en: 'Canal split into segments with land level and slope along the canal; selected segments carry a need score.', id: 'Kanal dipecah menjadi segmen dengan tinggi lahan dan kemiringan sepanjang kanal.' },
  canal_flow: { en: 'Canals redrawn in the downstream direction found by the run (from the profile or the river connection). Use Animate flow to see the water move along them.', id: 'Kanal digambar ulang searah hilir menurut hasil analisis. Gunakan Animasikan aliran untuk melihat arah air.' },
  sekat_reach: { en: 'Canal length upstream of each proposed block that its water level reaches. Width grows with the rise in water level. Numbered by benefit rank.', id: 'Panjang kanal di hulu tiap sekat usulan yang terjangkau muka airnya. Lebar menurut kenaikan muka air. Diurutkan menurut peringkat manfaat.' },
  sekat_proposed: { en: 'Proposed canal blocks that the run kept, ranked by the water they hold back.', id: 'Sekat kanal usulan yang dipertahankan, diurutkan menurut air yang ditahan.' },
  sekat_existing: { en: 'Existing blocks of the national layer, assessed against the canal profile.', id: 'Sekat eksisting dari lapisan nasional, dinilai terhadap profil kanal.' },
  subkhg_units: { en: 'Sub-KHG units, coloured by the chosen attribute.', id: 'Unit sub-KHG, diwarnai menurut atribut terpilih.' },
  neraca_units: { en: 'Climatic water balance per sub-KHG: rain minus evapotranspiration, by dekad.', id: 'Neraca air iklim per sub-KHG: hujan dikurangi evapotranspirasi, per dasarian.' },
  neraca_stations: { en: 'Water-table stations and the days the modelled level was deeper than 40 cm.', id: 'Stasiun muka air dan jumlah hari muka air model lebih dalam dari 40 cm.' },
  burn: { en: 'Burnt-area polygons 2015 to 2026 with the number of burns.', id: 'Poligon area terbakar 2015 sampai 2026 beserta jumlah kejadian terbakar.' },
  forest: { en: 'Forest area function (kawasan hutan) 2023.', id: 'Fungsi kawasan hutan 2023.' },
  licences: { en: 'Business licences 2025. A hotspot inside a licence is a spatial overlap, not responsibility.', id: 'Izin usaha 2025. Titik panas di dalam izin adalah tumpang tindih spasial, bukan tanggung jawab.' },
  target_villages: { en: 'Villages targeted for peat ecosystem restoration.', id: 'Desa target pemulihan ekosistem gambut.' },
  dmpg: { en: 'DMPG villages (Desa Mandiri Peduli Gambut) of the SiTMAT portal.', id: 'Desa Mandiri Peduli Gambut (DMPG) dari portal SiTMAT.' },
  hotspots: { en: 'VIIRS hotspots of the selected period and confidence.', id: 'Titik panas VIIRS pada periode dan kepercayaan terpilih.' },
}
export const layerTip = (id: string, lang: 'en' | 'id', source?: string) => [LAYER_HELP[id]?.[lang], source ? `${lang === 'id' ? 'Sumber' : 'Source'}: ${source}` : ''].filter(Boolean).join('\n')
