import {
  allClusterRecordsReactiveInjectionToken,
  type ClusterRecord,
  connectClusterInjectionToken,
} from "@k8slens/cluster-contracts";
import { getInjectable2 } from "@k8slens/injectable";
import {
  configMapKind,
  coreV1,
  kubeResourceKindIsServedInjectionToken,
  kubeResourcesInjectionToken,
  serviceKind,
} from "@k8slens/kubernetes-contracts";
import {
  prometheusIsConfiguredInjectionToken,
  queryPrometheusRangeInjectionToken,
} from "@k8slens/prometheus-contracts";
import type { Subscribable } from "@k8slens/subscribable";
import { useSyncInject } from "@k8slens/use-inject";
import { observer } from "mobx-react";
import {
  computed,
  type IComputedValue,
  observable,
  onBecomeObserved,
  onBecomeUnobserved,
  reaction,
  runInAction,
} from "mobx";
import { clusterLabels, directProbeInjectable, hubOf } from "../metrics/direct-probe.injectable";
import { fleetSettingsInjectable } from "./fleet-settings.injectable";
import { persesDatasourceKind, persesV1alpha1, persesV1alpha2 } from "./perses-kinds";
import { type FoundSource, grafanaSources, mergeFound, persesSource, serviceSource } from "./source-catalog";

export interface ClusterScan {
  readonly clusterId: string;
  readonly status: "scanning" | "done" | "failed";
  /** Whether Lens has a Prometheus for the cluster: its metrics source, set up or found. */
  readonly hasMetrics?: boolean;
  /** Set when the cluster's metrics source holds many clusters' metrics: a hub, such as Thanos. */
  readonly hub?: { readonly label: string; readonly clusters: readonly string[] };
  /** The data sources found in the cluster: its Services, Grafana's datasources and Perses's. */
  readonly found: readonly FoundSource[];
  /** Where looking for them could not be done, such as for want of the right to list ConfigMaps. */
  readonly unseen: readonly string[];
  readonly error?: string;
}

// Reads a subscribable once: subscribed for as long as its first value takes.
const readOnce = async <T,>(subscribable: Subscribable<T>) => {
  const subscription = subscribable.subscribe();

  subscription.claim();

  try {
    return (await subscription.value).get();
  } finally {
    subscription.dispose();
  }
};

const nowInSeconds = () => Math.floor(Date.now() / 1000);

// Looks in each cluster for its data sources: whether the Prometheus Lens has for it is a hub of
// many clusters, which is offered as a data source, and what else there is, from its Services,
// the datasources Grafana is provisioned with and Perses's. Connected clusters are looked in
// while something shows what is found; the rest when the user asks.
// Looks in the connected clusters for as long as it is shown, which is what draws nothing.
export const LookForHubs = observer(() => {
  useSyncInject(hubDiscoveryInjectable).results.get();

  return null;
});

