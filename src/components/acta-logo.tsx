/* eslint-disable @next/next/no-img-element */

export function ActaLogo({ className = "h-8" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <img src="/acta-logomark.svg" alt="" className="h-full w-auto" />
      <img src="/acta-wordmark.svg" alt="Acta" className="h-[68.75%] w-auto" />
    </span>
  );
}
