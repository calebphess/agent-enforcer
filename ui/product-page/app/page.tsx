import { SiteNav } from '@/components/site-nav'
import { Hero } from '@/components/sections/hero'
import { Problem } from '@/components/sections/problem'
import { Solution } from '@/components/sections/solution'
import { Value } from '@/components/sections/value'
import { HowItWorks } from '@/components/sections/how-it-works'
import { AirGap } from '@/components/sections/airgap'
import { Proposal } from '@/components/sections/proposal'
import { Pricing } from '@/components/sections/pricing'
import { Downloads } from '@/components/sections/downloads'
import { CtaFooter } from '@/components/sections/cta-footer'

export default function Page() {
  return (
    <main className="relative overflow-x-hidden">
      <SiteNav />
      <Hero />
      <Problem />
      <Solution />
      <Value />
      <HowItWorks />
      <AirGap />
      <Proposal />
      <Pricing />
      <Downloads />
      <CtaFooter />
    </main>
  )
}
