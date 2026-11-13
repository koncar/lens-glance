import { base64ToBytes, gunzip } from "./grafana-found";

// What runs inside Grafana's pod, through `kubectl exec`, and reading what it prints. Both need
// a shell there, which Grafana's images have, but its distroless one does not.

/** The container of a pod that runs Grafana, by its image: grafana/grafana, -oss or -enterprise, or a copy of it. */
export const grafanaContainerOf = (pod: {
  readonly spec?: { readonly containers?: readonly { readonly name: string; readonly image?: string }[] };
}) =>
  pod.spec?.containers?.find((container) => /(^|\/)grafana(-oss|-enterprise)?(:|@|$)/.test(container.image ?? ""))
    ?.name;

export const answerSeparator = "-----LENS-GLANCE-END-----";

/**
 * Asks Grafana's HTTP API on localhost, inside its pod, for each path given after the script, as
 * the admin whose credentials the pod is started with: the Helm chart and grafana-operator put
 * them in its environment. They are read by the pod's shell and handed to curl through a pipe,
 * so they are not on any command line, and never leave the pod. Each answer is printed with its
 * HTTP status and a separator after it.
 */
export const grafanaApiScript = `
u="\${GF_SECURITY_ADMIN_USER:-}"
p="\${GF_SECURITY_ADMIN_PASSWORD:-}"
if [ -n "\${GF_SECURITY_ADMIN_USER__FILE:-}" ]; then u="$(cat "$GF_SECURITY_ADMIN_USER__FILE")"; fi
if [ -n "\${GF_SECURITY_ADMIN_PASSWORD__FILE:-}" ]; then p="$(cat "$GF_SECURITY_ADMIN_PASSWORD__FILE")"; fi
if [ -z "$p" ]; then echo "LENS_GLANCE_NO_CREDENTIALS"; exit 0; fi
[ -n "$u" ] || u=admin
case "\${GF_SERVER_PROTOCOL:-http}" in https|h2) scheme=https ;; *) scheme=http ;; esac
sub=""
if [ "\${GF_SERVER_SERVE_FROM_SUB_PATH:-}" = "true" ]; then
  sub="$(printf '%s' "\${GF_SERVER_ROOT_URL:-}" | sed -e 's#^[a-zA-Z]*://[^/]*##' -e 's#/*$##')"
fi
base="$scheme://localhost:\${GF_SERVER_HTTP_PORT:-3000}$sub"
auth="$(printf '%s:%s' "$u" "$p" | base64 | tr -d '\\n')"
for path in "$@"; do
  if command -v curl >/dev/null 2>&1; then
    printf 'Authorization: Basic %s\\n' "$auth" | curl -sSk -H @- -H "Accept: application/json" -w '\\n%{http_code}' "$base$path"
  elif wget -qO- --no-check-certificate --header "Authorization: Basic $auth" "$base$path"; then
    printf '\\n200'
  else
    printf '\\n000'
  fi
  printf '\\n%s\\n' "${answerSeparator}"
done
`;

export interface ApiAnswer {
  readonly status: number;
  readonly body: string;
}

/** The answers the API script printed, in the order of the paths it was given. */
export const answersOfApiScript = (output: string): ApiAnswer[] | "no-credentials" => {
  if (output.trim() === "LENS_GLANCE_NO_CREDENTIALS") {
    return "no-credentials";
  }

  return output
    .split(`\n${answerSeparator}\n`)
    .slice(0, -1)
    .map((chunk) => {
      const lastLine = chunk.lastIndexOf("\n");

      return { status: Number(chunk.slice(lastLine + 1)) || 0, body: chunk.slice(0, Math.max(lastLine, 0)) };
    });
};

const maximumDatabaseSize = 256 * 1024 * 1024;

/**
 * Finds Grafana's database in its pod, by the environment and grafana.ini, and prints it, and
 * its write-ahead log when there is one, gzipped and in base64. Only SQLite is a file to print;
 * for any other database it prints which it is. Nothing else of grafana.ini is printed.
 */
