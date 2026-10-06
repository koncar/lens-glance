import { runCliCommandInjectionToken } from "@k8slens/cli-contracts";
import { getInjectable2 } from "@k8slens/injectable";
import { runsOnWindows } from "./host-files";
import { posixFiles } from "./posix-files";
import { windowsFiles } from "./windows-files";

// The extension's files, through the shell of the platform Lens runs on.
export const hostFilesInjectable = getInjectable2({
  id: "lens-glance-host-files",
  consumptions: [runCliCommandInjectionToken],

  instantiate: (di) => {
    const runCliCommand = di.inject(runCliCommandInjectionToken)();
    const files = runsOnWindows() ? windowsFiles(runCliCommand) : posixFiles(runCliCommand);

    return () => files;
  },
});
