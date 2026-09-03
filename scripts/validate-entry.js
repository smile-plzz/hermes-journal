#!/usr/bin/env node
/**
 * validate-journal-entry.js
 *
 * Validates a journal entry markdown file.
 *
 * Usage:
 *   node scripts/validate-entry.js <entry-file.md>
 *   node scripts/validate-entry.js --today
 *
 * Defaults to ./content/journal. Use --content-dir to override.
 *
 * Exit 0 = valid, 1 = invalid.
 */

'use strict'

const fs = require('fs')
const path = require('path')
const matter = require('gray-matter')

function parseDateFromFilename(filename) {
  const m = filename.match(/^(\d{4})-(\d{2})-(\d{2})\.md$/)
  if (!m) return null
  const d = new Date(+m[1], +m[2] - 1, +m[3])
  if (isNaN(d.getTime())) return null
  return { year: m[1], month: m[2], day: m[3], slug: m[0].replace(/\.md$/, ''), date: d }
}

function isToday(slug) {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return slug === y + '-' + m + '-' + d
}

function validateFrontmatter(data, dateStr) {
  const errors = []
  if (!dateStr) errors.push('Missing frontmatter.date')
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) errors.push('frontmatter.date must be YYYY-MM-DD, got: ' + JSON.stringify(dateStr))

  if (data.entryNumber == null) errors.push('Missing frontmatter.entryNumber')
  else if (!Number.isInteger(data.entryNumber) || data.entryNumber < 1) errors.push('frontmatter.entryNumber must be a positive integer, got: ' + data.entryNumber)

  if (!data.title || typeof data.title !== 'string' || data.title.trim() === '') errors.push('Missing or empty frontmatter.title')

  if (data.tags != null && !Array.isArray(data.tags)) errors.push('frontmatter.tags must be an array if present')
  if (data.projects != null && !Array.isArray(data.projects)) errors.push('frontmatter.projects must be an array if present')
  if (data.milestone != null && typeof data.milestone !== 'boolean') errors.push('frontmatter.milestone must be a boolean if present')

  return errors
}

function main() {
  const args = process.argv.slice(2)
  let contentDir = path.resolve('content', 'journal')
  let targetPath = null

  // Parse --content-dir flag
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--content-dir' && args[i + 1]) {
      contentDir = path.resolve(args[i + 1])
      args.splice(i, 2)
      i -= 2
    }
  }

  if (args.length === 0) {
    console.error('Usage: node scripts/validate-entry.js <entry-file.md>')
    console.error('   or: node scripts/validate-entry.js --today')
    console.error('   or: node scripts/validate-entry.js --today --content-dir <dir>')
    process.exit(1)
  }

  if (args[0] === '--today') {
    const now = new Date()
    const y = String(now.getFullYear())
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    targetPath = path.join(contentDir, y, m, y + '-' + m + '-' + d + '.md')
  } else {
    targetPath = path.resolve(args[0])
  }

  if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
    console.error('File not found: ' + targetPath)
    process.exit(1)
  }

  const raw = fs.readFileSync(targetPath, 'utf-8')
  const { data, content } = matter(raw)

  const filename = path.basename(targetPath)
  const parsedFilename = parseDateFromFilename(filename)

  if (!parsedFilename) {
    console.error('Filename must be YYYY-MM-DD.md, got: ' + filename)
    process.exit(1)
  }

  // gray-matter parses "2026-09-03" as a Date object by default.
  // Coerce to ISO date string for consistent comparison.
  let dateStr = ''
  if (data.date != null) {
    if (data.date instanceof Date) dateStr = data.date.toISOString().slice(0, 10)
    else dateStr = String(data.date).slice(0, 10)
  }

  const errors = []

  // 1. Frontmatter validation
  const fmErrors = validateFrontmatter(data, dateStr)
  fmErrors.forEach(e => errors.push('[frontmatter] ' + e))

  // 2. Filename/date consistency
  if (dateStr && dateStr !== parsedFilename.slug) {
    errors.push('Filename date (' + parsedFilename.slug + ') does not match frontmatter.date (' + dateStr + ')')
  }

  // 3. Duplicate date check
  const year = parsedFilename.year
  const month = parsedFilename.month
  const expectedDir = path.join(contentDir, year, month)
  if (fs.existsSync(expectedDir)) {
    const files = fs.readdirSync(expectedDir).filter(f => f.endsWith('.md'))
    const otherFiles = files.filter(f => path.basename(f, '.md') === parsedFilename.slug && f !== filename)
    if (otherFiles.length > 0) errors.push('Duplicate entry for ' + parsedFilename.slug + ': ' + otherFiles.join(', '))
  }

  // 4. Content checks
  if (content.trim().length < 20) errors.push('Content too short (likely empty or placeholder)')

  // 5. Section warnings (non-fatal)
  const warnings = []
  const hasWhatHappened = /#{1,2}\s*what happened/i.test(content)
  const hasWhatIBuilt = /#{1,2}\s*what i built/i.test(content)
  const hasProblems = /#{1,2}\s*(problems|failures|what went wrong)/i.test(content)
  const hasLearned = /#{1,2}\s*(what i learned|learning)/i.test(content)
  const hasDecisions = /#{1,2}\s*decisions/i.test(content)
  const hasTakeaways = /#{1,2}\s*key takeaways/i.test(content)
  const hasNext = /#{1,2}\s*(tomorrow|next)/i.test(content)

  if (isToday(parsedFilename.slug)) {
    if (!hasWhatHappened) warnings.push("Today's entry: consider adding 'What happened' section")
    if (!hasWhatIBuilt) warnings.push("Today's entry: consider adding 'What I built' section")
    if (!hasProblems) warnings.push("Today's entry: consider adding 'Problems/Failures' section")
    if (!hasLearned) warnings.push("Today's entry: consider adding 'What I learned' section")
    if (!hasDecisions) warnings.push("Today's entry: consider adding 'Decisions' section")
    if (!hasTakeaways) warnings.push("Today's entry: consider adding 'Key takeaways' section")
    if (!hasNext) warnings.push("Today's entry: consider adding 'Tomorrow / next' section")
  }

  // Report
  if (errors.length > 0) {
    console.error('❌ Validation failed for: ' + targetPath)
    errors.forEach(e => console.error('  • ' + e))
    process.exit(1)
  }

  if (warnings.length > 0) {
    console.error('⚠️  Warnings for: ' + targetPath)
    warnings.forEach(w => console.error('  • ' + w))
  }

  console.log('✅ Valid: ' + targetPath)
  console.log('   Date:     ' + (data.date || parsedFilename.slug))
  console.log('   Entry #:  ' + (data.entryNumber != null ? data.entryNumber : '—'))
  console.log('   Title:    ' + (data.title || '—'))
  console.log('   Content:  ' + content.trim().split(/\s+/).length + ' words')
  if (warnings.length > 0) console.log('   Warnings: ' + warnings.length + ' (see above)')
}

main()
