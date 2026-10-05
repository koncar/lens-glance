import { getInjectable2 } from "@k8slens/injectable";
import { comparer, computed, observable, onBecomeObserved, onBecomeUnobserved, runInAction } from "mobx";
import { dashboardsDirectoryInjectable } from "../dashboard-files/dashboards-directory.injectable";
import { gitCommandInjectable } from "./git-command.injectable";
import { type GitRepo, parseRepos, statusScript } from "./git-status";

const pollIntervalMs = 5000;
// What others sent is asked for now and then, since that goes over the network.
const fetchIntervalMs = 3 * 60 * 1000;

export const directoryOf = (library: string, folder: string) => (folder ? `${library}/${folder}` : library);

// The folders of the library that are git repositories, and how each stands against its remote:
// read again every few seconds while something shows them, and fetched from now and then.
export const gitReposInjectable = getInjectable2({
  id: "lens-glance-git-repos",

  instantiate: (di) => {
    const runGit = di.inject(gitCommandInjectable)();
    const getDirectory = di.inject(dashboardsDirectoryInjectable);
    const repos = observable.box<readonly GitRepo[]>([], { deep: false, equals: comparer.structural });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let watching = false;
    let fetchedAt = 0;

    const fetchAll = async (library: string, found: readonly GitRepo[]) => {
      for (const repo of found) {
        // A sync stopped at a conflict is left as it is until the user goes on with it.
        if (repo.remote && !repo.rebasing) {
          await runGit(directoryOf(library, repo.folder), "git fetch -q origin").catch(() => undefined);
        }
      }
    };

    const read = async (): Promise<void> => {
      clearTimeout(timer);

      try {
        const library = await getDirectory();
        const found = parseRepos((await runGit(library, statusScript)).output);

        runInAction(() => repos.set(found));

        if (watching && Date.now() - fetchedAt > fetchIntervalMs) {
          fetchedAt = Date.now();
          await fetchAll(library, found);

          return read();
        }
      } catch {
        // Read again on the next round, such as once the library's folder exists.
      } finally {
        if (watching) {
          clearTimeout(timer);
          timer = setTimeout(() => void read(), pollIntervalMs);
        }
      }
    };

    onBecomeObserved(repos, () => {
      watching = true;
      void read();
    });

    onBecomeUnobserved(repos, () => {
      watching = false;
      clearTimeout(timer);
    });

    const all = computed(() => repos.get());

    const gitRepos = {
      repos: all,
      /** The repository that is this folder, if it is one. */
      repoAt: (folder: string) => all.get().find((repo) => repo.folder === folder),
      /** Reads again now, after a sync changed how the repositories stand. */
      refresh: read,
    };

    return () => gitRepos;
  },
});
