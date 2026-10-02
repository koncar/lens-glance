import { getInjectable2 } from "@k8slens/injectable";
import { getPersistableValueInjectableBunch } from "@k8slens/persistable-contracts";
import { action, computed, type IObservableValue, observable, runInAction } from "mobx";

/** Where fleet dashboards are kept in the library, and the scope their tabs are opened in. */
export const fleetFolder = "fleet";
export const fleetScope = "fleet";

/**
 * A metrics source holding many clusters' metrics, such as Thanos Query, reached as the metrics
 * of the Lens cluster it is set up for. The cluster each series comes from is in `clusterLabel`.
 */
export interface HubSource {
  readonly kind: "hub";
  readonly id: string;
  readonly name: string;
  readonly clusterId: string;
  readonly clusterLabel: string;
}

/**
 * A Prometheus API at an address of its own, outside any cluster, asked from the user's machine:
 * nothing needs Lens connected to a cluster for it. With a `clusterLabel` it holds many clusters'
 * metrics, as a hub does; without one, the metrics of the cluster it was found in.
 */
export interface DirectSource {
  readonly kind: "direct";
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly clusterLabel?: string;
  /** The cluster whose Grafana or Perses named it, which is the cluster it is of when it holds one. */
  readonly foundIn?: string;
}

/** No hub: each query is asked of the Prometheus of every chosen cluster, and the answers put together. */
export interface ClustersSource {
  readonly kind: "clusters";
  readonly id: typeof clustersSourceId;
  readonly name: string;
}

export type DataSource = HubSource | DirectSource | ClustersSource;

export const clustersSourceId = "clusters";

const clustersSource: ClustersSource = { kind: "clusters", id: clustersSourceId, name: "Each cluster's Prometheus" };

interface FleetSettings {
  readonly hubs: readonly HubSource[];
  /** Clusters found to be hubs that the user took out, so finding them again does not put them back. */
  readonly dismissed: readonly string[];
  readonly directs?: readonly DirectSource[];
  /** Addresses taken out by the user, likewise. */
  readonly dismissedUrls?: readonly string[];
}

export const fleetSettingsBunch = getPersistableValueInjectableBunch<FleetSettings>()({
  id: "fleet-settings",
  defaultValue: { instantiate: () => async () => ({ hubs: [], dismissed: [] }) },
});

export const hubIdOf = (clusterId: string) => `hub:${clusterId}`;
export const directIdOf = (url: string) => `direct:${url.replace(/\/+$/, "")}`;

// The data sources dashboards are drawn from: the hubs, reached as some cluster's metrics; the
// addresses of their own that answer from the user's machine; and every cluster's own Prometheus,
// which is always there to fall back on.
export const fleetSettingsInjectable = getInjectable2({
  id: "lens-glance-fleet-settings",

  instantiate: (di) => {
    const getSettings = di.inject(fleetSettingsBunch.persistable);
    const persisted = observable.box<IObservableValue<FleetSettings> | undefined>(undefined, { deep: false });

    void getSettings().then((settings) => runInAction(() => persisted.set(settings)));

    const settings = computed(() => persisted.get()?.get() ?? { hubs: [], dismissed: [] });
    const update = action((change: (current: FleetSettings) => FleetSettings) => {
      persisted.get()?.set(change(settings.get()));
    });

    return () => ({
      loaded: computed(() => persisted.get() !== undefined),
      hubs: computed(() => settings.get().hubs),
      directs: computed(() => settings.get().directs ?? []),
      sources: computed((): DataSource[] => [
        ...settings.get().hubs,
        ...(settings.get().directs ?? []),
        clustersSource,
      ]),
      isDismissed: (clusterId: string) => settings.get().dismissed.includes(clusterId),

      /** A hub found by scanning, unless the user took it out before. */
      offerHub: (hub: Omit<HubSource, "kind" | "id">) => {
        const id = hubIdOf(hub.clusterId);
        const current = settings.get();

        if (
          !persisted.get() ||
          current.dismissed.includes(hub.clusterId) ||
          current.hubs.some((one) => one.id === id)
        ) {
          return;
        }

        update((now) => ({ ...now, hubs: [...now.hubs, { ...hub, kind: "hub", id }] }));
      },

      /** A hub the user adds by hand, which also takes back having taken it out. */
      addHub: (hub: Omit<HubSource, "kind" | "id">) =>
        update((now) => ({
          hubs: [
            ...now.hubs.filter((one) => one.clusterId !== hub.clusterId),
            { ...hub, kind: "hub", id: hubIdOf(hub.clusterId) },
          ],
          dismissed: now.dismissed.filter((one) => one !== hub.clusterId),
        })),

      removeHub: (id: string) =>
        update((now) => {
          const hub = now.hubs.find((one) => one.id === id);

          return {
            hubs: now.hubs.filter((one) => one.id !== id),
            dismissed: hub ? [...new Set([...now.dismissed, hub.clusterId])] : now.dismissed,
          };
        }),

      setClusterLabel: (id: string, clusterLabel: string) =>
        update((now) => ({
          ...now,
          hubs: now.hubs.map((one) => (one.id === id ? { ...one, clusterLabel } : one)),
          directs: (now.directs ?? []).map((one) =>
            one.id === id ? { ...one, clusterLabel: clusterLabel || undefined } : one,
          ),
        })),

      /** An address found to answer, unless the user took it out before. */
      offerDirect: (direct: Omit<DirectSource, "kind" | "id">) => {
        const id = directIdOf(direct.url);
        const current = settings.get();

        if (!persisted.get() || current.dismissedUrls?.includes(id) || current.directs?.some((one) => one.id === id)) {
          return;
        }

        update((now) => ({ ...now, directs: [...(now.directs ?? []), { ...direct, kind: "direct", id }] }));
      },

      addDirect: (direct: Omit<DirectSource, "kind" | "id">) => {
        const id = directIdOf(direct.url);

        update((now) => ({
          ...now,
          directs: [...(now.directs ?? []).filter((one) => one.id !== id), { ...direct, kind: "direct", id }],
          dismissedUrls: (now.dismissedUrls ?? []).filter((one) => one !== id),
        }));
      },

      removeDirect: (id: string) =>
        update((now) => ({
          ...now,
          directs: (now.directs ?? []).filter((one) => one.id !== id),
          dismissedUrls: [...new Set([...(now.dismissedUrls ?? []), id])],
        })),
    });
  },
});
