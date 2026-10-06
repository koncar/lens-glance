import { getInjectable2 } from "@k8slens/injectable";
import type { PrometheusRange, PrometheusSeries } from "@k8slens/prometheus-contracts";
import { hostFilesInjectable } from "../platform/host-files.injectable";

interface PrometheusAnswer {
  readonly status?: "success" | "error";
  readonly error?: string;
  readonly data?: {
    readonly resultType?: string;
    readonly result?: ReadonlyArray<{
      readonly metric: Readonly<Record<string, string>>;
      readonly values?: ReadonlyArray<readonly [number, string]>;
      readonly value?: readonly [number, string];
    }>;
  };
}

const statusMarker = "__LENS_GLANCE_HTTP_STATUS__";

/** Why an address does not answer, in words a person reads. */
export const describeHttpStatus = (status: number) =>
  status === 401 || status === 403
    ? `it answers ${status}: it needs credentials`
    : status === 404
      ? "it answers 404: it is not the address of a Prometheus API"
      : `it answers ${status}`;

// Asks a Prometheus API at an address of its own, outside any cluster, so that nothing needs Lens
// connected to a cluster. The extension surface has no network of its own, and a request from the
// window would be refused by most servers for coming from another origin, so it is asked by curl
// on the user's machine, which also goes through their VPN and proxy as they do. Windows has
// curl too, since Windows 10.
export const directPrometheusInjectable = getInjectable2({
  id: "lens-glance-direct-prometheus",

  instantiate: (di) => {
    const files = di.inject(hostFilesInjectable)();

    const ask = async (url: string, path: string, parameters: Readonly<Record<string, string | number>>) => {
      const endpoint = `${url.replace(/\/+$/, "")}${path}`;
      const data = Object.entries(parameters).flatMap(([name, value]) => ["--data-urlencode", `${name}=${value}`]);
      // curl reads the \n of its -w itself, so no line break goes into the command.
      const curl = await files.run("curl", [
        "-sS",
        "--max-time",
        "30",
        "-G",
        endpoint,
        ...data,
        "-w",
        `\\n${statusMarker}%{http_code}`,
      ]);

      if (curl.code !== 0) {
        throw new Error(curl.output || `curl could not ask ${endpoint}`);
      }

      const output = curl.output;
      const at = output.lastIndexOf(statusMarker);
      const status = Number(output.slice(at + statusMarker.length).trim());
      const body = output.slice(0, at).trim();
      let answer: PrometheusAnswer | undefined;

      try {
        answer = JSON.parse(body) as PrometheusAnswer;
      } catch {
        answer = undefined;
      }

      if (answer?.status === "error") {
        throw new Error(answer.error ?? `The query was refused (${status})`);
      }

      if (status < 200 || status >= 300 || !answer) {
        throw new Error(`${endpoint} does not answer as Prometheus does: ${describeHttpStatus(status)}`);
      }

      return answer;
    };

    const seriesOf = (answer: PrometheusAnswer): PrometheusSeries[] =>
      (answer.data?.result ?? []).map((one) => ({
        metric: one.metric,
        values: one.values ?? (one.value ? [one.value] : []),
      }));

    return () => ({
      queryRange: async (url: string, query: string, range: PrometheusRange) =>
        seriesOf(await ask(url, "/api/v1/query_range", { query, ...range })),

      queryInstant: async (url: string, query: string) =>
        seriesOf(await ask(url, "/api/v1/query", { query, time: Math.floor(Date.now() / 1000) })),
    });
  },
});
