/** Host name checks shared by everything that connects to another address: loopback, and addresses that are never a target. */

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
