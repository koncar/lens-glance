import type { PanelDefinition, VariableDefinition } from "@perses-dev/spec";

// The changes the user makes by hand, as functions from the dashboard's JSON to the changed
// JSON. They work on the JSON as the file has it, so whatever else is in it, written by the
// agent or by hand, is kept as it is.

interface GridItemJson {
  x: number;
  y: number;
  width: number;
  height: number;
  content: { $ref: string };
}

interface LayoutJson {
  kind: string;
  spec: { display?: { title?: string; [key: string]: unknown }; items: GridItemJson[]; [key: string]: unknown };
}

export interface DashboardJson {
  kind: string;
  metadata: Record<string, unknown>;
  spec: {
    panels: Record<string, PanelDefinition>;
    layouts: LayoutJson[];
    variables?: VariableDefinition[];
    [key: string]: unknown;
  };
}

export type DashboardEdit = (dashboard: DashboardJson) => DashboardJson;

const refOf = (key: string) => `#/spec/panels/${key}`;
const keyOfRef = ($ref: string) => $ref.slice("#/spec/panels/".length);

const bottomOf = (items: readonly GridItemJson[]) =>
  items.reduce((bottom, item) => Math.max(bottom, item.y + item.height), 0);

const groupOfPanel = (dashboard: DashboardJson, key: string) =>
  dashboard.spec.layouts.findIndex((layout) => layout.spec.items.some((item) => keyOfRef(item.content.$ref) === key));

/** A key for a new panel, from its title: camelCase, and unlike any other panel's. */
export const newPanelKey = (dashboard: DashboardJson, title: string) => {
  const words = title.toLowerCase().match(/[a-z0-9]+/g) ?? ["panel"];
  const base =
    words.map((word, index) => (index === 0 ? word : word[0].toUpperCase() + word.slice(1))).join("") || "panel";
  let key = base;

  for (let number = 2; key in dashboard.spec.panels; number++) {
    key = `${base}${number}`;
  }

  return key;
};

const ensureGroup = (dashboard: DashboardJson, groupIndex: number) => {
  if (!dashboard.spec.layouts[groupIndex]) {
    dashboard.spec.layouts.push({ kind: "Grid", spec: { display: { title: "Panels" }, items: [] } });

    return dashboard.spec.layouts.length - 1;
  }

  return groupIndex;
};

/** A new panel, at the bottom of a group, half the grid wide. */
export const addPanel =
  (panel: PanelDefinition, groupIndex: number): DashboardEdit =>
  (dashboard) => {
    const key = newPanelKey(dashboard, panel.spec.display?.name ?? "panel");
    const group = ensureGroup(dashboard, groupIndex);
    const items = dashboard.spec.layouts[group].spec.items;

    dashboard.spec.panels[key] = panel;
    items.push({ x: 0, y: bottomOf(items), width: 12, height: 8, content: { $ref: refOf(key) } });

    return dashboard;
  };

/** A panel changed: its definition replaced, and moved to another group when that was chosen. */
export const updatePanel =
  (key: string, panel: PanelDefinition, groupIndex: number): DashboardEdit =>
  (dashboard) => {
    dashboard.spec.panels[key] = panel;

    const from = groupOfPanel(dashboard, key);

    if (from !== -1 && from !== groupIndex && dashboard.spec.layouts[groupIndex]) {
      const fromItems = dashboard.spec.layouts[from].spec.items;
      const item = fromItems.find((one) => keyOfRef(one.content.$ref) === key)!;
      const toItems = dashboard.spec.layouts[groupIndex].spec.items;

      fromItems.splice(fromItems.indexOf(item), 1);
      toItems.push({ ...item, x: 0, y: bottomOf(toItems) });
    }

    return dashboard;
  };

/** A copy of a panel, the same size, at the bottom of its group, where it overlaps nothing. */
export const duplicatePanel =
  (key: string): DashboardEdit =>
  (dashboard) => {
    const panel = dashboard.spec.panels[key];
    const group = groupOfPanel(dashboard, key);

    if (!panel || group === -1) {
      return dashboard;
    }

    const copy: PanelDefinition = JSON.parse(JSON.stringify(panel));
    const title = `${panel.spec.display?.name ?? key} (copy)`;
    const copyKey = newPanelKey(dashboard, title);
    const items = dashboard.spec.layouts[group].spec.items;
    const item = items.find((one) => keyOfRef(one.content.$ref) === key)!;

    copy.spec.display = { ...copy.spec.display, name: title };
    dashboard.spec.panels[copyKey] = copy;
    items.push({ ...item, y: bottomOf(items), content: { $ref: refOf(copyKey) } });

    return dashboard;
  };

export const deletePanel =
  (key: string): DashboardEdit =>
  (dashboard) => {
    delete dashboard.spec.panels[key];

    for (const layout of dashboard.spec.layouts) {
      layout.spec.items = layout.spec.items.filter((item) => keyOfRef(item.content.$ref) !== key);
    }

    return dashboard;
  };

export const addGroup =
  (title: string): DashboardEdit =>
  (dashboard) => {
    dashboard.spec.layouts.push({ kind: "Grid", spec: { display: { title, collapse: { open: true } }, items: [] } });

    return dashboard;
  };

export const renameGroup =
  (groupIndex: number, title: string): DashboardEdit =>
  (dashboard) => {
    const layout = dashboard.spec.layouts[groupIndex];

    if (layout) {
      layout.spec.display = { ...layout.spec.display, title };
    }

    return dashboard;
  };

/** A group gone, and the panels that were only in it. */
export const deleteGroup =
  (groupIndex: number): DashboardEdit =>
  (dashboard) => {
    const [removed] = dashboard.spec.layouts.splice(groupIndex, 1);
    const stillPlaced = new Set(
      dashboard.spec.layouts.flatMap((layout) => layout.spec.items.map((item) => keyOfRef(item.content.$ref))),
    );

    for (const item of removed?.spec.items ?? []) {
      const key = keyOfRef(item.content.$ref);

      if (!stillPlaced.has(key)) {
        delete dashboard.spec.panels[key];
      }
    }

    return dashboard;
  };

export const setVariables =
  (variables: readonly VariableDefinition[]): DashboardEdit =>
  (dashboard) => {
    dashboard.spec.variables = [...variables];

    return dashboard;
  };

/** Where the panels of a group are, after the user dragged or resized them. */
export const placePanels =
  (
    groupIndex: number,
    placements: ReadonlyArray<{ key: string; x: number; y: number; width: number; height: number }>,
  ): DashboardEdit =>
  (dashboard) => {
    const byKey = new Map(placements.map((placement) => [placement.key, placement]));

    for (const item of dashboard.spec.layouts[groupIndex]?.spec.items ?? []) {
      const placement = byKey.get(keyOfRef(item.content.$ref));

      if (placement) {
        Object.assign(item, { x: placement.x, y: placement.y, width: placement.width, height: placement.height });
      }
    }

    return dashboard;
  };
