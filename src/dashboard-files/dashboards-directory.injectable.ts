import { getInjectable2 } from "@k8slens/injectable";
import { hostFilesInjectable } from "../platform/host-files.injectable";

// Where the dashboards live: one Perses dashboard JSON per file, which is what the agent edits
// and what the dashboard tab renders. Written the way the platform writes paths.
export const dashboardsDirectoryInjectable = getInjectable2({
  id: "lens-glance-dashboards-directory",

  instantiate: (di) => {
    const files = di.inject(hostFilesInjectable)();
    let directory: Promise<string> | undefined;

    return () => {
      directory ??= files.home().then((home) => files.native(`${home}/.k8slens/lens-glance/dashboards`));

      return directory;
    };
  },
});
