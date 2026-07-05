# Antigravity Auto Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PR 생성 또는 업데이트 직후 맥미니 self-hosted runner에서 Antigravity PR 리뷰를 자동 실행하고 GitHub PR 댓글로 게시한다.

**Architecture:** GitHub Actions `pull_request_target` workflow가 `develop` 대상 PR 이벤트를 받는다. workflow는 PR head code를 checkout하지 않고 base SHA만 checkout한 뒤, 기존 `scripts/agy-pr-review`를 실행한다. self-hosted runner는 `documind-agy-review` 전용 label로 분리한다.

**Tech Stack:** GitHub Actions, self-hosted runner, macOS runner, `gh` CLI, Antigravity CLI(`agy`), Python unittest

---

## File Structure

- Create: `.github/workflows/agy-pr-review.yml`
  - PR 생성/업데이트 이벤트에서 Antigravity 리뷰를 자동 실행한다.
  - `pull_request_target`을 사용하되 PR head code를 checkout하지 않는다.
  - `GH_TOKEN`으로 GitHub PR 댓글을 게시한다.

- Create: `scripts/test_agy_pr_review_workflow.py`
  - workflow 파일을 문자열 기반으로 검증한다.
  - `pull_request_target`, 최소 권한, 전용 runner label, base SHA checkout, `scripts/agy-pr-review` 실행 명령을 확인한다.
  - PR head checkout이나 package script 실행이 없는지 확인한다.

- Modify: `package.json`
  - `npm run test:tools`에 workflow 정적 테스트를 포함한다.

- Modify: `docs/workflow/agy-pr-review.md`
  - 자동 실행 방식, runner 사전 조건, 최초 rollout 주의점을 문서화한다.

- Modify: `docs/specs/agy-auto-review-design.md`
  - default branch가 `develop`임을 명시하고, workflow가 `develop`에 병합된 이후부터 자동 실행된다는 조건을 유지한다.

## Task 1: Workflow Static Test

**Files:**
- Create: `scripts/test_agy_pr_review_workflow.py`
- Modify: `package.json`

- [ ] **Step 1: Write the failing workflow static test**

Create `scripts/test_agy_pr_review_workflow.py`.

```python
import re
import unittest
from pathlib import Path


WORKFLOW_PATH = Path(".github/workflows/agy-pr-review.yml")


class AgyReviewWorkflowTest(unittest.TestCase):
    def setUp(self):
        self.assertTrue(WORKFLOW_PATH.is_file(), "agy review workflow file is missing")
        self.workflow = WORKFLOW_PATH.read_text(encoding="utf-8")

    def test_uses_pull_request_target_for_develop_prs(self):
        self.assertIn("pull_request_target:", self.workflow)
        self.assertNotRegex(self.workflow, r"(?m)^  pull_request:\s*$")
        for event_type in ["opened", "reopened", "synchronize", "ready_for_review"]:
            self.assertIn(f"      - {event_type}", self.workflow)
        self.assertIn("    branches:\n      - develop", self.workflow)

    def test_permissions_are_minimal_for_diff_read_and_comment_write(self):
        self.assertIn("permissions:", self.workflow)
        self.assertIn("  contents: read", self.workflow)
        self.assertIn("  pull-requests: read", self.workflow)
        self.assertIn("  issues: write", self.workflow)
        self.assertNotIn("contents: write", self.workflow)
        self.assertNotIn("pull-requests: write", self.workflow)

    def test_uses_dedicated_self_hosted_runner(self):
        self.assertIn("runs-on: [self-hosted, macOS, documind-agy-review]", self.workflow)

    def test_checks_out_base_sha_only(self):
        self.assertIn("uses: actions/checkout@v4", self.workflow)
        self.assertIn("ref: ${{ github.event.pull_request.base.sha }}", self.workflow)
        self.assertNotIn("github.event.pull_request.head.ref", self.workflow)
        self.assertNotIn("github.event.pull_request.head.sha", self.workflow)

    def test_runs_existing_review_script_with_github_token(self):
        self.assertIn("GH_TOKEN: ${{ github.token }}", self.workflow)
        self.assertIn("PR_NUMBER: ${{ github.event.pull_request.number }}", self.workflow)
        self.assertIn('scripts/agy-pr-review "$PR_NUMBER" --post --timeout 10m', self.workflow)

    def test_does_not_run_pr_head_package_scripts(self):
        forbidden_patterns = [
            r"\bnpm\s+run\b",
            r"\bnpm\s+test\b",
            r"\byarn\b",
            r"\bpnpm\b",
            r"\bnpx\b",
        ]
        for pattern in forbidden_patterns:
            self.assertIsNone(re.search(pattern, self.workflow), f"forbidden command found: {pattern}")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Include the workflow test in tool tests**

Modify `package.json`.

```json
{
  "scripts": {
    "test:tools": "python3 -m unittest scripts/test_agy_pr_review.py scripts/test_agy_pr_review_workflow.py"
  }
}
```

If `scripts/test_agy_pr_review_batch.py` exists in the target branch, keep it in the command and append `scripts/test_agy_pr_review_workflow.py` after it.

- [ ] **Step 3: Run the test and verify it fails**

Run:

```bash
npm run test:tools
```

Expected:

```text
FAIL: test_uses_pull_request_target_for_develop_prs
AssertionError: agy review workflow file is missing
```

- [ ] **Step 4: Commit the failing test**

```bash
git add package.json scripts/test_agy_pr_review_workflow.py
git commit -m "test: Antigravity 자동 리뷰 workflow 검증 추가" -m "배경
PR 자동 리뷰 workflow는 PR head code 실행 금지와 최소 권한 조건이 중요하므로 구현 전에 정적 검증 기준이 필요했습니다.

