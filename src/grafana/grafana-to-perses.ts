import {
  arrayOf,
  type GridPos,
  gridPosOf,
  isObject,
  type Json,
  numberOf,
  objectOf,
  stringOf,
  unwrapGrafanaDashboard,
} from "./grafana-json";
import { withClusterFilter, withModernVariables } from "./promql-cluster-filter";

// Turns a Grafana dashboard into the Perses dashboard Lens Glance draws: its panels into the
// panel kinds Lens draws, its PromQL queries kept with Lens's cluster filter put in, its rows into
// groups and its variables into Perses's. What has no counterpart is said in a note, and a panel
// that cannot be drawn becomes a note in its place, naming what it was and its queries.

export interface ConvertOptions {
  /** Library panels by uid: Grafana keeps their content apart from the dashboards using them. */
  readonly libraryPanels?: ReadonlyMap<string, unknown>;
}

export interface Conversion {
  /** The Perses dashboard, as it is written to its file. */
  readonly dashboard: Json;
  /** What could not be carried over, a line each, naming the panel or variable it is of. */
  readonly notes: readonly string[];
}

interface Context {
  /** Variables Lens replaces or does without: the cluster, the datasource. */
  readonly dropped: ReadonlySet<string>;
  /** What Grafana knows each datasource by, to the kind of datasource it is. */
  readonly datasourceTypes: ReadonlyMap<string, string>;
  /** The library panels a dashboard exported for sharing carries with it, by uid. */
  readonly elements: Json;
  readonly options: ConvertOptions;
  readonly notes: string[];
}

type PanelPlugin = { readonly kind: string; readonly spec: Json };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const definedEntries = (entries: Record<string, unknown>): Json =>
  Object.fromEntries(Object.entries(entries).filter(([, value]) => value !== undefined));

const slugOf = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// --- Units, colours, calculations -------------------------------------------------------------

const units: Readonly<Record<string, { readonly unit: string; readonly shortValues?: boolean }>> = {
  "": { unit: "decimal" },
  none: { unit: "decimal" },
  short: { unit: "decimal", shortValues: true },
  locale: { unit: "decimal" },
  sishort: { unit: "decimal", shortValues: true },
  percent: { unit: "percent" },
  percentunit: { unit: "percent-decimal" },
  bytes: { unit: "bytes" },
  decbytes: { unit: "decbytes" },
  bits: { unit: "bits" },
  decbits: { unit: "decbits" },
  Bps: { unit: "decbytes/sec" },
  binBps: { unit: "bytes/sec" },
  bps: { unit: "decbits/sec" },
  binbps: { unit: "bits/sec" },
  pps: { unit: "packets/sec" },
  reqps: { unit: "requests/sec" },
  rps: { unit: "reads/sec" },
  wps: { unit: "writes/sec" },
  iops: { unit: "ops/sec" },
  ops: { unit: "ops/sec" },
  cps: { unit: "counts/sec" },
  ns: { unit: "nanoseconds" },
  µs: { unit: "microseconds" },
  us: { unit: "microseconds" },
  ms: { unit: "milliseconds" },
  s: { unit: "seconds" },
  m: { unit: "minutes" },
  h: { unit: "hours" },
  d: { unit: "days" },
  dtdurations: { unit: "seconds" },
  dtdhms: { unit: "seconds" },
  dtdurationms: { unit: "milliseconds" },
  celsius: { unit: "celsius" },
  fahrenheit: { unit: "fahrenheit" },
  dateTimeAsIso: { unit: "datetime-iso" },
  dateTimeAsIsoNoDateIfToday: { unit: "datetime-iso" },
  dateTimeAsUS: { unit: "datetime-us" },
  dateTimeAsUSNoDateIfToday: { unit: "datetime-us" },
  dateTimeAsLocal: { unit: "datetime-local" },
  dateTimeAsSystem: { unit: "datetime-local" },
  dateTimeFromNow: { unit: "relative-time" },
};

const currencies = new Set([
  "aud",
  "cad",
  "chf",
  "cny",
  "eur",
  "gbp",
  "hkd",
  "inr",
  "jpy",
  "krw",
  "nok",
  "nzd",
  "sek",
  "sgd",
  "usd",
]);

const formatOf = (unit: string | undefined, decimals?: number): Json => {
  const currency = unit?.startsWith("currency") ? unit.slice("currency".length).toLowerCase() : undefined;
  const mapped = units[unit ?? ""] ??
    (currency && currencies.has(currency) ? { unit: currency } : undefined) ?? { unit: "decimal" };

  return definedEntries({
    unit: mapped.unit,
    shortValues: mapped.shortValues,
    decimalPlaces: decimals !== undefined && decimals >= 0 ? Math.round(decimals) : undefined,
  });
};

// Grafana's named colours, in its dark theme's shades.
const namedColors: Readonly<Record<string, string>> = {
  green: "#73BF69",
  "dark-green": "#37872D",
  "semi-dark-green": "#56A64B",
  "light-green": "#96D98D",
  "super-light-green": "#C8F2C2",
  red: "#F2495C",
  "dark-red": "#C4162A",
  "semi-dark-red": "#E02F44",
  "light-red": "#FF7383",
  "super-light-red": "#FFA6B0",
  orange: "#FF9830",
  "dark-orange": "#FA6400",
  "semi-dark-orange": "#FF780A",
  "light-orange": "#FFB357",
  "super-light-orange": "#FFCB7D",
  yellow: "#FADE2A",
  "dark-yellow": "#E0B400",
  "semi-dark-yellow": "#F2CC0C",
  "light-yellow": "#FFEE52",
  "super-light-yellow": "#FFF899",
  blue: "#5794F2",
  "dark-blue": "#1F60C4",
  "semi-dark-blue": "#3274D9",
  "light-blue": "#8AB8FF",
  "super-light-blue": "#C0D8FF",
  purple: "#B877D9",
  "dark-purple": "#8F3BB8",
  "semi-dark-purple": "#A352CC",
  "light-purple": "#CA95E5",
  "super-light-purple": "#DEB6F2",
  text: "#CCCCDC",
  transparent: "#00000000",
};

