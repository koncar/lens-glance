import { clusterNavigatorItemKind } from "@k8slens/cluster-contracts";
import { useCloseDropDownMenu } from "@k8slens/drop-down-menu-contracts";
import { DropDownMenuItemRow, DropDownMenuSeparator } from "@k8slens/drop-down-menu-items";
import {
  AddIcon,
  LayersIcon,
  SettingsIcon,
  CreateNewFolderIcon,
  DashboardIcon,
  DeleteIcon,
  EditIcon,
  FolderIcon,
  FolderOpenIcon,
  OpenInBrowserIcon,
  UploadFileIcon,
} from "@k8slens/icon";
import { Button } from "@k8slens/element-components";
import {
  NavigatorBranchIndicator,
  NavigatorItemActions,
  NavigatorItemIcon,
  navigatorItemIconSize,
  NavigatorItemLabel,
  NavigatorLeafIndicator,
} from "@k8slens/navigator-components";
import {
  getNavigatorItemKind,
  getNavigatorItemKindInjectableBunch,
  getNavigatorItemMenuItemInjectableBunch,
  type NavigatorItemOfKind,
  navigatorRootKind,
  navigatorItemDropDownMenuOrderNumbers,
  type NavigatorItemProps,
  useItemHasChildren,
  useItemIsOpen,
} from "@k8slens/navigator-contracts";
import { useSyncInject } from "@k8slens/use-inject";
import { computed } from "mobx";
import { observer } from "mobx-react";
import { dashboardLibraryInjectable } from "../dashboard-files/dashboard-library.injectable";
import { openFleetPreferencesInjectable } from "../fleet/fleet-menus.injectable";
import { fleetFolder, fleetScope } from "../fleet/fleet-settings.injectable";
import { LookForHubs } from "../fleet/hub-discovery.injectable";
import { dashboardPinsInjectable } from "../hotbar/dashboard-pins.injectable";
import { importDashboardInjectable } from "../sharing/import-dashboard.injectable";
import type { ImportTarget } from "../sharing/import-draft";
import { CopyJsonRow, SaveToDownloadsRow } from "../sharing/share-menu.injectable";
import { PinIcon, UnpinIcon } from "../ui/pin-icons";
import { navigatorActionsInjectable } from "./navigator-actions.injectable";

interface TreeItem {
  readonly id: string;
  readonly name: string;
  readonly orderNumber: number;
}

interface DashboardItem extends TreeItem {
  readonly path: string;
}

// The library of dashboards under every cluster, as Grafana lists them: "Dashboards", the
// folders in it, and the dashboards in each. Whichever cluster it is opened under, a dashboard
// shows that cluster's metrics.
export const dashboardsRootKind = getNavigatorItemKind<TreeItem, [clusterId: string]>()("dashboards");
export const dashboardFolderKind = getNavigatorItemKind<TreeItem, [clusterId: string, rootId: string]>()(
  "dashboard-folder",
);
export const topDashboardKind = getNavigatorItemKind<DashboardItem, [clusterId: string, rootId: string]>()("dashboard");
export const folderDashboardKind = getNavigatorItemKind<
  DashboardItem,
  [clusterId: string, rootId: string, folder: string]
>()("dashboard-in-folder");

const rootItems = computed((): TreeItem[] => [{ id: "dashboards", name: "Dashboards", orderNumber: 5 }]);

const isFleetPath = (path: string) => path === fleetFolder || path.startsWith(`${fleetFolder}/`);

// Fleet dashboards, which are no one cluster's: at the top of the navigator, in a folder of the
// library of their own, each drawn from a data source rather than a cluster. The root's id is
// the scope their tabs open in, so the rows and menus of dashboards serve them as they are.
export const fleetRootKind = getNavigatorItemKind<TreeItem, []>()("fleet-dashboards");
export const fleetFolderKind = getNavigatorItemKind<TreeItem, [rootId: string]>()("fleet-dashboard-folder");
export const fleetTopDashboardKind = getNavigatorItemKind<DashboardItem, [rootId: string]>()("fleet-dashboard");
export const fleetFolderDashboardKind = getNavigatorItemKind<DashboardItem, [rootId: string, folder: string]>()(
  "fleet-dashboard-in-folder",
);

const fleetRootItems = computed((): TreeItem[] => [{ id: fleetScope, name: "Fleet dashboards", orderNumber: 900 }]);

