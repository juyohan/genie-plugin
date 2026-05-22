#!/usr/bin/env node
'use strict';

/**
 * PostToolUse Hook — hooks.json 수정 시 install-hooks.js 자동 실행
 *
 * hooks/hooks.json이 Edit 또는 Write로 변경되면
 * 같은 플러그인의 scripts/install-hooks.js를 실행하여
 * ~/.claude/settings.json에 자동으로 동기화합니다.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const MAX_STDIN = 1024 * 1024;

const HOOKS_JSON_PATTERN = /[/\\]hooks[/\\]hooks\.json$/;

function extractFilePaths(input) {
  const paths = [];
  if (input.tool_input?.file_path) {
    paths.push(input.tool_input.file_path);
  }
  if (Array.isArray(input.tool_input?.edits)) {
    for (const edit of input.tool_input.edits) {
      if (edit?.file_path) paths.push(edit.file_path);
    }
  }
  return paths;
}

function findInstallScript(hooksJsonPath) {
  // plugins/genie/hooks/hooks.json → plugins/genie/scripts/install-hooks.js
  const pluginDir = path.dirname(path.dirname(hooksJsonPath));
  const candidate = path.join(pluginDir, 'scripts', 'install-hooks.js');
  return fs.existsSync(candidate) ? candidate : null;
}

function run(rawInput) {
  try {
    const input = JSON.parse(rawInput);
    const filePaths = extractFilePaths(input);

    for (const filePath of filePaths) {
      if (!HOOKS_JSON_PATTERN.test(filePath)) continue;

      const installScript = findInstallScript(filePath);
      if (!installScript) {
        process.stderr.write(`[hooks-auto-sync] install-hooks.js not found for: ${filePath}\n`);
        continue;
      }

      try {
        execFileSync(process.execPath, [installScript], { stdio: 'pipe' });
        process.stderr.write(`[hooks-auto-sync] settings.json 동기화 완료 (${path.basename(filePath)})\n`);
      } catch (err) {
        process.stderr.write(`[hooks-auto-sync] install-hooks.js 실행 실패: ${err.message}\n`);
      }
    }
  } catch {
    // JSON 파싱 실패 시 pass-through
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
