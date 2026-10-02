import {
  getDropDownMenuItemInjectableBunch,
  getDropDownMenuKind,
  useCloseDropDownMenu,
} from "@k8slens/drop-down-menu-contracts";
import { DropDownMenuItemRow, DropDownMenuSeparator } from "@k8slens/drop-down-menu-items";
import { ContentCopyIcon, DeleteIcon, EditIcon, SubjectIcon } from "@k8slens/icon";
import { useSyncInject } from "@k8slens/use-inject";
import { dashboardViewModelInjectable } from "../dashboard-view/dashboard-view-model.injectable";
import { editActionsInjectable } from "./edit-actions.injectable";

export interface PanelMenuData {
  readonly clusterId: string;
  readonly fileName: string;
  readonly key: string;
  readonly groupIndex: number;
  /** Whether the dashboard is being edited by hand, which is when a panel can be changed from here. */
  readonly editing: boolean;
}

// The menu at the end of a panel's title bar: its queries always, and while the dashboard is
// edited by hand, what can be done to the panel.
export const panelMenuKind = getDropDownMenuKind<PanelMenuData>()("lens-glance-panel-menu");

const whileEditing = (data: PanelMenuData) => data.editing;

const ViewQueries = ({ data }: { readonly data: PanelMenuData }) => {
  const viewModel = useSyncInject(dashboardViewModelInjectable, data.clusterId, data.fileName);
  const close = useCloseDropDownMenu();

  return (
    <DropDownMenuItemRow
      Icon={SubjectIcon}
      $onClick={() => {
        close();
        viewModel.openEditor({ kind: "queries", key: data.key });
      }}
    >
      View queries
    </DropDownMenuItemRow>
  );
};

const Edit = ({ data }: { readonly data: PanelMenuData }) => {
  const viewModel = useSyncInject(dashboardViewModelInjectable, data.clusterId, data.fileName);
  const close = useCloseDropDownMenu();

  return (
    <DropDownMenuItemRow
      Icon={EditIcon}
      $onClick={() => {
        close();
        viewModel.openEditor({ kind: "panel", key: data.key, groupIndex: data.groupIndex });
      }}
    >
      Edit
    </DropDownMenuItemRow>
  );
};

const Duplicate = ({ data }: { readonly data: PanelMenuData }) => {
  const actions = useSyncInject(editActionsInjectable, data.clusterId, data.fileName);
  const close = useCloseDropDownMenu();

  return (
    <DropDownMenuItemRow
      Icon={ContentCopyIcon}
      $onClick={() => {
        close();
        void actions.duplicatePanel(data.key);
      }}
    >
      Duplicate
    </DropDownMenuItemRow>
  );
};

const Delete = ({ data }: { readonly data: PanelMenuData }) => {
  const actions = useSyncInject(editActionsInjectable, data.clusterId, data.fileName);
  const close = useCloseDropDownMenu();

  return (
    <DropDownMenuItemRow
      Icon={DeleteIcon}
      $onClick={() => {
        close();
        void actions.deletePanel(data.key);
      }}
    >
      Delete
    </DropDownMenuItemRow>
  );
};

export const viewQueriesMenuItemBunch = getDropDownMenuItemInjectableBunch({
  id: "lens-glance-panel-menu-view-queries",
  kind: panelMenuKind,
  orderNumber: 10,
  Component: ViewQueries,
});

export const editPanelMenuItemBunch = getDropDownMenuItemInjectableBunch({
  id: "lens-glance-panel-menu-edit",
  kind: panelMenuKind,
  orderNumber: 20,
  isVisible: whileEditing,
  Component: Edit,
});

export const duplicatePanelMenuItemBunch = getDropDownMenuItemInjectableBunch({
  id: "lens-glance-panel-menu-duplicate",
  kind: panelMenuKind,
  orderNumber: 30,
  isVisible: whileEditing,
  Component: Duplicate,
});

export const separatorPanelMenuItemBunch = getDropDownMenuItemInjectableBunch({
  id: "lens-glance-panel-menu-separator",
  kind: panelMenuKind,
  orderNumber: 40,
  isVisible: whileEditing,
  Component: DropDownMenuSeparator,
});

export const deletePanelMenuItemBunch = getDropDownMenuItemInjectableBunch({
  id: "lens-glance-panel-menu-delete",
  kind: panelMenuKind,
  orderNumber: 50,
  isVisible: whileEditing,
  Component: Delete,
});
