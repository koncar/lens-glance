import { Badge } from "@k8slens/badge";
import { dropDownMenu } from "@k8slens/drop-down-menu-contracts";
import { Button, type ButtonProps, Code, Div, H2, Span } from "@k8slens/element-components";
import {
  AccessTimeIcon,
  LayersIcon,
  StorageIcon,
  AddIcon,
  DescriptionIcon,
  DeleteIcon,
  EditIcon,
  FilterListIcon,
  ReplayIcon,
  ArrowDropDownIcon,
  AutoRenewIcon,
  ChevronRightIcon,
  DashboardIcon,
  ExpandMoreIcon,
  InfoOutlineIcon,
  RefreshIcon,
  TerminalIcon,
} from "@k8slens/icon";
import { MoreButton, PlainButton } from "@k8slens/input-components";
import { useSyncInject } from "@k8slens/use-inject";
import type { DashboardResource } from "@perses-dev/core";
import type { PanelDefinition } from "@perses-dev/spec";
import { observer } from "mobx-react";
import type { ReactNode } from "react";
import { editActionsInjectable } from "../dashboard-edit/edit-actions.injectable";
import { clusterSourceSelectionInjectable } from "../fleet/cluster-source-selection.injectable";
import {
  clusterSourceMenuKind,
  clustersMenuKind,
  dataSourceMenuKind,
  describeSource,
} from "../fleet/fleet-menus.injectable";
import { fleetSelectionInjectable } from "../fleet/fleet-selection.injectable";
import { fleetScope } from "../fleet/fleet-settings.injectable";
import { LookForHubs } from "../fleet/hub-discovery.injectable";
import { drawerFrameAttribute, EditorDrawer } from "../dashboard-edit/editor-drawer";
import { panelMenuKind } from "../dashboard-edit/panel-menu.injectable";
import { PersesPanelBody } from "../perses/perses-panel-body";
import { Contained } from "../ui/contained";
import { ToolbarButton } from "../ui/toolbar-button";
import { PersesRuntime } from "../perses/perses-runtime";
import { DashboardGrid, dragHandleClassName, type GridItem, gridColumns, noDragClassName } from "./dashboard-grid";
import { refreshIntervalMenuKind, timeRangeMenuKind, variableMenuKind } from "./dashboard-menus.injectable";
import { type DashboardStatus, dashboardStatusReporterInjectable } from "./dashboard-status-reporter.injectable";
import {
  type DashboardViewModel,
  dashboardViewModelInjectable,
  labelOf,
  refreshIntervalOptions,
  timeRangeOptions,
} from "./dashboard-view-model.injectable";
import { allValue } from "./variable-options.injectable";

const assumedDashboardWidthPx = 1400;

const PickerButton = ({ children, ...props }: { readonly children: ReactNode } & ButtonProps) => (
  <Button
    $anchor
    $flex={{ verticalAlign: "center", gap: "xs" }}
    $padding={{ horizontal: "s", vertical: "xxs" }}
    $border={{ color: "borderPrimary", width: "xxs", radius: "m" }}
    $backgroundColor={{ normal: "backgroundPrimary", hover: "grey70" }}
    $color={{ normal: "textDefault", hover: "textHighlight" }}
    $font={{ size: "s", noWrap: true }}
    {...props}
  >
    {children}
    <ArrowDropDownIcon $size="s" />
  </Button>
);

const failingQueriesOf = (status: DashboardStatus | undefined) =>
  Object.entries(status?.panels ?? {}).flatMap(([key, panel]) =>
    panel.queries.filter((query) => !query.ok).map((query) => `${panel.title || key}: ${query.error}`),
  );

const FileState = observer(
  ({ viewModel, status }: { readonly viewModel: DashboardViewModel; readonly status?: DashboardStatus }) => {
    const file = viewModel.file.get();

    if (file.status === "loading") {
      return <Span $color="textMuted">Reading the dashboard…</Span>;
    }

    if (file.status === "missing") {
      return <Badge small label="Waiting for the file" $tooltip={file.path} />;
    }

    if (file.status === "unreadable") {
      return (
        <Badge small label="Cannot read the file" $backgroundColor="critical" $color="white" $tooltip={file.error} />
      );
    }

    const failing = failingQueriesOf(status);

    return (
      <Div $flex={{ verticalAlign: "center", gap: "s" }}>
        {file.errors.length ? (
          <Badge
            small
            label={`${file.errors.length} ${file.errors.length === 1 ? "problem" : "problems"}`}
            $backgroundColor="critical"
            $color="white"
          />
        ) : (
          <Badge
            small
            label="Live"
            $backgroundColor="success"
            $color="white"
            $tooltip="Changes to the file show here as they are saved"
          />
        )}
        {failing.length > 0 && (
          <Badge
            small
            label={`${failing.length} ${failing.length === 1 ? "query fails" : "queries fail"}`}
            $backgroundColor="warning"
            $color="white"
            $tooltip={failing.join("\n")}
          />
        )}
        <Span $color="textMuted" $font={{ size: "xs" }}>
          updated {new Date(file.changedAt).toLocaleTimeString()}
        </Span>
      </Div>
    );
  },
);

