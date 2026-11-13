import { getInjectable2 } from "@k8slens/injectable";
import { getPersistableValueInjectableBunch } from "@k8slens/persistable-contracts";
import { action, computed, type IObservableValue, observable, runInAction } from "mobx";
import type { GrafanaSourceKind } from "./grafana-found";

/** Which ways of looking for Grafana's dashboards the user allows. */
export type GrafanaSourceSettings = Readonly<Record<GrafanaSourceKind, boolean>>;

// Reading ConfigMaps and grafana-operator's resources is reading what anyone browsing the cluster
// in Lens sees. Reading Secrets, and running anything inside Grafana's pod, is not, so each waits
// for the user to turn it on.
export const defaultGrafanaSourceSettings: GrafanaSourceSettings = {
  configMaps: true,
  operator: true,
  secrets: false,
  api: false,
  database: false,
};

export const grafanaSourceSettingsBunch = getPersistableValueInjectableBunch<Partial<GrafanaSourceSettings>>()({
  id: "grafana-source-settings",
  defaultValue: { instantiate: () => async () => ({}) },
});

export const grafanaSourceSettingsInjectable = getInjectable2({
  id: "lens-glance-grafana-source-settings",

  instantiate: (di) => {
    const getSettings = di.inject(grafanaSourceSettingsBunch.persistable);
    const persisted = observable.box<IObservableValue<Partial<GrafanaSourceSettings>> | undefined>(undefined, {
      deep: false,
    });

    void getSettings().then((settings) => runInAction(() => persisted.set(settings)));

    const settings = computed((): GrafanaSourceSettings => ({
      ...defaultGrafanaSourceSettings,
      ...persisted.get()?.get(),
    }));

    return () => ({
      loaded: computed(() => persisted.get() !== undefined),
      settings,
      isOn: (source: GrafanaSourceKind) => settings.get()[source],
      toggle: action((source: GrafanaSourceKind) => {
        persisted.get()?.set({ ...persisted.get()?.get(), [source]: !settings.get()[source] });
      }),
    });
  },
});
