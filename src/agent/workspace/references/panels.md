# Panel types and their options

Every panel is:

```json
{
  "kind": "Panel",
  "spec": {
    "display": { "name": "Title shown on the panel", "description": "Optional, shown as a tooltip" },
    "plugin": { "kind": "<panel type>", "spec": {} },
    "queries": [
      {
        "kind": "TimeSeriesQuery",
        "spec": { "plugin": { "kind": "PrometheusTimeSeriesQuery", "spec": { "query": "..." } } }
      }
    ]
  }
}
```

A `Markdown` panel has no `queries`. Every option below is optional unless it says otherwise.

## Formats

`format` is how values are written, wherever an option takes one:

- `unit`: one of
  - `decimal`;
  - `percent` for 0 to 100, `percent-decimal` for 0 to 1;
  - `bytes` (1024-based), `decbytes` (1000-based);
  - `bits/sec`, `bytes/sec`, `decbytes/sec`, `counts/sec`, `requests/sec`, `ops/sec`, `packets/sec`, `events/sec`;
  - `nanoseconds`, `microseconds`, `milliseconds`, `seconds`, `minutes`, `hours`, `days`.
- `decimalPlaces`: a number.
- `shortValues`: `true` writes 1.2K instead of 1200.

## Calculations

Where a panel reduces a series to one value, `calculation` says how: `last-number` (the latest value that is a number, the usual choice), `last`, `first-number`, `first`, `mean`, `sum`, `min` or `max`.

## Thresholds

```json
"thresholds": { "mode": "absolute", "steps": [{ "value": 70, "color": "#ff9800" }, { "value": 90, "color": "#e53935" }] }
```

`mode` is `absolute` (values as they are) or `percent` (of `max`). Below the first step, `defaultColor` applies.

## TimeSeriesChart

Lines, areas or bars over time.

```json
{
  "kind": "TimeSeriesChart",
  "spec": {
    "legend": { "position": "bottom", "mode": "list", "size": "medium", "values": ["last-number", "max"] },
    "yAxis": { "show": true, "label": "cores", "format": { "unit": "decimal" }, "min": 0 },
    "visual": { "display": "line", "lineWidth": 1.25, "areaOpacity": 0.1, "stack": "none", "connectNulls": false },
    "thresholds": { "steps": [{ "value": 0.8, "color": "#e53935" }] }
  }
}
```

- `legend.position`: `bottom` or `right`. `legend.mode`: `list` or `table`, where a table shows the `values` as columns. Leave `legend` out to show no legend.
- `visual.display`: `line` or `bar`. `visual.stack`: `none` or `all`, which stacks the series. `areaOpacity` from 0 to 1 fills below the lines.
- `querySettings`: a list of `{ "queryIndex": 0, "colorMode": "fixed-single", "colorValue": "#3d90ce", "lineStyle": "dashed", "areaOpacity": 0.3 }` that styles the series of one query, for example a dashed limit line.

## StatChart

One big number for the panel's query, and a sparkline of it if you ask for one.

```json
{
  "kind": "StatChart",
  "spec": {
    "calculation": "last-number",
    "format": { "unit": "decimal" },
    "sparkline": {},
    "thresholds": { "steps": [{ "value": 1, "color": "#e53935" }] },
    "colorMode": "value"
  }
}
```

- `calculation` and `format` are required.
- `sparkline: {}` draws the series under the number. Leave it out for the number alone.
- `colorMode`: `none`, `value` (colours the number by the thresholds) or `background_solid`.
- A query that returns several series shows several numbers. Aggregate it to one (`sum(...)`) for a single number.

## GaugeChart

A value against a maximum.

```json
{
  "kind": "GaugeChart",
  "spec": {
    "calculation": "last-number",
    "format": { "unit": "percent" },
    "max": 100,
    "thresholds": {
      "steps": [
        { "value": 80, "color": "#ff9800" },
        { "value": 90, "color": "#e53935" }
      ]
    }
  }
}
```

- `calculation` is required. `max` is the end of the gauge, 100 by default for `percent`.

## BarChart

One bar per series, for comparing values now.

```json
{
  "kind": "BarChart",
  "spec": {
    "calculation": "last-number",
    "format": { "unit": "bytes" },
    "sort": "desc",
    "mode": "value",
    "orientation": "horizontal"
  }
}
```

- `calculation` is required. `sort`: `asc` or `desc`. `mode`: `value` or `percentage`. `orientation`: `horizontal` or `vertical`.
- Name the bars with `seriesNameFormat` on the query.

## Table

One row per series, a column per label, and the value.

```json
{
  "kind": "Table",
  "spec": {
    "density": "standard",
    "columnSettings": [
      { "name": "pod", "header": "Pod" },
      { "name": "namespace", "header": "Namespace" },
      { "name": "value", "header": "Restarts", "format": { "unit": "decimal" }, "sort": "desc" },
      { "name": "timestamp", "hide": true }
    ]
  }
}
```

- `columnSettings` names the columns by label, or `value` and `timestamp`. A column without settings is shown as it is, unless `defaultColumnHidden` is `true`.
- Each column takes `header`, `format`, `align` (`left`, `center`, `right`), `width`, `sort` (`asc`, `desc`), `enableSorting` and `hide`.
- `density`: `compact`, `standard` or `comfortable`.
- Queries for a table usually aggregate to the labels the rows need: `sum by (namespace, pod) (...)`.

## Markdown

```json
{ "kind": "Markdown", "spec": { "text": "### What this shows\nCPU is cores in use, from the kubelet." } }
```
