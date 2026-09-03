import { searchEntries, getAllEntriesSync } from '../../lib/journal'

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

      <div className="search-section">
        <SearchForm />
      </div>

      <div className="search-results">
        <SearchResults />
      </div>

      <footer className="footer">
        <a href="/" style={{ color: '#999' }}>← Back to journal</a>
      </footer>
    </div>
  )
}

function SearchForm() {
  'use client'
  return (
    <form
      action="/api/search"
      method="get"
      style={{ position: 'relative' }}
    >
      <input
        name="q"
        type="search"
        className="search-input"
        placeholder="Search entries…"
        defaultValue={new URLSearchParams(window.location.search).get('q') || ''}
        style={{ fontSize: 15 }}
      />
    </form>
  )
}

function SearchResults() {
  'use client'
  const params = new URLSearchParams(window.location.search)
  const q = params.get('q')
  // We'll fill results from API after mount — but for SSR we keep it simple.
  return <div id="search-results-root" />
}
