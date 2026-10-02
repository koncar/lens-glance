import { getDropDownMenuItemsInjectableBunch, useCloseDropDownMenu } from "@k8slens/drop-down-menu-contracts";
import { DropDownMenuItemRow } from "@k8slens/drop-down-menu-items";
import { OpenInBrowserIcon } from "@k8slens/icon";
import {
  type MainViewTabMenuData,
  mainViewTabMenuKind,
  mainViewTabMenuOrderNumbers,
} from "@k8slens/main-view-contracts";
import { getTabKindId } from "@k8slens/tab-contracts";
import { useSyncInject } from "@k8slens/use-inject";
import { computed } from "mobx";
import { openDashboardWindowInjectable } from "../dashboard-window/open-dashboard-window.injectable";
import { type DashboardTabInput, dashboardTabKind } from "./dashboard-tab.injectable";
import { dashboardTabsInjectable } from "./dashboard-tabs.injectable";

interface DashboardTabMenuRowProps {
  readonly data: MainViewTabMenuData;
  readonly dashboard: DashboardTabInput;
}

const OpenInWindow = ({ dashboard }: DashboardTabMenuRowProps) => {
  const openWindow = useSyncInject(openDashboardWindowInjectable);
  const close = useCloseDropDownMenu();

  return (
    <DropDownMenuItemRow
      Icon={OpenInBrowserIcon}
      $onClick={() => {
        close();
        void openWindow(dashboard.clusterId, dashboard.fileName);
      }}
    >
      Open in new window
    </DropDownMenuItemRow>
  );
};

// The rows of the menu a dashboard's tab opens when right-clicked, after Lens's own.
export const dashboardTabMenuItemsBunch = getDropDownMenuItemsInjectableBunch({
  id: "lens-glance-dashboard-tab-menu",
  kind: mainViewTabMenuKind,

  instantiate: (di) => {
    // What Lens persists as the type of the tabs of this kind, registered by this extension.
    const ownTabType = String(getTabKindId(dashboardTabKind, di.scopeIds));
    const { ofLensTab } = di.inject(dashboardTabsInjectable)();

    return ({ tabId, tabType }) =>
      computed(() => {
        const dashboard = tabType === ownTabType ? ofLensTab(tabId) : undefined;

        return dashboard
          ? [
              {
                id: "lens-glance-dashboard-tab-open-in-window",
                orderNumber: mainViewTabMenuOrderNumbers.sectionEnd + 100,
                Component: OpenInWindow,
                componentProps: { dashboard },
              },
            ]
          : [];
      });
  },
});
