import type { PrometheusRange, PrometheusSeries } from "@k8slens/prometheus-contracts";
import type { IComputedValue } from "mobx";

/**
 * Where a dashboard's queries go: the Prometheus of the cluster it is opened for, a hub holding
 * many clusters' metrics, or every chosen cluster's Prometheus at once. Whatever answers, each
 * series names the cluster it is of in a `cluster` label, where that is known.
 */
export interface MetricsRoute {
  readonly query: (query: string, range: PrometheusRange, signal?: AbortSignal) => Promise<readonly PrometheusSeries[]>;
  /** Changes when the route goes elsewhere, such as to other clusters, so what was asked is asked again. */
  readonly revision: IComputedValue<string>;
}

/** The label every series of a fleet dashboard names its cluster by, whatever the source calls it. */
export const clusterLabel = "cluster";

/** A matcher every series has, for where a query asks for no cluster in particular. */
const everySeries = '__name__=~".+"';

// A cluster's name as a regular expression matching only it, inside a PromQL string: the
// regular expression's escapes are themselves escaped there.
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\\\$&").replace(/"/g, '\\"');

export interface ClusterSelection {
  /** The label the source keeps the cluster in, `cluster` where there is none. */
  readonly label: string;
  /** The clusters chosen, or every one. */
  readonly clusters: readonly string[] | "all";
}

// A fleet dashboard asks for its clusters with $__cluster_filter, a matcher, and groups by them
// with $__cluster_label, so that one dashboard runs against a hub and against every cluster's
// own Prometheus alike: the route fills both in for where it goes.
export const fillInClusterBuiltins = (query: string, selection: ClusterSelection | undefined) => {
  const label = selection?.label ?? clusterLabel;
  const filter =
    !selection || selection.clusters === "all"
      ? everySeries
      : selection.clusters.length === 0
        ? `${label}="__none__"`
        : `${label}=~"${selection.clusters.map(escapeRegex).join("|")}"`;

  return query
    .replace(/\$\{__cluster_filter\}|\$__cluster_filter\b/g, filter)
    .replace(/\$\{__cluster_label\}|\$__cluster_label\b/g, label);
};

/** The series with the cluster they are of named in the `cluster` label. */
export const withClusterLabel = (
  series: readonly PrometheusSeries[],
  cluster: (one: PrometheusSeries) => string | undefined,
) =>
  series.map((one) => {
    const name = cluster(one);

    return name === undefined || one.metric[clusterLabel] === name
      ? one
      : { ...one, metric: { ...one.metric, [clusterLabel]: name } };
  });
