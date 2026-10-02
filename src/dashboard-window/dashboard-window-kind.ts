import { getSubWindowKind } from "@k8slens/sub-window-contracts";

export interface DashboardWindowParams {
  readonly clusterId: string;
  readonly fileName: string;
  /** What the window's title bar calls it: the dashboard, and the cluster or the fleet it shows. */
  readonly title: string;
}

// A dashboard in a window of its own, to keep on a second screen. It shows the dashboard alone:
// the agent stays in the dashboard's tab, since a window of its own has no terminal. The file is
// what both show, and each reads it, so what changes in one shows in the other.
export const dashboardWindowKind = getSubWindowKind<DashboardWindowParams>()("dashboard");

// One window per dashboard and cluster, so opening it again brings it forward.
export const dashboardWindowIdOf = (clusterId: string, fileName: string) => `dashboard(${clusterId}/${fileName})`;
