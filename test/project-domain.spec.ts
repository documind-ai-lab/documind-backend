import { Project } from "../src/project-workspace/domain/project";
import { ProjectStateConflictError } from "../src/project-workspace/domain/project.errors";
import { ProjectStatus } from "../src/project-workspace/domain/project-status";
import { ProjectType } from "../src/project-workspace/domain/project-type";

describe("Project domain", () => {
  const id = "018f1f4f-85e5-7c9a-b7b8-1d46b67f6b10";
  const ownerId = "7f0d8c54-7e3a-4a7f-b4b2-2c8f8c5a1d6e";
  const now = new Date("2026-06-29T01:00:00.000Z");

  it("프로젝트 생성 시 이름과 설명을 정규화하고 기본 상태와 요약 값을 초기화한다", () => {
    const project = Project.create({
      id,
      ownerId,
      name: "  A사 제안 검토  ",
      description: "   ",
      type: ProjectType.PROPOSAL_REVIEW,
      now
    });

    expect(project.snapshot()).toEqual({
      id,
      ownerId,
      name: "A사 제안 검토",
      description: null,
      type: ProjectType.PROPOSAL_REVIEW,
      status: ProjectStatus.ACTIVE,
      documentCount: 0,
      riskCandidateCount: 0,
      createdAt: now,
      updatedAt: now,
      lastActivityAt: now
    });
  });

  it("프로젝트 기본 정보를 수정하면 updatedAt만 갱신하고 lastActivityAt은 유지한다", () => {
    const project = Project.create({
      id,
      ownerId,
      name: "A사 제안 검토",
      description: "초기 설명",
      type: ProjectType.PROPOSAL_REVIEW,
      now
    });
    const updatedAt = new Date("2026-06-29T02:00:00.000Z");

    project.update({ name: "  A사 최종 제안 검토  ", description: null, now: updatedAt });

    expect(project.snapshot()).toMatchObject({
      name: "A사 최종 제안 검토",
      description: null,
      updatedAt,
      lastActivityAt: now
    });
  });

  it("ACTIVE 프로젝트를 보관하고 ARCHIVED 프로젝트를 복원한다", () => {
    const project = Project.create({
      id,
      ownerId,
      name: "A사 제안 검토",
      description: null,
      type: ProjectType.PROPOSAL_REVIEW,
      now
    });
    const archivedAt = new Date("2026-06-29T02:00:00.000Z");
    const restoredAt = new Date("2026-06-29T03:00:00.000Z");

    project.archive(archivedAt);
    expect(project.snapshot()).toMatchObject({
      status: ProjectStatus.ARCHIVED,
      updatedAt: archivedAt,
      lastActivityAt: now
    });

    project.restore(restoredAt);
    expect(project.snapshot()).toMatchObject({
      status: ProjectStatus.ACTIVE,
      updatedAt: restoredAt,
      lastActivityAt: now
    });
  });

  it("이미 보관된 프로젝트를 다시 보관하면 상태 충돌 오류를 던진다", () => {
    const project = Project.create({
      id,
      ownerId,
      name: "A사 제안 검토",
      description: null,
      type: ProjectType.PROPOSAL_REVIEW,
      now
    });

    project.archive(new Date("2026-06-29T02:00:00.000Z"));

    expect(() => project.archive(new Date("2026-06-29T03:00:00.000Z"))).toThrow(
      ProjectStateConflictError
    );
  });
});
