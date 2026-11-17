/** "1 step", "2 steps", "0 steps": a count with its word. `many` is for words that do not just take an s. */
export const plural = (n: number, word: string, many = `${word}s`): string => `${n} ${n === 1 ? word : many}`;
