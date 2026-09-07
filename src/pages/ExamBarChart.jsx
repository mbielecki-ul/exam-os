import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts'

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
      />
      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
        {data.map((entry, i) => (
          <Cell key={i} fill={entry.fill} />
        ))}
      </Bar>
    </BarChart>
  )
}