판단
YAML parser 의존성을 추가하지 않고 문자열 기반 unittest로 workflow 계약을 고정합니다.

검증
npm run test:tools 실패 확인: workflow 파일 없음

남은 리스크
실제 GitHub Actions 실행은 workflow 구현 후 테스트 PR에서 확인해야 합니다."
```

## Task 2: GitHub Actions Workflow

**Files:**
- Create: `.github/workflows/agy-pr-review.yml`
- Test: `scripts/test_agy_pr_review_workflow.py`

- [ ] **Step 1: Add the workflow file**

Create `.github/workflows/agy-pr-review.yml`.

```yaml
name: Antigravity PR Review

on:
  pull_request_target:
    types:
      - opened
      - reopened
      - synchronize
      - ready_for_review
    branches:
      - develop

permissions:
  contents: read
  pull-requests: read
  issues: write

concurrency:
  group: agy-pr-review-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  review:
    name: Antigravity PR Review
    if: ${{ !github.event.pull_request.draft }}
    runs-on: [self-hosted, macOS, documind-agy-review]
    timeout-minutes: 15
    steps:
      - name: Checkout trusted base SHA
        uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.base.sha }}
          persist-credentials: false

      - name: Verify trusted checkout
        env:
          BASE_SHA: ${{ github.event.pull_request.base.sha }}
        run: |
          set -euo pipefail
          current_sha="$(git rev-parse HEAD)"
          if [ "$current_sha" != "$BASE_SHA" ]; then
            echo "trusted checkout mismatch: expected $BASE_SHA, got $current_sha" >&2
            exit 1
          fi

      - name: Verify review tools
        run: |
          set -euo pipefail
          command -v gh
          command -v agy
          scripts/agy-pr-review --help >/dev/null

      - name: Post Antigravity review
        env:
          GH_TOKEN: ${{ github.token }}
          PR_NUMBER: ${{ github.event.pull_request.number }}
        run: |
          set -euo pipefail
          scripts/agy-pr-review "$PR_NUMBER" --post --timeout 10m
