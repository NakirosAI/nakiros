import { useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';

/**
 * "FAQ" section — accordion with honest answers.
 * Maps to section 08/09 of v2 (FaqSection).
 */
export function Faq() {
  const { messages } = useI18n();
  const c = messages.faq;
  const [open, setOpen] = useState<number>(0);

  return (
    <section id="faq" className="relative z-10 py-24">
      <div className="mx-auto max-w-[1180px] px-6 md:px-9">
        {/* Section head */}
        <div className="mb-10">
          <p className="lp-mono mb-3.5 text-[10.5px] uppercase tracking-[1.4px] text-[color:var(--fg-subtle)]">
            {c.label}
          </p>
          <h2 className="max-w-[720px] text-[38px] font-medium leading-tight tracking-[-0.6px] text-[color:var(--fg)]">
            {c.title}
          </h2>
        </div>

        <div className="grid gap-2">
          {c.items.map((item, i) => {
            const isOpen = open === i;
            return (
              <div
                key={i}
                className="cursor-pointer overflow-hidden rounded-[10px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-surface)] transition-colors hover:border-[color:var(--border-strong)]"
                onClick={() => setOpen(isOpen ? -1 : i)}
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-3.5 px-5 py-4 text-left"
                >
                  <span
                    className="lp-mono shrink-0 text-[11px] text-[color:var(--accent)]"
                    style={{ minWidth: 26 }}
                  >
                    0{i + 1}
                  </span>
                  <span className="flex-1 text-[15px] font-medium text-[color:var(--fg)]">
                    {item.q}
                  </span>
                  <span
                    aria-hidden="true"
                    style={{
                      transform: isOpen ? 'rotate(45deg)' : 'rotate(0)',
                      transition: 'transform 200ms',
                      color: 'var(--fg-muted)',
                      flexShrink: 0,
                    }}
                  >
                    {/* Plus icon */}
                    <svg
                      width={16}
                      height={16}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
                </button>
                {isOpen && (
                  <div className="px-5 pb-4 text-[14px] leading-[1.6] text-[color:var(--fg-muted)]" style={{ paddingLeft: 60 }}>
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
