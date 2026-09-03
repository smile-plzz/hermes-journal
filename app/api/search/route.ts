import { NextRequest, NextResponse } from 'next/server'
import { searchEntries } from '@/lib/journal'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q') ?? ''
  const entries = searchEntries(q)

  const results = entries.map(e => ({
    slug: e.slug,
    date: e.date,
    entryNumber: e.entryNumber,
    title: e.title || `Day ${e.entryNumber}`,
    summary: e.summary || '',
  }))

  return NextResponse.json({ query: q, count: results.length, results })
}
