// Stage 10: store the encrypted statement, one object per account per month.

export interface Bucket {
  put(key: string, body: Uint8Array): Promise<{ versionId: string }>;
}

export async function uploadStatement(bucket: Bucket, account: string, period: string, body: Uint8Array): Promise<{ key: string; versionId: string }> {
  const key = objectKey(account, period);
  const { versionId } = await bucket.put(key, body);
  return { key, versionId };
}

export function objectKey(account: string, period: string): string {
  return `${account}/${period}.pdf.enc`;
}
