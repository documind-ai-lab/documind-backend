import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { DocumentStorage } from "../application/document-storage";

export type S3DocumentStorageOptions = {
  bucket: string;
};

export type S3DocumentStorageClient = Pick<S3Client, "send">;

export class S3DocumentStorage implements DocumentStorage {
  constructor(
    private readonly client: S3DocumentStorageClient,
    private readonly options: S3DocumentStorageOptions
  ) {}

  async put(storageKey: string, content: Buffer): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: storageKey,
        Body: content
      })
    );
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.options.bucket,
          Key: storageKey
        })
      );
      return true;
    } catch (error) {
      if (isNotFoundError(error)) {
        return false;
      }

      throw error;
    }
  }

  async remove(storageKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.options.bucket,
        Key: storageKey
      })
    );
  }
}

function isNotFoundError(error: unknown): boolean {
  if (error === null || typeof error !== "object") {
    return false;
  }

  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    candidate.name === "NotFound" ||
    candidate.name === "NoSuchKey" ||
    candidate.$metadata?.httpStatusCode === 404
  );
}
