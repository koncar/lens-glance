import { Badge } from "@k8slens/badge";
import { Div, P, Span } from "@k8slens/element-components";
import { PlainButton, PrimaryButton, MultiSelect } from "@k8slens/input-components";
import { ModalContainer, ModalContent, ModalFooter, ModalHeader } from "@k8slens/modal-components";
import { getModalInjectableBunch, getModalKind, type ModalProps, useRespondFromModal } from "@k8slens/modal-contracts";
import { useSyncInject } from "@k8slens/use-inject";
import { observer } from "mobx-react";
import { useState } from "react";
import { dashboardLibraryInjectable } from "../dashboard-files/dashboard-library.injectable";
import { grafanaDiscoveryInjectable, type SourceOutcome } from "./grafana-discovery.injectable";
import { type GrafanaSourceKind, grafanaFolder, grafanaSourceKinds, libraryPathsOf } from "./grafana-found";

export type GrafanaImportAnswer =
  { readonly kind: "import"; readonly ids: readonly string[] } | { readonly kind: "preferences" };

// Shows the Grafana dashboards found in a cluster as they are found, place by place, and asks
// which to import. Those not in the library yet are picked to begin with.
export const grafanaImportModalKind = getModalKind<[clusterId: string], GrafanaImportAnswer | undefined>()(
  "import-from-grafana",
);

export const grafanaSourceTitles: Readonly<Record<GrafanaSourceKind, string>> = {
  configMaps: "ConfigMaps",
  operator: "grafana-operator's GrafanaDashboards",
  secrets: "Secrets labelled grafana_dashboard",
  api: "Grafana's API, inside its pod",
  database: "Grafana's database, copied from its pod",
};

const OutcomeBadge = ({ outcome }: { readonly outcome: SourceOutcome }) => {
  switch (outcome.state) {
    case "off":
      return <Badge small label="Off" $tooltip="Turned on in the extension's preferences" />;
    case "looking":
      return <Badge small label="Looking…" />;
    case "absent":
      return <Badge small label="Nothing to look in" $tooltip={outcome.reason} />;
    case "failed":
      return <Badge small label="Could not look" $backgroundColor="warning" $color="white" $tooltip={outcome.error} />;
    case "found":
      return (
        <Badge
          small
          label={`${outcome.count} found`}
          $backgroundColor={outcome.count > 0 ? "success" : undefined}
          $color={outcome.count > 0 ? "white" : undefined}
          $tooltip={outcome.notes.join("\n") || undefined}
        />
      );
  }
};

const detailOf = (outcome: SourceOutcome) =>
  outcome.state === "failed"
    ? outcome.error
    : outcome.state === "absent"
      ? outcome.reason
      : outcome.state === "found" && outcome.notes.length
        ? outcome.notes.join(" · ")
        : undefined;

