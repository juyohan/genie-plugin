#!/usr/bin/env node
/**
 * Stop Hook: Session Evaluator
 *
 * After each response, evaluates what happened this turn and injects a
 * brief summary into Claude's context. Fires only when activity was
 * significant (5+ tool calls or 2+ new files edited).
 *
 * Suggests /genie:learn when the response was complex (20+ calls or 5+ files).
 *
 * Reads:  /tmp/genie/context-monitor-state.json (written by context-monitor.js)
 * Writes: last_stop markers back to the same file for per-response delta tracking
 */

'use strict';

const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join('/tmp', 'genie', 'context-monitor-state.json');

const SIGNIFICANT_CALLS = 5;
const SIGNIFICANT_FILES = 2;
const COMPLEX_CALLS = 20;
const COMPLEX_FILES = 5;

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function saveState(state) {
  const tmp = `${STATE_FILE}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(state), 'utf8');
  fs.renameSync(tmp, STATE_FILE);
}

function topDirectory(files) {
  if (files.length === 0) return null;
  const counts = {};
  for (const f of files) {
    const d = path.dirname(f);
    counts[d] = (counts[d] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function run(rawInput) {
  const state = loadState();
  if (!state) return rawInput;

  const lastCalls = state.last_stop_total_calls || 0;
  const lastFilesCount = state.last_stop_files_count || 0;

  const responseCalls = (state.total_calls || 0) - lastCalls;
  const responseFiles = (state.edited_files || []).slice(lastFilesCount);
  const responseNewFiles = responseFiles.length;

  // Update stop markers before potentially returning early
  state.last_stop_total_calls = state.total_calls || 0;
  state.last_stop_files_count = (state.edited_files || []).length;
  saveState(state);

  if (responseCalls < SIGNIFICANT_CALLS && responseNewFiles < SIGNIFICANT_FILES) {
    return rawInput;
  }

  const lines = ['[세션 평가]'];
  lines.push(`· 이번 응답: tool ${responseCalls}회, 파일 ${responseNewFiles}개 편집`);

  const top = topDirectory(responseFiles);
  if (top) lines.push(`· 주요 범위: ${top}`);

  if (responseCalls >= COMPLEX_CALLS || responseNewFiles >= COMPLEX_FILES) {
    lines.push('→ 복잡한 작업이었습니다. /genie:learn 실행을 고려하세요.');
  }

  return { stdout: lines.join('\n') + '\n', exitCode: 0 };
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
