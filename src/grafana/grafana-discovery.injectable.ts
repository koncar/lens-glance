import { connectClusterInjectionToken } from "@k8slens/cluster-contracts";
import { getInjectable2 } from "@k8slens/injectable";
import { runKubectlInjectionToken } from "@k8slens/kubectl-contracts";
import {
  configMapKind,
  coreV1,
  kubeResourceKindIsServedInjectionToken,
  kubeResourcesInjectionToken,
  podKind,
} from "@k8slens/kubernetes-contracts";
import { action, computed, type IComputedValue, observable } from "mobx";
import { readOnce } from "../fleet/read-once";
import {
  dashboardOfApiAnswer,
  dashboardOfOperatorResource,
  dashboardsInDatabase,
  dashboardsInResource,
  type DataResource,
  type FoundGrafanaDashboard,
  type GrafanaSourceKind,
  grafanaSourceKinds,
  isLabelledForGrafana,
  libraryPanelUidsOf,
  mergeFoundDashboards,
  parseAnswer,
  uidsOfSearch,
} from "./grafana-found";
import { grafanaDashboardKind, grafanaOperatorV1alpha1, grafanaOperatorV1beta1 } from "./grafana-kinds";
import {
  answersOfApiScript,
  databaseOfScript,
  grafanaApiScript,
  grafanaContainerOf,
  grafanaDatabaseScript,
} from "./grafana-pod";
import { grafanaSourceSettingsInjectable } from "./grafana-source-settings.injectable";
import { openSqlite } from "./sqlite-reader";

/** How looking in one place went. */
export type SourceOutcome =
  | { readonly state: "off" }
  | { readonly state: "looking" }
  | { readonly state: "found"; readonly count: number; readonly notes: readonly string[] }
  /** Nothing there to look in, such as no grafana-operator installed: not a failure. */
  | { readonly state: "absent"; readonly reason: string }
  | { readonly state: "failed"; readonly error: string };

export interface GrafanaScan {
  readonly looking: boolean;
  /** Every dashboard found, once, however many places it was found in. */
  readonly dashboards: readonly FoundGrafanaDashboard[];
  readonly sources: Readonly<Record<GrafanaSourceKind, SourceOutcome>>;
}

interface GrafanaPod {
  readonly name: string;
  readonly namespace: string;
  readonly container: string;
}

const apiBatchSize = 20;

const messageOf = (error: unknown) => {
  const message = String((error as Error)?.message ?? error).trim();

  if (/executable file not found|no such file or directory/i.test(message)) {
    return "Grafana's image has no shell to run in, as its distroless image does not.";
  }

  if (/forbidden/i.test(message) && /pods\/exec/i.test(message)) {
    return "You may not run commands in pods of this cluster (pods/exec).";
  }

  return message.split("\n").slice(-3).join(" ");
};

const withTimeout = <T>(seconds: number, run: (signal: AbortSignal) => Promise<T>) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`No answer within ${seconds} seconds`)), seconds * 1000);

  return run(controller.signal).finally(() => clearTimeout(timer));
};

