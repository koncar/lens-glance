import { getInjectable2 } from "@k8slens/injectable";
import { hostFilesInjectable } from "../platform/host-files.injectable";

// Writes a file whole, so an agent reading it never sees half of it.
export const writeFileInjectable = getInjectable2({
  id: "lens-glance-write-file",

  instantiate: (di) => {
    const files = di.inject(hostFilesInjectable)();

    return () =>
      (path: string, content: string, options: { onlyIfMissing?: boolean } = {}) =>
        files.write(path, content, options);
  },
});
