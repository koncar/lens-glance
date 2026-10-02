import type { DashboardResource } from "@perses-dev/core";
import { panelDefinitionSchema, variableDefinitionSchema } from "@perses-dev/spec";
import { z } from "zod";

export const panelPluginKinds = ["TimeSeriesChart", "StatChart", "GaugeChart", "BarChart", "Table", "Markdown"];
export const queryPluginKind = "PrometheusTimeSeriesQuery";
export const variablePluginKinds = ["PrometheusLabelValuesVariable", "PrometheusPromQLVariable", "StaticListVariable"];

const gridItemSchema = z.object({
  x: z.number().int().min(0).max(23),
  y: z.number().int().min(0),
  width: z.number().int().min(1).max(24),
  height: z.number().int().min(1),
  content: z.object({ $ref: z.string().regex(/^#\/spec\/panels\/[^/]+$/, 'must look like "#/spec/panels/<key>"') }),
});

const dashboardSchema = z.object({
  kind: z.literal("Dashboard"),
  metadata: z.object({ name: z.string().min(1), project: z.string().optional() }).passthrough(),
  spec: z
    .object({
      display: z.object({ name: z.string(), description: z.string().optional() }).optional(),
      duration: z
        .string()
        .regex(/^\d+[smhdwy]$/, 'must be a duration such as "1h"')
        .optional(),
      refreshInterval: z
        .string()
        .regex(/^\d+[smhdwy]$/, 'must be a duration such as "30s"')
        .optional(),
      variables: z.array(variableDefinitionSchema).optional(),
      panels: z.record(panelDefinitionSchema),
      layouts: z.array(
        z.object({
          kind: z.literal("Grid"),
          spec: z.object({
            display: z.object({ title: z.string() }).passthrough().optional(),
            items: z.array(gridItemSchema),
          }),
        }),
      ),
    })
    .passthrough(),
});

const describe = (path: ReadonlyArray<string | number>) => (path.length ? path.join(".") : "(the document)");

// What makes a dashboard file wrong, in words an agent can act on, beyond what Perses's own
// schema says: layouts naming panels that are not there, and plugins Lens does not render.
const findReferenceErrors = (dashboard: z.infer<typeof dashboardSchema>) => {
  const errors: string[] = [];
  const panelKeys = new Set(Object.keys(dashboard.spec.panels));
  const placed = new Set<string>();

  dashboard.spec.layouts.forEach((layout, layoutIndex) =>
    layout.spec.items.forEach((item, itemIndex) => {
      const key = item.content.$ref.slice("#/spec/panels/".length);

      placed.add(key);

      if (!panelKeys.has(key)) {
        errors.push(
          `spec.layouts.${layoutIndex}.spec.items.${itemIndex}.content.$ref: no panel "${key}" in spec.panels`,
        );
      }

      if (item.x + item.width > 24) {
        errors.push(
          `spec.layouts.${layoutIndex}.spec.items.${itemIndex}: x + width is ${item.x + item.width}, the grid is 24 wide`,
        );
      }
    }),
  );

  for (const [key, panel] of Object.entries(dashboard.spec.panels)) {
    const plugin = panel.spec.plugin.kind;

    if (!panelPluginKinds.includes(plugin)) {
      errors.push(`spec.panels.${key}.spec.plugin.kind: "${plugin}" is not one of ${panelPluginKinds.join(", ")}`);
    }

    panel.spec.queries?.forEach((query, index) => {
      if (query.spec.plugin.kind !== queryPluginKind) {
        errors.push(`spec.panels.${key}.spec.queries.${index}.spec.plugin.kind: must be "${queryPluginKind}"`);
      }
    });

    if (!placed.has(key)) {
      errors.push(`spec.panels.${key}: not placed in any layout, so it is not shown`);
    }
  }

  return errors;
};

export type DashboardValidation =
  | { readonly valid: true; readonly dashboard: DashboardResource }
  | { readonly valid: false; readonly errors: readonly string[] };

export const validateDashboard = (text: string): DashboardValidation => {
  let json: unknown;

  try {
    json = JSON.parse(text);
  } catch (error) {
    return { valid: false, errors: [`Not valid JSON: ${(error as Error).message}`] };
  }

  const parsed = dashboardSchema.safeParse(json);

  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map((issue) => `${describe(issue.path)}: ${issue.message}`),
    };
  }

  const referenceErrors = findReferenceErrors(parsed.data);

  if (referenceErrors.length) {
    return { valid: false, errors: referenceErrors };
  }

  const dashboard = json as DashboardResource;

  return {
    valid: true,
    dashboard: {
      ...dashboard,
      metadata: {
        createdAt: "",
        updatedAt: "",
        version: 0,
        ...dashboard.metadata,
        project: dashboard.metadata.project ?? "lens",
      },
    },
  };
};
