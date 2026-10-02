import { getInjectable2 } from "@k8slens/injectable";
import { showErrorNotificationInjectionToken } from "@k8slens/notifications-contracts";
import type { PanelDefinition, VariableDefinition } from "@perses-dev/spec";
import { dashboardViewModelInjectable } from "../dashboard-view/dashboard-view-model.injectable";
import { askInjectable } from "../modals/dashboard-modals.injectable";
import {
  addGroup,
  addPanel,
  deleteGroup,
  deletePanel,
  duplicatePanel,
  renameGroup,
  setVariables,
  updatePanel,
} from "./dashboard-edits";
import { editDashboardInjectable } from "./edit-dashboard.injectable";

// What the controls of edit mode do to one dashboard, each reporting what went wrong.
export const editActionsInjectable = getInjectable2({
  id: "lens-glance-edit-actions",
  consumptions: [showErrorNotificationInjectionToken],

  instantiate: (di) => {
    const editsOf = di.inject(editDashboardInjectable);
    const viewModelOf = di.inject(dashboardViewModelInjectable);
    const { askForName, askToConfirm } = di.inject(askInjectable)();
    const showErrorNotification = di.inject(showErrorNotificationInjectionToken)();

    return (clusterId: string, fileName: string) => {
      const edits = editsOf(fileName);
      const viewModel = viewModelOf(clusterId, fileName);

      const reporting =
        <Args extends unknown[]>(doing: string, act: (...args: Args) => Promise<unknown>) =>
        async (...args: Args) => {
          try {
            await act(...args);

            return true;
          } catch (error) {
            showErrorNotification(`Could not ${doing}: ${(error as Error).message ?? error}`);

            return false;
          }
        };

      return {
        canUndo: edits.canUndo,
        undo: reporting("undo the last change", () => edits.undo()),

        savePanel: reporting(
          "save the panel",
          async (key: string | undefined, panel: PanelDefinition, groupIndex: number) => {
            await edits.apply(key ? updatePanel(key, panel, groupIndex) : addPanel(panel, groupIndex));
            viewModel.closeEditor();
          },
        ),

        duplicatePanel: reporting("duplicate the panel", (key: string) => edits.apply(duplicatePanel(key))),

        deletePanel: reporting("delete the panel", async (key: string) => {
          await edits.apply(deletePanel(key));

          if (viewModel.editor.get()?.kind === "panel") {
            viewModel.closeEditor();
          }
        }),

        addGroup: reporting("add the group", async () => {
          const title = await askForName("New group", "A title for the group of panels", "", "Add");

          if (title) {
            await edits.apply(addGroup(title));
          }
        }),

        renameGroup: reporting("rename the group", async (groupIndex: number, current: string) => {
          const title = await askForName("Rename group", "A new title for the group", current, "Rename");

          if (title) {
            await edits.apply(renameGroup(groupIndex, title));
          }
        }),

        deleteGroup: reporting("delete the group", async (groupIndex: number, title: string) => {
          if (await askToConfirm("Delete group", `Delete the group "${title}" and the panels in it?`, "Delete")) {
            await edits.apply(deleteGroup(groupIndex));
          }
        }),

        saveVariables: reporting("save the variables", async (variables: readonly VariableDefinition[]) => {
          await edits.apply(setVariables(variables));
          viewModel.closeEditor();
        }),

        saveJson: reporting("save the JSON", async (text: string) => {
          await edits.replaceText(text);
          viewModel.closeEditor();
        }),
      };
    };
  },
});
