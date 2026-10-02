import { parse } from "yaml";

/** What a data source holds. */
export type SourceKind = "metrics" | "logs" | "traces" | "profiles" | "alerts" | "dashboards" | "other";

export const sourceKindTitles: Readonly<Record<SourceKind, string>> = {
  metrics: "Metrics",
  logs: "Logs",
  traces: "Traces",
  profiles: "Profiles",
  alerts: "Alerts",
  dashboards: "Dashboards",
  other: "Other",
};

/** Where something found was seen: a Service, a datasource Grafana is provisioned with, or a Perses datasource. */
export type FoundVia = "service" | "grafana" | "perses";

export interface FoundSource {
  /** What it is, as people know it: "Thanos Query", "Loki". */
  readonly product: string;
  readonly kind: SourceKind;
  /** Whether it answers PromQL the way Prometheus does, which is what Lens can read. */
  readonly promQl: boolean;
  /**
   * How it is reached: through the cluster's API server, which needs Lens connected to the
   * cluster, or by an address of its own, outside the cluster.
   */
  readonly reach: "in-cluster" | "external";
  /** `namespace/service:port` for what is in the cluster, its URL for what is not. */
  readonly address: string;
  readonly via: readonly FoundVia[];
  /** The names Grafana or Perses give it. */
  readonly names: readonly string[];
}

interface Product {
  readonly product: string;
  readonly kind: SourceKind;
  readonly promQl: boolean;
  /** What a Service of it is called, or labelled as. */
  readonly matches: RegExp;
  readonly ports: readonly number[];
}

// Read in order: the first that matches names the Service. The more particular come first, so a
// Thanos Query is not taken for a Prometheus.
const products: readonly Product[] = [
  {
    product: "Thanos Query",
    kind: "metrics",
    promQl: true,
    matches: /thanos.*quer(y|ier)/,
    ports: [9090, 10902, 9091],
  },
  {
    product: "VictoriaMetrics",
    kind: "metrics",
    promQl: true,
    matches: /(^|[-_])vm(single|select|cluster)?([-_]|$)|victoria-?metrics/,
    ports: [8428, 8481],
  },
  {
    product: "Grafana Mimir",
    kind: "metrics",
    promQl: true,
    matches: /mimir.*(query-frontend|nginx|gateway)/,
    ports: [8080, 80],
  },
  {
    product: "Cortex",
    kind: "metrics",
    promQl: true,
    matches: /cortex.*(query-frontend|nginx|gateway)/,
    ports: [8080, 80],
  },
  { product: "Alertmanager", kind: "alerts", promQl: false, matches: /alertmanager/, ports: [9093] },
  {
    product: "Prometheus",
    kind: "metrics",
    promQl: true,
    matches: /^prometheus(-server|-k8s|-operated)?$|-prometheus$|kube-prometheus.*prometheus$/,
    ports: [9090],
  },
  {
    product: "Loki",
    kind: "logs",
    promQl: false,
    matches: /loki(-gateway|-read|-query-frontend|-distributed-query-frontend|-single-binary)?$/,
    ports: [3100, 80],
  },
  { product: "VictoriaLogs", kind: "logs", promQl: false, matches: /victoria-?logs|(^|-)vlogs(-|$)/, ports: [9428] },
  { product: "OpenSearch", kind: "logs", promQl: false, matches: /^opensearch(-cluster)?(-master)?$/, ports: [9200] },
  {
    product: "Elasticsearch",
    kind: "logs",
    promQl: false,
    matches: /^elasticsearch(-master|-es-http)?$|-es-http$/,
    ports: [9200],
  },
  {
    product: "Tempo",
    kind: "traces",
    promQl: false,
    matches: /tempo(-query-frontend|-gateway)?$/,
    ports: [3200, 3100],
  },
  { product: "Jaeger", kind: "traces", promQl: false, matches: /jaeger-query/, ports: [16686] },
  { product: "Pyroscope", kind: "profiles", promQl: false, matches: /pyroscope/, ports: [4040] },
  { product: "Grafana", kind: "dashboards", promQl: false, matches: /^grafana$|-grafana$/, ports: [80, 3000] },
  { product: "Perses", kind: "dashboards", promQl: false, matches: /^perses$|-perses$/, ports: [8080] },
];

