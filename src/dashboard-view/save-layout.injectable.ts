import { getInjectable2 } from "@k8slens/injectable";
import { showErrorNotificationInjectionToken } from "@k8slens/notifications-contracts";
import { placePanels } from "../dashboard-edit/dashboard-edits";
import { editDashboardInjectable } from "../dashboard-edit/edit-dashboard.injectable";

export interface GridPlacement {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

// Writes where the user dragged or resized the panels of a group into the dashboard's file,
// which stays what the dashboard is: the agent reads the new layout from it like any change.
export const saveLayoutInjectable = getInjectable2({
  id: "lens-glance-save-layout",
  consumptions: [showErrorNotificationInjectionToken],

  instantiate: (di) => {
    const editsOf = di.inject(editDashboardInjectable);
    const showErrorNotification = di.inject(showErrorNotificationInjectionToken)();

    return () => async (fileName: string, groupIndex: number, placements: readonly GridPlacement[]) => {
      try {
        await editsOf(fileName).apply(placePanels(groupIndex, placements));
      } catch (error) {
        showErrorNotification(`The new layout was not saved: ${(error as Error).message}`);
      }
    };
  },
});
