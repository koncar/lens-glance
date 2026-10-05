import { useCloseDropDownMenu } from "@k8slens/drop-down-menu-contracts";
import { DropDownMenuItemRow, DropDownMenuSeparator } from "@k8slens/drop-down-menu-items";
import { AutoRenewIcon, LinkOffIcon, OpenInBrowserIcon, ReplayIcon } from "@k8slens/icon";
import {
  getNavigatorItemMenuItemInjectableBunch,
  navigatorItemDropDownMenuOrderNumbers,
} from "@k8slens/navigator-contracts";
import { useSyncInject } from "@k8slens/use-inject";
import { observer } from "mobx-react";
import { fleetFolder } from "../fleet/fleet-settings.injectable";
import {
  dashboardFolderKind,
  dashboardsRootKind,
  fleetFolderKind,
  fleetRootKind,
} from "../navigator/dashboards-navigator.injectable";
import { gitReposInjectable } from "./git-repos.injectable";
import { holdsRepo, repoGoverning, webPageOf } from "./git-status";
import { gitSyncInjectable } from "./git-sync.injectable";

// The git rows of a folder's menu: to sync it with a repository, or, once it is one, to sync,
// cancel a sync stopped at a conflict, open the repository's page, or stop syncing. A folder in a
// synced one is synced with it, and a folder holding synced ones is synced through them.
const GitRows = observer(({ folder, isRoot }: { readonly folder: string; readonly isRoot: boolean }) => {
  const gitRepos = useSyncInject(gitReposInjectable);
  const gitSync = useSyncInject(gitSyncInjectable);
  const close = useCloseDropDownMenu();
  const repos = gitRepos.repos.get();
  const repo = gitRepos.repoAt(folder);
  const running = (act: () => Promise<void>) => () => {
    close();
    void act();
  };

  if (!repo) {
    return repoGoverning(repos, folder) || (!isRoot && holdsRepo(repos, folder)) ? null : (
      <>
        <DropDownMenuSeparator />
        <DropDownMenuItemRow Icon={AutoRenewIcon} $onClick={running(() => gitSync.connect(folder, isRoot))}>
          Sync with a git repository…
        </DropDownMenuItemRow>
      </>
    );
  }

  return (
    <>
      <DropDownMenuSeparator />
      <DropDownMenuItemRow Icon={AutoRenewIcon} $onClick={running(() => gitSync.sync(folder))}>
        Sync now
      </DropDownMenuItemRow>
      {repo.rebasing && (
        <DropDownMenuItemRow Icon={ReplayIcon} $onClick={running(() => gitSync.cancelSync(folder))}>
          Cancel the sync
        </DropDownMenuItemRow>
      )}
      {webPageOf(repo.remote) && (
        <DropDownMenuItemRow Icon={OpenInBrowserIcon} $onClick={running(() => gitSync.openRepository(folder))}>
          Open the repository
        </DropDownMenuItemRow>
      )}
      <DropDownMenuItemRow Icon={LinkOffIcon} $onClick={running(() => gitSync.stopSyncing(folder))}>
        Stop syncing…
      </DropDownMenuItemRow>
    </>
  );
});

const orderNumber = navigatorItemDropDownMenuOrderNumbers.sectionEnd + 60;

export const gitRowsInDashboardsBunch = getNavigatorItemMenuItemInjectableBunch({
  id: "lens-glance-git-rows-in-dashboards",
  forItemsOfKind: dashboardsRootKind,
  orderNumber,
  Component: () => <GitRows folder="" isRoot />,
});

export const gitRowsInFolderBunch = getNavigatorItemMenuItemInjectableBunch({
  id: "lens-glance-git-rows-in-folder",
  forItemsOfKind: dashboardFolderKind,
  orderNumber,
  Component: ({ data }) => <GitRows folder={data.ids[2]} isRoot={false} />,
});

export const gitRowsInFleetBunch = getNavigatorItemMenuItemInjectableBunch({
  id: "lens-glance-git-rows-in-fleet",
  forItemsOfKind: fleetRootKind,
  orderNumber,
  Component: () => <GitRows folder={fleetFolder} isRoot />,
});

export const gitRowsInFleetFolderBunch = getNavigatorItemMenuItemInjectableBunch({
  id: "lens-glance-git-rows-in-fleet-folder",
  forItemsOfKind: fleetFolderKind,
  orderNumber,
  Component: ({ data }) => <GitRows folder={data.ids[1]} isRoot={false} />,
});
