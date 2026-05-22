#!/usr/bin/env node
'use strict';

/**
 * UserPromptSubmit Hook — suggest /genie:brainstorm for feature requests
 *
 * Analyzes the user's message and writes a stderr suggestion when it
 * looks like a new feature request or implementation question.
 * Non-blocking: always passes the original input through to stdout.
 */

const MAX_STDIN = 1024 * 1024;
const MIN_LENGTH = 15;

// Strong signals for a new feature/implementation request
const FEATURE_PATTERNS = [
  // Korean — want to create/add/implement
  /만들고\s*싶/,
  /추가하고\s*싶/,
  /구현하고\s*싶/,
  /개발하고\s*싶/,
  /만들어\s*줄\s*수\s*있/,
  /추가해\s*줄\s*수\s*있/,
  /구현해\s*줄\s*수\s*있/,
  /새\s*(기능|모듈|시스템|훅|스킬)/,
  /새로운\s*(기능|모듈|시스템|훅|스킬)/,
  /기능\s*(추가|개발|구현)/,
  /어떻게\s*(구현|만들|설계|개발).*[?？]?/,
  // English
  /i\s+want\s+to\s+(build|create|add|implement)/i,
  /let'?s\s+(add|build|create|implement)/i,
  /new\s+feature/i,
  /feature\s+request/i,
  /how\s+(can|do|should)\s+(we|i)\s+(implement|build|create|add)/i,
  /can\s+(we|you)\s+(add|build|create|implement)/i,
];

// Signals that it's NOT a new feature request — skip suggestion
const EXCLUSION_PATTERNS = [
  /^[\/!]/,                                           // slash command or ! shell
  /에러|버그|오류|왜\s|왜냐|고쳐|수정해/,
  /error|bug|why|broken|crash|fail/i,
  /이게\s*뭐|무슨\s*(내용|뜻|역할|훅)|설명해|어떻게\s*동작|어떻게\s*작동/,
  /what\s+is|what\s+does|explain|how\s+does\s+it/i,
  /어디\s*(있|에)|찾아|확인해|검토|검색/,            // lookup/find/review
  /genie:brainstorm/,                                  // already running brainstorm
];

function extractMessage(raw) {
  try {
    const data = JSON.parse(raw);
    return String(data.prompt || data.content || data.message || '').trim();
  } catch {
    return '';
  }
}

function shouldSuggest(message) {
  if (message.length < MIN_LENGTH) return false;

  for (const pattern of EXCLUSION_PATTERNS) {
    if (pattern.test(message)) return false;
  }

  for (const pattern of FEATURE_PATTERNS) {
    if (pattern.test(message)) return true;
  }

  return false;
}

function run(rawInput) {
  const message = extractMessage(rawInput);

  if (shouldSuggest(message)) {
    process.stderr.write(
      '[Genie] 새 기능/구현 요청이 감지됐습니다. ' +
      '/genie:brainstorm 을 먼저 실행하면 요구사항을 체계적으로 정리할 수 있습니다.\n'
    );
  }

  process.stdout.write(rawInput);
}

if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    if (raw.length < MAX_STDIN) raw += chunk.substring(0, MAX_STDIN - raw.length);
  });
  process.stdin.on('end', () => {
    run(raw);
    process.exit(0);
  });
}

module.exports = { run, shouldSuggest };
