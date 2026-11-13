import { Div, H3, P, Span } from "@k8slens/element-components";
import { MultiSelect } from "@k8slens/input-components";
import { useSyncInject } from "@k8slens/use-inject";
import { observer } from "mobx-react";
import { type GrafanaSourceKind, grafanaFolder, grafanaSourceKinds } from "./grafana-found";
import { grafanaSourceSettingsInjectable } from "./grafana-source-settings.injectable";

const sourceLabels: Readonly<Record<GrafanaSourceKind, string>> = {
  configMaps: "ConfigMaps holding dashboards, as Grafana's sidecar or kube-prometheus loads them",
  operator: "grafana-operator's GrafanaDashboard resources",
  secrets: "Secrets labelled grafana_dashboard, as Grafana's sidecar loads them",
  api: "Grafana's API, asked inside Grafana's pod with kubectl exec",
  database: "Grafana's SQLite database, copied out of Grafana's pod with kubectl exec",
};

// Where Import from Grafana looks for dashboards: what the cluster's API shows anyone browsing
// it, from the start, and Secrets and Grafana's pod only once the user allows them.
export const GrafanaDashboardSources = observer(() => {
  const sources = useSyncInject(grafanaSourceSettingsInjectable);
  const settings = sources.settings.get();

  return (
    <Div $flex={{ direction: "vertical", gap: "s" }} $padding={{ bottom: "xl" }}>
      <H3 $font={{ size: "m", bold: true }} $color="textHighlight">
        Grafana dashboards
      </H3>
      <P $color="textMuted" $font={{ size: "s" }}>
        Import from Grafana…, in the menu of a cluster's Dashboards in the navigator, makes the Grafana dashboards found
        in the cluster Lens dashboards, in the {grafanaFolder} folder of the library. It looks only when you ask it to,
        and only where you allow:
      </P>
      <Div $border={{ color: "borderPrimary", width: "xxs", radius: "m" }}>
        <MultiSelect
          options={grafanaSourceKinds.map((source) => ({ id: source, label: sourceLabels[source] }))}
          selected={grafanaSourceKinds.filter((source) => settings[source])}
          onToggle={(source) => sources.toggle(source)}
        />
      </Div>
      <Span $font={{ size: "xs" }} $color="textMuted">
        Only Grafana's pod knows the dashboards made in Grafana itself; the others are provisioned from the cluster.
        Asking Grafana's pod runs a command in it, which needs the right to (pods/exec) and is recorded in the cluster's
        audit log. Its API is asked as the admin Grafana's pod is started with, whose password the pod's own shell reads
        and which never leaves the pod. Copying its database brings all of it, Grafana's users and secrets among it,
        into Lens's memory for as long as reading its dashboards takes: nothing of it is written anywhere. Only Secrets
        labelled grafana_dashboard are read.
      </Span>
    </Div>
  );
});
