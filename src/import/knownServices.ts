/**
 * A shipped lookup list of well-known external products (third-party services and infrastructure images).
 * The scan uses it to turn a dependency name (npm, PyPI, Go module), a container image or a host name in a
 * configuration sample into a named external system. It makes the first C1 and C2 candidates deterministic.
 *
 * It is a lookup, not a claim: a match says "this code mentions that product", not that it is used the way
 * the list's category suggests. The list needs upkeep (DEC-051); a project adds or overrides entries in the
 * intake (`services`). Entries of the intake are looked at first.
 *
 * Matching rules (`matchService`):
 * - npm and go: the name equals an entry or lies under it ("@sentry/node" matches "@sentry", "github.com/stripe/stripe-go/v76"
 *   matches "github.com/stripe/stripe-go");
 * - pypi: the normalised name (lower case, runs of "-", "_" and "." as "-") equals an entry;
 * - image: the image without registry tag or digest equals an entry or ends with "/<entry>" ("docker.io/library/postgres:16" matches "postgres");
 * - host: the host equals an entry or is a sub-domain of it ("api.stripe.com" matches "stripe.com").
 * An exact match beats a prefix match, then the longer entry wins.
 */

export type ServiceKind = "npm" | "pypi" | "go" | "image" | "host";

export interface KnownService {
  match: { npm?: string[]; pypi?: string[]; go?: string[]; image?: string[]; host?: string[] };
  /** The external system's name, as it would appear on a diagram. */
  system: string;
  /** A short category: payments, identity, email, sms, analytics, search, maps, llm, feature-flags, monitoring, error-tracking, database, cache, queue, object-storage. */
  category: string;
  /** The `dp.archType` the object would get (database, cache, queue, storage, cloud, service). */
  archType?: string;
}

type Entry = [system: string, category: string, archType: string | undefined, match: KnownService["match"]];

