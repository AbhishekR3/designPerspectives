/** Host name checks shared by everything that connects to another address: loopback, and addresses that are never a target. */

import { ModelError } from "./modelEdits.js";

/** True for a loopback host: 127.0.0.0/8, ::1 or localhost (a URL's `hostname`, IPv6 in brackets). */
export function isLoopback(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (h === "localhost" || h === "[::1]" || h === "::1") return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  return !!m && Number(m[1]) === 127 && m.slice(2).every((x) => Number(x) <= 255);
}

/** Link-local and cloud-metadata addresses (169.254.0.0/16, fe80::/10, the metadata host names): never a model server, and where a cloud's credentials live. `hostname` as `URL` gives it (numeric spellings are already dotted decimal). */
export function isLinkLocal(hostname: string): boolean {
  const h = hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^\[|\]$/g, "");
  if (h === "metadata.google.internal" || h === "metadata") return true;
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(h)) return true;
  // An IPv4 address inside an IPv6 one: ::ffff:a9fe:xxxx is 169.254.x.x.
  return /^(?:0{0,4}:){2,5}ffff:a9fe:[0-9a-f]{1,4}$/.test(h) || /^::ffff:169\.254\.\d{1,3}\.\d{1,3}$/.test(h);
}

/**
 * Check the address of a service dp sends a token to (a model server, a git host, a quality server, an issue
 * tracker). The rules, the same for every such address: http or https only; https unless the host is this
 * machine (loopback); no user name or password, query or fragment; never a link-local or cloud-metadata
 * address. `what` names the address in the messages ("endpoint", "address"). Returns the parsed URL; throws
 * a ModelError with a message for people.
 */
export function checkServiceUrl(raw: string, what: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new ModelError(`The ${what} is not a web address.`);
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new ModelError(`The ${what} must start with https:// (or http:// for this computer).`);
  if (u.username || u.password) throw new ModelError(`The ${what} must not hold a user name or password; store the key as a credential.`);
  if (u.search || raw.includes("?")) throw new ModelError(`The ${what} must not have a query (?...).`);
  if (u.hash || raw.includes("#")) throw new ModelError(`The ${what} must not have a fragment (#...).`);
  if (!u.hostname) throw new ModelError(`The ${what} has no host.`);
  if (isLinkLocal(u.hostname))
    throw new ModelError(
      `The ${what} is a link-local or cloud-metadata address (169.254.x.x, fe80::, a metadata host name). That is never a service of yours and it is where a cloud machine keeps its credentials.`,
    );
  if (u.protocol === "http:" && !isLoopback(u.hostname)) throw new ModelError("A host other than this computer (127.0.0.1, ::1, localhost) must use https.");
  return u;
}

/** A checked address as a base: scheme, host and port, and the path without a trailing slash. */
export const baseOf = (u: URL): string => `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, "")}`;