// The "+" at the end of a row the library's dashboards are made in: asks for a name, and opens
// the new dashboard with its agent. Lens's own row actions show at all times, and so does this.
// Its `$onClick` takes the click, so the row is not opened or closed by it too.
const NewDashboardAction = ({ clusterId, folder }: { readonly clusterId: string; readonly folder: string }) => {
  const { newDashboard } = useSyncInject(navigatorActionsInjectable);

  return (
    <NavigatorItemActions>
      <Button
        $interactive
        $flex={{ verticalAlign: "center" }}
        $tooltip="New dashboard"
        $onClick={() => void newDashboard(clusterId, folder)}
      >
        <AddIcon $size={{ size: "s", min: "s" }} />
      </Button>
    </NavigatorItemActions>
  );
};

const DashboardsRootRow = ({ kind, ids, item }: NavigatorItemProps<TreeItem, typeof clusterNavigatorItemKind>) => {
  const isOpen = useItemIsOpen(kind, ...ids);
  const hasChildren = useItemHasChildren(kind, ...ids);

  return (
    <>
      {hasChildren ? <NavigatorBranchIndicator isOpen={isOpen} /> : <NavigatorLeafIndicator />}
      <NavigatorItemIcon>
        <DashboardIcon $size={navigatorItemIconSize} />
      </NavigatorItemIcon>
      <NavigatorItemLabel>{item.name}</NavigatorItemLabel>
      <NewDashboardAction clusterId={ids[0]} folder="" />
    </>
  );
};

const FleetRootRow = ({ kind, ids, item }: NavigatorItemProps<TreeItem, typeof navigatorRootKind>) => {
  const isOpen = useItemIsOpen(kind, ...ids);
  const hasChildren = useItemHasChildren(kind, ...ids);

  return (
    <>
      {hasChildren ? <NavigatorBranchIndicator isOpen={isOpen} /> : <NavigatorLeafIndicator />}
      <NavigatorItemIcon>
        <LayersIcon $size={navigatorItemIconSize} />
      </NavigatorItemIcon>
      <NavigatorItemLabel>{item.name}</NavigatorItemLabel>
      <NewDashboardAction clusterId={fleetScope} folder={fleetFolder} />
      {/* Opened, the fleet's dashboards look for hubs in the connected clusters. */}
      {isOpen && <LookForHubs />}
    </>
  );
};

const FleetFolderRow = ({ kind, ids, item }: NavigatorItemProps<TreeItem, typeof fleetRootKind>) => {
  const isOpen = useItemIsOpen(kind, ...ids);
  const hasChildren = useItemHasChildren(kind, ...ids);

  return (
    <>
      {hasChildren ? <NavigatorBranchIndicator isOpen={isOpen} /> : <NavigatorLeafIndicator />}
      <NavigatorItemIcon>
        {isOpen ? <FolderOpenIcon $size={navigatorItemIconSize} /> : <FolderIcon $size={navigatorItemIconSize} />}
      </NavigatorItemIcon>
      <NavigatorItemLabel>{item.name}</NavigatorItemLabel>
      <NewDashboardAction clusterId={fleetScope} folder={ids[1]} />
    </>
  );
};

const FolderRow = ({ kind, ids, item }: NavigatorItemProps<TreeItem, typeof dashboardsRootKind>) => {
  const isOpen = useItemIsOpen(kind, ...ids);
  const hasChildren = useItemHasChildren(kind, ...ids);

  return (
    <>
      {hasChildren ? <NavigatorBranchIndicator isOpen={isOpen} /> : <NavigatorLeafIndicator />}
      <NavigatorItemIcon>
        {isOpen ? <FolderOpenIcon $size={navigatorItemIconSize} /> : <FolderIcon $size={navigatorItemIconSize} />}
      </NavigatorItemIcon>
      <NavigatorItemLabel>{item.name}</NavigatorItemLabel>
      <NewDashboardAction clusterId={ids[0]} folder={ids[2]} />
    </>
  );
};

const DashboardRow = ({ ids, item }: { readonly ids: readonly string[]; readonly item: DashboardItem }) => {
  const { open } = useSyncInject(navigatorActionsInjectable);

  return (
    <>
      <NavigatorLeafIndicator />
      <NavigatorItemIcon>
        <DashboardIcon $size={navigatorItemIconSize} />
      </NavigatorItemIcon>
      <NavigatorItemLabel onClick={() => void open(ids[0], item.path)}>{item.name}</NavigatorItemLabel>
    </>
  );
};

