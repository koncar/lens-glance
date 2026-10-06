import { openLinkInBrowserInjectionToken } from "@k8slens/electron-contracts";
import { getInjectable2 } from "@k8slens/injectable";
import { openModalInjectionToken } from "@k8slens/modal-contracts";
import {
  showErrorNotificationInjectionToken,
  showInfoNotificationInjectionToken,
  showSuccessNotificationInjectionToken,
} from "@k8slens/notifications-contracts";
import { observable, runInAction } from "mobx";
import { dashboardLibraryInjectable } from "../dashboard-files/dashboard-library.injectable";
import { dashboardsDirectoryInjectable } from "../dashboard-files/dashboards-directory.injectable";
import { fleetFolder } from "../fleet/fleet-settings.injectable";
import { askInjectable } from "../modals/dashboard-modals.injectable";
import { hostFilesInjectable } from "../platform/host-files.injectable";
import { connectRepoModalKind } from "./connect-repo-modal.injectable";
import { gitCommandInjectable } from "./git-command.injectable";
import { directoryOf, gitReposInjectable } from "./git-repos.injectable";
import { excludedAtTheTop, excludedEverywhere, gitErrorOf, webPageOf } from "./git-status";

/** What a folder of the library is called where the user reads it. */
export const labelOfFolder = (folder: string) =>
  folder === "" ? "the library" : folder === fleetFolder ? "Fleet dashboards" : folder;

// At the start of a sentence: a folder keeps its own name, the library takes a capital.
const capitalized = (label: string) => (label === "the library" ? "The library" : label);

// A failure already worded for the user.
class SyncError extends Error {}

const conflictMarkers = /^(<<<<<<<|>>>>>>>) /m;

const lines = (output: string) =>
  output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const isConflict = (output: string) => /CONFLICT|could not apply/i.test(output);

