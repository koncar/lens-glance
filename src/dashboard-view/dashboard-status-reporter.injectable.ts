import { getInjectable2 } from "@k8slens/injectable";
import { replaceVariables, type VariableStateMap } from "@perses-dev/plugin-system";
import { comparer, computed, observable, onBecomeObserved, onBecomeUnobserved, reaction, runInAction } from "mobx";
import { dashboardsDirectoryInjectable } from "../dashboard-files/dashboards-directory.injectable";
import { fleetScope } from "../fleet/fleet-settings.injectable";
import { writeFileInjectable } from "../dashboard-files/write-file.injectable";
import { dashboardViewModelInjectable } from "./dashboard-view-model.injectable";

export interface QueryCheck {
  readonly query: string;
  readonly executed: string;
  readonly ok: boolean;
  readonly series?: number;
  readonly sample?: ReadonlyArray<{ readonly labels: Readonly<Record<string, string>>; readonly value: string }>;
  readonly error?: string;
  /** What is not wrong but will not do what was meant, such as a fleet query that ignores the clusters chosen. */
  readonly warning?: string;
}

export interface DashboardStatus {
  readonly checkedAt: string;
  readonly file: string;
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly showing: "this version" | "the last valid version" | "nothing";
  readonly variables: Readonly<
    Record<string, { readonly value: unknown; readonly options: readonly string[]; readonly error?: string }>
  >;
  readonly panels: Readonly<
    Record<string, { readonly title: string; readonly kind: string; readonly queries: readonly QueryCheck[] }>
  >;
}

export const statusFileOf = (directory: string, fileName: string) =>
  `${directory}/.lens/${fileName.replace(/\.json$/, "")}.status.json`;

// The built-in variables Perses fills in from the panel and time range, replaced the way an
// instant check of the query can use them.
const replaceBuiltins = (query: string, duration: string) =>
  query
    .replaceAll(/\$\{?__rate_interval\}?/g, "5m")
    .replaceAll(/\$\{?__interval_ms\}?/g, "60000")
    .replaceAll(/\$\{?__interval\}?/g, "1m")
    .replaceAll(/\$\{?__range\}?/g, duration);

// After every change to a dashboard's file, runs each of its panels' queries once against the
// cluster, the way the panels do, and writes what came back next to the file. That is how the
// agent editing the file knows whether what it wrote works without seeing the screen.
export const dashboardStatusReporterInjectable = getInjectable2({
  id: "lens-glance-dashboard-status-reporter",
  instantiate: (di) => {
    const writeFile = di.inject(writeFileInjectable)();
    const viewModelOf = di.inject(dashboardViewModelInjectable);
    const getDirectory = di.inject(dashboardsDirectoryInjectable);

    return (clusterId: string, fileName: string) => {
      const viewModel = viewModelOf(clusterId, fileName);
      const latest = observable.box<DashboardStatus | undefined>(undefined, { deep: false });

      const check = async (query: string, variables: VariableStateMap, duration: string): Promise<QueryCheck> => {
        const executed = replaceVariables(replaceBuiltins(query, duration), variables);
        const warning = !/\$\{?__cluster_filter\}?/.test(query)
          ? clusterId === fleetScope
            ? "A fleet query without $__cluster_filter ignores the clusters the user chose: put it into every selector."
            : "A query without $__cluster_filter shows every cluster's series when the dashboard is drawn from a hub: put it into every selector."
          : undefined;
        const now = Math.floor(Date.now() / 1000);

        try {
          const series = await viewModel.route.query(executed, { start: now, end: now, step: 60 });

          return {
            query,
            executed,
            ok: true,
            ...(warning ? { warning } : {}),
            series: series.length,
            sample: series.slice(0, 3).map((one) => ({ labels: one.metric, value: one.values.at(-1)?.[1] ?? "" })),
          };
        } catch (error) {
          return {
            query,
            executed,
            ok: false,
            error: String((error as Error).message ?? error),
            ...(warning ? { warning } : {}),
          };
        }
      };

      const report = async () => {
        const file = viewModel.file.get();

        if (file.status !== "loaded") {
          return;
        }

        const dashboard = file.dashboard;
        const variables = viewModel.variableStates.get();
        const duration = viewModel.duration.get();
        const panels: Record<string, DashboardStatus["panels"][string]> = {};

        if (file.errors.length === 0 && dashboard) {
          for (const [key, panel] of Object.entries(dashboard.spec.panels)) {
            const queries = panel.spec.queries ?? [];

            panels[key] = {
              title: panel.spec.display?.name ?? key,
              kind: panel.spec.plugin.kind,
              queries: await Promise.all(
                queries.map((one) =>
                  check(String((one.spec.plugin.spec as { query?: string }).query ?? ""), variables, duration),
                ),
              ),
            };
          }
        }

        const status: DashboardStatus = {
          checkedAt: new Date().toISOString(),
          file: fileName,
          valid: file.errors.length === 0,
          errors: file.errors,
          showing: file.errors.length === 0 ? "this version" : dashboard ? "the last valid version" : "nothing",
          variables: Object.fromEntries(
            viewModel.variables
              .get()
              .map(({ definition, options, value, error }) => [
                definition.spec.name,
                { value, options: options.slice(0, 20).map((option) => option.value), ...(error ? { error } : {}) },
              ]),
          ),
          panels,
        };

        runInAction(() => latest.set(status));
        await writeFile(statusFileOf(await getDirectory(), fileName), `${JSON.stringify(status, null, 2)}\n`);
      };

      let stopReporting: (() => void) | undefined;

      onBecomeObserved(latest, () => {
        stopReporting = reaction(
          () => {
            const file = viewModel.file.get();

            return {
              text: file.status === "loaded" ? file.text : undefined,
              route: viewModel.route.revision.get(),
              variables: viewModel.variablesLoading.get() ? undefined : viewModel.variableStates.get(),
            };
          },
          ({ text, variables }) => {
            if (text !== undefined && variables !== undefined) {
              // A report that cannot be written now, such as while Lens swaps the extension for a
              // rebuilt one, is written with the next change.
              report().catch(() => undefined);
            }
          },
          { fireImmediately: true, delay: 300, equals: comparer.structural },
        );
      });

      onBecomeUnobserved(latest, () => stopReporting?.());

      return computed(() => latest.get());
    };
  },
});
