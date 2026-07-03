import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand
} from "@aws-sdk/client-s3";
import { S3DocumentStorage } from "../src/document-workspace/infrastructure/s3-document-storage";

describe("S3DocumentStorage", () => {
  it("put은 PutObjectCommand로 bucket, key, content를 업로드한다", async () => {
    const client = createS3Client();
    const storage = new S3DocumentStorage(client, { bucket: "documind-documents" });
    const content = Buffer.from("proposal");

    await storage.put("projects/p1/documents/d1/d1.pdf", content);

    expect(client.send).toHaveBeenCalledTimes(1);
    expect(client.send.mock.calls[0][0]).toBeInstanceOf(PutObjectCommand);
    expect(getCommandInput(client)).toEqual({
      Bucket: "documind-documents",
      Key: "projects/p1/documents/d1/d1.pdf",
      Body: content
    });
  });

  it("exists는 HeadObjectCommand가 성공하면 true를 반환한다", async () => {
    const client = createS3Client();
    client.send.mockResolvedValueOnce({});
    const storage = new S3DocumentStorage(client, { bucket: "documind-documents" });

    await expect(storage.exists("projects/p1/documents/d1/d1.pdf")).resolves.toBe(true);

    expect(client.send.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand);
    expect(getCommandInput(client)).toEqual({
      Bucket: "documind-documents",
      Key: "projects/p1/documents/d1/d1.pdf"
    });
  });

  it("exists는 S3 404 계열 오류를 false로 반환한다", async () => {
    const client = createS3Client();
    client.send.mockRejectedValueOnce({
      name: "NotFound",
      $metadata: { httpStatusCode: 404 }
    });
    const storage = new S3DocumentStorage(client, { bucket: "documind-documents" });

    await expect(storage.exists("projects/p1/documents/missing/missing.pdf")).resolves.toBe(false);
  });

  it("exists는 404가 아닌 오류를 전파한다", async () => {
    const client = createS3Client();
    client.send.mockRejectedValueOnce({
      name: "AccessDenied",
      $metadata: { httpStatusCode: 403 }
    });
    const storage = new S3DocumentStorage(client, { bucket: "documind-documents" });

    await expect(storage.exists("projects/p1/documents/d1/d1.pdf")).rejects.toMatchObject({
      name: "AccessDenied"
    });
  });

  it("exists는 비객체 오류도 TypeError로 바꾸지 않고 그대로 전파한다", async () => {
    const client = createS3Client();
    client.send.mockRejectedValueOnce(null);
    const storage = new S3DocumentStorage(client, { bucket: "documind-documents" });

    await expect(storage.exists("projects/p1/documents/d1/d1.pdf")).rejects.toBeNull();
  });

  it("remove는 DeleteObjectCommand로 object 삭제를 요청한다", async () => {
    const client = createS3Client();
    const storage = new S3DocumentStorage(client, { bucket: "documind-documents" });

    await storage.remove("projects/p1/documents/d1/d1.pdf");

    expect(client.send).toHaveBeenCalledTimes(1);
    expect(client.send.mock.calls[0][0]).toBeInstanceOf(DeleteObjectCommand);
    expect(getCommandInput(client)).toEqual({
      Bucket: "documind-documents",
      Key: "projects/p1/documents/d1/d1.pdf"
    });
  });
});

function createS3Client() {
  return {
    send: jest.fn().mockResolvedValue({})
  };
}

function getCommandInput(client: ReturnType<typeof createS3Client>): unknown {
  return client.send.mock.calls[0][0].input;
}