const TABLE: Entry[] = [
  ["Adyen", "payments", "cloud", { npm: ["@adyen/api-library"], pypi: ["adyen"], host: ["adyen.com"] }],
  ["Algolia", "search", "cloud", { npm: ["algoliasearch", "@algolia"], pypi: ["algoliasearch"], host: ["algolia.net", "algolia.com"] }],
  ["Amplitude", "analytics", "cloud", { npm: ["@amplitude", "amplitude-js"], pypi: ["amplitude-analytics"], host: ["amplitude.com"] }],
  ["Anthropic API", "llm", "cloud", { npm: ["@anthropic-ai/sdk"], pypi: ["anthropic"], go: ["github.com/anthropics/anthropic-sdk-go"], host: ["api.anthropic.com"] }],
  ["Apache Cassandra", "database", "database", { image: ["cassandra"] }],
  ["Apache Kafka", "queue", "queue", { image: ["apache/kafka", "bitnami/kafka", "confluentinc/cp-kafka"] }],
  ["Auth0", "identity", "cloud", { npm: ["auth0", "@auth0"], pypi: ["auth0-python"], host: ["auth0.com"] }],
  ["Bugsnag", "error-tracking", "cloud", { npm: ["@bugsnag"], pypi: ["bugsnag"], host: ["bugsnag.com"] }],
  ["ClickHouse", "database", "database", { image: ["clickhouse/clickhouse-server", "yandex/clickhouse-server"] }],
  ["Clerk", "identity", "cloud", { npm: ["@clerk"], host: ["clerk.com"] }],
  ["Cohere", "llm", "cloud", { npm: ["cohere-ai"], pypi: ["cohere"], host: ["api.cohere.ai", "api.cohere.com"] }],
  ["CockroachDB", "database", "database", { image: ["cockroachdb/cockroach"] }],
  ["Datadog", "monitoring", "cloud", { npm: ["dd-trace", "datadog-metrics", "hot-shots"], pypi: ["ddtrace", "datadog"], host: ["datadoghq.com"] }],
  [
    "Elasticsearch",
    "search",
    "database",
    { npm: ["@elastic/elasticsearch"], pypi: ["elasticsearch"], image: ["elasticsearch", "elastic/elasticsearch", "docker.elastic.co/elasticsearch/elasticsearch"] },
  ],
  ["Firebase", "identity", "cloud", { npm: ["firebase", "firebase-admin", "@firebase"], pypi: ["firebase-admin"], host: ["firebaseio.com"] }],
  ["Google Maps", "maps", "cloud", { npm: ["@googlemaps", "@react-google-maps/api"], pypi: ["googlemaps"], host: ["maps.googleapis.com"] }],
  ["Hugging Face", "llm", "cloud", { npm: ["@huggingface"], pypi: ["huggingface-hub"], host: ["huggingface.co"] }],
  ["InfluxDB", "database", "database", { image: ["influxdb"] }],
  ["LaunchDarkly", "feature-flags", "cloud", { npm: ["launchdarkly-node-server-sdk", "launchdarkly-js-client-sdk", "@launchdarkly"], pypi: ["launchdarkly-server-sdk"], host: ["launchdarkly.com"] }],
  ["Mailchimp", "email", "cloud", { npm: ["@mailchimp"], pypi: ["mailchimp-marketing", "mailchimp3"], host: ["mailchimp.com"] }],
  ["Mailgun", "email", "cloud", { npm: ["mailgun.js", "mailgun-js"], pypi: ["mailgun"], host: ["mailgun.net", "mailgun.com"] }],
  ["Mapbox", "maps", "cloud", { npm: ["mapbox-gl", "@mapbox"], host: ["api.mapbox.com"] }],
  ["Meilisearch", "search", "database", { npm: ["meilisearch"], pypi: ["meilisearch"], image: ["getmeili/meilisearch"] }],
  ["Memcached", "cache", "cache", { image: ["memcached"] }],
  ["Mistral AI", "llm", "cloud", { npm: ["@mistralai/mistralai"], pypi: ["mistralai"], host: ["api.mistral.ai"] }],
  ["Mixpanel", "analytics", "cloud", { npm: ["mixpanel", "mixpanel-browser"], pypi: ["mixpanel"], host: ["mixpanel.com"] }],
  ["MinIO", "object-storage", "storage", { image: ["minio/minio"] }],
  ["MongoDB", "database", "database", { image: ["mongo", "mongodb/mongodb-community-server"] }],
  ["MySQL", "database", "database", { image: ["mysql", "bitnami/mysql"] }],
  ["MariaDB", "database", "database", { image: ["mariadb", "bitnami/mariadb"] }],
  ["NATS", "queue", "queue", { image: ["nats"] }],
  ["Neo4j", "database", "database", { image: ["neo4j"] }],
  ["New Relic", "monitoring", "cloud", { npm: ["newrelic"], pypi: ["newrelic"], go: ["github.com/newrelic/go-agent"], host: ["newrelic.com"] }],
  ["Okta", "identity", "cloud", { npm: ["@okta"], pypi: ["okta"], host: ["okta.com"] }],
  ["OpenAI API", "llm", "cloud", { npm: ["openai"], pypi: ["openai"], go: ["github.com/openai/openai-go", "github.com/sashabaranov/go-openai"], host: ["api.openai.com"] }],
  ["OpenSearch", "search", "database", { image: ["opensearchproject/opensearch"] }],
  ["PayPal", "payments", "cloud", { npm: ["paypal-rest-sdk", "@paypal"], pypi: ["paypalrestsdk", "paypal-checkout-serversdk"], host: ["paypal.com"] }],
  ["PostgreSQL", "database", "database", { image: ["postgres", "postgis/postgis", "bitnami/postgresql", "timescale/timescaledb"] }],
  ["PostHog", "analytics", "cloud", { npm: ["posthog-js", "posthog-node"], pypi: ["posthog"], host: ["posthog.com"] }],
  ["Postmark", "email", "cloud", { npm: ["postmark"], pypi: ["postmarker"], host: ["postmarkapp.com"] }],
  ["RabbitMQ", "queue", "queue", { image: ["rabbitmq", "bitnami/rabbitmq"] }],
  ["Redis", "cache", "cache", { image: ["redis", "redis/redis-stack", "bitnami/redis", "valkey/valkey"] }],
  ["Rollbar", "error-tracking", "cloud", { npm: ["rollbar"], pypi: ["rollbar"], host: ["rollbar.com"] }],
  ["Segment", "analytics", "cloud", { npm: ["@segment", "analytics-node"], pypi: ["analytics-python", "segment-analytics-python"], host: ["segment.io", "segment.com"] }],
  ["SendGrid", "email", "cloud", { npm: ["@sendgrid"], pypi: ["sendgrid"], host: ["sendgrid.com", "sendgrid.net"] }],
  ["Sentry", "error-tracking", "cloud", { npm: ["@sentry"], pypi: ["sentry-sdk"], go: ["github.com/getsentry/sentry-go"], host: ["sentry.io"] }],
  ["Square", "payments", "cloud", { npm: ["square"], pypi: ["squareup"], host: ["squareup.com"] }],
  ["Stripe", "payments", "cloud", { npm: ["stripe", "@stripe"], pypi: ["stripe"], go: ["github.com/stripe/stripe-go"], host: ["stripe.com"] }],
  ["Twilio", "sms", "cloud", { npm: ["twilio"], pypi: ["twilio"], go: ["github.com/twilio/twilio-go"], host: ["twilio.com"] }],
  ["Typesense", "search", "database", { npm: ["typesense"], pypi: ["typesense"], image: ["typesense/typesense"] }],
  ["Unleash", "feature-flags", "cloud", { npm: ["unleash-client"], pypi: ["unleashclient"], image: ["unleashorg/unleash-server"] }],
];

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function sortedMatch(m: KnownService["match"]): KnownService["match"] {
  const out: KnownService["match"] = {};
  for (const k of ["npm", "pypi", "go", "image", "host"] as const) if (m[k]) out[k] = [...m[k]!].sort(cmp);
  return out;
}

