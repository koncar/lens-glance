import { getInjectable2 } from "@k8slens/injectable";
import {
  showErrorNotificationInjectionToken,
  showSuccessNotificationInjectionToken,
} from "@k8slens/notifications-contracts";
import { nameOfDashboard } from "../dashboard-files/dashboard-library.injectable";
import { dashboardsDirectoryInjectable } from "../dashboard-files/dashboards-directory.injectable";
import { writeFileInjectable } from "../dashboard-files/write-file.injectable";
import { hostFilesInjectable } from "../platform/host-files.injectable";

// Sharing a dashboard is sharing its file as it is: plain Perses JSON, which opens in Perses and
// anywhere else Perses dashboards do. Nothing of Lens's own travels with it, neither what is in
// `.lens/` nor the data source chosen for it, which is each user's own.
export const exportDashboardInjectable = getInjectable2({
  id: "lens-glance-export-dashboard",
  consumptions: [showSuccessNotificationInjectionToken, showErrorNotificationInjectionToken],

  instantiate: (di) => {
    const files = di.inject(hostFilesInjectable)();
    const showSuccessNotification = di.inject(showSuccessNotificationInjectionToken)();
    const showErrorNotification = di.inject(showErrorNotificationInjectionToken)();
    const getDirectory = di.inject(dashboardsDirectoryInjectable);
    const writeFile = di.inject(writeFileInjectable)();

    const reporting =
      <Args extends unknown[]>(doing: string, act: (...args: Args) => Promise<unknown>) =>
      async (...args: Args) => {
        try {
          await act(...args);
        } catch (error) {
          showErrorNotification(`Could not ${doing}: ${(error as Error).message ?? error}`);
        }
      };

    const textOf = async (fileName: string) => {
      const text = await files.read(`${await getDirectory()}/${fileName}`);

      if (text === undefined) {
        throw new Error(`${fileName} is not in the dashboards folder any more`);
      }

      return text;
    };

    // A name not taken yet in the downloads folder: the dashboard's, then with -2, -3 and on.
    const freeDownloadPathFor = async (name: string) => {
      const downloads = await files.downloads();

      for (let count = 1; ; count++) {
        const path = files.native(`${downloads}/${count === 1 ? name : `${name}-${count}`}.json`);

        if (!(await files.exists(path))) {
          return path;
        }
      }
    };

    // Shows the file where it was saved, in the platform's file manager.
    const reveal = (path: string) => files.reveal(path).catch(() => undefined);

    const exporting = {
      copyJson: reporting("copy the dashboard", async (fileName: string) => {
        await navigator.clipboard.writeText(await textOf(fileName));
        showSuccessNotification(`Copied ${nameOfDashboard(fileName)} to the clipboard, as Perses JSON.`);
      }),

      saveToDownloads: reporting("save the dashboard", async (fileName: string) => {
        const text = await textOf(fileName);
        const path = await freeDownloadPathFor(nameOfDashboard(fileName));

        await writeFile(path, text.endsWith("\n") ? text : `${text}\n`);
        await reveal(path);
        showSuccessNotification(`Saved ${nameOfDashboard(fileName)} to ${path}`);
      }),
    };

    return () => exporting;
  },
});