```

- [ ] **Step 2: Run tool tests and verify they pass**

Run:

```bash
npm run test:tools
```

Expected:

```text
OK
```

- [ ] **Step 3: Run workflow safety searches**

Run:

```bash
rg -n "pull_request:|head\\.ref|head\\.sha|npm run|npm test|yarn|pnpm|npx|contents: write|pull-requests: write" .github/workflows/agy-pr-review.yml
```

Expected:

```text
no matches
```

- [ ] **Step 4: Commit the workflow**

```bash
git add .github/workflows/agy-pr-review.yml scripts/test_agy_pr_review_workflow.py package.json
git commit -m "ci: Antigravity PR 자동 리뷰 workflow 추가" -m "배경
Codex가 agy 리뷰 명령을 직접 실행할 수 없으므로 PR 이벤트를 받은 신뢰된 runner가 자동 리뷰를 실행해야 했습니다.

판단
pull_request_target workflow에서 base SHA만 checkout하고 맥미니 전용 self-hosted runner가 기존 scripts/agy-pr-review를 실행하도록 구성했습니다.

검증
npm run test:tools
rg -n \"pull_request:|head\\.ref|head\\.sha|npm run|npm test|yarn|pnpm|npx|contents: write|pull-requests: write\" .github/workflows/agy-pr-review.yml 결과 없음

남은 리스크
workflow가 develop에 병합된 이후 테스트 PR에서 실제 Antigravity 댓글 생성을 확인해야 합니다."
```

## Task 3: Workflow Documentation

**Files:**
- Modify: `docs/workflow/agy-pr-review.md`

- [ ] **Step 1: Add automatic review section**

Add this section after the "기본 모델" section.

```markdown
## 자동 실행

PR 생성 또는 업데이트 시 Antigravity 리뷰는 GitHub Actions에서 자동 실행합니다.

자동 실행 조건은 다음과 같습니다.

- workflow event: `pull_request_target`
- target branch: `develop`
- activity: `opened`, `reopened`, `synchronize`, `ready_for_review`
- runner label: `[self-hosted, macOS, documind-agy-review]`

workflow는 PR head branch를 checkout하지 않습니다. base SHA를 checkout한 뒤 현재 저장소의 신뢰된 `scripts/agy-pr-review`만 실행합니다.

```bash
scripts/agy-pr-review "$PR_NUMBER" --post --timeout 10m
```

이 workflow가 `develop`에 병합되기 전까지는 자동 실행되지 않습니다. workflow를 추가하는 PR 자체는 수동 Antigravity 리뷰가 필요합니다.
```

- [ ] **Step 2: Run documentation checks**

Run:

```bash
rg -n "pull_request_target|documind-agy-review|workflow를 추가하는 PR 자체는 수동 Antigravity 리뷰가 필요합니다" docs/workflow/agy-pr-review.md
```

Expected:

```text
docs/workflow/agy-pr-review.md:<line>:...
```

- [ ] **Step 3: Commit the documentation**

```bash
git add docs/workflow/agy-pr-review.md
git commit -m "docs: Antigravity 자동 리뷰 운영 문서 보강" -m "배경
자동 리뷰 workflow는 runner 설정과 최초 rollout 조건을 알아야 안전하게 운영할 수 있습니다.

판단
기존 Antigravity 리뷰 문서에 자동 실행 조건, runner label, base SHA checkout 원칙, 최초 수동 리뷰 조건을 추가했습니다.

검증
rg -n \"pull_request_target|documind-agy-review|workflow를 추가하는 PR 자체는 수동 Antigravity 리뷰가 필요합니다\" docs/workflow/agy-pr-review.md

