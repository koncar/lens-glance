import { getCommandInjectableBunch } from "@k8slens/command-palette-contracts";
import { useCloseDropDownMenu } from "@k8slens/drop-down-menu-contracts";
import { DropDownMenuItemRow } from "@k8slens/drop-down-menu-items";
import { DownloadIcon } from "@k8slens/icon";
import { activeTabClusterIdInjectionToken } from "@k8slens/main-view-contracts";
import {
  getNavigatorItemMenuItemInjectableBunch,
  type NavigatorItem,
  navigatorItemDropDownMenuOrderNumbers,
} from "@k8slens/navigator-contracts";
import { showInfoNotificationInjectionToken } from "@k8slens/notifications-contracts";
import { useSyncInject } from "@k8slens/use-inject";
import { dashboardTabsInjectable } from "../dashboard-tab/dashboard-tabs.injectable";
import { inApplicationWindowInjectable } from "../dashboard-window/in-application-window.injectable";
import { fleetScope } from "../fleet/fleet-settings.injectable";
import { dashboardFolderKind, dashboardsRootKind } from "../navigator/dashboards-navigator.injectable";
import { grafanaFolder } from "./grafana-found";
import { importFromGrafanaInjectable } from "./import-from-grafana.injectable";

const ImportFromGrafanaRow = ({ data }: { readonly data: { readonly ids: readonly string[] } }) => {
  const importFromGrafana = useSyncInject(importFromGrafanaInjectable);
  const close = useCloseDropDownMenu();

  return (
    <DropDownMenuItemRow
      Icon={DownloadIcon}
      $onClick={() => {
        close();
        void importFromGrafana(data.ids[0]);
      }}
    >
      Import from Grafana…
    </DropDownMenuItemRow>
  );
};

const menuOrder = navigatorItemDropDownMenuOrderNumbers.sectionEnd;

export const importFromGrafanaInRootBunch = getNavigatorItemMenuItemInjectableBunch({
  id: "lens-glance-import-from-grafana-in-root",
  forItemsOfKind: dashboardsRootKind,
  orderNumber: menuOrder + 16,
  Component: ImportFromGrafanaRow,
});

// Over the library's grafana folder and those in it too, where what Grafana has is imported to.
export const importFromGrafanaInFolderBunch = getNavigatorItemMenuItemInjectableBunch({
  id: "lens-glance-import-from-grafana-in-folder",
  forItemsOfKind: dashboardFolderKind,
  orderNumber: menuOrder + 16,
  isVisible: (item: NavigatorItem) => {
    const folder = String(item.ids[item.ids.length - 1] ?? "");

    return folder === grafanaFolder || folder.startsWith(`${grafanaFolder}/`);
  },
  Component: ImportFromGrafanaRow,
});

// For the cluster on screen, a dashboard's or Lens's own. Like the other commands of the
// application window, it injects what it needs only when it runs.
export const importFromGrafanaCommandBunch = getCommandInjectableBunch({
  id: "lens-glance.import-from-grafana",
  title: "Dashboards: Import from Grafana",
  isActive: { instantiate: (di) => () => di.inject(inApplicationWindowInjectable)() },

  action: {
    consumptions: [activeTabClusterIdInjectionToken, showInfoNotificationInjectionToken],

    instantiate: (di) => () => async () => {
      const shown = di.inject(dashboardTabsInjectable)().onScreen.get();
      const clusterId =
        shown && shown.clusterId !== fleetScope
          ? shown.clusterId
          : await di.inject(activeTabClusterIdInjectionToken)()();

      if (!clusterId) {
        di.inject(showInfoNotificationInjectionToken)()(
          "Open a cluster first: Grafana's dashboards are looked for in it.",
        );

        return;
      }

      await di.inject(importFromGrafanaInjectable)()(clusterId);
    },
  },
});
