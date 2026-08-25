import Papa from 'papaparse'

// Returns { questions: [{text, options:[4], correctIndex}], errors: [string] }
export function parseQuestionFile(filename, text) {
  if (filename.toLowerCase().endsWith('.json')) {
    return parseJson(text)
  }
  return parseCsv(text)
}

function parseJson(text) {
  const errors = []
  let raw
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { questions: [], errors: ['Ungültiges JSON: ' + e.message] }
  }
  if (!Array.isArray(raw)) return { questions: [], errors: ['JSON muss ein Array von Fragen sein.'] }

  const questions = []
  raw.forEach((row, i) => {
    const q = normalize(row.text, row.options, row.correctIndex, i)
    if (q.error) errors.push(q.error)
    else questions.push(q.question)
  })
  return { questions, errors }
}

function parseCsv(text) {
  const parsed = Papa.parse(text.trim(), { header: true, skipEmptyLines: true })
  const errors = parsed.errors.map((e) => `Zeile ${e.row}: ${e.message}`)

  const questions = []
  parsed.data.forEach((row, i) => {
    const options = [row.option1, row.option2, row.option3, row.option4]
    // CSV uses 1-based correctOption for human editors.
    const correctIndex = Number(row.correctOption) - 1
    const q = normalize(row.question, options, correctIndex, i)
    if (q.error) errors.push(q.error)
    else questions.push(q.question)
  })
  return { questions, errors }
}

function normalize(text, options, correctIndex, i) {
  if (!text || !Array.isArray(options) || options.some((o) => !o) || options.length !== 4) {
    return { error: `Zeile ${i + 1}: Frage benötigt Text und genau 4 Antwortoptionen.` }
  }
  const idx = Number(correctIndex)
  if (Number.isNaN(idx) || idx < 0 || idx > 3) {
    return { error: `Zeile ${i + 1}: correctIndex/correctOption ungültig.` }
  }
  return { question: { text: text.trim(), options: options.map((o) => String(o).trim()), correctIndex: idx } }
}
