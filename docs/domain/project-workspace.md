# Project Workspace 도메인 결정

## 목적

Project Workspace는 문서, 대화, 분석 결과, 결정사항, 리스크 후보가 프로젝트별로 누적되는 업무 맥락을 관리한다.

이 문서는 프로젝트 기본 API 구현 전에 합의한 도메인 용어와 규칙을 고정한다. 구현자는 이 문서를 기준으로 API 계약, 도메인 모델, 저장소, 테스트를 작성한다.

## Bounded Context

Bounded Context는 `Project Workspace`이다.

이 영역에서 `Project`는 단순 폴더가 아니라 업무 맥락 단위다. 프로젝트는 견적서, 제안서, 계약서, 회의록 같은 문서와 AI 대화, 분석 결과, 결정사항, 리스크 후보가 쌓이는 기준점이다.

## Aggregate Root

Aggregate Root는 `Project`이다.

`Project`는 프로젝트의 기본 정보와 상태 전환을 책임진다. 문서, 대화, 분석 결과, 결정사항, 리스크 후보는 프로젝트에 속하지만 각각 별도 Aggregate 후보로 본다.

## Project 정의

`Project`는 문서, 대화, 분석 결과, 결정사항, 리스크 후보가 누적되는 업무 맥락 단위다.

프로젝트 이름은 식별자가 아니다. 같은 이름의 프로젝트를 여러 개 만들 수 있으며, 프로젝트의 유일한 식별자는 UUID 기반 `Project.id`이다.

## Project Type

프로젝트 유형은 고정 선택지로 관리한다. API와 저장소에서는 영문 enum 값을 사용하고, 화면에서는 한국어 라벨을 표시한다.

| 값 | 라벨 | 의미 |
| --- | --- | --- |
| `ESTIMATE_REVIEW` | 견적 검토 | 견적서 금액, 품목, 누락 항목, 제안서 불일치 검토 |
| `PROPOSAL_REVIEW` | 제안 검토 | 제안서 내용, 요구사항 부합성, 법령/규정 검토 후보 확인 |
| `CONTRACT_REVIEW` | 계약 검토 | 계약서 조항, 리스크 후보, 누락 조항 검토 |
| `MEETING_SUMMARY` | 회의록 정리 | 회의록 요약, 결정사항, 후속 작업 정리 |
| `GENERAL_ANALYSIS` | 일반 문서 분석 | 특정 유형에 묶이지 않는 문서 기반 분석 |

## Project Status

프로젝트는 삭제하지 않고 보관한다.

| 값 | 의미 |
| --- | --- |
| `ACTIVE` | 현재 진행 중인 프로젝트 |
| `ARCHIVED` | 완료되었거나 중단되어 기본 목록에서 숨겨진 프로젝트 |

`ARCHIVED` 상태는 삭제가 아니다. 보관된 프로젝트도 문서, 대화, 결정사항, 리스크 후보를 유지하며 다시 활성화할 수 있다.

## 필드

| 필드 | 설명 |
| --- | --- |
| `id` | UUID 기반 프로젝트 식별자 |
| `ownerId` | 프로젝트 소유자 식별자 |
| `name` | 프로젝트명 |
| `description` | 프로젝트 설명 |
| `type` | 프로젝트 유형 |
| `status` | 프로젝트 상태 |
| `documentCount` | 프로젝트에 속한 문서 수 |
| `riskCandidateCount` | 프로젝트에서 발견된 리스크 후보 수 |
| `createdAt` | 생성 시각 |
| `updatedAt` | 마지막 수정 시각 |
| `lastActivityAt` | 마지막 활동 시각 |

1차 MVP에서는 인증/사용자 컨텍스트가 완성되기 전까지 기본 사용자 ID를 사용한다.

```text
DEFAULT_OWNER_ID = 00000000-0000-0000-0000-000000000001
```

## 생성 규칙

프로젝트 생성 필수값은 `name`, `type`이다.

프로젝트 생성 선택값은 `description`이다.

검증 규칙은 다음과 같다.

| 필드 | 규칙 |
| --- | --- |
| `name` | 필수, 앞뒤 공백 제거, 1~100자 |
| `type` | 필수, Project Type 중 하나 |
| `description` | 선택, 앞뒤 공백 제거, 최대 1000자 |

`description`이 비어 있으면 `null`로 정규화한다.

프로젝트 생성 직후 상태는 `ACTIVE`이다.

프로젝트 생성 직후 시각 필드는 다음처럼 초기화한다.

```text
createdAt = now
updatedAt = now
lastActivityAt = now
```

프로젝트 생성 후 사용자는 문서 업로드 모달이 아니라 빈 워크스페이스로 이동한다. 빈 워크스페이스는 문서 없음, 채팅 없음, 출처 없음 상태와 문서 업로드 주요 행동을 보여준다.

## 이름 중복

프로젝트 이름 중복은 허용한다.

동일한 이름의 프로젝트가 여러 개 있어도 `Project.id`, 생성일, 마지막 활동일, 설명, 유형, 상태로 구분한다.

## 목록 조회 규칙

기본 프로젝트 목록은 `ACTIVE` 프로젝트만 반환한다.

