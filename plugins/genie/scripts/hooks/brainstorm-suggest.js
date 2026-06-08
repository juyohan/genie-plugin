#!/usr/bin/env node
'use strict';

/**
 * UserPromptSubmit Hook — brainstorm handoff for feature requests and exploratory questions
 *
 * Two signal types:
 *   FEATURE  — explicit new feature/implementation request → stderr hint (non-blocking)
 *   EXPLORE  — open-ended questions, uncertainty, opinion requests → stdout injection
 *              so Claude receives the directive and steers toward /genie:brainstorm
 */

const MAX_STDIN = 1024 * 1024;
const MIN_LENGTH = 6;

// Explicit feature/implementation request signals
const FEATURE_PATTERNS = [
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
  /i\s+want\s+to\s+(build|create|add|implement)/i,
  /let'?s\s+(add|build|create|implement)/i,
  /new\s+feature/i,
  /feature\s+request/i,
  /how\s+(can|do|should)\s+(we|i)\s+(implement|build|create|add)/i,
  /can\s+(we|you)\s+(add|build|create|implement)/i,
];

// Exploratory / uncertainty signals — opinion, direction, "not sure" type questions
const EXPLORE_PATTERNS = [
  // 의견·생각 묻기
  /어떻게\s*(생각해|생각하세요|생각하니|생각하시나요)[?？]?/,
  /어떻게\s*(하면|하는\s*게|하는\s*것이)\s*(좋을지|나을지|맞을지|될지)[?？]?/,
  /어떤\s*(게|것이|방법이|방향이)\s*(나을|좋을|맞을|적합할)[?？]?/,
  /뭐가\s*(나을|좋을|맞을|더\s*나은)[?？]?/,
  /어떻게\s*(할까|할까요|해야\s*할지|하면\s*될까)[?？]?/,
  // 불확실성·모름
  /잘\s*모르겠/,
  /확신이\s*(없|없어|없는데)/,
  /어떻게\s*(해야\s*할지|할지)\s*모르겠/,
  /방향(을|이)?\s*(모르|못\s*잡|안\s*잡히)/,
  /감이\s*(안\s*잡히|없|오지\s*않)/,
  // 이런건 어떨까 / 어때 계열
  /어떨까[?？]?/,
  /(이런|저런|그런|이렇게|저렇게|그렇게|이거|저거|그거).{0,20}어때[?？]?/,
  /(이|이\s*방법|이\s*방향|이\s*접근|이\s*방식)\s*(은|는|이|가)?\s*어때[?？]?/,
  // 조언·의견·추천 요청
  /의견(이|을|은)?\s*(어때|줘|좀|알려|부탁)/,
  /조언\s*(해줘|해주세요|좀|부탁)/,
  /어떻게\s*(접근|시작|진행).*[?？]?/,
  /뭐부터\s*(시작|해야|할지)[?？]?/,
  // English
  /what\s+do\s+you\s+think/i,
  /not\s+sure\s+(what|how|which|where)/i,
  /how\s+should\s+(i|we)\s+(approach|handle|deal|start|proceed)/i,
  /any\s+(thoughts|suggestions|advice|ideas|recommendations)/i,
  /where\s+should\s+(i|we)\s+start/i,
  /what'?s\s+(the\s+best|a\s+good)\s+way/i,
];

// Skip suggestion in these cases
const EXCLUSION_PATTERNS = [
  /^[\/!]/,
  /에러|버그|오류|왜\s|왜냐|고쳐|수정해/,
  /error|bug|why|broken|crash|fail/i,
  /이게\s*뭐|무슨\s*(내용|뜻|역할|훅)|설명해|어떻게\s*동작|어떻게\s*작동/,
  /what\s+is|what\s+does|explain|how\s+does\s+it/i,
  /어디\s*(있|에)|찾아|확인해|검토|검색/,
  /genie:brainstorm/,
];

function extractMessage(raw) {
  try {
    const data = JSON.parse(raw);
    return String(data.prompt || data.content || data.message || '').trim();
  } catch {
    return '';
  }
}

function isExcluded(message) {
  return EXCLUSION_PATTERNS.some(p => p.test(message));
}

function isFeatureRequest(message) {
  return FEATURE_PATTERNS.some(p => p.test(message));
}

function isExploratory(message) {
  return EXPLORE_PATTERNS.some(p => p.test(message));
}

const EXPLORE_DIRECTIVE =
  '[Genie] 사용자가 방향·의견·접근법을 묻고 있습니다. ' +
  '직접 답변하기 전에 "/genie:brainstorm 을 먼저 실행하면 생각을 체계적으로 정리할 수 있습니다 — 실행해 볼까요?" 라고 제안하십시오.\n\n';

function run(rawInput) {
  const message = extractMessage(rawInput);

  if (message.length < MIN_LENGTH || isExcluded(message)) {
    process.stdout.write(rawInput);
    return;
  }

  if (isExploratory(message)) {
    // Inject directive into the prompt field so stdout stays valid JSON
    try {
      const data = JSON.parse(rawInput);
      // Use value-based fallback (matching extractMessage logic) to avoid injecting into wrong field
      const promptKey = data.prompt ? 'prompt' : data.content ? 'content' : data.message ? 'message' : null;
      if (promptKey) {
        const original = String(data[promptKey]);
        process.stdout.write(JSON.stringify({ ...data, [promptKey]: EXPLORE_DIRECTIVE + original }));
        return;
      }
    } catch (err) {
      process.stderr.write(`[brainstorm-suggest] JSON 재직렬화 실패, pass-through: ${err.message}\n`);
    }
  } else if (isFeatureRequest(message)) {
    process.stderr.write(
      '[Genie] 새 기능/구현 요청 감지. ' +
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

module.exports = { run, isFeatureRequest, isExploratory };
