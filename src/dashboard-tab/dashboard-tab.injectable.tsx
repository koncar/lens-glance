import { Div, Span } from "@k8slens/element-components";
import { DashboardIcon } from "@k8slens/icon";
import { getInjectable2 } from "@k8slens/injectable";
import { mainViewTabHostKind } from "@k8slens/main-view-contracts";
import { getPersistableMapInjectableBunch } from "@k8slens/persistable-contracts";
import { getTabKind, getTabKindInjectableBunch, type TabId, type TabProps, useTabId } from "@k8slens/tab-contracts";
import { useSyncInject } from "@k8slens/use-inject";
import { computed, observable, type ObservableMap, runInAction } from "mobx";
import { observer } from "mobx-react";
import { type PointerEvent, useEffect, useRef } from "react";
import { AgentPanel } from "../agent/agent-panel";
import { agentSplitInjectable } from "../agent/agent-split.injectable";
import { nameOfDashboard } from "../dashboard-files/dashboard-library.injectable";
import { dashboardViewModelInjectable } from "../dashboard-view/dashboard-view-model.injectable";
import { DashboardView } from "../dashboard-view/dashboard-view";
import { Contained } from "../ui/contained";
import { dashboardTabsInjectable } from "./dashboard-tabs.injectable";

export interface DashboardTabInput {
  readonly clusterId: string;
  readonly fileName: string;
}

export const dashboardTabKind = getTabKind<DashboardTabInput>()("dashboard");

export const dashboardTabIdOf = ({ clusterId, fileName }: DashboardTabInput) => `${clusterId}/${fileName}`;

export const dashboardTabInputsBunch = getPersistableMapInjectableBunch<TabId, DashboardTabInput>()({
  id: "dashboard-tab-inputs",
});

export const dashboardTabInputInjectable = getInjectable2({
  id: "lens-glance-dashboard-tab-input",

  instantiate: (di) => {
    const getInputs = di.inject(dashboardTabInputsBunch.persistable);
    const inputs = observable.box<ObservableMap<TabId, DashboardTabInput> | undefined>(undefined, { deep: false });

    void getInputs().then((loaded) => runInAction(() => inputs.set(loaded)));

    return (tabId: TabId) => computed(() => inputs.get()?.get(tabId));
  },
});

const DashboardTitle = observer(({ tabId }: TabProps<typeof mainViewTabHostKind>) => {
  const input = useSyncInject(dashboardTabInputInjectable, tabId).get();
  const lensTabId = useTabId(mainViewTabHostKind);
  const { remember } = useSyncInject(dashboardTabsInjectable);

  useEffect(() => {
    if (input) {
      remember(lensTabId, input);
    }
  }, [remember, lensTabId, input]);

  return (
    <Div $flex={{ verticalAlign: "center", gap: "xs" }}>
      <DashboardIcon $size="s" />
      <Span $font={{ noWrap: true }} $tooltip={input?.fileName}>
        {input ? nameOfDashboard(input.fileName) : "Dashboard"}
      </Span>
    </Div>
  );
});

// The line between the dashboard and the agent, dragged to give either more of the tab.
const SplitHandle = ({
  onDrag,
  onDrop,
}: {
  readonly onDrag: (pointerY: number) => void;
  readonly onDrop: () => void;
}) => (
  <Div
    role="separator"
    aria-orientation="horizontal"
    $flexChild="fixed"
    $backgroundColor={{ normal: "transparent", hover: "primary" }}
    $style={{ height: 5, marginTop: -2, marginBottom: -3, cursor: "row-resize", position: "relative", zIndex: 1 }}
    onPointerDown={(event: PointerEvent<HTMLDivElement>) => event.currentTarget.setPointerCapture(event.pointerId)}
    onPointerMove={(event: PointerEvent<HTMLDivElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        onDrag(event.clientY);
      }
    }}
    onPointerUp={onDrop}
    onLostPointerCapture={onDrop}
  />
);

const DashboardBuilder = observer(({ clusterId, fileName }: DashboardTabInput) => {
  const viewModel = useSyncInject(dashboardViewModelInjectable, clusterId, fileName);
  const split = useSyncInject(agentSplitInjectable);
  const { show } = useSyncInject(dashboardTabsInjectable);
  // The tab on screen, which the line between the dashboard and the agent is dragged within.
  const tab = useRef<HTMLDivElement>(null);
  const agentOpen = viewModel.agentPanelOpen.get();
  const share = split.share.get();

  useEffect(() => show({ clusterId, fileName }), [show, clusterId, fileName]);

  const dragTo = (pointerY: number) => {
    const bounds = tab.current?.getBoundingClientRect();

    if (bounds) {
      split.dragTo(pointerY, bounds.top, bounds.height);
    }
  };

  return (
    <Div $ref={tab} $flex={{ direction: "vertical" }} $height="full">
      <Div $style={{ flex: agentOpen ? `${1 - share} 1 0` : "1 1 0", minHeight: 0 }}>
        <Contained what="The dashboard">
          <DashboardView clusterId={clusterId} fileName={fileName} />
        </Contained>
      </Div>
      {agentOpen && (
        <>
          <SplitHandle onDrag={dragTo} onDrop={split.drop} />
          <Div $style={{ flex: `${share} 1 0`, minHeight: 0 }}>
            <Contained what="The agent">
              <AgentPanel viewModel={viewModel} />
            </Contained>
          </Div>
        </>
      )}
    </Div>
  );
});

const DashboardTab = observer(({ tabId }: TabProps<typeof mainViewTabHostKind>) => {
  const input = useSyncInject(dashboardTabInputInjectable, tabId).get();

  return input ? (
    <Contained what="This dashboard tab">
      <DashboardBuilder clusterId={input.clusterId} fileName={input.fileName} />
    </Contained>
  ) : null;
});

export const dashboardTabKindBunch = getTabKindInjectableBunch({
  tabHostKind: mainViewTabHostKind,
  kind: dashboardTabKind,
  Component: DashboardTab,
  Title: DashboardTitle,

  onTabCreate: {
    instantiate: (di) => {
      const getInputs = di.inject(dashboardTabInputsBunch.persistable);

      return () =>
        async ({ tabId, input }) => {
          (await getInputs()).set(tabId, input);
        };
    },
  },
});
