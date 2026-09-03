import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { Marked } from 'marked'

const CONTENT_DIR = path.join(process.cwd(), 'content', 'journal')
const marked = new Marked()

export interface JournalEntry {
  slug: string
  date: string
  entryNumber: number
  title: string
  summary: string
  tags: string[]
  projects: string[]
  content: string
  frontmatter: Record<string, unknown>
  html: string
}

export interface EntryListItem {
  slug: string
  date: string
  entryNumber: number
  title: string
  summary: string
}

export function dateFromSlug(slug: string): Date {
  const [y, m, d] = slug.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function getAllEntriesSync(): JournalEntry[] {
  const results: JournalEntry[] = []

  if (!fs.existsSync(CONTENT_DIR)) return results

  const years = fs.readdirSync(CONTENT_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort()

  for (const year of years) {
    const yearDir = path.join(CONTENT_DIR, year)
    const months = fs.readdirSync(yearDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .sort()

    for (const month of months) {
      const monthDir = path.join(yearDir, month)
      const files = fs
        .readdirSync(monthDir)
        .filter(f => f.endsWith('.md'))
        .sort()

      for (const file of files) {
        const slug = file.replace(/\.md$/, '')
        const filePath = path.join(monthDir, file)
        const raw = fs.readFileSync(filePath, 'utf-8')
        const { data, content } = matter(raw)

        results.push({
          slug,
          date: slug,
          entryNumber: data.entryNumber ?? 0,
          title: data.title ?? '',
          summary: data.summary ?? '',
          tags: Array.isArray(data.tags) ? data.tags : [],
          projects: Array.isArray(data.projects) ? data.projects : [],
          content,
          frontmatter: data,
          html: marked.parse(content) as string,
        })
      }
    }
  }

  results.sort((a, b) => dateFromSlug(b.slug).getTime() - dateFromSlug(a.slug).getTime())
  return results
}

export function getEntryBySlug(slug: string): JournalEntry | null {
  const parts = slug.split('-')
  if (parts.length !== 3) return null
  const [year, month] = parts
  const filePath = path.join(CONTENT_DIR, year, month, `${slug}.md`)
  if (!fs.existsSync(filePath)) return null

  const raw = fs.readFileSync(filePath, 'utf-8')
  const { data, content } = matter(raw)

  return {
    slug,
    date: slug,
    entryNumber: data.entryNumber ?? 0,
    title: data.title ?? '',
    summary: data.summary ?? '',
    tags: Array.isArray(data.tags) ? data.tags : [],
    projects: Array.isArray(data.projects) ? data.projects : [],
    content,
    frontmatter: data,
    html: marked.parse(content) as string,
  }
}

export function entryExists(slug: string): boolean {
  const parts = slug.split('-')
  if (parts.length !== 3) return false
  const [year, month] = parts
  const filePath = path.join(CONTENT_DIR, year, month, `${slug}.md`)
  return fs.existsSync(filePath)
}

export function nextEntryNumber(): number {
  const entries = getAllEntriesSync()
  if (entries.length === 0) return 1
  return Math.max(...entries.map(e => e.entryNumber)) + 1
}

export function getRecentEntries(count = 5): EntryListItem[] {
  const entries = getAllEntriesSync()
  return entries.slice(0, count).map(e => ({
    slug: e.slug,
    date: e.date,
    entryNumber: e.entryNumber,
    title: e.title,
    summary: e.summary,
  }))
}

export function newTodaySlug(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function newTodayDateString(): string {
  const now = new Date()
  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }
  return now.toLocaleDateString('en-US', opts)
}

export function getMilestones(): JournalEntry[] {
  const entries = getAllEntriesSync()
  return entries.filter(e => e.frontmatter.milestone === true)
}

export function searchEntries(query: string): JournalEntry[] {
  if (!query.trim()) return []
  const q = query.toLowerCase()
  return getAllEntriesSync().filter(
    e =>
      e.title.toLowerCase().includes(q) ||
      e.summary.toLowerCase().includes(q) ||
      e.content.toLowerCase().includes(q) ||
      e.tags.some(t => t.toLowerCase().includes(q)) ||
      e.projects.some(t => t.toLowerCase().includes(q)),
  )
}
