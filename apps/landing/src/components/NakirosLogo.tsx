export function NakirosLogo({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <line x1="50" y1="50" x2="25" y2="20" stroke="#0D9E9E" strokeWidth="2" />
      <line x1="50" y1="50" x2="75" y2="25" stroke="#0D9E9E" strokeWidth="2" />
      <line x1="50" y1="50" x2="20" y2="75" stroke="#0D9E9E" strokeWidth="2" />
      <line x1="50" y1="50" x2="80" y2="70" stroke="#0D9E9E" strokeWidth="2" />
      <circle cx="50" cy="50" r="8" fill="#0D9E9E" />
      <circle cx="25" cy="20" r="5" fill="#0D9E9E" />
      <circle cx="75" cy="25" r="5" fill="#0D9E9E" />
      <circle cx="20" cy="75" r="5" fill="#0D9E9E" />
      <circle cx="80" cy="70" r="6" fill="#2ECFCF" />
    </svg>
  );
}
