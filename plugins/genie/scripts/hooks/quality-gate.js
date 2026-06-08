#!/usr/bin/env node
/**
 * Quality Gate Hook
 *
 * Runs lightweight quality checks after file edits.
 * - Targets one file when file_path is provided
 * - Falls back to no-op when language/tooling is unavailable
 *
 * For JS/TS files with Biome, formatting is handled upstream;
 * this hook still handles .json/.md files for Biome, and all
 * Prettier / Go / Python checks.
 *
 * Environment variables:
 *   GENIE_QUALITY_GATE_FIX    — "true" (default): auto-fix files after edit
 *                               "false": check only, no modifications
 *   GENIE_QUALITY_GATE_STRICT — "true": log warnings to stderr on check failure
 *                               "false" (default): silent on failure
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { findProjectRoot, detectFormatter, resolveFormatterBin } = require('../lib/resolve-formatter');

const MAX_STDIN = 1024 * 1024;

/**
 * Execute a command synchronously, returning the spawnSync result.
 *
 * @param {string} command - Executable path or name
 * @param {string[]} args - Arguments to pass
 * @param {string} [cwd] - Working directory (defaults to process.cwd())
 * @returns {import('child_process').SpawnSyncReturns<string>}
 */
function exec(command, args, cwd = process.cwd()) {
  return spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: process.env,
    timeout: 15000
  });
}

/**
 * Write a message to stderr for logging.
 *
 * @param {string} msg - Message to log
 */
function log(msg) {
  process.stderr.write(`${msg}\n`);
}

/**
 * Walk up from startDir looking for go.mod to find the Go module root.
 * Falls back to startDir when no go.mod is found above it.
 *
 * @param {string} startDir - Absolute directory path to start from
 * @returns {string} Absolute path to the Go module root
 */
function findGoModRoot(startDir) {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'go.mod'))) return dir;
    dir = path.dirname(dir);
  }
  return startDir;
}

/**
 * Run quality-gate checks for a single file based on its extension.
 * Skips JS/TS files when Biome is configured (formatting handled upstream).
 *
 * @param {string} filePath - Path to the edited file
 */
function maybeRunQualityGate(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return;
  }

  // Resolve to absolute path so projectRoot-relative comparisons work
  filePath = path.resolve(filePath);

  const ext = path.extname(filePath).toLowerCase();
  const fix = String(process.env.GENIE_QUALITY_GATE_FIX || 'true').toLowerCase() === 'true';
  const strict = String(process.env.GENIE_QUALITY_GATE_STRICT || '').toLowerCase() === 'true';

  if (['.ts', '.tsx', '.js', '.jsx', '.json', '.md'].includes(ext)) {
    const projectRoot = findProjectRoot(path.dirname(filePath));
    const formatter = detectFormatter(projectRoot);

    if (formatter === 'biome') {
      // JS/TS formatting handled upstream; skip
      if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
        return;
      }

      // .json / .md — still need quality gate
      const resolved = resolveFormatterBin(projectRoot, 'biome');
      if (!resolved) return;
      const args = [...resolved.prefix, 'check', filePath];
      if (fix) args.push('--write');
      const result = exec(resolved.bin, args, projectRoot);
      if (result.status !== 0 && strict) {
        log(`[QualityGate] Biome check failed for ${filePath}`);
      }
      return;
    }

    if (formatter === 'prettier') {
      const resolved = resolveFormatterBin(projectRoot, 'prettier');
      if (!resolved) return;
      const args = [...resolved.prefix, fix ? '--write' : '--check', filePath];
      const result = exec(resolved.bin, args, projectRoot);
      if (result.status !== 0 && strict) {
        log(`[QualityGate] Prettier check failed for ${filePath}`);
      }
      return;
    }

    // No formatter configured — skip
    return;
  }

  if (ext === '.go') {
    if (fix) {
      const r = exec('gofmt', ['-w', filePath]);
      if (r.status !== 0) log(`[QualityGate] gofmt failed for ${filePath}`);
    } else {
      const r = exec('gofmt', ['-l', filePath]);
      if (r.stdout && r.stdout.trim()) {
        log(`[QualityGate] ${path.basename(filePath)} needs formatting (run gofmt -w)`);
      }
    }
    const projectRoot = findGoModRoot(path.dirname(filePath));
    const relDir = path.relative(projectRoot, path.dirname(filePath));
    const packagePath = './' + (relDir || '.');
    const goVet = exec('go', ['vet', packagePath], projectRoot);
    if (goVet.status !== 0 && goVet.stderr) {
      log(`[QualityGate] go vet: ${goVet.stderr.trim().split('\n')[0]}`);
    }
    return;
  }

  if (ext === '.py') {
    const fmtArgs = fix ? ['format', filePath] : ['format', '--check', filePath];
    const fmt = exec('ruff', fmtArgs);
    if (fmt.status !== 0) {
      log(`[QualityGate] ${path.basename(filePath)} needs formatting (run ruff format)`);
    }
    const lint = exec('ruff', ['check', filePath]);
    if (lint.status !== 0) {
      const first = (lint.stdout || lint.stderr || '').trim().split('\n')[0];
      if (first) log(`[QualityGate] ruff check: ${first}`);
    }
  }
}

/**
 * Core logic — exported so run-with-flags.js can call directly.
 *
 * @param {string} rawInput - Raw JSON string from stdin
 * @returns {string} The original input (pass-through)
 */
function run(rawInput) {
  try {
    const input = JSON.parse(rawInput);
    const filePath = String(input.tool_input?.file_path || '');
    maybeRunQualityGate(filePath);
  } catch {
    // Ignore parse errors.
  }
  return rawInput;
}

// ── stdin entry point (backwards-compatible) ────────────────────
if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (raw.length < MAX_STDIN) {
      const remaining = MAX_STDIN - raw.length;
      raw += chunk.substring(0, remaining);
    }
  });

  process.stdin.on('end', () => {
    const result = run(raw);
    process.stdout.write(result);
  });
}

module.exports = { run };
