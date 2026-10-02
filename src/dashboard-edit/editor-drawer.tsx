import { Badge } from "@k8slens/badge";
import { Code, Div, Span } from "@k8slens/element-components";
import { PlainButton, PrimaryButton } from "@k8slens/input-components";
import { CloseIcon, EditIcon } from "@k8slens/icon";
import { useSyncInject } from "@k8slens/use-inject";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { linter, lintGutter } from "@codemirror/lint";
import type { DashboardResource } from "@perses-dev/core";
import { DashboardProvider, useListPanelGroups, VariableEditor } from "@perses-dev/dashboards";
// Perses exports its panel editor only inside its own drawer; the form itself sits here, in the
// version pinned in package.json.
import { PanelEditorForm } from "@perses-dev/dashboards/dist/components/PanelDrawer/PanelEditorForm";
import { type PanelEditorValues, ValidationProvider } from "@perses-dev/plugin-system";
import type { PanelDefinition } from "@perses-dev/spec";
import CodeMirror from "@uiw/react-codemirror";
import { observer } from "mobx-react";
import type { KeyboardEvent, PointerEvent, ReactNode } from "react";
import { validateDashboard } from "../dashboard-files/validate-dashboard";
import { dashboardStatusReporterInjectable } from "../dashboard-view/dashboard-status-reporter.injectable";
import type { DashboardEditor, DashboardViewModel } from "../dashboard-view/dashboard-view-model.injectable";
import { lensPersesThemeInjectable } from "../perses/lens-theme.injectable";
import { Contained } from "../ui/contained";
import { ToolbarButton } from "../ui/toolbar-button";
import { editorDrawerWidthInjectable } from "./editor-drawer-width.injectable";
import { editActionsInjectable } from "./edit-actions.injectable";

const newPanel: PanelDefinition = {
  kind: "Panel",
  spec: {
    display: { name: "New panel" },
    plugin: { kind: "TimeSeriesChart", spec: {} },
    queries: [
      { kind: "TimeSeriesQuery", spec: { plugin: { kind: "PrometheusTimeSeriesQuery", spec: { query: "" } } } },
    ],
  },
};

const titleOf = (editor: DashboardEditor) =>
  ({
    panel: editor.kind === "panel" && !editor.key ? "New panel" : "Edit panel",
    variables: "Variables",
    json: "Dashboard JSON",
    queries: "Queries",
  })[editor.kind];

interface EditorProps {
  readonly viewModel: DashboardViewModel;
  readonly dashboard: DashboardResource;
}

// Perses's own editor for a panel: its type, title, queries and options, with a preview. It
// lists the dashboard's groups from Perses's store of the dashboard, and names them by ids of
// that store, which are turned back into the group's place in the file here.
const PanelEditorInGroups = ({
  viewModel,
  dashboard,
  panelKey,
  groupIndex,
}: EditorProps & { readonly panelKey?: string; readonly groupIndex: number }) => {
  const actions = useSyncInject(editActionsInjectable, viewModel.clusterId, viewModel.fileName);
  const groups = useListPanelGroups();
  const groupId = groups[groupIndex]?.id ?? groups[0]?.id ?? 0;
  const panel = (panelKey && dashboard.spec.panels[panelKey]) || newPanel;

  return (
    <PanelEditorForm
      panelKey={panelKey}
      initialAction={panelKey ? "update" : "create"}
      initialValues={{ groupId, panelDefinition: panel }}
      onSave={(values: PanelEditorValues) =>
        void actions.savePanel(
          panelKey,
          values.panelDefinition,
          Math.max(
            0,
            groups.findIndex((group) => group.id === values.groupId),
          ),
        )
      }
      onClose={viewModel.closeEditor}
    />
  );
};

// Perses's forms laid out for the width of the drawer they are in; see perses-forms.scss.
const persesFormClassName = "lens-glance-perses-form";

const PanelEditor = (props: EditorProps & { readonly panelKey?: string; readonly groupIndex: number }) => (
  <Div $className={persesFormClassName}>
    <ValidationProvider>
      <DashboardProvider initialState={{ dashboardResource: props.dashboard, isEditMode: true }}>
        <PanelEditorInGroups {...props} />
      </DashboardProvider>
    </ValidationProvider>
  </Div>
);

const VariablesEditor = ({ viewModel, dashboard }: EditorProps) => {
  const actions = useSyncInject(editActionsInjectable, viewModel.clusterId, viewModel.fileName);

  return (
    <Div $className={persesFormClassName}>
      <ValidationProvider>
        <DashboardProvider initialState={{ dashboardResource: dashboard, isEditMode: true }}>
          <VariableEditor
            variableDefinitions={dashboard.spec.variables ?? []}
            externalVariableDefinitions={[]}
            builtinVariableDefinitions={[]}
            onChange={(variables) => void actions.saveVariables(variables)}
            onCancel={viewModel.closeEditor}
          />
        </DashboardProvider>
      </ValidationProvider>
    </Div>
  );
};

