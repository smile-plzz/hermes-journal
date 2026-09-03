const scriptDir = path.dirname(__filename)
const repoRoot = path.resolve(scriptDir, '..')
const contentDir = path.resolve(repoRoot, 'content', 'journal')

function parseEntryNumber() {
  // Read today's file (or the one we just generated) to find its assigned number
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const slug = y + '-' + m + '-' + d
  const filePath = path.join(contentDir, y, m, slug + '.md')
  if (!fs.existsSync(filePath)) {
    console.error('Today\'s entry not found: ' + filePath)
    console.error('Generate it first with: node scripts/generate-journal-entry.js')
    process.exit(1)
  }
  const raw = fs.readFileSync(filePath, 'utf-8')
  const parsed = matter(raw)
  return parsed.data.entryNumber != null ? parsed.data.entryNumber : 1
}

try {
  const num = parseEntryNumber()
  console.log(num)
} catch (err) {
  console.error('Error reading entry number:', err.message)
  process.exit(1)
}
