import { Transform, Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength
} from "class-validator";
import { ProjectStatus } from "../domain/project-status";
import { ProjectType } from "../domain/project-type";

export enum ProjectListStatus {
  ACTIVE = "ACTIVE",
  ARCHIVED = "ARCHIVED",
  ALL = "ALL"
}

export class CreateProjectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsEnum(ProjectType)
  type!: ProjectType;
}

export class ListProjectsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  size = 20;

  @IsOptional()
  @IsEnum(ProjectListStatus)
  status: ProjectStatus | "ALL" = ProjectStatus.ACTIVE;
}

export class ProjectIdParamDto {
  @IsUUID()
  projectId!: string;
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @Transform(({ value }) => (value === null ? null : value))
  @IsString()
  @MaxLength(1000)
  description?: string | null;
}
