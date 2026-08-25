import { useLocation, Link } from 'react-router-dom'

export default function ExamDone() {
  const { state } = useLocation()

  if (!state) {
    return (
      <div className="page-center">
        <div className="card">
          <p>Keine Ergebnisdaten gefunden.</p>
          <Link className="button" to="/">Zurück zur Übersicht</Link>
        </div>
      </div>
    )
  }

  const { correctCount, total } = state
  const pct = Math.round((correctCount / total) * 100)

  return (
    <div className="page-center">
      <div className="card login-card">
        <h1>Prüfung abgeschlossen</h1>
        <p className="score-display">{correctCount} / {total} richtig</p>
        <p className="muted">{pct}% korrekt</p>
        <Link className="button" to="/">Zurück zur Übersicht</Link>
      </div>
    </div>
  )
}
