import { Badge } from "@k8slens/badge";
import { navigateToClusterSettingsInjectionToken } from "@k8slens/cluster-contracts";
import { Div, H3, P, Span } from "@k8slens/element-components";
import { getInjectable2 } from "@k8slens/injectable";
import { PlainButton, PrimaryButton, TextInput } from "@k8slens/input-components";
import { getExtensionPreferencePageInjectableBunch } from "@k8slens/preferences-contracts";
import { useSyncInject } from "@k8slens/use-inject";
import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import packageJson from "../../package.json";
import { directProbeInjectable } from "../metrics/direct-probe.injectable";
import { directIdOf, fleetSettingsInjectable, hubIdOf } from "./fleet-settings.injectable";
import { hubDiscoveryInjectable } from "./hub-discovery.injectable";
import { type FoundSource, type FoundVia, type SourceKind, sourceKindTitles } from "./source-catalog";

export const openClusterMetricsSettingsInjectable = getInjectable2({
  id: "lens-glance-open-cluster-metrics-settings",
  consumptions: [navigateToClusterSettingsInjectionToken],

  instantiate: (di) => {
    const navigateToClusterSettings = di.inject(navigateToClusterSettingsInjectionToken)();

    return () => (clusterId: string) => navigateToClusterSettings({ clusterId, sectionId: "metrics" });
  },
});

const Section = ({ title, children }: { readonly title: string; readonly children: React.ReactNode }) => (
  <Div $flex={{ direction: "vertical", gap: "s" }} $padding={{ bottom: "xl" }}>
    <H3 $font={{ size: "m", bold: true }} $color="textHighlight">
      {title}
    </H3>
    {children}
  </Div>
);

const Row = ({ children }: { readonly children: React.ReactNode }) => (
  <Div
    $flex={{ verticalAlign: "center", gap: "m", wrap: true }}
    $padding={{ horizontal: "m", vertical: "s" }}
    $backgroundColor="backgroundSecondary"
    $border={{ radius: "m" }}
  >
    {children}
  </Div>
);

// What is typed into "Add an address", until it is added.
export const addressDraftInjectable = getInjectable2({
  id: "lens-glance-address-draft",
  instantiate: () => {
    const url = observable.box("");
    const adding = observable.box(false);
    const error = observable.box<string | undefined>(undefined);

    return () => ({
      url: computed(() => url.get()),
      adding: computed(() => adding.get()),
      error: computed(() => error.get()),
      setUrl: action((next: string) => {
        url.set(next);
        error.set(undefined);
      }),
      setAdding: action((next: boolean) => adding.set(next)),
      setError: action((next: string | undefined) => error.set(next)),
    });
  },
});

// An address is asked before it is added, so what is added answers, and is known to be a hub or not.
export const addAddressInjectable = getInjectable2({
  id: "lens-glance-add-address",
  instantiate: (di) => {
    const draft = di.inject(addressDraftInjectable)();
    const probe = di.inject(directProbeInjectable)();
    const settings = di.inject(fleetSettingsInjectable)();

    return () => async () => {
      const url = draft.url.get().trim().replace(/\/+$/, "");

      if (!/^https?:\/\/./.test(url)) {
        draft.setError("Give the address of a Prometheus API, such as https://thanos.example.com");

        return;
      }

      draft.setAdding(true);

      const probed = await probe.probe(url, true);

      draft.setAdding(false);

      if (probed.status === "unreachable") {
        draft.setError(probed.error);

        return;
      }

      settings.addDirect({
        name: new URL(url).host,
        url,
        clusterLabel: probed.status === "reachable" ? probed.hub?.label : undefined,
      });
      draft.setUrl("");
    };
  },
});

const ProbeBadge = observer(({ url }: { readonly url: string }) => {
  const probed = useSyncInject(directProbeInjectable).probeOf(url).get();

  return probed.status === "probing" ? (
    <Badge small label="Asking…" />
  ) : probed.status === "reachable" ? (
    <Badge small label="Answers from here" $backgroundColor="success" $color="white" />
  ) : (
    <Badge small label="Not reachable" $backgroundColor="warning" $color="white" $tooltip={probed.error} />
  );
});

const AddAddress = observer(() => {
  const draft = useSyncInject(addressDraftInjectable);
  const addAddress = useSyncInject(addAddressInjectable);

  return (
    <Div $flex={{ direction: "vertical", gap: "xxs" }}>
      <Div $flex={{ gap: "s", verticalAlign: "center" }}>
        <TextInput
          placeholder="https://thanos.example.com"
          value={draft.url.get()}
          onChange={(event) => draft.setUrl(event.target.value)}
        />
        <PrimaryButton $disabled={draft.adding.get() || !draft.url.get().trim()} onClick={() => void addAddress()}>
          {draft.adding.get() ? "Asking…" : "Add an address"}
        </PrimaryButton>
      </Div>
      {draft.error.get() && (
        <Span $font={{ size: "xs" }} $color="critical">
          {draft.error.get()}
        </Span>
      )}
    </Div>
  );
});

