import { shellQuote } from "@k8slens/ai-tools-contracts";
import { runCliCommandInjectionToken } from "@k8slens/cli-contracts";
import { getInjectable2 } from "@k8slens/injectable";
import {
  showErrorNotificationInjectionToken,
  showSuccessNotificationInjectionToken,
} from "@k8slens/notifications-contracts";
import { nameOfDashboard } from "../dashboard-files/dashboard-library.injectable";
import { dashboardsDirectoryInjectable } from "../dashboard-files/dashboards-directory.injectable";
import { writeFileInjectable } from "../dashboard-files/write-file.injectable";

// The folder downloads go to: the one the desktop names on Linux, ~/Downloads otherwise.
const downloadsDirectory = `"$(xdg-user-dir DOWNLOAD 2>/dev/null || printf %s "$HOME/Downloads")"`;

// Sharing a dashboard is sharing its file as it is: plain Perses JSON, which opens in Perses and
// anywhere else Perses dashboards do. Nothing of Lens's own travels with it, neither what is in
// `.lens/` nor the data source chosen for it, which is each user's own.
export const exportDashboardInjectable = getInjectable2({
  id: "lens-glance-export-dashboard",
  consumptions: [
    runCliCommandInjectionToken,
    showSuccessNotificationInjectionToken,
    showErrorNotificationInjectionToken,
  ],

  instantiate: (di) => {
    const runCliCommand = di.inject(runCliCommandInjectionToken)();
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

    const textOf = async (fileName: string) =>
      runCliCommand(`cat ${shellQuote(`${await getDirectory()}/${fileName}`)}`);

    // A name not taken yet in the downloads folder: the dashboard's, then with -2, -3 and on.
    const freeDownloadPathFor = (name: string) =>
      runCliCommand(
        `d=${downloadsDirectory}; f="$d"/${shellQuote(`${name}.json`)}; n=1; ` +
          `while [ -e "$f" ]; do n=$((n + 1)); f="$d"/${shellQuote(name)}-"$n".json; done; printf %s "$f"`,
      );

    // Shows the file where it was saved: selected in the Finder on macOS, its folder elsewhere.
    const reveal = (path: string) =>
      runCliCommand(
        `if [ "$(uname)" = Darwin ]; then open -R ${shellQuote(path)}; ` +
          `else xdg-open ${shellQuote(path.slice(0, path.lastIndexOf("/")))} >/dev/null 2>&1 & fi`,
      ).catch(() => undefined);

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
