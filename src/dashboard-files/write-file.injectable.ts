import { shellQuote } from "@k8slens/ai-tools-contracts";
import { runCliCommandInjectionToken } from "@k8slens/cli-contracts";
import { getInjectable2 } from "@k8slens/injectable";

// The extension surface has no file system, so files are written the way they are read: by a
// command. The content goes to a temporary file that is then moved over the target, so an agent
// reading the file never sees half of it.
export const writeFileInjectable = getInjectable2({
  id: "lens-glance-write-file",
  consumptions: [runCliCommandInjectionToken],

  instantiate: (di) => {
    const runCliCommand = di.inject(runCliCommandInjectionToken)();

    return () =>
      async (path: string, content: string, { onlyIfMissing = false } = {}) => {
        const directory = path.slice(0, path.lastIndexOf("/"));
        const target = shellQuote(path);
        const temporary = shellQuote(`${path}.lens-glance-tmp`);
        const write = `mkdir -p ${shellQuote(directory)} && printf '%s' ${shellQuote(content)} > ${temporary} && mv ${temporary} ${target}`;

        await runCliCommand(onlyIfMissing ? `[ -e ${target} ] || { ${write}; }` : write);
      };
  },
});
