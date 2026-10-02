import { getCommandInjectableBunch } from "@k8slens/command-palette-contracts";
import { activeTabClusterIdInjectionToken } from "@k8slens/main-view-contracts";
import { showErrorNotificationInjectionToken } from "@k8slens/notifications-contracts";
import { computed } from "mobx";
import { inApplicationWindowInjectable } from "../dashboard-window/in-application-window.injectable";
import { openDashboardWindowInjectable } from "../dashboard-window/open-dashboard-window.injectable";
import { openFleetPreferencesInjectable } from "../fleet/fleet-menus.injectable";
import { fleetFolder, fleetScope } from "../fleet/fleet-settings.injectable";
import { navigatorActionsInjectable } from "../navigator/navigator-actions.injectable";
import { dashboardTabsInjectable } from "./dashboard-tabs.injectable";
import { openDashboardInjectable } from "./open-dashboard.injectable";

// Lens lists these commands in a dashboard's window of its own too, and builds every command's
// action as it lists them. What they act on is the application window's, its tabs and its
// preferences, so they are offered there alone, and inject what they need only when they run.

export const openDashboardCommandBunch = getCommandInjectableBunch({
  id: "lens-glance.open-dashboard",
  title: "Dashboards: Open the dashboard of this cluster",
  isActive: { instantiate: (di) => () => di.inject(inApplicationWindowInjectable)() },

  action: {
    consumptions: [activeTabClusterIdInjectionToken, showErrorNotificationInjectionToken],

    instantiate: (di) => () => async () => {
      const clusterId = await di.inject(activeTabClusterIdInjectionToken)()();

      if (clusterId) {
        await di.inject(openDashboardInjectable)()(clusterId);
      } else {
        di.inject(showErrorNotificationInjectionToken)()(
          "Open a cluster first: a dashboard shows the metrics of one cluster.",
        );
      }
    },
  },
});

export const newDashboardCommandBunch = getCommandInjectableBunch({
  id: "lens-glance.new-dashboard",
  title: "Dashboards: New dashboard",
  isActive: { instantiate: (di) => () => di.inject(inApplicationWindowInjectable)() },

  action: {
    consumptions: [activeTabClusterIdInjectionToken, showErrorNotificationInjectionToken],

    instantiate: (di) => () => async () => {
      const clusterId = await di.inject(activeTabClusterIdInjectionToken)()();

      if (clusterId) {
        await di.inject(navigatorActionsInjectable)().newDashboard(clusterId, "");
      } else {
        di.inject(showErrorNotificationInjectionToken)()(
          "Open a cluster first: a dashboard shows the metrics of one cluster.",
        );
      }
    },
  },
});

export const newFleetDashboardCommandBunch = getCommandInjectableBunch({
  id: "lens-glance.new-fleet-dashboard",
  title: "Dashboards: New fleet dashboard",
  isActive: { instantiate: (di) => () => di.inject(inApplicationWindowInjectable)() },

  action: {
    instantiate: (di) => () => () => di.inject(navigatorActionsInjectable)().newDashboard(fleetScope, fleetFolder),
  },
});

export const dataSourcesCommandBunch = getCommandInjectableBunch({
  id: "lens-glance.data-sources",
  title: "Dashboards: Data sources",
  isActive: { instantiate: (di) => () => di.inject(inApplicationWindowInjectable)() },

  action: {
    instantiate: (di) => () => () => di.inject(openFleetPreferencesInjectable)()(),
  },
});

// Offered while a dashboard's tab is on screen, for that dashboard.
export const openDashboardWindowCommandBunch = getCommandInjectableBunch({
  id: "lens-glance.open-dashboard-in-window",
  title: "Dashboards: Open in new window",

  isActive: {
    instantiate: (di) => {
      const { onScreen } = di.inject(dashboardTabsInjectable)();

      return () => computed(() => onScreen.get() !== undefined);
    },
  },

  action: {
    instantiate: (di) => {
      const { onScreen } = di.inject(dashboardTabsInjectable)();
      const openWindow = di.inject(openDashboardWindowInjectable)();

      return () => async () => {
        const dashboard = onScreen.get();

        if (dashboard) {
          await openWindow(dashboard.clusterId, dashboard.fileName);
        }
      };
    },
  },
});
