import CTASection from "@/components/CTASection";
import FAQSection from "@/components/FAQSection";
import Hero from "@/components/Hero";
import HowHumrahiHubWorksSection from "@/components/HowHumrahiHubWorksSection";
import OurTrustSection from "@/components/OurTrustSection";
import WhatWeDoSection from "@/components/WhatWeDoSection";

export default function Home() {
  return (
    <main className="min-h-screen bg-white font-sans text-text-primary">
      <Hero />
      <div id="what-we-do">
        <WhatWeDoSection />
      </div>
      <div id="how-it-works">
        <HowHumrahiHubWorksSection />
      </div>



      
      <div id="our-trust">
        <OurTrustSection />
      </div>
      <FAQSection />
      <CTASection />
    </main>
  );
}
