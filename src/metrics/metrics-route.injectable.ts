import { connectClusterInjectionToken } from "@k8slens/cluster-contracts";
import { getInjectable2 } from "@k8slens/injectable";
import { queryPrometheusRangeInjectionToken } from "@k8slens/prometheus-contracts";
import { computed } from "mobx";
import { clusterSourceSelectionInjectable } from "../fleet/cluster-source-selection.injectable";
import { fleetSelectionInjectable } from "../fleet/fleet-selection.injectable";
import { fleetScope } from "../fleet/fleet-settings.injectable";
import { directPrometheusInjectable } from "./direct-prometheus.injectable";
import { fillInClusterBuiltins, type MetricsRoute, withClusterLabel } from "./metrics-route";

// Where the queries of one dashboard go. A cluster's dashboard asks that cluster's Prometheus,
// as Lens is set up to reach it, or a hub that holds the cluster too, filtered to it. A fleet dashboard asks the data source picked for it: a hub,
// with the chosen clusters filtered by its cluster label, or every chosen cluster's own
// Prometheus, connected first where it is not, with what each answers put together.
export const metricsRouteInjectable = getInjectable2({
  id: "lens-glance-metrics-route",
  consumptions: [queryPrometheusRangeInjectionToken, connectClusterInjectionToken],

  instantiate: (di) => {
    const queryPrometheusRange = di.inject(queryPrometheusRangeInjectionToken)();
    const connectCluster = di.inject(connectClusterInjectionToken);
    const selectionOf = di.inject(fleetSelectionInjectable);
    const clusterSelectionOf = di.inject(clusterSourceSelectionInjectable);
    const direct = di.inject(directPrometheusInjectable)();

    return (clusterId: string, fileName: string): MetricsRoute => {
      if (clusterId !== fleetScope) {
        const own = clusterSelectionOf(clusterId, fileName);

        return {
          revision: own.revision,
          query: async (query, range, signal) => {
            const source = own.source.get();

            // Drawn from an address of its own: asked from this machine, no cluster connected.
            if (source.kind === "direct") {
              const label = source.direct.clusterLabel;
              const filled = fillInClusterBuiltins(
                query,
                label && source.value ? { label, clusters: [source.value] } : undefined,
              );
              const series = await direct.queryRange(source.direct.url, filled, range);

              return withClusterLabel(series, (one) => (label ? one.metric[label] : undefined));
            }

            // Drawn from a hub that holds this cluster too: the hub, filtered to it.
            if (source.kind === "hub") {
              const filled = fillInClusterBuiltins(query, { label: source.hub.clusterLabel, clusters: [source.value] });
              const series = await queryPrometheusRange(source.hub.clusterId, filled, range, signal);

              return withClusterLabel(series, (one) => one.metric[source.hub.clusterLabel]);
            }

            return queryPrometheusRange(clusterId, fillInClusterBuiltins(query, undefined), range, signal);
          },
        };
      }

      const selection = selectionOf(fileName);

      return {
        revision: selection.revision,

        query: async (query, range, signal) => {
          const source = selection.source.get();

          if (source.kind === "hub") {
            const filled = fillInClusterBuiltins(query, {
              label: source.clusterLabel,
              clusters: selection.chosen.get(),
            });
            const series = await queryPrometheusRange(source.clusterId, filled, range, signal);

            return withClusterLabel(series, (one) => one.metric[source.clusterLabel]);
          }

          if (source.kind === "direct") {
            const label = source.clusterLabel;
            const filled = fillInClusterBuiltins(
              query,
              label ? { label, clusters: selection.chosen.get() } : undefined,
            );
            const series = await direct.queryRange(source.url, filled, range);
            const only = selection.nameOfCluster(source.foundIn) ?? source.name;

            return withClusterLabel(series, (one) => (label ? one.metric[label] : only));
          }

          const filled = fillInClusterBuiltins(query, undefined);
          const answers = await Promise.allSettled(
            selection.targets.get().map(async (target) => {
              if (!target.connected) {
                await connectCluster(target.clusterId);
              }

              return withClusterLabel(
                await queryPrometheusRange(target.clusterId, filled, range, signal),
                () => target.name,
              );
            }),
          );
          const answered = answers.flatMap((answer) => (answer.status === "fulfilled" ? answer.value : []));
          const failed = answers.find((answer): answer is PromiseRejectedResult => answer.status === "rejected");

          // One cluster that cannot answer leaves the others' series standing; only when none
          // answers is there nothing to show.
          if (failed && answers.every((answer) => answer.status === "rejected")) {
            throw failed.reason;
          }

          return answered;
        },
      };
    };
  },
});
