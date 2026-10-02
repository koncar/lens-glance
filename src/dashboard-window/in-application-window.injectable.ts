import { getInjectable2 } from "@k8slens/injectable";
import { isApplicationWindow, thisWindowIdInjectionToken } from "@k8slens/messaging-contracts";

// Whether this copy of the extension runs in Lens's application window, rather than in a window
// of a dashboard's own. Lens loads the extension into both, but a window of its own has none of
// the application window's chrome: no tabs, navigator, hotbar, preferences or terminal. What
// needs one of those is left out there.
export const inApplicationWindowInjectable = getInjectable2({
  id: "lens-glance-in-application-window",
  consumptions: [thisWindowIdInjectionToken],

  instantiate: (di) => {
    const inApplicationWindow = isApplicationWindow(di.inject(thisWindowIdInjectionToken)());

    return () => inApplicationWindow;
  },
});
