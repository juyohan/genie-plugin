#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const MAX_STDIN = 1024 * 1024;
let stdinData = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (stdinData.length < MAX_STDIN) {
    stdinData += chunk.substring(0, MAX_STDIN - stdinData.length);
  }
});
process.stdin.on('end', () => {
  main().catch(err => {
    process.stderr.write(`[SubagentStop] Error: ${err.message}\n`);
    process.exit(0);
  });
});

function detectAgentName(payload) {
  const keys = ['teammate_name', 'agent_name', 'subagent_name', 'assistant_name', 'name'];
  for (const key of keys) {
    const val = String(payload[key] || '').trim();
    if (val) return val;
  }
  const transcriptPath = String(payload.transcript_path || '');
  if (transcriptPath) {
    const match = path.basename(transcriptPath).match(/([0-9a-f]{8})/i);
    if (match) return `agent-${match[1]}`;
  }
  return 'unknown-agent';
}

function truncate(text, limit = 800) {
  const clean = String(text || '').trim();
  return clean.length <= limit ? clean : `${clean.slice(0, limit - 3)}...`;
}

async function main() {
  let payload = {};
  try { payload = JSON.parse(stdinData); } catch {}

  const agentName = detectAgentName(payload);
  const lastMessage = truncate(String(payload.last_assistant_message || ''));
  const teamName = String(payload.team_name || '').trim();
  const transcriptPath = String(payload.transcript_path || '').trim();

  const record = {
    ts: new Date().toISOString(),
    agent: agentName,
    ...(teamName && { team: teamName }),
    ...(lastMessage && { summary: lastMessage }),
    ...(transcriptPath && { transcript: transcriptPath }),
  };

  const logDir = path.join(process.cwd(), '.claude', 'genie');
  const logFile = path.join(logDir, 'agent-stops.jsonl');

  try {
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(logFile, `${JSON.stringify(record)}\n`, 'utf8');
    process.stderr.write(`[SubagentStop] Logged: ${agentName}\n`);
  } catch (err) {
    process.stderr.write(`[SubagentStop] Warning: failed to write log: ${err.message}\n`);
  }

  process.exit(0);
}
