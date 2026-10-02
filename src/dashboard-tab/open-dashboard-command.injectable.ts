import { getCommandInjectableBunch } from "@k8slens/command-palette-contracts";
import { activeTabClusterIdInjectionToken } from "@k8slens/main-view-contracts";
import { showErrorNotificationInjectionToken } from "@k8slens/notifications-contracts";
import { openFleetPreferencesInjectable } from "../fleet/fleet-menus.injectable";
import { fleetFolder, fleetScope } from "../fleet/fleet-settings.injectable";
import { navigatorActionsInjectable } from "../navigator/navigator-actions.injectable";
import { openDashboardInjectable } from "./open-dashboard.injectable";

export const openDashboardCommandBunch = getCommandInjectableBunch({
  id: "lens-glance.open-dashboard",
  title: "Dashboards: Open the dashboard of this cluster",

  action: {
    consumptions: [activeTabClusterIdInjectionToken, showErrorNotificationInjectionToken],

    instantiate: (di) => {
      const activeTabClusterId = di.inject(activeTabClusterIdInjectionToken)();
      const showErrorNotification = di.inject(showErrorNotificationInjectionToken)();
      const openDashboard = di.inject(openDashboardInjectable)();

      return () => async () => {
        const clusterId = await activeTabClusterId();

        if (clusterId) {
          await openDashboard(clusterId);
        } else {
          showErrorNotification("Open a cluster first: a dashboard shows the metrics of one cluster.");
        }
      };
    },
  },
});

export const newDashboardCommandBunch = getCommandInjectableBunch({
  id: "lens-glance.new-dashboard",
  title: "Dashboards: New dashboard",

  action: {
    consumptions: [activeTabClusterIdInjectionToken, showErrorNotificationInjectionToken],

    instantiate: (di) => {
      const activeTabClusterId = di.inject(activeTabClusterIdInjectionToken)();
      const showErrorNotification = di.inject(showErrorNotificationInjectionToken)();
      const { newDashboard } = di.inject(navigatorActionsInjectable)();

      return () => async () => {
        const clusterId = await activeTabClusterId();

        if (clusterId) {
          await newDashboard(clusterId, "");
        } else {
          showErrorNotification("Open a cluster first: a dashboard shows the metrics of one cluster.");
        }
      };
    },
  },
});

export const newFleetDashboardCommandBunch = getCommandInjectableBunch({
  id: "lens-glance.new-fleet-dashboard",
  title: "Dashboards: New fleet dashboard",

  action: {
    instantiate: (di) => {
      const { newDashboard } = di.inject(navigatorActionsInjectable)();

      return () => () => newDashboard(fleetScope, fleetFolder);
    },
  },
});

export const dataSourcesCommandBunch = getCommandInjectableBunch({
  id: "lens-glance.data-sources",
  title: "Dashboards: Data sources",

  action: {
    instantiate: (di) => {
      const openPreferences = di.inject(openFleetPreferencesInjectable)();

      return () => () => openPreferences();
    },
  },
});
