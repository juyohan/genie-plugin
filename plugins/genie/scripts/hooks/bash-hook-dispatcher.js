#!/usr/bin/env node
'use strict';

const { isHookEnabled } = require('../lib/hook-flags');

const { run: runBlockNoVerify } = require('./block-no-verify');
const { run: runBranchGuard } = require('./pre-bash-branch-guard');
const { run: runGitPushReminder } = require('./pre-bash-git-push-reminder');
const { run: runCommitQuality } = require('./pre-bash-commit-quality');
const { run: runAutoVersionBump } = require('./pre-bash-auto-version-bump');
const { run: runGateGuard } = require('./gateguard-fact-force');
const { run: runCommandLog } = require('./post-bash-command-log');
const { run: runPrCreated } = require('./post-bash-pr-created');
const { run: runBuildComplete } = require('./post-bash-build-complete');

const MAX_STDIN = 1024 * 1024;

const PRE_BASH_HOOKS = [
  // 필수 훅
  {
    id: 'pre:bash:block-no-verify',
    profiles: 'minimal,standard,strict',
    matcher: /--no-verify/,
    run: rawInput => runBlockNoVerify(rawInput),
  },
  {
    id: 'pre:bash:branch-guard',
    profiles: 'minimal,standard,strict',
    matcher: /git\s+(commit|push)/,
    run: rawInput => runBranchGuard(rawInput),
  },
  {
    id: 'pre:bash:gateguard-fact-force',
    profiles: 'standard,strict',
    run: rawInput => runGateGuard(rawInput),
  },
  // 선택 훅 (해당 명령어일 때만 실행)
  {
    id: 'pre:bash:auto-version-bump',
    profiles: 'minimal,standard,strict',
    matcher: /git\s+push/,
    run: rawInput => runAutoVersionBump(rawInput),
  },
  {
    id: 'pre:bash:git-push-reminder',
    profiles: 'standard,strict',
    matcher: /git\s+push/,
    run: rawInput => runGitPushReminder(rawInput),
  },
  {
    id: 'pre:bash:commit-quality',
    profiles: 'standard,strict',
    matcher: /git\s+commit/,
    run: rawInput => runCommitQuality(rawInput),
  },
];

const POST_BASH_HOOKS = [
  {
    id: 'post:bash:command-log-cost',
    profiles: 'strict',
    run: rawInput => runCommandLog(rawInput, 'cost'),
  },
  {
    id: 'post:bash:pr-created',
    profiles: 'standard,strict',
    matcher: /gh\s+pr\s+create/,
    run: rawInput => runPrCreated(rawInput),
  },
  {
    id: 'post:bash:build-complete',
    profiles: 'standard,strict',
    matcher: /(npm run build|pnpm build|yarn build)/,
    run: rawInput => runBuildComplete(rawInput),
  },
];

function readStdinRaw() {
  return new Promise(resolve => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      if (raw.length < MAX_STDIN) {
        const remaining = MAX_STDIN - raw.length;
        raw += chunk.substring(0, remaining);
      }
    });
    process.stdin.on('end', () => resolve(raw));
    process.stdin.on('error', () => resolve(raw));
  });
}

function normalizeHookResult(previousRaw, output) {
  if (typeof output === 'string') {
    return { raw: output, stderr: '', exitCode: 0 };
  }
  if (output && typeof output === 'object') {
    return {
      raw: 'stdout' in output ? String(output.stdout ?? '') : previousRaw,
      stderr: typeof output.stderr === 'string' ? output.stderr : '',
      exitCode: Number.isInteger(output.exitCode) ? output.exitCode : 0,
    };
  }
  return { raw: previousRaw, stderr: '', exitCode: 0 };
}

function parseCommand(rawInput) {
  try {
    return JSON.parse(rawInput)?.tool_input?.command || '';
  } catch {
    return '';
  }
}

function runHooks(rawInput, hooks) {
  let currentRaw = rawInput;
  let stderr = '';
  const command = parseCommand(rawInput);

  for (const hook of hooks) {
    if (!isHookEnabled(hook.id, { profiles: hook.profiles })) {
      continue;
    }

    if (hook.matcher && !hook.matcher.test(command)) {
      continue;
    }

    try {
      const result = normalizeHookResult(currentRaw, hook.run(currentRaw));
      currentRaw = result.raw;
      if (result.stderr) {
        stderr += result.stderr.endsWith('\n') ? result.stderr : `${result.stderr}\n`;
      }
      if (result.exitCode !== 0) {
        return { output: currentRaw, stderr, exitCode: result.exitCode };
      }
    } catch (error) {
      stderr += `[Hook] ${hook.id} failed: ${error.message}\n`;
    }
  }

  return { output: currentRaw, stderr, exitCode: 0 };
}

function runPreBash(rawInput) {
  return runHooks(rawInput, PRE_BASH_HOOKS);
}

function runPostBash(rawInput) {
  return runHooks(rawInput, POST_BASH_HOOKS);
}

async function main() {
  const mode = process.argv[2];
  const raw = await readStdinRaw();

  const result = mode === 'post'
    ? runPostBash(raw)
    : runPreBash(raw);

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  process.stdout.write(result.output);
  process.exit(result.exitCode);
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`[Hook] bash-hook-dispatcher failed: ${error.message}\n`);
    process.exit(0);
  });
}

module.exports = {
  PRE_BASH_HOOKS,
  POST_BASH_HOOKS,
  runPreBash,
  runPostBash,
};
