// registry.ts — in-memory catalog of what happened today
// Populated by the ingest loop; consumed by the summariser.

export interface IngestItem {
  time: string // HH:MM
  kind: 'command' | 'build' | 'deploy' | 'config' | 'decision' | 'problem' | 'fix' | 'discovery' | 'note'
  title: string
  detail: string
  source?: string // file/command that surfaced this
}

export function ingest(item: IngestItem): void {
  REGISTRY.push(item)
}

export function snapshot(): readonly IngestItem[] {
  return REGISTRY
}

export function reset(): void {
  REGISTRY.length = 0
}

// Mutable registry for this run.
const REGISTRY: IngestItem[] = []
