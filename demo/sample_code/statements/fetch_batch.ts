// Stage 1: fetch the month-end transaction file the mainframe drops on the SFTP server.

import type { RawRecord } from "./types";

export interface BatchFile {
  name: string;
  records: RawRecord[];
}

export async function fetchBatch(sftp: { get(path: string): Promise<string> }, period: string): Promise<BatchFile> {
  const name = batchFileName(period);
  const text = await sftp.get(`/outbound/statements/${name}`);
  return { name, records: splitLines(text) };
}

export function batchFileName(period: string): string {
  return `TXN_${period.replace("-", "")}31.dat`;
}

function splitLines(text: string): RawRecord[] {
  return text
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("HDR") && !l.startsWith("TRL"))
    .map((l, i) => ({ line: i + 1, text: l }));
}
