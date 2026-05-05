import { Fragment } from 'react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { Problem } from './components/Problem';
import { Room } from './components/Room';
import { Standard } from './components/Standard';
import { Audit } from './components/Audit';
import { Fix } from './components/Fix';
import { Factory } from './components/Factory';
import { Local } from './components/Local';
import { Etymology } from './components/Etymology';
import { Install } from './components/Install';
import { Faq } from './components/Faq';
import { FinalCta } from './components/FinalCta';
import { Footer } from './components/Footer';

/**
 * Root component of the Nakiros marketing landing page — v2 redesign.
 *
 * Section sequence mirrors the "control room" narrative:
 *   Navbar → Hero → Problem → Room → Standard → Audit → Fix → Factory →
 *   Local → Install → Etymology → Faq → FinalCta → Footer
 *
 * Install (terminal demo) caps the product narrative; Etymology is a
 * storytelling pause before the FAQ closes objections; FinalCta is the
 * final conversion block.
 */
const SECTIONS = [
  Hero,
  Problem,
  Room,
  Standard,
  Audit,
  Fix,
  Factory,
  Local,
  Install,
  Etymology,
  Faq,
];

function Divider() {
  return (
    <hr
      aria-hidden="true"
      className="mx-auto max-w-[1180px] border-0 px-9"
      style={{
        height: 1,
        background:
          'linear-gradient(90deg, transparent 0%, var(--border-subtle) 12%, var(--border-subtle) 88%, transparent 100%)',
      }}
    />
  );
}

export default function App() {
  return (
    <div
      className="relative min-h-screen"
      style={{ background: 'var(--bg-canvas)', color: 'var(--fg)' }}
    >
      <div className="lp-grid-bg" aria-hidden="true" />
      <Navbar />
      <main>
        {SECTIONS.map((Section, i) => (
          <Fragment key={Section.name}>
            <Section />
            {i < SECTIONS.length - 1 && <Divider />}
          </Fragment>
        ))}
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
