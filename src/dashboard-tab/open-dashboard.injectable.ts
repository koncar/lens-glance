import { clusterNameInjectionToken } from "@k8slens/cluster-contracts";
import { getInjectable2 } from "@k8slens/injectable";
import { mainViewTabHostKind } from "@k8slens/main-view-contracts";
import { focusTabInjectionToken, openTabInjectionToken, tabIsOpenInjectionToken } from "@k8slens/tab-contracts";
import { dashboardTabIdOf, dashboardTabKind } from "./dashboard-tab.injectable";

const fileNameFor = (clusterName: string) =>
  `${
    clusterName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "cluster"
  }.json`;

// Shows the dashboard of a cluster, opening its tab the first time. A cluster's dashboard is the
// file named after the cluster in the dashboards folder.
export const openDashboardInjectable = getInjectable2({
  id: "lens-glance-open-dashboard",
  consumptions: [clusterNameInjectionToken, openTabInjectionToken, focusTabInjectionToken, tabIsOpenInjectionToken],

  instantiate: (di) => {
    const clusterName = di.inject(clusterNameInjectionToken);
    const openTab = di.inject(openTabInjectionToken.for(mainViewTabHostKind).for(dashboardTabKind).for(di.scopeIds))();
    const focusTab = di.inject(
      focusTabInjectionToken.for(mainViewTabHostKind).for(dashboardTabKind).for(di.scopeIds),
    )();
    const isOpen = di.inject(tabIsOpenInjectionToken.for(mainViewTabHostKind).for(dashboardTabKind).for(di.scopeIds))();

    return () => async (clusterId: string, fileName?: string) => {
      const input = { clusterId, fileName: fileName ?? fileNameFor(await clusterName(clusterId)) };
      const tabId = dashboardTabIdOf(input);

      if (await isOpen({ tabId })) {
        await focusTab({ tabId });
      } else {
        await openTab({ tabId, input });
      }
    };
  },
});
