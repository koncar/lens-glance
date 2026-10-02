import {
  getDropDownMenuItemInjectableBunch,
  getDropDownMenuKind,
  useCloseDropDownMenu,
} from "@k8slens/drop-down-menu-contracts";
import { DropDownMenuItemRow } from "@k8slens/drop-down-menu-items";
import { ContentCopyIcon, DownloadIcon } from "@k8slens/icon";
import { useSyncInject } from "@k8slens/use-inject";
import { exportDashboardInjectable } from "./export-dashboard.injectable";

export interface ShareMenuData {
  readonly fileName: string;
}

// What the share button of a dashboard's header offers: its file, to pass on.
export const shareMenuKind = getDropDownMenuKind<ShareMenuData>()("lens-glance-share-menu");

export const CopyJsonRow = ({ fileName }: ShareMenuData) => {
  const { copyJson } = useSyncInject(exportDashboardInjectable);
  const close = useCloseDropDownMenu();

  return (
    <DropDownMenuItemRow
      Icon={ContentCopyIcon}
      $onClick={() => {
        close();
        void copyJson(fileName);
      }}
    >
      Copy JSON
    </DropDownMenuItemRow>
  );
};

export const SaveToDownloadsRow = ({ fileName }: ShareMenuData) => {
  const { saveToDownloads } = useSyncInject(exportDashboardInjectable);
  const close = useCloseDropDownMenu();

  return (
    <DropDownMenuItemRow
      Icon={DownloadIcon}
      $onClick={() => {
        close();
        void saveToDownloads(fileName);
      }}
    >
      Save to Downloads
    </DropDownMenuItemRow>
  );
};

const CopyJson = ({ data }: { readonly data: ShareMenuData }) => <CopyJsonRow fileName={data.fileName} />;

const SaveToDownloads = ({ data }: { readonly data: ShareMenuData }) => <SaveToDownloadsRow fileName={data.fileName} />;

export const copyJsonMenuItemBunch = getDropDownMenuItemInjectableBunch({
  id: "lens-glance-share-menu-copy-json",
  kind: shareMenuKind,
  orderNumber: 10,
  Component: CopyJson,
});

export const saveToDownloadsMenuItemBunch = getDropDownMenuItemInjectableBunch({
  id: "lens-glance-share-menu-save-to-downloads",
  kind: shareMenuKind,
  orderNumber: 20,
  Component: SaveToDownloads,
});
