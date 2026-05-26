#!/usr/bin/env node
/**
 * PreToolUse Hook: Branch Guard
 *
 * Blocks git commit and git push on protected branches.
 * Protected branches: main, master, develop, staging
 *
 * Allowed exceptions:
 *   git push --dry-run / -n  (no actual push)
 *   git push --delete / -d   (remote branch deletion, not writing to protected)
 *
 * Exit codes:
 *   0 - Allow
 *   2 - Block (protected branch)
 */

'use strict';

const { spawnSync } = require('child_process');

const PROTECTED_BRANCHES = ['main', 'master', 'develop', 'staging'];

function getCurrentBranch() {
  const result = spawnSync('git', ['branch', '--show-current'], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    if (result.stderr) {
      process.stderr.write(`[branch-guard] git branch failed: ${result.stderr.trim()}\n`);
    }
    return null;
  }
  return result.stdout.trim();
}

function evaluate(rawInput, { getBranch = getCurrentBranch } = {}) {
  try {
    const input = JSON.parse(rawInput);
    const command = input.tool_input?.command || '';

    const isPush = /git\s+push/.test(command);
    const isCommit = /git\s+commit/.test(command);

    if (!isPush && !isCommit) {
      return { output: rawInput, exitCode: 0 };
    }

    // push 안전 예외: --dry-run(-n), --delete(-d) 는 보호 브랜치에 실제 쓰기가 없음
    if (isPush && (/--dry-run|-n\b/.test(command) || /--delete|-d\b/.test(command))) {
      return { output: rawInput, exitCode: 0 };
    }

    const branch = getBranch();
    if (!branch || !PROTECTED_BRANCHES.includes(branch)) {
      return { output: rawInput, exitCode: 0 };
    }

    // push가 commit보다 구체적이므로 push를 우선 판단
    const action = isPush ? 'push' : 'commit';
    process.stderr.write(
      `\n[보호 브랜치] 현재 브랜치: \`${branch}\`\n` +
      `보호 브랜치에 직접 ${action}하는 것은 허용되지 않습니다.\n` +
      `새 브랜치를 생성한 후 작업하십시오: git checkout -b feat/<작업명>\n\n`
    );

    return { output: rawInput, exitCode: 2 };
  } catch {
    return { output: rawInput, exitCode: 0 };
  }
}

function run(rawInput) {
  const result = evaluate(rawInput);
  return { stdout: result.output, exitCode: result.exitCode };
}

if (require.main === module) {
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { data += chunk; });
  process.stdin.on('end', () => {
    const result = evaluate(data);
    process.stdout.write(result.output);
    process.exit(result.exitCode);
  });
}

module.exports = { run, evaluate, PROTECTED_BRANCHES };
