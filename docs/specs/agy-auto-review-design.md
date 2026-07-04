# Antigravity 자동 리뷰 실행 구조 설계

## 배경

현재 PR 리뷰 절차는 사람이 `scripts/agy-pr-review <PR번호> --post`를 실행해야 Antigravity 리뷰 댓글이 생성된다. Codex가 이 명령을 직접 실행하려고 하면 PR diff를 외부 모델로 전송하는 행위로 분류되어 보안 정책에 의해 차단된다.

목표는 Codex가 직접 외부 전송 명령을 실행하지 않으면서도, PR 생성 직후 Antigravity 리뷰가 자동으로 요청되는 구조를 만드는 것이다.

## 결정

Antigravity 자동 리뷰는 GitHub Actions와 맥미니 self-hosted runner로 실행한다.

PR이 생성되거나 업데이트되면 GitHub Actions가 `pull_request_target` 이벤트로 실행된다. workflow는 PR head branch의 코드를 checkout하거나 실행하지 않고, base branch에 존재하는 신뢰된 workflow와 script만 사용한다. 실제 `agy` 실행은 맥미니 self-hosted runner에서 수행한다.

```text
PR opened / synchronize / reopened / ready_for_review
→ GitHub Actions pull_request_target
→ 맥미니 self-hosted runner
→ base branch의 scripts/agy-pr-review 실행
→ Antigravity 리뷰 댓글 게시
→ 사람이 리뷰 결과 확인 후 병합 판단
```

## 근거

GitHub의 `pull_request_target` 이벤트는 base repository context에서 workflow를 실행한다. GitHub 문서는 이 이벤트가 fork PR에 label/comment 같은 작업을 할 수 있게 하지만, PR head의 신뢰할 수 없는 코드를 실행하면 보안 취약점이 생길 수 있다고 경고한다.

- GitHub Docs: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request_target

GitHub self-hosted runner는 GitHub-hosted runner처럼 매 job마다 깨끗한 VM을 보장하지 않는다. GitHub 문서는 self-hosted runner가 untrusted workflow에 의해 지속적으로 오염될 수 있고, private/internal repository에서도 주의해야 한다고 설명한다.

- GitHub Docs: https://docs.github.com/en/actions/reference/security/secure-use#hardening-for-self-hosted-runners

따라서 이 자동화는 self-hosted runner를 쓰되, runner가 PR head code를 실행하지 않도록 설계해야 한다.

## 범위

이번 설계의 범위는 PR 자동 리뷰 요청 구조다.

포함한다.

- PR 생성/업데이트 시 자동 리뷰 트리거
- GitHub Actions와 self-hosted runner 실행 경계
- workflow 권한 최소화
- PR head code 미실행 원칙
- `agy` 실행 실패 처리
- 리뷰 댓글 생성 기준
- 병합 전 확인 기준

포함하지 않는다.

- Antigravity 리뷰 결과를 자동으로 파싱해 병합을 차단하는 기능
- Codex가 직접 `agy`를 실행하는 우회 구조
- FastAPI webhook 서버 운영
- PR head branch의 테스트, 빌드, lint 실행
- 외부 공개 PR/fork PR 지원

## 트리거

workflow는 `pull_request_target` 이벤트를 사용한다.

대상 activity type은 다음으로 제한한다.

- `opened`
- `reopened`
- `synchronize`
- `ready_for_review`

draft PR은 실행하지 않는다. draft에서 ready 상태로 바뀔 때 `ready_for_review` 이벤트로 리뷰를 실행한다.

base branch는 `develop`을 우선 대상으로 한다. 이후 `main` 운영 반영 PR에도 같은 리뷰가 필요해지면 branch filter를 확장한다.

## 실행 주체

실행 주체는 맥미니에 설치한 GitHub Actions self-hosted runner다.

runner 권장 label은 다음과 같다.

```text
self-hosted
macOS
documind-agy-review
```

workflow는 `runs-on: [self-hosted, macOS, documind-agy-review]`처럼 전용 runner label을 지정한다. 이 runner는 Antigravity 리뷰 전용으로 사용하고, 일반 build/test job과 공유하지 않는다.

## 인증

GitHub 댓글 게시에는 GitHub Actions의 `GITHUB_TOKEN`을 사용한다. workflow step에서 `GH_TOKEN: ${{ github.token }}`를 환경 변수로 전달하면 `gh` CLI가 해당 token으로 GitHub API를 호출할 수 있다.

Antigravity 실행에는 맥미니 runner에 이미 로그인된 `agy` CLI 세션을 사용한다. `agy` 인증 정보는 GitHub repository secret에 저장하지 않는다.

## 권한

workflow permissions는 최소 권한으로 제한한다.

```yaml
permissions:
  contents: read
  pull-requests: read
  issues: write
```