const TopDashboardRow = ({ ids, item }: NavigatorItemProps<DashboardItem, typeof dashboardsRootKind>) => (
  <DashboardRow ids={ids} item={item} />
);

const FolderDashboardRow = ({ ids, item }: NavigatorItemProps<DashboardItem, typeof dashboardFolderKind>) => (
  <DashboardRow ids={ids} item={item} />
);

const FleetTopDashboardRow = ({ ids, item }: NavigatorItemProps<DashboardItem, typeof fleetRootKind>) => (
  <DashboardRow ids={ids} item={item} />
);

const FleetFolderDashboardRow = ({ ids, item }: NavigatorItemProps<DashboardItem, typeof fleetFolderKind>) => (
  <DashboardRow ids={ids} item={item} />
);

export const dashboardsRootBunch = getNavigatorItemKindInjectableBunch({
  kind: dashboardsRootKind,
  parentKind: clusterNavigatorItemKind,
  description: "The library of dashboards, under every cluster.",
  items: { instantiate: () => async () => rootItems },
  Component: DashboardsRootRow,
});

export const dashboardFolderBunch = getNavigatorItemKindInjectableBunch({
  kind: dashboardFolderKind,
  parentKind: dashboardsRootKind,
  description: "A folder of dashboards in the library.",
  items: {
    instantiate: (di) => {
      const { library } = di.inject(dashboardLibraryInjectable)();

      return async () =>
        computed(() =>
          library
            .get()
            .folders.filter((folder) => !isFleetPath(folder))
            .map((folder, index): TreeItem => ({ id: folder, name: folder, orderNumber: 10 + index })),
        );
    },
  },
  Component: FolderRow,
});

export const topDashboardBunch = getNavigatorItemKindInjectableBunch({
  kind: topDashboardKind,
  parentKind: dashboardsRootKind,
  description: "A dashboard at the top of the library.",
  items: {
    instantiate: (di) => {
      const { library } = di.inject(dashboardLibraryInjectable)();

      return async () =>
        computed(() =>
          library
            .get()
            .dashboards.filter((dashboard) => dashboard.folder === "")
            .map((dashboard, index): DashboardItem => ({
              id: dashboard.path,
              name: dashboard.name,
              path: dashboard.path,
              orderNumber: 1000 + index,
            })),
        );
    },
  },
  Component: TopDashboardRow,
});

export const folderDashboardBunch = getNavigatorItemKindInjectableBunch({
  kind: folderDashboardKind,
  parentKind: dashboardFolderKind,
  description: "A dashboard in a folder of the library.",
  items: {
    instantiate: (di) => {
      const { library } = di.inject(dashboardLibraryInjectable)();

      return async (_clusterId, _rootId, folder) =>
        computed(() =>
          library
            .get()
            .dashboards.filter((dashboard) => dashboard.folder === folder)
            .map((dashboard, index): DashboardItem => ({
              id: dashboard.path,
              name: dashboard.name,
              path: dashboard.path,
              orderNumber: index,
            })),
        );
    },
  },
  Component: FolderDashboardRow,
});

export const fleetRootBunch = getNavigatorItemKindInjectableBunch({
  kind: fleetRootKind,
  parentKind: navigatorRootKind,
  description: "Dashboards of the whole fleet, drawn from a data source rather than one cluster.",
  items: { instantiate: () => async () => fleetRootItems },
  Component: FleetRootRow,
});

export const fleetFolderBunch = getNavigatorItemKindInjectableBunch({
  kind: fleetFolderKind,
  parentKind: fleetRootKind,
  description: "A folder of fleet dashboards.",
  items: {
    instantiate: (di) => {
      const { library } = di.inject(dashboardLibraryInjectable)();

      return async () =>
        computed(() =>
          library
            .get()
            .folders.filter((folder) => folder.startsWith(`${fleetFolder}/`))
            .map((folder, index): TreeItem => ({
              id: folder,
              name: folder.slice(fleetFolder.length + 1),
              orderNumber: 10 + index,
            })),
        );
    },
  },
  Component: FleetFolderRow,
});