// The file itself, as text: what can be changed here that the other editors do not reach.
const JsonEditor = observer(({ viewModel }: EditorProps) => {
  const actions = useSyncInject(editActionsInjectable, viewModel.clusterId, viewModel.fileName);
  const { mode } = useSyncInject(lensPersesThemeInjectable).get();
  const draft = viewModel.jsonDraft.get();
  const validation = validateDashboard(draft);

  return (
    <Div $flex={{ direction: "vertical", gap: "s" }} $height="full">
      <Div $flexChild="shrinkable" $overflow="auto">
        <CodeMirror
          value={draft}
          onChange={viewModel.setJsonDraft}
          theme={mode}
          extensions={[json(), linter(jsonParseLinter()), lintGutter()]}
          basicSetup={{ foldGutter: true, highlightActiveLine: true }}
          height="calc(100vh - 320px)"
        />
      </Div>
      {!validation.valid && (
        <Div $flex={{ direction: "vertical", gap: "xxs" }}>
          <Span $font={{ size: "s", bold: true }} $color="critical">
            {validation.errors.length} {validation.errors.length === 1 ? "problem" : "problems"}: saved like this, the
            dashboard keeps showing its last version without problems
          </Span>
          {validation.errors.slice(0, 5).map((error) => (
            <Code key={error} $font={{ size: "xs" }}>
              {error}
            </Code>
          ))}
        </Div>
      )}
      <Div $flex={{ gap: "s", horizontalAlign: "right" }}>
        <PlainButton onClick={viewModel.closeEditor}>Cancel</PlainButton>
        <PrimaryButton onClick={() => void actions.saveJson(draft)}>Save</PrimaryButton>
      </Div>
    </Div>
  );
});

// What a panel asks the cluster, with the variables filled in, and what came back when its
// file last changed.
const QueriesView = observer(({ viewModel, dashboard, panelKey }: EditorProps & { readonly panelKey: string }) => {
  const status = useSyncInject(dashboardStatusReporterInjectable, viewModel.clusterId, viewModel.fileName).get();
  const panel = dashboard.spec.panels[panelKey];
  const checks = status?.panels[panelKey]?.queries ?? [];

  if (!panel) {
    return <Span $color="textMuted">This panel is not in the dashboard any more.</Span>;
  }

  return (
    <Div $flex={{ direction: "vertical", gap: "l" }}>
      <Span $font={{ size: "m", bold: true }} $color="textHighlight">
        {panel.spec.display?.name ?? panelKey}
      </Span>
      {(panel.spec.queries ?? []).map((query, index) => {
        const check = checks[index];
        const promQl = String((query.spec.plugin.spec as { query?: string }).query ?? "");

        return (
          <Div key={index} $flex={{ direction: "vertical", gap: "xs" }}>
            <Div $flex={{ verticalAlign: "center", gap: "s" }}>
              <Span $font={{ size: "s", bold: true }} $color="textDefault">
                Query {index + 1}
              </Span>
              {check &&
                (check.ok ? (
                  <Badge
                    small
                    label={`${check.series} series`}
                    $backgroundColor={check.series ? "success" : "warning"}
                    $color="white"
                  />
                ) : (
                  <Badge small label="Fails" $backgroundColor="critical" $color="white" />
                ))}
            </Div>
            <Code
              $font={{ size: "s", forceWrap: true }}
              $padding="s"
              $backgroundColor="backgroundSecondary"
              $border={{ radius: "s" }}
            >
              {promQl}
            </Code>
            {check && check.executed !== promQl && (
              <>
                <Span $font={{ size: "xs" }} $color="textMuted">
                  with the variables filled in
                </Span>
                <Code
                  $font={{ size: "xs", forceWrap: true }}
                  $padding="s"
                  $backgroundColor="backgroundSecondary"
                  $border={{ radius: "s" }}
                >
                  {check.executed}
                </Code>
              </>
            )}
            {check?.error && (
              <Span $font={{ size: "s", forceWrap: true }} $color="critical">
                {check.error}
              </Span>
            )}
            {check?.sample?.map((sample, sampleIndex) => (
              <Div key={sampleIndex} $flex={{ gap: "s", verticalAlign: "center" }} $font={{ size: "xs" }}>
                <Span $color="textHighlight">{sample.value}</Span>
                <Span $color="textMuted" $font={{ noWrap: true, textOverflow: "ellipsis" }}>
                  {Object.entries(sample.labels)
                    .map(([label, value]) => `${label}="${value}"`)
                    .join(", ") || "no labels"}
                </Span>
              </Div>
            ))}
          </Div>
        );
      })}
    </Div>
  );
});

