import { getKubeResourceKind, getKubernetesApiVersion } from "@k8slens/kubernetes-contracts";
import type { GrafanaDashboardResource } from "./grafana-found";

// The resources grafana-operator keeps dashboards in, where it is installed: v5's, and v4's
// before it. Read loosely: what is used of them is where the dashboard is, and its folder.

export const grafanaOperatorV1beta1 = getKubernetesApiVersion("grafana.integreatly.org/v1beta1");
export const grafanaOperatorV1alpha1 = getKubernetesApiVersion("integreatly.org/v1alpha1");

export const grafanaDashboardKind = getKubeResourceKind<{
  "grafana.integreatly.org/v1beta1": GrafanaDashboardResource & { kind: "GrafanaDashboard" };
  "integreatly.org/v1alpha1": GrafanaDashboardResource & { kind: "GrafanaDashboard" };
}>("GrafanaDashboard");
