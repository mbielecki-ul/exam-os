// Shared logic for domain-restricted exams. An exam with an empty/missing
// allowedDomains list is open to everyone; a non-empty list restricts it to
// email addresses ending in one of those domains.

export function getEmailDomain(email) {
  return (email || '').split('@')[1]?.toLowerCase().trim() || ''
}

export function examAllowsEmail(exam, email) {
  const domains = exam.allowedDomains
  if (!domains || domains.length === 0) return true
  return domains.includes(getEmailDomain(email))
}

// Parses the admin's comma-separated input into a clean, deduped, lowercase
// domain list. Returns [] for "open to everyone".
export function parseDomainList(input) {
  return [
    ...new Set(
      (input || '')
        .split(',')
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean)
    ),
  ]
}
