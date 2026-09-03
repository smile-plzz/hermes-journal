function slugDateParts(slug) {
  // "2026-09-03" -> { year, month, day }
  const m = slug.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return {
    year: m[1],
    month: m[2],
    day: m[3],
    date: new Date(+m[1], +m[2] - 1, +m[3]),
  }
}

function slugFromDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + d
}

function dateLabel(slug) {
  const parts = slugDateParts(slug)
  if (!parts) return slug
  return parts.date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function dateShort(slug) {
  const parts = slugDateParts(slug)
  if (!parts) return slug
  return parts.date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

module.exports = { slugDateParts, slugFromDate, dateLabel, dateShort }