const colorOf = (color: unknown) => {
  const text = stringOf(color);

  return text ? (namedColors[text] ?? text) : undefined;
};

const calculations: Readonly<Record<string, string>> = {
  lastNotNull: "last-number",
  last: "last",
  firstNotNull: "first-number",
  first: "first",
  mean: "mean",
  sum: "sum",
  min: "min",
  max: "max",
  // What Grafana's old singlestat and graph legends called them.
  current: "last-number",
  avg: "mean",
  total: "sum",
};

const calculationOf = (name: unknown) => calculations[stringOf(name) ?? ""] ?? "last-number";

const thresholdsOf = (value: unknown): Json | undefined => {
  const thresholds = objectOf(value);
  const steps = arrayOf(thresholds.steps).map(objectOf);

  if (steps.length === 0) {
    return undefined;
  }

  const [base, ...rest] = steps;

  return definedEntries({
    mode: thresholds.mode === "percentage" ? "percent" : undefined,
    defaultColor: colorOf(base.color),
    steps: rest
      .map((step) => definedEntries({ value: numberOf(step.value), color: colorOf(step.color) }))
      .filter((step) => step.value !== undefined),
  });
};

// Grafana's old singlestat: thresholds as "80,90", and a colour below, between and above them.
const singlestatThresholdsOf = (panel: Json): Json | undefined => {
  const values = (stringOf(panel.thresholds) ?? "")
    .split(",")
    .map((one) => numberOf(one))
    .filter((one): one is number => one !== undefined);
  const colors = arrayOf(panel.colors).map(colorOf);

  if (values.length === 0) {
    return undefined;
  }

  return definedEntries({
    defaultColor: colors[0],
    steps: values.map((value, index) => definedEntries({ value, color: colors[index + 1] })),
  });
};

const mappingResultOf = (result: unknown) => {
  const mapped = objectOf(result);

  return definedEntries({ value: stringOf(mapped.text) ?? "", color: colorOf(mapped.color) });
};

const mappingsOf = (value: unknown): Json[] =>
  arrayOf(value)
    .map(objectOf)
    .flatMap((mapping): Json[] => {
      const options = objectOf(mapping.options);

      switch (mapping.type) {
        case "value":
          return Object.entries(options).map(([from, result]) => ({
            kind: "Value",
            spec: { value: from, result: mappingResultOf(result) },
          }));
        case "range":
          return [
            {
              kind: "Range",
              spec: definedEntries({
                from: numberOf(options.from),
                to: numberOf(options.to),
                result: mappingResultOf(options.result),
              }),
            },
          ];
        case "regex":
          return [
            {
              kind: "Regex",
              spec: { pattern: stringOf(options.pattern) ?? "", result: mappingResultOf(options.result) },
            },
          ];
        case "special": {
          const match = stringOf(options.match) ?? "";
          const values = match === "null+nan" ? ["null", "NaN"] : [match === "nan" ? "NaN" : match];

          return values
            .filter((one) => ["empty", "null", "NaN", "true", "false"].includes(one))
            .map((one) => ({ kind: "Misc", spec: { value: one, result: mappingResultOf(options.result) } }));
        }
        default:
          return [];
      }
    });

// Grafana's old singlestat: `valueMaps` and `rangeMaps`.
const singlestatMappingsOf = (panel: Json): Json[] => [
  ...arrayOf(panel.valueMaps)
    .map(objectOf)
    .filter((map) => map.value !== undefined && map.value !== "null")
    .map((map) => ({
      kind: "Value",
      spec: { value: stringOf(map.value) ?? "", result: { value: stringOf(map.text) ?? "" } },
    })),
  ...arrayOf(panel.rangeMaps)
    .map(objectOf)
    .map((map) => ({
      kind: "Range",
      spec: definedEntries({
        from: numberOf(map.from),
        to: numberOf(map.to),
        result: { value: stringOf(map.text) ?? "" },
      }),
    })),
];

// --- Datasources and queries ------------------------------------------------------------------

const promQlTypes = /prometheus|victoriametrics|thanos|mimir|cortex/i;

