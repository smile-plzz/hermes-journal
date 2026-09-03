#!/usr/bin/env node
/**
 * daily-journal-pipeline.js
 *
 * End-to-end daily journal pipeline:
 *   1. Determine today's date and slug.
 *   2. Check whether today's entry already exists.
 *   3. If not, generate a skeleton draft using generate-journal-entry.js.
 *   4. (In the full system, this is where Hermes analyses the day's activity
 *      and fills in the content. For now, the generated draft is reviewed
 *      and edited before publishing.)
 *   5. Validate the entry (validate-entry.js).
 *   6. Secret scan (secret-scan.js).
 *   7. Publish (publish-journal-entry.js).
 *
 * This script is the orchestration layer. In actual Hermes operation, the
 * content generation step is replaced by the Hermes reflection process that
 * reads the day's activity and writes the entry body. This script provides
 * the scaffolding and wiring.
 *
 * Exit codes:
 *   0 — pipeline completed (entry may or may not have been published;
 *       dry-run / already-exists / manual-edit-needed are all success states
 *       for the pipeline itself, as long as no errors occurred).
 *   1 — pipeline error.
 *
 * Usage:
 *   node scripts/daily-journal-pipeline.js [--deploy] [--dry-run] [--force-generate]
 *
 * Options:
 *   --deploy        Trigger Vercel deployment after push.
 *   --dry-run       Simulate the pipeline without committing or pushing.
 *   --force-generate  Regenerate today's entry even if one already exists
 *                     (uses generate-journal-entry.js --force).
 *
 * Environment:
 *   JOURNAL_CONTENT_DIR  — content directory (default: ./content/journal)
 */

'use strict'

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

// ── Config ──────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, '..')
const SCRIPTS_DIR = path.resolve(REPO_ROOT, 'scripts')

function resolveScript(name) {
  return path.relative(REPO_ROOT, path.join(SCRIPTS_DIR, name))
}

const GENERATE_SCRIPT = resolveScript('generate-journal-entry.js')
const VALIDATE_SCRIPT = resolveScript('validate-entry.js')
const SECRET_SCAN_SCRIPT = resolveScript('secret-scan.js')
const PUBLISH_SCRIPT = resolveScript('publish-journal-entry.js')

function contentDir() {
  return process.env.JOURNAL_CONTENT_DIR
    ? path.resolve(process.env.JOURNAL_CONTENT_DIR)
    : path.resolve(REPO_ROOT, 'content', 'journal')
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
  return path.join(contentDir(), slug.slice(0, 4), slug.slice(5, 7), slug + '.md')
}

function entryExists(slug) {
  const filePath = path.join(
    contentDir(),
    slug.slice(0, 4),
    slug.slice(5, 7),
    slug + '.md'
  )
  return fs.existsSync(filePath)
}

// ── Pipeline steps ──────────────────────────────────────────────────────

function step_generate(slug, force) {
  console.log('--- Step 1: Generate entry (if needed) ---')

  const entryPath = path.join(
    contentDir(),
    slug.slice(0, 4),
    slug.slice(5, 7),
    slug + '.md'
  )

  if (entryExists(slug) && !force) {
    console.log('Entry already exists: ' + entryPath)
    console.log('Use --force-generate to overwrite with a fresh draft.')
    return 'exists'
  }

  const cmd = 'node ' + GENERATE_SCRIPT + ' --content-dir ' + contentDir().replace(/ /g, '\\ ') +
    (force ? ' --force' : '')

  try {
    exec(cmd)
    console.log('Generated new entry.')
    return 'generated'
  } catch (err) {
    if (err.message.indexOf('Entry already exists') !== -1 && !force) {
      console.log('Entry already exists (race or prior run).')
      return 'exists'
    }
    throw err
  }
}

