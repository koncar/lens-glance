import { getInjectable2 } from "@k8slens/injectable";
import { action, computed, observable } from "mobx";
import type { DashboardTabInput } from "./dashboard-tab.injectable";

// What is known of the dashboard tabs beyond what each was opened with: which dashboard a tab of
// the strip shows, by Lens's own id for the tab, and which dashboard tab is on screen.
//
// Lens's menu of a tab names the tab by Lens's own id, while a kind knows its tabs by the ids it
// opened them by. Lens hands both to the tab's header, which tells them here.
export const dashboardTabsInjectable = getInjectable2({
  id: "lens-glance-dashboard-tabs",

  instantiate: () => {
    const byLensTabId = observable.map<string, DashboardTabInput>({}, { deep: false });
    const onScreen = observable.box<DashboardTabInput | undefined>(undefined, { deep: false });

    const tabs = {
      remember: action((lensTabId: string, input: DashboardTabInput) => byLensTabId.set(lensTabId, input)),
      ofLensTab: (lensTabId: string) => byLensTabId.get(lensTabId),

      /** The dashboard of the tab on screen: Lens renders the selected tab alone. */
      onScreen: computed(() => onScreen.get()),
      /** Says a dashboard tab is on screen, and answers with what says it no longer is. */
      show: action((input: DashboardTabInput) => {
        onScreen.set(input);

        return action(() => {
          if (onScreen.get() === input) {
            onScreen.set(undefined);
          }
        });
      }),
    };

    return () => tabs;
  },
});
