import { shellQuote } from "@k8slens/ai-tools-contracts";
import { runCliCommandInjectionToken } from "@k8slens/cli-contracts";
import { allClusterRecordsInjectionToken } from "@k8slens/cluster-contracts";
import {
  addToHotbarInjectionToken,
  isInHotbarInjectionToken,
  isInHotbarReactiveInjectionToken,
  removeFromHotbarInjectionToken,
} from "@k8slens/hotbar-contracts";
import { getInjectable2 } from "@k8slens/injectable";
import { showErrorNotificationInjectionToken } from "@k8slens/notifications-contracts";
import { dashboardsDirectoryInjectable } from "../dashboard-files/dashboards-directory.injectable";
import { openDashboardInjectable } from "../dashboard-tab/open-dashboard.injectable";
import { fleetFolder, fleetScope } from "../fleet/fleet-settings.injectable";
import { askInjectable } from "../modals/dashboard-modals.injectable";
import { dashboardHotbarIdOf, dashboardHotbarKind, type PinnedDashboard } from "./dashboard-hotbar-kind";

const isFleetPath = (path: string) => path === fleetFolder || path.startsWith(`${fleetFolder}/`);

// Pinning dashboards to the hotbar and taking them off, opening them from it, and keeping the
// pins true to the library as dashboards are renamed and deleted.
//
// The hotbar answers for its current page alone: a dashboard pinned on another page is followed
// when it is next opened from there, which finds its file gone and offers to unpin it.
export const dashboardPinsInjectable = getInjectable2({
  id: "lens-glance-dashboard-pins",
  consumptions: [
    addToHotbarInjectionToken,
    isInHotbarInjectionToken,
    isInHotbarReactiveInjectionToken,
    removeFromHotbarInjectionToken,
    allClusterRecordsInjectionToken,
    runCliCommandInjectionToken,
    showErrorNotificationInjectionToken,
  ],

  instantiate: (di) => {
    const addToHotbar = di.inject(addToHotbarInjectionToken.for(dashboardHotbarKind).for(di.scopeIds))();
    const isInHotbar = di.inject(isInHotbarInjectionToken.for(dashboardHotbarKind).for(di.scopeIds))();
    const isInHotbarReactive = di.inject(isInHotbarReactiveInjectionToken.for(dashboardHotbarKind).for(di.scopeIds));
    const removeFromHotbar = di.inject(removeFromHotbarInjectionToken.for(dashboardHotbarKind).for(di.scopeIds))();
    const allClusterRecords = di.inject(allClusterRecordsInjectionToken);
    const runCliCommand = di.inject(runCliCommandInjectionToken)();
    const showErrorNotification = di.inject(showErrorNotificationInjectionToken)();
    const getDirectory = di.inject(dashboardsDirectoryInjectable);
    const openDashboard = di.inject(openDashboardInjectable)();
    const { askToConfirm } = di.inject(askInjectable)();

    const reporting =
      <Args extends unknown[]>(doing: string, act: (...args: Args) => Promise<unknown>) =>
      async (...args: Args) => {
        try {
          await act(...args);
        } catch (error) {
          showErrorNotification(`Could not ${doing}: ${(error as Error).message ?? error}`);
        }
      };

    // Adding an item that is there already throws, so each asks first.
    const pin = async (dashboard: PinnedDashboard) => {
      if (!(await isInHotbar(dashboardHotbarIdOf(dashboard)))) {
        await addToHotbar({ id: dashboardHotbarIdOf(dashboard), persistedData: dashboard });
      }
    };

    const unpin = async (dashboard: PinnedDashboard) => {
      if (await isInHotbar(dashboardHotbarIdOf(dashboard))) {
        await removeFromHotbar(dashboardHotbarIdOf(dashboard));
      }
    };

    const fileExists = async (fileName: string) =>
      (await runCliCommand(
        `[ -e ${shellQuote(`${await getDirectory()}/${fileName}`)} ] && printf yes || printf no`,
      )) === "yes";

    // A dashboard of a cluster's library may be pinned under any cluster; a fleet dashboard
    // under the fleet alone.
    const clusterIdsFor = async (fileName: string) =>
      isFleetPath(fileName) ? [fleetScope] : (await allClusterRecords()).map((record) => record.id);

    // After a dashboard's file moved or went away: its pins go, and come back under the new name.
    const follow = async (from: string, to?: string) => {
      for (const clusterId of await clusterIdsFor(from)) {
        if (await isInHotbar(dashboardHotbarIdOf({ clusterId, fileName: from }))) {
          await removeFromHotbar(dashboardHotbarIdOf({ clusterId, fileName: from }));

          if (to) {
            await pin({ clusterId, fileName: to });
          }
        }
      }
    };

    const pins = {
      isPinned: (dashboard: PinnedDashboard) => isInHotbarReactive(dashboardHotbarIdOf(dashboard)),

      toggle: reporting("change the hotbar", async (dashboard: PinnedDashboard) => {
        if (await isInHotbar(dashboardHotbarIdOf(dashboard))) {
          await removeFromHotbar(dashboardHotbarIdOf(dashboard));
        } else {
          await addToHotbar({ id: dashboardHotbarIdOf(dashboard), persistedData: dashboard });
        }
      }),

      pin: reporting("pin the dashboard", pin),
      unpin: reporting("unpin the dashboard", unpin),

      open: reporting("open the dashboard", async (dashboard: PinnedDashboard) => {
        if (await fileExists(dashboard.fileName)) {
          await openDashboard(dashboard.clusterId, dashboard.fileName);
        } else if (
          await askToConfirm(
            "Dashboard not found",
            `${dashboard.fileName} is no longer in the dashboards folder: it was moved or deleted. Unpin it from the hotbar?`,
            "Unpin",
          )
        ) {
          await unpin(dashboard);
        }
      }),

      /** Keeps the pins of a renamed dashboard; deleted, `to` is left out and the pins go. */
      follow: reporting("update the hotbar", follow),
    };

    return () => pins;
  },
});
