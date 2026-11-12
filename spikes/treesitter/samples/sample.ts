import { readFile } from 'node:fs/promises';
import type { Stats } from 'node:fs';
import * as path from 'node:path';
import defaultThing, { helper as h } from './helper';

export interface Element {
  id: string;
  kind: 'system' | 'container' | 'component';
}

export type ElementMap = Map<string, Element>;

export enum Level {
  Context = 1,
  Container,
  Component,
}

export const DEFAULT_LEVEL: Level = Level.Container;
let counter = 0;

export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

export class Workspace {
  private readonly elements: ElementMap = new Map();
  add(e: Element): void { this.elements.set(e.id, e); }
  get size(): number { return this.elements.size; }
}

export default async function load(file: string): Promise<string> {
  const text = await readFile(path.resolve(file), 'utf8');
  return h(defaultThing(text));
}
