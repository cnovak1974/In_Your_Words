import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config, providers } from "./config.js";

export const mockObjects = new Map<string, Buffer>();
export const mockObjectContentTypes = new Map<string, string>();
export const storageUrlLifetimeSeconds = 15 * 60;

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
  },
});

export async function createUploadUrl(key: string, contentType: string) {
  if (providers.storage === "mock") return `${config.publicApiUrl}/api/mock/uploads/${encodeURIComponent(key)}?contentType=${encodeURIComponent(contentType)}`;
  return getSignedUrl(
    r2,
    new PutObjectCommand({ Bucket: config.r2.bucket, Key: key, ContentType: contentType }),
    { expiresIn: storageUrlLifetimeSeconds },
  );
}

export async function createReadUrl(key: string) {
  if (providers.storage === "mock") return `mock://${key}`;
  return getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: config.r2.bucket, Key: key }),
    { expiresIn: storageUrlLifetimeSeconds },
  );
}

export async function confirmObject(key: string) {
  if (providers.storage === "mock") {
    const value=mockObjects.get(key); if(!value?.length) throw new Error("Uploaded audio object is missing or empty");
    return { contentLength:value.length, contentType:mockObjectContentTypes.get(key) ?? "application/octet-stream" };
  }
  const result = await r2.send(new HeadObjectCommand({ Bucket: config.r2.bucket, Key: key }));
  if (!result.ContentLength || result.ContentLength <= 0) {
    throw new Error("Uploaded audio object is missing or empty");
  }
  return { contentLength: result.ContentLength, contentType: result.ContentType };
}

