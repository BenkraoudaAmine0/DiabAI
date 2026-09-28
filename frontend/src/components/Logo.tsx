export default function Logo({ size = 36 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 select-none">
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <rect width="48" height="48" rx="12" fill="#0d9488" />
        <path
          d="M14 24h4l3-8 6 16 3-8h4"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="35" cy="14" r="3.5" fill="#fbbf24" />
      </svg>
      <span className="text-xl font-bold tracking-tight text-slate-900">
        Diab<span className="text-teal-600">AI</span>
      </span>
    </span>
  );
}
