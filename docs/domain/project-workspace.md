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

프로젝트 이름은 식별자가 아니다. 같은 이름의 프로젝트를 여러 개 만들 수 있으며, 프로젝트의 유일한 식별자는 UUID v7 기반 `Project.id`이다.

## Project Type

프로젝트 유형은 고정 선택지로 관리한다. API와 저장소에서는 영문 enum 값을 사용하고, 화면에서는 클라이언트가 한국어 라벨을 매핑해 표시한다.

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
| `id` | UUID v7 기반 프로젝트 식별자 |
| `ownerId` | UUID 기반 프로젝트 소유자 식별자 |
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
DEFAULT_OWNER_ID = 7f0d8c54-7e3a-4a7f-b4b2-2c8f8c5a1d6e
```

이 값은 도메인 엔티티에 하드코딩하지 않는다. 애플리케이션 설정이나 환경 변수에서 읽어 유스케이스 계층으로 주입하고, `Project` 생성 시에는 이미 결정된 `ownerId` 값을 전달한다. 운영 환경에서는 기본 사용자 ID 설정을 사용하지 않는다. 인증 기능 전 단계의 스테이징/데모 배포가 필요하면 `demo` 프로필에서만 `DOCUMIND_DEMO_OWNER_ID`를 명시적으로 주입한다. 운영 프로필에서 인증 기반 owner provider가 없으면 프로젝트 생성 요청은 `503 Service Unavailable`과 `PROJECT_OWNER_PROVIDER_UNAVAILABLE` 코드로 거절한다.

## 생성 규칙

프로젝트 생성 필수값은 `name`, `type`이다.

프로젝트 생성 선택값은 `description`이다.

검증 규칙은 다음과 같다.

| 필드 | 규칙 |
| --- | --- |
| `name` | 필수, 앞뒤 공백 제거, 1~100자 |
| `type` | 필수, Project Type 중 하나 |
| `description` | 선택, 앞뒤 공백 제거, 최대 1000자 |

생성 요청에서 `description` 필드가 누락되거나, `null`이거나, 빈 문자열이거나, 공백만 포함하면 `null`로 정규화한다. 값이 있으면 앞뒤 공백을 제거한 문자열로 저장한다.

프로젝트 생성 직후 상태는 `ACTIVE`이다.

API의 날짜/시간 필드는 RFC 3339 형식의 UTC 문자열로 직렬화한다. 예시는 `2026-06-29T01:00:00Z` 형식을 사용한다. 화면에서는 클라이언트가 한국 시간 등 사용자 표시 형식으로 변환한다. 저장소 구현에서는 타임존 정보를 보존하는 컬럼 타입을 사용한다. PostgreSQL 기준으로는 `TIMESTAMPTZ`를 우선 고려한다.

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

기본 프로젝트 목록은 `ACTIVE` 프로젝트만 반환한다. `status` 쿼리 파라미터가 생략되면 `status=ACTIVE`로 처리한다.

보관된 프로젝트는 명시적인 필터로 조회한다.

`status` 쿼리 파라미터는 도메인 상태 enum이 아니라 API 조회 필터다. `ACTIVE`와 `ARCHIVED`는 `Project.status` 값과 매핑하고, `ALL`은 컨트롤러/요청 DTO 계층에서만 사용하는 필터 값이다. `ALL`을 `Project.status`에 저장하거나 도메인 상태로 추가하지 않는다. `status=ALL`이면 `ACTIVE`와 `ARCHIVED` 프로젝트를 모두 조회한다.

```http
GET /projects
GET /projects?status=ACTIVE
GET /projects?status=ARCHIVED
GET /projects?status=ALL
GET /projects?status=ACTIVE&page=1&size=20
```

1차 MVP의 목록 조회는 offset 기반 페이징을 사용한다. `page`는 1부터 시작하고 기본값은 1이다. `size` 기본값은 20이고 최대값은 50이다. 데이터량이 늘어나면 `lastActivityAt`과 `createdAt`을 기준으로 한 cursor 기반 페이징 전환을 검토한다.

`page`가 1보다 작거나 `size`가 1보다 작으면 422 검증 오류를 반환한다. `size`가 50보다 크면 자동 보정하지 않고 422 검증 오류를 반환한다. 파라미터가 누락된 경우에만 기본값을 적용한다. 검증 오류 응답은 공통 에러 포맷을 사용하고, 필드 단위 오류 목록을 포함한다.

검증 오류 응답 예시는 다음과 같다.

```json
{
  "status": 422,
  "code": "VALIDATION_ERROR",
  "message": "요청 값이 올바르지 않습니다.",
  "errors": [
    {
      "field": "size",
      "message": "size는 1 이상 50 이하로 입력해야 합니다."
    }
  ]
}
```

기본 정렬은 `lastActivityAt DESC, createdAt DESC, id DESC`이다. 최근 활동한 프로젝트가 가장 위에 오고, 마지막 활동 시각이 같으면 최근 생성된 프로젝트가 먼저 온다. 실제 저장소 구현에서는 `status`, `lastActivityAt`, `createdAt`, `id` 기준 조회와 정렬을 고려한 복합 인덱스를 검토한다.

`lastActivityAt`은 사용자가 프로젝트 업무 맥락을 진전시키는 행동이 성공했을 때 갱신한다. 1차 MVP에서는 프로젝트 생성 시 `now`로 초기화하고, 프로젝트 기본 정보 수정, 보관, 복원만으로는 갱신하지 않는다. 생성 직후 빈 워크스페이스도 사용자가 방금 만든 작업 단위이므로 목록 상단에 노출되도록 `null`이 아니라 `now`로 초기화한다. 이는 목록의 최근 활동을 프로젝트 메타데이터 변경이 아니라 실제 업무 진행 기준으로 보여주기 위한 의도된 정책이다. 후속 기능에서는 문서 업로드, AI 채팅, 분석 결과 생성, 결정사항 추가, 리스크 후보 추가가 성공했을 때 갱신한다.

목록 응답은 카드와 테이블 렌더링에 필요한 요약 정보만 담는다.

```json
{
  "items": [
    {
      "id": "8d5f2c2a-1f1f-4d43-9a58-1e7b5c2f1a91",
      "name": "A사 제안 검토",
      "description": "2026년 상반기 제안서 및 견적 검토",
      "type": "PROPOSAL_REVIEW",
      "status": "ACTIVE",
      "documentCount": 3,
      "riskCandidateCount": 2,
      "lastActivityAt": "2026-06-29T01:00:00Z"
    }
  ],
  "page": 1,
  "size": 20,
  "total": 42,
  "hasNext": true
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
  "status": "ACTIVE",
  "documentCount": 3,
  "riskCandidateCount": 2,
  "createdAt": "2026-06-29T00:00:00Z",
  "updatedAt": "2026-06-29T00:00:00Z",
  "lastActivityAt": "2026-06-29T01:00:00Z"
}
```

## 수정 규칙

클라이언트가 `PATCH /projects/{projectId}` 요청 본문으로 수정 요청할 수 있는 필드는 다음과 같다.

- `name`
- `description`

클라이언트가 요청 본문으로 직접 수정할 수 없는 필드는 다음과 같다.

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

`PATCH` 요청에서 `name`이 누락되면 기존 값을 유지한다. `name`이 제공되면 생성 시와 동일하게 앞뒤 공백 제거, 1~100자 검증을 적용한다. `description` 필드가 누락되면 기존 값을 유지한다. `description`이 `null`이거나, 빈 문자열이거나, 공백만 포함하면 `null`로 정규화한다. 값이 있으면 앞뒤 공백을 제거한 문자열로 저장한다.

`PATCH` 요청 DTO는 필드 누락과 명시적 `null` 전달을 구분할 수 있어야 한다. 유스케이스로 전달하기 전에 요청 DTO 또는 매퍼에서 `fieldProvided` 여부를 판별하고, 누락된 필드는 변경 대상에서 제외한다. 이 요구사항은 특정 프레임워크 기능에 의존하지 않는 API 계약이다.

시스템이 내부 비즈니스 로직으로 갱신하는 필드는 다음과 같다.

- `updatedAt`
- `lastActivityAt`

`updatedAt`은 사용자가 직접 수정할 수 없지만, 시스템 내부에서 자동 갱신한다. `PATCH /projects/{projectId}`가 성공하면 `updatedAt`은 `now`로 변경한다. `archive`와 `restore`가 성공해도 `updatedAt`은 `now`로 변경한다. 이때 `lastActivityAt`은 변경하지 않는다. `lastActivityAt`은 ORM의 자동 수정 시각 감사 기능과 연결하지 않고, 서비스 계층의 명시적인 업무 활동 처리에서만 갱신한다.

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

1차 Project API 구현에서는 이 개념들을 직접 구현하지 않는다. 단, `documentCount`, `riskCandidateCount`, `lastActivityAt`처럼 목록과 상세에 필요한 요약 필드는 Project 응답에 포함할 수 있다. 후속 Aggregate에서 업무 활동이 발생하면 도메인 이벤트나 애플리케이션 서비스 조정을 통해 Project 요약 필드를 갱신하는 방향으로 확장한다.

1차 MVP에서 `documentCount`와 `riskCandidateCount`는 `0`으로 초기화하고, Document/RiskCandidate 기능이 구현되기 전까지 기본값 `0`을 유지한다. 후속 기능에서 실제 문서 수와 리스크 후보 수를 집계해 갱신한다.
