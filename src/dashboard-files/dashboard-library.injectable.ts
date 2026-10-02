import { shellQuote } from "@k8slens/ai-tools-contracts";
import { runCliCommandInjectionToken } from "@k8slens/cli-contracts";
import { getInjectable2 } from "@k8slens/injectable";
import { action, comparer, computed, observable, onBecomeObserved, onBecomeUnobserved } from "mobx";
import { dashboardsDirectoryInjectable } from "./dashboards-directory.injectable";

export interface LibraryDashboard {
  /** Where the dashboard is in the library, such as `team/cpu.json`: what it is known by everywhere. */
  readonly path: string;
  /** The folder it is in, `""` for the top of the library. */
  readonly folder: string;
  readonly name: string;
}

export interface DashboardLibrary {
  readonly loaded: boolean;
  /** Every folder, such as `team` or `team/apps`, the top of the library left out. */
  readonly folders: readonly string[];
  readonly dashboards: readonly LibraryDashboard[];
}

const pollIntervalMs = 3000;

export const nameOfDashboard = (path: string) => path.slice(path.lastIndexOf("/") + 1).replace(/\.json$/, "");
export const folderOfDashboard = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");

// Lists what is in the dashboards folder, which is the library of dashboards every cluster's
// navigator shows: its folders, and the dashboards in them. Lens offers no watching of files,
// so the listing is taken again every few seconds while something shows it.
export const dashboardLibraryInjectable = getInjectable2({
  id: "lens-glance-dashboard-library",
  consumptions: [runCliCommandInjectionToken],

  instantiate: (di) => {
    const runCliCommand = di.inject(runCliCommandInjectionToken)();
    const getDirectory = di.inject(dashboardsDirectoryInjectable);
    const library = observable.box<DashboardLibrary>(
      { loaded: false, folders: [], dashboards: [] },
      { deep: false, equals: comparer.structural },
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    let listing = false;

    const list = async () => {
      clearTimeout(timer);

      try {
        const directory = shellQuote(await getDirectory());
        // What starts with a dot is Lens's and the agent's own: .lens, .claude.
        const output = await runCliCommand(
          `mkdir -p ${directory} && cd ${directory} && find . -name '.*' ! -name . -prune -o -type d -print -o -type f -name '*.json' -print`,
        );
        const entries = output
          .split("\n")
          .map((line) => line.trim().replace(/^\.\/?/, ""))
          .filter(Boolean);
        const paths = entries.filter((entry) => entry.endsWith(".json")).sort();

        action(() =>
          library.set({
            loaded: true,
            folders: entries.filter((entry) => !entry.endsWith(".json")).sort(),
            dashboards: paths.map((path) => ({ path, folder: folderOfDashboard(path), name: nameOfDashboard(path) })),
          }),
        )();
      } catch {
        // Listed again on the next round.
      } finally {
        if (listing) {
          timer = setTimeout(() => void list(), pollIntervalMs);
        }
      }
    };

    onBecomeObserved(library, () => {
      listing = true;
      void list();
    });

    onBecomeUnobserved(library, () => {
      listing = false;
      clearTimeout(timer);
    });

    const current = computed(() => library.get());

    return () => ({
      library: current,
      /** Lists again now, after the extension changed the library itself. */
      refresh: () => list(),
    });
  },
});
