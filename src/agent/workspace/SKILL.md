---
name: lens-dashboard
description: Build or change a Lens dashboard, a Perses dashboard JSON file that Lens renders live for a Kubernetes cluster. Use whenever you are asked to add, change, move, remove or fix a panel, chart, metric, variable or dashboard in this folder ("add CPU", "show memory over time", "break it down by namespace").
---

# Building Lens dashboards

Lens draws the dashboard JSON file in this folder in a tab next to you. It reads the file about twice a second, so every save is on the user's screen within a moment. Work in small, valid steps: each save should leave a dashboard that renders.

## The loop

1. **Read** the dashboard file you were pointed at, and `.lens/<name>.status.json` if it exists. That tells you what is on screen now and whether it works.
2. **Explore** before you write a query you are not sure of. Write the queries to `.lens/<name>.query.json`, wait about two seconds, and read `.lens/<name>.query.result.json`:

   ```json
   { "queries": ["count by (__name__) ({__name__=~\"container_cpu.*\"})", "kube_pod_info"] }
   ```

   The result has, per query, whether it ran (`ok`), how many series came back (`series`), and up to 50 series with their labels and current value (`rows`), or the `error`. Use it to learn which metrics exist and which labels they carry. A metric that returns no series does not exist in this cluster, or has no data, so look for another.

3. **Edit** the dashboard: read the file again first, since the user may have changed it by hand in Lens since you last read it (moved or resized panels, edited a query). Change what was asked, keep everything else as it is, including where the user put the panels. Write the whole file as valid JSON.
4. **Check**: wait about two seconds, then read `.lens/<name>.status.json`.
   - `valid: false` means Lens could not use the file. `errors` lists each problem with its path, such as `spec.panels.cpu.spec.plugin.kind: ...`. Until you fix it, the screen keeps showing the last valid version.
   - Under `panels`, every query has `ok`, `series` (how many series it returned), a `sample` of them, and `executed`, the query with the variables filled in. A query that is `ok` with `series: 0` renders an empty panel, so fix it too.
5. **Answer** in a line or two: what you changed, and where it is on the dashboard.

Lens supplies the datasource, so never add a `datasource` to a query, and never add a `datasources` section. The user picks it above the dashboard: the cluster's own Prometheus, or a hub, such as Thanos Query, that holds this cluster's metrics among others'. For the dashboard to show this cluster alone either way, **put `$__cluster_filter` into every selector of every query**, `up{job="kubelet", $__cluster_filter}`: on a hub Lens fills it in with this cluster, and on the cluster's own Prometheus it matches every series. Lens's status file warns about a query without it.

Lens also finds logs (Loki), traces (Tempo) and other data sources in the cluster, and lists them in its preferences, but dashboards can query only metrics so far: build every panel from PromQL.

## The file

```json
{
  "kind": "Dashboard",
  "metadata": { "name": "cluster", "project": "lens" },
  "spec": {
    "display": { "name": "Cluster overview" },
    "duration": "1h",
    "refreshInterval": "30s",
    "variables": [],
    "panels": {
      "cpuByNamespace": {
        "kind": "Panel",
        "spec": {
          "display": { "name": "CPU by namespace", "description": "Cores used, summed per namespace" },
          "plugin": {
            "kind": "TimeSeriesChart",
            "spec": { "yAxis": { "format": { "unit": "decimal" } }, "legend": { "position": "right" } }
          },
          "queries": [
            {
              "kind": "TimeSeriesQuery",
              "spec": {
                "plugin": {
                  "kind": "PrometheusTimeSeriesQuery",
                  "spec": {
                    "query": "sum by (namespace) (rate(container_cpu_usage_seconds_total{container!=\"\", $__cluster_filter}[$__rate_interval]))",
                    "seriesNameFormat": "{{namespace}}"
                  }
                }
              }
            }
          ]
        }
      }
    },
    "layouts": [
      {
        "kind": "Grid",
        "spec": {
          "display": { "title": "Compute" },
          "items": [{ "x": 0, "y": 0, "width": 12, "height": 8, "content": { "$ref": "#/spec/panels/cpuByNamespace" } }]
        }
      }
    ]
  }
}
```

- `spec.panels` maps a key of your choosing to a panel. Use short camelCase keys that say what the panel shows, and keep the keys of existing panels as they are.
- A panel shows only once a layout item places it with `"$ref": "#/spec/panels/<key>"`. Lens reports a panel that no layout places.
- `duration` is the default time range (`"15m"`, `"1h"`, `"6h"`, `"24h"`, `"7d"`). `refreshInterval` is how often panels refresh by themselves (`"0s"` turns that off).

