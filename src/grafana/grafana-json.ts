// Grafana's dashboard JSON as it is read here: loosely, since it changed shape across Grafana's
// versions, and every field may be missing.

export type Json = Readonly<Record<string, unknown>>;

export const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const objectOf = (value: unknown): Json => (isObject(value) ? value : {});

export const arrayOf = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

export const stringOf = (value: unknown): string | undefined =>
  typeof value === "string" ? value : typeof value === "number" ? String(value) : undefined;

export const numberOf = (value: unknown): number | undefined => {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;

  return typeof number === "number" && Number.isFinite(number) ? number : undefined;
};

export interface GridPos {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export const gridPosOf = (panel: Json): GridPos => {
  const pos = objectOf(panel.gridPos);

  return {
    x: numberOf(pos.x) ?? 0,
    y: numberOf(pos.y) ?? 0,
    w: numberOf(pos.w) ?? 12,
    h: numberOf(pos.h) ?? 8,
  };
};

/** Whether JSON is a Grafana dashboard, bare or as Grafana's API or a resource of it wraps one. */
export const isGrafanaDashboard = (json: unknown): boolean => {
  const dashboard = unwrapGrafanaDashboard(json);

  return (
    isObject(dashboard) &&
    dashboard.kind !== "Dashboard" &&
    (Array.isArray(dashboard.panels) || Array.isArray(dashboard.rows) || isObject(dashboard.elements))
  );
};

/**
 * The dashboard itself: Grafana's API answers `{ dashboard, meta }`, and a dashboard kept as a
 * Kubernetes-style resource, as Grafana 12 does, has it as its `spec`.
 */
export const unwrapGrafanaDashboard = (json: unknown): unknown => {
  if (!isObject(json)) {
    return json;
  }

  if (isObject(json.dashboard)) {
    return json.dashboard;
  }

  if (
    typeof json.apiVersion === "string" &&
    json.apiVersion.startsWith("dashboard.grafana.app") &&
    isObject(json.spec)
  ) {
    return json.spec;
  }

  return json;
};