// Looks for Grafana's dashboards in a cluster, in each place the user allows, only when asked:
// never as a cluster connects, since asking Grafana's pod is running a command in it, which
// clusters audit. Everything read is kept in memory, and only the dashboards are kept of it.
export const grafanaDiscoveryInjectable = getInjectable2({
  id: "lens-glance-grafana-discovery",
  consumptions: [
    connectClusterInjectionToken,
    kubeResourcesInjectionToken,
    kubeResourceKindIsServedInjectionToken,
    runKubectlInjectionToken,
  ],

  instantiate: (di) => {
    const connectCluster = di.inject(connectClusterInjectionToken);
    const kubeResources = di.inject(kubeResourcesInjectionToken)();
    const kubeResourceKindIsServed = di.inject(kubeResourceKindIsServedInjectionToken)();
    const runKubectlFor = di.inject(runKubectlInjectionToken);
    const sourceSettings = di.inject(grafanaSourceSettingsInjectable)();

    const outcomes = observable.map<string, Record<GrafanaSourceKind, SourceOutcome>>({}, { deep: false });
    const found = observable.map<string, Partial<Record<GrafanaSourceKind, readonly FoundGrafanaDashboard[]>>>(
      {},
      { deep: false },
    );

    const setOutcome = action((clusterId: string, source: GrafanaSourceKind, outcome: SourceOutcome) => {
      const current = outcomes.get(clusterId);

      if (current) {
        outcomes.set(clusterId, { ...current, [source]: outcome });
      }
    });

    const setFound = action((clusterId: string, source: GrafanaSourceKind, dashboards: FoundGrafanaDashboard[]) =>
      found.set(clusterId, { ...found.get(clusterId), [source]: dashboards }),
    );

    // --- What the cluster's API shows ---------------------------------------------------------

    const configMapsOf = (clusterId: string) =>
      readOnce(kubeResources(configMapKind, coreV1, clusterId)) as Promise<readonly DataResource[]>;

    const findInConfigMaps = async (clusterId: string, configMaps: Promise<readonly DataResource[]>) =>
      (await Promise.all((await configMaps).map((configMap) => dashboardsInResource(configMap, "ConfigMap")))).flat();

    // Only the Secrets labelled for Grafana's sidecar are asked for, so no other Secret is read.
    const findInSecrets = async (clusterId: string) => {
      const answer = await runKubectlFor(clusterId)([
        "get",
        "secrets",
        "--all-namespaces",
        "--selector",
        "grafana_dashboard",
        "--output",
        "json",
      ]);
      const secrets = ((parseAnswer(answer) as { items?: DataResource[] })?.items ?? []).filter(isLabelledForGrafana);

      return (await Promise.all(secrets.map((secret) => dashboardsInResource(secret, "Secret")))).flat();
    };

    const findInOperator = async (clusterId: string, configMaps: Promise<readonly DataResource[]>) => {
      for (const apiVersion of [grafanaOperatorV1beta1, grafanaOperatorV1alpha1]) {
        if (await readOnce(kubeResourceKindIsServed(grafanaDashboardKind, apiVersion, clusterId))) {
          const resources = await readOnce(kubeResources(grafanaDashboardKind, apiVersion, clusterId));
          const maps = await configMaps.catch(() => []);
          const read = await Promise.all(resources.map((resource) => dashboardOfOperatorResource(resource, maps)));

          return {
            dashboards: read.filter((one): one is FoundGrafanaDashboard => typeof one === "object"),
            notes: read.filter((one): one is string => typeof one === "string"),
          };
        }
      }

      return undefined;
    };

    // --- Inside Grafana's pod -----------------------------------------------------------------

    // One running pod of each Grafana: its replicas share what it shows.
    const grafanaPodsOf = async (clusterId: string): Promise<GrafanaPod[]> => {
      const pods = await readOnce(kubeResources(podKind, coreV1, clusterId));
      const byInstance = new Map<string, GrafanaPod>();

      for (const pod of pods) {
        const container = grafanaContainerOf(pod);
        const namespace = pod.metadata.namespace ?? "default";

        if (!container || pod.status?.phase !== "Running") {
          continue;
        }

        const labels = pod.metadata.labels ?? {};
        const instance =
          labels["app.kubernetes.io/instance"] ??
          labels.app ??
          pod.metadata.ownerReferences?.[0]?.name ??
          pod.metadata.name;
        const key = `${namespace}/${instance}`;

        if (!byInstance.has(key)) {
          byInstance.set(key, { name: pod.metadata.name, namespace, container });
        }
      }

      return [...byInstance.values()];
    };

    const execIn = (clusterId: string, pod: GrafanaPod, script: string, args: readonly string[], seconds: number) =>
      withTimeout(seconds, (signal) =>
        runKubectlFor(clusterId)(
          [
            "exec",
            pod.name,
            "--namespace",
            pod.namespace,
            "--container",
            pod.container,
            "--",
            "sh",
            "-c",
            script,
            "sh",
            ...args,
          ],
          { signal },
        ),
      );

    const askApi = async (clusterId: string, pod: GrafanaPod, paths: readonly string[]) => {
      const answers = [];

      for (let start = 0; start < paths.length; start += apiBatchSize) {
        const batch = answersOfApiScript(
          await execIn(clusterId, pod, grafanaApiScript, paths.slice(start, start + apiBatchSize), 60),
        );

        if (batch === "no-credentials") {
          throw new Error("Grafana's pod is not started with an admin password in its environment to sign in with.");
        }

        if (batch.some((answer) => answer.status === 401 || answer.status === 403)) {
          throw new Error(
            "Grafana refused the admin credentials its pod is started with: they were likely changed in Grafana since.",
          );
        }

        answers.push(...batch);
      }

      return answers;
    };

    const findInApi = async (clusterId: string, pod: GrafanaPod) => {
      const where = `Grafana's API in ${pod.namespace}/${pod.name}`;
      const [search] = await askApi(clusterId, pod, ["/api/search?type=dash-db&limit=5000"]);

      if (!search || search.status !== 200) {
        throw new Error(`Grafana's API answered ${search?.status || "nothing"}: ${search?.body.slice(0, 200) ?? ""}`);
      }

      const uids = uidsOfSearch(parseAnswer(search.body));
      const answers = await askApi(
        clusterId,
        pod,
        uids.map((uid) => `/api/dashboards/uid/${encodeURIComponent(uid)}`),
      );
      const dashboards = answers.flatMap((answer) => {
        const one = answer.status === 200 ? dashboardOfApiAnswer(parseAnswer(answer.body), where) : undefined;

        return one ? [one] : [];
      });
      const libraryUids = libraryPanelUidsOf(dashboards.map((dashboard) => dashboard.json));
      const libraryAnswers = await askApi(
        clusterId,
        pod,
        libraryUids.map((uid) => `/api/library-elements/${encodeURIComponent(uid)}`),
      );
      const libraryPanels = new Map(
        libraryAnswers.flatMap((answer, index) => {
          const model = (parseAnswer(answer.body) as { result?: { model?: unknown } })?.result?.model;

          return answer.status === 200 && model ? [[libraryUids[index], model] as const] : [];
        }),
      );

      return dashboards.map((dashboard) => ({ ...dashboard, libraryPanels }));
    };

    // The database is read whole, in memory, and dropped once its dashboards are read out. A copy
    // taken while Grafana writes may be torn, so a copy that does not read is taken once again.
    const findInDatabase = async (clusterId: string, pod: GrafanaPod) => {
      const where = `Grafana's database in ${pod.namespace}/${pod.name}`;

      for (let attempt = 1; ; attempt++) {
        const dump = await databaseOfScript(await execIn(clusterId, pod, grafanaDatabaseScript, [], 180));

        switch (dump.kind) {
          case "other-database":
            throw new Error(`Grafana keeps its database in ${dump.type}, not in a file: only SQLite can be read.`);
          case "missing":
            throw new Error(`Grafana's database is not at ${dump.path}.`);
          case "too-large":
            throw new Error(`Grafana's database is ${Math.round(dump.size / 1024 / 1024)} MB, too large to copy.`);
        }

        try {
          return dashboardsInDatabase(openSqlite(dump.file, dump.wal), where);
        } catch (error) {
          if (attempt >= 2) {
            throw error;
          }
        }
      }
    };

    const findInPods = async (
      clusterId: string,
      pods: Promise<GrafanaPod[]>,
      find: (pod: GrafanaPod) => Promise<FoundGrafanaDashboard[]>,
    ): Promise<{ dashboards: FoundGrafanaDashboard[]; notes: string[] } | undefined> => {
      const running = await pods;

      if (running.length === 0) {
        return undefined;
      }

      const results = await Promise.allSettled(running.map(find));
      const failures = results.flatMap((result, index) =>
        result.status === "rejected"
          ? [`${running[index].namespace}/${running[index].name}: ${messageOf(result.reason)}`]
          : [],
      );

      if (failures.length === results.length) {
        throw new Error(failures.join(" · "));
      }

      return {
        dashboards: results.flatMap((result) => (result.status === "fulfilled" ? result.value : [])),
        notes: failures,
      };
    };

    // --- Looking ------------------------------------------------------------------------------

    const lookIn = async (
      clusterId: string,
      source: GrafanaSourceKind,
      find: () => Promise<{ dashboards: FoundGrafanaDashboard[]; notes: readonly string[] } | undefined>,
      absentReason: string,
    ) => {
      try {
        const result = await find();

        if (!result) {
          setOutcome(clusterId, source, { state: "absent", reason: absentReason });

          return;
        }

        setFound(clusterId, source, result.dashboards);
        setOutcome(clusterId, source, { state: "found", count: result.dashboards.length, notes: result.notes });
      } catch (error) {
        setOutcome(clusterId, source, { state: "failed", error: messageOf(error) });
      }
    };

    const scan = async (clusterId: string) => {
      if (Object.values(outcomes.get(clusterId) ?? {}).some((outcome) => outcome.state === "looking")) {
        return;
      }

      const on = sourceSettings.settings.get();

      action(() => {
        outcomes.set(
          clusterId,
          Object.fromEntries(
            grafanaSourceKinds.map((source) => [source, on[source] ? { state: "looking" } : { state: "off" }]),
          ) as Record<GrafanaSourceKind, SourceOutcome>,
        );
        found.set(clusterId, {});
      })();

      try {
        await connectCluster(clusterId);
      } catch (error) {
        grafanaSourceKinds
          .filter((source) => on[source])
          .forEach((source) => setOutcome(clusterId, source, { state: "failed", error: messageOf(error) }));

        return;
      }

      const configMaps = on.configMaps || on.operator ? configMapsOf(clusterId) : Promise.resolve([]);
      const pods = on.api || on.database ? grafanaPodsOf(clusterId) : Promise.resolve([]);
      const noPod = "No Grafana runs in this cluster, or none of its pods is running.";

      configMaps.catch(() => undefined);
      pods.catch(() => undefined);

      await Promise.all([
        on.configMaps &&
          lookIn(
            clusterId,
            "configMaps",
            async () => ({ dashboards: await findInConfigMaps(clusterId, configMaps), notes: [] }),
            "",
          ),
        on.operator &&
          lookIn(
            clusterId,
            "operator",
            () => findInOperator(clusterId, configMaps),
            "grafana-operator is not installed.",
          ),
        on.secrets &&
          lookIn(clusterId, "secrets", async () => ({ dashboards: await findInSecrets(clusterId), notes: [] }), ""),
        on.api &&
          lookIn(clusterId, "api", () => findInPods(clusterId, pods, (pod) => findInApi(clusterId, pod)), noPod),
        on.database &&
          lookIn(
            clusterId,
            "database",
            () => findInPods(clusterId, pods, (pod) => findInDatabase(clusterId, pod)),
            noPod,
          ),
      ]);
    };

    const scanComputeds = new Map<string, IComputedValue<GrafanaScan | undefined>>();

    const scanOf = (clusterId: string) => {
      const known = scanComputeds.get(clusterId);

      if (known) {
        return known;
      }

      const created = computed((): GrafanaScan | undefined => {
        const sources = outcomes.get(clusterId);

        if (!sources) {
          return undefined;
        }

        return {
          looking: Object.values(sources).some((outcome) => outcome.state === "looking"),
          dashboards: mergeFoundDashboards(Object.values(found.get(clusterId) ?? {}).flat()),
          sources,
        };
      });

      scanComputeds.set(clusterId, created);

      return created;
    };

    return () => ({
      /** How looking in a cluster went, as it goes; undefined until it is asked to look. */
      scanOf,
      scan,
    });
  },
});
