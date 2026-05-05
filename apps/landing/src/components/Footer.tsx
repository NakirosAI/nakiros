import { NakirosLogo } from './NakirosLogo';
import { useI18n } from '@/i18n/I18nProvider';

const GITHUB_URL = 'https://github.com/nakirosai/nakiros';

export function Footer() {
  const { messages } = useI18n();
  const f = messages.footer;

  return (
    <footer
      className="relative z-10 border-t py-10"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-6 px-6 md:px-9">
        <div className="flex items-center gap-2.5">
          <NakirosLogo className="h-5 w-5" />
          <span
            className="lp-mono text-[14px] tracking-[0.4px]"
            style={{ color: 'var(--fg)' }}
          >
            nakiros
          </span>
          <span
            className="lp-mono ml-3 text-[12.5px]"
            style={{ color: 'var(--fg-muted)' }}
          >
            {f.tagline}
          </span>
        </div>

        <div
          className="lp-mono flex items-center gap-4 text-[11.5px]"
          style={{ color: 'var(--fg-faint)' }}
        >
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-[color:var(--fg)]"
            style={{ color: 'var(--fg-muted)' }}
          >
            GitHub
          </a>
          <span>·</span>
          <span>MIT</span>
          <span>·</span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: 'var(--healthy)' }}
            />
            all systems local
          </span>
        </div>
      </div>

      <div
        className="mx-auto mt-6 max-w-[1180px] px-6 md:px-9 lp-mono text-[11px]"
        style={{ color: 'var(--fg-faint)' }}
      >
        {f.meta}
      </div>
    </footer>
  );
}
