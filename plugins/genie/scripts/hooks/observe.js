#!/usr/bin/env node
'use strict';

/**
 * Observe Hook — record tool events to observations.jsonl
 *
 * Runs as PreToolUse (tool_start) and PostToolUse (tool_complete).
 * Hook phase is determined by GENIE_OBSERVE_PHASE env var set by hooks.json command.
 *
 * Writes ECC-compatible JSONL to:
 *   ~/.local/share/ecc-homunculus/projects/<projectId>/observations.jsonl
 *
 * Skips automated / subagent sessions to avoid self-recording loops.
 * No external dependencies (bash, python, ECC).
 */

const fs = require('fs');
const path = require('path');

const { resolveProjectContext, resolveSessionId } = require('../lib/observer-sessions');

const MAX_STDIN = 1024 * 1024;
const MAX_IO_CHARS = 5000;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const SECRET_RE = /(?:api[_-]?key|token|secret|password|authorization|credentials?|auth)(["'\s:=]+)(?:[A-Za-z]+\s+)?([A-Za-z0-9_\-/.+=]{8,})/gi;

function scrub(value) {
  if (value == null) return null;
  return String(value).replace(SECRET_RE, (_, sep, secret) => `${_[0]}${sep}[REDACTED]`);
}

function scrubField(value) {
  if (value == null) return null;
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return scrub(str.slice(0, MAX_IO_CHARS));
}

function shouldSkip(input) {
  // Skip subagent sessions (automated by definition)
  if (input.agent_id) return true;

  // Skip non-interactive entrypoints
  const entrypoint = process.env.CLAUDE_CODE_ENTRYPOINT || 'cli';
  if (!['cli', 'sdk-ts', 'claude-desktop'].includes(entrypoint)) return true;

  // Skip minimal hook profile (automated sessions)
  if (process.env.ECC_HOOK_PROFILE === 'minimal') return true;
  if (process.env.ECC_SKIP_OBSERVE === '1') return true;

  return false;
}

function archiveIfNeeded(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size < MAX_FILE_SIZE_BYTES) return;

    const archiveDir = path.join(path.dirname(filePath), 'observations.archive');
    fs.mkdirSync(archiveDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    fs.renameSync(filePath, path.join(archiveDir, `observations-${stamp}-${process.pid}.jsonl`));
  } catch {
    // best-effort
  }
}

function run(rawInput) {
  try {
    const input = JSON.parse(rawInput);

    if (shouldSkip(input)) return rawInput;

    const phase = process.env.GENIE_OBSERVE_PHASE || 'post';
    const event = phase === 'pre' ? 'tool_start' : 'tool_complete';

    const toolName = input.tool_name || input.tool || 'unknown';
    const sessionId = input.session_id || resolveSessionId() || 'unknown';

    const observerContext = resolveProjectContext();
    const observationsFile = path.join(observerContext.projectDir, 'observations.jsonl');

    archiveIfNeeded(observationsFile);

    const observation = {
      timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      event,
      tool: toolName,
      session: sessionId,
      project_id: observerContext.projectId,
      project_name: path.basename(observerContext.projectRoot || observerContext.projectId),
    };

    if (event === 'tool_start') {
      const raw = scrubField(input.tool_input || input.input);
      if (raw) observation.input = raw;
    } else {
      const raw = scrubField(input.tool_response || input.tool_output || input.output);
      if (raw != null) observation.output = raw;
    }

    fs.mkdirSync(path.dirname(observationsFile), { recursive: true });
    fs.appendFileSync(observationsFile, JSON.stringify(observation) + '\n', 'utf8');
  } catch {
    // non-blocking — never fail Claude
  }

  return rawInput;
}

if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (raw.length < MAX_STDIN) raw += chunk.substring(0, MAX_STDIN - raw.length);
  });
  process.stdin.on('end', () => {
    process.stdout.write(run(raw));
    process.exit(0);
  });
}

module.exports = { run };
