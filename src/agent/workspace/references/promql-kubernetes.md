# PromQL for Kubernetes dashboards

These are starting points. In a dashboard, add `$__cluster_filter` to every selector of these queries, `container_memory_working_set_bytes{container!="", $__cluster_filter}`; it is left out below to keep them short. Every cluster scrapes different exporters, and the same metric can carry different labels, so check each metric with a `.lens/<name>.query.json` before you build on it.

## Find out what is there

| Question                               | Query                                                                         |
| -------------------------------------- | ----------------------------------------------------------------------------- |
| Which metrics start with `container_`? | `count by (__name__) ({__name__=~"container_.*"})`                            |
| Which labels does a metric carry?      | `topk(1, container_memory_working_set_bytes)`, and read the labels of the row |
| Is kube-state-metrics installed?       | `count(kube_pod_info)`                                                        |
| Is the node exporter installed?        | `count(node_cpu_seconds_total)`                                               |
| Which jobs are scraped?                | `count by (job) (up)`                                                         |

## Workloads (cAdvisor, from the kubelet)

`container!=""` drops the series cAdvisor adds for whole pods, and `container!="POD"` drops pause containers on older runtimes.

| Panel                         | Query                                                                                                                                                                             | Unit              |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| CPU by namespace              | `sum by (namespace) (rate(container_cpu_usage_seconds_total{container!="", container!="POD"}[$__rate_interval]))`                                                                 | `decimal` (cores) |
| CPU of the busiest pods       | `topk(10, sum by (namespace, pod) (rate(container_cpu_usage_seconds_total{container!=""}[$__rate_interval])))`                                                                    | `decimal`         |
| Memory by namespace           | `sum by (namespace) (container_memory_working_set_bytes{container!="", container!="POD"})`                                                                                        | `bytes`           |
| Memory of the biggest pods    | `topk(10, sum by (namespace, pod) (container_memory_working_set_bytes{container!=""}))`                                                                                           | `bytes`           |
| CPU throttling                | `sum by (namespace, pod) (rate(container_cpu_cfs_throttled_periods_total[$__rate_interval])) / sum by (namespace, pod) (rate(container_cpu_cfs_periods_total[$__rate_interval]))` | `percent-decimal` |
| Network received by namespace | `sum by (namespace) (rate(container_network_receive_bytes_total[$__rate_interval]))`                                                                                              | `bytes/sec`       |
| Network sent by namespace     | `sum by (namespace) (rate(container_network_transmit_bytes_total[$__rate_interval]))`                                                                                             | `bytes/sec`       |

## Cluster state (kube-state-metrics)

| Panel                         | Query                                                                                        | Unit      |
| ----------------------------- | -------------------------------------------------------------------------------------------- | --------- |
| Pods running                  | `sum(kube_pod_status_phase{phase="Running"})`                                                | `decimal` |
| Pods by phase                 | `sum by (phase) (kube_pod_status_phase)`                                                     | `decimal` |
| Pods not ready                | `sum(kube_pod_status_ready{condition="false"})`                                              | `decimal` |
| Restarts in the time range    | `sum by (namespace, pod) (increase(kube_pod_container_status_restarts_total[$__range])) > 0` | `decimal` |
| Containers waiting, by reason | `sum by (reason) (kube_pod_container_status_waiting_reason)`                                 | `decimal` |
| Deployments short of replicas | `kube_deployment_spec_replicas - kube_deployment_status_replicas_available > 0`              | `decimal` |
| CPU requested by namespace    | `sum by (namespace) (kube_pod_container_resource_requests{resource="cpu"})`                  | `decimal` |
| Memory requested by namespace | `sum by (namespace) (kube_pod_container_resource_requests{resource="memory"})`               | `bytes`   |
| Nodes ready                   | `sum(kube_node_status_condition{condition="Ready", status="true"})`                          | `decimal` |

## Nodes (node exporter)

| Panel                | Query                                                                                                              | Unit              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------- |
| CPU used per node    | `1 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[$__rate_interval]))`                              | `percent-decimal` |
| Memory used per node | `1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes`                                                  | `percent-decimal` |
| Disk used per node   | `1 - node_filesystem_avail_bytes{fstype!~"tmpfs\|overlay"} / node_filesystem_size_bytes{fstype!~"tmpfs\|overlay"}` | `percent-decimal` |
| Load per core        | `node_load1 / count by (instance) (node_cpu_seconds_total{mode="idle"})`                                           | `decimal`         |

## Usage against what was requested

| Panel                                  | Query                                                                                                                                                                       | Unit              |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| CPU used / requested, by namespace     | `sum by (namespace) (rate(container_cpu_usage_seconds_total{container!=""}[$__rate_interval])) / sum by (namespace) (kube_pod_container_resource_requests{resource="cpu"})` | `percent-decimal` |
| Cluster CPU requested / allocatable    | `sum(kube_pod_container_resource_requests{resource="cpu"}) / sum(kube_node_status_allocatable{resource="cpu"})`                                                             | `percent-decimal` |
| Cluster memory requested / allocatable | `sum(kube_pod_container_resource_requests{resource="memory"}) / sum(kube_node_status_allocatable{resource="memory"})`                                                       | `percent-decimal` |

## Control plane

| Panel                       | Query                                                                                                                            | Unit           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| API server requests by verb | `sum by (verb) (rate(apiserver_request_total[$__rate_interval]))`                                                                | `requests/sec` |
| API server errors           | `sum by (code) (rate(apiserver_request_total{code=~"5.."}[$__rate_interval]))`                                                   | `requests/sec` |
| API server p99 latency      | `histogram_quantile(0.99, sum by (le, verb) (rate(apiserver_request_duration_seconds_bucket{verb!="WATCH"}[$__rate_interval])))` | `seconds`      |

## Tips

- In the queries of a dashboard with a `namespace` variable, add `namespace=~"$namespace"` to every selector that has the label.
- `$__rate_interval` belongs in every `rate()`, `irate()` and `increase()` over time. `$__range` is the whole time range, for an `increase()` over all of it.
- A ratio of two sums only matches when both sides aggregate by the same labels.
- `histogram_quantile` takes the rate of `_bucket` series, aggregated `by (le, ...)`.
