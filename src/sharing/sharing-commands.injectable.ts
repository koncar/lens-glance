import { getCommandInjectableBunch } from "@k8slens/command-palette-contracts";
import { activeTabClusterIdInjectionToken } from "@k8slens/main-view-contracts";
import { computed } from "mobx";
import { dashboardTabsInjectable } from "../dashboard-tab/dashboard-tabs.injectable";
import { inApplicationWindowInjectable } from "../dashboard-window/in-application-window.injectable";
import { fleetFolder, fleetScope } from "../fleet/fleet-settings.injectable";
import { exportDashboardInjectable } from "./export-dashboard.injectable";
import { importDashboardInjectable } from "./import-dashboard.injectable";

// Copying and saving are offered while a dashboard's tab is on screen, for that dashboard.

export const copyJsonCommandBunch = getCommandInjectableBunch({
  id: "lens-glance.copy-dashboard-json",
  title: "Dashboards: Copy JSON",

  isActive: {
    instantiate: (di) => {
      const { onScreen } = di.inject(dashboardTabsInjectable)();

      return () => computed(() => onScreen.get() !== undefined);
    },
  },

  action: {
    instantiate: (di) => {
      const { onScreen } = di.inject(dashboardTabsInjectable)();
      const { copyJson } = di.inject(exportDashboardInjectable)();

      return () => async () => {
        const dashboard = onScreen.get();

        if (dashboard) {
          await copyJson(dashboard.fileName);
        }
      };
    },
  },
});

export const saveToDownloadsCommandBunch = getCommandInjectableBunch({
  id: "lens-glance.save-dashboard-to-downloads",
  title: "Dashboards: Save to Downloads",

  isActive: {
    instantiate: (di) => {
      const { onScreen } = di.inject(dashboardTabsInjectable)();

      return () => computed(() => onScreen.get() !== undefined);
    },
  },

  action: {
    instantiate: (di) => {
      const { onScreen } = di.inject(dashboardTabsInjectable)();
      const { saveToDownloads } = di.inject(exportDashboardInjectable)();

      return () => async () => {
        const dashboard = onScreen.get();

        if (dashboard) {
          await saveToDownloads(dashboard.fileName);
        }
      };
    },
  },
});

// Into the library of the cluster on screen, a dashboard's or Lens's own, or else the fleet's.
// Like the other commands of the application window, it injects what it needs only when it runs.
export const importDashboardCommandBunch = getCommandInjectableBunch({
  id: "lens-glance.import-dashboard",
  title: "Dashboards: Import dashboard",
  isActive: { instantiate: (di) => () => di.inject(inApplicationWindowInjectable)() },

  action: {
    consumptions: [activeTabClusterIdInjectionToken],

    instantiate: (di) => () => async () => {
      const shown = di.inject(dashboardTabsInjectable)().onScreen.get();
      const clusterId =
        shown && shown.clusterId !== fleetScope
          ? shown.clusterId
          : await di.inject(activeTabClusterIdInjectionToken)()();

      await di.inject(importDashboardInjectable)()(
        clusterId ? { clusterId, folder: "" } : { clusterId: fleetScope, folder: fleetFolder },
        clusterId,
      );
    },
  },
});
