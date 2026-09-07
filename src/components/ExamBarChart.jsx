import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts'

// Each data point should include a `percent` field (0-100) alongside
// `value`, so the tooltip can show e.g. "12 (24%)" on hover.
export default function ExamBarChart({ data }) {
  return (
    <BarChart width={400} height={260} data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
      <XAxis dataKey="name" stroke="var(--muted)" fontSize={12} />
      <YAxis allowDecimals={false} stroke="var(--muted)" fontSize={12} />
      <Tooltip
        contentStyle={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          color: 'var(--text)',
        }}
        formatter={(value, name, entry) => {
          const pct = entry?.payload?.percent
          return [pct !== undefined ? `${value} (${Math.round(pct)}%)` : value, 'Count']
        }}
      />
      <Bar dataKey="value" name="Count" radius={[6, 6, 0, 0]}>
        {data.map((entry, i) => (
          <Cell key={i} fill={entry.fill} />
        ))}
      </Bar>
    </BarChart>
  )
}