// What a fleet dashboard is drawn from, and for which clusters: chosen here rather than in the
// dashboard's file, so one dashboard runs against any hub, or every cluster's own Prometheus.
const FleetControls = observer(({ fileName }: { readonly fileName: string }) => {
  const selection = useSyncInject(fleetSelectionInjectable, fileName);
  const source = selection.source.get();
  const chosen = selection.chosen.get();
  const fanningOut = source.kind === "clusters";
  const clustersLabel =
    chosen === "all"
      ? fanningOut
        ? "All connected clusters"
        : "All clusters"
      : chosen.length === 1
        ? chosen[0]
        : `${chosen.length} clusters`;

  return (
    <>
      <LookForHubs />
      <PickerButton
        $dropDownMenu={dropDownMenu(dataSourceMenuKind, { data: { fileName }, position: "bottom span-left" })}
        $tooltip={describeSource(source)}
      >
        <StorageIcon $size="s" />
        {source.name}
      </PickerButton>
      <PickerButton
        $dropDownMenu={dropDownMenu(clustersMenuKind, { data: { fileName }, position: "bottom span-left" })}
        $tooltip={
          selection.optionsError.get() ?? (fanningOut ? "Each chosen cluster's own Prometheus is asked" : undefined)
        }
      >
        <LayersIcon $size="s" />
        {clustersLabel}
      </PickerButton>
    </>
  );
});

// What a cluster's dashboard is drawn from: the cluster's own Prometheus, or a hub holding it too.
const ClusterSourceControl = observer(
  ({ clusterId, fileName }: { readonly clusterId: string; readonly fileName: string }) => {
    const selection = useSyncInject(clusterSourceSelectionInjectable, clusterId, fileName);

    return (
      <>
        <LookForHubs />
        <PickerButton
          $dropDownMenu={dropDownMenu(clusterSourceMenuKind, {
            data: { clusterId, fileName },
            position: "bottom span-left",
          })}
          $tooltip="Where this dashboard's metrics come from"
        >
          <StorageIcon $size="s" />
          {selection.source.get().name}
        </PickerButton>
      </>
    );
  },
);

const DashboardHeader = observer(
  ({ viewModel, status }: { readonly viewModel: DashboardViewModel; readonly status?: DashboardStatus }) => {
    const dashboard = viewModel.dashboard.get();
    const file = viewModel.file.get();
    const menuData = { clusterId: viewModel.clusterId, fileName: viewModel.fileName };
    const refreshInterval = viewModel.refreshInterval.get();

    return (
      <Div
        $flex={{ verticalAlign: "center", gap: "m" }}
        $padding={{ horizontal: "l", vertical: "s" }}
        $backgroundColor="backgroundPrimary"
        $border={{ bottom: { width: "xxs", color: "grey60" } }}
      >
        <DashboardIcon $size="m" $color="textMuted" />
        <Div $flex={{ direction: "vertical" }} $flexChild="shrinkable">
          <H2 $font={{ size: "l", bold: true, noWrap: true, textOverflow: "ellipsis" }} $color="textHighlight">
            {dashboard?.spec.display?.name ?? dashboard?.metadata.name ?? viewModel.fileName}
          </H2>
          <Span $font={{ size: "xs", noWrap: true, textOverflow: "ellipsis" }} $color="textMuted">
            {file.status === "loading" ? viewModel.fileName : file.path}
          </Span>
        </Div>
        <FileState viewModel={viewModel} status={status} />
        <Div $flexChild />
        {viewModel.clusterId === fleetScope ? (
          <FleetControls fileName={viewModel.fileName} />
        ) : (
          <ClusterSourceControl clusterId={viewModel.clusterId} fileName={viewModel.fileName} />
        )}
        <PickerButton $dropDownMenu={dropDownMenu(timeRangeMenuKind, { data: menuData, position: "bottom span-left" })}>
          <AccessTimeIcon $size="s" />
          {labelOf(timeRangeOptions, viewModel.duration.get())}
        </PickerButton>
        <PickerButton
          $dropDownMenu={dropDownMenu(refreshIntervalMenuKind, { data: menuData, position: "bottom span-left" })}
          $tooltip="Refresh automatically"
        >
          <AutoRenewIcon $size="s" />
          {refreshInterval === "0s" ? "Auto refresh off" : labelOf(refreshIntervalOptions, refreshInterval)}
        </PickerButton>
        <ToolbarButton $onClick={viewModel.refresh} $tooltip="Refresh now">
          <RefreshIcon $size="m" />
        </ToolbarButton>
        <ToolbarButton
          $onClick={viewModel.toggleEditing}
          $tooltip={viewModel.editing.get() ? "Stop editing by hand" : "Edit by hand"}
          active={viewModel.editing.get()}
        >
          <EditIcon $size="m" />
        </ToolbarButton>
        <ToolbarButton
          $onClick={viewModel.toggleAgentPanel}
          $tooltip={viewModel.agentPanelOpen.get() ? "Hide the agent" : "Show the agent"}
          active={viewModel.agentPanelOpen.get()}
        >
          <TerminalIcon $size="m" />
        </ToolbarButton>
      </Div>
    );
  },
);

