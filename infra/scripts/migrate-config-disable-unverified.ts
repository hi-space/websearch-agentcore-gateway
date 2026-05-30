import {
  DynamoDBClient,
  ScanCommand,
  UpdateItemCommand,
  PutItemCommand
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const CONFIG_TABLE = process.env.CONFIG_TABLE;
const AUDIT_TABLE = process.env.AUDIT_TABLE;
const REGION = process.env.AWS_REGION ?? 'us-east-1';
const DRY_RUN = process.argv.includes('--dry-run');

if (!CONFIG_TABLE || !AUDIT_TABLE) {
  console.error('CONFIG_TABLE and AUDIT_TABLE env vars are required');
  process.exit(1);
}

const ddb = new DynamoDBClient({ region: REGION });

async function main() {
  const out = await ddb.send(new ScanCommand({ TableName: CONFIG_TABLE }));
  const items = out.Items ?? [];
  const at = new Date().toISOString();
  let touched = 0;

  for (const raw of items) {
    const r = unmarshall(raw) as { providerId: string; pk: string; sk: string; enabled: boolean };
    if (r.pk !== 'provider') continue;

    const lastVerify = { at, ok: false, error: 'migration: never verified', code: 'MIGRATION' };
    console.log(
      `${DRY_RUN ? '[dry-run] ' : ''}provider=${r.providerId} enabled ${r.enabled} → false; lastVerify.code=MIGRATION`
    );

    if (DRY_RUN) continue;

    await ddb.send(
      new UpdateItemCommand({
        TableName: CONFIG_TABLE,
        Key: marshall({ pk: 'provider', sk: r.providerId }),
        UpdateExpression: 'SET #enabled = :e, lastVerify = :lv',
        ExpressionAttributeNames: { '#enabled': 'enabled' },
        ExpressionAttributeValues: marshall({ ':e': false, ':lv': lastVerify })
      })
    );

    await ddb.send(
      new PutItemCommand({
        TableName: AUDIT_TABLE,
        Item: marshall({
          actor: 'migration:disable-unverified',
          ts: at,
          action: 'migration_disable_unverified',
          target: `provider:${r.providerId}`,
          before: { enabled: r.enabled },
          after: { enabled: false, lastVerify }
        })
      })
    );
    touched += 1;
  }

  console.log(`${DRY_RUN ? '[dry-run] ' : ''}done. providers touched: ${touched}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
