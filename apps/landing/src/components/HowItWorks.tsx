import { useI18n } from '@/i18n/I18nProvider';

/**
 * "How it works" section of the landing page (anchor `#how-it-works`).
 *
 * Renders a 3-column numbered timeline driven by `messages.howItWorks.steps`,
 * with subtle gradient connector lines drawn between cards on `md` and up.
 * Copy is sourced from the `howItWorks` block of the active locale via
 * {@link useI18n}.
 */
export function HowItWorks() {
  const { messages } = useI18n();

  return (
    <section id="how-it-works" className="border-b border-[#1A1A1A] bg-[#111111] py-24">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-center font-mono text-3xl text-[#F0F0F0] sm:text-4xl">
          {messages.howItWorks.title}
        </h2>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {messages.howItWorks.steps.map((step, i, arr) => (
            <div key={step.number} className="relative">
              {i < arr.length - 1 && (
                <div className="absolute right-0 top-8 hidden h-px w-[calc(100%-5rem)] bg-gradient-to-r from-[#0D9E9E] to-transparent md:block" />
              )}

              <div className="relative h-full rounded-xl border border-[#1A1A1A] bg-[#0D0D0D] p-7">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border-2 border-[#0D9E9E] bg-[#080808] font-mono text-xl text-[#2ECFCF]">
                    {step.number}
                  </div>
                  <h3 className="pt-2 font-mono text-xl text-[#F0F0F0]">{step.title}</h3>
                </div>
                <p className="mt-5 leading-relaxed text-[#F0F0F0]/70">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
