import { Github } from 'lucide-react';
import { NakirosLogo } from './NakirosLogo';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useI18n } from '@/i18n/I18nProvider';
import { useNpmVersion } from '@/lib/useNpmVersion';

/**
 * Sticky top navigation bar — v2 design.
 *
 * Links point to in-page anchors matching the new section sequence:
 * #problem, #factory, #faq, #install. The GitHub link opens in a new tab.
 * The "Install" CTA scrolls to the FinalCta section.
 */
export function Navbar() {
  const { messages } = useI18n();
  const npm = useNpmVersion('@nakirosai/nakiros');
  const versionLabel = npm
    ? `v${npm.version}${npm.tag !== 'latest' ? ` · ${npm.tag}` : ''}`
    : null;

  const items = [
    { label: messages.navbar.product, href: '#problem' },
    { label: messages.navbar.skills,  href: '#factory' },
    { label: messages.navbar.github,  href: 'https://github.com/NakirosAI/nakiros', external: true },
  ];

  return (
    <header
      className="sticky top-0 z-50 border-b"
      style={{
        background: 'oklch(0.08 0.005 240 / 0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <nav className="mx-auto flex h-16 max-w-[1180px] items-center gap-7 px-6 md:px-9">
        {/* Logo + name */}
        <a href="#top" className="flex items-center gap-2.5" style={{ color: 'var(--fg)' }}>
          <NakirosLogo className="h-5 w-5" />
          <span className="lp-mono text-[14px] tracking-[0.4px]">nakiros</span>
          {versionLabel && (
            <span
              className="lp-mono ml-1 rounded px-1.5 py-0.5 text-[9.5px] uppercase tracking-[0.6px]"
              style={{
                background: 'var(--bg-sunken)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--fg-faint)',
              }}
            >
              {versionLabel}
            </span>
          )}
        </a>

        {/* Nav links */}
        <div className="hidden flex-1 items-center gap-6 md:flex">
          {items.map((item) => (
            item.external ? (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-[13px] transition-colors"
                style={{ color: 'var(--fg-muted)' }}
              >
                <Github className="h-3.5 w-3.5" />
                {item.label}
              </a>
            ) : (
              <a
                key={item.label}
                href={item.href}
                className="text-[13px] transition-colors hover:text-[color:var(--fg)]"
                style={{ color: 'var(--fg-muted)' }}
              >
                {item.label}
              </a>
            )
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <LanguageSwitcher />
          <a
            href="#install"
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-medium transition-colors"
            style={{
              background: 'var(--accent)',
              color: 'oklch(0.14 0.012 240)',
              border: '1px solid transparent',
            }}
          >
            {messages.navbar.install}
          </a>
        </div>
      </nav>
    </header>
  );
}
