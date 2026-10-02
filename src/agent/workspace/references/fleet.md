# Fleet dashboards

The dashboards in `fleet/` are not one cluster's. Each is drawn from a **data source** the user picks above it, and shows the clusters they pick next to it:

- a **hub**, such as Thanos Query, which holds the metrics of many clusters and names the cluster of each series in a label (often `cluster`, sometimes `k8s_cluster` or another);
- **each cluster's own Prometheus**, when there is no hub: Lens asks every chosen cluster the same query and puts the answers together.

The same dashboard has to work with either, and with whichever clusters are chosen. Lens makes that possible with two built-in variables, which you use instead of naming a cluster label yourself:

| Write | Lens fills in | Use it |
| --- | --- | --- |
| `$__cluster_filter` | the matcher for the chosen clusters: `cluster=~"eu-1\|eu-2"` on a hub, a matcher every series has when Lens asks each cluster | inside **every** selector: `up{job="kubelet", $__cluster_filter}` |
| `$__cluster_label` | the label the hub keeps clusters in, or `cluster` | in every `by (...)` that should keep clusters apart: `sum by ($__cluster_label, namespace) (...)` |

Whatever the source, every series that comes back has a **`cluster` label** with its cluster's name. Use `{{cluster}}` in `seriesNameFormat` and a `cluster` column in tables; never `{{k8s_cluster}}` or another name.

## Rules

- Put `$__cluster_filter` into every selector of every query, including the ones inside `rate()`, ratios and `histogram_quantile`: `sum by ($__cluster_label) (rate(container_cpu_usage_seconds_total{container!="", $__cluster_filter}[$__rate_interval]))`.
- Keep `$__cluster_label` in the `by (...)` of every aggregation, so clusters stay apart: one series per cluster, or per cluster and namespace.
- **Do not total across clusters in PromQL** (`sum(...)` without `by ($__cluster_label)`). On a hub that works, but when Lens asks each cluster, every cluster answers its own total and they cannot be added up in the query. Show per-cluster values instead: a bar chart or table with one row per cluster reads better anyway.
- Do not add a `cluster` variable: the cluster picker above the dashboard is Lens's own. Variables for other labels the hub has, such as `stack`, `env` or `region`, are fine: list their values with `PrometheusLabelValuesVariable` and `"matchers": ["up{$__cluster_filter}"]`.
- Check queries the usual way, with `.lens/fleet/<name>.query.json`: they are run against the dashboard's data source and clusters as chosen, with the built-ins filled in.

## Panels that suit a fleet

| Panel | Query | Panel type |
| --- | --- | --- |
| Clusters and their targets up | `sum by ($__cluster_label) (up{$__cluster_filter})` | Table, a row per cluster |
| CPU by cluster | `sum by ($__cluster_label) (rate(container_cpu_usage_seconds_total{container!="", $__cluster_filter}[$__rate_interval]))` | TimeSeriesChart, `{{cluster}}` |
| Memory by cluster | `sum by ($__cluster_label) (container_memory_working_set_bytes{container!="", $__cluster_filter})` | BarChart, `{{cluster}}`, unit `bytes` |
| Pods not ready, by cluster | `sum by ($__cluster_label) (kube_pod_status_ready{condition="false", $__cluster_filter})` | BarChart |
| Nodes ready, by cluster | `sum by ($__cluster_label) (kube_node_status_condition{condition="Ready", status="true", $__cluster_filter})` | Table |
| Restarts, by cluster and namespace | `sum by ($__cluster_label, namespace) (increase(kube_pod_container_status_restarts_total{$__cluster_filter}[$__range])) > 0` | Table |
