import type { PrometheusSeries } from "@k8slens/prometheus-contracts";
import type { PrometheusClient } from "@perses-dev/prometheus-plugin";
import { PrometheusDatasource } from "@perses-dev/prometheus-plugin";
import type { MetricsRoute } from "../metrics/metrics-route";

// Perses's Prometheus plugin talks to Prometheus over HTTP. Inside Lens, a dashboard's metrics
// come by its route, as range queries through the API server proxy, so this client answers every
// call Perses makes with those and leaves the rest of the plugin as is.

const toMatrix = (series: readonly PrometheusSeries[]) =>
  series.map((one) => ({
    metric: { ...one.metric },
    values: one.values.map(([timestamp, value]) => [timestamp, value] as [number, string]),
  }));

const nowInSeconds = () => Math.floor(Date.now() / 1000);

// A range of zero length evaluates the expression once, at that moment: an instant query.
const instantRange = (time = nowInSeconds()) => ({ start: time, end: time, step: 60 });

const notSupported = (what: string) => () => Promise.reject(new Error(`${what} is not available inside Lens`));

export const createLensPrometheusClient = (route: MetricsRoute): PrometheusClient => {
  const valuesOfLabel = async (labelName: string, matchers: readonly string[] | undefined, time?: number) => {
    const selector = matchers?.length ? matchers.join(" or ") : `{${labelName}!=""}`;
    const series = await route.query(`group by (${labelName}) (${selector})`, instantRange(time));

    return [...new Set(series.map((one) => one.metric[labelName]).filter((value): value is string => !!value))].sort();
  };

  return {
    options: { datasourceUrl: "lens://metrics" },
    healthCheck: () => Promise.resolve(true),

    rangeQuery: async ({ query, start, end, step }, options) => ({
      status: "success",
      data: {
        resultType: "matrix",
        result: toMatrix(await route.query(query, { start, end, step }, options?.signal)),
      },
    }),

    instantQuery: async ({ query, time }, options) => ({
      status: "success",
      data: {
        resultType: "vector",
        result: (await route.query(query, instantRange(time), options?.signal)).flatMap((one) => {
          const value = one.values.at(-1);

          return value ? [{ metric: { ...one.metric }, value: [value[0], value[1]] as [number, string] }] : [];
        }),
      },
    }),

    labelValues: async ({ labelName, "match[]": matchers, end }) => ({
      status: "success",
      data: await valuesOfLabel(labelName, matchers, end),
    }),

    labelNames: async () => ({ status: "success", data: [] }),
    metricMetadata: async () => ({ status: "success", data: {} }),
    series: notSupported("Looking up series"),
    parseQuery: notSupported("Parsing a query"),
  };
};

export const getLensPrometheusDatasource = (route: MetricsRoute) => ({
  ...PrometheusDatasource,
  createClient: () => createLensPrometheusClient(route),
});
