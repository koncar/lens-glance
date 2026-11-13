import { getInjectable2 } from "@k8slens/injectable";
import { replaceVariables, type VariableStateMap } from "@perses-dev/plugin-system";
import type { ListVariableDefinition, VariableDefinition, VariableValue } from "@perses-dev/spec";
import type { MetricsRoute } from "../metrics/metrics-route";
import { createLensPrometheusClient } from "../perses/lens-prometheus-datasource";

export interface VariableOption {
  readonly label: string;
  readonly value: string;
}

export const allValue = "$__all";

const asOptions = (values: readonly string[]): VariableOption[] => values.map((value) => ({ label: value, value }));

// A list variable's `capturingRegexp` keeps the values it matches, each as the first group it
// captures where it has one, as Perses and Grafana's own regex of a variable do.
const captured = (options: readonly VariableOption[], pattern: string | undefined): VariableOption[] => {
  if (!pattern) {
    return [...options];
  }

  let regex: RegExp;

  try {
    regex = new RegExp(pattern);
  } catch {
    return [...options];
  }

  const kept = new Map<string, VariableOption>();

  for (const option of options) {
    const match = regex.exec(option.value);

    if (match) {
      const value = match[1] ?? match[0];

      kept.set(value, match[1] === undefined ? option : { label: value, value });
    }
  }

  return [...kept.values()];
};

const sorted = (options: VariableOption[], sort: string | undefined): VariableOption[] => {
  const [kind, direction] = [sort?.replace(/-(asc|desc)$/, ""), sort?.endsWith("-desc") ? -1 : 1];
  const compare =
    kind === "numerical"
      ? (one: VariableOption, other: VariableOption) => Number(one.value) - Number(other.value)
      : kind === "alphabetical-ci"
        ? (one: VariableOption, other: VariableOption) =>
            one.label.toLowerCase().localeCompare(other.label.toLowerCase())
        : kind === "alphabetical"
          ? (one: VariableOption, other: VariableOption) =>
              one.label < other.label ? -1 : one.label > other.label ? 1 : 0
          : undefined;

  return compare ? options.sort((one, other) => compare(one, other) * direction) : options;
};

// The options of a list variable, asked by the dashboard's route with the values of the
// variables before it, which is how a variable can depend on another.
export const variableOptionsInjectable = getInjectable2({
  id: "lens-glance-variable-options",

  instantiate: () => {
    const optionsOf = async (
      route: MetricsRoute,
      variable: ListVariableDefinition,
      before: VariableStateMap,
    ): Promise<VariableOption[]> => {
      const client = createLensPrometheusClient(route);
      const { kind, spec } = variable.spec.plugin as { kind: string; spec: Record<string, unknown> };
      const interpolate = (text: unknown) => replaceVariables(String(text ?? ""), before);

      switch (kind) {
        case "PrometheusLabelValuesVariable": {
          const response = await client.labelValues({
            labelName: interpolate(spec.labelName),
            "match[]": Array.isArray(spec.matchers) ? spec.matchers.map(interpolate) : undefined,
          });

          return response.status === "success" ? asOptions(response.data) : [];
        }

        case "PrometheusPromQLVariable": {
          const labelName = interpolate(spec.labelName);
          const response = await client.instantQuery({ query: interpolate(spec.expr) });
          const result =
            response.status === "success" && response.data.resultType === "vector" ? response.data.result : [];
          const values = result.map((sample) => sample.metric[labelName]).filter((value): value is string => !!value);

          return asOptions([...new Set(values)].sort());
        }

        case "StaticListVariable": {
          const values = Array.isArray(spec.values) ? spec.values : [];

          return values.map((value: unknown) =>
            typeof value === "string" ? { label: value, value } : (value as VariableOption),
          );
        }

        default:
          throw new Error(`Variables of the kind ${kind} are not supported`);
      }
    };

    return () =>
      async (
        route: MetricsRoute,
        variable: ListVariableDefinition,
        before: VariableStateMap,
      ): Promise<VariableOption[]> =>
        sorted(captured(await optionsOf(route, variable, before), variable.spec.capturingRegexp), variable.spec.sort);
  },
});

const isValidChoice = (value: VariableValue | undefined, options: readonly VariableOption[]) => {
  if (value === undefined || value === null) {
    return false;
  }

  const values = new Set([allValue, ...options.map((option) => option.value)]);

  return Array.isArray(value) ? value.every((one) => values.has(one)) : values.has(value);
};

// What a variable is set to: what the user chose while it is still an option, else what the
// dashboard says it defaults to, else everything or the first option.
export const valueOfVariable = (
  variable: VariableDefinition,
  options: readonly VariableOption[],
  chosen: VariableValue | undefined,
): VariableValue => {
  if (variable.kind === "TextVariable") {
    return (chosen as string | undefined) ?? variable.spec.value;
  }

  if (isValidChoice(chosen, options)) {
    return chosen as VariableValue;
  }

  const { defaultValue, allowAllValue, allowMultiple } = variable.spec;

  if (defaultValue !== undefined && defaultValue !== null) {
    return defaultValue;
  }

  if (allowAllValue) {
    return allValue;
  }

  const first = options[0]?.value;

  return allowMultiple ? (first ? [first] : []) : (first ?? null);
};
