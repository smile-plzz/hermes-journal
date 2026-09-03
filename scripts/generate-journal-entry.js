#!/usr/bin/env node
/**
 * generate-journal-entry.js
 *
 * Generates today's journal entry markdown and writes it to:
 *   content/journal/YYYY/MM/YYYY-MM-DD.md
 *
 * Idempotent: re-running produces a fresh draft for the same date.
 * Run from repo root. Exit code:
 *   0 — written successfully
 *   1 — error
 *
 * Usage:
 *   node scripts/generate-journal-entry.js [--content-dir ./content/journal]
 *
 * The generated file is a DRAFT. It must be reviewed, edited as needed,
 * then committed and pushed by the publishing workflow (see publish-journal-entry.js).
 */

const fs = require('fs')
const path = require('path')

// ── Config ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
let contentDir = path.resolve('content', 'journal')
let force = false

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--content-dir' && args[i + 1]) {
    contentDir = path.resolve(args[i + 1])
    i++
  } else if (args[i] === '--force') {
    force = true
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function todaySlug() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + d
}

function todayNice() {
  const now = new Date()
  return now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function entryNumberForDate(slug) {
  const parts = slug.split('-')
  if (parts.length !== 3) return 1
  const year = parts[0]
  const month = parts[1]
  const monthDir = path.join(contentDir, year, month)
  if (!fs.existsSync(monthDir)) return 1

  const files = fs
    .readdirSync(monthDir)
    .filter(function (f) { return f.endsWith('.md') })
    .sort()

  if (files.length === 0) return 1

  const matching = files.filter(function (f) {
    return f.startsWith(slug + '.md')
  })

  if (matching.length > 0) {
    const raw = fs.readFileSync(path.join(monthDir, matching[0]), 'utf-8')
    const matter = require('gray-matter')
    const parsed = matter(raw)
    return parsed.data.entryNumber != null ? parsed.data.entryNumber : files.indexOf(matching[0]) + 1
  }

  // Not found — assume it's new; assign next number
  const allEntries = files.map(function (f) {
    const raw = fs.readFileSync(path.join(monthDir, f), 'utf-8')
    const matter = require('gray-matter')
    const parsed = matter(raw)
    return {
      slug: f.replace(/\.md$/, ''),
      num: parsed.data.entryNumber != null ? parsed.data.entryNumber : 0,
      file: f,
    }
  })

  if (allEntries.length === 0) return 1
  const maxNum = allEntries.reduce(function (acc, e) { return Math.max(acc, e.num) }, 0)
  return maxNum + 1
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function writeTodayEntry() {
  // ── Template ──────────────────────────────────────────────────────────

  // Placeholder content — the publisher/pipeline should expand this with
  // actual daily activity before committing. This skeleton provides the
  // expected shape and frontmatter.

  const slug = todaySlug()
  const year = slug.slice(0, 4)
  const month = slug.slice(5, 7)
  const dayDir = path.join(contentDir, year, month)
  ensureDir(dayDir)

  const outPath = path.join(dayDir, slug + '.md')

  // If file already exists, we do NOT overwrite. The caller should re-run
  // with --force to regenerate a fresh draft.
  if (fs.existsSync(outPath) && !force) {
    console.error('Entry already exists: ' + outPath)
    console.error('Use --force to overwrite with a fresh draft.')
    process.exit(1)
  }

  const entryNum = entryNumberForDate(slug)

  const md = `---
date: "${slug}"
entryNumber: ${entryNum}
title: "Day ${entryNum}"
summary: ""
tags: []
projects: []
---

# Day ${entryNum}
${todayNice()}

<!-- TODO: replace with actual daily journal content -->

## What happened today

-

## What I built

-

## Problems encountered

-

## What I learned

-

## Decisions

-

## Key takeaways

-

## Tomorrow / next

-
`

  fs.writeFileSync(outPath, md, 'utf-8')
  console.log('Wrote: ' + outPath)
  return { slug: slug, path: outPath }
}

// ── CLI ─────────────────────────────────────────────────────────────────

var result = writeTodayEntry()

// Print the path so callers can use it (e.g. for the publisher pipeline)
console.log(result.slug)
