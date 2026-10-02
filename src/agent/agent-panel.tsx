import { aiToolTopBarMenuKind } from "@k8slens/ai-tools-contracts";
import { dropDownMenu } from "@k8slens/drop-down-menu-contracts";
import { Button, Div, Span } from "@k8slens/element-components";
import { ArrowDropDownIcon, CloseIcon, TerminalIcon } from "@k8slens/icon";
import { PlainButton, PrimaryButton } from "@k8slens/input-components";
import { useSyncInject } from "@k8slens/use-inject";
import type { ReactNode } from "react";
import { observer } from "mobx-react";
import type { DashboardViewModel } from "../dashboard-view/dashboard-view-model.injectable";
import { ToolbarButton } from "../ui/toolbar-button";
import { agentQueryResponderInjectable } from "./agent-query-responder.injectable";
import {
  agentAvailabilityInjectable,
  type AgentTool,
  dashboardAgentTerminalComponentInjectable,
} from "./dashboard-agent-terminal.injectable";
import { dashboardWorkspaceInjectable } from "./dashboard-workspace.injectable";
import { openAiToolPreferencesInjectable } from "./open-ai-tool-preferences.injectable";

const Notice = ({ children }: { readonly children: ReactNode }) => (
  <Div
    $flex={{ direction: "vertical", gap: "m", horizontalAlign: "center", verticalAlign: "center" }}
    $height="full"
    $padding="l"
  >
    {children}
  </Div>
);

// Lens's own menu of AI tools, the one its AI button in the top bar opens: choosing a tool
// there chooses it for Lens, and the agent here follows.
const aiToolMenu = dropDownMenu(aiToolTopBarMenuKind, { position: "top span-right" });

const ToolPicker = ({ tool }: { readonly tool?: AgentTool }) => (
  <Button
    $anchor
    $dropDownMenu={aiToolMenu}
    $tooltip="Choose the AI tool"
    $flex={{ verticalAlign: "center", gap: "xs" }}
    $padding={{ horizontal: "xs", vertical: "4xs" }}
    $border={{ radius: "s" }}
    $backgroundColor={{ normal: "transparent", hover: "grey70" }}
    $color={{ normal: "textDefault", hover: "textHighlight" }}
    $font={{ size: "s", noWrap: true }}
  >
    {tool ? <tool.Icon $size="s" /> : <TerminalIcon $size="s" />}
    {tool?.displayName ?? "Choose an AI tool"}
    <ArrowDropDownIcon $size="s" />
  </Button>
);

const AgentTerminal = observer(
  ({
    viewModel,
    directory,
    tool,
  }: {
    readonly viewModel: DashboardViewModel;
    readonly directory: string;
    readonly tool: AgentTool;
  }) => {
    const Terminal = useSyncInject(dashboardAgentTerminalComponentInjectable);
    const sessionId = `lens-glance:${viewModel.clusterId}/${viewModel.fileName}:${tool.kind}`;

    // Answers the agent's queries for as long as it is shown.
    useSyncInject(agentQueryResponderInjectable, viewModel.clusterId, viewModel.fileName).get();

    return <Terminal key={sessionId} sessionId={sessionId} input={[directory, viewModel.fileName]} />;
  },
);

const AgentBody = observer(({ viewModel }: { readonly viewModel: DashboardViewModel }) => {
  const availability = useSyncInject(agentAvailabilityInjectable).get();
  const workspace = useSyncInject(dashboardWorkspaceInjectable, viewModel.fileName).get();
  const openPreferences = useSyncInject(openAiToolPreferencesInjectable);

  if (availability.status === "loading" || workspace.status === "preparing") {
    return (
      <Notice>
        <Span $color="textMuted">Starting the agent…</Span>
      </Notice>
    );
  }

  if (workspace.status === "failed") {
    return (
      <Notice>
        <Span $color="textDefault">The dashboards folder could not be prepared for the agent.</Span>
        <Span $color="textMuted" $font={{ size: "s" }}>
          {workspace.error}
        </Span>
      </Notice>
    );
  }

  if (availability.status === "not-configured") {
    return (
      <Notice>
        <Span $color="textDefault">Choose an AI tool, and it builds this dashboard with you here.</Span>
        <Div $flex={{ gap: "s" }}>
          <PrimaryButton $anchor $dropDownMenu={aiToolMenu}>
            Choose an AI tool
          </PrimaryButton>
          <PlainButton onClick={openPreferences}>Preferences</PlainButton>
        </Div>
      </Notice>
    );
  }

  if (availability.status === "custom-command") {
    return (
      <Notice>
        <Span $color="textDefault">
          The custom AI tool command cannot be started from here. Choose one of the AI tools Lens knows.
        </Span>
        <PrimaryButton $anchor $dropDownMenu={aiToolMenu}>
          Choose an AI tool
        </PrimaryButton>
      </Notice>
    );
  }

  return <AgentTerminal viewModel={viewModel} directory={workspace.directory} tool={availability.tool} />;
});

// The agent's terminal along the bottom of the dashboard, the way the dock runs along the
// bottom of a cluster's view, so the dashboard changes in front of the user as they talk to it.
export const AgentPanel = observer(({ viewModel }: { readonly viewModel: DashboardViewModel }) => {
  const workspace = useSyncInject(dashboardWorkspaceInjectable, viewModel.fileName).get();
  const availability = useSyncInject(agentAvailabilityInjectable).get();

  return (
    <Div $flex={{ direction: "vertical" }} $height="full" $backgroundColor="backgroundSecondary">
      <Div
        $flex={{ verticalAlign: "center", gap: "s" }}
        $padding={{ horizontal: "m", vertical: "xxs" }}
        $backgroundColor="backgroundPrimary"
        $border={{ top: { width: "xxs", color: "grey60" }, bottom: { width: "xxs", color: "grey60" } }}
      >
        <Span $font={{ size: "s", bold: true }} $color="textHighlight">
          Agent
        </Span>
        <ToolPicker
          tool={
            availability.status === "loading" || availability.status === "not-configured"
              ? undefined
              : availability.tool
          }
        />
        {workspace.status === "ready" && (
          <Span $font={{ size: "xs", noWrap: true, textOverflow: "ellipsis" }} $color="textMuted">
            in {workspace.directory}
          </Span>
        )}
        <Div $flexChild />
        <ToolbarButton $onClick={viewModel.toggleAgentPanel} $tooltip="Hide the agent">
          <CloseIcon $size="s" />
        </ToolbarButton>
      </Div>
      <Div $flexChild="shrinkable">
        <AgentBody viewModel={viewModel} />
      </Div>
    </Div>
  );
});
