import { allClusterRecordsReactiveInjectionToken, type ClusterRecord } from "@k8slens/cluster-contracts";
import { getInjectable2 } from "@k8slens/injectable";
import { getPersistableMapInjectableBunch } from "@k8slens/persistable-contracts";
import { action, computed, type IComputedValue, observable, type ObservableMap, runInAction } from "mobx";
import { directProbeInjectable } from "../metrics/direct-probe.injectable";
import { type DirectSource, fleetSettingsInjectable, type HubSource } from "./fleet-settings.injectable";
import { hubDiscoveryInjectable } from "./hub-discovery.injectable";

/** Which data source each dashboard of a cluster is drawn from, kept across restarts. */
export const clusterSourceSelectionsBunch = getPersistableMapInjectableBunch<string, string>()({
  id: "cluster-source-selections",
});

export const ownSourceId = "own";

export type ClusterSourceOption =
  | { readonly kind: "own"; readonly id: typeof ownSourceId; readonly name: string }
  | {
      readonly kind: "hub";
      readonly id: string;
      readonly name: string;
      readonly hub: HubSource;
      readonly value: string;
    }
  | {
      readonly kind: "direct";
      readonly id: string;
      readonly name: string;
      readonly direct: DirectSource;
      /** The cluster's value of the source's cluster label, where it holds many clusters. */
      readonly value?: string;
    };

// For one dashboard of a cluster: the cluster's own Prometheus, as Lens reads it, or a hub that
// holds the cluster's metrics too, filtered to it. A hub holds a cluster when one of the values of
// its cluster label is the cluster's name in Lens.
export const clusterSourceSelectionInjectable = getInjectable2({
  id: "lens-glance-cluster-source-selection",
  consumptions: [allClusterRecordsReactiveInjectionToken],

  instantiate: (di) => {
    const fleetSettings = di.inject(fleetSettingsInjectable)();
    const discovery = di.inject(hubDiscoveryInjectable)();
    const directProbe = di.inject(directProbeInjectable)();
    const getSelections = di.inject(clusterSourceSelectionsBunch.persistable);
    const allClusterRecords = di.inject(allClusterRecordsReactiveInjectionToken);

    const records = observable.box<IComputedValue<ClusterRecord[]> | undefined>(undefined, { deep: false });
    const selections = observable.box<ObservableMap<string, string> | undefined>(undefined, { deep: false });

    void allClusterRecords().then((loaded) => runInAction(() => records.set(loaded)));
    void getSelections().then((loaded) => runInAction(() => selections.set(loaded)));

    return (clusterId: string, fileName: string) => {
      const key = `${clusterId}/${fileName}`;
      const clusterName = computed(
        () =>
          records
            .get()
            ?.get()
            .find((record) => record.id === clusterId)
            ?.name.get() ?? clusterId,
      );

      const options = computed((): ClusterSourceOption[] => {
        const name = clusterName.get().toLowerCase();
        const scans = new Map(discovery.results.get().map(({ record, scan }) => [record.id, scan]));
        const hubs = fleetSettings.hubs.get().flatMap((hub): ClusterSourceOption[] => {
          const value = scans.get(hub.clusterId)?.hub?.clusters.find((one) => one.toLowerCase() === name);

          return value ? [{ kind: "hub", id: hub.id, name: `${hub.name}, as ${value}`, hub, value }] : [];
        });

        // Addresses of their own, asked from this machine: they need no cluster connected.
        const directs = fleetSettings.directs.get().flatMap((direct): ClusterSourceOption[] => {
          if (direct.clusterLabel) {
            const probed = directProbe.probeOf(direct.url).get();
            const value =
              probed.status === "reachable"
                ? probed.hub?.clusters.find((one) => one.toLowerCase() === name)
                : undefined;

            return value
              ? [{ kind: "direct", id: direct.id, name: `${direct.name}, as ${value} · direct`, direct, value }]
              : [];
          }

          return direct.foundIn === clusterId
            ? [{ kind: "direct", id: direct.id, name: `${direct.name} · direct`, direct }]
            : [];
        });

        return [
          ...directs,
          { kind: "own", id: ownSourceId, name: `${clusterName.get()}'s Prometheus · needs the cluster connected` },
          ...hubs,
        ];
      });

      const source = computed(() => {
        const picked = selections.get()?.get(key);

        return options.get().find((option) => option.id === picked) ?? options.get()[0];
      });

      return {
        options,
        source,
        revision: computed(() => source.get().id),
        pick: action((id: string) => selections.get()?.set(key, id)),
      };
    };
  },
});
