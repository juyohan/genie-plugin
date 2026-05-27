---
description: 새 프로젝트 초기화 — 스택 자동 감지, 불확실한 항목만 질문, CLAUDE.md + docs/ 생성
model: sonnet
---

> **[스테이지 경계]** 이 단계가 완료되면 **반드시 멈추십시오.**
> 산출물을 출력한 뒤 대기합니다. 다음 단계 (`/genie:brainstorm`)는 사용자가 직접 실행합니다.

# `genie:setup`

> Scan the project, detect the stack, and generate the context files Claude needs to work effectively in this codebase.

$ARGUMENTS

---

Execute the **`genie:setup`** skill. Read `skills/setup/SKILL.md` and follow the instructions exactly, using any `$ARGUMENTS` as optional hints (e.g. tech stack, project name).

**Workflow position:** `genie:setup` (first run) → `/genie:brainstorm` → `/genie:plan` → `/genie:work`

**Generates:**
- `CLAUDE.md` — project name + @docs/ references
- `docs/conventions.md` — naming rules, code style, preferred patterns
- `docs/architecture.md` — directory structure, layers, design decisions
- `docs/setup.md` — how to run, test, and build

---

> **이 단계가 완료되면 멈추십시오.**
> 산출물을 출력한 뒤 대기합니다. 다음 단계 (`/genie:brainstorm`)는 사용자가 직접 실행합니다.
