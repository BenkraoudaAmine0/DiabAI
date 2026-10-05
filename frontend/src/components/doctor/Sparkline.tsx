/** Figma "Sparkline-Plot": a 520×120 line with dots over a pale target band.
 *  `series` lets the blood-pressure card draw systolic + diastolic. */
export interface SparkPoint {
  at: string;
  value: number;
}

export default function Sparkline({
  series,
  band,
  colors = ["#0e7c4a", "#0f766e"],
  label,
}: {
  series: SparkPoint[][];
  band?: [number, number];
  colors?: string[];
  label: string;
}) {
  const W = 520;
  const H = 120;
  const all = series.flat();
  if (all.length === 0) return null;
  const values = all.map((p) => p.value).concat(band ?? []);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min || 1) * 0.15;
  const lo = min - pad;
  const hi = max + pad;
  const times = all.map((p) => new Date(p.at).getTime());
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const x = (at: string) => (t1 === t0 ? W / 2 : ((new Date(at).getTime() - t0) / (t1 - t0)) * (W - 12) + 6);
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[120px] w-full" role="img" aria-label={label} preserveAspectRatio="none">
      {band && <rect x={0} y={y(band[1])} width={W} height={Math.max(1, y(band[0]) - y(band[1]))} fill="#e6f2eb" />}
      {series.map((pts, i) => {
        const sorted = [...pts].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
        const d = sorted.map((p, j) => `${j ? "L" : "M"} ${x(p.at).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
        return (
          <g key={i}>
            <path d={d} fill="none" stroke={colors[i % colors.length]} strokeWidth={2} vectorEffect="non-scaling-stroke" />
            {sorted.map((p) => (
              <circle key={p.at + p.value} cx={x(p.at)} cy={y(p.value)} r={3} fill={colors[i % colors.length]} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}
