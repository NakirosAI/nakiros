import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { Etymology } from './components/Etymology';
import { Features } from './components/Features';
import { HowItWorks } from './components/HowItWorks';
import { OpenSource } from './components/OpenSource';
import { FinalCta } from './components/FinalCta';
import { Footer } from './components/Footer';

/**
 * Root component of the Nakiros marketing landing page.
 *
 * Composes the marketing sections in vertical order: Navbar, Hero, Etymology,
 * Features, HowItWorks, OpenSource, FinalCta, Footer. Mounted by `main.tsx`
 * inside the `I18nProvider`. This is intentionally separate from the in-app
 * web UI in `apps/frontend` — only static marketing content lives here.
 */
export default function App() {
  return (
    <div className="min-h-screen bg-[#080808]">
      <Navbar />
      <main>
        <Hero />
        <Etymology />
        <Features />
        <HowItWorks />
        <OpenSource />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
