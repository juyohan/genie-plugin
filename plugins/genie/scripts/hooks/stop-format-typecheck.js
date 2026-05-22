#!/usr/bin/env node
/**
 * Stop Hook: Typecheck all JS/TS files edited this response
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Reads the accumulator written by post-edit-accumulator.js and runs
 * tsc --noEmit once per tsconfig for all edited .ts/.tsx files.
 * Formatting is handled per-edit by quality-gate.js (post:quality-gate).
 * The accumulator is cleared on read so repeated Stop calls do not
 * double-process files.
 *
 * Per-batch timeout is proportional to the number of batches so the total
 * never exceeds the Stop hook budget (90 s reserved for overhead).
 */

'use strict';

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { getAccumFile } = require('../lib/accum-file');

const MAX_STDIN = 1024 * 1024;
// Total ms budget reserved for all batches (leaves headroom below the 300s Stop timeout)
const TOTAL_BUDGET_MS = 270_000;

/** Parse the accumulator text into a deduplicated array of file paths. */
function parseAccumulator(raw) {
  return [...new Set(raw.split('\n').map(l => l.trim()).filter(Boolean))];
}

function findTsConfigDir(filePath) {
  let dir = path.dirname(filePath);
  const fsRoot = path.parse(dir).root;
  let depth = 0;
  while (dir !== fsRoot && depth < 20) {
    if (fs.existsSync(path.join(dir, 'tsconfig.json'))) return dir;
    dir = path.dirname(dir);
    depth++;
  }
  return null;
}

function typecheckBatch(tsConfigDir, editedFiles, timeoutMs) {
  const isWin = process.platform === 'win32';
  const npxBin = isWin ? 'npx.cmd' : 'npx';
  const args = ['tsc', '--noEmit', '--pretty', 'false'];
  const opts = { cwd: tsConfigDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: timeoutMs };

  let stdout = '';
  let stderr = '';
  let failed = false;

  try {
    if (isWin) {
      // .cmd files require shell: true on Windows
      const result = spawnSync(npxBin, args, { ...opts, shell: true });
      if (result.error) return; // timed out or not found — non-blocking
      if (result.status !== 0) {
        stdout = result.stdout || '';
        stderr = result.stderr || '';
        failed = true;
      }
    } else {
      execFileSync(npxBin, args, opts);
    }
  } catch (err) {
    stdout = err.stdout || '';
    stderr = err.stderr || '';
    failed = true;
  }

  if (!failed) return;

  const lines = (stdout + stderr).split('\n');
  for (const filePath of editedFiles) {
    const relPath = path.relative(tsConfigDir, filePath);
    const candidates = new Set([filePath, relPath]);
    const relevantLines = lines
      .filter(line => { for (const c of candidates) { if (line.includes(c)) return true; } return false; })
      .slice(0, 10);
    if (relevantLines.length > 0) {
      process.stderr.write(`[Hook] TypeScript errors in ${path.basename(filePath)}:\n`);
      relevantLines.forEach(line => process.stderr.write(line + '\n'));
    }
  }
}

function main() {
  const accumFile = getAccumFile();

  let raw;
  try {
    raw = fs.readFileSync(accumFile, 'utf8');
  } catch {
    return; // No accumulator — nothing edited this response
  }

  try { fs.unlinkSync(accumFile); } catch { /* best-effort */ }

  const files = parseAccumulator(raw);
  if (files.length === 0) return;

  const byTsConfigDir = new Map();
  for (const filePath of files) {
    if (!/\.(ts|tsx)$/.test(filePath)) continue;
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) continue;
    const tsDir = findTsConfigDir(resolved);
    if (!tsDir) continue;
    if (!byTsConfigDir.has(tsDir)) byTsConfigDir.set(tsDir, []);
    byTsConfigDir.get(tsDir).push(resolved);
  }

  // Distribute the budget evenly across all batches so the cumulative total
  // stays within the Stop hook wall-clock limit even in large monorepos.
  const totalBatches = byTsConfigDir.size;
  const perBatchMs = totalBatches > 0 ? Math.floor(TOTAL_BUDGET_MS / totalBatches) : 60_000;

  for (const [tsDir, batch] of byTsConfigDir) typecheckBatch(tsDir, batch, perBatchMs);
}

/**
 * Exported so run-with-flags.js uses require() instead of spawnSync,
 * letting the 300s hooks.json timeout govern the full batch.
 *
 * @param {string} rawInput - Raw JSON string from stdin (Stop event payload)
 * @returns {string} The original input (pass-through)
 */
function run(rawInput) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`[Hook] stop-format-typecheck error: ${err.message}\n`);
  }
  return rawInput;
}

if (require.main === module) {
  let stdinData = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (stdinData.length < MAX_STDIN) stdinData += chunk.substring(0, MAX_STDIN - stdinData.length);
  });
  process.stdin.on('end', () => {
    process.stdout.write(run(stdinData));
    process.exit(0);
  });
}

module.exports = { run, parseAccumulator };
