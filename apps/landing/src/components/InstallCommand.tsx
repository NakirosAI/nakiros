import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useNpmVersion } from '@/lib/useNpmVersion';

interface Props {
  command: string;
  className?: string;
  label?: string;
  /** npm package to fetch latest version for. Omit to hide the version badge. */
  packageName?: string;
}

export function InstallCommand({ command, className, label, packageName }: Props) {
  const [copied, setCopied] = useState(false);
  const info = useNpmVersion(packageName ?? '');
  const isPrerelease = info ? info.tag !== 'latest' : false;

  // If the package only exists as a pre-release on npm, suffix the command
  // with @<tag> so users actually install it (e.g. `npm i -g @nakirosai/nakiros@beta`).
  const displayCommand =
    isPrerelease && packageName && command.includes(packageName)
      ? command.replace(packageName, `${packageName}@${info!.tag}`)
      : command;

  async function copy() {
    try {
      await navigator.clipboard.writeText(displayCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className={cn('inline-flex flex-col gap-1', className)}>
      {label && (
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#F0F0F0]/50">
          {label}
        </span>
      )}
      <div className="group inline-flex items-center gap-3 rounded-lg border border-[#1A1A1A] bg-[#0D0D0D] px-4 py-3 font-mono text-sm text-[#F0F0F0] transition-colors hover:border-[#2ECFCF]/40">
        <span className="text-[#2ECFCF]">$</span>
        <span>{displayCommand}</span>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy command"
          className="ml-1 rounded-md p-1 text-[#F0F0F0]/50 transition-colors hover:bg-[#1A1A1A] hover:text-[#F0F0F0]"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-[#2ECFCF]" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
        {packageName && info && (
          <span
            className={cn(
              'ml-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em]',
              isPrerelease
                ? 'border-[#F0B429]/40 bg-[#F0B429]/5 text-[#F0B429]'
                : 'border-[#2ECFCF]/30 bg-[#2ECFCF]/5 text-[#2ECFCF]',
            )}
            title={isPrerelease ? `Pre-release on npm (${info.tag})` : 'Latest on npm'}
          >
            v{info.version}{isPrerelease ? ` · ${info.tag}` : ''}
          </span>
        )}
      </div>
    </div>
  );
}
