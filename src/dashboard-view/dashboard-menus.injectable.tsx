import {
  getDropDownMenuItemInjectableBunch,
  getDropDownMenuKind,
  useCloseDropDownMenu,
} from "@k8slens/drop-down-menu-contracts";
import { type SelectOption, SingleSelect } from "@k8slens/input-components";
import { useSyncInject } from "@k8slens/use-inject";
import { observer } from "mobx-react";
import {
  dashboardViewModelInjectable,
  labelOf,
  refreshIntervalOptions,
  timeRangeOptions,
} from "./dashboard-view-model.injectable";
import { allValue } from "./variable-options.injectable";
import { VariablePicker } from "./variable-picker";

export interface DashboardMenuData {
  readonly clusterId: string;
  readonly fileName: string;
}

export interface VariableMenuData extends DashboardMenuData {
  readonly name: string;
}

export const timeRangeMenuKind = getDropDownMenuKind<DashboardMenuData>()("lens-glance-time-range-menu");
export const refreshIntervalMenuKind = getDropDownMenuKind<DashboardMenuData>()("lens-glance-refresh-interval-menu");
export const variableMenuKind = getDropDownMenuKind<VariableMenuData>()("lens-glance-variable-menu");

// A dashboard may ask for a duration that is not among the presets; it is offered too.
const withCurrent = (options: readonly SelectOption<string>[], current: string) =>
  options.some((option) => option.id === current)
    ? options
    : [...options, { id: current, label: labelOf(options, current) }];

const TimeRangeMenu = observer(({ data }: { readonly data: DashboardMenuData }) => {
  const viewModel = useSyncInject(dashboardViewModelInjectable, data.clusterId, data.fileName);
  const close = useCloseDropDownMenu();
  const duration = viewModel.duration.get();

  return (
    <SingleSelect
      options={withCurrent(timeRangeOptions, duration)}
      selected={duration}
      onSelect={(picked) => {
        close();
        viewModel.pickDuration(picked);
      }}
    />
  );
});

const RefreshIntervalMenu = observer(({ data }: { readonly data: DashboardMenuData }) => {
  const viewModel = useSyncInject(dashboardViewModelInjectable, data.clusterId, data.fileName);
  const close = useCloseDropDownMenu();
  const interval = viewModel.refreshInterval.get();

  return (
    <SingleSelect
      options={withCurrent(refreshIntervalOptions, interval)}
      selected={interval}
      onSelect={(picked) => {
        close();
        viewModel.pickRefreshInterval(picked);
      }}
    />
  );
});

const VariableMenu = observer(({ data }: { readonly data: VariableMenuData }) => {
  const viewModel = useSyncInject(dashboardViewModelInjectable, data.clusterId, data.fileName);
  const close = useCloseDropDownMenu();
  const variable = viewModel.variables.get().find((one) => one.definition.spec.name === data.name);

  if (!variable || variable.definition.kind !== "ListVariable") {
    return null;
  }

  const { allowAllValue, allowMultiple } = variable.definition.spec;
  const options: SelectOption<string>[] = [
    ...(allowAllValue ? [{ id: allValue, label: "All" }] : []),
    ...variable.options.map((option) => ({ id: option.value, label: option.label })),
  ];

  if (allowMultiple) {
    return <VariablePicker viewModel={viewModel} variable={variable} onChosen={close} />;
  }

  return (
    <SingleSelect
      options={options}
      selected={typeof variable.value === "string" ? variable.value : undefined}
      onSelect={(value) => {
        close();
        viewModel.chooseValue(data.name, value);
      }}
    />
  );
});

export const timeRangeMenuItemBunch = getDropDownMenuItemInjectableBunch({
  id: "lens-glance-time-range-menu-options",
  kind: timeRangeMenuKind,
  orderNumber: 10,
  Component: TimeRangeMenu,
});

export const refreshIntervalMenuItemBunch = getDropDownMenuItemInjectableBunch({
  id: "lens-glance-refresh-interval-menu-options",
  kind: refreshIntervalMenuKind,
  orderNumber: 10,
  Component: RefreshIntervalMenu,
});

export const variableMenuItemBunch = getDropDownMenuItemInjectableBunch({
  id: "lens-glance-variable-menu-options",
  kind: variableMenuKind,
  orderNumber: 10,
  Component: VariableMenu,
});
