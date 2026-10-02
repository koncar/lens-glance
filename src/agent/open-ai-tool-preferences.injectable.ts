import { getInjectable2 } from "@k8slens/injectable";
import { navigateToPreferencesInjectionToken } from "@k8slens/preferences-contracts";

// Lens's preferences, where the user chooses the AI tool the agent panel starts.
export const openAiToolPreferencesInjectable = getInjectable2({
  id: "lens-glance-open-ai-tool-preferences",
  consumptions: [navigateToPreferencesInjectionToken],

  instantiate: (di) => {
    const navigateToPreferences = di.inject(navigateToPreferencesInjectionToken)();

    return () => () => navigateToPreferences({});
  },
});
