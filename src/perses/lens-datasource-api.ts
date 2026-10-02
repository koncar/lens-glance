import type { DatasourceApi, GlobalDatasourceResource } from "@perses-dev/core";

// Every dashboard has the one datasource: the Prometheus of the cluster it is shown for. Any
// Prometheus datasource a dashboard names resolves to it, so dashboards written for a Perses
// server, which name theirs, render here unchanged.
export const lensPrometheusDatasource: GlobalDatasourceResource = {
  kind: "GlobalDatasource",
  metadata: { name: "lens-prometheus" },
  spec: {
    default: true,
    display: { name: "Cluster Prometheus (through Lens)" },
    plugin: { kind: "PrometheusDatasource", spec: { directUrl: "lens://prometheus" } },
  },
};

const isPrometheus = (pluginKind?: string) => pluginKind === undefined || pluginKind === "PrometheusDatasource";

export const lensDatasourceApi: DatasourceApi = {
  buildProxyUrl: () => "lens://prometheus",
  getDatasource: () => Promise.resolve(undefined),
  getGlobalDatasource: (selector) =>
    Promise.resolve(isPrometheus(selector.kind) ? lensPrometheusDatasource : undefined),
  listDatasources: () => Promise.resolve([]),
  listGlobalDatasources: (pluginKind) => Promise.resolve(isPrometheus(pluginKind) ? [lensPrometheusDatasource] : []),
};
