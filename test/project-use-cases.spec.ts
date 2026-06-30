import {
  ArchiveProjectUseCase,
  CreateProjectUseCase,
  GetProjectUseCase,
  ListProjectsUseCase,
  RestoreProjectUseCase,
  UpdateProjectUseCase
} from "../src/project-workspace/application/project.use-cases";
import { ProjectNotFoundError } from "../src/project-workspace/domain/project.errors";
import { ProjectStatus } from "../src/project-workspace/domain/project-status";
import { ProjectType } from "../src/project-workspace/domain/project-type";
import { InMemoryProjectRepository } from "../src/project-workspace/testing/in-memory-project.repository";
import { Clock } from "../src/shared/application/clock";
import { IdGenerator } from "../src/shared/application/id-generator";
import { OwnerProvider } from "../src/shared/application/owner-provider";

describe("Project use cases", () => {
  const ownerId = "7f0d8c54-7e3a-4a7f-b4b2-2c8f8c5a1d6e";

  let repository: InMemoryProjectRepository;
  let clock: StubClock;
  let idGenerator: StubIdGenerator;
  let ownerProvider: StubOwnerProvider;

  beforeEach(() => {
    repository = new InMemoryProjectRepository();
    clock = new StubClock(new Date("2026-06-29T01:00:00.000Z"));
    idGenerator = new StubIdGenerator();
    ownerProvider = new StubOwnerProvider(ownerId);
  });

  it("프로젝트를 생성할 때 id, ownerId, now를 주입하고 저장한다", async () => {
    idGenerator.next = "018f1f4f-85e5-7c9a-b7b8-1d46b67f6b10";
    const useCase = new CreateProjectUseCase(repository, clock, idGenerator, ownerProvider);

    const created = await useCase.execute({
      name: "  A사 제안 검토  ",
      description: " 제안서/견적서 검토 ",
      type: ProjectType.PROPOSAL_REVIEW
    });

    expect(created).toMatchObject({
      id: idGenerator.next,
      ownerId,
      name: "A사 제안 검토",
      description: "제안서/견적서 검토",
      type: ProjectType.PROPOSAL_REVIEW,
      status: ProjectStatus.ACTIVE,
      documentCount: 0,
      riskCandidateCount: 0,
      createdAt: clock.current,
      updatedAt: clock.current,
      lastActivityAt: clock.current
    });
    await expect(repository.findById(idGenerator.next)).resolves.not.toBeNull();
  });

  it("목록 조회는 기본 ACTIVE 필터와 lastActivityAt DESC, id DESC 정렬 및 페이징을 적용한다", async () => {
    await seedProject("018f1f4f-85e5-7c9a-b7b8-1d46b67f6b10", "오래된 프로젝트", "2026-06-29T01:00:00.000Z");
    await seedProject("018f1f4f-85e5-7c9a-b7b8-1d46b67f6b12", "동시각 B", "2026-06-29T02:00:00.000Z");
    await seedProject("018f1f4f-85e5-7c9a-b7b8-1d46b67f6b11", "동시각 A", "2026-06-29T02:00:00.000Z");
    const archived = await seedProject(
      "018f1f4f-85e5-7c9a-b7b8-1d46b67f6b13",
      "보관 프로젝트",
      "2026-06-29T03:00:00.000Z"
    );
    archived.archive(new Date("2026-06-29T04:00:00.000Z"));
    await repository.save(archived);
    const useCase = new ListProjectsUseCase(repository);

    const page = await useCase.execute({ page: 1, size: 2, status: ProjectStatus.ACTIVE });

    expect(page.items.map((project) => project.name)).toEqual(["동시각 B", "동시각 A"]);
    expect(page).toMatchObject({ page: 1, size: 2, total: 3, hasNext: true });
  });

  it("status=ALL이면 보관 프로젝트도 함께 조회한다", async () => {
    await seedProject("018f1f4f-85e5-7c9a-b7b8-1d46b67f6b10", "진행 프로젝트", "2026-06-29T01:00:00.000Z");
    const archived = await seedProject(
      "018f1f4f-85e5-7c9a-b7b8-1d46b67f6b11",
      "보관 프로젝트",
      "2026-06-29T02:00:00.000Z"
    );
    archived.archive(new Date("2026-06-29T03:00:00.000Z"));
    await repository.save(archived);
    const useCase = new ListProjectsUseCase(repository);

    const page = await useCase.execute({ page: 1, size: 10, status: "ALL" });

    expect(page.items.map((project) => project.status)).toEqual([
      ProjectStatus.ARCHIVED,
      ProjectStatus.ACTIVE
    ]);
    expect(page.total).toBe(2);
  });

  it("상세 조회 대상이 없으면 ProjectNotFoundError를 던진다", async () => {
    const useCase = new GetProjectUseCase(repository);

    await expect(useCase.execute("018f1f4f-85e5-7c9a-b7b8-1d46b67f6b10")).rejects.toThrow(
      ProjectNotFoundError
    );
  });

  it("수정, 보관, 복원 유스케이스는 Project 규칙을 적용한 뒤 저장한다", async () => {
    const project = await seedProject(
      "018f1f4f-85e5-7c9a-b7b8-1d46b67f6b10",
      "A사 제안 검토",
      "2026-06-29T01:00:00.000Z"
    );
    await repository.save(project);
    clock.current = new Date("2026-06-29T02:00:00.000Z");

    const updated = await new UpdateProjectUseCase(repository, clock).execute(project.snapshot().id, {
      name: " A사 최종 검토 ",
      description: null
    });
    expect(updated).toMatchObject({
      name: "A사 최종 검토",
      description: null,
      updatedAt: clock.current,
      lastActivityAt: project.snapshot().lastActivityAt
    });

    clock.current = new Date("2026-06-29T03:00:00.000Z");
    const archived = await new ArchiveProjectUseCase(repository, clock).execute(project.snapshot().id);
    expect(archived.status).toBe(ProjectStatus.ARCHIVED);

    clock.current = new Date("2026-06-29T04:00:00.000Z");
    const restored = await new RestoreProjectUseCase(repository, clock).execute(project.snapshot().id);
    expect(restored.status).toBe(ProjectStatus.ACTIVE);
  });

  async function seedProject(id: string, name: string, time: string) {
    idGenerator.next = id;
    clock.current = new Date(time);
    const project = await new CreateProjectUseCase(
      repository,
      clock,
      idGenerator,
      ownerProvider
    ).execute({
      name,
      description: null,
      type: ProjectType.GENERAL_ANALYSIS
    });
    return repository.findById(project.id).then((saved) => {
      if (saved === null) {
        throw new Error("seed project was not saved");
      }
      return saved;
    });
  }
});

class StubClock implements Clock {
  constructor(public current: Date) {}

  now(): Date {
    return this.current;
  }
}

class StubIdGenerator implements IdGenerator {
  next = "018f1f4f-85e5-7c9a-b7b8-1d46b67f6b10";

  nextId(): string {
    return this.next;
  }
}

class StubOwnerProvider implements OwnerProvider {
  constructor(private readonly ownerId: string) {}

  currentOwnerId(): string {
    return this.ownerId;
  }
}
