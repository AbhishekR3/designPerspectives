// Stage 9: encrypt each statement with the statements key before it leaves the job.

export interface Kms {
  encrypt(keyId: string, data: Uint8Array): Promise<Uint8Array>;
}

export const STATEMENTS_KEY = "kms:statements-2026";

export async function encryptStatement(file: string, bytes: Uint8Array, kms: Kms): Promise<{ object: string; keyId: string; bytes: Uint8Array }> {
  return { object: `${file}.enc`, keyId: STATEMENTS_KEY, bytes: await kms.encrypt(STATEMENTS_KEY, bytes) };
}
