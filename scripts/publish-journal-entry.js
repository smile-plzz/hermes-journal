#!/usr/bin/env node
/**
 * publish-journal-entry.js
 *
 * Publishes a journal entry to the Git repository and (optionally) triggers
 * a Vercel deployment. Designed to be called by the Hermes daily pipeline
 * AFTER validate-entry.js and secret-scan.js have passed.
 *
 * Responsibilities:
 *   1. Verify the entry exists and passes validation (re-run validate-entry.js).
 *   2. Run secret-scan on the entry file.
 *   3. Compute today's entry number from existing entries (or use the file's).
 *   4. Stage and commit with a meaningful message.
 *   5. Push to the remote (default: origin/main).
 *   6. Optionally trigger Vercel deployment (if vercel CLI is available).
 *   7. Verify the push went through.
 *   8. Log the outcome.
 *
 * Prerequisites:
 *   - Git is configured with a remote named 'origin' pointing to the GitHub repo.
 *   - The working directory is the repository root.
 *   - git user.name and user.email are configured for commits.
 *   - Vercel token is available via VERCEL_TOKEN env var if --deploy is used.
 *
 * This script does NOT regenerate or modify the entry content. It only handles
 * the publish step.
 *
 * Exit codes:
 *   0 — published successfully
 *   1 — validation/scan failure or publication failure
 *
 * Usage:
 *   node scripts/publish-journal-entry.js [--entry <file.md>] [--deploy] [--dry-run]
 *
 * If --entry is omitted, it defaults to today's entry (content/journal/YYYY/MM/YYYY-MM-DD.md).
 */

'use strict'

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const matter = require('gray-matter')

// ── Config ──────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, '..')
const SCRIPTS_DIR = path.resolve(REPO_ROOT, 'scripts')

// Paths to the helper scripts (relative to REPO_ROOT so they run in the right cwd)
const VALIDATE_SCRIPT = path.relative(REPO_ROOT, path.join(SCRIPTS_DIR, 'validate-entry.js'))
const SECRET_SCAN_SCRIPT = path.relative(REPO_ROOT, path.join(SCRIPTS_DIR, 'secret-scan.js'))