export const fleetTopDashboardBunch = getNavigatorItemKindInjectableBunch({
  kind: fleetTopDashboardKind,
  parentKind: fleetRootKind,
  description: "A fleet dashboard at the top of the fleet's folder.",
  items: {
    instantiate: (di) => {
      const { library } = di.inject(dashboardLibraryInjectable)();

      return async () =>
        computed(() =>
          library
            .get()
            .dashboards.filter((dashboard) => dashboard.folder === fleetFolder)
            .map((dashboard, index): DashboardItem => ({
              id: dashboard.path,
              name: dashboard.name,
              path: dashboard.path,
              orderNumber: 1000 + index,
            })),
        );
    },
  },
  Component: FleetTopDashboardRow,
});

export const fleetFolderDashboardBunch = getNavigatorItemKindInjectableBunch({
  kind: fleetFolderDashboardKind,
  parentKind: fleetFolderKind,
  description: "A fleet dashboard in a folder.",
  items: {
    instantiate: (di) => {
      const { library } = di.inject(dashboardLibraryInjectable)();

      return async (_rootId, folder) =>
        computed(() =>
          library
            .get()
            .dashboards.filter((dashboard) => dashboard.folder === folder)
            .map((dashboard, index): DashboardItem => ({
              id: dashboard.path,
              name: dashboard.name,
              path: dashboard.path,
              orderNumber: index,
            })),
        );
    },
  },
  Component: FleetFolderDashboardRow,
});

// The rows of the menus a user right-clicks these open.

const menuOrder = navigatorItemDropDownMenuOrderNumbers.sectionEnd;

const NewDashboardInRoot = ({ data }: { readonly data: NavigatorItemOfKind<typeof dashboardsRootKind> }) => {
  const { newDashboard } = useSyncInject(navigatorActionsInjectable);
  const close = useCloseDropDownMenu();

  return (
    <DropDownMenuItemRow
      Icon={AddIcon}
      $onClick={() => {
        close();
        void newDashboard(data.ids[0], "");
      }}
    >
      New dashboard…
    </DropDownMenuItemRow>
  );
};

const NewFolderInRoot = () => {
  const { newFolder } = useSyncInject(navigatorActionsInjectable);
  const close = useCloseDropDownMenu();

  return (
    <DropDownMenuItemRow
      Icon={CreateNewFolderIcon}
      $onClick={() => {
        close();
        void newFolder("");
      }}
    >
      New folder…
    </DropDownMenuItemRow>
  );
};

const NewDashboardInFolder = ({ data }: { readonly data: NavigatorItemOfKind<typeof dashboardFolderKind> }) => {
  const { newDashboard } = useSyncInject(navigatorActionsInjectable);
  const close = useCloseDropDownMenu();

  return (
    <DropDownMenuItemRow
      Icon={AddIcon}
      $onClick={() => {
        close();
        void newDashboard(data.ids[0], data.ids[2]);
      }}
    >
      New dashboard…
    </DropDownMenuItemRow>
  );
};

const NewFolderInFolder = ({ data }: { readonly data: NavigatorItemOfKind<typeof dashboardFolderKind> }) => {
  const { newFolder } = useSyncInject(navigatorActionsInjectable);
  const close = useCloseDropDownMenu();

  return (
    <DropDownMenuItemRow
      Icon={CreateNewFolderIcon}
      $onClick={() => {
        close();
        void newFolder(data.ids[2]);
      }}
    >
      New folder…
    </DropDownMenuItemRow>
  );
};

// Imports a dashboard someone shared into the folder the menu was opened over; the cluster it
// was opened under, if any, is whose library is offered besides the fleet's.
const ImportDashboard = ({ target, clusterId }: { readonly target: ImportTarget; readonly clusterId?: string }) => {
  const importDashboard = useSyncInject(importDashboardInjectable);
  const close = useCloseDropDownMenu();

  return (
    <DropDownMenuItemRow
      Icon={UploadFileIcon}
      $onClick={() => {
        close();
        void importDashboard(target, clusterId);
      }}
    >
      Import dashboard…
    </DropDownMenuItemRow>
  );
};

const ImportInRoot = ({ data }: { readonly data: NavigatorItemOfKind<typeof dashboardsRootKind> }) => (
  <ImportDashboard target={{ clusterId: data.ids[0], folder: "" }} clusterId={data.ids[0]} />
);

const ImportInFolder = ({ data }: { readonly data: NavigatorItemOfKind<typeof dashboardFolderKind> }) => (
  <ImportDashboard target={{ clusterId: data.ids[0], folder: data.ids[2] }} clusterId={data.ids[0]} />
);

