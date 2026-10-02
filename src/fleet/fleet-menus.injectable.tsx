import {
  getDropDownMenuItemInjectableBunch,
  getDropDownMenuKind,
  useCloseDropDownMenu,
} from "@k8slens/drop-down-menu-contracts";
import { DropDownMenuItemRow, DropDownMenuSeparator } from "@k8slens/drop-down-menu-items";
import { SettingsIcon } from "@k8slens/icon";
import { getInjectable2 } from "@k8slens/injectable";
import { SingleSelect } from "@k8slens/input-components";
import { navigateToPreferencesInjectionToken } from "@k8slens/preferences-contracts";
import { useSyncInject } from "@k8slens/use-inject";
import { observer } from "mobx-react";
import packageJson from "../../package.json";
import { dashboardViewModelInjectable } from "../dashboard-view/dashboard-view-model.injectable";
import { MultiValueList } from "../dashboard-view/variable-picker";
import { clusterSourceSelectionInjectable } from "./cluster-source-selection.injectable";
import { fleetSelectionInjectable } from "./fleet-selection.injectable";
import { type DataSource, fleetScope } from "./fleet-settings.injectable";

export interface FleetMenuData {
  readonly fileName: string;
}

export const dataSourceMenuKind = getDropDownMenuKind<FleetMenuData>()("lens-glance-data-source-menu");
export const clustersMenuKind = getDropDownMenuKind<FleetMenuData>()("lens-glance-clusters-menu");

export interface ClusterSourceMenuData {
  readonly clusterId: string;
  readonly fileName: string;
}

export const clusterSourceMenuKind = getDropDownMenuKind<ClusterSourceMenuData>()("lens-glance-cluster-source-menu");

export const describeSource = (source: DataSource) =>
  source.kind === "hub"
    ? `${source.name} (hub by "${source.clusterLabel}", needs its cluster connected)`
    : source.kind === "direct"
      ? `${source.name} (direct, ${source.clusterLabel ? `hub by "${source.clusterLabel}", ` : ""}no cluster connection)`
      : `${source.name} (needs each cluster connected)`;

export const openFleetPreferencesInjectable = getInjectable2({
  id: "lens-glance-open-fleet-preferences",
  consumptions: [navigateToPreferencesInjectionToken],

  instantiate: (di) => {
    const navigateToPreferences = di.inject(navigateToPreferencesInjectionToken)();

    return () => () => navigateToPreferences({ pageId: packageJson.name });
  },
});

const DataSourceMenu = observer(({ data }: { readonly data: FleetMenuData }) => {
  const selection = useSyncInject(fleetSelectionInjectable, data.fileName);
  const close = useCloseDropDownMenu();

  return (
    <SingleSelect
      options={selection.sources.get().map((source) => ({ id: source.id, label: describeSource(source) }))}
      selected={selection.source.get().id}
      onSelect={(id) => {
        close();
        selection.pickSource(id);
      }}
    />
  );
});

const ClusterSourceMenu = observer(({ data }: { readonly data: ClusterSourceMenuData }) => {
  const selection = useSyncInject(clusterSourceSelectionInjectable, data.clusterId, data.fileName);
  const close = useCloseDropDownMenu();

  return (
    <SingleSelect
      options={selection.options.get().map((option) => ({ id: option.id, label: option.name }))}
      selected={selection.source.get().id}
      onSelect={(id) => {
        close();
        selection.pick(id);
      }}
    />
  );
});

const ManageDataSources = () => {
  const openPreferences = useSyncInject(openFleetPreferencesInjectable);
  const close = useCloseDropDownMenu();

  return (
    <DropDownMenuItemRow
      Icon={SettingsIcon}
      $onClick={() => {
        close();
        void openPreferences();
      }}
    >
      Data sources…
    </DropDownMenuItemRow>
  );
};

const ClustersMenu = observer(({ data }: { readonly data: FleetMenuData }) => {
  const selection = useSyncInject(fleetSelectionInjectable, data.fileName);
  const viewModel = useSyncInject(dashboardViewModelInjectable, fleetScope, data.fileName);
  const close = useCloseDropDownMenu();
  const chosen = selection.chosen.get();
  const fanningOut = selection.source.get().kind === "clusters";

  return (
    <MultiValueList
      options={selection.options.get().map((option) => ({
        value: option.name,
        label: fanningOut && !option.connected ? `${option.name} (not connected)` : option.name,
      }))}
      isAll={chosen === "all"}
      chosen={new Set(chosen === "all" ? [] : chosen)}
      onToggleAll={selection.chooseAll}
      onToggle={selection.toggle}
      onOnly={(name) => {
        close();
        selection.chooseOnly(name);
      }}
      filter={viewModel.filterOf("__clusters")}
      onFilter={(filter) => viewModel.setFilter("__clusters", filter)}
      noun="clusters"
    />
  );
});

export const dataSourceMenuItemBunch = getDropDownMenuItemInjectableBunch({
  id: "lens-glance-data-source-menu-options",
  kind: dataSourceMenuKind,
  orderNumber: 10,
  Component: DataSourceMenu,
});

export const dataSourceMenuSeparatorBunch = getDropDownMenuItemInjectableBunch({
  id: "lens-glance-data-source-menu-separator",
  kind: dataSourceMenuKind,
  orderNumber: 20,
  Component: DropDownMenuSeparator,
});

export const manageDataSourcesMenuItemBunch = getDropDownMenuItemInjectableBunch({
  id: "lens-glance-data-source-menu-manage",
  kind: dataSourceMenuKind,
  orderNumber: 30,
  Component: ManageDataSources,
});

export const clustersMenuItemBunch = getDropDownMenuItemInjectableBunch({
  id: "lens-glance-clusters-menu-options",
  kind: clustersMenuKind,
  orderNumber: 10,
  Component: ClustersMenu,
});

export const clusterSourceMenuItemBunch = getDropDownMenuItemInjectableBunch({
  id: "lens-glance-cluster-source-menu-options",
  kind: clusterSourceMenuKind,
  orderNumber: 10,
  Component: ClusterSourceMenu,
});

export const clusterSourceMenuSeparatorBunch = getDropDownMenuItemInjectableBunch({
  id: "lens-glance-cluster-source-menu-separator",
  kind: clusterSourceMenuKind,
  orderNumber: 20,
  Component: DropDownMenuSeparator,
});

export const manageClusterSourcesMenuItemBunch = getDropDownMenuItemInjectableBunch({
  id: "lens-glance-cluster-source-menu-manage",
  kind: clusterSourceMenuKind,
  orderNumber: 30,
  Component: ManageDataSources,
});
