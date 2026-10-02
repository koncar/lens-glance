import { agentsInstructionsIndirectionContents } from "@k8slens/ai-tools-contracts";
import { getInjectable2 } from "@k8slens/injectable";
import { computed, observable, runInAction } from "mobx";
import { nameOfDashboard } from "../dashboard-files/dashboard-library.injectable";
import { dashboardsDirectoryInjectable } from "../dashboard-files/dashboards-directory.injectable";
import { starterFor } from "../dashboard-files/starter-dashboard";
import { writeFileInjectable } from "../dashboard-files/write-file.injectable";
import agentsInstructions from "./workspace/AGENTS.md";
import exampleDashboard from "./workspace/references/example-dashboard.json";
import panelsReference from "./workspace/references/panels.md";
import fleetReference from "./workspace/references/fleet.md";
import promQlReference from "./workspace/references/promql-kubernetes.md";
import skill from "./workspace/SKILL.md";

export type DashboardWorkspace =
  | { readonly status: "preparing" }
  | { readonly status: "ready"; readonly directory: string }
  | { readonly status: "failed"; readonly error: string };

const skillDirectory = ".claude/skills/lens-dashboard";

// What an agent working in the dashboards folder reads: AGENTS.md, which every tool Lens
// launches reads, the files of the tools that read their own name instead pointing at it, and
// the skill with its references. They are written again whenever Lens starts, so they follow
// the extension as it changes.
const agentFiles: Readonly<Record<string, string>> = {
  "AGENTS.md": agentsInstructions,
  "CLAUDE.md": agentsInstructionsIndirectionContents,
  "GEMINI.md": agentsInstructionsIndirectionContents,
  [`${skillDirectory}/SKILL.md`]: skill,
  [`${skillDirectory}/references/panels.md`]: panelsReference,
  [`${skillDirectory}/references/promql-kubernetes.md`]: promQlReference,
  [`${skillDirectory}/references/fleet.md`]: fleetReference,
  [`${skillDirectory}/references/example-dashboard.json`]: `${JSON.stringify(exampleDashboard, null, 2)}\n`,
};

const titleOf = (fileName: string) =>
  nameOfDashboard(fileName)
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");

// The dashboards folder made ready for one dashboard: the agent's instructions in place, and
// the dashboard's file started when it does not exist yet.
export const dashboardWorkspaceInjectable = getInjectable2({
  id: "lens-glance-dashboard-workspace",

  instantiate: (di) => {
    const getDirectory = di.inject(dashboardsDirectoryInjectable);
    const writeFile = di.inject(writeFileInjectable)();
    let agentFilesWritten: Promise<void> | undefined;

    const writeAgentFiles = (directory: string) => {
      agentFilesWritten ??= Promise.all(
        Object.entries(agentFiles).map(([path, content]) => writeFile(`${directory}/${path}`, content)),
      ).then(
        () => undefined,
        (error) => {
          agentFilesWritten = undefined;
          throw error;
        },
      );

      return agentFilesWritten;
    };

    return (fileName: string) => {
      const state = observable.box<DashboardWorkspace>({ status: "preparing" }, { deep: false });

      void (async () => {
        try {
          const directory = await getDirectory();
          const starter = starterFor(fileName, nameOfDashboard(fileName), titleOf(fileName));

          await writeAgentFiles(directory);
          await writeFile(`${directory}/${fileName}`, `${JSON.stringify(starter, null, 2)}\n`, { onlyIfMissing: true });
          runInAction(() => state.set({ status: "ready", directory }));
        } catch (error) {
          runInAction(() => state.set({ status: "failed", error: String((error as Error).message ?? error) }));
        }
      })();

      return computed(() => state.get());
    };
  },
});