// Over the fleet's root, its folder; over one of its folders, that folder.
const ImportInFleet = ({ data }: { readonly data: { readonly ids: readonly string[] } }) => (
  <ImportDashboard target={{ clusterId: fleetScope, folder: data.ids[1] ?? fleetFolder }} />
);

const DeleteFolder = ({ data }: { readonly data: NavigatorItemOfKind<typeof dashboardFolderKind> }) => {
  const { deleteFolder } = useSyncInject(navigatorActionsInjectable);
  const close = useCloseDropDownMenu();

  return (
    <DropDownMenuItemRow
      Icon={DeleteIcon}
      $onClick={() => {
        close();
        void deleteFolder(data.ids[2]);
      }}
    >
      Delete folder
    </DropDownMenuItemRow>
  );
};

const dashboardMenuRows = (
  kind:
    | typeof topDashboardKind
    | typeof folderDashboardKind
    | typeof fleetTopDashboardKind
    | typeof fleetFolderDashboardKind,
  idPrefix: string,
) => {
  const pathOf = (ids: readonly string[]) => ids[ids.length - 1];

  const Open = ({ data }: { readonly data: NavigatorItemOfKind<typeof kind> }) => {
    const { open } = useSyncInject(navigatorActionsInjectable);
    const close = useCloseDropDownMenu();

    return (
      <DropDownMenuItemRow
        Icon={OpenInBrowserIcon}
        $onClick={() => {
          close();
          void open(data.ids[0], pathOf(data.ids));
        }}
      >
        Open
      </DropDownMenuItemRow>
    );
  };

  const Pin = observer(({ data }: { readonly data: NavigatorItemOfKind<typeof kind> }) => {
    const pins = useSyncInject(dashboardPinsInjectable);
    const close = useCloseDropDownMenu();
    const dashboard = { clusterId: data.ids[0], fileName: pathOf(data.ids) };
    const pinned = pins.isPinned(dashboard).get();

    return (
      <DropDownMenuItemRow
        Icon={pinned ? UnpinIcon : PinIcon}
        $onClick={() => {
          close();
          void pins.toggle(dashboard);
        }}
      >
        {pinned ? "Unpin from hotbar" : "Pin to hotbar"}
      </DropDownMenuItemRow>
    );
  });

  const Rename = ({ data }: { readonly data: NavigatorItemOfKind<typeof kind> }) => {
    const { renameDashboard } = useSyncInject(navigatorActionsInjectable);
    const close = useCloseDropDownMenu();

    return (
      <DropDownMenuItemRow
        Icon={EditIcon}
        $onClick={() => {
          close();
          void renameDashboard(pathOf(data.ids));
        }}
      >
        Rename…
      </DropDownMenuItemRow>
    );
  };

  const CopyJson = ({ data }: { readonly data: NavigatorItemOfKind<typeof kind> }) => (
    <CopyJsonRow fileName={pathOf(data.ids)} />
  );

  const SaveToDownloads = ({ data }: { readonly data: NavigatorItemOfKind<typeof kind> }) => (
    <SaveToDownloadsRow fileName={pathOf(data.ids)} />
  );

  const Delete = ({ data }: { readonly data: NavigatorItemOfKind<typeof kind> }) => {
    const { deleteDashboard } = useSyncInject(navigatorActionsInjectable);
    const close = useCloseDropDownMenu();

    return (
      <DropDownMenuItemRow
        Icon={DeleteIcon}
        $onClick={() => {
          close();
          void deleteDashboard(pathOf(data.ids));
        }}
      >
        Delete…
      </DropDownMenuItemRow>
    );
  };

  return [
    getNavigatorItemMenuItemInjectableBunch({
      id: `${idPrefix}-open`,
      forItemsOfKind: kind,
      orderNumber: menuOrder + 10,
      Component: Open,
    }),
    getNavigatorItemMenuItemInjectableBunch({
      id: `${idPrefix}-pin`,
      forItemsOfKind: kind,
      orderNumber: menuOrder + 15,
      Component: Pin,
    }),
    getNavigatorItemMenuItemInjectableBunch({
      id: `${idPrefix}-rename`,
      forItemsOfKind: kind,
      orderNumber: menuOrder + 20,
      Component: Rename,
    }),
    getNavigatorItemMenuItemInjectableBunch({
      id: `${idPrefix}-copy-json`,
      forItemsOfKind: kind,
      orderNumber: menuOrder + 22,
      Component: CopyJson,
    }),
    getNavigatorItemMenuItemInjectableBunch({
      id: `${idPrefix}-save-to-downloads`,
      forItemsOfKind: kind,
      orderNumber: menuOrder + 24,
      Component: SaveToDownloads,
    }),
    getNavigatorItemMenuItemInjectableBunch({
      id: `${idPrefix}-separator`,
      forItemsOfKind: kind,
      orderNumber: menuOrder + 30,
      Component: DropDownMenuSeparator,
    }),
    getNavigatorItemMenuItemInjectableBunch({
      id: `${idPrefix}-delete`,
      forItemsOfKind: kind,
      orderNumber: menuOrder + 40,
      Component: Delete,
    }),
  ];
};

