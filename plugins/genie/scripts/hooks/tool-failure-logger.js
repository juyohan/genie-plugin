#!/usr/bin/env node
/**
 * PostToolUseFailure Hook: Tool Failure Logger
 *
 * Logs every tool failure to .claude/genie/tool-failures.jsonl.
 * Injects a warning into Claude's context when the same tool
 * fails 3 or 5 times in a session (cumulative thresholds).
 *
 * State: /tmp/genie/failure-state.json (per-tool failure counts)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join('/tmp', 'genie', 'failure-state.json');
const FAILURE_THRESHOLDS = [3, 5, 10];

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { counts: {}, warned: {} };
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  const tmp = `${STATE_FILE}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(state), 'utf8');
  fs.renameSync(tmp, STATE_FILE);
}

function truncate(text, limit = 200) {
  const s = String(text || '').trim();
  return s.length <= limit ? s : s.slice(0, limit - 3) + '...';
}

function run(rawInput) {
  let payload = {};
  try { payload = JSON.parse(rawInput); } catch { return rawInput; }

  const toolName = String(payload.tool_name || payload.tool || 'unknown');
  const errorMsg = truncate(
    payload.error || payload.error_message || payload.message || ''
  );
  const inputSummary = truncate(JSON.stringify(payload.tool_input || {}), 150);

  // Append to .claude/genie/tool-failures.jsonl
  const logDir = path.join(process.cwd(), '.claude', 'genie');
  const logFile = path.join(logDir, 'tool-failures.jsonl');
  const record = {
    ts: new Date().toISOString(),
    tool: toolName,
    ...(errorMsg && { error: errorMsg }),
    input: inputSummary,
  };
  try {
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(logFile, JSON.stringify(record) + '\n', 'utf8');
  } catch { /* non-fatal */ }

  // Track cumulative failures per tool and check thresholds
  const state = loadState();
  state.counts = state.counts || {};
  state.warned = state.warned || {};
  state.warned[toolName] = state.warned[toolName] || {};

  state.counts[toolName] = (state.counts[toolName] || 0) + 1;
  const count = state.counts[toolName];

  const crossed = FAILURE_THRESHOLDS.filter(
    t => count >= t && !state.warned[toolName][`t${t}`]
  );

  let warning = null;
  if (crossed.length > 0) {
    const top = crossed[crossed.length - 1];
    for (const t of FAILURE_THRESHOLDS) {
      if (t <= count) state.warned[toolName][`t${t}`] = true;
    }
    warning = `'${toolName}' 누적 ${count}회 실패.`;
    if (errorMsg) warning += ` 마지막 오류: ${errorMsg}`;
  }

  saveState(state);

  if (warning) {
    return { stdout: `[Tool Failure] 경고: ${warning}\n`, exitCode: 0 };
  }

  return rawInput;
}

if (require.main === module) {
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', c => { data += c; });
  process.stdin.on('end', () => {
    const result = run(data);
    if (typeof result === 'string') {
      process.stdout.write(result);
    } else {
      if (result.stdout) process.stdout.write(result.stdout);
      process.exit(result.exitCode || 0);
    }
  });
}

module.exports = { run };
