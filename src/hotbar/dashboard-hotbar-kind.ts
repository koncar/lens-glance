import { getHotbarItemKind } from "@k8slens/hotbar-contracts";

export interface PinnedDashboard {
  readonly clusterId: string;
  readonly fileName: string;
}

// A dashboard pinned to Lens's hotbar, which opens it with one click from anywhere.
export const dashboardHotbarKind = getHotbarItemKind<PinnedDashboard>()("dashboard");

// Like its tab and its window, one item per dashboard and cluster; the fleet's cluster is "fleet".
export const dashboardHotbarIdOf = ({ clusterId, fileName }: PinnedDashboard) => `dashboard(${clusterId}/${fileName})`;

/** What an item's id says it is, for its menu, which is handed the id alone. */
export const pinnedDashboardOf = (id: string): PinnedDashboard | undefined => {
  const match = /^dashboard\(([^/]+)\/(.+)\)$/.exec(id);

  return match ? { clusterId: match[1], fileName: match[2] } : undefined;
};
