#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_STDIN = 1024 * 1024;

// Patterns that identify credential/secret files — Write/Edit/MultiEdit on these is blocked.
// Reading is always allowed; this hook only fires on Write, Edit, and MultiEdit tool calls.
const BLOCKED_PATTERNS = [
  /[/\\]\.aws[/\\](credentials|config)$/,
  /[/\\]\.env(\.[^/\\]*)?$/,
  /[/\\](credentials|secrets|secret)$/i,
  /\.(pem|key|p12|pfx|keystore|jks)$/i,
  /[/\\]tmp[/\\][^/\\]*(?<![a-z])(cred|credentials|secret|secrets|token)(?![a-z])[^/\\]*/i,
  /[/\\]\.ssh[/\\]id_(?!.*\.pub$)[^/\\]+$/,
  /[/\\]\.kube[/\\]config$/,
  /[/\\]\.docker[/\\]config\.json$/,
  /[/\\]\.git-credentials$/,
  /[/\\]\.npmrc$/,
  /[/\\]\.vault-token$/,
];

function expandHome(filePath) {
  if (!filePath) return filePath;
  if (filePath.startsWith('~/') || filePath === '~') {
    return path.join(os.homedir(), filePath.slice(1));
  }
  return filePath;
}

function isBlocked(filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) return false;

  const expanded = expandHome(filePath);
  const normalized = path.resolve(expanded).replace(/\\/g, '/');

  if (BLOCKED_PATTERNS.some(re => re.test(normalized))) return true;

  // Also resolve symlinks and check the real path
  try {
    const real = fs.realpathSync(expanded).replace(/\\/g, '/');
    if (real !== normalized && BLOCKED_PATTERNS.some(re => re.test(real))) return true;
  } catch {
    // File doesn't exist yet (new file write attempt) — only the name check matters
  }

  return false;
}

// MultiEdit uses tool_input.edits[].file_path; Write/Edit use tool_input.file_path
function extractFilePaths(input) {
  const paths = [];
  const ti = input?.tool_input;
  if (!ti) return paths;

  if (typeof ti.file_path === 'string') paths.push(ti.file_path);
  if (typeof ti.path === 'string') paths.push(ti.path);
  if (Array.isArray(ti.edits)) {
    for (const edit of ti.edits) {
      if (edit && typeof edit.file_path === 'string') paths.push(edit.file_path);
    }
  }

  return paths;
}

function run(rawInput) {
  let input;
  try {
    input = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
  } catch {
    // Fail-secure: if input cannot be parsed (e.g. truncated), block to be safe
    process.stderr.write('[credential-guard] 입력 파싱 실패 — 안전을 위해 차단합니다.\n');
    process.exit(2);
  }

  const paths = extractFilePaths(input);
  if (paths.length === 0) return;

  for (const filePath of paths) {
    if (!isBlocked(filePath)) continue;
    const sanitized = filePath.replace(/[\x00-\x1f\x7f]/g, '?');
    process.stderr.write(
      `[credential-guard] Write blocked: ${sanitized}\n` +
      `  자격증명 파일은 읽기만 허용됩니다. Write/Edit/MultiEdit이 차단되었습니다.\n`
    );
    process.exit(2);
  }
}

if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (raw.length < MAX_STDIN) raw += chunk.substring(0, MAX_STDIN - raw.length);
  });
  process.stdin.on('end', () => {
    run(raw);
    process.stdout.write(raw);
  });
}

module.exports = { run, isBlocked, extractFilePaths };
