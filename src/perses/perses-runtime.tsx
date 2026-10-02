import { useSyncInject } from "@k8slens/use-inject";
import { ThemeProvider } from "@mui/material";
import { ChartsProvider, SnackbarProvider } from "@perses-dev/components";
import type { DashboardResource } from "@perses-dev/core";
import { DatasourceStoreProvider } from "@perses-dev/dashboards";
import {
  BuiltinVariableContext,
  PluginRegistry,
  TimeRangeProvider,
  useTimeRange,
  VariableContext,
} from "@perses-dev/plugin-system";
import type { DurationString } from "@perses-dev/spec";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { observer } from "mobx-react";
import { type ReactNode, useEffect } from "react";
import type { DashboardViewModel } from "../dashboard-view/dashboard-view-model.injectable";
import { lensDatasourceApi } from "./lens-datasource-api";
import { lensPersesThemeInjectable } from "./lens-theme.injectable";
import { persesPluginLoaderInjectable } from "./perses-plugin-loader.injectable";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 0 } },
});

const noBuiltinVariables = { variables: [] };

// Perses works out the absolute time range itself, once when its provider mounts and then only
// through its own setter and refresh. The time range and refresh are picked in Lens's own
// controls outside it, so this passes them in.
const TimeRangeBridge = observer(({ viewModel }: { readonly viewModel: DashboardViewModel }) => {
  const { setTimeRange, refresh } = useTimeRange();
  const duration = viewModel.duration.get();
  const refreshRequests = viewModel.refreshRequests.get();

  useEffect(() => setTimeRange({ pastDuration: duration as DurationString }), [duration]);
  useEffect(() => {
    if (refreshRequests > 0) {
      refresh();
    }
  }, [refreshRequests]);

  return null;
});

export interface PersesRuntimeProps {
  readonly viewModel: DashboardViewModel;
  readonly dashboard: DashboardResource;
  readonly children: ReactNode;
}

// What Perses's panels need around them to query and draw: its plugins, the cluster's
// Prometheus through Lens, the time range and the variables of the dashboard view, and themes
// made of Lens's colours. Lens's own components draw everything else.
export const PersesRuntime = observer(({ viewModel, dashboard, children }: PersesRuntimeProps) => {
  const { muiTheme, chartsTheme } = useSyncInject(lensPersesThemeInjectable).get();
  const pluginLoader = useSyncInject(persesPluginLoaderInjectable, viewModel.clusterId, viewModel.fileName);
  const variables = viewModel.variableStates.get();

  return (
    <ThemeProvider theme={muiTheme}>
      <ChartsProvider chartsTheme={chartsTheme}>
        <SnackbarProvider anchorOrigin={{ vertical: "bottom", horizontal: "right" }} variant="default" content="">
          <PluginRegistry
            pluginLoader={pluginLoader}
            defaultPluginKinds={{ Panel: "TimeSeriesChart", TimeSeriesQuery: "PrometheusTimeSeriesQuery" }}
          >
            <QueryClientProvider client={queryClient}>
              <TimeRangeProvider
                timeRange={{ pastDuration: viewModel.duration.get() as DurationString }}
                refreshInterval={viewModel.refreshInterval.get() as DurationString}
                setTimeRange={(value) => "pastDuration" in value && viewModel.pickDuration(value.pastDuration)}
                setRefreshInterval={(value) => viewModel.pickRefreshInterval(value)}
              >
                <TimeRangeBridge viewModel={viewModel} />
                <DatasourceStoreProvider dashboardResource={dashboard} datasourceApi={lensDatasourceApi}>
                  <VariableContext.Provider value={{ state: variables }}>
                    <BuiltinVariableContext.Provider value={noBuiltinVariables}>
                      {children}
                    </BuiltinVariableContext.Provider>
                  </VariableContext.Provider>
                </DatasourceStoreProvider>
              </TimeRangeProvider>
            </QueryClientProvider>
          </PluginRegistry>
        </SnackbarProvider>
      </ChartsProvider>
    </ThemeProvider>
  );
});
