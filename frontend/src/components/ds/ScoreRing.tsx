interface ScoreRingProps {
  score: number;
  max?: number;
  size?: number;
  /** Ring color follows the pass/fail read rather than always reading green. */
  threshold?: number;
  label?: string;
}

/** Serif numeral inside a hairline track. Quantitative, not decorative. */
export function ScoreRing({
  score,
  max = 100,
  size = 120,
  threshold = 70,
  label,
}: ScoreRingProps) {
  const stroke = Math.max(5, Math.round(size * 0.067));
  const r = size / 2 - stroke;
  const circumference = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, score / max));
  const ringColor = score >= threshold ? "var(--green)" : "var(--accent)";

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label ? `${label}: ${score} of ${max}` : `Score ${score} of ${max}`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--border-default)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={ringColor}
        strokeWidth={stroke}
        strokeLinecap="butt"
        strokeDasharray={`${circumference * pct} ${circumference}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dasharray 600ms cubic-bezier(0.4,0,0.2,1)" }}
      />
      <text
        x="50%"
        y="53%"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="var(--font-serif)"
        fontSize={size * 0.3}
        fontWeight={600}
        fill="var(--text-primary)"
      >
        {score}
      </text>
    </svg>
  );
}