export const grafanaDatabaseScript = `
cfg="\${GF_PATHS_CONFIG:-/etc/grafana/grafana.ini}"
data="\${GF_PATHS_DATA:-/var/lib/grafana}"
ini() {
  [ -r "$cfg" ] || return 0
  awk -v key="$1" '
    /^[ \\t]*\\[database\\][ \\t]*$/ { inside = 1; next }
    /^[ \\t]*\\[/ { inside = 0 }
    inside && $0 ~ "^[ \\t]*" key "[ \\t]*=" { sub(/^[^=]*=[ \\t]*/, ""); sub(/[ \\t]+$/, ""); value = $0 }
    END { if (value != "") print value }
  ' "$cfg"
}
type="\${GF_DATABASE_TYPE:-}"
if [ -z "$type" ] && [ -n "\${GF_DATABASE_URL:-}" ]; then type="\${GF_DATABASE_URL%%:*}"; fi
[ -n "$type" ] || type="$(ini type)"
[ -n "$type" ] || type=sqlite3
case "$type" in
  sqlite3|sqlite) ;;
  *) echo "LENS_GLANCE_DATABASE_TYPE=$type"; exit 0 ;;
esac
path="\${GF_DATABASE_PATH:-}"
[ -n "$path" ] || path="$(ini path)"
[ -n "$path" ] || path=grafana.db
case "$path" in /*) ;; *) path="$data/$path" ;; esac
if [ ! -f "$path" ]; then echo "LENS_GLANCE_NO_DATABASE=$path"; exit 0; fi
size=$(wc -c < "$path" | tr -d ' ')
echo "LENS_GLANCE_DATABASE=$size $path"
if [ "$size" -gt ${maximumDatabaseSize} ]; then echo "LENS_GLANCE_TOO_LARGE"; exit 0; fi
gzip -c "$path" | base64
if [ -s "$path-wal" ]; then
  echo "LENS_GLANCE_WAL"
  gzip -c "$path-wal" | base64
fi
`;

export type DatabaseDump =
  | { readonly kind: "sqlite"; readonly path: string; readonly file: Uint8Array; readonly wal?: Uint8Array }
  | { readonly kind: "other-database"; readonly type: string }
  | { readonly kind: "missing"; readonly path: string }
  | { readonly kind: "too-large"; readonly size: number };

/** What the database script printed: the database, decoded and decompressed, or why there is none. */
export const databaseOfScript = async (output: string): Promise<DatabaseDump> => {
  const lines = output.split("\n");
  const marker = (prefix: string) => lines.find((line) => line.startsWith(prefix))?.slice(prefix.length);

  const type = marker("LENS_GLANCE_DATABASE_TYPE=");

  if (type !== undefined) {
    return { kind: "other-database", type: type.trim() };
  }

  const missing = marker("LENS_GLANCE_NO_DATABASE=");

  if (missing !== undefined) {
    return { kind: "missing", path: missing.trim() };
  }

  const found = marker("LENS_GLANCE_DATABASE=") ?? "";
  const [size, ...path] = found.trim().split(" ");

  if (lines.some((line) => line.trim() === "LENS_GLANCE_TOO_LARGE")) {
    return { kind: "too-large", size: Number(size) };
  }

  const start = lines.findIndex((line) => line.startsWith("LENS_GLANCE_DATABASE=")) + 1;
  const walAt = lines.findIndex((line) => line.trim() === "LENS_GLANCE_WAL");
  const fileText = lines.slice(start, walAt === -1 ? undefined : walAt).join("");
  const walText = walAt === -1 ? "" : lines.slice(walAt + 1).join("");

  if (start === 0 || !fileText) {
    throw new Error(`Grafana's pod printed what was not its database: ${output.slice(0, 200)}`);
  }

  return {
    kind: "sqlite",
    path: path.join(" "),
    file: await gunzip(base64ToBytes(fileText)),
    wal: walText ? await gunzip(base64ToBytes(walText)) : undefined,
  };
};
