#!/usr/bin/env node
/**
 * Cut a versioned release: bump package.json, commit, tag, push.
 * GitHub Actions then builds/pushes GHCR images and creates the Release.
 *
 * Usage:
 *   npm run release -- 1.2.0
 *   npm run release -- 1.2.0 --dry-run
 *   node scripts/release.mjs 1.2.0-rc.1
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkgPath = resolve(root, 'package.json')

const args = process.argv.slice(2).filter((a) => a !== '--')
const dryRun = args.includes('--dry-run')
const version = args.find((a) => !a.startsWith('-'))

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

function run(cmd, cmdArgs, opts = {}) {
  console.log(`$ ${cmd} ${cmdArgs.join(' ')}`)
  if (dryRun) return ''
  return execFileSync(cmd, cmdArgs, {
    cwd: root,
    encoding: 'utf8',
    stdio: opts.stdio ?? 'pipe',
    ...opts,
  })
}

function git(args, opts) {
  return run('git', args, opts)
}

if (!version || !SEMVER.test(version)) {
  console.error(`Usage: npm run release -- <semver> [--dry-run]
Example: npm run release -- 1.2.0`)
  process.exit(1)
}

const tag = `v${version}`
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const previous = pkg.version

if (previous === version) {
  console.error(`package.json is already at ${version}`)
  process.exit(1)
}

try {
  git(['rev-parse', '--is-inside-work-tree'])
} catch {
  console.error('Not a git repository')
  process.exit(1)
}

const branch = git(['branch', '--show-current']).trim()
if (!dryRun && !branch) {
  console.error('Detached HEAD — check out main/master before releasing')
  process.exit(1)
}

const status = git(['status', '--porcelain'])
if (!dryRun && status.trim()) {
  console.error('Working tree is dirty. Commit or stash changes first.\n' + status)
  process.exit(1)
}

const existing = git(['tag', '-l', tag]).trim()
if (existing) {
  console.error(`Tag ${tag} already exists`)
  process.exit(1)
}

console.log(`\nRelease ${previous} → ${version} (tag ${tag}) on branch ${branch || '(detached)'}`)
if (dryRun) console.log('(dry-run — no changes will be written)\n')

pkg.version = version
if (!dryRun) {
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
} else {
  console.log(`would write package.json version = ${version}`)
  console.log(`would commit, tag ${tag}, push origin ${branch || 'HEAD'} + ${tag}`)
  process.exit(0)
}

git(['add', 'package.json'], { stdio: 'inherit' })
git(['commit', '-m', `chore: release ${tag}`], { stdio: 'inherit' })
git(['tag', '-a', tag, '-m', `Release ${tag}`], { stdio: 'inherit' })
git(['push', 'origin', branch], { stdio: 'inherit' })
git(['push', 'origin', tag], { stdio: 'inherit' })

console.log(`
Done.
- Commit + tag ${tag} pushed to origin
- Watch: GitHub → Actions → "Docker release"
- Image: ghcr.io/mediamash-org/backend:${version}
`)
