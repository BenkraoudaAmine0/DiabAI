/* Figma 00 Brand · "Logo / Direction 1" (droplet + 5 neural nodes).
   Horizontal variant: a 240×72 box with the 72×72 mark and the "DiabAI"
   wordmark (Inter Bold 25, left 73 / top 23). `height` scales the whole box. */
export default function Logo({
  height = 72,
  variant = "horizontal",
  tone = "dark",
}: {
  height?: number;
  variant?: "horizontal" | "icon";
  tone?: "dark" | "light"; // light = white wordmark (admin sidebar)
}) {
  const scale = height / 72;
  const width = (variant === "icon" ? 72 : 240) * scale;
  return (
    <span
      className="relative inline-block shrink-0 select-none"
      style={{ width, height }}
      aria-label="DiabAI"
    >
      <span
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: variant === "icon" ? 72 : 240, height: 72, transform: `scale(${scale})` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand SVG */}
        <img src="/brand/logo-mark.svg" alt="" className="absolute left-0 top-0 size-[72px]" />
        {variant === "horizontal" && (
          <span className={`absolute left-[73px] top-[23px] whitespace-nowrap text-[25px] font-bold leading-normal ${tone === "light" ? "text-white" : "text-black"}`}>
            DiabAI
          </span>
        )}
      </span>
    </span>
  );
}