// What editing by hand offers, in a band under the header while it is on.
const EditToolbar = observer(({ viewModel }: { readonly viewModel: DashboardViewModel }) => {
  const actions = useSyncInject(editActionsInjectable, viewModel.clusterId, viewModel.fileName);
  const canUndo = actions.canUndo.get();

  if (!viewModel.editing.get()) {
    return null;
  }

  return (
    <Div
      $flex={{ verticalAlign: "center", gap: "m" }}
      $padding={{ horizontal: "l", vertical: "xxs" }}
      $backgroundColor="backgroundPrimary"
      $border={{ bottom: { width: "xxs", color: "grey60" } }}
    >
      <Span $font={{ size: "s", bold: true }} $color="primary">
        Editing by hand
      </Span>
      <Span $font={{ size: "xs" }} $color="textMuted">
        Drag panels by their title, resize them by their corner. Every change is saved to the file.
      </Span>
      <Div $flexChild />
      <PlainButton Icon={AddIcon} onClick={() => viewModel.openEditor({ kind: "panel", groupIndex: 0 })}>
        Panel
      </PlainButton>
      <PlainButton Icon={AddIcon} onClick={() => void actions.addGroup()}>
        Group
      </PlainButton>
      <PlainButton Icon={FilterListIcon} onClick={() => viewModel.openEditor({ kind: "variables" })}>
        Variables
      </PlainButton>
      <PlainButton Icon={DescriptionIcon} onClick={() => viewModel.openEditor({ kind: "json" })}>
        JSON
      </PlainButton>
      <PlainButton
        Icon={ReplayIcon}
        $disabled={!canUndo}
        $tooltip="Undo the last change to the file, whoever made it"
        onClick={() => void actions.undo()}
      >
        Undo
      </PlainButton>
    </Div>
  );
});

const Problems = observer(({ viewModel }: { readonly viewModel: DashboardViewModel }) => {
  const file = viewModel.file.get();

  if (file.status !== "loaded" || file.errors.length === 0) {
    return null;
  }

  return (
    <Div
      $flex={{ direction: "vertical", gap: "xs" }}
      $padding={{ horizontal: "l", vertical: "s" }}
      $backgroundColor="backgroundPrimary"
      $border={{ left: { width: "xs", color: "critical" } }}
      $margin={{ horizontal: "l", top: "m" }}
    >
      <Span $font={{ size: "s", bold: true }} $color="textHighlight">
        {file.dashboard
          ? "The file has problems, so the last version that had none is shown"
          : "The file has problems, so there is nothing to show yet"}
      </Span>
      {file.errors.slice(0, 8).map((error) => (
        <Code key={error} $font={{ size: "xs" }} $color="textDefault">
          {error}
        </Code>
      ))}
      {file.errors.length > 8 && <Span $color="textMuted">…and {file.errors.length - 8} more</Span>}
    </Div>
  );
});

