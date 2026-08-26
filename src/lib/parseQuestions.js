import Papa from 'papaparse'
import * as XLSX from 'xlsx'

// Returns { questions: [{text, options:[4], correctIndex, category}], errors: [string] }
export async function parseQuestionFile(file) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.json')) {
    return parseJson(await file.text())
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return parseXlsx(await file.arrayBuffer())
  }
  return parseCsv(await file.text())
}

function parseJson(text) {
  const errors = []
  let raw
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { questions: [], errors: ['Invalid JSON: ' + e.message] }
  }
  if (!Array.isArray(raw)) return { questions: [], errors: ['JSON must be an array of questions.'] }

  const questions = []
  raw.forEach((row, i) => {
    const q = normalize(row.text, row.options, row.correctIndex, row.category, i)
    if (q.error) errors.push(q.error)
    else questions.push(q.question)
  })
  return { questions, errors }
}

function parseCsv(text) {
  const parsed = Papa.parse(text.trim(), { header: true, skipEmptyLines: true })
  const errors = parsed.errors.map((e) => `Row ${e.row}: ${e.message}`)
  return { questions: rowsToQuestions(parsed.data, errors), errors }
}

function parseXlsx(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  const firstSheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[firstSheetName]
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
  const errors = []
  return { questions: rowsToQuestions(rows, errors), errors }
}

// Shared by CSV and XLSX, which both use the
// question,option1,option2,option3,option4,correctOption,category columns.
function rowsToQuestions(rows, errors) {
  const questions = []
  rows.forEach((row, i) => {
    const options = [row.option1, row.option2, row.option3, row.option4]
    // Spreadsheets use 1-based correctOption for human editors.
    const correctIndex = Number(row.correctOption) - 1
    const q = normalize(row.question, options, correctIndex, row.category, i)
    if (q.error) errors.push(q.error)
    else questions.push(q.question)
  })
  return questions
}

function normalize(text, options, correctIndex, category, i) {
  if (!text || !Array.isArray(options) || options.some((o) => o === '' || o == null) || options.length !== 4) {
    return { error: `Row ${i + 1}: question needs text and exactly 4 answer options.` }
  }
  const idx = Number(correctIndex)
  if (Number.isNaN(idx) || idx < 0 || idx > 3) {
    return { error: `Row ${i + 1}: correctIndex/correctOption is invalid.` }
  }
  return {
    question: {
      text: String(text).trim(),
      options: options.map((o) => String(o).trim()),
      correctIndex: idx,
      category: category ? String(category).trim() : 'Uncategorized',
    },
  }
}