function step_validate(slug) {
  console.log('--- Step 2: Validate entry ---')

  const entryPath = path.join(
    contentDir(),
    slug.slice(0, 4),
    slug.slice(5, 7),
    slug + '.md'
  )

  if (!fs.existsSync(entryPath)) {
    console.error('❌ Entry file not found: ' + entryPath)
    console.error('Generation may have failed.')
    process.exit(1)
  }

  const cmd = 'node ' + VALIDATE_SCRIPT + ' --content-dir ' + contentDir().replace(/ /g, '\\ ') + ' ' + entryPath.replace(/ /g, '\\ ')
  try {
    exec(cmd)
    console.log('Validation passed.')
  } catch (err) {
    console.error('❌ Validation failed:')
    console.error(err.message)
    process.exit(1)
  }
}

function step_secret_scan(slug) {
  console.log('--- Step 3: Secret scan ---')

  const entryPath = path.join(
    contentDir(),
    slug.slice(0, 4),
    slug.slice(5, 7),
    slug + '.md'
  )

  const cmd = 'node ' + SECRET_SCAN_SCRIPT + ' ' + entryPath.replace(/ /g, '\\ ')
  try {
    exec(cmd)
    console.log('Secret scan passed.')
  } catch (err) {
    console.error('❌ Secret scan failed:')
    console.error(err.message)
    process.exit(1)
  }
}

function step_publish(slug, deploy, dryRun) {
  console.log('--- Step 4: Publish entry ---')

  const entryPath = path.join(
    contentDir(),
    slug.slice(0, 4),
    slug.slice(5, 7),
    slug + '.md'
  )

  const args = [
    PUBLISH_SCRIPT,
    '--entry', entryPath,
  ]

  if (deploy) args.push('--deploy')
  if (dryRun) args.push('--dry-run')

  const cmd = 'node ' + args.join(' ')
  try {
    exec(cmd)
    console.log('Publish complete.')
  } catch (err) {
    console.error('❌ Publish failed:')
    console.error(err.message)
    process.exit(1)
  }
}

// ── Main pipeline ───────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2)

  let deploy = false
  let dryRun = false
  let forceGenerate = false

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--deploy') deploy = true
    else if (args[i] === '--dry-run') dryRun = true
    else if (args[i] === '--force-generate') forceGenerate = true
  }

  const slug = todaySlug()
  const entryPath = todayEntryPath()

  console.log('╔══════════════════════════════════════════════╗')
  console.log('║     Hermes Journal — Daily Pipeline          ║')
  console.log('╠══════════════════════════════════════════════╣')
  console.log('║ Date:        ' + new Date().toISOString().slice(0, 10) + '                           ║')
  console.log('║ Slug:        ' + slug + '                              ║')
  console.log('║ Entry path:  ' + entryPath + '║')
  console.log('║ Deploy:      ' + (deploy ? 'yes' : 'no') + '                                  ║')
  console.log('║ Dry run:     ' + (dryRun ? 'yes' : 'no') + '                                  ║')
  console.log('║ Force gen:   ' + (forceGenerate ? 'yes' : 'no') + '                                  ║')
  console.log('╚══════════════════════════════════════════════╝')
  console.log('')

  // Step 1: Generate (or skip if exists)
  const genResult = step_generate(slug, forceGenerate)
  if (genResult === 'generated') {
    // Newly generated — proceed with validation
  } else if (genResult === 'exists') {
    console.log('')
    console.log('Entry already exists. Running validation and scan on existing file.')
    console.log('')
  } else {
    console.error('Unexpected generate result: ' + genResult)
    process.exit(1)
  }

  // Step 2: Validate
  step_validate(slug)
  console.log('')

  // Step 3: Secret scan
  step_secret_scan(slug)
  console.log('')

  // Step 4: Publish
  step_publish(slug, deploy, dryRun)
  console.log('')

  console.log('╔══════════════════════════════════════════════╗')
  console.log('║     Pipeline complete                         ║')
  console.log('╚══════════════════════════════════════════════╝')
}

main()
