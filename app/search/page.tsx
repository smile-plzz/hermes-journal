'use client'
import React, { useState, useEffect } from 'react'
import { JournalEntry } from '../../lib/journal'

export default function SearchPage() {
  return (
    <div className="container">
      <header className="header">
        <p className="brand">Hermes</p>
        <h1 className="title" style={{ fontSize: 28 }}>Search</h1>
        <p className="subtitle" style={{ marginBottom: 20 }}>
          Find entries by date, keyword, project, or topic.
        </p>
        <a href="/" style={{ fontSize: 13, color: '#999' }}>← Back to journal</a>
      </header>

      <SearchFormAndResults />

      <footer className="footer">
        <a href="/" style={{ color: '#999' }}>← Back to journal</a>
      </footer>
    </div>
  )
}

function SearchFormAndResults() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const initialQ = params.get('q') || ''
    setQ(initialQ)
    if (initialQ) {
      setLoading(true)
      fetch(`/api/search?q=${encodeURIComponent(initialQ)}`)
        .then(r => r.json())
        .then(data => setResults(data.results || []))
        .finally(() => setLoading(false))
    }
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    window.location.search = `?q=${encodeURIComponent(q)}`
  }

  return (
    <>
      <div className="search-section">
        <form onSubmit={handleSubmit} style={{ position: 'relative' }}>
          <input
            name="q"
            type="search"
            className="search-input"
            placeholder="Search entries…"
            value={q}
            onChange={e => setQ(e.target.value)}
            style={{ fontSize: 15 }}
          />
        </form>
      </div>

      <div className="search-results">
        {loading && <p style={{ color: '#999', textAlign: 'center' }}>Searching…</p>}
        {!loading && q && results.length === 0 && (
          <div className="search-empty">No entries matched "{q}".</div>
        )}
        {!loading && results.length > 0 && (
          <div>
            <p style={{ color: '#999', fontSize: 12, marginBottom: 12 }}>
              {results.length} result{results.length !== 1 ? 's' : ''} for "{q}"
            </p>
            {results.map(entry => (
              <a
                key={entry.slug}
                href={`/entries/${entry.slug}`}
                className="search-result-entry"
              >
                <div className="search-result-date">
                  {new Date(entry.date).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                  })}
                  {' · '}
                  Day {entry.entryNumber}
                </div>
                <div className="search-result-title">{entry.title || `Day ${entry.entryNumber}`}</div>
                <div className="search-result-summary">{entry.summary || 'No summary.'}</div>
              </a>
            ))}
          </div>
        )}
        {!loading && !q && (
          <div className="search-empty">
            Enter a keyword, date, project name, or topic above.
          </div>
        )}
      </div>
    </>
  )
}
