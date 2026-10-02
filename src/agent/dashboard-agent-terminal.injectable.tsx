import {
  aiToolIsConfiguredInjectionToken,
  customAiToolKind,
  effectiveAiToolDisplayNameInjectionToken,
  effectiveAiToolIconInjectionToken,
  effectiveAiToolKindInjectionToken,
  selectedAiToolCommandInjectionToken,
  selectedAiToolResumeCommandInjectionToken,
} from "@k8slens/ai-tools-contracts";
import type { SvgProps } from "@k8slens/element-components";
import { TerminalIcon } from "@k8slens/icon";
import { getInjectable2 } from "@k8slens/injectable";
import { getTerminalInjectableBunch, getTerminalKind, type TerminalTabIconProps } from "@k8slens/terminal-contracts";
import { computed, type IComputedValue, observable, runInAction } from "mobx";
import type React from "react";

type AgentTerminalInput = [directory: string, fileName: string];

export const dashboardAgentTerminalKind = getTerminalKind<AgentTerminalInput>()("dashboard-agent");

const agentPrompt = (fileName: string) => {
  const name = fileName.replace(/\.json$/, "");
  const fleet = fileName.startsWith("fleet/");

  return [
    `We are working on the Lens dashboard in ./${fileName}, which Lens shows live as you save it.`,
    "Follow AGENTS.md and the lens-dashboard skill.",
    ...(fleet
      ? [
          "It is a fleet dashboard, of many clusters at once: read the skill's references/fleet.md,",
          "and write every query with $__cluster_filter and $__cluster_label.",
        ]
      : []),
    `Read the dashboard and .lens/${name}.status.json, tell me in a sentence or two what it shows now, then wait for what I ask.`,
  ].join(" ");
};

const AgentTabIcon = ({ $size }: TerminalTabIconProps<AgentTerminalInput>) => <TerminalIcon $size={$size} />;

// The agent of a dashboard: the AI tool the user chose in Lens, started in the dashboards
// folder with the dashboard to work on, and picking its conversation up again after Lens
// restarts.
export const dashboardAgentTerminalBunch = getTerminalInjectableBunch({
  kind: dashboardAgentTerminalKind,
  TabIcon: AgentTabIcon,

  startup: {
    consumptions: [selectedAiToolCommandInjectionToken, selectedAiToolResumeCommandInjectionToken],

    instantiate: (di) => {
      const selectedCommand = di.inject(selectedAiToolCommandInjectionToken);
      const selectedResumeCommand = di.inject(selectedAiToolResumeCommandInjectionToken);

      return () => async (directory, fileName) => {
        const buildCommand = (await selectedCommand()).get();
        const buildResumeCommand = (await selectedResumeCommand()).get();

        return {
          title: `Agent: ${fileName.replace(/\.json$/, "")}`,
          workingDirectory: directory,
          command: buildCommand
            ? await buildCommand(di as never, { prompt: agentPrompt(fileName), dir: directory })
            : undefined,
          resumeCommand: buildResumeCommand ? await buildResumeCommand(di as never, { dir: directory }) : undefined,
          reuseKey: `${directory}/${fileName}`,
        };
      };
    },
  },
});

export interface AgentTool {
  /** The tool, as Lens knows it; a terminal is started per tool, so switching tools starts another. */
  readonly kind: string;
  readonly displayName: string;
  readonly Icon: React.ComponentType<SvgProps>;
}

export type AgentAvailability =
  | { readonly status: "loading" }
  | { readonly status: "not-configured" }
  | { readonly status: "custom-command"; readonly tool: AgentTool }
  | { readonly status: "available"; readonly tool: AgentTool };

// Whether there is an agent to start, and which: the AI tool the user chose in Lens, from the
// AI tool button's menu or the preferences, whose command Lens can hand out. A custom command
// is the user's own text, which Lens keeps to itself.
export const agentAvailabilityInjectable = getInjectable2({
  id: "lens-glance-agent-availability",
  consumptions: [
    aiToolIsConfiguredInjectionToken,
    effectiveAiToolKindInjectionToken,
    effectiveAiToolDisplayNameInjectionToken,
    effectiveAiToolIconInjectionToken,
    selectedAiToolCommandInjectionToken,
  ],

  instantiate: (di) => {
    const isConfigured = di.inject(aiToolIsConfiguredInjectionToken);
    const effectiveKind = di.inject(effectiveAiToolKindInjectionToken);
    const effectiveDisplayName = di.inject(effectiveAiToolDisplayNameInjectionToken);
    const effectiveIcon = di.inject(effectiveAiToolIconInjectionToken);
    const selectedCommand = di.inject(selectedAiToolCommandInjectionToken);

    const sources = observable.box<
      | {
          configured: IComputedValue<boolean>;
          kind: IComputedValue<string>;
          displayName: IComputedValue<string>;
          Icon: IComputedValue<React.ComponentType<SvgProps>>;
          command: IComputedValue<unknown>;
        }
      | undefined
    >(undefined, { deep: false });

    void Promise.all([
      isConfigured(),
      effectiveKind(),
      effectiveDisplayName(),
      effectiveIcon(),
      selectedCommand(),
    ]).then(([configured, kind, displayName, Icon, command]) =>
      runInAction(() => sources.set({ configured, kind, displayName, Icon, command })),
    );

    const availability = computed((): AgentAvailability => {
      const resolved = sources.get();

      if (!resolved) {
        return { status: "loading" };
      }

      if (!resolved.configured.get()) {
        return { status: "not-configured" };
      }

      const tool = { kind: resolved.kind.get(), displayName: resolved.displayName.get(), Icon: resolved.Icon.get() };

      if (tool.kind === customAiToolKind || !resolved.command.get()) {
        return { status: "custom-command", tool };
      }

      return { status: "available", tool };
    });

    return () => availability;
  },
});

export const dashboardAgentTerminalComponentInjectable = getInjectable2({
  id: "lens-glance-dashboard-agent-terminal-component",
  instantiate: (di) => {
    const terminalOfKind = di.inject(dashboardAgentTerminalBunch.terminalOfKind);

    return () => terminalOfKind();
  },
});
