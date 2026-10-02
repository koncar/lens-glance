import { Button, ClickableDiv, Div, Span } from "@k8slens/element-components";
import { CheckIcon } from "@k8slens/icon";
import { TextInput } from "@k8slens/input-components";
import { observer } from "mobx-react";
import type { MouseEvent } from "react";
import type { DashboardVariable, DashboardViewModel } from "./dashboard-view-model.injectable";
import { allValue } from "./variable-options.injectable";
import styles from "./variable-picker.module.scss";

// Lists this long get a filter above them.
const filterFrom = 8;

// The tick box of Lens's own multiple-choice lists.
const Box = ({ ticked }: { readonly ticked: boolean }) => (
  <Span
    $size="s"
    $flexChild="fixed"
    $flex={{ horizontalAlign: "center", verticalAlign: "center" }}
    $border={{ width: "xxs", radius: "s", color: ticked ? "primary" : "grey20" }}
    $backgroundColor={ticked ? "primary" : "transparent"}
    $color="white"
  >
    {ticked && <CheckIcon $size="xs" />}
  </Span>
);

interface OptionRowProps {
  readonly label: string;
  readonly ticked: boolean;
  readonly onToggle: () => void;
  readonly onOnly?: () => void;
}

// A row of Lens's own multiple-choice lists, with "Only" at its end: choose this value and
// none of the others, as dashboards in Datadog and Grafana offer.
const OptionRow = ({ label, ticked, onToggle, onOnly }: OptionRowProps) => (
  <ClickableDiv
    role="option"
    aria-selected={ticked}
    $className={styles.row}
    $flex={{ direction: "horizontal", gap: "xs", verticalAlign: "center" }}
    $padding={{ vertical: "3xs", horizontal: "xs" }}
    $border={{ radius: "s" }}
    $color={{ normal: "textDefault", hover: "textHighlight" }}
    $backgroundColor={{ hover: "grey60" }}
    $font={{ size: "s", noWrap: true }}
    $cursor="pointer"
    $onClick={onToggle}
  >
    <Box ticked={ticked} />
    <Span $flexChild="shrinkable" $font={{ noWrap: true, textOverflow: "ellipsis" }}>
      {label}
    </Span>
    {onOnly && (
      <Button
        $className={styles.only}
        $padding={{ horizontal: "xs" }}
        $border={{ radius: "s" }}
        $font={{ size: "xs" }}
        $color={{ normal: "textMuted", hover: "primary" }}
        $tooltip={`Show ${label} alone`}
        // The row is ticked by a click anywhere on it; this one is "Only" and nothing else.
        onClick={(event: MouseEvent) => {
          event.stopPropagation();
          onOnly();
        }}
      >
        Only
      </Button>
    )}
  </ClickableDiv>
);

export interface MultiValueOption {
  readonly value: string;
  readonly label: string;
}

export interface MultiValueListProps {
  readonly options: readonly MultiValueOption[];
  readonly isAll: boolean;
  readonly chosen: ReadonlySet<string>;
  /** Offers "All" above the values, ticked when every value is chosen. */
  readonly onToggleAll?: () => void;
  readonly onToggle: (value: string) => void;
  readonly onOnly: (value: string) => void;
  readonly filter: string;
  readonly onFilter: (filter: string) => void;
  /** What the values are, for the filter's placeholder: "values", "clusters". */
  readonly noun: string;
}

// A list of values to choose any number of: every value with its box, "All" above them, "Only"
// on each, and a filter when the list is long.
export const MultiValueList = ({
  options,
  isAll,
  chosen,
  onToggleAll,
  onToggle,
  onOnly,
  filter,
  onFilter,
  noun,
}: MultiValueListProps) => {
  const needle = filter.trim().toLowerCase();
  const shown = needle ? options.filter((option) => option.label.toLowerCase().includes(needle)) : options;

  return (
    <Div $flex={{ direction: "vertical", gap: "xs" }} $padding="xs" $style={{ minWidth: 240, maxWidth: 420 }}>
      {options.length >= filterFrom && (
        <TextInput
          type="search"
          placeholder={`Filter ${options.length} ${noun}`}
          value={filter}
          onChange={(event) => onFilter(event.target.value)}
        />
      )}
      <Div
        role="listbox"
        aria-multiselectable="true"
        $flex={{ direction: "vertical", gap: "4xs" }}
        $overflow={{ y: "auto" }}
        $style={{ maxHeight: 360 }}
      >
        {onToggleAll && !needle && <OptionRow label="All" ticked={isAll} onToggle={onToggleAll} />}
        {shown.map((option) => (
          <OptionRow
            key={option.value}
            label={option.label}
            ticked={isAll || chosen.has(option.value)}
            onToggle={() => onToggle(option.value)}
            onOnly={() => onOnly(option.value)}
          />
        ))}
        {shown.length === 0 && (
          <Span $padding="xs" $font={{ size: "s" }} $color="textMuted">
            {needle ? `No ${noun} match` : `No ${noun}`}
          </Span>
        )}
      </Div>
    </Div>
  );
};

export interface VariablePickerProps {
  readonly viewModel: DashboardViewModel;
  readonly variable: DashboardVariable;
  /** Called when a choice is done with, such as "Only": the menu it is in closes then. */
  readonly onChosen: () => void;
}

// The choice of a variable that takes several values.
export const VariablePicker = observer(({ viewModel, variable, onChosen }: VariablePickerProps) => {
  const { name, allowAllValue } = variable.definition.spec as { name: string; allowAllValue?: boolean };
  const raw = variable.value;

  return (
    <MultiValueList
      options={variable.options}
      isAll={raw === allValue || (Array.isArray(raw) && raw.includes(allValue))}
      chosen={new Set(Array.isArray(raw) ? raw : raw ? [raw] : [])}
      onToggleAll={allowAllValue ? () => viewModel.toggleAll(name) : undefined}
      onToggle={(value) => viewModel.toggleValue(name, value)}
      onOnly={(value) => {
        onChosen();
        viewModel.chooseOnly(name, value);
      }}
      filter={viewModel.filterOf(name)}
      onFilter={(filter) => viewModel.setFilter(name, filter)}
      noun="values"
    />
  );
});
