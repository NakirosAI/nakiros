import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  command: string;
  className?: string;
  label?: string;
}

export function InstallCommand({ command, className, label }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
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
        <span>{command}</span>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy command"
          className="ml-1 rounded-md p-1 text-[#F0F0F0]/50 transition-colors hover:bg-[#1A1A1A] hover:text-[#F0F0F0]"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-[#2ECFCF]" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}