// Services that are not the way in: peers finding each other, and the like.
const notTheWayIn =
  /headless|memberlist|discovery|-gossip|operator|exporter|webhook|sidecar|-compactor|-store(-|$)|-ingester|-distributor|-receive/;

interface ServiceLike {
  readonly metadata: {
    readonly name: string;
    readonly namespace: string;
    readonly labels?: Readonly<Record<string, string>>;
  };
  readonly spec?: {
    readonly ports?: ReadonlyArray<{ readonly name?: string; readonly port: number }>;
    readonly clusterIP?: string;
  };
}

export const serviceSource = (service: ServiceLike): FoundSource | undefined => {
  const name = service.metadata.name.toLowerCase();
  const labels = service.metadata.labels ?? {};
  const appName = (labels["app.kubernetes.io/name"] ?? labels.app ?? labels["k8s-app"] ?? "").toLowerCase();
  const component = (labels["app.kubernetes.io/component"] ?? "").toLowerCase();

  if (notTheWayIn.test(name) || service.spec?.clusterIP === "None") {
    return undefined;
  }

  const product = products.find(
    (one) => one.matches.test(name) || one.matches.test(appName) || one.matches.test(`${appName}-${component}`),
  );

  if (!product) {
    return undefined;
  }

  const ports = service.spec?.ports ?? [];
  const port =
    ports.find((one) => product.ports.includes(one.port)) ??
    ports.find((one) => /^(http|web|http-web|http-metrics|query)$/.test(one.name ?? "")) ??
    ports[0];

  return {
    product: product.product,
    kind: product.kind,
    promQl: product.promQl,
    reach: "in-cluster",
    address: `${service.metadata.namespace}/${service.metadata.name}${port ? `:${port.port}` : ""}`,
    via: ["service"],
    names: [],
  };
};

// Grafana's and Perses's names for the kinds of data source, and what they hold.
const typeKinds: ReadonlyArray<readonly [RegExp, Pick<FoundSource, "product" | "kind" | "promQl">]> = [
  [/prometheus/i, { product: "Prometheus", kind: "metrics", promQl: true }],
  [/victoria.*metrics/i, { product: "VictoriaMetrics", kind: "metrics", promQl: true }],
  [/loki/i, { product: "Loki", kind: "logs", promQl: false }],
  [/victoria.*logs/i, { product: "VictoriaLogs", kind: "logs", promQl: false }],
  [/elasticsearch|opensearch/i, { product: "Elasticsearch", kind: "logs", promQl: false }],
  [/tempo/i, { product: "Tempo", kind: "traces", promQl: false }],
  [/jaeger|zipkin/i, { product: "Jaeger", kind: "traces", promQl: false }],
  [/pyroscope|phlare/i, { product: "Pyroscope", kind: "profiles", promQl: false }],
  [/alertmanager/i, { product: "Alertmanager", kind: "alerts", promQl: false }],
  [/clickhouse/i, { product: "ClickHouse", kind: "logs", promQl: false }],
];

// What answers PromQL is often only typed "prometheus"; its name or address tells which it is.
const promQlProducts: ReadonlyArray<readonly [RegExp, string]> = [
  [/thanos/i, "Thanos Query"],
  [/victoria|vmselect|vmsingle/i, "VictoriaMetrics"],
  [/mimir/i, "Grafana Mimir"],
  [/cortex/i, "Cortex"],
];

const describeType = (type: string, hints = "") => {
  const described = typeKinds.find(([pattern]) => pattern.test(type))?.[1] ?? {
    product: type,
    kind: "other" as const,
    promQl: false,
  };
  const particular = described.promQl ? promQlProducts.find(([pattern]) => pattern.test(hints))?.[1] : undefined;

  return particular ? { ...described, product: particular } : described;
};

