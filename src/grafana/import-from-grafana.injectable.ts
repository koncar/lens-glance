import { getInjectable2 } from "@k8slens/injectable";
import { openModalInjectionToken } from "@k8slens/modal-contracts";
import {
  showErrorNotificationInjectionToken,
  showInfoNotificationInjectionToken,
  showSuccessNotificationInjectionToken,
} from "@k8slens/notifications-contracts";
import { dashboardLibraryInjectable } from "../dashboard-files/dashboard-library.injectable";
import { dashboardsDirectoryInjectable } from "../dashboard-files/dashboards-directory.injectable";
import { validateDashboard } from "../dashboard-files/validate-dashboard";
import { writeFileInjectable } from "../dashboard-files/write-file.injectable";
import { openDashboardInjectable } from "../dashboard-tab/open-dashboard.injectable";
import { openFleetPreferencesInjectable } from "../fleet/fleet-menus.injectable";
import { askInjectable } from "../modals/dashboard-modals.injectable";
import { grafanaDiscoveryInjectable } from "./grafana-discovery.injectable";
import { grafanaFolder, libraryPathsOf } from "./grafana-found";
import { grafanaImportModalKind } from "./grafana-import-modal.injectable";
import { convertGrafanaDashboard } from "./grafana-to-perses";

// Imports Grafana's dashboards found in a cluster: looks for them in the places the user allows,
// asks which to import, confirms before replacing those imported before, and writes each,
// converted, to its place in the library's grafana folder.
export const importFromGrafanaInjectable = getInjectable2({
  id: "lens-glance-import-from-grafana",
  consumptions: [
    openModalInjectionToken,
    showErrorNotificationInjectionToken,
    showInfoNotificationInjectionToken,
    showSuccessNotificationInjectionToken,
  ],

  instantiate: (di) => {
    const askWhichToImport = di.inject(openModalInjectionToken.for(grafanaImportModalKind).for(di.scopeIds))();
    const { askToConfirm } = di.inject(askInjectable)();
    const discovery = di.inject(grafanaDiscoveryInjectable)();
    const { library, refresh } = di.inject(dashboardLibraryInjectable)();
    const getDirectory = di.inject(dashboardsDirectoryInjectable);
    const writeFile = di.inject(writeFileInjectable)();
    const openDashboard = di.inject(openDashboardInjectable)();
    const openPreferences = di.inject(openFleetPreferencesInjectable)();
    const showErrorNotification = di.inject(showErrorNotificationInjectionToken)();
    const showInfoNotification = di.inject(showInfoNotificationInjectionToken)();
    const showSuccessNotification = di.inject(showSuccessNotificationInjectionToken)();

    const importFromGrafana = async (clusterId: string) => {
      // Looked for again each time, as what Grafana has changes; the modal shows it as it comes.
      void discovery.scan(clusterId);

      const answer = await askWhichToImport(clusterId);

      if (answer?.kind === "preferences") {
        await openPreferences();

        return;
      }

      const dashboards = discovery.scanOf(clusterId).get()?.dashboards ?? [];
      const chosen = dashboards.filter((dashboard) => answer?.ids.includes(dashboard.id));

      if (chosen.length === 0) {
        return;
      }

      const paths = libraryPathsOf(dashboards);
      const inLibrary = new Set(library.get().dashboards.map((dashboard) => dashboard.path));
      const replaced = chosen.filter((dashboard) => inLibrary.has(paths.get(dashboard.id)!));

      if (
        replaced.length > 0 &&
        !(await askToConfirm(
          "Replace dashboards",
          replaced.length === 1
            ? `${paths.get(replaced[0].id)} is in the library already. Replace it with Grafana's? What it has now cannot be brought back.`
            : `${replaced.length} of them are in the library already. Replace them with Grafana's? What they have now cannot be brought back.`,
          "Replace",
        ))
      ) {
        return;
      }

      const directory = await getDirectory();
      const written: string[] = [];
      const failed: string[] = [];
      let notes = 0;

      for (const dashboard of chosen) {
        const path = paths.get(dashboard.id)!;

        try {
          const conversion = convertGrafanaDashboard(dashboard.json, { libraryPanels: dashboard.libraryPanels });
          const text = `${JSON.stringify(conversion.dashboard, null, 2)}\n`;
          const validation = validateDashboard(text);

          if (!validation.valid) {
            throw new Error(validation.errors.slice(0, 2).join("; "));
          }

          await writeFile(`${directory}/${path}`, text);
          written.push(path);
          notes += conversion.notes.length;
        } catch (error) {
          failed.push(`${dashboard.title}: ${(error as Error).message ?? error}`);
        }
      }

      await refresh();

      if (written.length > 0) {
        showSuccessNotification(
          written.length === 1
            ? `Imported ${written[0]} from Grafana.`
            : `Imported ${written.length} dashboards from Grafana into ${grafanaFolder}/.`,
        );
      }

      if (notes > 0) {
        showInfoNotification(
          `${notes} ${notes === 1 ? "thing" : "things"} of Grafana's could not be carried over, such as panels Lens Glance does not draw, which show a note in their place.`,
        );
      }

      if (failed.length > 0) {
        showErrorNotification(`Could not import ${failed.length} of them: ${failed.slice(0, 3).join(" · ")}`);
      }

      if (written.length === 1) {
        await openDashboard(clusterId, written[0]);
      }
    };

    return () => async (clusterId: string) => {
      try {
        await importFromGrafana(clusterId);
      } catch (error) {
        showErrorNotification(`Could not import from Grafana: ${(error as Error).message ?? error}`);
      }
    };
  },
});
