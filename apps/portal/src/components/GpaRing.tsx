export function GpaRing({ gpa }: { gpa: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, gpa / 4));
  return (
    <svg width={120} height={120} viewBox="0 0 110 110">
      <circle cx={55} cy={55} r={r} fill="none" stroke="var(--gray-100)" strokeWidth={10} />
      <circle
        cx={55}
        cy={55}
        r={r}
        fill="none"
        stroke="var(--daust-orange)"
        strokeWidth={10}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        transform="rotate(-90 55 55)"
      />
      <text x={55} y={52} textAnchor="middle" fontFamily="var(--font-display)" fontWeight={800} fontSize={24} fill="var(--fg1)">
        {gpa.toFixed(2)}
      </text>
      <text x={55} y={70} textAnchor="middle" fontSize={9} fill="var(--fg3)">
        GPA / 4.0
      </text>
    </svg>
  );
}