보관된 프로젝트는 명시적인 필터로 조회한다.

```http
GET /projects
GET /projects?status=ACTIVE
GET /projects?status=ARCHIVED
GET /projects?status=ALL
```

기본 정렬은 `lastActivityAt DESC, createdAt DESC`이다. 최근 활동한 프로젝트가 가장 위에 오고, 마지막 활동 시각이 같으면 최근 생성된 프로젝트가 먼저 온다.

`lastActivityAt`은 사용자가 프로젝트 업무 맥락을 진전시키는 행동이 성공했을 때 갱신한다. 1차 MVP에서는 프로젝트 생성 시 `now`로 초기화하고, 프로젝트 기본 정보 수정, 보관, 복원만으로는 갱신하지 않는다. 후속 기능에서는 문서 업로드, AI 채팅, 분석 결과 생성, 결정사항 추가, 리스크 후보 추가가 성공했을 때 갱신한다.

목록 응답은 카드와 테이블 렌더링에 필요한 요약 정보만 담는다.

```json
{
  "id": "8d5f2c2a-1f1f-4d43-9a58-1e7b5c2f1a91",
  "name": "A사 제안 검토",
  "description": "2026년 상반기 제안서 및 견적 검토",
  "type": "PROPOSAL_REVIEW",
  "typeLabel": "제안 검토",
  "status": "ACTIVE",
  "documentCount": 3,
  "riskCandidateCount": 2,
  "lastActivityAt": "2026-06-29T10:00:00+09:00"
}
```

## 상세 조회 규칙

상세 조회는 1차 MVP에서 Project 기본 정보만 반환한다. 문서 목록, 최근 대화, 요약 정보는 후속 기능에서 확장한다.

```json
{
  "id": "8d5f2c2a-1f1f-4d43-9a58-1e7b5c2f1a91",
  "name": "A사 제안 검토",
  "description": "2026년 상반기 제안서 및 견적 검토",
  "type": "PROPOSAL_REVIEW",
  "typeLabel": "제안 검토",
  "status": "ACTIVE",
  "documentCount": 3,
  "riskCandidateCount": 2,
  "createdAt": "2026-06-29T09:00:00+09:00",
  "updatedAt": "2026-06-29T09:00:00+09:00",
  "lastActivityAt": "2026-06-29T10:00:00+09:00"
}
```

## 수정 규칙

수정 가능한 필드는 다음과 같다.

- `name`
- `description`

수정할 수 없는 필드는 다음과 같다.

- `id`
- `ownerId`
- `type`
- `status`
- `documentCount`
- `riskCandidateCount`
- `createdAt`
- `updatedAt`
- `lastActivityAt`

`type`은 프로젝트의 분석 목적과 처리 기준을 결정하는 값이므로 생성 시에만 지정한다. 생성 후 유형 변경이 필요하면 새 프로젝트를 생성하는 흐름으로 처리한다.

`updatedAt`은 사용자가 직접 수정할 수 없지만, 시스템 내부에서 자동 갱신한다. `PATCH /projects/{projectId}`가 성공하면 `updatedAt`은 `now`로 변경한다. `archive`와 `restore`가 성공해도 `updatedAt`은 `now`로 변경한다. 이때 `lastActivityAt`은 변경하지 않는다.

프로젝트 상태 변경은 일반 수정 API가 아니라 별도 도메인 액션으로 처리한다.

## 상태 전환

프로젝트 보관은 `archive` 액션으로 처리한다.

```text
Project.archive()
```

규칙은 다음과 같다.

- `ACTIVE` 상태에서만 가능하다.
- 상태를 `ARCHIVED`로 변경한다.
- 문서, 대화, 결정사항, 리스크 후보는 삭제하지 않는다.

프로젝트 복원은 `restore` 액션으로 처리한다.

```text
Project.restore()
```

규칙은 다음과 같다.

- `ARCHIVED` 상태에서만 가능하다.
- 상태를 `ACTIVE`로 변경한다.

## API 후보

1차 Project API 후보는 다음과 같다.

```http
POST /projects
GET /projects
GET /projects/{projectId}
PATCH /projects/{projectId}
POST /projects/{projectId}/archive
POST /projects/{projectId}/restore
```

`DELETE /projects/{projectId}`는 1차 MVP에서 만들지 않는다. 제품의 핵심이 프로젝트별 장기 기억이기 때문에 삭제보다 보관을 기본 정책으로 둔다.

## 후속 Aggregate 후보

다음 개념은 `Project`에 속하지만 별도 Aggregate 후보로 둔다.

- `Document`
- `Conversation`
- `AnalysisResult`
- `Decision`
- `RiskCandidate`

1차 Project API 구현에서는 이 개념들을 직접 구현하지 않는다. 단, `documentCount`, `riskCandidateCount`, `lastActivityAt`처럼 목록과 상세에 필요한 요약 필드는 Project 응답에 포함할 수 있다.

1차 MVP에서 `documentCount`와 `riskCandidateCount`는 `0`으로 초기화하고, Document/RiskCandidate 기능이 구현되기 전까지 기본값 `0`을 유지한다. 후속 기능에서 실제 문서 수와 리스크 후보 수를 집계해 갱신한다.