export const [
  openTopDashboardBunch,
  pinTopDashboardBunch,
  renameTopDashboardBunch,
  copyJsonTopDashboardBunch,
  saveToDownloadsTopDashboardBunch,
  separatorTopDashboardBunch,
  deleteTopDashboardBunch,
] = dashboardMenuRows(topDashboardKind, "lens-glance-top-dashboard");

export const [
  openFolderDashboardBunch,
  pinFolderDashboardBunch,
  renameFolderDashboardBunch,
  copyJsonFolderDashboardBunch,
  saveToDownloadsFolderDashboardBunch,
  separatorFolderDashboardBunch,
  deleteFolderDashboardBunch,
] = dashboardMenuRows(folderDashboardKind, "lens-glance-folder-dashboard");

export const newDashboardInRootBunch = getNavigatorItemMenuItemInjectableBunch({
  id: "lens-glance-new-dashboard-in-root",
  forItemsOfKind: dashboardsRootKind,
  orderNumber: menuOrder + 10,
  Component: NewDashboardInRoot,
});

export const importInRootBunch = getNavigatorItemMenuItemInjectableBunch({
  id: "lens-glance-import-in-root",
  forItemsOfKind: dashboardsRootKind,
  orderNumber: menuOrder + 15,
  Component: ImportInRoot,
});

export const newFolderInRootBunch = getNavigatorItemMenuItemInjectableBunch({
  id: "lens-glance-new-folder-in-root",
  forItemsOfKind: dashboardsRootKind,
  orderNumber: menuOrder + 20,
  Component: NewFolderInRoot,
});

export const newDashboardInFolderBunch = getNavigatorItemMenuItemInjectableBunch({
  id: "lens-glance-new-dashboard-in-folder",
  forItemsOfKind: dashboardFolderKind,
  orderNumber: menuOrder + 10,
  Component: NewDashboardInFolder,
});

export const importInFolderBunch = getNavigatorItemMenuItemInjectableBunch({
  id: "lens-glance-import-in-folder",
  forItemsOfKind: dashboardFolderKind,
  orderNumber: menuOrder + 15,
  Component: ImportInFolder,
});

export const newFolderInFolderBunch = getNavigatorItemMenuItemInjectableBunch({
  id: "lens-glance-new-folder-in-folder",
  forItemsOfKind: dashboardFolderKind,
  orderNumber: menuOrder + 20,
  Component: NewFolderInFolder,
});

export const deleteFolderBunch = getNavigatorItemMenuItemInjectableBunch({
  id: "lens-glance-delete-folder",
  forItemsOfKind: dashboardFolderKind,
  orderNumber: menuOrder + 40,
  Component: DeleteFolder,
});

export const [
  openFleetTopDashboardBunch,
  pinFleetTopDashboardBunch,
  renameFleetTopDashboardBunch,
  copyJsonFleetTopDashboardBunch,
  saveToDownloadsFleetTopDashboardBunch,
  separatorFleetTopDashboardBunch,
  deleteFleetTopDashboardBunch,
] = dashboardMenuRows(fleetTopDashboardKind, "lens-glance-fleet-top-dashboard");

export const [
  openFleetFolderDashboardBunch,
  pinFleetFolderDashboardBunch,
  renameFleetFolderDashboardBunch,
  copyJsonFleetFolderDashboardBunch,
  saveToDownloadsFleetFolderDashboardBunch,
  separatorFleetFolderDashboardBunch,
  deleteFleetFolderDashboardBunch,
] = dashboardMenuRows(fleetFolderDashboardKind, "lens-glance-fleet-folder-dashboard");

