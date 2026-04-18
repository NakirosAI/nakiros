export function NakirosLogo({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="16" cy="16" r="14" stroke="#2ECFCF" strokeWidth="2" />
      <circle cx="16" cy="16" r="4" fill="#2ECFCF" />
      <path d="M8 16 L12 16" stroke="#2ECFCF" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M20 16 L24 16" stroke="#2ECFCF" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16 8 L16 12" stroke="#2ECFCF" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16 20 L16 24" stroke="#2ECFCF" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