## Layout

- Each entry in `layouts` is a group, with a title shown above its panels. The user can collapse a group.
- The grid is **24 columns** wide. Rows are about 30 pixels high. An item has `x` (column, 0 to 23), `y` (row), `width` and `height`, and `x + width` may not exceed 24.
- Usual sizes: a stat or a gauge is 4 to 6 wide and 4 to 5 high. A chart is 12 wide (half) or 24 wide (full), and 7 to 9 high. A table is 12 to 24 wide and 8 to 12 high.
- Put the headline numbers (stats) in a row at the top, the charts over time below them, and the detailed tables last. Keep panels of a row the same height and leave no gaps.
- To add a panel without moving the others, place it below the lowest item: its `y` is the largest `y + height` there is.

## Panels

The panel types, and their options, are in `references/panels.md`:

| `plugin.kind`     | Shows                                      | Use it for                                         |
| ----------------- | ------------------------------------------ | -------------------------------------------------- |
| `TimeSeriesChart` | lines, areas or bars over time             | anything "over time"                               |
| `StatChart`       | one big number, with an optional sparkline | a current value: pods running, CPU used            |
| `GaugeChart`      | a value against a maximum                  | utilisation in percent                             |
| `BarChart`        | one bar per series                         | comparing current values: top namespaces by memory |
| `Table`           | one row per series, a column per label     | lists: pods that restart, nodes with their usage   |
| `Markdown`        | text                                       | notes and explanations                             |

Every query is a `TimeSeriesQuery` with a `PrometheusTimeSeriesQuery` plugin, whose spec has `query` (PromQL), optional `seriesNameFormat` (the legend name, with labels as `{{label}}`), and optional `minStep` (the smallest step between points, such as `"30s"`).

Set a unit with `format`, for example `{ "unit": "bytes" }`, `{ "unit": "percent-decimal" }` for 0 to 1, `{ "unit": "percent" }` for 0 to 100, `{ "unit": "seconds" }`, `{ "unit": "bytes/sec" }` or `{ "unit": "decimal" }`. Pick the unit that matches what the query returns: it formats the values, it does not convert them.

## Variables

Variables give the user dropdowns above the dashboard, such as a namespace picker. Queries use them as `$name` or `${name}`.

```json
"variables": [
  {
    "kind": "ListVariable",
    "spec": {
      "name": "namespace",
      "display": { "name": "Namespace" },
      "allowMultiple": true,
      "allowAllValue": true,
      "plugin": {
        "kind": "PrometheusLabelValuesVariable",
        "spec": { "labelName": "namespace", "matchers": ["kube_pod_info"] }
      }
    }
  }
]
```

- With `allowMultiple` or `allowAllValue`, match with a regex: `{namespace=~"$namespace"}`. Lens fills in the choices as `(a|b)`, or every option for "All".
- With a single value, match with `=` instead: `{namespace="$namespace"}`.
- The plugins: `PrometheusLabelValuesVariable` (the values of `labelName` across the series of the `matchers`), `PrometheusPromQLVariable` (spec `expr` and `labelName`: the values of the label across the result of the expression), and `StaticListVariable` (spec `values`, a list of strings).
- A variable may use the variables before it, so `pod` can list only the pods of the chosen `namespace`: `"matchers": ["kube_pod_info{namespace=~\"$namespace\"}"]`.
- `defaultValue` sets the first choice: a string, a list for `allowMultiple`, or `"$__all"` for All.

## Queries that work

Recipes for the usual Kubernetes questions are in `references/promql-kubernetes.md`. Which metrics exist depends on what the cluster runs: the kubelet's cAdvisor (`container_*`), kube-state-metrics (`kube_*`) and the node exporter (`node_*`) are common, but not everywhere. Check with a query file before you use a metric you have not seen in this cluster.

- Rates and increases take a range: use `[$__rate_interval]`, which Lens fits to the time range.
- Aggregate to what the panel shows (`sum by (namespace) (...)`). Hundreds of series make an unreadable chart, so use `topk(10, ...)` when the user wants "the biggest".
- Give every series of a chart a readable name with `seriesNameFormat`.

## A complete example

`references/example-dashboard.json` is a working dashboard with stats, charts over time, a table and variables. Copy its structure when you build a new dashboard from scratch.

## Fleet dashboards

A dashboard in `fleet/` is not one cluster's: it shows the clusters the user picks, from a hub such as Thanos or from each cluster's own Prometheus. Its queries are written with Lens's `$__cluster_filter` and `$__cluster_label`, and its series are named by their `cluster` label. Everything above holds for it too; what is different is in `references/fleet.md`, so read that first.
