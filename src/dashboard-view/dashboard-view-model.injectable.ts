import { getInjectable2 } from "@k8slens/injectable";
import type { SelectOption } from "@k8slens/input-components";
import type { VariableStateMap } from "@perses-dev/plugin-system";
import type { VariableDefinition, VariableValue } from "@perses-dev/spec";
import {
  action,
  comparer,
  computed,
  observable,
  onBecomeObserved,
  onBecomeUnobserved,
  reaction,
  runInAction,
} from "mobx";
import { dashboardFileInjectable } from "../dashboard-files/dashboard-file.injectable";
import { metricsRouteInjectable } from "../metrics/metrics-route.injectable";
import {
  allValue,
  valueOfVariable,
  type VariableOption,
  variableOptionsInjectable,
} from "./variable-options.injectable";

export const timeRangeOptions: readonly SelectOption<string>[] = [
  { id: "5m", label: "Last 5 minutes" },
  { id: "15m", label: "Last 15 minutes" },
  { id: "30m", label: "Last 30 minutes" },
  { id: "1h", label: "Last 1 hour" },
  { id: "3h", label: "Last 3 hours" },
  { id: "6h", label: "Last 6 hours" },
  { id: "12h", label: "Last 12 hours" },
  { id: "24h", label: "Last 24 hours" },
  { id: "2d", label: "Last 2 days" },
  { id: "7d", label: "Last 7 days" },
];

export const refreshIntervalOptions: readonly SelectOption<string>[] = [
  { id: "0s", label: "Off" },
  { id: "5s", label: "Every 5 seconds" },
  { id: "10s", label: "Every 10 seconds" },
  { id: "30s", label: "Every 30 seconds" },
  { id: "1m", label: "Every minute" },
  { id: "5m", label: "Every 5 minutes" },
];

export const labelOf = (options: readonly SelectOption<string>[], id: string) =>
  options.find((option) => option.id === id)?.label ?? id;

/** What the side panel of a dashboard shows, while it is open. */
export type DashboardEditor =
  | { readonly kind: "panel"; readonly key?: string; readonly groupIndex: number }
  | { readonly kind: "variables" }
  | { readonly kind: "json" }
  | { readonly kind: "queries"; readonly key: string };

export interface DashboardVariable {
  readonly definition: VariableDefinition;
  readonly options: readonly VariableOption[];
  readonly value: VariableValue;
  readonly error?: string;
}

// What a query has the variable replaced with. "All" is not a value Prometheus knows: as
// Perses's own dashboards do, it stands for every option, or for the variable's custom value
// for all when it has one.
const interpolatedValueOf = (
  definition: VariableDefinition,
  value: VariableValue,
  options: readonly VariableOption[],
): VariableValue => {
  const meansAll = value === allValue || (Array.isArray(value) && value.includes(allValue));

  if (!meansAll || definition.kind !== "ListVariable") {
    return value;
  }

  return definition.spec.customAllValue ?? options.map((option) => option.value);
};

interface ResolvedVariables {
  readonly states: VariableStateMap;
  readonly variables: readonly DashboardVariable[];
  readonly loading: boolean;
}

