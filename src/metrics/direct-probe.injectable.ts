import { getInjectable2 } from "@k8slens/injectable";
import { computed, observable, runInAction } from "mobx";
import { directPrometheusInjectable } from "./direct-prometheus.injectable";

export type DirectProbe =
  | { readonly status: "probing" }
  | { readonly status: "reachable"; readonly hub?: { readonly label: string; readonly clusters: readonly string[] } }
  | { readonly status: "unreachable"; readonly error: string };

// The labels a hub keeps the cluster of each series in, as when probing a cluster's metrics.
export const clusterLabels = [
  "cluster",
  "k8s_cluster",
  "cluster_name",
  "kubernetes_cluster",
  "cluster_id",
  "kube_cluster",
];

/** Which of the labels holds more than one cluster, if any does, in what `count by (...) (up)` answered. */
export const hubOf = (series: ReadonlyArray<{ readonly metric: Readonly<Record<string, string>> }>) => {
  const [label, values] = clusterLabels
    .map((one) => [one, [...new Set(series.map((each) => each.metric[one]).filter(Boolean))].sort()] as const)
    .sort(([, one], [, other]) => other.length - one.length)[0];

  return values.length >= 2 ? { label, clusters: values } : undefined;
};

const keyOf = (url: string) => url.replace(/\/+$/, "");

// Whether a Prometheus API at an address of its own answers from the user's machine, and whether
// it holds many clusters' metrics. Each address is asked once, unless asked again.
export const directProbeInjectable = getInjectable2({
  id: "lens-glance-direct-probe",

  instantiate: (di) => {
    const direct = di.inject(directPrometheusInjectable)();
    const probes = observable.map<string, DirectProbe>({}, { deep: false });

    const probe = async (url: string, again = false): Promise<DirectProbe> => {
      const key = keyOf(url);
      const known = probes.get(key);

      if (known && !again) {
        return known;
      }

      runInAction(() => probes.set(key, { status: "probing" }));

      let result: DirectProbe;

      try {
        const series = await direct.queryInstant(key, `count by (${clusterLabels.join(", ")}) (up)`);

        result = { status: "reachable", hub: hubOf(series) };
      } catch (error) {
        result = { status: "unreachable", error: String((error as Error).message ?? error) };
      }

      runInAction(() => probes.set(key, result));

      return result;
    };

    return () => ({
      probe,
      /** What probing an address found, probing it the first time it is asked for. */
      probeOf: (url: string) =>
        computed(() => {
          const known = probes.get(keyOf(url));

          if (!known) {
            void probe(url);
          }

          return known ?? ({ status: "probing" } as DirectProbe);
        }),
    });
  },
});
