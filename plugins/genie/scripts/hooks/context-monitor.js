#!/usr/bin/env node
/**
 * PostToolUse Hook: Context Monitor
 *
 * Tracks tool call patterns and injects warnings into Claude's context when:
 *   - Tool call count crosses 50 / 80 / 100 thresholds
 *   - Same tool repeats 5+ times in the last 8 calls (loop detection)
 *   - 15+ unique files edited (scope drift)
 *
 * State: /tmp/genie/context-monitor-state.json (session-scoped, ephemeral)
 * Read by: evaluate-session.js at Stop time
 */

'use strict';

const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join('/tmp', 'genie', 'context-monitor-state.json');

const CALL_THRESHOLDS = [50, 80, 100];
const LOOP_WINDOW = 8;
const LOOP_MIN_REPEAT = 5;
const SCOPE_WARN_AT = 15;
const MAX_FILES_TRACKED = 60;
const MAX_HISTORY = 10;

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit']);

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {
      total_calls: 0,
      tool_history: [],
      edited_files: [],
      last_stop_total_calls: 0,
      last_stop_files_count: 0,
      warned_at: {},
    };
  }
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  const tmp = `${STATE_FILE}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(state), 'utf8');
  fs.renameSync(tmp, STATE_FILE);
}

function detectLoop(history) {
  if (history.length < LOOP_WINDOW) return null;
  const window = history.slice(-LOOP_WINDOW);
  const counts = {};
  for (const t of window) counts[t] = (counts[t] || 0) + 1;
  for (const [tool, count] of Object.entries(counts)) {
    if (count >= LOOP_MIN_REPEAT) return tool;
  }
  return null;
}

function run(rawInput) {
  let payload = {};
  try { payload = JSON.parse(rawInput); } catch { return rawInput; }

  const toolName = String(payload.tool_name || '');
  const filePath = payload.tool_input?.file_path || payload.tool_input?.path || null;

  const state = loadState();
  state.total_calls = (state.total_calls || 0) + 1;
  state.tool_history = [...(state.tool_history || []), toolName].slice(-MAX_HISTORY);
  state.edited_files = state.edited_files || [];
  state.warned_at = state.warned_at || {};

  if (EDIT_TOOLS.has(toolName) && filePath) {
    if (!state.edited_files.includes(filePath) && state.edited_files.length < MAX_FILES_TRACKED) {
      state.edited_files = [...state.edited_files, filePath];
    }
  }

  const warnings = [];

  // Call count thresholds — fire for highest applicable, mark all below as warned
  const crossed = CALL_THRESHOLDS.filter(t => state.total_calls >= t && !state.warned_at[`calls_${t}`]);
  if (crossed.length > 0) {
    const top = crossed[crossed.length - 1];
    for (const t of CALL_THRESHOLDS) {
      if (t <= state.total_calls) state.warned_at[`calls_${t}`] = true;
    }
    warnings.push(top >= 100
      ? `tool call ${top}회 초과. 지금 /compact 를 실행하세요.`
      : `tool call ${top}회 도달. /compact 실행을 고려하세요.`
    );
  }

  // Loop detection
  const loopTool = detectLoop(state.tool_history);
  if (loopTool && !state.warned_at.loop) {
    state.warned_at.loop = true;
    warnings.push(`'${loopTool}' 반복 감지. 루프에 빠졌을 수 있습니다.`);
  } else if (!loopTool && state.warned_at.loop) {
    state.warned_at.loop = false;
  }

  // Scope drift
  if (state.edited_files.length >= SCOPE_WARN_AT && !state.warned_at.scope_15) {
    state.warned_at.scope_15 = true;
    warnings.push(`${state.edited_files.length}개 파일 편집됨. 작업 범위가 넓어지고 있습니다.`);
  }

  saveState(state);

  if (warnings.length > 0) {
    const text = warnings.map(w => `[Context Monitor] 경고: ${w}`).join('\n') + '\n';
    return { stdout: text, exitCode: 0 };
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