// Everything one dashboard tab shows and the user changes about it: the dashboard as its file
// has it, the time range and refresh interval picked, and the variables with their options and
// values. The file stays the source of the dashboard; what the user picks lives here, so it
// survives the file being changed underneath.
export const dashboardViewModelInjectable = getInjectable2({
  id: "lens-glance-dashboard-view-model",

  instantiate: (di) => {
    const fileOf = di.inject(dashboardFileInjectable);
    const getVariableOptions = di.inject(variableOptionsInjectable)();
    const routeOf = di.inject(metricsRouteInjectable);

    return (clusterId: string, fileName: string) => {
      const file = fileOf(fileName);
      const route = routeOf(clusterId, fileName);
      const pickedDuration = observable.box<string | undefined>(undefined);
      const pickedRefreshInterval = observable.box<string | undefined>(undefined);
      const refreshRequests = observable.box(0);
      const chosenValues = observable.map<string, VariableValue>({}, { deep: false });
      const collapsedGroups = observable.set<number>();
      const agentPanelOpen = observable.box(true);
      const optionFilters = observable.map<string, string>();
      // Whether the user changes the dashboard by hand here. Off, only the file changes it.
      const editing = observable.box(false);
      const editor = observable.box<DashboardEditor | undefined>(undefined, { deep: false });
      const jsonDraft = observable.box("");
      const resolved = observable.box<ResolvedVariables>(
        { states: {}, variables: [], loading: false },
        { deep: false },
      );

      const dashboard = computed(() => {
        const current = file.get();

        return current.status === "loaded" ? current.dashboard : undefined;
      });

      const variableDefinitions = computed(() => dashboard.get()?.spec.variables ?? [], {
        equals: comparer.structural,
      });

      let generation = 0;

      // Variables are resolved in order, each with the values of those before it, since a
      // variable's options may be filtered by another's value.
      const resolveVariables = async (
        definitions: readonly VariableDefinition[],
        chosen: Readonly<Record<string, VariableValue>>,
      ) => {
        const current = ++generation;
        const states: VariableStateMap = {};
        const variables: DashboardVariable[] = [];

        runInAction(() => resolved.set({ ...resolved.get(), loading: true }));

        for (const definition of definitions) {
          const name = definition.spec.name;
          let options: VariableOption[] = [];
          let error: string | undefined;

          if (definition.kind === "ListVariable") {
            try {
              options = await getVariableOptions(route, definition, states);
            } catch (caught) {
              error = String((caught as Error).message ?? caught);
            }
          }

          if (current !== generation) {
            return;
          }

          const value = valueOfVariable(definition, options, chosen[name]);

          states[name] = {
            value: interpolatedValueOf(definition, value, options),
            options: [...options],
            loading: false,
          };
          variables.push({ definition, options, value, error });
        }

        runInAction(() => resolved.set({ states, variables, loading: false }));
      };

      let stopResolving: (() => void) | undefined;

      onBecomeObserved(resolved, () => {
        stopResolving = reaction(
          () => ({
            definitions: variableDefinitions.get(),
            chosen: Object.fromEntries(chosenValues),
            refresh: refreshRequests.get(),
          }),
          ({ definitions, chosen }) => void resolveVariables(definitions, chosen),
          { fireImmediately: true, equals: comparer.structural },
        );
      });

      onBecomeUnobserved(resolved, () => stopResolving?.());

      // What was asked by one route is asked again by another: the panels are refreshed, and the
      // variables with them, when the dashboard is drawn from elsewhere.
      let stopFollowingRoute: (() => void) | undefined;

      onBecomeObserved(refreshRequests, () => {
        stopFollowingRoute = reaction(
          () => route.revision.get(),
          () => runInAction(() => refreshRequests.set(refreshRequests.get() + 1)),
        );
      });

      onBecomeUnobserved(refreshRequests, () => stopFollowingRoute?.());

      return {
        clusterId,
        fileName,
        route,
        file,
        dashboard,
        variables: computed(() => resolved.get().variables),
        variableStates: computed(() => resolved.get().states),
        variablesLoading: computed(() => resolved.get().loading),
        duration: computed(() => pickedDuration.get() ?? dashboard.get()?.spec.duration ?? "1h"),
        refreshInterval: computed(() => pickedRefreshInterval.get() ?? dashboard.get()?.spec.refreshInterval ?? "0s"),
        refreshRequests: computed(() => refreshRequests.get()),
        isCollapsed: (groupIndex: number) => collapsedGroups.has(groupIndex),
        agentPanelOpen: computed(() => agentPanelOpen.get()),
        editing: computed(() => editing.get()),
        editor: computed(() => editor.get()),

        pickDuration: action((duration: string) => pickedDuration.set(duration)),
        pickRefreshInterval: action((interval: string) => pickedRefreshInterval.set(interval)),
        refresh: action(() => refreshRequests.set(refreshRequests.get() + 1)),

        chooseValue: action((name: string, value: string) => chosenValues.set(name, value)),
        // Ticking a value while "All" is chosen takes the others: all of them but the one ticked.
        // Ticking every value is choosing "All" where the variable has it; unticking the last
        // leaves none.
        toggleValue: action((name: string, value: string) => {
          const variable = resolved.get().variables.find((one) => one.definition.spec.name === name);

          if (!variable || variable.definition.kind !== "ListVariable") {
            return;
          }

          const every = variable.options.map((option) => option.value);
          const raw = variable.value;
          const meansAll = raw === allValue || (Array.isArray(raw) && raw.includes(allValue));
          const current = meansAll ? every : Array.isArray(raw) ? raw : raw ? [raw] : [];
          const next = current.includes(value) ? current.filter((one) => one !== value) : [...current, value];
          const everything = variable.definition.spec.allowAllValue && every.length > 0 && next.length === every.length;

          chosenValues.set(name, everything ? allValue : next);
        }),

        chooseOnly: action((name: string, value: string) => chosenValues.set(name, [value])),
        // "All" toggles like any other box: ticked it takes every value, unticked none.
        toggleAll: action((name: string) => {
          const raw = resolved.get().variables.find((one) => one.definition.spec.name === name)?.value;
          const isAll = raw === allValue || (Array.isArray(raw) && raw.includes(allValue));

          chosenValues.set(name, isAll ? [] : allValue);
        }),

        filterOf: (name: string) => optionFilters.get(name) ?? "",
        setFilter: action((name: string, filter: string) => optionFilters.set(name, filter)),

        toggleAgentPanel: action(() => agentPanelOpen.set(!agentPanelOpen.get())),

        toggleEditing: action(() => {
          editing.set(!editing.get());

          // What only editing shows goes away with it; the queries of a panel may stay.
          if (!editing.get() && editor.get()?.kind !== "queries") {
            editor.set(undefined);
          }
        }),

        // Editing a panel from where it is looked at, such as its queries: that is choosing to
        // edit by hand, so editing is turned on with it.
        editPanel: action((key: string) => {
          const groupIndex = Math.max(
            0,
            dashboard
              .get()
              ?.spec.layouts.findIndex((layout) =>
                (layout.spec as { items?: Array<{ content?: { $ref?: string } }> }).items?.some(
                  (item) => item.content?.$ref === `#/spec/panels/${key}`,
                ),
              ) ?? 0,
          );

          editing.set(true);
          editor.set({ kind: "panel", key, groupIndex });
        }),

        openEditor: action((next: DashboardEditor) => {
          const current = file.get();

          // The JSON editor starts from the file as it is, problems and all.
          if (next.kind === "json") {
            jsonDraft.set(current.status === "loaded" ? current.text : "");
          }

          editor.set(next);
        }),

        jsonDraft: computed(() => jsonDraft.get()),
        setJsonDraft: action((text: string) => jsonDraft.set(text)),
        closeEditor: action(() => editor.set(undefined)),

        toggleCollapsed: action((groupIndex: number) => {
          if (collapsedGroups.has(groupIndex)) {
            collapsedGroups.delete(groupIndex);
          } else {
            collapsedGroups.add(groupIndex);
          }
        }),
      };
    };
  },
});

export type DashboardViewModel = ReturnType<ReturnType<(typeof dashboardViewModelInjectable)["instantiate"]>>;