const NewFleetDashboard = ({ data }: { readonly data: { readonly ids: readonly string[] } }) => {
  const { newDashboard } = useSyncInject(navigatorActionsInjectable);
  const close = useCloseDropDownMenu();
  // Over the fleet's root, its folder; over one of its folders, that folder.
  const folder = data.ids[1] ?? fleetFolder;

  return (
    <DropDownMenuItemRow
      Icon={AddIcon}
      $onClick={() => {
        close();
        void newDashboard(fleetScope, folder);
      }}
    >
      New fleet dashboard…
    </DropDownMenuItemRow>
  );
};

const NewFleetFolder = ({ data }: { readonly data: { readonly ids: readonly string[] } }) => {
  const { newFolder } = useSyncInject(navigatorActionsInjectable);
  const close = useCloseDropDownMenu();
  const parent = data.ids[1] ?? fleetFolder;

  return (
    <DropDownMenuItemRow
      Icon={CreateNewFolderIcon}
      $onClick={() => {
        close();
        void newFolder(parent);
      }}
    >
      New folder…
    </DropDownMenuItemRow>
  );
};

const DeleteFleetFolder = ({ data }: { readonly data: NavigatorItemOfKind<typeof fleetFolderKind> }) => {
  const { deleteFolder } = useSyncInject(navigatorActionsInjectable);
  const close = useCloseDropDownMenu();

  return (
    <DropDownMenuItemRow
      Icon={DeleteIcon}
      $onClick={() => {
        close();
        void deleteFolder(data.ids[1]);
      }}
    >
      Delete folder
    </DropDownMenuItemRow>
  );
};

const ManageDataSourcesRow = () => {
  const openPreferences = useSyncInject(openFleetPreferencesInjectable);
  const close = useCloseDropDownMenu();

  return (
    <DropDownMenuItemRow
      Icon={SettingsIcon}
      $onClick={() => {
        close();
        void openPreferences();
      }}
    >
      Data sources…
    </DropDownMenuItemRow>
  );
};

export const newFleetDashboardInRootBunch = getNavigatorItemMenuItemInjectableBunch({
  id: "lens-glance-new-fleet-dashboard-in-root",
  forItemsOfKind: fleetRootKind,
  orderNumber: menuOrder + 10,
  Component: NewFleetDashboard,
});

export const importInFleetRootBunch = getNavigatorItemMenuItemInjectableBunch({
  id: "lens-glance-import-in-fleet-root",
  forItemsOfKind: fleetRootKind,
  orderNumber: menuOrder + 15,
  Component: ImportInFleet,
});

export const newFleetFolderInRootBunch = getNavigatorItemMenuItemInjectableBunch({
  id: "lens-glance-new-fleet-folder-in-root",
  forItemsOfKind: fleetRootKind,
  orderNumber: menuOrder + 20,
  Component: NewFleetFolder,
});

export const manageDataSourcesInRootBunch = getNavigatorItemMenuItemInjectableBunch({
  id: "lens-glance-fleet-data-sources",
  forItemsOfKind: fleetRootKind,
  orderNumber: menuOrder + 30,
  Component: ManageDataSourcesRow,
});

export const newFleetDashboardInFolderBunch = getNavigatorItemMenuItemInjectableBunch({
  id: "lens-glance-new-fleet-dashboard-in-folder",
  forItemsOfKind: fleetFolderKind,
  orderNumber: menuOrder + 10,
  Component: NewFleetDashboard,
});

export const importInFleetFolderBunch = getNavigatorItemMenuItemInjectableBunch({
  id: "lens-glance-import-in-fleet-folder",
  forItemsOfKind: fleetFolderKind,
  orderNumber: menuOrder + 15,
  Component: ImportInFleet,
});

export const newFleetFolderInFolderBunch = getNavigatorItemMenuItemInjectableBunch({
  id: "lens-glance-new-fleet-folder-in-folder",
  forItemsOfKind: fleetFolderKind,
  orderNumber: menuOrder + 20,
  Component: NewFleetFolder,
});

export const deleteFleetFolderBunch = getNavigatorItemMenuItemInjectableBunch({
  id: "lens-glance-delete-fleet-folder",
  forItemsOfKind: fleetFolderKind,
  orderNumber: menuOrder + 40,
  Component: DeleteFleetFolder,
});