/** The shipped list: sorted by system name, each entry's match lists sorted. */
export const KNOWN_SERVICES: KnownService[] = TABLE.map(([system, category, archType, match]): KnownService => {
  const e: KnownService = { match: sortedMatch(match), system, category };
  if (archType) e.archType = archType;
  return e;
}).sort((a, b) => cmp(a.system, b.system));

/** Whether a known service is a datastore or a queue (a C2 container by itself) rather than an external product. */
export const INFRA_CATEGORIES = new Set(["cache", "database", "object-storage", "queue", "search"]);

/** `postgres:16` and `docker.io/library/postgres@sha256:...` as `postgres` / `docker.io/library/postgres`; lower case. */
export function imageName(image: string): string {
  let s = image.trim().toLowerCase();
  const at = s.indexOf("@");
  if (at >= 0) s = s.slice(0, at);
  const slash = s.lastIndexOf("/");
  const colon = s.lastIndexOf(":");
  if (colon > slash) s = s.slice(0, colon);
  return s;
}

export function normalisePypi(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[-_.]+/g, "-");
}

/** Score of `name` against one entry: 2 + length for an exact match, 1 + length for a prefix match, 0 for none. */
function score(kind: ServiceKind, name: string, entry: string): number {
  const e = kind === "pypi" ? normalisePypi(entry) : entry.toLowerCase();
  if (name === e) return 1000 + e.length;
  if (kind === "npm" || kind === "go") return name.startsWith(e + "/") ? e.length : 0;
  if (kind === "image") return name.endsWith("/" + e) ? e.length : 0;
  if (kind === "host") return name.endsWith("." + e) ? e.length : 0;
  return 0;
}

/**
 * The entry that matches a dependency name, image or host, or null. `extra` (the intake's services) is
 * looked at before the shipped list: a match there wins over any match in the list.
 */
export function matchService(kind: ServiceKind, name: string, extra: KnownService[] = []): KnownService | null {
  const n = kind === "pypi" ? normalisePypi(name) : kind === "image" ? imageName(name) : name.trim().toLowerCase();
  if (!n) return null;
  for (const list of [extra, KNOWN_SERVICES]) {
    let best: KnownService | null = null;
    let bestScore = 0;
    for (const svc of list) {
      for (const entry of svc.match[kind] ?? []) {
        const s = score(kind, n, entry);
        if (s > bestScore) {
          best = svc;
          bestScore = s;
        }
      }
    }
    if (best) return best;
  }
  return null;
}
