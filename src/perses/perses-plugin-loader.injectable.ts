import { getInjectable2 } from "@k8slens/injectable";
import * as barChartPlugin from "@perses-dev/bar-chart-plugin";
import * as gaugeChartPlugin from "@perses-dev/gauge-chart-plugin";
import * as markdownPlugin from "@perses-dev/markdown-plugin";
import { getPluginModuleCompoundKey, type PluginLoader, type PluginModuleResource } from "@perses-dev/plugin-system";
import * as prometheusPlugin from "@perses-dev/prometheus-plugin";
import * as statChartPlugin from "@perses-dev/stat-chart-plugin";
import * as tablePlugin from "@perses-dev/table-plugin";
import * as timeSeriesChartPlugin from "@perses-dev/timeseries-chart-plugin";
import { metricsRouteInjectable } from "../metrics/metrics-route.injectable";
import { getLensPrometheusDatasource } from "./lens-prometheus-datasource";

interface BundledPlugin {
  readonly resource: PluginModuleResource;
  readonly exports: Readonly<Record<string, unknown>>;
}

const keyOf = (resource: PluginModuleResource) =>
  getPluginModuleCompoundKey({
    kind: resource.kind,
    name: resource.metadata.name,
    registry: resource.metadata.registry,
    version: resource.metadata.version,
  });

// Perses 0.54's registry looks a plugin up in the module it loaded by the plugin's compound key
// (kind:name:registry:version), as its remote loader keys them. The plugin packages export each
// plugin by its name, and Perses's dynamicImportPluginLoader passes those on unchanged, so every
// lookup misses. This loader keys them the way the registry asks for.
const bundledPluginLoader = (plugins: readonly BundledPlugin[]): PluginLoader => {
  const byKey = new Map(plugins.map((plugin) => [keyOf(plugin.resource), plugin]));

  return {
    getInstalledPlugins: () => Promise.resolve(plugins.map((plugin) => plugin.resource)),

    importPluginModule: (resource) => {
      const plugin = byKey.get(keyOf(resource));

      if (!plugin) {
        return Promise.reject(new Error(`The plugin module ${resource.metadata.name} is not bundled with Lens`));
      }

      const { registry, version } = resource.metadata;

      return Promise.resolve(
        Object.fromEntries(
          resource.spec.plugins.map(({ kind, spec: { name } }) => [
            getPluginModuleCompoundKey({ kind, name, registry, version }),
            plugin.exports[name],
          ]),
        ),
      );
    },
  };
};

const panelPlugins = [
  timeSeriesChartPlugin,
  statChartPlugin,
  gaugeChartPlugin,
  barChartPlugin,
  tablePlugin,
  markdownPlugin,
];

// The Perses plugins a dashboard is rendered with: the panels as Perses ships them, and its
// Prometheus plugin with the datasource answering by the dashboard's route.
export const persesPluginLoaderInjectable = getInjectable2({
  id: "lens-glance-perses-plugin-loader",

  instantiate: (di) => {
    const routeOf = di.inject(metricsRouteInjectable);

    return (clusterId: string, fileName: string) =>
      bundledPluginLoader([
        {
          resource: prometheusPlugin.getPluginModule(),
          exports: {
            ...prometheusPlugin,
            PrometheusDatasource: getLensPrometheusDatasource(routeOf(clusterId, fileName)),
          },
        },
        ...panelPlugins.map((plugin) => ({ resource: plugin.getPluginModule(), exports: plugin })),
      ]);
  },
});
