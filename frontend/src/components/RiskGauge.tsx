/** Semicircle gauge: probability of diabetes on the model's tier scale
 *  (Low < 30 % · Moderate < 50 % · High < 75 % · Critical), with the
 *  decision threshold marked. */

const ZONES: [number, number, string][] = [
  [0, 0.3, "#16a34a"],
  [0.3, 0.5, "#f59e0b"],
  [0.5, 0.75, "#ea580c"],
  [0.75, 1, "#dc2626"],
];

const CX = 110;
const CY = 110;
const R = 84;

function point(fraction: number, radius = R): [number, number] {
  const angle = Math.PI * (1 - fraction);
  return [CX + radius * Math.cos(angle), CY - radius * Math.sin(angle)];
}

function arc(from: number, to: number): string {
  const [x0, y0] = point(from);
  const [x1, y1] = point(to);
  return `M ${x0} ${y0} A ${R} ${R} 0 0 1 ${x1} ${y1}`;
}

export default function RiskGauge({
  probability,
  threshold,
  label,
}: {
  probability: number;
  threshold: number | null;
  label: string;
}) {
  const p = Math.min(Math.max(probability, 0), 1);
  const [nx, ny] = point(p, R - 22);
  const tick = threshold != null ? [point(threshold, R + 14), point(threshold, R - 14)] : null;

  return (
    <svg viewBox="0 0 220 128" role="img" aria-label={label} className="mx-auto w-full max-w-xs">
      {ZONES.map(([from, to, color]) => (
        <path
          key={from}
          d={arc(from + (from > 0 ? 0.006 : 0), to - (to < 1 ? 0.006 : 0))}
          stroke={color}
          strokeWidth={20}
          fill="none"
        />
      ))}
      {tick && (
        <line
          x1={tick[0][0]}
          y1={tick[0][1]}
          x2={tick[1][0]}
          y2={tick[1][1]}
          stroke="#0f172a"
          strokeWidth={1.5}
          strokeDasharray="3 2"
        />
      )}
      <line
        x1={CX}
        y1={CY}
        x2={nx}
        y2={ny}
        stroke="#0f172a"
        strokeWidth={4}
        strokeLinecap="round"
        style={{ transition: "all 0.6s ease-out" }}
      />
      <circle cx={CX} cy={CY} r={8} fill="#0f172a" />
      <text x={CX - R} y={CY + 16} textAnchor="middle" fontSize="9" fill="#94a3b8">
        0%
      </text>
      <text x={CX + R} y={CY + 16} textAnchor="middle" fontSize="9" fill="#94a3b8">
        100%
      </text>
    </svg>
  );
}