// The data sources dashboards are drawn from, each saying what it needs to be read.
const DataSources = observer(() => {
  const settings = useSyncInject(fleetSettingsInjectable);
  const discovery = useSyncInject(hubDiscoveryInjectable);
  const results = discovery.results.get();
  const nameOf = (clusterId?: string) => results.find(({ record }) => record.id === clusterId)?.record.name.get();

  return (
    <Section title="Data sources">
      <P $color="textMuted" $font={{ size: "s" }}>
        Dashboards are drawn from one of these, picked above each. An address of its own is asked from this machine, so
        the cluster need not be connected. A hub holds many clusters' metrics, as Thanos Query does, and names the
        cluster of each series in a label. Without either, each cluster's own Prometheus is asked through Lens.
      </P>
      {settings.directs.get().map((direct) => (
        <Row key={direct.id}>
          <Div $flex={{ direction: "vertical" }} $flexChild="shrinkable">
            <Span $font={{ bold: true }} $color="textHighlight">
              {direct.name}
            </Span>
            <Span $font={{ size: "s" }} $color="textMuted">
              {direct.url} · direct, no cluster connection
              {direct.foundIn ? ` · found in ${nameOf(direct.foundIn) ?? direct.foundIn}` : ""}
            </Span>
          </Div>
          <ProbeBadge url={direct.url} />
          <Span $font={{ size: "s" }} $color="textMuted">
            Cluster label
          </Span>
          <TextInput
            $width="xxl"
            placeholder="none: one cluster"
            value={direct.clusterLabel ?? ""}
            onChange={(event) => settings.setClusterLabel(direct.id, event.target.value.trim())}
          />
          <PlainButton onClick={() => settings.removeDirect(direct.id)}>Remove</PlainButton>
        </Row>
      ))}
      {settings.hubs.get().map((hub) => {
        const found = results.find(({ record }) => record.id === hub.clusterId);

        return (
          <Row key={hub.id}>
            <Div $flex={{ direction: "vertical" }} $flexChild="shrinkable">
              <Span $font={{ bold: true }} $color="textHighlight">
                {hub.name}
              </Span>
              <Span $font={{ size: "s" }} $color="textMuted">
                The metrics of {found?.record.name.get() ?? hub.clusterId} in Lens
                {found?.scan?.hub ? `, with ${found.scan.hub.clusters.length} clusters` : ""} · needs that cluster
                connected
              </Span>
            </Div>
            <Span $font={{ size: "s" }} $color="textMuted">
              Cluster label
            </Span>
            <TextInput
              $width="xxl"
              value={hub.clusterLabel}
              onChange={(event) => settings.setClusterLabel(hub.id, event.target.value.trim())}
            />
            <PlainButton onClick={() => settings.removeHub(hub.id)}>Remove</PlainButton>
          </Row>
        );
      })}
      <Row>
        <Div $flex={{ direction: "vertical" }} $flexChild="shrinkable">
          <Span $font={{ bold: true }} $color="textHighlight">
            Each cluster's Prometheus
          </Span>
          <Span $font={{ size: "s" }} $color="textMuted">
            Always there: each chosen cluster is asked through Lens, which needs it connected, and each series is
            labelled with its cluster.
          </Span>
        </Div>
      </Row>
      <AddAddress />
    </Section>
  );
});

// Which clusters' findings are shown in full; the rest show a line of what was found.
export const expandedClustersInjectable = getInjectable2({
  id: "lens-glance-expanded-clusters",
  instantiate: () => {
    const expanded = observable.set<string>();

    return () => ({
      isExpanded: (clusterId: string) => expanded.has(clusterId),
      toggle: action((clusterId: string) =>
        expanded.has(clusterId) ? expanded.delete(clusterId) : expanded.add(clusterId),
      ),
    });
  },
});

const kindsInOrder: readonly SourceKind[] = ["metrics", "logs", "traces", "profiles", "alerts", "dashboards", "other"];

const sourceOfLabel: Readonly<Record<FoundVia, string>> = { service: "Service", grafana: "Grafana", perses: "Perses" };

