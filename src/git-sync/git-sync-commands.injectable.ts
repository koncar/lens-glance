import { getCommandInjectableBunch } from "@k8slens/command-palette-contracts";
import { computed } from "mobx";
import { inApplicationWindowInjectable } from "../dashboard-window/in-application-window.injectable";
import { gitReposInjectable } from "./git-repos.injectable";
import { gitSyncInjectable } from "./git-sync.injectable";

// Every synced folder at once, offered while there is one, in the application window.
export const syncWithGitCommandBunch = getCommandInjectableBunch({
  id: "lens-glance.sync-with-git",
  title: "Dashboards: Sync with git",

  isActive: {
    instantiate: (di) => {
      const inApplicationWindow = di.inject(inApplicationWindowInjectable)();
      const { repos } = di.inject(gitReposInjectable)();

      return () => computed(() => inApplicationWindow && repos.get().length > 0);
    },
  },

  action: {
    instantiate: (di) => () => () => di.inject(gitSyncInjectable)().syncAll(),
  },
});