const looksLikeLogQl = (expr: string) => /\}\s*(\|[=~>]|\|\s*[a-z_]+|!=\s*["`]|!~\s*["`])/.test(expr);

const typeOfDatasource = (datasource: unknown, context: Context): string | undefined => {
  if (isObject(datasource)) {
    const type = stringOf(datasource.type);
    const uid = stringOf(datasource.uid);

    if (type && type !== "datasource") {
      return type;
    }

    if (uid === "grafana" || uid === "-- Grafana --") {
      return "grafana";
    }

    return uid ? context.datasourceTypes.get(uid) : undefined;
  }

  const name = stringOf(datasource);

  if (name === "-- Grafana --") {
    return "grafana";
  }

  return name ? context.datasourceTypes.get(name) : undefined;
};

// What a datasource is known by, to its kind: the inputs of a dashboard exported for sharing, as
// `${DS_PROMETHEUS}`, and the datasource variables, as `$datasource`.
const datasourceTypesOf = (dashboard: Json): Map<string, string> => {
  const types = new Map<string, string>();

  for (const input of arrayOf(dashboard.__inputs).map(objectOf)) {
    const name = stringOf(input.name);
    const type = stringOf(input.pluginId);

    if (name && type) {
      types.set(name, type).set(`\${${name}}`, type).set(`$${name}`, type);
    }
  }

  for (const variable of arrayOf(objectOf(dashboard.templating).list).map(objectOf)) {
    const name = stringOf(variable.name);
    const type = stringOf(variable.query);

    if (variable.type === "datasource" && name && type) {
      types.set(`\${${name}}`, type).set(`$${name}`, type).set(name, type);
    }
  }

  return types;
};

/** Text Grafana fills its variables into, written the way Perses does, without the variables dropped. */
const cleanText = (text: string, context: Context) =>
  [...context.dropped]
    .reduce(
      (cleaned, name) => cleaned.replace(new RegExp(`\\s*\\$(\\{${name}(:[^}]*)?\\}|${name}\\b)`, "g"), ""),
      withModernVariables(text),
    )
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–:|/,]+|[\s\-–:|/,]+$/g, "")
    .trim();

interface PanelQueries {
  readonly queries: readonly Json[];
  /** The refId of each query, as Grafana's overrides and table columns name them. */
  readonly refIds: readonly string[];
  /** The queries as they are written, for a note in place of a panel that cannot be drawn. */
  readonly expressions: readonly string[];
  /** The kinds of the queries left out, which only PromQL is not. */
  readonly leftOut: readonly string[];
}

const minStepOf = (...intervals: unknown[]) => {
  const interval = intervals
    .map(stringOf)
    .find((one) => one)
    ?.replace(/^>/, "");

  return interval && /^\d+[smhdwy]$/.test(interval) ? interval : undefined;
};

const seriesNameFormatOf = (legendFormat: unknown) => {
  const legend = stringOf(legendFormat);

  return legend && legend !== "__auto"
    ? withModernVariables(legend).replace(/\{\{\s*([^}\s]+)\s*\}\}/g, "{{$1}}")
    : undefined;
};

const queriesOf = (panel: Json, context: Context): PanelQueries => {
  const panelType = typeOfDatasource(panel.datasource, context);
  const queries: Json[] = [];
  const refIds: string[] = [];
  const expressions: string[] = [];
  const leftOut: string[] = [];

  arrayOf(panel.targets)
    .map(objectOf)
    .forEach((target, index) => {
      if (target.hide === true) {
        return;
      }

      const type = typeOfDatasource(target.datasource, context) ?? panelType;
      const expr = stringOf(target.expr)?.trim() ?? "";
      const isPromQl = type ? promQlTypes.test(type) : expr !== "" && !looksLikeLogQl(expr);

      if (expr) {
        expressions.push(withModernVariables(expr));
      }

      if (!isPromQl || !expr) {
        if (type || expr) {
          leftOut.push(type === "__expr__" ? "expression" : (type ?? "non-PromQL"));
        }

        return;
      }

      refIds.push(stringOf(target.refId) ?? String.fromCharCode(65 + index));
      queries.push({
        kind: "TimeSeriesQuery",
        spec: {
          plugin: {
            kind: "PrometheusTimeSeriesQuery",
            spec: definedEntries({
              query: withClusterFilter(withModernVariables(expr), context.dropped),
              seriesNameFormat: seriesNameFormatOf(target.legendFormat),
              minStep: minStepOf(target.interval, panel.interval),
            }),
          },
        },
      });
    });

  return { queries, refIds, expressions, leftOut };
};

// --- Panels -------------------------------------------------------------------------------------

const fieldDefaultsOf = (panel: Json) => objectOf(objectOf(panel.fieldConfig).defaults);

const overridesOf = (panel: Json) =>
  arrayOf(objectOf(panel.fieldConfig).overrides)
    .map(objectOf)
    .map((override) => ({
      matcher: objectOf(override.matcher),
      properties: arrayOf(override.properties).map(objectOf),
    }));

const legendOf = (legend: Json): Json | undefined => {
  if (legend.showLegend === false || legend.displayMode === "hidden") {
    return undefined;
  }

  const values = [...new Set(arrayOf(legend.calcs).flatMap((calc) => calculations[stringOf(calc) ?? ""] ?? []))];

  return definedEntries({
    position: legend.placement === "right" ? "right" : "bottom",
    mode: legend.displayMode === "table" || legend.asTable === true ? "table" : "list",
    values: values.length ? values : undefined,
  });
};

// Grafana's old graph panel kept its legend apart, each value it shows a flag of its own.
const graphLegendOf = (legend: Json): Json | undefined => {
  if (legend.show === false) {
    return undefined;
  }

  const values = (["current", "avg", "min", "max", "total"] as const)
    .filter((name) => legend[name] === true)
    .map((name) => calculations[name]);

  return definedEntries({
    position: legend.rightSide === true ? "right" : "bottom",
    mode: legend.alignAsTable === true ? "table" : "list",
    values: values.length ? values : undefined,
  });
};

const lineStyleOf = (value: unknown) => {
  const fill = stringOf(objectOf(value).fill);

  return fill === "dash" ? "dashed" : fill === "dot" ? "dotted" : undefined;
};

// Grafana's overrides of the series of one query, by its refId or by its legend, as Perses's
// settings of a query's series.
const querySettingsOf = (panel: Json, queries: PanelQueries): Json[] => {
  const legends = queries.queries.map(
    (query) => stringOf(objectOf(objectOf(objectOf(query.spec).plugin).spec).seriesNameFormat) ?? "",
  );
  const settings = new Map<number, Record<string, unknown>>();

  for (const { matcher, properties } of overridesOf(panel)) {
    const option = stringOf(matcher.options) ?? "";
    const queryIndex =
      matcher.id === "byFrameRefID"
        ? queries.refIds.indexOf(option)
        : matcher.id === "byName"
          ? legends.indexOf(option)
          : -1;

    if (queryIndex === -1) {
      continue;
    }

    const setting = settings.get(queryIndex) ?? { queryIndex };

    for (const property of properties) {
      const value = property.value;

      switch (property.id) {
        case "color": {
          const color = colorOf(objectOf(value).fixedColor);

          if (objectOf(value).mode === "fixed" && color) {
            setting.colorMode = "fixed-single";
            setting.colorValue = color;
          }

          break;
        }
        case "custom.lineStyle":
          setting.lineStyle = lineStyleOf(value);
          break;
        case "custom.fillOpacity":
          setting.areaOpacity = clamp((numberOf(value) ?? 0) / 100, 0, 1);
          break;
        case "custom.transform":
          setting.negativeY = value === "negative-Y" ? true : undefined;
          break;
        case "unit":
          setting.format = formatOf(stringOf(value));
          break;
      }
    }

    settings.set(queryIndex, setting);
  }

  return [...settings.values()].map(definedEntries).filter((setting) => Object.keys(setting).length > 1);
};

const timeSeriesOf = (panel: Json, queries: PanelQueries, title: string, context: Context): PanelPlugin => {
  if (panel.type === "graph") {
    const yAxis = objectOf(arrayOf(panel.yaxes)[0]);

    return {
      kind: "TimeSeriesChart",
      spec: definedEntries({
        legend: graphLegendOf(objectOf(panel.legend)),
        yAxis: definedEntries({
          show: true,
          label: stringOf(yAxis.label) || undefined,
          format: formatOf(stringOf(yAxis.format), numberOf(panel.decimals)),
          min: numberOf(yAxis.min),
          max: numberOf(yAxis.max),
        }),
        visual: definedEntries({
          display: panel.bars === true && panel.lines !== true ? "bar" : "line",
          lineWidth: clamp(numberOf(panel.linewidth) ?? 1, 0.25, 3),
          areaOpacity: clamp((numberOf(panel.fill) ?? 0) / 10, 0, 1),
          stack: panel.stack === true ? "all" : "none",
          connectNulls: panel.nullPointMode === "connected",
        }),
      }),
    };
  }

  const defaults = fieldDefaultsOf(panel);
  const custom = objectOf(defaults.custom);
  const stacking = stringOf(objectOf(custom.stacking).mode);
  const thresholdsStyle = stringOf(objectOf(custom.thresholdsStyle).mode);
  const querySettings = querySettingsOf(panel, queries);

  if (stacking === "percent") {
    context.notes.push(`"${title}" is stacked to 100% in Grafana; here its series are stacked as they are.`);
  }

  return {
    kind: "TimeSeriesChart",
    spec: definedEntries({
      legend: legendOf(objectOf(objectOf(panel.options).legend)),
      yAxis: definedEntries({
        show: custom.axisPlacement !== "hidden",
        label: stringOf(custom.axisLabel) || undefined,
        format: formatOf(stringOf(defaults.unit), numberOf(defaults.decimals)),
        min: numberOf(defaults.min),
        max: numberOf(defaults.max),
      }),
      visual: definedEntries({
        display: custom.drawStyle === "bars" ? "bar" : "line",
        lineWidth: clamp(numberOf(custom.lineWidth) ?? 1, 0.25, 3),
        lineStyle: lineStyleOf(custom.lineStyle),
        areaOpacity: clamp((numberOf(custom.fillOpacity) ?? 0) / 100, 0, 1),
        stack: stacking === "normal" || stacking === "percent" ? "all" : "none",
        connectNulls: custom.spanNulls === true || typeof custom.spanNulls === "number",
        showPoints: custom.showPoints === "always" ? "always" : undefined,
      }),
      // Grafana draws a chart's thresholds only when told how; it keeps default ones regardless.
      thresholds: thresholdsStyle && thresholdsStyle !== "off" ? thresholdsOf(defaults.thresholds) : undefined,
      querySettings: querySettings.length ? querySettings : undefined,
    }),
  };
};

const statOf = (panel: Json): PanelPlugin => {
  if (panel.type === "singlestat") {
    return {
      kind: "StatChart",
      spec: definedEntries({
        calculation: calculationOf(panel.valueName),
        format: formatOf(stringOf(panel.format), numberOf(panel.decimals)),
        thresholds: singlestatThresholdsOf(panel),
        sparkline: objectOf(panel.sparkline).show === true ? {} : undefined,
        colorMode: panel.colorBackground === true ? "background_solid" : panel.colorValue === true ? "value" : "none",
        mappings: singlestatMappingsOf(panel).length ? singlestatMappingsOf(panel) : undefined,
      }),
    };
  }

  const defaults = fieldDefaultsOf(panel);
  const options = objectOf(panel.options);
  const mappings = mappingsOf(defaults.mappings);

  return {
    kind: "StatChart",
    spec: definedEntries({
      calculation: calculationOf(arrayOf(objectOf(options.reduceOptions).calcs)[0]),
      format: formatOf(stringOf(defaults.unit), numberOf(defaults.decimals)),
      thresholds: thresholdsOf(defaults.thresholds),
      sparkline: options.graphMode === "none" ? undefined : {},
      colorMode:
        options.colorMode === "background" || options.colorMode === "background_solid"
          ? "background_solid"
          : options.colorMode === "none"
            ? "none"
            : "value",
      mappings: mappings.length ? mappings : undefined,
    }),
  };
};

const gaugeOf = (panel: Json): PanelPlugin => {
  if (panel.type === "singlestat") {
    return {
      kind: "GaugeChart",
      spec: definedEntries({
        calculation: calculationOf(panel.valueName),
        format: formatOf(stringOf(panel.format), numberOf(panel.decimals)),
        thresholds: singlestatThresholdsOf(panel),
        max: numberOf(objectOf(panel.gauge).maxValue),
      }),
    };
  }

  const defaults = fieldDefaultsOf(panel);
  const unit = stringOf(defaults.unit);

  return {
    kind: "GaugeChart",
    spec: definedEntries({
      calculation: calculationOf(arrayOf(objectOf(objectOf(panel.options).reduceOptions).calcs)[0]),
      format: formatOf(unit, numberOf(defaults.decimals)),
      thresholds: thresholdsOf(defaults.thresholds),
      max: numberOf(defaults.max) ?? (unit === "percent" ? 100 : unit === "percentunit" ? 1 : undefined),
    }),
  };
};

const barOf = (panel: Json): PanelPlugin => {
  const defaults = fieldDefaultsOf(panel);
  const options = objectOf(panel.options);

  return {
    kind: "BarChart",
    spec: definedEntries({
      calculation: calculationOf(arrayOf(objectOf(options.reduceOptions).calcs)[0]),
      format: formatOf(stringOf(defaults.unit), numberOf(defaults.decimals)),
      orientation: options.orientation === "vertical" ? "vertical" : "horizontal",
      mode: "value",
    }),
  };
};

// Grafana's tables name their columns by its data frames, `Time`, `Value #A`, and the labels;
// Perses's by its queries, `timestamp`, `value #1`, and the labels. Several queries are merged
// into one row per series, as Grafana's merge and join of them do.
const tableOf = (panel: Json, queries: PanelQueries, title: string, context: Context): PanelPlugin => {
  const defaults = fieldDefaultsOf(panel);
  const single = queries.queries.length <= 1;
  const columns = new Map<string, Record<string, unknown>>();
  const grafanaNames = new Map<string, string>();

  const columnOf = (grafanaName: string) => {
    if (/^Time( \d+)?$/.test(grafanaName)) {
      return "timestamp";
    }

    const value = /^Value(?: #(\w+))?$/.exec(grafanaName);

    if (value) {
      const index = value[1] ? queries.refIds.indexOf(value[1]) : 0;

      return single ? "value" : `value #${Math.max(index, 0) + 1}`;
    }

    return grafanaName;
  };

  const settingOf = (grafanaName: string) => {
    const name = columnOf(grafanaName);
    const setting = columns.get(name) ?? { name };

    columns.set(name, setting);
    grafanaNames.set(name, grafanaName);

    return setting;
  };

  const valueColumns = single ? ["value"] : queries.refIds.map((_, index) => `value #${index + 1}`);

  for (const transformation of arrayOf(panel.transformations).map(objectOf)) {
    const options = objectOf(transformation.options);

    switch (transformation.id) {
      case "organize": {
        const order = Object.entries(objectOf(options.indexByName)).sort(
          ([, one], [, other]) => (numberOf(one) ?? 0) - (numberOf(other) ?? 0),
        );

        order.forEach(([name]) => settingOf(name));

        for (const [name, excluded] of Object.entries(objectOf(options.excludeByName))) {
          if (excluded === true) {
            settingOf(name).hide = true;
          }
        }

        for (const [name, header] of Object.entries(objectOf(options.renameByName))) {
          if (stringOf(header)) {
            settingOf(name).header = stringOf(header);
          }
        }

        break;
      }
      case "sortBy": {
        const sort = objectOf(arrayOf(options.sort)[0]);
        const field = stringOf(sort.field);

        if (field) {
          settingOf(field).sort = sort.desc === true ? "desc" : "asc";
        }

        break;
      }
      case "merge":
      case "joinByField":
      case "seriesToColumns":
      case "joinByLabels":
        break;
      default:
        context.notes.push(
          `"${title}" uses Grafana's "${stringOf(transformation.id)}" transformation, which is left out.`,
        );
    }
  }

  valueColumns.forEach((name) => {
    if (!columns.has(name)) {
      columns.set(name, { name });
    }
  });

  const shownNameOf = (name: string, setting: Record<string, unknown>) =>
    stringOf(setting.header) ?? grafanaNames.get(name) ?? name;

  // Grafana matches a column by the name it shows, after renaming, or by its own.
  const columnsNamed = (option: string) =>
    [...columns.entries()]
      .filter(
        ([name, setting]) =>
          setting.header === option || grafanaNames.get(name) === option || name === columnOf(option),
      )
      .map(([, setting]) => setting);
  const changesColumns = (properties: readonly Json[]) =>
    properties.some((property) =>
      ["displayName", "unit", "decimals", "custom.hidden", "custom.width", "custom.align"].includes(
        stringOf(property.id) ?? "",
      ),
    );

  for (const { matcher, properties } of overridesOf(panel)) {
    const option = stringOf(matcher.options) ?? "";
    const regex =
      matcher.id === "byRegexp"
        ? (() => {
            try {
              const pattern = /^\/(.*)\/([a-z]*)$/s.exec(option);

              return pattern ? new RegExp(pattern[1], pattern[2].replace(/[^imsu]/g, "")) : new RegExp(option);
            } catch {
              return undefined;
            }
          })()
        : undefined;
    const named = matcher.id === "byName" ? columnsNamed(option) : [];
    const matched =
      matcher.id === "byName"
        ? named.length || !changesColumns(properties)
          ? named
          : [settingOf(option)]
        : regex
          ? [...columns.entries()]
              .filter(([name, setting]) => regex.test(shownNameOf(name, setting)))
              .map(([, setting]) => setting)
          : [];

    for (const setting of matched) {
      for (const property of properties) {
        switch (property.id) {
          case "displayName":
            setting.header = stringOf(property.value);
            break;
          case "unit":
            setting.format = {
              ...objectOf(setting.format),
              ...formatOf(stringOf(property.value)),
            };
            break;
          case "decimals":
            setting.format = { ...objectOf(setting.format), decimalPlaces: numberOf(property.value) };
            break;
          case "custom.hidden":
            setting.hide = property.value === true;
            break;
          case "custom.width":
            setting.width = numberOf(property.value);
            break;
          case "custom.align":
            setting.align = ["left", "center", "right"].includes(stringOf(property.value) ?? "")
              ? property.value
              : undefined;
            break;
        }
      }
    }
  }

  // The unit of the panel is the values' own, where an override gives them none.
  const unit = stringOf(defaults.unit);

  if (unit && unit !== "none" && unit !== "short") {
    valueColumns.forEach((name) => {
      const setting = columns.get(name)!;

      setting.format ??= formatOf(unit, numberOf(defaults.decimals));
    });
  }

  // Grafana's tables leave the time of an instant query out, which is what they show.
  const timestamp = columns.get("timestamp") ?? { name: "timestamp" };

  timestamp.hide = true;
  columns.set("timestamp", timestamp);

  return {
    kind: "Table",
    spec: definedEntries({
      columnSettings: [...columns.values()].map(definedEntries),
      transforms: single ? undefined : [{ kind: "MergeSeries", spec: {} }],
    }),
  };
};

const markdownOf = (panel: Json): PanelPlugin => {
  const options = objectOf(panel.options);
  const content = withModernVariables(stringOf(options.content) ?? stringOf(panel.content) ?? "");
  const mode = stringOf(options.mode) ?? stringOf(panel.mode);
  const language = stringOf(objectOf(options.code).language) ?? "";

  return {
    kind: "Markdown",
    spec: { text: mode === "code" ? `\`\`\`${language}\n${content}\n\`\`\`` : content },
  };
};

const panelTypeTitles: Readonly<Record<string, string>> = {
  heatmap: "heatmap",
  "state-timeline": "state timeline",
  "status-history": "status history",
  histogram: "histogram",
  logs: "logs",
  traces: "traces",
  nodeGraph: "node graph",
  flamegraph: "flame graph",
  alertlist: "alert list",
  dashlist: "dashboard list",
  annolist: "annotations list",
  news: "news",
  geomap: "geomap",
  canvas: "canvas",
  xychart: "XY chart",
  candlestick: "candlestick",
  trend: "trend",
  datagrid: "data grid",
};

// A panel that cannot be drawn becomes a note in its place, saying what it was and its queries.
const notePanelOf = (title: string, what: string, expressions: readonly string[]): PanelPlugin => ({
  kind: "Markdown",
  spec: {
    text: [
      `**${title || "This panel"}** is ${what} in Grafana, which Lens Glance does not draw.`,
      ...(expressions.length
        ? ["", "Its queries:", "", ...expressions.map((expression) => `\`\`\`\n${expression}\n\`\`\``)]
        : []),
    ].join("\n"),
  },
});

const panelKeyOf = (title: string, id: unknown, taken: Set<string>) => {
  const words = title
    .replace(/\$\{?\w+(:\w+)?\}?/g, " ")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  const camel = words
    .map((word, index) =>
      index === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join("")
    .slice(0, 40);
  const base = camel && /^[a-z]/.test(camel) ? camel : `panel${stringOf(id) ?? ""}`;
  let key = base;

  for (let suffix = 2; taken.has(key); suffix++) {
    key = `${base}${suffix}`;
  }

  taken.add(key);

  return key;
};

const unwrapLibraryModel = (element: unknown): Json | undefined => {
  if (!isObject(element)) {
    return undefined;
  }

  return isObject(element.model) ? element.model : element;
};

// A library panel is only named where it is used: its content is Grafana's to keep, or is among
// the `__elements` of a dashboard exported for sharing.
const withLibraryPanel = (panel: Json, context: Context): Json | undefined => {
  const uid = stringOf(objectOf(panel.libraryPanel).uid);

  if (!uid || (panel.type && arrayOf(panel.targets).length > 0)) {
    return panel;
  }

  const model = unwrapLibraryModel(context.options.libraryPanels?.get(uid) ?? context.elements[uid]);

  return model ? { ...model, gridPos: panel.gridPos, id: panel.id, title: panel.title ?? model.title } : undefined;
};

interface ConvertedPanel {
  readonly plugin: PanelPlugin;
  readonly queries: readonly Json[];
  readonly description?: string;
  /** The title of a library panel, which is its own where the dashboard gives it none. */
  readonly title?: string;
}

const convertPanel = (raw: Json, rawTitle: string, context: Context): ConvertedPanel => {
  const panel = withLibraryPanel(raw, context);

  if (!panel) {
    const name = stringOf(objectOf(raw.libraryPanel).name) ?? rawTitle;

    context.notes.push(`"${name}" is a library panel, whose content Grafana keeps apart, and it was not found.`);

    return { plugin: notePanelOf(rawTitle || name, "a library panel", []), queries: [], title: rawTitle || name };
  }

  const title = rawTitle || cleanText(stringOf(panel.title) ?? "", context);
  const type = stringOf(panel.type) ?? "";
  const queries = queriesOf(panel, context);
  const description = stringOf(panel.description)?.trim() || undefined;

  if (queries.leftOut.length) {
    context.notes.push(
      `"${title}": ${queries.leftOut.length} ${queries.leftOut.length === 1 ? "query" : "queries"} of ${[
        ...new Set(queries.leftOut),
      ].join(", ")} left out; Lens Glance queries Prometheus only.`,
    );
  }

  if (stringOf(panel.repeat)) {
    context.notes.push(`"${title}" is repeated for each $${stringOf(panel.repeat)} in Grafana; here it is drawn once.`);
  }

  const drawn = (plugin: PanelPlugin): ConvertedPanel =>
    queries.queries.length > 0
      ? { plugin, queries: queries.queries, description }
      : {
          plugin: notePanelOf(title, `a ${type} panel of queries Lens Glance cannot run`, queries.expressions),
          queries: [],
        };

  const converted = ((): ConvertedPanel => {
    switch (type) {
      case "timeseries":
      case "graph":
        return drawn(timeSeriesOf(panel, queries, title, context));
      case "stat":
        return drawn(statOf(panel));
      case "singlestat":
        return drawn(objectOf(panel.gauge).show === true ? gaugeOf(panel) : statOf(panel));
      case "gauge":
        return drawn(gaugeOf(panel));
      case "bargauge":
      case "barchart":
        return drawn(barOf(panel));
      case "piechart":
      case "grafana-piechart-panel":
        context.notes.push(`"${title}" is a pie chart in Grafana; here it is drawn as bars.`);

        return drawn(barOf(panel));
      case "table":
      case "table-old":
        return drawn(tableOf(panel, queries, title, context));
      case "text":
        return { plugin: markdownOf(panel), queries: [], description };
      default: {
        const what = panelTypeTitles[type] ? `a ${panelTypeTitles[type]}` : `a "${type}" panel`;

        context.notes.push(`"${title}" is ${what} in Grafana, which Lens Glance does not draw: it is a note here.`);

        return { plugin: notePanelOf(title, what, queries.expressions), queries: [] };
      }
    }
  })();

  return { ...converted, title };
};

// --- Layout -------------------------------------------------------------------------------------

interface Group {
  readonly title?: string;
  readonly collapsed: boolean;
  readonly panels: readonly Json[];
}

// Grafana's dashboards before version 5 laid panels out in rows of their own, each panel as wide
// as its `span` of 12 and as high as its row, in pixels. Rows that show no title run on as one group.
const groupsOfRows = (rows: readonly Json[]): Group[] => {
  const groups: { title?: string; collapsed: boolean; panels: Json[]; height: number }[] = [];

  for (const row of rows) {
    const title = row.showTitle === true ? stringOf(row.title) : undefined;
    const runsOn = title === undefined && groups.length > 0 && groups[groups.length - 1].title === undefined;
    const group = runsOn
      ? groups[groups.length - 1]
      : { title, collapsed: row.collapse === true, panels: [], height: 0 };
    const rowHeight = Math.max(3, Math.round((numberOf(stringOf(row.height)?.replace(/px$/, "")) ?? 250) / 30));
    let x = 0;
    let y = group.height;
    let lineHeight = 0;

    for (const panel of arrayOf(row.panels).map(objectOf)) {
      const w = clamp(Math.round((numberOf(panel.span) ?? 12) * 2), 1, 24);
      const h = Math.max(3, Math.round((numberOf(stringOf(panel.height)?.replace(/px$/, "")) ?? rowHeight * 30) / 30));

      if (x + w > 24) {
        x = 0;
        y += lineHeight;
        lineHeight = 0;
      }

      group.panels.push({ ...panel, gridPos: { x, y, w, h } });
      x += w;
      lineHeight = Math.max(lineHeight, h);
    }

    group.height = y + lineHeight;

    if (!runsOn) {
      groups.push(group);
    }
  }

  return groups;
};

// Grafana's dashboards since version 5: every panel in one grid, the rows panels of their own,
// each holding the panels below it, or holding them in itself while collapsed.
const groupsOfPanels = (panels: readonly Json[]): Group[] => {
  const sorted = [...panels].sort((one, other) => {
    const [a, b] = [gridPosOf(one), gridPosOf(other)];

    return a.y - b.y || a.x - b.x;
  });
  const groups: { title?: string; collapsed: boolean; panels: Json[] }[] = [{ collapsed: false, panels: [] }];

  for (const panel of sorted) {
    if (panel.type === "row") {
      groups.push({
        title: stringOf(panel.title) ?? "",
        collapsed: panel.collapsed === true,
        panels: panel.collapsed === true ? arrayOf(panel.panels).map(objectOf) : [],
      });
    } else {
      groups[groups.length - 1].panels.push(panel);
    }
  }

  return groups;
};

const itemOf = (position: GridPos, top: number, key: string) => {
  const width = clamp(Math.round(position.w), 1, 24);

  return {
    x: clamp(Math.round(position.x), 0, 24 - width),
    y: Math.max(0, Math.round(position.y - top)),
    width,
    height: Math.max(1, Math.round(position.h)),
    content: { $ref: `#/spec/panels/${key}` },
  };
};

// --- Variables ----------------------------------------------------------------------------------

const queryOfVariable = (variable: Json) => {
  const query = variable.query;

  return withModernVariables(stringOf(isObject(query) ? query.query : query) ?? stringOf(variable.definition) ?? "");
};

const labelValuesOf = (query: string) => {
  const bare = /^\s*label_values\(\s*([a-zA-Z_]\w*)\s*\)\s*$/.exec(query);

  if (bare) {
    return { labelName: bare[1], selector: undefined };
  }

  const selected = /^\s*label_values\(([\s\S]*),\s*([a-zA-Z_]\w*)\s*\)\s*$/.exec(query);

  return selected ? { labelName: selected[2], selector: selected[1].trim() } : undefined;
};

const isClusterVariable = (variable: Json) =>
  variable.type === "query" &&
  (variable.name === "cluster" || labelValuesOf(queryOfVariable(variable))?.labelName === "cluster");

const regexOf = (value: unknown) => {
  const regex = stringOf(value)?.trim();

  if (!regex) {
    return undefined;
  }

  return /^\/(.*)\/[a-z]*$/s.exec(regex)?.[1] ?? regex;
};

const sorts: Readonly<Record<number, string>> = {
  1: "alphabetical-asc",
  2: "alphabetical-desc",
  3: "numerical-asc",
  4: "numerical-desc",
  5: "alphabetical-ci-asc",
  6: "alphabetical-ci-desc",
  7: "alphabetical-asc",
  8: "alphabetical-desc",
};

const currentValuesOf = (variable: Json): string[] => {
  const value = objectOf(variable.current).value;

  return (Array.isArray(value) ? value : [value]).flatMap((one) => stringOf(one) ?? []);
};

const displayOf = (variable: Json, name: string) =>
  definedEntries({
    name: stringOf(variable.label) || name,
    description: stringOf(variable.description) || undefined,
    hidden: variable.hide === 2 ? true : undefined,
  });

// The value chosen in Grafana is the default where it is an option of the list, or "All".
const defaultValueOf = (variable: Json, values?: readonly string[]) => {
  const current = currentValuesOf(variable);

  if (current.includes("$__all")) {
    return variable.includeAll === true ? "$__all" : undefined;
  }

  if (!values || current.length === 0 || !current.every((one) => values.includes(one))) {
    return undefined;
  }

  return variable.multi === true ? current : current[0];
};

const listVariableOf = (variable: Json, name: string, plugin: Json, extra: Record<string, unknown> = {}): Json => ({
  kind: "ListVariable",
  spec: definedEntries({
    name,
    display: displayOf(variable, name),
    allowAllValue: variable.includeAll === true,
    allowMultiple: variable.multi === true,
    customAllValue: stringOf(variable.allValue) || undefined,
    ...extra,
    plugin,
  }),
});

const staticValuesOf = (variable: Json, query: string) => {
  const options = arrayOf(variable.options)
    .map(objectOf)
    .filter((option) => stringOf(option.value) !== undefined && option.value !== "$__all");

  if (options.length) {
    return options.map((option) => {
      const value = stringOf(option.value)!;
      const label = stringOf(option.text) ?? value;

      return label === value ? value : { label, value };
    });
  }

  return query
    .split(/(?<!\\),/)
    .map((part) => part.replace(/\\,/g, ",").trim())
    .filter((part) => part && part !== "auto")
    .map((part) => {
      const pair = /^(.*?)\s+:\s+(.*)$/.exec(part);

      return pair ? { label: pair[1], value: pair[2] } : part;
    });
};

const variableOf = (variable: Json, context: Context): Json | undefined => {
  const name = stringOf(variable.name);

  if (!name || context.dropped.has(name)) {
    return undefined;
  }

  const query = queryOfVariable(variable);

  switch (variable.type) {
    case "query": {
      const type = typeOfDatasource(variable.datasource, context);

      if (type && !promQlTypes.test(type)) {
        context.notes.push(`The variable "${name}" is listed from ${type}, which Lens Glance cannot query.`);

        return undefined;
      }

      const sort = sorts[numberOf(variable.sort) ?? 0];
      const regex = regexOf(variable.regex);
      const labelValues = labelValuesOf(query);

      if (labelValues) {
        return listVariableOf(
          variable,
          name,
          {
            kind: "PrometheusLabelValuesVariable",
            spec: {
              labelName: labelValues.labelName,
              matchers: labelValues.selector ? [withClusterFilter(labelValues.selector, context.dropped)] : [],
            },
          },
          { defaultValue: defaultValueOf(variable), capturingRegexp: regex, sort },
        );
      }

      if (/^\s*(label_names|metrics)\s*\(/.test(query)) {
        context.notes.push(`The variable "${name}" lists ${query.trim()}, which Lens Glance cannot list.`);

        return listVariableOf(variable, name, { kind: "StaticListVariable", spec: { values: [] } });
      }

      // query_result(...), or a bare query: the values are a label's, picked out by the regex
      // in Grafana. The label is read from the regex, or from what the query is summed by.
      const expr = /^\s*query_result\(([\s\S]*)\)\s*$/.exec(query)?.[1] ?? query;
      const labelOfRegex = regex ? /(\w+)=\\?"\(/.exec(regex)?.[1] : undefined;
      const labelOfQuery = /\bby\s*\(\s*(\w+)/.exec(expr)?.[1];
      const labelName = labelOfRegex ?? labelOfQuery;

      if (!labelName) {
        context.notes.push(
          `The variable "${name}" lists the series of a query; here it lists their metric names, which may need a label of their own.`,
        );
      }

      return listVariableOf(
        variable,
        name,
        {
          kind: "PrometheusPromQLVariable",
          spec: { expr: withClusterFilter(expr.trim(), context.dropped), labelName: labelName ?? "__name__" },
        },
        { defaultValue: defaultValueOf(variable), capturingRegexp: labelOfRegex ? undefined : regex, sort },
      );
    }
    case "custom":
    case "interval": {
      const values = staticValuesOf(variable, query);
      const plainValues = values.map((one) => (typeof one === "string" ? one : one.value));

      return listVariableOf(
        variable,
        name,
        { kind: "StaticListVariable", spec: { values } },
        { defaultValue: defaultValueOf(variable, plainValues) },
      );
    }
    case "constant":
      return {
        kind: "TextVariable",
        spec: { name, display: { ...displayOf(variable, name), hidden: true }, value: query, constant: true },
      };
    case "textbox":
      return {
        kind: "TextVariable",
        spec: { name, display: displayOf(variable, name), value: currentValuesOf(variable)[0] ?? query },
      };
    case "adhoc":
      context.notes.push(`The ad hoc filters "${name}" are left out.`);

      return undefined;
    default:
      context.notes.push(`The variable "${name}", of Grafana's kind "${stringOf(variable.type)}", is left out.`);

      return undefined;
  }
};

// --- The dashboard ------------------------------------------------------------------------------

const durationOf = (from: unknown) => /^now-(\d+[smhdwy])$/.exec(stringOf(from) ?? "")?.[1] ?? "1h";

const refreshIntervalOf = (refresh: unknown) => {
  const interval = stringOf(refresh) ?? "";

  return /^\d+[smhdwy]$/.test(interval) ? interval : "0s";
};

/** The Perses dashboard for a Grafana dashboard, and what of it could not be carried over. */
export const convertGrafanaDashboard = (input: unknown, options: ConvertOptions = {}): Conversion => {
  const dashboard = objectOf(unwrapGrafanaDashboard(input));

  if (isObject(dashboard.elements) && !Array.isArray(dashboard.panels)) {
    throw new Error("The dashboard is in Grafana's new v2 schema, which cannot be converted yet.");
  }

  const variables = arrayOf(objectOf(dashboard.templating).list).map(objectOf);
  const dropped = new Set(
    variables
      .filter((variable) => variable.type === "datasource" || isClusterVariable(variable))
      .flatMap((variable) => stringOf(variable.name) ?? []),
  );
  const context: Context = {
    dropped,
    datasourceTypes: datasourceTypesOf(dashboard),
    elements: objectOf(dashboard.__elements),
    options,
    notes: [],
  };
  const groups = Array.isArray(dashboard.rows)
    ? groupsOfRows(arrayOf(dashboard.rows).map(objectOf))
    : groupsOfPanels(arrayOf(dashboard.panels).map(objectOf));
  const panels: Record<string, Json> = {};
  const keys = new Set<string>();

  const layouts = groups
    .filter((group) => group.panels.length > 0)
    .map((group) => {
      const top = Math.min(...group.panels.map((panel) => gridPosOf(panel).y));
      const items = group.panels.map((raw) => {
        const converted = convertPanel(raw, cleanText(stringOf(raw.title) ?? "", context), context);
        const { plugin, queries, description } = converted;
        const title = converted.title ?? "";
        const key = panelKeyOf(title, raw.id, keys);

        panels[key] = {
          kind: "Panel",
          spec: definedEntries({
            display: definedEntries({
              name: title,
              description: description ? withModernVariables(description) : undefined,
            }),
            plugin,
            queries: queries.length ? queries : undefined,
          }),
        };

        return itemOf(gridPosOf(raw), top, key);
      });
      const title = group.title !== undefined ? cleanText(group.title, context) : undefined;

      return {
        kind: "Grid",
        spec: definedEntries({
          display: title !== undefined ? { title, collapse: { open: !group.collapsed } } : undefined,
          items,
        }),
      };
    });

  const title = stringOf(dashboard.title)?.trim() || "Grafana dashboard";
  const description = stringOf(dashboard.description)?.trim();

  return {
    dashboard: {
      kind: "Dashboard",
      metadata: { name: slugOf(title) || slugOf(stringOf(dashboard.uid) ?? "") || "dashboard", project: "lens" },
      spec: {
        display: definedEntries({ name: title, description: description || undefined }),
        duration: durationOf(objectOf(dashboard.time).from),
        refreshInterval: refreshIntervalOf(dashboard.refresh),
        variables: variables.flatMap((variable) => variableOf(variable, context) ?? []),
        panels,
        layouts,
      },
    },
    notes: [...new Set(context.notes)],
  };
};
