import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { DynamoDBStreamHandler } from 'aws-lambda';

export interface HandlerDeps {
  s3: S3Client;
  bucket: string;
  retainUntilDays?: number;
}

export function createHandler(deps: HandlerDeps): DynamoDBStreamHandler {
  return async (event) => {
    const days = deps.retainUntilDays ?? 365 * 7; // 7 years default
    for (const r of event.Records) {
      if (r.eventName !== 'INSERT' || !r.dynamodb?.NewImage) continue;
      const row = unmarshall(r.dynamodb.NewImage as never) as { actor: string; ts: string };
      const date = new Date(row.ts);
      const key = `${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}/${row.actor}_${date.getTime()}.json`;
      await deps.s3.send(
        new PutObjectCommand({
          Bucket: deps.bucket,
          Key: key,
          Body: JSON.stringify(row),
          ContentType: 'application/json',
          ObjectLockMode: 'COMPLIANCE',
          ObjectLockRetainUntilDate: new Date(Date.now() + days * 86_400_000)
        })
      );
    }
  };
}
