import ugmLogo from '../assets/partners/ugm-horizontal.png'
import klhLogo from '../assets/partners/klh-bplh.png'
import worldBankLogo from '../assets/partners/world-bank.svg'
import { useT } from '../lib/i18n'

export default function About() {
  const t = useT()
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('About RE-PEAT')}</h1>
      <p className="muted mt-3 max-w-2xl leading-relaxed">
        {t('The RE-PEAT dashboard brings together maps and data on fire, water levels and land status to help prioritise peatland restoration in Indonesia.')}
      </p>
      <div className="mt-8 grid gap-6 sm:grid-cols-[2fr_1fr]">
        <section aria-labelledby="about-team">
          <h2 id="about-team" className="mb-3 text-sm font-semibold">{t('Developed by')}</h2>
          <div className="grid grid-cols-2 gap-3">
            <figure className="card flex flex-col items-center p-3 text-center">
              <div className="flex h-24 w-full items-center justify-center rounded-md bg-white p-3">
                <img src={ugmLogo} alt="" className="max-h-full w-full max-w-48 object-contain" />
              </div>
              <figcaption className="mt-3 text-sm font-medium">{t('Universitas Gadjah Mada team')}</figcaption>
            </figure>
            <figure className="card flex flex-col items-center p-3 text-center">
              <div className="flex h-24 w-full items-center justify-center rounded-md bg-white p-2">
                <img src={klhLogo} alt="" className="h-full max-w-full object-contain" />
              </div>
              <figcaption className="mt-3 text-sm font-medium">KLH/BPLH</figcaption>
            </figure>
          </div>
        </section>
        <section aria-labelledby="about-support">
          <h2 id="about-support" className="mb-3 text-sm font-semibold">{t('Supported by')}</h2>
          <figure className="card flex flex-col items-center p-3 text-center">
            <div className="flex h-24 w-full items-center justify-center rounded-md bg-white p-3">
              <img src={worldBankLogo} alt="" className="max-h-full w-full max-w-52 object-contain" />
            </div>
            <figcaption className="mt-3 text-sm font-medium">{t('World Bank')}</figcaption>
          </figure>
        </section>
      </div>
    </main>
  )
}
