/** Session look-up against the Session Cache (Redis). */

import { createClient } from "redis";

const cache = createClient({ url: process.env.SESSION_CACHE_URL });

export async function sessionUser(authorization: string | undefined): Promise<string | null> {
  const token = authorization?.replace(/^Bearer /, "");
  if (!token) return null;
  return cache.get(`session:${token}`);
}