const valueLabel = (value: unknown) =>
  value === allValue
    ? "All"
    : Array.isArray(value)
      ? value.length
        ? value.join(", ")
        : "None"
      : String(value ?? "None");

const Variables = observer(({ viewModel }: { readonly viewModel: DashboardViewModel }) => {
  const variables = viewModel.variables.get().filter(({ definition }) => !definition.spec.display?.hidden);

  if (variables.length === 0) {
    return null;
  }

  return (
    <Div $flex={{ verticalAlign: "center", gap: "m", wrap: true }} $padding={{ horizontal: "l", top: "m" }}>
      {variables.map(({ definition, value, error }) => (
        <Div key={definition.spec.name} $flex={{ verticalAlign: "center", gap: "xs" }}>
          <Span $font={{ size: "s" }} $color="textMuted">
            {definition.spec.display?.name ?? definition.spec.name}
          </Span>
          {definition.kind === "ListVariable" ? (
            <PickerButton
              $dropDownMenu={dropDownMenu(variableMenuKind, {
                data: { clusterId: viewModel.clusterId, fileName: viewModel.fileName, name: definition.spec.name },
              })}
              $tooltip={error}
            >
              {error ? "Cannot list options" : valueLabel(value)}
            </PickerButton>
          ) : (
            <Span $font={{ size: "s" }} $color="textDefault">
              {valueLabel(value)}
            </Span>
          )}
        </Div>
      ))}
    </Div>
  );
});

interface PanelCardProps {
  readonly viewModel: DashboardViewModel;
  readonly panelKey: string;
  readonly groupIndex: number;
  readonly panel: PanelDefinition;
  readonly width: number;
}

const PanelCard = observer(({ viewModel, panelKey, groupIndex, panel, width }: PanelCardProps) => (
  <Div
    $flex={{ direction: "vertical" }}
    $height="full"
    $backgroundColor="backgroundPrimary"
    $border={{ color: "borderPrimary", width: "xxs", radius: "m" }}
    $overflow="hidden"
  >
    <Div
      $className={dragHandleClassName}
      $flex={{ verticalAlign: "center", gap: "xs" }}
      $padding={{ horizontal: "m", top: "s", bottom: "xs" }}
    >
      <Span $font={{ size: "s", bold: true, noWrap: true, textOverflow: "ellipsis" }} $color="textHighlight">
        {panel.spec.display?.name}
      </Span>
      {panel.spec.display?.description && (
        <Span $className={noDragClassName} $tooltip={panel.spec.display.description} $color="textMuted">
          <InfoOutlineIcon $size="xs" />
        </Span>
      )}
      <Div $flexChild />
      <MoreButton
        $className={noDragClassName}
        $anchor
        $tooltip="More"
        $dropDownMenu={dropDownMenu(panelMenuKind, {
          data: {
            clusterId: viewModel.clusterId,
            fileName: viewModel.fileName,
            key: panelKey,
            groupIndex,
            editing: viewModel.editing.get(),
          },
          position: "bottom span-left",
        })}
      />
    </Div>
    <Div $flexChild="shrinkable" $padding={{ horizontal: "xs", bottom: "xs" }} $style={{ position: "relative" }}>
      <Contained what="This panel" retryOn={panel}>
        <PersesPanelBody panel={panel} approximateWidth={(width / gridColumns) * assumedDashboardWidthPx} />
      </Contained>
    </Div>
  </Div>
));

const GroupActions = ({
  viewModel,
  groupIndex,
  title,
}: {
  readonly viewModel: DashboardViewModel;
  readonly groupIndex: number;
  readonly title: string;
}) => {
  const actions = useSyncInject(editActionsInjectable, viewModel.clusterId, viewModel.fileName);

  return (
    <Div $flex={{ verticalAlign: "center", gap: "xxs" }}>
      <ToolbarButton
        $onClick={() => viewModel.openEditor({ kind: "panel", groupIndex })}
        $tooltip="Add a panel to this group"
      >
        <AddIcon $size="s" />
      </ToolbarButton>
      <ToolbarButton $onClick={() => void actions.renameGroup(groupIndex, title)} $tooltip="Rename the group">
        <EditIcon $size="s" />
      </ToolbarButton>
      <ToolbarButton
        $onClick={() => void actions.deleteGroup(groupIndex, title || "Untitled group")}
        $tooltip="Delete the group and its panels"
      >
        <DeleteIcon $size="s" />
      </ToolbarButton>
    </Div>
  );
};

