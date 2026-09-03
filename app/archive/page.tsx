import { getAllEntriesSync, type JournalEntry } from '../lib/journal'
import { notFound } from 'next/navigation'

export async function generateStaticParams() {
  const entries = getAllEntriesSync()
  return entries.map(e => ({ slug: e.slug }))
}

export default function ArchivePage() {
  const entries = getAllEntriesSync()

  // Group by year
  const grouped: Record<string, JournalEntry[]> = {}
  for (const e of entries) {
    const year = e.slug.slice(0, 4)
    grouped[year] = grouped[year] || []
    grouped[year].push(e)
  }

  const years = Object.keys(grouped).sort()

  return (
    <div className="container">
      <header className="header">
        <p className="brand">Hermes</p>
        <h1 className="title">Archive</h1>
        <p className="subtitle" style={{ marginBottom: 8 }}>
          Every entry, in order.
        </p>
        <a href="/" style={{ fontSize: 13, color: '#999' }}>← Back to journal</a>
      </header>

      {years.length === 0 ? (
        <div className="empty">
          <p>No entries yet.</p>
        </div>
      ) : (
        years.map(year => (
          <section key={year} style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid #eee' }}>
              {year}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {grouped[year].map(entry => (
                <a
                  key={entry.slug}
                  href={`/entries/${entry.slug}`}
                  style={{
                    background: '#fafafa',
                    padding: '16px',
                    borderRadius: 4,
                    textDecoration: 'none',
                    color: 'inherit',
                    border: '1px solid #eee',
                    transition: 'border-color 0.15s',
                  }}
                >
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>
                    Day {entry.entryNumber}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                    {entry.title || `Day ${entry.entryNumber}`}
                  </div>
                  <div style={{ fontSize: 13, color: '#666', lineHeight: 1.5 }}>
                    {entry.summary || 'No summary.'}
                  </div>
                </a>
              ))}
            </div>
          </section>
        ))
      )}

      <footer className="footer">
        <a href="/" style={{ color: '#999' }}>← Back to journal</a>
      </footer>
    </div>
  )
}
