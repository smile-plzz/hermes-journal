#!/usr/bin/env node
/**
 * secret-scan.js
 *
 * Scans a journal entry (or a git diff) for accidental secrets before publishing.
 *
 * Usage:
 *   node scripts/secret-scan.js <entry-file.md>
 *   node scripts/secret-scan.js --diff <git-diff-output>
 *   node scripts/secret-scan.js --staged
 *
 * Exits 1 if potential secrets are found (after review-able warnings).
 * Exits 0 if clean.
 */

'use strict'

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

// ── Patterns ────────────────────────────────────────────────────────────
// Each entry: { name, pattern (RegExp), reason }
// We intentionally avoid patterns that would match the presence of the word
// "token" or "key" in normal prose. These target actual credential material.

const SECRET_PATTERNS = [
  {
    name: 'GitHub PAT (ghp_)',
    pattern: /ghp_[A-Za-z0-9]{36,}/,
    reason: 'GitHub personal access token',
  },
  {
    name: 'GitHub PAT (gho_)',
    pattern: /gho_[A-Za-z0-9]{36,}/,
    reason: 'GitHub OAuth token',
  },
  {
    name: 'GitHub PAT (ghu_)',
    pattern: /ghu_[A-Za-z0-9]{36,}/,
    reason: 'GitHub user-to-server token',
  },
  {
    name: 'GitHub PAT (ghs_)',
    pattern: /ghs_[A-Za-z0-9]{36,}/,
    reason: 'GitHub server-to-server token',
  },
  {
    name: 'GitHub PAT (ghr_)',
    pattern: /ghr_[A-Za-z0-9]{36,}/,
    reason: 'GitHub refresh token',
  },
  {
    name: 'GitHub classic PAT (long hex/string)',
    pattern: /[A-Za-z0-9_-]{40,}=*/,
    reason: 'Possible GitHub classic token (long alphanumeric string)',
  },
  {
    name: 'Vercel token (vercel_)',
    pattern: /vercel_[A-Za-z0-9_-]{32,}/,
    reason: 'Vercel API token',
  },
  {
    name: 'Vercel API key',
    pattern: /vk_live_[A-Za-z0-9_-]{20,}/,
    reason: 'Vercel API key',
  },
  {
    name: 'Slack token',
    pattern: /xox[baprs]-[A-Za-z0-9\-]{10,}/,
    reason: 'Slack bot/user/legacy token',
  },
  {
    name: 'Discord bot token',
    pattern: /(?:[A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{64}|M[A-Za-z0-9_-]{24,})/,
    reason: 'Discord bot token',
  },
  {
    name: 'Telegram bot token',
    pattern: /\d{8,10}:[A-Za-z0-9_-]{35}/,
    reason: 'Telegram bot token',
  },
  {
    name: 'OAuth access token (generic)',
    pattern: /[A-Za-z0-9_-]{40,}=*/,
    reason: 'Possible OAuth access token',
  },
  {
    name: 'AWS access key ID',
    pattern: /AKIA[0-9A-Za-z]{16}/,
    reason: 'AWS access key ID',
  },
  {
    name: 'AWS secret access key',
    pattern: /(?:[A-Za-z0-9/+=]{40})/,
    reason: 'Possible AWS secret key (40-char base64)',
  },
  {
    name: 'Generic private key header',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    reason: 'Private key material',
  },
  {
    name: 'JWT token',
    pattern: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
    reason: 'JSON Web Token',
  },
  {
    name: 'Generic API key assignment',
    pattern: /\b(api[_-]?key|apikey|secret|password|passwd|auth_token|Bearer)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{20,}['"]?/i,
    reason: 'Possible API key / secret assignment',
  },
  {
    name: 'Environment variable with secret-looking value',
    pattern: /(?:process\.env|ENV\[|env:)[\.A-Za-z0-9_]+\s*[:=]\s*['"]?[A-Za-z0-9_\-]{20,}['"]?/i,
    reason: 'Possible exposed env var with secret value',
  },
]

// ── Helpers ─────────────────────────────────────────────────────────────

function matchesInText(text, patterns) {
  const results = []
  for (const p of patterns) {
    let m
    // Reset lastIndex
    p.pattern.lastIndex = 0
    while ((m = p.pattern.exec(text)) !== null) {
      // Only report the first match per pattern to avoid flooding
      results.push({
        name: p.name,
        reason: p.reason,
        match: m[0],
        index: m.index,
      })
      break
    }
  }
  return results
}

function redact(text, patterns) {
  let out = text
  for (const p of patterns) {
    out = out.replace(p.pattern, '***REDACTED***')
  }
  return out
}

// ── File scan ───────────────────────────────────────────────────────────

function scanFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error('File not found: ' + filePath)
    process.exit(1)
  }

  const raw = fs.readFileSync(filePath, 'utf-8')
  const hits = matchesInText(raw, SECRET_PATTERNS)

  return { filePath, text: raw, hits, redacted: redact(raw, SECRET_PATTERNS) }
}

// ── Diff scan ───────────────────────────────────────────────────────────

function scanDiff(diffText) {
  // Only scan added/modified lines (starting with +), skip removed lines (-)
  const addedLines = diffText
    .split('\n')
    .filter(function (line) { return line.startsWith('+') && !line.startsWith('+++') })

  const text = addedLines.join('\n')
  return matchesInText(text, SECRET_PATTERNS)
}

// ── Staged diff ─────────────────────────────────────────────────────────

function scanStaged() {
  try {
    const diff = execSync('git diff --staged --unified=5', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const hits = scanDiff(diff)
    return { source: 'git diff --staged', hits, fullText: diff }
  } catch (err) {
    if (err.status === 1 && !err.output.toString().trim()) {
      // No changes staged — that's fine
      return { source: 'git diff --staged', hits: [], fullText: '' }
    }
    throw err
  }
}

// ── Main ────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2)

  let sourceLabel = ''
  let hits = []
  let originalText = ''

  if (args.length === 0) {
    console.error('Usage:')
    console.error('  node scripts/secret-scan.js <entry-file.md>')
    console.error('  node scripts/secret-scan.js --diff "<git-diff-text>"')
    console.error('  node scripts/secret-scan.js --staged')
    process.exit(1)
  }

  if (args[0] === '--diff') {
    if (!args[1]) {
      console.error('--diff requires the diff text as the second argument')
      process.exit(1)
    }
    sourceLabel = 'provided diff'
    hits = scanDiff(args[1])
    originalText = args[1]
  } else if (args[0] === '--staged') {
    const result = scanStaged()
    sourceLabel = result.source
    hits = result.hits
    originalText = result.fullText
  } else {
    const result = scanFile(args[0])
    sourceLabel = 'file: ' + path.resolve(args[0])
    hits = result.hits
    originalText = result.text
  }

  if (hits.length > 0) {
    console.error('❌ Potential secrets found (' + hits.length + ' match' + (hits.length > 1 ? 'es' : '') + '):')
    hits.forEach(function (h, i) {
      console.error('')
      console.error('  [' + (i + 1) + '] ' + h.name)
      console.error('      Reason: ' + h.reason)
      // Show a small window around the match for context
      const before = Math.max(0, h.index - 20)
      const after = Math.min(originalText.length, h.index + h.match.length + 20)
      const windowText = originalText.slice(before, after)
      console.error('      Context: ...' + windowText.replace(/\n/g, '\\n') + '...')
      console.error('      Value:   ' + h.match)
    })

    console.error('')
    console.error('Please remove or redact the above before publishing.')
    console.error('These patterns are intentionally broad to catch accidental leakage.')
    console.error('Not every match is necessarily a real secret — review each one.')
    process.exit(1)
  }

  console.log('✅ No secrets detected in ' + sourceLabel)
  process.exit(0)
}

main()
