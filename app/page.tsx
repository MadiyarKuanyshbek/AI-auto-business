import Header from "@/components/Header";
import Hero from "@/components/Hero";
import ProblemSection from "@/components/ProblemSection";
import ProductsSection from "@/components/ProductsSection";
import PricingSection from "@/components/PricingSection";
import HowItWorks from "@/components/HowItWorks";
import LeadFormSection from "@/components/LeadFormSection";
import FAQSection from "@/components/FAQSection";
import Footer from "@/components/Footer";
import StickyTelegramCta from "@/components/StickyTelegramCta";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <Header />
      <main className="flex-1">
        <Hero />
        <ProblemSection />
        <ProductsSection />
        <PricingSection />
        <HowItWorks />
        <LeadFormSection />
        <FAQSection />
      </main>
      <Footer />
      <StickyTelegramCta />
    </div>
  );
}