// A URL inside the cluster names a Service: `name`, `name.namespace`, or `name.namespace.svc…`.
// Anything else is reached by an address of its own.
export const addressOfUrl = (url: string, namespaceOfConfig: string): Pick<FoundSource, "reach" | "address"> => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
    const parts = host.split(".");
    const inCluster =
      /\.svc(\.cluster\.local)?$/.test(host) ||
      parts.length === 1 ||
      (parts.length === 2 &&
        !/^\d+$/.test(parts[1]) &&
        !host.includes(":") &&
        !/\.(com|net|org|io|dev|cloud|local|internal)$/.test(host));

    if (!inCluster) {
      return { reach: "external", address: url };
    }

    const [service, namespace = namespaceOfConfig] = parts;

    return { reach: "in-cluster", address: `${namespace}/${service}:${port}` };
  } catch {
    return { reach: "external", address: url };
  }
};

/** The datasources a Grafana provisioning file names, from a ConfigMap of the cluster. */
export const grafanaSources = (yamlText: string, namespaceOfConfig: string): FoundSource[] => {
  let document: unknown;

  try {
    document = parse(yamlText);
  } catch {
    return [];
  }

  const datasources = (document as { datasources?: unknown })?.datasources;

  if (!Array.isArray(datasources)) {
    return [];
  }

  return datasources.flatMap((datasource: { name?: unknown; type?: unknown; url?: unknown }) => {
    if (typeof datasource?.type !== "string" || typeof datasource.url !== "string") {
      return [];
    }

    return [
      {
        ...describeType(datasource.type, `${datasource.name ?? ""} ${datasource.url}`),
        ...addressOfUrl(datasource.url, namespaceOfConfig),
        via: ["grafana"] as const,
        names: typeof datasource.name === "string" ? [datasource.name] : [],
      },
    ];
  });
};

interface PersesDatasourceLike {
  readonly metadata: { readonly name: string; readonly namespace?: string };
  readonly spec?: {
    readonly config?: { readonly plugin?: PersesPlugin; readonly display?: { readonly name?: string } };
    readonly plugin?: PersesPlugin;
    readonly display?: { readonly name?: string };
  };
}

interface PersesPlugin {
  readonly kind?: string;
  readonly spec?: { readonly directUrl?: string; readonly proxy?: { readonly spec?: { readonly url?: string } } };
}

/** A Perses datasource of the cluster, from the resource the Perses operator keeps it in. */
export const persesSource = (resource: PersesDatasourceLike): FoundSource | undefined => {
  const config = resource.spec?.config ?? resource.spec;
  const plugin = config?.plugin;
  const url = plugin?.spec?.directUrl ?? plugin?.spec?.proxy?.spec?.url;

  if (!plugin?.kind || !url) {
    return undefined;
  }

  return {
    ...describeType(plugin.kind, `${config?.display?.name ?? resource.metadata.name} ${url}`),
    ...addressOfUrl(url, resource.metadata.namespace ?? "default"),
    via: ["perses"],
    names: [config?.display?.name ?? resource.metadata.name],
  };
};

/** What was found more than once, as a Service and as a datasource of Grafana say, made one. */
export const mergeFound = (found: readonly FoundSource[]): FoundSource[] => {
  const byAddress = new Map<string, FoundSource>();

  for (const one of found) {
    const key = one.reach === "in-cluster" ? one.address.replace(/:\d+$/, "") : one.address;
    const known = byAddress.get(key);

    byAddress.set(
      key,
      known
        ? {
            ...known,
            // The Service tells what runs; a datasource only what Grafana calls it.
            product: known.via.includes("service") ? known.product : one.product,
            via: [...new Set([...known.via, ...one.via])],
            names: [...new Set([...known.names, ...one.names])],
          }
        : one,
    );
  }

  return [...byAddress.values()];
};
