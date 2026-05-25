// One-off script: sets a public-read bucket policy on the Tigris icons bucket.
// Required because Tigris ignores object-level ACL: 'public-read' without a
// permissive bucket policy in place.
//
// Run with:
//   npx tsx scripts/set-bucket-policy.ts

import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  const { S3Client, PutBucketAclCommand } = await import('@aws-sdk/client-s3');

  const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.AWS_ENDPOINT_URL!,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: false,
  });

  const bucket = process.env.AWS_S3_BUCKET_NAME!;

  await s3.send(new PutBucketAclCommand({ Bucket: bucket, ACL: 'public-read' }));
  console.log(`Bucket ACL set to public-read — icons are now publicly readable on ${bucket}`);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
