#!/usr/bin/env node
/**
 * Doc file warning hook (PreToolUse - Write)
 *
 * Warns when any .md/.txt file is created at the project root level.
 * Suggests an appropriate subdirectory based on the filename.
 * Exit code 0 always (warns only, never blocks).
 */

'use strict';

const path = require('path');

const MAX_STDIN = 1024 * 1024;
let data = '';

// Files that belong at the root by convention
const ROOT_EXCEPTIONS = /^(README|CHANGELOG|CHANGELOG-\S+|LICENSE|CONTRIBUTING|CODE_OF_CONDUCT|SECURITY|NOTICE|AUTHORS|CODEOWNERS)\.(md|txt)$/i;

function suggestDirectory(basename) {
  const lower = basename.toLowerCase();
  if (/plan|spec|design|arch|rfc|adr|brief/.test(lower)) return 'docs/plans/';
  if (/test|bench/.test(lower)) return 'benchmarks/';
  if (/skill|command/.test(lower)) return 'skills/';
  if (/memory|remember/.test(lower)) return '.claude/memory/';
  return 'docs/';
}

function isRootLevel(filePath) {
  const normalized = path.resolve(filePath).replace(/\\/g, '/');
  const cwd = process.cwd().replace(/\\/g, '/');
  return path.dirname(normalized).replace(/\\/g, '/') === cwd;
}

function check(filePath) {
  const basename = path.basename(filePath);

  if (!/\.(md|txt)$/i.test(basename)) return null;
  if (!isRootLevel(filePath)) return null;
  if (ROOT_EXCEPTIONS.test(basename)) return null;

  return suggestDirectory(basename);
}

function run(inputOrRaw) {
  let input;
  try {
    input = typeof inputOrRaw === 'string'
      ? (inputOrRaw.trim() ? JSON.parse(inputOrRaw) : {})
      : (inputOrRaw || {});
  } catch {
    return { exitCode: 0 };
  }

  const filePath = String(input?.tool_input?.file_path || '');
  const suggestedDir = filePath ? check(filePath) : null;

  if (suggestedDir) {
    const basename = path.basename(filePath);
    return {
      exitCode: 0,
      stderr:
        `[Hook] Root-level doc detected: ${basename}\n` +
        `[Hook] Suggested path: ${suggestedDir}${basename}`,
    };
  }

  return { exitCode: 0 };
}

module.exports = { run };

// Stdin fallback for spawnSync execution
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => {
  if (data.length < MAX_STDIN) {
    const remaining = MAX_STDIN - data.length;
    data += c.substring(0, remaining);
  }
});

process.stdin.on('end', () => {
  const result = run(data);

  if (result.stderr) {
    process.stderr.write(result.stderr + '\n');
  }

  process.stdout.write(data);
});