`issues: write`는 PR Conversation 일반 댓글이 Issues API 기반으로 생성되기 때문에 필요하다. 코드 push, release, deployment 관련 권한은 부여하지 않는다.

## 실행 명령

workflow는 PR 번호를 GitHub event payload에서 읽고 다음 명령을 실행한다.

```bash
scripts/agy-pr-review "${PR_NUMBER}" --post --timeout 10m
```

기본 모델은 기존 스크립트 정책을 따른다.

```text
Gemini 3.1 Pro (High)
```

리뷰 댓글은 기존 `<!-- agy-pr-review -->` 마커와 `Antigravity N차 리뷰 결과` 제목 정책을 유지한다. PR이 업데이트되어 workflow가 다시 실행되면 새 차수 댓글을 생성한다.

## 보안 원칙

workflow는 다음을 금지한다.

- PR head branch checkout
- PR head branch의 package script 실행
- PR head branch의 workflow/script 실행
- PR title/body/comment를 shell command로 직접 삽입
- repository write 권한 부여
- self-hosted runner에서 일반 CI job과 리뷰 job 공유

workflow는 base branch의 script만 실행해야 한다. PR diff는 `gh pr diff`로 조회해 `agy` stdin으로 전달한다. diff 내용은 리뷰 입력으로만 사용하고 shell command로 실행하지 않는다.

## 실패 처리

`scripts/agy-pr-review`가 실패하면 workflow job은 실패해야 한다.

실패 유형은 다음과 같이 구분한다.

- `agy` 명령 없음: runner 설정 문제
- `gh` 인증 실패: GitHub token 전달 문제
- diff 크기 초과: PR 분할 또는 `--max-diff-bytes` 조정 필요
- Antigravity timeout: timeout 증가 또는 수동 재실행 필요
- 댓글 게시 실패: `issues: write` 권한 또는 API 문제

실패한 workflow는 병합 전 해결해야 한다. 병합 전에는 PR Conversation에 Antigravity 리뷰 댓글이 있는지 확인한다.

## 병합 기준

자동 리뷰 workflow의 성공은 “Antigravity 리뷰 댓글이 생성되었다”는 의미다. 리뷰 내용에서 `병합 차단` 항목이 있는지 판단하는 것은 현재 단계에서는 자동화하지 않는다.

병합 전 사람 또는 Codex가 확인해야 하는 항목은 다음이다.

- 최신 PR commit 이후 Antigravity 리뷰 댓글이 존재한다.
- 리뷰 결과의 `병합 차단` 섹션이 `없음` 또는 해결 완료 상태다.
- 로컬 검증 결과가 PR 본문 또는 댓글에 기록되어 있다.
- 이슈와 Project 상태가 최신이다.

후속 단계에서 Antigravity 출력 형식을 안정적으로 파싱할 수 있게 되면, `병합 차단`이 존재할 때 workflow check를 실패시키는 확장을 검토한다.

## 운영 절차

1. 개발자가 PR을 생성한다.
2. GitHub Actions가 자동으로 Antigravity 리뷰 workflow를 실행한다.
3. 맥미니 self-hosted runner가 base branch의 `scripts/agy-pr-review`를 실행한다.
4. PR Conversation에 Antigravity 리뷰 댓글이 생성된다.
5. Codex 또는 사용자가 리뷰 결과를 확인한다.
6. 반영할 항목이 있으면 추가 커밋 후 PR synchronize 이벤트로 리뷰가 다시 실행된다.
7. 병합 차단 항목이 없고 검증이 완료되면 병합한다.

## 테스트 기준

구현 시 최소 검증은 다음을 포함한다.

- workflow YAML 문법 검증
- `pull_request_target` event와 branch filter 확인
- `permissions` 최소 권한 확인
- `runs-on` label이 전용 self-hosted runner label을 사용하는지 확인
- PR head checkout이 없는지 정적 검색
- `GH_TOKEN` 환경 변수 전달 확인
- `scripts/agy-pr-review --help` 또는 dry-run 가능한 대체 검증
- 실제 테스트 PR에서 Antigravity 댓글 생성 확인

## 후속 작업

1. 맥미니 self-hosted runner 설치 및 전용 label 설정
2. `.github/workflows/agy-pr-review.yml` 추가
3. PR #52의 배치 실행 도구 필요성 재검토
4. Branch ruleset에 자동 리뷰 workflow check를 필수 status check로 추가
5. 리뷰 결과 파싱 기반 병합 차단 자동화 검토

## 운영 결정

현재 설계는 PR 업데이트마다 새 차수 댓글을 생성한다. 기존 댓글을 갱신하는 방식은 리뷰 이력 추적성이 떨어지므로 기본값으로 사용하지 않는다.

현재 설계는 외부 fork PR을 지원하지 않는다. DocuMind 저장소는 개인/조직 내부 포트폴리오 프로젝트로 운영되므로 내부 브랜치 PR만 대상으로 한다.
