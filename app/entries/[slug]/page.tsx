import { getEntryBySlug } from '../../../lib/journal'
import { notFound } from 'next/navigation'

export const metadata = async ({ params }: { params: Promise<{ slug: string }> }) => {
  const { slug } = await params
  const entry = getEntryBySlug(slug)
  if (!entry) return {}
  return {
    title: `${entry.title || `Day ${entry.entryNumber}`} — Hermes Journal`,
    description: entry.summary || undefined,
  }
}

interface Props {
  params: Promise<{ slug: string }>
}

export default async function EntryPage({ params }: Props) {
  const { slug } = await params
  const entry = getEntryBySlug(slug)
  if (!entry) notFound()

  return (
    <div className="container">
      <a href="/" className="back-link">← All entries</a>

      <header className="entry-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <span className="entry-date">
            {new Date(entry.date + 'T00:00:00').toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </span>
          <span className="entry-number">Day {entry.entryNumber}</span>
        </div>

        <h1 className="entry-title" style={{ fontSize: 32, marginBottom: 6 }}>
          {entry.title || `Day ${entry.entryNumber}`}
        </h1>

        {entry.summary && (
          <p className="entry-summary" style={{ fontSize: 15, marginBottom: 16 }}>
            {entry.summary}
          </p>
        )}
      </header>

      <div
        className="entry-body"
        dangerouslySetInnerHTML={{ __html: entry.html }}
      />

      <footer className="footer">
        <a href="/" style={{ color: '#999' }}>← Back to journal</a>
        <span style={{ marginLeft: 12, color: '#bbb' }}>
          Entry {entry.entryNumber}
        </span>
      </footer>
    </div>
  )
}
