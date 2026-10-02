import { clusterNameReactiveInjectionToken } from "@k8slens/cluster-contracts";
import { useCloseDropDownMenu } from "@k8slens/drop-down-menu-contracts";
import { DropDownMenuItemRow } from "@k8slens/drop-down-menu-items";
import { Button, Div } from "@k8slens/element-components";
import {
  getHotbarItemKindInjectableBunch,
  getHotbarItemMenuItemInjectableBunch,
  type HotbarItem,
  hotbarItemMenuOrderNumbers,
  type HotbarItemProps,
} from "@k8slens/hotbar-contracts";
import { DashboardIcon, LayersIcon, OpenInBrowserIcon } from "@k8slens/icon";
import { getInjectable2 } from "@k8slens/injectable";
import { useSyncInject } from "@k8slens/use-inject";
import { computed, type IComputedValue, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { nameOfDashboard } from "../dashboard-files/dashboard-library.injectable";
import { openDashboardWindowInjectable } from "../dashboard-window/open-dashboard-window.injectable";
import { fleetScope } from "../fleet/fleet-settings.injectable";
import { dashboardHotbarKind, pinnedDashboardOf } from "./dashboard-hotbar-kind";
import { dashboardPinsInjectable } from "./dashboard-pins.injectable";

// What a dashboard shows, by name: its cluster, followed as the user renames it, or the fleet.
// Undefined until Lens has the cluster's name, and for a cluster Lens no longer knows.
export const shownByInjectable = getInjectable2({
  id: "lens-glance-dashboard-shown-by",
  consumptions: [clusterNameReactiveInjectionToken],

  instantiate: (di) => {
    const clusterNameReactive = di.inject(clusterNameReactiveInjectionToken);

    return (clusterId: string) => {
      if (clusterId === fleetScope) {
        return computed(() => "Fleet");
      }

      const name = observable.box<IComputedValue<string> | undefined>(undefined, { deep: false });

      void clusterNameReactive(clusterId).then((loaded) => runInAction(() => name.set(loaded)));

      return computed(() => name.get()?.get());
    };
  },
});

// Four letters at most, as Lens labels its clusters: the initials of a name of several words,
// or the start of a name of one.
const shortNameOf = (name: string) => {
  const words = name.split(/[^a-zA-Z0-9]+/).filter(Boolean);

  return (words.length > 1 ? words.map((word) => word[0]).join("") : (words[0] ?? name)).slice(0, 4);
};

const DashboardHotbarItem = observer(({ persistedData }: HotbarItemProps<typeof dashboardHotbarKind>) => {
  const { open } = useSyncInject(dashboardPinsInjectable);
  const shownBy = useSyncInject(shownByInjectable, persistedData.clusterId).get();
  const name = nameOfDashboard(persistedData.fileName);
  const Glyph = persistedData.clusterId === fleetScope ? LayersIcon : DashboardIcon;

  return (
    <Button
      $width="full"
      $height="full"
      $relative
      $flex={{ verticalAlign: "center", horizontalAlign: "center" }}
      $color={{ normal: "textDefault", hover: "textHighlight" }}
      $tooltip={shownBy ? `${name} · ${shownBy}` : name}
      $onClick={() => void open(persistedData)}
    >
      <Glyph $size="xl" />
      <Div
        $absolute="absolute-bottom-to-relative-bottom"
        $padding={{ horizontal: "3xs" }}
        $color="grey10"
        $font={{ bold: true, size: "xs", noWrap: true, uppercase: true }}
        $overflow="hidden"
        $backgroundColor="backgroundPrimaryDimmed"
        $height="m"
      >
        {shortNameOf(name)}
      </Div>
    </Button>
  );
});

export const dashboardHotbarKindBunch = getHotbarItemKindInjectableBunch({
  kind: dashboardHotbarKind,
  Component: DashboardHotbarItem,
});

const OpenInWindow = ({ data }: { readonly data: HotbarItem }) => {
  const openWindow = useSyncInject(openDashboardWindowInjectable);
  const close = useCloseDropDownMenu();
  const dashboard = pinnedDashboardOf(data.id);

  return dashboard ? (
    <DropDownMenuItemRow
      Icon={OpenInBrowserIcon}
      $onClick={() => {
        close();
        void openWindow(dashboard.clusterId, dashboard.fileName);
      }}
    >
      Open in new window
    </DropDownMenuItemRow>
  ) : null;
};

// The item's own row in its right-click menu, before Lens's "Remove from hotbar".
export const openPinnedDashboardInWindowBunch = getHotbarItemMenuItemInjectableBunch({
  id: "lens-glance-hotbar-dashboard-open-in-window",
  forItemsOfKind: dashboardHotbarKind,
  orderNumber: hotbarItemMenuOrderNumbers.forTheItemsOwnKind,
  Component: OpenInWindow,
});