const GrafanaImportModal = observer(({ input: [clusterId] }: ModalProps<typeof grafanaImportModalKind>) => {
  const respond = useRespondFromModal(grafanaImportModalKind);
  const discovery = useSyncInject(grafanaDiscoveryInjectable);
  const library = useSyncInject(dashboardLibraryInjectable).library.get();
  const scan = discovery.scanOf(clusterId).get();
  // What is picked lives only as long as the question; the answer is what the modal returns.
  const [picked, setPicked] = useState<readonly string[] | undefined>(undefined);

  const dashboards = scan?.dashboards ?? [];
  const paths = libraryPathsOf(dashboards);
  const inLibrary = new Set(library.dashboards.map((dashboard) => dashboard.path));
  const isImported = (id: string) => inLibrary.has(paths.get(id) ?? "");
  const chosen = picked ?? dashboards.filter((dashboard) => !isImported(dashboard.id)).map((dashboard) => dashboard.id);
  const anyOff = grafanaSourceKinds.some((source) => scan?.sources[source].state === "off");

  const options = dashboards.map((dashboard) => ({
    id: dashboard.id,
    label: [
      dashboard.title,
      dashboard.folder ? `in ${dashboard.folder}` : undefined,
      isImported(dashboard.id) ? "imported before" : undefined,
      `from ${dashboard.where}${dashboard.alsoIn.length ? ` and ${dashboard.alsoIn.length} more` : ""}`,
    ]
      .filter(Boolean)
      .join(" · "),
  }));

  return (
    <ModalContainer $style={{ width: "min(820px, 92vw)" }}>
      <ModalHeader>Import from Grafana</ModalHeader>
      <ModalContent>
        <Div $flex={{ direction: "vertical", gap: "m" }}>
          <P $font={{ size: "s" }} $color="textMuted">
            Grafana's dashboards in this cluster, made into Lens dashboards in the {grafanaFolder} folder of the
            library, in the folder Grafana shows each in. Their PromQL queries are kept, filtered to the cluster each is
            opened for; what Lens Glance does not draw shows a note in its place.
          </P>
          <Div $flex={{ direction: "vertical", gap: "xxs" }}>
            {grafanaSourceKinds.map((source) => {
              const outcome = scan?.sources[source] ?? { state: "looking" };
              const detail = detailOf(outcome);

              return (
                <Div key={source} $flex={{ direction: "vertical" }}>
                  <Div $flex={{ verticalAlign: "center", gap: "s" }}>
                    <Span $font={{ size: "s" }} $color="textHighlight" $flexChild="shrinkable">
                      {grafanaSourceTitles[source]}
                    </Span>
                    <Div $flexChild />
                    <OutcomeBadge outcome={outcome} />
                  </Div>
                  {detail && (
                    <Span
                      $font={{ size: "xs" }}
                      $color={outcome.state === "failed" ? "warning" : "textMuted"}
                      $padding={{ left: "m" }}
                    >
                      {detail}
                    </Span>
                  )}
                </Div>
              );
            })}
          </Div>
          <Div $flex={{ verticalAlign: "center", gap: "s" }}>
            <PlainButton $enabled={!scan?.looking} onClick={() => void discovery.scan(clusterId)}>
              {scan?.looking ? "Looking…" : "Look again"}
            </PlainButton>
            <PlainButton onClick={() => respond({ kind: "preferences" })}>Choose where to look…</PlainButton>
            {anyOff && (
              <Span $font={{ size: "xs" }} $color="textMuted">
                Secrets and Grafana's pod are looked in only once you allow it.
              </Span>
            )}
          </Div>
          {dashboards.length > 0 ? (
            <Div $flex={{ direction: "vertical", gap: "xs" }}>
              <Div $flex={{ verticalAlign: "center", gap: "s" }}>
                <Span $font={{ size: "s", bold: true }} $color="textHighlight">
                  {dashboards.length} {dashboards.length === 1 ? "dashboard" : "dashboards"} found, {chosen.length}{" "}
                  picked
                </Span>
                <Div $flexChild />
                <PlainButton onClick={() => setPicked(dashboards.map((dashboard) => dashboard.id))}>All</PlainButton>
                <PlainButton onClick={() => setPicked([])}>None</PlainButton>
              </Div>
              <Div
                $border={{ color: "borderPrimary", width: "xxs", radius: "m" }}
                $overflow={{ y: "auto" }}
                $style={{ maxHeight: 300 }}
              >
                <MultiSelect
                  options={options}
                  selected={chosen}
                  onToggle={(id) =>
                    setPicked(chosen.includes(id) ? chosen.filter((one) => one !== id) : [...chosen, id])
                  }
                />
              </Div>
            </Div>
          ) : (
            !scan?.looking && (
              <Span $font={{ size: "s" }} $color="textMuted">
                No Grafana dashboards found{anyOff ? " in the places looked in" : ""}.
              </Span>
            )
          )}
        </Div>
      </ModalContent>
      <ModalFooter>
        <PlainButton onClick={() => respond(undefined)}>Cancel</PlainButton>
        <PrimaryButton $enabled={chosen.length > 0} onClick={() => respond({ kind: "import", ids: chosen })}>
          {chosen.length > 1 ? `Import ${chosen.length} dashboards` : "Import"}
        </PrimaryButton>
      </ModalFooter>
    </ModalContainer>
  );
});

export const grafanaImportModalBunch = getModalInjectableBunch({
  kind: grafanaImportModalKind,
  Component: GrafanaImportModal,
  onClose: () => undefined,
});
