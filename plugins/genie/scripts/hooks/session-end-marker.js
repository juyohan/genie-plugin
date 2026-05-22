#!/usr/bin/env node
/**
 * SessionEnd Hook: Final Session Marker
 *
 * Triggered when the Claude process actually exits (unlike Stop, which fires
 * after each response). Writes a final session record with stats collected
 * during the session, and cleans up ephemeral /tmp/genie/ state files.
 *
 * Output: .claude/genie/session-end.jsonl
 */

'use strict';

const fs = require('fs');
const path = require('path');

const CONTEXT_MONITOR_STATE = path.join('/tmp', 'genie', 'context-monitor-state.json');
const FAILURE_STATE = path.join('/tmp', 'genie', 'failure-state.json');

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function topDirectory(files) {
  if (!files || files.length === 0) return null;
  const counts = {};
  for (const f of files) {
    const d = path.dirname(f);
    counts[d] = (counts[d] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

async function main() {
  let payload = {};
  try {
    let raw = '';
    process.stdin.setEncoding('utf8');
    await new Promise(resolve => {
      process.stdin.on('data', c => { raw += c; });
      process.stdin.on('end', resolve);
    });
    payload = JSON.parse(raw);
  } catch { /* use empty payload */ }

  const monitorState = readJson(CONTEXT_MONITOR_STATE);
  const failureState = readJson(FAILURE_STATE);

  const totalCalls = monitorState?.total_calls || 0;
  const editedFiles = monitorState?.edited_files || [];
  const failureCounts = failureState?.counts || {};
  const totalFailures = Object.values(failureCounts).reduce((s, n) => s + n, 0);

  const record = {
    ts: new Date().toISOString(),
    total_tool_calls: totalCalls,
    edited_files_count: editedFiles.length,
    ...(editedFiles.length > 0 && { top_dir: topDirectory(editedFiles) }),
    ...(totalFailures > 0 && { total_failures: totalFailures, failure_counts: failureCounts }),
    ...(payload.transcript_path && { transcript: payload.transcript_path }),
  };

  const logDir = path.join(process.cwd(), '.claude', 'genie');
  const logFile = path.join(logDir, 'session-end.jsonl');
  try {
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(logFile, JSON.stringify(record) + '\n', 'utf8');
    process.stderr.write(`[SessionEnd] Recorded: ${totalCalls} calls, ${editedFiles.length} files\n`);
  } catch (err) {
    process.stderr.write(`[SessionEnd] Warning: ${err.message}\n`);
  }

  // Clean up ephemeral session state from /tmp
  for (const f of [CONTEXT_MONITOR_STATE, FAILURE_STATE]) {
    try { fs.unlinkSync(f); } catch { /* already gone */ }
  }

  process.exit(0);
}

main().catch(err => {
  process.stderr.write(`[SessionEnd] Error: ${err.message}\n`);
  process.exit(0);
});
