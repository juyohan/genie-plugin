'use strict';
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const MAX_STDIN = 1024 * 1024;

const AGENT_MAP = [
  ['/docs/brainstorms/', 'genie:brainstorm'],
  ['/docs/plans/',       'genie:plan'],
  ['/docs/tests/',       'genie:test'],
  ['/docs/reviews/',     'genie:review'],
  ['/docs/solutions/',   'genie:learn'],
  ['/docs/compounds/',   'genie:learn'],
];

function inferAgent(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  for (const [segment, agent] of AGENT_MAP) {
    if (normalized.includes(segment)) return agent;
  }
  return 'genie';
}

function getClaudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

function readSessionTokens(sessionId) {
  if (!sessionId) return { input: 0, output: 0 };

  const costsPath = path.join(getClaudeDir(), 'metrics', 'costs.jsonl');
  if (!fs.existsSync(costsPath)) return { input: 0, output: 0 };

  let input = 0, output = 0;
  const lines = fs.readFileSync(costsPath, 'utf8').split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.session_id === sessionId) {
        input  += entry.input_tokens  || 0;
        output += entry.output_tokens || 0;
      }
    } catch {}
  }
  return { input, output };
}

function buildFrontmatter(agent, tokens) {
  const date = new Date().toISOString().split('T')[0];
  return [
    '---',
    `agent: ${agent}`,
    `date: ${date}`,
    `input_tokens: ${tokens.input}`,
    `output_tokens: ${tokens.output}`,
    '---',
    '',
    '',
  ].join('\n');
}

function run(rawInput) {
  try {
    const input    = JSON.parse(rawInput);
    const filePath = input.tool_input?.file_path || '';

    if (!filePath.endsWith('.md') || !filePath.includes('/docs/')) return rawInput;
    if (!fs.existsSync(filePath)) return rawInput;

    const content = fs.readFileSync(filePath, 'utf8');
    if (content.startsWith('---\n')) return rawInput;

    const agent     = inferAgent(filePath);
    const sessionId = process.env.CLAUDE_SESSION_ID || '';
    const tokens    = readSessionTokens(sessionId);

    const tmpPath = `${filePath}.tmp.${process.pid}`;
    try {
      fs.writeFileSync(tmpPath, buildFrontmatter(agent, tokens) + content, 'utf8');
      fs.renameSync(tmpPath, filePath);
    } catch (writeErr) {
      try { fs.unlinkSync(tmpPath); } catch {}
      throw writeErr;
    }
  } catch {}

  return rawInput;
}

if (require.main === module) {
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (data.length < MAX_STDIN) data += chunk.substring(0, MAX_STDIN - data.length);
  });
  process.stdin.on('end', () => {
    process.stdout.write(run(data));
    process.exit(0);
  });
}

module.exports = { run };