/** Marks the frame the drawer measures its width against: the whole dashboard. */
export const drawerFrameAttribute = "data-lens-glance-drawer-frame";

// Its left edge, dragged to widen or narrow it.
const DrawerEdge = () => {
  const width = useSyncInject(editorDrawerWidthInjectable);

  return (
    <Div
      role="separator"
      aria-orientation="vertical"
      $className="lens-glance-drawer-edge"
      onPointerDown={(event: PointerEvent<HTMLDivElement>) => event.currentTarget.setPointerCapture(event.pointerId)}
      onPointerMove={(event: PointerEvent<HTMLDivElement>) => {
        const frame = event.currentTarget.closest(`[${drawerFrameAttribute}]`)?.getBoundingClientRect();

        if (frame && event.currentTarget.hasPointerCapture(event.pointerId)) {
          width.dragTo(event.clientX, frame.left, frame.width);
        }
      }}
      onPointerUp={width.drop}
      onLostPointerCapture={width.drop}
    />
  );
};

interface FrameProps {
  readonly title: string;
  readonly onClose: () => void;
  readonly footer?: ReactNode;
  readonly children: ReactNode;
}

// Slides in from the right over the dashboard, the way the details of a resource do in Lens,
// so the dashboard keeps its size underneath and stays in sight beside it.
const Frame = observer(({ title, onClose, footer, children }: FrameProps) => {
  const share = useSyncInject(editorDrawerWidthInjectable).share.get();

  return (
    <Div
      role="dialog"
      aria-label={title}
      $className="lens-glance-drawer"
      $flex={{ direction: "vertical" }}
      $backgroundColor="backgroundPrimary"
      $border={{ left: { width: "xxs", color: "grey60" } }}
      $style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: `${share * 100}%`,
        minWidth: 480,
        zIndex: 20,
      }}
      // Escape closes it, unless an editor inside used the key, such as to close its suggestions.
      onKeyDown={(event: KeyboardEvent) => event.key === "Escape" && !event.defaultPrevented && onClose()}
    >
      <DrawerEdge />
      <Div
        $flex={{ verticalAlign: "center", gap: "s" }}
        $padding={{ horizontal: "l", vertical: "s" }}
        $border={{ bottom: { width: "xxs", color: "grey60" } }}
      >
        <Span $font={{ size: "m", bold: true }} $color="textHighlight">
          {title}
        </Span>
        <Div $flexChild />
        <ToolbarButton $onClick={onClose} $tooltip="Close">
          <CloseIcon $size="s" />
        </ToolbarButton>
      </Div>
      <Div $flexChild="shrinkable" $overflow={{ y: "auto" }} $padding="l">
        {children}
      </Div>
      {footer && (
        <Div
          $flex={{ gap: "s", horizontalAlign: "right" }}
          $padding={{ horizontal: "l", vertical: "s" }}
          $border={{ top: { width: "xxs", color: "grey60" } }}
        >
          {footer}
        </Div>
      )}
    </Div>
  );
});

export const EditorDrawer = observer(({ viewModel, dashboard }: EditorProps) => {
  const editor = viewModel.editor.get();

  if (!editor) {
    return null;
  }

  return (
    <Frame
      title={titleOf(editor)}
      onClose={viewModel.closeEditor}
      footer={
        editor.kind === "queries" && (
          <>
            <PlainButton onClick={viewModel.closeEditor}>Close</PlainButton>
            <PrimaryButton
              Icon={EditIcon}
              $tooltip={viewModel.editing.get() ? undefined : "Turns on editing by hand"}
              onClick={() => viewModel.editPanel(editor.key)}
            >
              Edit panel
            </PrimaryButton>
          </>
        )
      }
    >
      <Contained what="The editor" retryOn={editor}>
        {editor.kind === "panel" && (
          <PanelEditor
            key={editor.key ?? "new"}
            viewModel={viewModel}
            dashboard={dashboard}
            panelKey={editor.key}
            groupIndex={editor.groupIndex}
          />
        )}
        {editor.kind === "variables" && <VariablesEditor viewModel={viewModel} dashboard={dashboard} />}
        {editor.kind === "json" && <JsonEditor viewModel={viewModel} dashboard={dashboard} />}
        {editor.kind === "queries" && <QueriesView viewModel={viewModel} dashboard={dashboard} panelKey={editor.key} />}
      </Contained>
    </Frame>
  );
});