// Whether something found needs its cluster connected to be read, and what Lens can do with it.
const ConnectionBadge = observer(({ found }: { readonly found: FoundSource }) => {
  const probe = useSyncInject(directProbeInjectable);

  if (found.reach === "in-cluster") {
    return <Badge small label="Needs the cluster connected" $tooltip="Reached through the cluster's API server" />;
  }

  if (!found.promQl) {
    return <Badge small label="Outside the cluster" $tooltip="Has an address of its own" />;
  }

  const probed = probe.probeOf(found.address).get();

  return probed.status === "probing" ? (
    <Badge small label="Asking…" />
  ) : probed.status === "reachable" ? (
    <Badge
      small
      label="Direct · no cluster connection"
      $backgroundColor="success"
      $color="white"
      $tooltip="Answers from this machine at its own address"
    />
  ) : (
    <Badge small label="Not reachable from here" $backgroundColor="warning" $color="white" $tooltip={probed.error} />
  );
});

const noteOf = (found: FoundSource, clusterHasMetrics: boolean) =>
  !found.promQl
    ? `Lens extensions can read metrics only so far; ${sourceKindTitles[found.kind].toLowerCase()} not yet.`
    : found.reach === "external"
      ? "Answers PromQL at an address of its own, which is asked from this machine when it answers here."
      : found.product === "Prometheus" && clusterHasMetrics
        ? "Most likely what Lens reads this cluster's metrics from."
        : "Lens reads it once it is this cluster's Prometheus: set its address in the cluster's metrics settings.";

const FoundRow = observer(
  ({
    found,
    clusterId,
    clusterHasMetrics,
  }: {
    readonly found: FoundSource;
    readonly clusterId: string;
    readonly clusterHasMetrics: boolean;
  }) => {
    const openMetricsSettings = useSyncInject(openClusterMetricsSettingsInjectable);
    const settings = useSyncInject(fleetSettingsInjectable);
    const probed = useSyncInject(directProbeInjectable).probeOf(found.address);
    const isDirect = found.promQl && found.reach === "external";
    const registered = isDirect && settings.directs.get().some((one) => one.id === directIdOf(found.address));
    const answers = isDirect && probed.get().status === "reachable";
    const seenIn = found.via
      .map((via) =>
        via === "service" || found.names.length === 0
          ? sourceOfLabel[via]
          : `${sourceOfLabel[via]}: ${found.names.join(", ")}`,
      )
      .join(" · ");

    return (
      <Div $flex={{ verticalAlign: "center", gap: "s" }} $padding={{ vertical: "xxs" }}>
        <Div $flex={{ direction: "vertical" }} $flexChild="shrinkable">
          <Span $font={{ size: "s" }} $color="textHighlight">
            {found.product}{" "}
            <Span $font={{ size: "s" }} $color="textMuted">
              {found.address}
            </Span>
          </Span>
          <Span $font={{ size: "xs" }} $color="textMuted">
            {seenIn}. {noteOf(found, clusterHasMetrics)}
          </Span>
        </Div>
        <ConnectionBadge found={found} />
        {found.promQl && found.reach === "in-cluster" && !(found.product === "Prometheus" && clusterHasMetrics) && (
          <PlainButton onClick={() => void openMetricsSettings(clusterId)}>Metrics settings</PlainButton>
        )}
        {answers && registered && <Badge small label="Data source" $backgroundColor="success" $color="white" />}
        {answers && !registered && (
          <PlainButton
            onClick={() => {
              const probe = probed.get();

              settings.addDirect({
                name: found.names[0] ?? new URL(found.address).host,
                url: found.address,
                clusterLabel: probe.status === "reachable" ? probe.hub?.label : undefined,
                foundIn: clusterId,
              });
            }}
          >
            Use directly
          </PlainButton>
        )}
      </Div>
    );
  },
);

