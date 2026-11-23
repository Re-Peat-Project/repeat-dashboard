import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { X } from 'lucide-react'
import ugmLogo from '../assets/partners/ugm-horizontal.png'
import klhLogo from '../assets/partners/klh-bplh.png'
import worldBankLogo from '../assets/partners/world-bank.svg'
import { useT } from '../lib/i18n'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog'

export function AboutDialog({ triggerClassName }: { triggerClassName: string }) {
  const t = useT()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  useEffect(() => { if (pathname === '/about') setOpen(true) }, [pathname])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={triggerClassName}>{t('About')}</DialogTrigger>
      <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] gap-4 overflow-y-auto p-4 sm:max-w-lg sm:p-5">
        <DialogHeader className="text-left">
          <DialogTitle className="pr-9">{t('About RE-PEAT')}</DialogTitle>
          <DialogDescription className="leading-relaxed">
            {t('The RE-PEAT dashboard brings together maps and data on fire, water levels and land status to help prioritise peatland restoration in Indonesia.')}
          </DialogDescription>
        </DialogHeader>
        <DialogClose aria-label={t('Close')} className="absolute top-2 right-2 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
          <X className="size-4" aria-hidden />
        </DialogClose>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <section aria-labelledby="about-team" className="col-span-2 min-w-0">
            <h3 id="about-team" className="mb-2 text-xs font-semibold">{t('Developed by')}</h3>
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <Partner logo={ugmLogo} name={t('Universitas Gadjah Mada team')} />
              <Partner logo={klhLogo} name="KLH/BPLH" />
            </div>
          </section>
          <section aria-labelledby="about-support" className="min-w-0">
            <h3 id="about-support" className="mb-2 text-xs font-semibold">{t('Supported by')}</h3>
            <Partner logo={worldBankLogo} name={t('World Bank')} />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Partner({ logo, name }: { logo: string; name: string }) {
  return (
    <figure className="min-w-0 text-center">
      <div className="flex h-14 items-center justify-center rounded-md border border-border bg-white px-2 py-1.5 sm:h-16 sm:px-3">
        <img src={logo} alt="" className="max-h-full max-w-full object-contain" />
      </div>
      <figcaption className="mt-1.5 text-xs font-medium">{name}</figcaption>
    </figure>
  )
}