export const hubDiscoveryInjectable = getInjectable2({
  id: "lens-glance-hub-discovery",
  consumptions: [
    allClusterRecordsReactiveInjectionToken,
    connectClusterInjectionToken,
    prometheusIsConfiguredInjectionToken,
    queryPrometheusRangeInjectionToken,
    kubeResourcesInjectionToken,
    kubeResourceKindIsServedInjectionToken,
  ],

  instantiate: (di) => {
    const allClusterRecords = di.inject(allClusterRecordsReactiveInjectionToken);
    const connectCluster = di.inject(connectClusterInjectionToken);
    const prometheusIsConfigured = di.inject(prometheusIsConfiguredInjectionToken)();
    const queryPrometheusRange = di.inject(queryPrometheusRangeInjectionToken)();
    const kubeResources = di.inject(kubeResourcesInjectionToken)();
    const kubeResourceKindIsServed = di.inject(kubeResourceKindIsServedInjectionToken)();
    const fleetSettings = di.inject(fleetSettingsInjectable)();
    const directProbe = di.inject(directProbeInjectable)();

    const records = observable.box<IComputedValue<ClusterRecord[]> | undefined>(undefined, { deep: false });
    const scans = observable.map<string, ClusterScan>({}, { deep: false });

    void allClusterRecords().then((loaded) => runInAction(() => records.set(loaded)));

    const clusters = computed(() => records.get()?.get() ?? []);

    const findHub = async (clusterId: string) => {
      const now = nowInSeconds();

      return hubOf(
        await queryPrometheusRange(clusterId, `count by (${clusterLabels.join(", ")}) (up)`, {
          start: now,
          end: now,
          step: 60,
        }),
      );
    };

    // Each place looked in answers what it found, or that it could not be looked in.
    const lookIn = async (what: string, find: () => Promise<FoundSource[]>) => {
      try {
        return { found: await find(), unseen: [] };
      } catch {
        return { found: [], unseen: [what] };
      }
    };

    const findInServices = async (clusterId: string) =>
      (await readOnce(kubeResources(serviceKind, coreV1, clusterId))).flatMap((service) => {
        const found = serviceSource(service);

        return found ? [found] : [];
      });

    // Grafana is provisioned with its datasources from ConfigMaps, labelled for its sidecar as
    // kube-prometheus-stack does, or named for them.
    const findInGrafanaConfig = async (clusterId: string) =>
      (await readOnce(kubeResources(configMapKind, coreV1, clusterId)))
        .filter(
          (configMap) =>
            configMap.metadata.labels?.grafana_datasource !== undefined || /datasource/i.test(configMap.metadata.name),
        )
        .flatMap((configMap) =>
          Object.values(configMap.data ?? {})
            .filter((text) => /datasources\s*:/.test(text))
            .flatMap((text) => grafanaSources(text, configMap.metadata.namespace)),
        );

    const findInPerses = async (clusterId: string) => {
      for (const apiVersion of [persesV1alpha2, persesV1alpha1]) {
        if (await readOnce(kubeResourceKindIsServed(persesDatasourceKind, apiVersion, clusterId))) {
          return (await readOnce(kubeResources(persesDatasourceKind, apiVersion, clusterId))).flatMap((resource) => {
            const found = persesSource(resource);

            return found ? [found] : [];
          });
        }
      }

      return [];
    };

    const scan = async (record: ClusterRecord, connectFirst: boolean) => {
      const clusterId = record.id;
      const previous = scans.get(clusterId);

      if (previous?.status === "scanning") {
        return;
      }

      runInAction(() =>
        scans.set(clusterId, {
          clusterId,
          status: "scanning",
          found: previous?.found ?? [],
          unseen: previous?.unseen ?? [],
        }),
      );

      try {
        if (connectFirst && !record.isConnected.get()) {
          await connectCluster(clusterId);
        }

        const [hasMetrics, ...places] = await Promise.all([
          readOnce(prometheusIsConfigured(clusterId)),
          lookIn("Services", () => findInServices(clusterId)),
          lookIn("Grafana's ConfigMaps", () => findInGrafanaConfig(clusterId)),
          lookIn("Perses datasources", () => findInPerses(clusterId)),
        ]);
        const hub = hasMetrics ? await findHub(clusterId).catch(() => undefined) : undefined;
        const found = mergeFound(places.flatMap((place) => place.found));
        const unseen = places.flatMap((place) => place.unseen);

        runInAction(() => scans.set(clusterId, { clusterId, status: "done", hasMetrics, hub, found, unseen }));

        // What answers PromQL at an address of its own needs no cluster connected, if it answers
        // from here: each is asked, and offered as a data source when it does.
        for (const one of found.filter((each) => each.promQl && each.reach === "external")) {
          void directProbe.probe(one.address).then((probed) => {
            if (probed.status === "reachable") {
              fleetSettings.offerDirect({
                name: one.names[0] ?? new URL(one.address).host,
                url: one.address,
                clusterLabel: probed.hub?.label,
                foundIn: clusterId,
              });
            }
          });
        }

        if (hub) {
          fleetSettings.offerHub({ name: record.name.get(), clusterId, clusterLabel: hub.label });
        }
      } catch (error) {
        runInAction(() =>
          scans.set(clusterId, {
            clusterId,
            status: "failed",
            found: [],
            unseen: [],
            error: String((error as Error).message ?? error),
          }),
        );
      }
    };

    const results = computed(() => clusters.get().map((record) => ({ record, scan: scans.get(record.id) })));

    // While something shows what is found, each connected cluster is looked in once, as it connects.
    let stopScanning: (() => void) | undefined;

    onBecomeObserved(results, () => {
      stopScanning = reaction(
        () => clusters.get().filter((record) => record.isConnected.get() && !scans.has(record.id)),
        (unscanned) => unscanned.forEach((record) => void scan(record, false)),
        { fireImmediately: true },
      );
    });

    onBecomeUnobserved(results, () => stopScanning?.());

    return () => ({
      results,
      /** Looks in every cluster again, connecting those that are not, as the user asked for. */
      scanAll: () => Promise.all(clusters.get().map((record) => scan(record, true))),
      rescan: (clusterId: string) => {
        const record = clusters.get().find((one) => one.id === clusterId);

        return record ? scan(record, true) : Promise.resolve();
      },
    });
  },
});
