import { clusterNameInjectionToken } from "@k8slens/cluster-contracts";
import { getInjectable2 } from "@k8slens/injectable";
import { showErrorNotificationInjectionToken } from "@k8slens/notifications-contracts";
import { openSubWindowInjectionToken } from "@k8slens/sub-window-contracts";
import { nameOfDashboard } from "../dashboard-files/dashboard-library.injectable";
import { fleetScope } from "../fleet/fleet-settings.injectable";
import { dashboardWindowIdOf, dashboardWindowKind } from "./dashboard-window-kind";

// Opens a dashboard in a window of its own, or brings its window forward when it is open.
export const openDashboardWindowInjectable = getInjectable2({
  id: "lens-glance-open-dashboard-window",
  consumptions: [openSubWindowInjectionToken, clusterNameInjectionToken, showErrorNotificationInjectionToken],

  instantiate: (di) => {
    const openWindow = di.inject(openSubWindowInjectionToken.for(dashboardWindowKind).for(di.scopeIds))();
    const clusterName = di.inject(clusterNameInjectionToken);
    const showErrorNotification = di.inject(showErrorNotificationInjectionToken)();

    return () => async (clusterId: string, fileName: string) => {
      try {
        const shows = clusterId === fleetScope ? "Fleet" : await clusterName(clusterId);

        await openWindow({
          id: dashboardWindowIdOf(clusterId, fileName),
          params: { clusterId, fileName, title: `${nameOfDashboard(fileName)} · ${shows}` },
        });
      } catch (error) {
        showErrorNotification(`Could not open the dashboard in a new window: ${(error as Error).message ?? error}`);
      }
    };
  },
});
