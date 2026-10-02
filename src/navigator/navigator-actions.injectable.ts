import { getInjectable2 } from "@k8slens/injectable";
import { showErrorNotificationInjectionToken } from "@k8slens/notifications-contracts";
import { nameOfDashboard } from "../dashboard-files/dashboard-library.injectable";
import { libraryActionsInjectable } from "../dashboard-files/library-actions.injectable";
import { openDashboardInjectable } from "../dashboard-tab/open-dashboard.injectable";
import { askInjectable } from "../modals/dashboard-modals.injectable";

// What the rows of the dashboards in the navigator, and their menus, do: each asks what it
// needs to, changes the library, and opens the dashboard where there is one.
export const navigatorActionsInjectable = getInjectable2({
  id: "lens-glance-navigator-actions",
  consumptions: [showErrorNotificationInjectionToken],

  instantiate: (di) => {
    const { askForName, askToConfirm } = di.inject(askInjectable)();
    const library = di.inject(libraryActionsInjectable)();
    const openDashboard = di.inject(openDashboardInjectable)();
    const showErrorNotification = di.inject(showErrorNotificationInjectionToken)();

    const reporting =
      <Args extends unknown[]>(doing: string, act: (...args: Args) => Promise<unknown>) =>
      async (...args: Args) => {
        try {
          await act(...args);
        } catch (error) {
          showErrorNotification(`Could not ${doing}: ${(error as Error).message ?? error}`);
        }
      };

    return () => ({
      open: reporting("open the dashboard", (clusterId: string, path: string) => openDashboard(clusterId, path)),

      newDashboard: reporting("create the dashboard", async (clusterId: string, folder: string) => {
        const title = await askForName(
          "New dashboard",
          folder ? `A name for the dashboard in ${folder}` : "A name for the dashboard",
          "",
          "Create",
        );

        if (title) {
          await openDashboard(clusterId, await library.createDashboard(folder, title));
        }
      }),

      newFolder: reporting("create the folder", async (parent: string) => {
        const title = await askForName(
          "New folder",
          parent ? `A name for the folder in ${parent}` : "A name for the folder",
          "",
          "Create",
        );

        if (title) {
          await library.createFolder(parent, title);
        }
      }),

      renameDashboard: reporting("rename the dashboard", async (path: string) => {
        const title = await askForName(
          "Rename dashboard",
          "A new name for the dashboard",
          nameOfDashboard(path),
          "Rename",
        );

        if (title) {
          await library.renameDashboard(path, title);
        }
      }),

      deleteDashboard: reporting("delete the dashboard", async (path: string) => {
        if (await askToConfirm("Delete dashboard", `Delete ${path}? This cannot be undone.`, "Delete")) {
          await library.deleteDashboard(path);
        }
      }),

      deleteFolder: reporting("delete the folder (only an empty folder can be deleted)", (folder: string) =>
        library.deleteFolder(folder),
      ),
    });
  },
});