// Sharing dashboards through git: a folder of the library, or all of it, is a repository the
// team can reach. Syncing commits what changed here, takes what others sent and sends what is
// new, with the user's own git and its sign-in. A file changed on both sides stops the sync at
// it: it shows its last version without problems until it is fixed, by hand or by the agent,
// and the next sync goes on from there.
export const gitSyncInjectable = getInjectable2({
  id: "lens-glance-git-sync",
  consumptions: [
    openModalInjectionToken,
    openLinkInBrowserInjectionToken,
    showSuccessNotificationInjectionToken,
    showInfoNotificationInjectionToken,
    showErrorNotificationInjectionToken,
  ],

  instantiate: (di) => {
    const runGit = di.inject(gitCommandInjectable)();
    const files = di.inject(hostFilesInjectable)();
    const gitRepos = di.inject(gitReposInjectable)();
    const getDirectory = di.inject(dashboardsDirectoryInjectable);
    const library = di.inject(dashboardLibraryInjectable)();
    const askToConnect = di.inject(openModalInjectionToken.for(connectRepoModalKind).for(di.scopeIds))();
    const { askToConfirm } = di.inject(askInjectable)();
    const openLinkInBrowser = di.inject(openLinkInBrowserInjectionToken)();
    const showSuccessNotification = di.inject(showSuccessNotificationInjectionToken)();
    const showInfoNotification = di.inject(showInfoNotificationInjectionToken)();
    const showErrorNotification = di.inject(showErrorNotificationInjectionToken)();
    const busy = observable.set<string>();

    const gitOk = async (directory: string, args: readonly string[], doing: string) => {
      const result = await runGit(directory, args);

      if (result.code !== 0) {
        throw new SyncError(gitErrorOf(doing, result.output));
      }

      return result.output;
    };

    const isRebasing = (directory: string) =>
      files.exists(`${directory}/.git/rebase-merge`, `${directory}/.git/rebase-apply`);

    // Lens's files and the agent's stay out of the repository, in its own exclude file, so
    // nothing of the team's repository is changed for them.
    const excludeOwnFiles = async (directory: string, isLibrary: boolean) => {
      const excludeFile = `${directory}/.git/info/exclude`;
      const excluded = (await files.read(excludeFile)) ?? "";
      const present = new Set(lines(excluded));
      const missing = [...excludedEverywhere, ...(isLibrary ? excludedAtTheTop : [])].filter(
        (pattern) => !present.has(pattern),
      );

      if (missing.length) {
        const separated = excluded && !excluded.endsWith("\n") ? `${excluded}\n` : excluded;

        await files.write(excludeFile, `${separated}${missing.join("\n")}\n`);
      }
    };

    const conflictedIn = async (directory: string, doing: string) =>
      lines(await gitOk(directory, ["diff", "--name-only", "--diff-filter=U"], doing));

    const stoppedAtConflict = async (directory: string, folder: string) => {
      const conflicted = await conflictedIn(directory, "read the conflict");

      showInfoNotification(
        `Syncing ${labelOfFolder(folder)} stopped at ${conflicted.join(", ") || "a conflict"}: changed both here and in the repository. Until it is fixed, the dashboard shows its last version without problems. Fix it, by hand or with the agent, then Sync again, or cancel the sync to go back to yours.`,
      );
    };

    // Commits what changed here, takes what others sent on top of it, and sends the lot.
    const syncIn = async (directory: string, folder: string) => {
      const doing = `sync ${labelOfFolder(folder)}`;

      await excludeOwnFiles(directory, folder === "");

      // A sync stopped at a conflict goes on once its files hold no conflict markers.
      if (await isRebasing(directory)) {
        const unresolved: string[] = [];

        for (const file of await conflictedIn(directory, doing)) {
          if (conflictMarkers.test((await files.read(`${directory}/${file}`)) ?? "")) {
            unresolved.push(file);
          }
        }

        if (unresolved.length) {
          throw new SyncError(
            `Could not ${doing}: ${unresolved.join(", ")} still ${unresolved.length === 1 ? "has" : "have"} conflict markers. Fix them first, or cancel the sync.`,
          );
        }

        await gitOk(directory, ["add", "-A"], doing);

        const goneOn = await runGit(directory, ["rebase", "--continue"]);

        if (goneOn.code !== 0) {
          if (isConflict(goneOn.output)) {
            return stoppedAtConflict(directory, folder);
          }

          throw new SyncError(gitErrorOf(doing, goneOn.output));
        }
      }

      await gitOk(directory, ["add", "-A"], doing);

      const changed = lines(await gitOk(directory, ["diff", "--cached", "--name-only"], doing));

      if (changed.length) {
        await gitOk(
          directory,
          ["commit", "-q", "-m", "Update dashboards from Lens Glance", "-m", changed.join(", ")],
          doing,
        );
      }

      const branch = await gitOk(directory, ["symbolic-ref", "--short", "HEAD"], doing);

      await gitOk(directory, ["fetch", "-q", "origin"], doing);

      const remoteBranch = `origin/${branch}`;
      const remoteHasBranch = (await runGit(directory, ["rev-parse", "-q", "--verify", remoteBranch])).code === 0;
      let taken = 0;

      if (remoteHasBranch) {
        taken = Number(await gitOk(directory, ["rev-list", "--count", `HEAD..${remoteBranch}`], doing)) || 0;

        const rebased = await runGit(directory, ["rebase", "-q", remoteBranch]);

        if (rebased.code !== 0) {
          if (isConflict(rebased.output)) {
            return stoppedAtConflict(directory, folder);
          }

          throw new SyncError(gitErrorOf(doing, rebased.output));
        }
      }

      // A repository the remote has no branch of yet sends its first commit, when it has one.
      const hasCommits = (await runGit(directory, ["rev-parse", "-q", "--verify", "HEAD"])).code === 0;
      const toSend = remoteHasBranch
        ? Number(await gitOk(directory, ["rev-list", "--count", `${remoteBranch}..HEAD`], doing)) || 0
        : hasCommits
          ? 1
          : 0;

      if (toSend) {
        await gitOk(directory, ["push", "-q", "-u", "origin", branch], doing);
      }

      showSuccessNotification(
        taken || toSend
          ? `Synced ${labelOfFolder(folder)}: ${[...(taken ? [`took ${taken} ${taken === 1 ? "change" : "changes"} from the repository`] : []), ...(toSend ? ["sent yours"] : [])].join(", ")}.`
          : `${capitalized(labelOfFolder(folder))} is up to date with the repository.`,
      );
    };

    const isEmpty = async (directory: string) =>
      (await files.entries(directory)).filter((name) => name !== ".DS_Store").length === 0;

    // A folder with nothing in it takes the repository as it is. One with dashboards already
    // becomes a repository of its own, its dashboards put on top of what the repository has.
    const connectIn = async (directory: string, folder: string, url: string) => {
      const doing = `sync ${labelOfFolder(folder)} with ${url}`;

      if (await isEmpty(directory)) {
        const parent = directory.slice(0, Math.max(directory.lastIndexOf("/"), directory.lastIndexOf("\\")));

        await files.makeDirectory(parent);
        await gitOk(parent, ["clone", "-q", url, files.native(directory)], doing);
        await excludeOwnFiles(directory, folder === "");
        showSuccessNotification(`${capitalized(labelOfFolder(folder))} is synced with ${url}.`);

        return;
      }

      await gitOk(directory, ["init", "-q"], doing);

      try {
        await gitOk(directory, ["remote", "add", "origin", url], doing);
        await gitOk(directory, ["fetch", "-q", "origin"], doing);
      } catch (error) {
        // Nothing was shared yet: the folder is left as it was.
        await files.removeTree(`${directory}/.git`);
        throw error;
      }

      await excludeOwnFiles(directory, folder === "");

      const remoteHead = await gitOk(directory, ["ls-remote", "--symref", "origin", "HEAD"], doing);
      const branch = /^ref: refs\/heads\/(\S+)\s+HEAD$/m.exec(remoteHead)?.[1] ?? "main";

      await gitOk(directory, ["symbolic-ref", "HEAD", `refs/heads/${branch}`], doing);
      await gitOk(directory, ["add", "-A"], doing);
      await gitOk(directory, ["commit", "-q", "-m", "Dashboards from Lens Glance"], doing);

      if ((await runGit(directory, ["rev-parse", "-q", "--verify", `origin/${branch}`])).code === 0) {
        const rebased = await runGit(directory, ["rebase", "-q", `origin/${branch}`]);

        if (rebased.code !== 0) {
          if (isConflict(rebased.output)) {
            return stoppedAtConflict(directory, folder);
          }

          throw new SyncError(gitErrorOf(doing, rebased.output));
        }
      }

      await gitOk(directory, ["push", "-q", "-u", "origin", branch], doing);
      showSuccessNotification(`${capitalized(labelOfFolder(folder))} is synced with ${url}.`);
    };

    // One thing at a time in a folder, reported as it ends, and the library read again after.
    const working =
      <Args extends unknown[]>(act: (directory: string, folder: string, ...args: Args) => Promise<void>) =>
      async (folder: string, ...args: Args) => {
        if (busy.has(folder)) {
          return;
        }

        runInAction(() => busy.add(folder));

        try {
          await act(directoryOf(await getDirectory(), folder), folder, ...args);
        } catch (error) {
          showErrorNotification(
            error instanceof SyncError ? error.message : `Could not sync: ${(error as Error).message ?? error}`,
          );
        } finally {
          runInAction(() => busy.delete(folder));
          await Promise.all([gitRepos.refresh(), library.refresh()]);
        }
      };

    const sync = working(syncIn);

    const gitSync = {
      /** Whether something is being done in the folder now. Read under an observer to follow it. */
      isBusy: (folder: string) => busy.has(folder),

      sync,

      syncAll: async () => {
        await gitRepos.refresh();
        await Promise.all(gitRepos.repos.get().map((repo) => sync(repo.folder)));
      },

      /** Asks for the repository, and for where it goes when started from the top of a library. */
      connect: async (folder: string, isRoot: boolean) => {
        const answer = await askToConnect(folder, isRoot);

        if (answer) {
          await working(connectIn)(answer.folder, answer.url);
        }
      },

      cancelSync: working(async (directory, folder) => {
        if (!(await isRebasing(directory))) {
          showInfoNotification(
            `No sync of ${labelOfFolder(folder)} is stopped at a conflict: there is nothing to cancel.`,
          );

          return;
        }

        await gitOk(directory, ["rebase", "--abort"], `cancel the sync of ${labelOfFolder(folder)}`);
        showInfoNotification(`The sync of ${labelOfFolder(folder)} is cancelled: its dashboards are as you had them.`);
      }),

      openRepository: async (folder: string) => {
        const page = webPageOf(gitRepos.repoAt(folder)?.remote);

        if (page) {
          await openLinkInBrowser(page).catch((error: Error) => showErrorNotification(error.message));
        }
      },

      stopSyncing: working(async (directory, folder) => {
        const confirmed = await askToConfirm(
          "Stop syncing",
          `Stop syncing ${labelOfFolder(folder)} with its repository? Its dashboards stay as they are here; what was not sent yet is not sent.`,
          "Stop syncing",
        );

        if (confirmed) {
          if (await isRebasing(directory)) {
            await runGit(directory, ["rebase", "--abort"]);
          }

          await files.removeTree(`${directory}/.git`);
        }
      }),
    };

    return () => gitSync;
  },
});
