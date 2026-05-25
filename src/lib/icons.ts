import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { safeFetch } from './fetch-allowlist';

const DUCKDUCKGO_FAVICON = 'https://icons.duckduckgo.com/ip3';

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.AWS_ENDPOINT_URL!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: false,
});

export async function fetchAndStoreIcon(
  token: string,
  homepage: string
): Promise<{ url: string | null; isFallback: boolean }> {
  let domain: string;
  try {
    domain = new URL(homepage).hostname;
  } catch {
    return { url: null, isFallback: true };
  }

  const faviconUrl = `${DUCKDUCKGO_FAVICON}/${domain}.ico`;
  const res = await safeFetch(faviconUrl);

  // PITFALL: DuckDuckGo returns a PNG body even on 404 — check HTTP status, NOT body length
  if (res.status !== 200) {
    return { url: null, isFallback: true };
  }

  const iconBuffer = await res.arrayBuffer();
  const key = `icons/${token}.ico`;
  const bucket = process.env.AWS_S3_BUCKET_NAME!;

  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: Buffer.from(iconBuffer),
    ContentType: 'image/x-icon',
    ACL: 'public-read',
  }));

  const publicUrl = `https://${bucket}.t3.storage.dev/${key}`;
  return { url: publicUrl, isFallback: false };
}