const summaryOf = (found: readonly FoundSource[]) =>
  kindsInOrder
    .map((kind) => [kind, found.filter((one) => one.kind === kind).length] as const)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${count} ${sourceKindTitles[kind].toLowerCase()}`)
    .join(", ");

// What looking in each cluster found, cluster by cluster: where Lens reads its metrics from,
// whether that is a hub, and every data source seen in it by what it holds.
const Discovery = observer(() => {
  const settings = useSyncInject(fleetSettingsInjectable);
  const discovery = useSyncInject(hubDiscoveryInjectable);
  const expanded = useSyncInject(expandedClustersInjectable);
  const results = discovery.results.get();
  const registered = new Set(settings.hubs.get().map((hub) => hub.id));

  return (
    <Section title="Found in your clusters">
      <P $color="textMuted" $font={{ size: "s" }}>
        Each connected cluster is looked in when this page or a fleet dashboard opens: its Services, the datasources
        Grafana is provisioned with from ConfigMaps, and Perses's datasources. What is in a cluster is reached through
        it, and needs it connected; what has an address of its own outside it does not. Lens reads a hub, such as Thanos
        Query, through the metrics settings of a cluster: point a cluster's Prometheus at it, ideally the cluster that
        runs the observability stack, and it becomes a data source here.
      </P>
      <Div $flex={{ gap: "s", verticalAlign: "center" }}>
        <PrimaryButton onClick={() => void discovery.scanAll()}>Look in every cluster</PrimaryButton>
        <Span $font={{ size: "xs" }} $color="textMuted">
          Connects the clusters that are not connected
        </Span>
      </Div>
      {results.map(({ record, scan }) => {
        const name = record.name.get();
        const isExpanded = expanded.isExpanded(record.id);
        const found = scan?.found ?? [];
        const metricsLine = !scan
          ? record.isConnected.get()
            ? "Not looked in yet"
            : "Not connected, so not looked in"
          : scan.status === "scanning"
            ? "Looking…"
            : scan.status === "failed"
              ? scan.error
              : !scan.hasMetrics
                ? "Lens has no Prometheus for this cluster"
                : scan.hub
                  ? `Lens reads a hub of ${scan.hub.clusters.length} clusters, by "${scan.hub.label}" · needs the cluster connected`
                  : "Lens reads its own Prometheus · needs the cluster connected";

        return (
          <Div
            key={record.id}
            $flex={{ direction: "vertical", gap: "xs" }}
            $padding={{ horizontal: "m", vertical: "s" }}
            $backgroundColor="backgroundSecondary"
            $border={{ radius: "m" }}
          >
            <Div $flex={{ verticalAlign: "center", gap: "s" }}>
              <PlainButton onClick={() => expanded.toggle(record.id)}>{isExpanded ? "▾" : "▸"}</PlainButton>
              <Div $flex={{ direction: "vertical" }} $flexChild="shrinkable">
                <Span $font={{ bold: true }} $color="textHighlight">
                  {name}
                </Span>
                <Span $font={{ size: "s" }} $color={scan?.status === "failed" ? "critical" : "textMuted"}>
                  {metricsLine}
                  {found.length > 0 ? ` · found ${summaryOf(found)}` : ""}
                </Span>
              </Div>
              {scan?.hub && registered.has(hubIdOf(record.id)) && (
                <Badge small label="Hub data source" $backgroundColor="success" $color="white" />
              )}
              {scan?.hub && !registered.has(hubIdOf(record.id)) && (
                <PlainButton
                  onClick={() => settings.addHub({ name, clusterId: record.id, clusterLabel: scan.hub!.label })}
                >
                  Use as data source
                </PlainButton>
              )}
              <PlainButton onClick={() => void discovery.rescan(record.id)}>Look again</PlainButton>
            </Div>
            {isExpanded && scan?.hub && (
              <Span $font={{ size: "s" }} $color="textDefault">
                Its clusters: {scan.hub.clusters.join(", ")}
              </Span>
            )}
            {isExpanded &&
              kindsInOrder.map((kind) => {
                const ofKind = found.filter((one) => one.kind === kind);

                return ofKind.length === 0 ? null : (
                  <Div key={kind} $flex={{ direction: "vertical", gap: "xxs" }} $padding={{ left: "xl" }}>
                    <Span $font={{ size: "xs", bold: true, uppercase: true }} $color="textMuted">
                      {sourceKindTitles[kind]}
                    </Span>
                    {ofKind.map((one) => (
                      <FoundRow
                        key={one.address}
                        found={one}
                        clusterId={record.id}
                        clusterHasMetrics={!!scan?.hasMetrics}
                      />
                    ))}
                  </Div>
                );
              })}
            {isExpanded && scan?.status === "done" && found.length === 0 && (
              <Span $padding={{ left: "xl" }} $font={{ size: "s" }} $color="textMuted">
                No data sources found in it.
              </Span>
            )}
            {isExpanded && (scan?.unseen.length ?? 0) > 0 && (
              <Span $padding={{ left: "xl" }} $font={{ size: "xs" }} $color="textMuted">
                Could not look in {scan!.unseen.join(", ")}: perhaps no right to list them.
              </Span>
            )}
          </Div>
        );
      })}
    </Section>
  );
});

export const fleetPreferencesBunch = getExtensionPreferencePageInjectableBunch({
  packageJson,
  blocks: [
    { id: "data-sources", orderNumber: 10, Component: DataSources },
    { id: "discovery", orderNumber: 20, Component: Discovery },
  ],
});
