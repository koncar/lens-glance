import { getKubeResourceKind, getKubernetesApiVersion } from "@k8slens/kubernetes-contracts";

// The resources the Perses operator keeps datasources in, where it is installed. Read loosely:
// what is used of them is the datasource's plugin, its address and its name.

interface PersesDatasourceResource {
  metadata: { name: string; namespace: string };
  spec?: {
    config?: {
      display?: { name?: string };
      plugin?: { kind?: string; spec?: { directUrl?: string; proxy?: { spec?: { url?: string } } } };
    };
  };
}

export const persesV1alpha1 = getKubernetesApiVersion("perses.dev/v1alpha1");
export const persesV1alpha2 = getKubernetesApiVersion("perses.dev/v1alpha2");

export const persesDatasourceKind = getKubeResourceKind<{
  "perses.dev/v1alpha1": PersesDatasourceResource & { kind: "PersesDatasource" };
  "perses.dev/v1alpha2": PersesDatasourceResource & { kind: "PersesDatasource" };
}>("PersesDatasource");
