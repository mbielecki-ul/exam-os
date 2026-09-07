import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts'

// Each data point should include a `percent` field (0-100) alongside
// `value`, so the tooltip can show e.g. "12 (24%)" on hover.
export default function ExamBarChart({ data }) {
  return (
    <BarChart width={400} height={260} data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
      <XAxis dataKey="name" stroke="var(--muted)" fontSize={12} />
      <YAxis allowDecimals={false} stroke="var(--muted)" fontSize={12} />
      <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--border)', opacity: 0.3 }} />
      <Bar dataKey="value" name="Count" radius={[6, 6, 0, 0]}>
        {data.map((entry, i) => (
          <Cell key={i} fill={entry.fill} />
        ))}
      </Bar>
    </BarChart>
  )
}

// A custom tooltip content component, reading straight from the hovered
// bar's original data point (payload[0].payload) — more reliable across
// recharts versions than the `formatter` prop.
function CustomTooltip({ active, payload }) {
  if (!active || !payload || payload.length === 0) return null
  const point = payload[0].payload

  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '0.5rem 0.75rem',
        color: 'var(--text)',
        fontSize: '0.85rem',
      }}
    >
      <p style={{ margin: 0, fontWeight: 500 }}>{point.name}</p>
      <p style={{ margin: 0 }}>
        {point.value} ({Math.round(point.percent)}%)
      </p>
    </div>
  )
}
