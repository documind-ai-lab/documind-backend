import { IncomingHttpHeaders } from "http";
import { Type, plainToInstance } from "class-transformer";
import { IsInt, IsString, IsUUID, Max, MaxLength, Min, validateSync } from "class-validator";
import { UnprocessableEntityException } from "@nestjs/common";

export class CreateChatMessageBodyDto {
  @IsString()
  @MaxLength(4000)
  content!: string;
}

export class ListChatMessagesQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  size = 30;
}

export class OwnerIdHeaderDto {
  @IsUUID()
  ownerId!: string;
}

export function parseOwnerIdHeader(headers: IncomingHttpHeaders): OwnerIdHeaderDto {
  const dto = plainToInstance(OwnerIdHeaderDto, {
    ownerId: firstHeaderValue(headers["x-owner-id"])
  });
  const errors = validateSync(dto);

  if (errors.length > 0) {
    throw new UnprocessableEntityException({
      message: errors.flatMap((error) => Object.values(error.constraints ?? {}))
    });
  }

  return dto;
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