const Groups = observer(
  ({ viewModel, dashboard }: { readonly viewModel: DashboardViewModel; readonly dashboard: DashboardResource }) => (
    <Div $flex={{ direction: "vertical", gap: "l" }}>
      {dashboard.spec.layouts.map((layout, groupIndex) => {
        const spec = layout.spec as { display?: { title?: string }; items: GridItem[] };
        const collapsed = viewModel.isCollapsed(groupIndex);
        const editing = viewModel.editing.get();
        const title = spec.display?.title || (editing ? "Untitled group" : undefined);

        return (
          <Div key={groupIndex} $flex={{ direction: "vertical", gap: "s" }}>
            {title && (
              <Div $flex={{ verticalAlign: "center", gap: "xs" }}>
                <Button
                  $flex={{ verticalAlign: "center", gap: "xs" }}
                  $onClick={() => viewModel.toggleCollapsed(groupIndex)}
                  $color={{ normal: "textDefault", hover: "textHighlight" }}
                  $font={{ size: "m", bold: true }}
                >
                  {collapsed ? <ChevronRightIcon $size="s" /> : <ExpandMoreIcon $size="s" />}
                  {title}
                </Button>
                {editing && (
                  <GroupActions viewModel={viewModel} groupIndex={groupIndex} title={spec.display?.title ?? ""} />
                )}
              </Div>
            )}
            {!collapsed && (
              <DashboardGrid
                viewModel={viewModel}
                dashboard={dashboard}
                groupIndex={groupIndex}
                items={spec.items}
                renderPanel={(key, item) => (
                  <PanelCard
                    viewModel={viewModel}
                    panelKey={key}
                    groupIndex={groupIndex}
                    panel={dashboard.spec.panels[key]}
                    width={item.width}
                  />
                )}
              />
            )}
          </Div>
        );
      })}
    </Div>
  ),
);

const NothingToShow = observer(({ viewModel }: { readonly viewModel: DashboardViewModel }) => {
  const file = viewModel.file.get();

  return (
    <Div $flex={{ direction: "vertical", gap: "s", horizontalAlign: "center" }} $padding="xxl" $color="textMuted">
      <DashboardIcon $size="xl" />
      <Span $font={{ size: "m" }}>
        {file.status === "missing" ? "This dashboard's file does not exist yet." : "There is no dashboard to show yet."}
      </Span>
      <Span $font={{ size: "s" }}>Ask the agent below to build one, and it appears here as it is written.</Span>
    </Div>
  );
});

export interface DashboardViewProps {
  readonly clusterId: string;
  readonly fileName: string;
}

export const DashboardView = observer(({ clusterId, fileName }: DashboardViewProps) => {
  const viewModel = useSyncInject(dashboardViewModelInjectable, clusterId, fileName);
  const status = useSyncInject(dashboardStatusReporterInjectable, clusterId, fileName).get();
  const dashboard = viewModel.dashboard.get();

  return (
    // The frame the editors' drawer slides in over, header and all, and measures its width by.
    <Div
      $flex={{ direction: "vertical" }}
      $height="full"
      $backgroundColor="backgroundSecondary"
      $relative
      {...{ [drawerFrameAttribute]: true }}
    >
      <Contained what="The dashboard's header">
        <DashboardHeader viewModel={viewModel} status={status} />
      </Contained>
      <Contained what="The edit toolbar">
        <EditToolbar viewModel={viewModel} />
      </Contained>
      <Problems viewModel={viewModel} />
      <Contained what="The variables" retryOn={dashboard}>
        <Variables viewModel={viewModel} />
      </Contained>
      {dashboard ? (
        <Div $flexChild="shrinkable" $flex={{ direction: "vertical" }}>
          <Contained what="The dashboard" retryOn={dashboard}>
            <PersesRuntime viewModel={viewModel} dashboard={dashboard}>
              <Div $flexChild="shrinkable" $overflow={{ y: "auto" }} $padding="l">
                <Groups viewModel={viewModel} dashboard={dashboard} />
              </Div>
              <EditorDrawer viewModel={viewModel} dashboard={dashboard} />
            </PersesRuntime>
          </Contained>
        </Div>
      ) : (
        <Div $flexChild="shrinkable" $overflow={{ y: "auto" }} $padding="l">
          <NothingToShow viewModel={viewModel} />
        </Div>
      )}
    </Div>
  );
});
