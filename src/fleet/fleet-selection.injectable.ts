import { allClusterRecordsReactiveInjectionToken, type ClusterRecord } from "@k8slens/cluster-contracts";
import { getInjectable2 } from "@k8slens/injectable";
import { getPersistableMapInjectableBunch } from "@k8slens/persistable-contracts";
import { queryPrometheusRangeInjectionToken } from "@k8slens/prometheus-contracts";
import {
  action,
  computed,
  type IComputedValue,
  observable,
  type ObservableMap,
  onBecomeObserved,
  onBecomeUnobserved,
  reaction,
  runInAction,
} from "mobx";
import { directProbeInjectable } from "../metrics/direct-probe.injectable";
import { type DataSource, fleetSettingsInjectable } from "./fleet-settings.injectable";

interface StoredSelection {
  readonly sourceId?: string;
  /** The clusters chosen by name, or `"all"`: every cluster the source has, or every connected one. */
  readonly clusters?: readonly string[] | "all";
}

/** What each fleet dashboard is drawn from and for which clusters, kept across restarts. */
export const fleetSelectionsBunch = getPersistableMapInjectableBunch<string, StoredSelection>()({
  id: "fleet-selections",
});

export interface ClusterOption {
  readonly name: string;
  /** The Lens cluster to ask, where the source asks each cluster's own Prometheus. */
  readonly clusterId?: string;
  readonly connected?: boolean;
}

export interface ClusterTarget {
  readonly clusterId: string;
  readonly name: string;
  readonly connected: boolean;
}

const nowInSeconds = () => Math.floor(Date.now() / 1000);

// For one fleet dashboard: the data source it is drawn from, the clusters there are in it, and
// which of them the user chose. A hub knows its clusters by the values of its cluster label; the
// clusters of Lens are the clusters when every cluster's own Prometheus is asked.
export const fleetSelectionInjectable = getInjectable2({
  id: "lens-glance-fleet-selection",
  consumptions: [allClusterRecordsReactiveInjectionToken, queryPrometheusRangeInjectionToken],

  instantiate: (di) => {
    const fleetSettings = di.inject(fleetSettingsInjectable)();
    const getSelections = di.inject(fleetSelectionsBunch.persistable);
    const allClusterRecords = di.inject(allClusterRecordsReactiveInjectionToken);
    const queryPrometheusRange = di.inject(queryPrometheusRangeInjectionToken)();
    const directProbe = di.inject(directProbeInjectable)();

    const records = observable.box<IComputedValue<ClusterRecord[]> | undefined>(undefined, { deep: false });
    const selections = observable.box<ObservableMap<string, StoredSelection> | undefined>(undefined, { deep: false });

    void allClusterRecords().then((loaded) => runInAction(() => records.set(loaded)));
    void getSelections().then((loaded) => runInAction(() => selections.set(loaded)));

    const lensClusters = computed((): ClusterTarget[] =>
      (records.get()?.get() ?? [])
        .map((record) => ({ clusterId: record.id, name: record.name.get(), connected: record.isConnected.get() }))
        .sort((one, other) => Number(other.connected) - Number(one.connected) || one.name.localeCompare(other.name)),
    );

    const nameOfCluster = (clusterId: string | undefined) =>
      clusterId === undefined ? undefined : lensClusters.get().find((cluster) => cluster.clusterId === clusterId)?.name;

    return (fileName: string) => {
      const stored = computed(() => selections.get()?.get(fileName) ?? {});
      const store = action((change: Partial<StoredSelection>) =>
        selections.get()?.set(fileName, { ...stored.get(), ...change }),
      );

      const source = computed((): DataSource => {
        const sources = fleetSettings.sources.get();

        return sources.find((one) => one.id === stored.get().sourceId) ?? sources[0];
      });

      const hubClusters = observable.box<{ sourceId: string; names: string[]; error?: string } | undefined>(undefined, {
        deep: false,
      });

      const loadHubClusters = async () => {
        const current = source.get();

        if (current.kind !== "hub") {
          return;
        }

        try {
          const now = nowInSeconds();
          const series = await queryPrometheusRange(current.clusterId, `group by (${current.clusterLabel}) (up)`, {
            start: now,
            end: now,
            step: 60,
          });
          const names = [...new Set(series.map((one) => one.metric[current.clusterLabel]).filter(Boolean))].sort();

          runInAction(() => hubClusters.set({ sourceId: current.id, names }));
        } catch (error) {
          runInAction(() =>
            hubClusters.set({ sourceId: current.id, names: [], error: String((error as Error).message) }),
          );
        }
      };

      const options = computed((): ClusterOption[] => {
        const current = source.get();

        if (current.kind === "clusters") {
          return lensClusters.get().map(({ clusterId, name, connected }) => ({ name, clusterId, connected }));
        }

        if (current.kind === "direct") {
          if (!current.clusterLabel) {
            return [{ name: nameOfCluster(current.foundIn) ?? current.name }];
          }

          const probed = directProbe.probeOf(current.url).get();

          return probed.status === "reachable" ? (probed.hub?.clusters ?? []).map((name) => ({ name })) : [];
        }

        const loaded = hubClusters.get();

        return loaded?.sourceId === current.id ? loaded.names.map((name) => ({ name })) : [];
      });

      let stopLoading: (() => void) | undefined;

      onBecomeObserved(options, () => {
        stopLoading = reaction(
          () => source.get().id,
          () => void loadHubClusters(),
          { fireImmediately: true },
        );
      });

      onBecomeUnobserved(options, () => stopLoading?.());

      const chosen = computed(() => stored.get().clusters ?? "all");

      return {
        sources: fleetSettings.sources,
        source,
        options,
        optionsError: computed(() => {
          const current = source.get();
          const probed = current.kind === "direct" ? directProbe.probeOf(current.url).get() : undefined;

          return probed?.status === "unreachable" ? probed.error : hubClusters.get()?.error;
        }),
        nameOfCluster,
        chosen,

        /** The Lens clusters to ask, when the source asks each cluster's own Prometheus. */
        targets: computed((): ClusterTarget[] => {
          const picked = chosen.get();

          return picked === "all"
            ? lensClusters.get().filter((cluster) => cluster.connected)
            : lensClusters.get().filter((cluster) => picked.includes(cluster.name));
        }),

        /** Changes whenever the dashboard is to be drawn from somewhere else. */
        revision: computed(() => JSON.stringify({ source: source.get().id, chosen: chosen.get() })),

        pickSource: (sourceId: string) => store({ sourceId, clusters: "all" }),
        chooseAll: () => store({ clusters: chosen.get() === "all" ? [] : "all" }),
        chooseOnly: (name: string) => store({ clusters: [name] }),
        toggle: (name: string) => {
          const every = options.get().map((option) => option.name);
          const current = chosen.get();
          const picked = current === "all" ? every : current;
          const next = picked.includes(name) ? picked.filter((one) => one !== name) : [...picked, name];

          store({ clusters: every.length > 0 && next.length === every.length ? "all" : next });
        },
      };
    };
  },
});

export type FleetSelection = ReturnType<ReturnType<(typeof fleetSelectionInjectable)["instantiate"]>>;