// Default branch (most repos use main; fallback to master)
function defaultBranch() {
  try {
    const b = execSync('git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null || echo main', {
      encoding: 'utf-8',
      cwd: REPO_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    return b || 'main'
  } catch (_) {
    return 'main'
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function exec(cmd, opts = {}) {
  const merged = Object.assign(
    {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    },
    opts
  )
  try {
    return execSync(cmd, merged)
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : ''
    const stdout = err.stdout ? err.stdout.toString() : ''
    throw new Error(
      'Command failed: ' + cmd + '\n' +
      'Exit: ' + err.status + '\n' +
      (stdout ? 'stdout:\n' + stdout + '\n' : '') +
      (stderr ? 'stderr:\n' + stderr + '\n' : '')
    )
  }
}

function todaySlug() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + d
}

function todayEntryPath() {
  const slug = todaySlug()
  return path.join(REPO_ROOT, 'content', 'journal', slug.slice(0, 4), slug.slice(5, 7), slug + '.md')
}

function entryNumberFromPath(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8')
  const parsed = matter(raw)
  return parsed.data.entryNumber != null ? parsed.data.entryNumber : null
}

function entryTitleFromPath(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8')
  const parsed = matter(raw)
  return parsed.data.title || 'Day ' + (parsed.data.entryNumber || '?')
}

// ── Validation helpers (reuse the scripts) ─────────────────────────────

function runValidate(entryPath, extraArgs) {
  const args = [VALIDATE_SCRIPT, entryPath]
  if (extraArgs && extraArgs.length > 0) args.push.apply(args, extraArgs)
  try {
    exec('node ' + args.join(' '))
    return true
  } catch (err) {
    console.error('❌ Validation failed:')
    console.error(err.message)
    return false
  }
}

function runSecretScan(entryPath) {
  const args = [SECRET_SCAN_SCRIPT, entryPath]
  try {
    exec('node ' + args.join(' '))
    return true
  } catch (err) {
    console.error('❌ Secret scan failed:')
    console.error(err.message)
    return false
  }
}

// ── Git helpers ─────────────────────────────────────────────────────────

function gitStatus() {
  try {
    return exec('git status --short').trim()
  } catch (_) {
    return ''
  }
}

function gitDiff() {
  try {
    return exec('git diff').trim()
  } catch (_) {
    return ''
  }
}

function stagedFiles() {
  try {
    return exec('git diff --cached --name-only').trim().split('\n').filter(Boolean)
  } catch (_) {
    return []
  }
}

function commitAndPush(message, branch) {
  exec('git add ' + message.filePath)
  exec('git commit -m "' + message.commitMessage.replace(/"/g, '\\"') + '"')
  exec('git push origin ' + branch)
}

// ── Main ────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2)

  let entryPath = null
  let deploy = false
  let dryRun = false
  let branch = defaultBranch()

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--entry' && args[i + 1]) {
      entryPath = path.resolve(args[++i])
    } else if (args[i] === '--deploy') {
      deploy = true
    } else if (args[i] === '--dry-run') {
      dryRun = true
    } else if (args[i] === '--branch' && args[i + 1]) {
      branch = args[++i]
    }
  }

  if (!entryPath) {
    entryPath = todayEntryPath()
  }

  // ── 1. Check prerequisites ────────────────────────────────────────────
  console.log('=== Hermes Journal Publisher ===')
  console.log('Repo root:   ' + REPO_ROOT)
  console.log('Entry file:  ' + entryPath)
  console.log('Branch:      ' + branch)
  console.log('Deploy:      ' + (deploy ? 'yes' : 'no'))
  console.log('Dry run:     ' + (dryRun ? 'yes' : 'no'))
  console.log('')

  if (!fs.existsSync(entryPath)) {
    console.error('❌ Entry file not found: ' + entryPath)
    console.error('Generate it first: node scripts/generate-journal-entry.js')
    process.exit(1)
  }

  // ── 2. Validate ───────────────────────────────────────────────────────
  console.log('--- Step 1: Validate entry ---')
  if (!runValidate(entryPath)) {
    process.exit(1)
  }
  console.log('')

  // ── 3. Secret scan ────────────────────────────────────────────────────
  console.log('--- Step 2: Secret scan ---')
  if (!runSecretScan(entryPath)) {
    process.exit(1)
  }
  console.log('')

  // ── 4. Compute entry metadata ─────────────────────────────────────────
  const entryNum = entryNumberFromPath(entryPath)
  const entryTitle = entryTitleFromPath(entryPath)
  const slug = path.basename(entryPath, '.md')

  if (entryNum == null) {
    console.error('❌ Could not determine entry number from ' + entryPath)
    process.exit(1)
  }

  console.log('--- Entry metadata ---')
  console.log('Slug:       ' + slug)
  console.log('Entry #:    ' + entryNum)
  console.log('Title:      ' + entryTitle)
  console.log('')

  // ── 5. Check for unexpected changes ───────────────────────────────────
  console.log('--- Step 3: Git diff check ---')
  const diff = gitDiff()
  const status = gitStatus()

  if (status) {
    console.log('Current dirty state:')
    console.log(status)
    console.log('')

    // Only the entry file should be staged/modified for a clean publish.
    // If there are other changes, warn.
    const otherModified = status.split('\n').filter(function (line) {
      const f = line.slice(3)
      return f !== path.relative(REPO_ROOT, entryPath) && f !== path.basename(entryPath)
    })

    if (otherModified.length > 0) {
      console.error('⚠️  Unexpected modified files detected:')
      otherModified.forEach(function (f) { console.error('  - ' + f) })
      console.error('')
      console.error('Commit only the journal entry file for a clean publish.')
      console.error('Use git stash or commit other changes first, then re-run.')
      process.exit(1)
    }
  } else {
    console.log('Working tree clean (no uncommitted changes).')
    console.log('')
  }

  // ── 6. Commit ─────────────────────────────────────────────────────────
  const commitMsg =
    'journal: ' + slug + ' — ' + (entryTitle.length > 40 ? entryTitle.slice(0, 37) + '…' : entryTitle)

  console.log('--- Step 4: Commit ---')
  console.log('Message: ' + commitMsg)

  if (dryRun) {
    console.log('(dry run — skipping actual git operations)')
    console.log('')
    console.log('=== PREVIEW: would commit and push ===')
    console.log('Commit message: ' + commitMsg)
    console.log('Branch:         ' + branch)
    console.log('Entry:          ' + path.relative(REPO_ROOT, entryPath))
    console.log('')
    console.log('=== Ready to publish ===')
    process.exit(0)
  }

  // Stage only the entry file
  exec('git add ' + entryPath)

  // Verify what we're about to commit
  const staged = stagedFiles()
  if (staged.length === 0) {
    console.error('❌ Nothing to commit. The entry file may already be committed.')
    process.exit(1)
  }

  if (staged.length > 1) {
    console.error('❌ Expected to stage only the entry file, but got:')
    staged.forEach(function (f) { console.error('  - ' + f) })
    process.exit(1)
  }

  exec('git commit -m "' + commitMsg.replace(/"/g, '\\"') + '"')

  console.log('Committed: ' + commitMsg)
  console.log('')

  // ── 7. Push ───────────────────────────────────────────────────────────
  console.log('--- Step 5: Push ---')

  // Check for unpushed commits
  const unpushed = exec('git log --oneline origin/' + branch + '..HEAD 2>/dev/null || echo').trim()
  if (!unpushed) {
    console.log('Nothing to push (up to date with remote).')
  } else {
    console.log('Unpushed commits:')
    console.log(unpushed)
    console.log('')

    exec('git push origin ' + branch)
    console.log('Pushed to origin/' + branch + '.')
  }

  console.log('')

  // ── 8. Verify push ────────────────────────────────────────────────────
  console.log('--- Step 6: Verify push ---')
  const latestCommit = exec('git rev-parse HEAD').trim()
  const remoteCommit = (function () {
    try {
      return exec('git rev-parse origin/' + branch).trim()
    } catch (_) {
      return null
    }
  })()

  if (remoteCommit === latestCommit) {
    console.log('✅ Remote is up to date with local HEAD.')
    console.log('   Commit: ' + latestCommit.slice(0, 7))
  } else {
    console.error('⚠️  Remote (' + (remoteCommit ? remoteCommit.slice(0, 7) : 'unknown') + ') differs from local (' + latestCommit.slice(0, 7) + ')')
    console.error('Push may have failed. Check git push output above.')
  }

  console.log('')

  // ── 9. Deploy (optional) ──────────────────────────────────────────────
  if (deploy) {
    console.log('--- Step 7: Deploy to Vercel ---')
    const vercelToken = process.env.VERCEL_TOKEN
    if (!vercelToken) {
      console.error('⚠️  VERCEL_TOKEN not set. Skipping deployment trigger.')
      console.error('Set VERCEL_TOKEN environment variable to enable auto-deploy.')
    } else {
      try {
        exec('vercel deploy --prod --token ' + vercelToken, {
          stdio: 'inherit',
        })
        console.log('Vercel deployment triggered.')
      } catch (err) {
        console.error('Vercel deployment failed:')
        console.error(err.message)
      }
    }
  }

  // ── 10. Done ──────────────────────────────────────────────────────────
  console.log('=== Publish complete ===')
  console.log('Entry:    ' + path.relative(REPO_ROOT, entryPath))
  console.log('Commit:   ' + latestCommit.slice(0, 7))
  console.log('Branch:   ' + branch)
  console.log('Pushed:   ' + (remoteCommit === latestCommit ? 'yes' : 'UNCERTAIN'))
  console.log('Deploy:   ' + (deploy ? (vercelToken ? 'triggered' : 'skipped (no token)') : 'not requested'))
}

main()
