import type { DashboardLibrary } from "../dashboard-files/dashboard-library.injectable";
import { toFileName } from "../dashboard-files/library-actions.injectable";
import { type DashboardValidation, validateDashboard } from "../dashboard-files/validate-dashboard";
import { fleetFolder, fleetScope } from "../fleet/fleet-settings.injectable";
import { isGrafanaDashboard } from "../grafana/grafana-json";
import { convertGrafanaDashboard } from "../grafana/grafana-to-perses";

/** Where an imported dashboard goes: a folder of the library, and whose dashboard it is there. */
export interface ImportTarget {
  /** The cluster whose library it goes to and which it opens under, or the fleet's. */
  readonly clusterId: string;
  /** The folder in the library, `""` for the top of it, `fleet` and below for the fleet's. */
  readonly folder: string;
}

export interface ImportTargetOption extends ImportTarget {
  readonly id: string;
  readonly label: string;
}

const isFleetFolder = (folder: string) => folder === fleetFolder || folder.startsWith(`${fleetFolder}/`);

export const isFleetTarget = (target: ImportTarget) => target.clusterId === fleetScope;

// The folders an import may go to: those of the cluster it was started from, when it was started
// from one, and the fleet's. A fleet dashboard is told apart by where it is, nothing in its file.
export const importTargetsOf = (library: DashboardLibrary, clusterId: string | undefined): ImportTargetOption[] => [
  ...(clusterId
    ? [
        { id: "", clusterId, folder: "", label: "Dashboards" },
        ...library.folders
          .filter((folder) => !isFleetFolder(folder))
          .map((folder) => ({ id: folder, clusterId, folder, label: `Dashboards / ${folder}` })),
      ]
    : []),
  { id: fleetFolder, clusterId: fleetScope, folder: fleetFolder, label: "Fleet dashboards" },
  ...library.folders
    .filter((folder) => folder.startsWith(`${fleetFolder}/`))
    .map((folder) => ({
      id: folder,
      clusterId: fleetScope,
      folder,
      label: `Fleet dashboards / ${folder.slice(fleetFolder.length + 1)}`,
    })),
];

export const validationOf = (text: string): DashboardValidation | undefined =>
  text.trim() ? validateDashboard(text) : undefined;

export interface ImportDraft {
  /** The Perses dashboard to import: what was pasted, or what a Grafana dashboard pasted became. */
  readonly text: string;
  readonly validation?: DashboardValidation;
  /** Set when a Grafana dashboard was pasted: what of it could not be carried over. */
  readonly fromGrafana?: { readonly notes: readonly string[] };
}

/** What is pasted, as it is imported: a Grafana dashboard is converted first. */
export const draftOf = (text: string): ImportDraft => {
  let json: unknown;

  try {
    json = JSON.parse(text);
  } catch {
    return { text, validation: validationOf(text) };
  }

  if (!isGrafanaDashboard(json)) {
    return { text, validation: validationOf(text) };
  }

  try {
    const conversion = convertGrafanaDashboard(json);
    const converted = JSON.stringify(conversion.dashboard, null, 2);

    return { text: converted, validation: validateDashboard(converted), fromGrafana: { notes: conversion.notes } };
  } catch (error) {
    return { text, validation: { valid: false, errors: [String((error as Error).message ?? error)] } };
  }
};

/** The name a dashboard comes with: its display name, or its name. */
export const suggestedNameOf = (validation: DashboardValidation | undefined) =>
  validation?.valid ? (validation.dashboard.spec.display?.name ?? validation.dashboard.metadata.name) : "";

/** `$__cluster_label` is filled in for fleet dashboards: queries using it are a fleet dashboard's. */
export const looksLikeFleetDashboard = (text: string) => /\$\{?__cluster_label\b/.test(text);

export const pathOf = (target: ImportTarget, name: string) => {
  const file = `${toFileName(name) || "dashboard"}.json`;

  return target.folder ? `${target.folder}/${file}` : file;
};

export const isTaken = (library: DashboardLibrary, path: string) =>
  library.dashboards.some((dashboard) => dashboard.path === path);
