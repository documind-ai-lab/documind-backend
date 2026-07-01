import { Injectable, OnModuleInit } from "@nestjs/common";
import { access, mkdir, readFile, rm, writeFile } from "fs/promises";
import { dirname, isAbsolute, relative, resolve } from "path";
import { DocumentStorage } from "../application/document-storage";
import { DocumentStoragePathError } from "../domain/document.errors";

@Injectable()
export class LocalDocumentStorage implements DocumentStorage, OnModuleInit {
  private readonly absoluteBasePath: string;

  constructor(basePath: string) {
    this.absoluteBasePath = resolve(basePath);
  }

  async onModuleInit(): Promise<void> {
    await mkdir(this.absoluteBasePath, { recursive: true });
  }

  async put(storageKey: string, content: Buffer): Promise<void> {
    const storagePath = this.resolveStoragePath(storageKey);
    await mkdir(dirname(storagePath), { recursive: true });
    await writeFile(storagePath, content);
  }

  async exists(storageKey: string): Promise<boolean> {
    const storagePath = this.resolveStoragePath(storageKey);

    try {
      await access(storagePath);
      return true;
    } catch (error) {
      if (isNotFoundError(error)) {
        return false;
      }

      throw error;
    }
  }

  async remove(storageKey: string): Promise<void> {
    const storagePath = this.resolveStoragePath(storageKey);
    await rm(storagePath, { force: true });
  }

  async read(storageKey: string): Promise<Buffer> {
    return readFile(this.resolveStoragePath(storageKey));
  }

  private resolveStoragePath(storageKey: string): string {
    const storagePath = resolve(this.absoluteBasePath, storageKey);
    const relativePath = relative(this.absoluteBasePath, storagePath);

    if (relativePath === "" || relativePath.startsWith("..") || isAbsolute(relativePath)) {
      throw new DocumentStoragePathError("storageKey가 저장소 base path 밖을 가리킬 수 없습니다.");
    }

    return storagePath;
  }
}

function isNotFoundError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}