남은 리스크
맥미니 runner 설치 절차는 저장소 문서가 아니라 운영 환경 설정으로 별도 관리합니다."
```

## Task 4: Final Verification

**Files:**
- Verify: `.github/workflows/agy-pr-review.yml`
- Verify: `docs/workflow/agy-pr-review.md`
- Verify: `docs/specs/agy-auto-review-design.md`
- Verify: `docs/specs/agy-auto-review-implementation-plan.md`
- Verify: `package.json`
- Verify: `scripts/test_agy_pr_review_workflow.py`

- [ ] **Step 1: Run tool tests**

Run:

```bash
npm run test:tools
```

Expected:

```text
OK
```

- [ ] **Step 2: Run workflow safety search**

Run:

```bash
rg -n "pull_request:|head\\.ref|head\\.sha|npm run|npm test|yarn|pnpm|npx|contents: write|pull-requests: write" .github/workflows/agy-pr-review.yml
```

Expected:

```text
no matches
```

- [ ] **Step 3: Run plan and docs incomplete-marker scan**

Run:

```bash
rg -n "T[B]D|T[O]DO|placehol[d]er|fill i[n]|나중[에]|적[절]|미[정]|CHANGE_M[E]|CodeRabbi[t]|docs/superpower[s]" docs/specs/agy-auto-review-design.md docs/specs/agy-auto-review-implementation-plan.md docs/workflow/agy-pr-review.md scripts/test_agy_pr_review_workflow.py .github/workflows/agy-pr-review.yml
```

Expected:

```text
no matches
```

- [ ] **Step 4: Run whitespace check**

Run:

```bash
git diff --check
```

Expected:

```text
no output
```

- [ ] **Step 5: Confirm branch state**

Run:

```bash
git status --short --branch
```

Expected:

```text
## <working-branch>...origin/<working-branch>
```

No modified or untracked files should appear.

## Task 5: PR and Rollout

**Files:**
- No file changes in this task

- [ ] **Step 1: Push branch**

Run:

```bash
git push -u origin <working-branch>
```

Expected:

```text
branch '<working-branch>' set up to track 'origin/<working-branch>'
```

- [ ] **Step 2: Create PR into develop**

Run:

```bash
gh pr create --base develop --head <working-branch> --title "ci: Antigravity PR 자동 리뷰 workflow 추가" --body-file /private/tmp/documind-agy-auto-review-pr.md
```

PR body must include:

```markdown
연결 이슈
Refs #53

## 작업 배경
Codex가 `scripts/agy-pr-review`를 직접 실행할 수 없으므로 PR 생성 직후 자동 리뷰를 수행할 별도 실행 주체가 필요했습니다.

## 설계 판단
GitHub Actions `pull_request_target`와 맥미니 self-hosted runner를 사용합니다. workflow는 PR head code를 checkout하지 않고 base SHA에서 기존 리뷰 스크립트만 실행합니다.

## 검증 결과
- `npm run test:tools`
- workflow safety search 결과 없음
- incomplete-marker scan 결과 없음
- `git diff --check`

## 남은 리스크
이 workflow가 `develop`에 병합되기 전까지는 자동 실행되지 않으므로 이 PR 자체는 수동 Antigravity 리뷰가 필요합니다.
```

- [ ] **Step 3: Request manual Antigravity review for this PR**

Because the workflow is not active until it is merged to `develop`, run this from a trusted local terminal:

```bash
scripts/agy-pr-review <PR_NUMBER> --post --timeout 10m
```

Expected:

```text
Antigravity 리뷰 댓글 created: documind-ai-lab/documind-backend#<PR_NUMBER>
```

- [ ] **Step 4: Merge after review**

Only merge after the PR has:

```text
Antigravity 리뷰 댓글
병합 차단 없음
local verification evidence
```

- [ ] **Step 5: Verify automation with a new test PR**

Create a small documentation-only PR after the workflow is merged to `develop`. The expected result is:

```text
GitHub Actions workflow: Antigravity PR Review success
PR Conversation: Antigravity 1차 리뷰 결과 댓글 created
```

If the workflow is queued indefinitely, verify that the 맥미니 runner is online and has the `documind-agy-review` label.

## Self-Review

- Spec coverage: The plan covers trigger, execution subject, permissions, base checkout, review command, failure behavior, merge criteria, and rollout.
- Placeholder scan: The plan avoids incomplete implementation markers and includes exact commands and code blocks.
- Type consistency: File paths, runner label, branch name, workflow name, and script command match the design document.
