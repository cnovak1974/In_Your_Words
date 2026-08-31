import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { appMode, config } from "./config.js";

export const mockObjects = new Map<string, Buffer>();

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
  },
});

export async function createUploadUrl(key: string, contentType: string) {
  if (appMode === "mock") return `http://localhost:${config.port}/api/mock/uploads/${encodeURIComponent(key)}?contentType=${encodeURIComponent(contentType)}`;
  return getSignedUrl(
    r2,
    new PutObjectCommand({ Bucket: config.r2.bucket, Key: key, ContentType: contentType }),
    { expiresIn: 15 * 60 },
  );
}

export async function createReadUrl(key: string) {
  if (appMode === "mock") return `mock://${key}`;
  return getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: config.r2.bucket, Key: key }),
    { expiresIn: 15 * 60 },
  );
}

export async function confirmObject(key: string) {
  if (appMode === "mock") {
    const value=mockObjects.get(key); if(!value?.length) throw new Error("Uploaded audio object is missing or empty");
    return { contentLength:value.length, contentType:"audio/webm" };
  }
  const result = await r2.send(new HeadObjectCommand({ Bucket: config.r2.bucket, Key: key }));
  if (!result.ContentLength || result.ContentLength <= 0) {
    throw new Error("Uploaded audio object is missing or empty");
  }
  return { contentLength: result.ContentLength, contentType: result.ContentType };
}
