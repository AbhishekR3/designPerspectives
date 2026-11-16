/**
 * Field names whose values are hidden ("•••") wherever dp shows data observed in a running system:
 * secrets (passwords, tokens, keys, cookies) and personal financial data (card numbers, IBANs).
 * The live UI script (src/server/inspectScript.ts) carries the same list as text; keep them equal.
 */
export const SECRET_FIELD = /pass(word|wd)?$|secret|token|authori[sz]ation|cookie|session|api[-_.]?key|ssn|cvv|cvc|card[-_.]?(number|no)|pan$|iban|pin$/i;

export const MASK = "•••";
