import { runCliCommandInjectionToken } from "@k8slens/cli-contracts";
import { getInjectable2 } from "@k8slens/injectable";

// Where the dashboards live: one Perses dashboard JSON per file, which is what the agent edits
// and what the dashboard tab renders.
export const dashboardsDirectoryInjectable = getInjectable2({
  id: "lens-glance-dashboards-directory",
  consumptions: [runCliCommandInjectionToken],

  instantiate: (di) => {
    const runCliCommand = di.inject(runCliCommandInjectionToken)();
    let directory: Promise<string> | undefined;

    return () => {
      directory ??= runCliCommand('printf %s "$HOME"').then((home) => `${home}/.k8slens/lens-glance/dashboards`);

      return directory;
    };
  },
});
