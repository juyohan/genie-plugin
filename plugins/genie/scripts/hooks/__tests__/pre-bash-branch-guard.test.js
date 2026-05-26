#!/usr/bin/env node
/**
 * Unit tests for pre-bash-branch-guard.js
 * Run: node plugins/genie/scripts/hooks/__tests__/pre-bash-branch-guard.test.js
 */

'use strict';

const assert = require('assert');
const { evaluate, PROTECTED_BRANCHES } = require('../pre-bash-branch-guard');

function input(command) {
  return JSON.stringify({ tool_input: { command } });
}

function onBranch(branch) {
  return { getBranch: () => branch };
}

// ── test runner ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// ── 보호 브랜치에서 차단 ──────────────────────────────────────────────────────

console.log('\n[branch-guard] 보호 브랜치에서 차단');

test('main 에서 git commit → exit 2', () => {
  const result = evaluate(input('git commit -m "feat: test"'), onBranch('main'));
  assert.strictEqual(result.exitCode, 2);
});

test('main 에서 git push → exit 2', () => {
  const result = evaluate(input('git push origin main'), onBranch('main'));
  assert.strictEqual(result.exitCode, 2);
});

test('master 에서 git commit → exit 2', () => {
  const result = evaluate(input('git commit -m "fix: bug"'), onBranch('master'));
  assert.strictEqual(result.exitCode, 2);
});

test('develop 에서 git push → exit 2', () => {
  const result = evaluate(input('git push'), onBranch('develop'));
  assert.strictEqual(result.exitCode, 2);
});

test('staging 에서 git push → exit 2', () => {
  const result = evaluate(input('git push origin HEAD'), onBranch('staging'));
  assert.strictEqual(result.exitCode, 2);
});

// ── 보호 브랜치가 아닐 때 허용 ───────────────────────────────────────────────

console.log('\n[branch-guard] 보호 브랜치가 아닐 때 허용');

test('feat/foo 에서 git commit → exit 0', () => {
  const result = evaluate(input('git commit -m "feat: new feature"'), onBranch('feat/foo'));
  assert.strictEqual(result.exitCode, 0);
});

test('feat/bar 에서 git push → exit 0', () => {
  const result = evaluate(input('git push origin feat/bar'), onBranch('feat/bar'));
  assert.strictEqual(result.exitCode, 0);
});

test('release/1.0 에서 git push → exit 0', () => {
  const result = evaluate(input('git push'), onBranch('release/1.0'));
  assert.strictEqual(result.exitCode, 0);
});

// ── push 안전 예외 ───────────────────────────────────────────────────────────

console.log('\n[branch-guard] push 안전 예외');

test('main 에서 git push --dry-run → exit 0', () => {
  const result = evaluate(input('git push --dry-run origin main'), onBranch('main'));
  assert.strictEqual(result.exitCode, 0);
});

test('main 에서 git push -n → exit 0', () => {
  const result = evaluate(input('git push -n origin main'), onBranch('main'));
  assert.strictEqual(result.exitCode, 0);
});

test('main 에서 git push --delete origin feat/foo → exit 0', () => {
  const result = evaluate(input('git push --delete origin feat/foo'), onBranch('main'));
  assert.strictEqual(result.exitCode, 0);
});

test('main 에서 git push -d origin feat/foo → exit 0', () => {
  const result = evaluate(input('git push -d origin feat/foo'), onBranch('main'));
  assert.strictEqual(result.exitCode, 0);
});

// ── git 외 명령어 ────────────────────────────────────────────────────────────

console.log('\n[branch-guard] git 외 명령어');

test('npm install → exit 0', () => {
  const result = evaluate(input('npm install'), onBranch('main'));
  assert.strictEqual(result.exitCode, 0);
});

test('git status → exit 0', () => {
  const result = evaluate(input('git status'), onBranch('main'));
  assert.strictEqual(result.exitCode, 0);
});

test('git log --oneline → exit 0', () => {
  const result = evaluate(input('git log --oneline'), onBranch('main'));
  assert.strictEqual(result.exitCode, 0);
});

// ── 엣지 케이스 ─────────────────────────────────────────────────────────────

console.log('\n[branch-guard] 엣지 케이스');

test('git 명령 없는 환경 (getBranch → null) → exit 0', () => {
  const result = evaluate(input('git commit -m "test"'), { getBranch: () => null });
  assert.strictEqual(result.exitCode, 0);
});

test('JSON 파싱 실패 → exit 0', () => {
  const result = evaluate('invalid json', onBranch('main'));
  assert.strictEqual(result.exitCode, 0);
});

test('output은 rawInput pass-through', () => {
  const raw = input('git push origin main');
  const result = evaluate(raw, onBranch('main'));
  assert.strictEqual(result.output, raw);
});

test('push 명령: action이 push로 표시됨 (exit 2 확인)', () => {
  const result = evaluate(input('git push origin main'), onBranch('main'));
  assert.strictEqual(result.exitCode, 2);
});

test('commit 명령: action이 commit으로 표시됨 (exit 2 확인)', () => {
  const result = evaluate(input('git commit -m "msg"'), onBranch('main'));
  assert.strictEqual(result.exitCode, 2);
});

// ── 상수 검증 ───────────────────────────────────────────────────────────────

console.log('\n[branch-guard] PROTECTED_BRANCHES 상수');

test('PROTECTED_BRANCHES에 main, master, develop, staging 포함', () => {
  assert.deepStrictEqual(PROTECTED_BRANCHES, ['main', 'master', 'develop', 'staging']);
});

// ── summary ──────────────────────────────────────────────────────────────────

console.log(`\n결과: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
