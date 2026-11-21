import { DeveloperSections } from "@/components/landing/developer-sections";
import { LandingHero } from "@/components/landing/hero";
import { LifecycleAndSpotlightsSection } from "@/components/landing/lifecycle-and-spotlights";
import { LandingNavbar } from "@/components/landing/navbar";
import { ProductShowcaseSection } from "@/components/landing/product-showcase";
import {
  HowItWorksSection,
  PlatformOverviewSection,
  WhyWetScanSection,
} from "@/components/landing/why-and-platform";

export default function LandingPage() {
  return (
    <div className="landing landing-expanded">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <LandingNavbar />

      <main id="main">
        <LandingHero />
        <WhyWetScanSection />
        <PlatformOverviewSection />
        <HowItWorksSection />
        <ProductShowcaseSection />
        <LifecycleAndSpotlightsSection />
        <DeveloperSections />
      </main>
    </div>
  );
}
