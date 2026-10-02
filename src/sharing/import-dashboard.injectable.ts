import { shellQuote } from "@k8slens/ai-tools-contracts";
import { runCliCommandInjectionToken } from "@k8slens/cli-contracts";
import { getInjectable2 } from "@k8slens/injectable";
import { openModalInjectionToken } from "@k8slens/modal-contracts";
import { showErrorNotificationInjectionToken } from "@k8slens/notifications-contracts";
import { dashboardLibraryInjectable } from "../dashboard-files/dashboard-library.injectable";
import { dashboardsDirectoryInjectable } from "../dashboard-files/dashboards-directory.injectable";
import { writeFileInjectable } from "../dashboard-files/write-file.injectable";
import { openDashboardInjectable } from "../dashboard-tab/open-dashboard.injectable";
import { askInjectable } from "../modals/dashboard-modals.injectable";
import { importModalKind } from "./import-dashboard-modal.injectable";
import type { ImportTarget } from "./import-draft";

// Imports a dashboard someone shared: asks for it and where it goes, confirms before replacing
// one, writes it into the library and opens it.
export const importDashboardInjectable = getInjectable2({
  id: "lens-glance-import-dashboard",
  consumptions: [openModalInjectionToken, runCliCommandInjectionToken, showErrorNotificationInjectionToken],

  instantiate: (di) => {
    const askToImport = di.inject(openModalInjectionToken.for(importModalKind).for(di.scopeIds))();
    const { askToConfirm } = di.inject(askInjectable)();
    const runCliCommand = di.inject(runCliCommandInjectionToken)();
    const showErrorNotification = di.inject(showErrorNotificationInjectionToken)();
    const getDirectory = di.inject(dashboardsDirectoryInjectable);
    const writeFile = di.inject(writeFileInjectable)();
    const { refresh } = di.inject(dashboardLibraryInjectable)();
    const openDashboard = di.inject(openDashboardInjectable)();

    const exists = async (path: string) =>
      (await runCliCommand(`[ -e ${shellQuote(path)} ] && printf yes || printf no`)) === "yes";

    const importDashboard = async (target: ImportTarget, clusterId: string | undefined) => {
      const answer = await askToImport(target, clusterId);

      if (!answer) {
        return;
      }

      const destination = `${await getDirectory()}/${answer.path}`;

      if (answer.replace) {
        const replace = await askToConfirm(
          "Replace dashboard",
          `Replace ${answer.path} with the imported dashboard? What it has now cannot be brought back.`,
          "Replace",
        );

        if (!replace) {
          return;
        }
      } else if (await exists(destination)) {
        throw new Error(`${answer.path} was made in the meantime. Import it again under another name.`);
      }

      // Written the way the editors write a dashboard, so diffs of it read the same.
      await writeFile(destination, `${JSON.stringify(JSON.parse(answer.text), null, 2)}\n`);
      await refresh();
      await openDashboard(answer.target.clusterId, answer.path);
    };

    return () => async (target: ImportTarget, clusterId: string | undefined) => {
      try {
        await importDashboard(target, clusterId);
      } catch (error) {
        showErrorNotification(`Could not import the dashboard: ${(error as Error).message ?? error}`);
      }
    };
  },
});
