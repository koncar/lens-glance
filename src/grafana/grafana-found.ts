import {
  arrayOf,
  isGrafanaDashboard,
  isObject,
  numberOf,
  objectOf,
  stringOf,
  unwrapGrafanaDashboard,
} from "./grafana-json";
import type { SqliteDatabase, SqliteValue } from "./sqlite-reader";

/** Where in the library Grafana's dashboards go, each in the folder Grafana shows it in. */
export const grafanaFolder = "grafana";

/** The ways Grafana's dashboards are looked for, each of which the user turns on or off. */
export type GrafanaSourceKind = "configMaps" | "operator" | "secrets" | "api" | "database";

export const grafanaSourceKinds: readonly GrafanaSourceKind[] = [
  "configMaps",
  "operator",
  "secrets",
  "api",
  "database",
];

export interface FoundGrafanaDashboard {
  /** What it is told apart by across the places it was found in: its uid, else its title. */
  readonly id: string;
  readonly uid?: string;
  readonly title: string;
  /** The folder Grafana shows it in; none for Grafana's General folder. */
  readonly folder?: string;
  readonly source: GrafanaSourceKind;
  /** Where it was found, as a person says it: `ConfigMap monitoring/grafana-dashboards (nodes.json)`. */
  readonly where: string;
  /** Where else the same dashboard was found. */
  readonly alsoIn: readonly string[];
  /** Grafana's version of it, which grows with every save, where it is known. */
  readonly version?: number;
  /** The dashboard as Grafana has it. */
  readonly json: unknown;
  /** The library panels of the Grafana it was read from, by uid. */
  readonly libraryPanels?: ReadonlyMap<string, unknown>;
}

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

const textOf = (value: SqliteValue | undefined) =>
  typeof value === "string" ? value : value instanceof Uint8Array ? new TextDecoder().decode(value) : undefined;

export const base64ToBytes = (base64: string) => {
  const binary = atob(base64.replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
};

export const isGzip = (bytes: Uint8Array) => bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

export const gunzip = async (bytes: Uint8Array): Promise<Uint8Array> => {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));

  return new Uint8Array(await new Response(stream).arrayBuffer());
};

/** A dashboard found, made from its JSON, or nothing when the JSON is not a Grafana dashboard. */
const foundOf = (
  json: unknown,
  found: Omit<FoundGrafanaDashboard, "id" | "uid" | "title" | "alsoIn" | "json"> & { readonly title?: string },
): FoundGrafanaDashboard | undefined => {
  if (!isGrafanaDashboard(json)) {
    return undefined;
  }

  const dashboard = objectOf(unwrapGrafanaDashboard(json));
  const uid = stringOf(dashboard.uid) || undefined;
  const title = stringOf(dashboard.title)?.trim() || found.title || uid || "Grafana dashboard";
  const folder = found.folder?.trim();

  return {
    ...found,
    id: uid ?? `title:${title}`,
    uid,
    title,
    folder: folder && folder !== "General" ? folder : undefined,
    version: found.version ?? numberOf(dashboard.version),
    alsoIn: [],
    json,
  };
};

// --- ConfigMaps and Secrets -------------------------------------------------------------------

export interface DataResource {
  readonly metadata: {
    readonly name: string;
    readonly namespace?: string;
    readonly labels?: Readonly<Record<string, string>>;
    readonly annotations?: Readonly<Record<string, string>>;
  };
  readonly data?: Readonly<Record<string, string>>;
  readonly binaryData?: Readonly<Record<string, string>>;
}

/** Whether a resource is labelled for Grafana's sidecar to load its dashboards, as `grafana_dashboard: "1"`. */
export const isLabelledForGrafana = (resource: DataResource) =>
  Object.keys(resource.metadata.labels ?? {}).some((label) => /grafana[_-]?dashboards?$/i.test(label));

// The folder Grafana's sidecar puts a resource's dashboards in, by the annotation it is told to read.
const folderOfResource = (resource: DataResource) => {
  const annotations = resource.metadata.annotations ?? {};
  const folder =
    annotations.grafana_folder ?? annotations["k8s-sidecar-target-directory"] ?? annotations["grafana-folder"];

  return folder?.replace(/\/+$/, "").split("/").pop() || undefined;
};

const looksLikeDashboard = (text: string) => text.includes('"panels"') || text.includes('"rows"');

/**
 * The dashboards in a ConfigMap or a Secret: each of its keys whose content is a Grafana
 * dashboard, `data` read as it is, or decoded from base64 for a Secret, and `binaryData` decoded,
 * and decompressed when gzipped.
 */
export const dashboardsInResource = async (
  resource: DataResource,
  kind: "ConfigMap" | "Secret",
): Promise<FoundGrafanaDashboard[]> => {
  const source: GrafanaSourceKind = kind === "Secret" ? "secrets" : "configMaps";
  const name = `${resource.metadata.namespace ? `${resource.metadata.namespace}/` : ""}${resource.metadata.name}`;
  const folder = folderOfResource(resource);
  const texts: [key: string, text: string][] = [];

  for (const [key, value] of Object.entries(resource.data ?? {})) {
    if (kind === "ConfigMap") {
      texts.push([key, value]);
    } else {
      try {
        const bytes = base64ToBytes(value);

        texts.push([key, new TextDecoder().decode(isGzip(bytes) ? await gunzip(bytes) : bytes)]);
      } catch {
        // Not base64, so not anything Grafana reads either.
      }
    }
  }

  for (const [key, value] of Object.entries(resource.binaryData ?? {})) {
    try {
      const bytes = base64ToBytes(value);

      texts.push([key, new TextDecoder().decode(isGzip(bytes) ? await gunzip(bytes) : bytes)]);
    } catch {
      // Read as what it is not: left out.
    }
  }

  return texts.flatMap(([key, text]) => {
    if (!looksLikeDashboard(text)) {
      return [];
    }

    const found = foundOf(parseJson(text), { source, folder, where: `${kind} ${name} (${key})` });

    return found ? [found] : [];
  });
};

// --- grafana-operator's GrafanaDashboard ------------------------------------------------------

export interface GrafanaDashboardResource {
  readonly metadata: { readonly name: string; readonly namespace?: string };
  readonly spec?: {
    readonly json?: string;
    readonly gzipJson?: string;
    readonly configMapRef?: { readonly name?: string; readonly key?: string };
    readonly url?: string;
    readonly grafanaCom?: unknown;
    readonly jsonnet?: string;
    readonly jsonnetLib?: unknown;
    readonly folder?: string;
    readonly folderRef?: string;
    readonly customFolderName?: string;
  };
}

/**
 * The dashboard a GrafanaDashboard holds: inline, gzipped, or in a ConfigMap it names. One the
 * operator fetches from a URL or grafana.com, or builds with Jsonnet, is not read, and is said
 * so instead.
 */
export const dashboardOfOperatorResource = async (
  resource: GrafanaDashboardResource,
  configMaps: readonly DataResource[],
): Promise<FoundGrafanaDashboard | string | undefined> => {
  const spec = resource.spec ?? {};
  const where = `GrafanaDashboard ${resource.metadata.namespace ?? ""}/${resource.metadata.name}`;
  const folder = spec.folder ?? spec.customFolderName ?? spec.folderRef;
  let text: string | undefined;

  if (spec.json) {
    text = spec.json;
  } else if (spec.gzipJson) {
    try {
      text = new TextDecoder().decode(await gunzip(base64ToBytes(spec.gzipJson)));
    } catch {
      return `${where}: its gzipJson could not be read`;
    }
  } else if (spec.configMapRef?.name && spec.configMapRef.key) {
    const configMap = configMaps.find(
      (one) => one.metadata.name === spec.configMapRef?.name && one.metadata.namespace === resource.metadata.namespace,
    );

    text = configMap?.data?.[spec.configMapRef.key];

    if (text === undefined) {
      return `${where}: its ConfigMap ${spec.configMapRef.name} was not found`;
    }
  } else if (spec.url || spec.grafanaCom) {
    return `${where}: the operator fetches it from ${spec.url ? "a URL" : "grafana.com"}`;
  } else if (spec.jsonnet || spec.jsonnetLib) {
    return `${where}: the operator builds it with Jsonnet`;
  }

  return text === undefined ? undefined : foundOf(parseJson(text), { source: "operator", folder, where });
};

// --- Grafana's API, asked inside its pod ------------------------------------------------------

/** The uids `/api/search?type=dash-db` lists. */
export const uidsOfSearch = (answer: unknown) =>
  arrayOf(answer)
    .map(objectOf)
    .filter((hit) => (hit.type ?? "dash-db") === "dash-db")
    .flatMap((hit) => stringOf(hit.uid) ?? []);

/** The library panels used by dashboards, by uid. */
export const libraryPanelUidsOf = (dashboards: readonly unknown[]) => {
  const uids = new Set<string>();

  const walk = (panels: unknown) =>
    arrayOf(panels)
      .map(objectOf)
      .forEach((panel) => {
        const uid = stringOf(objectOf(panel.libraryPanel).uid);

        if (uid) {
          uids.add(uid);
        }

        walk(panel.panels);
      });

  dashboards.forEach((dashboard) => walk(objectOf(unwrapGrafanaDashboard(dashboard)).panels));

  return [...uids];
};

/** What `/api/dashboards/uid/<uid>` answers, as a dashboard found. */
export const dashboardOfApiAnswer = (answer: unknown, where: string): FoundGrafanaDashboard | undefined => {
  const meta = objectOf(objectOf(answer).meta);

  return foundOf(answer, {
    source: "api",
    folder: stringOf(meta.folderTitle),
    where,
    version: numberOf(objectOf(objectOf(answer).dashboard).version),
  });
};

// --- Grafana's database ------------------------------------------------------------------------

/**
 * The dashboards in Grafana's SQLite database: the `dashboard` table, with the titles of their
 * folders, or, where that has none, the resources Grafana 12's unified storage keeps them as.
 * Library panels come from `library_element`.
 */
export const dashboardsInDatabase = (database: SqliteDatabase, where: string): FoundGrafanaDashboard[] => {
  const tables = new Set(database.tableNames());
  const libraryPanels = new Map<string, unknown>();

  if (tables.has("library_element")) {
    for (const row of database.rows("library_element")) {
      const uid = textOf(row.uid);
      const model = parseJson(textOf(row.model) ?? "");

      if (uid && isObject(model)) {
        libraryPanels.set(uid, model);
      }
    }
  }

  const rows = tables.has("dashboard") ? database.rows("dashboard") : [];
  const folderTitles = new Map<string, string>();

  for (const row of tables.has("folder") ? database.rows("folder") : []) {
    const uid = textOf(row.uid);
    const title = textOf(row.title);

    if (uid && title) {
      folderTitles.set(uid, title);
    }
  }

  for (const row of rows.filter((one) => one.is_folder === 1)) {
    const title = textOf(row.title);

    if (title) {
      folderTitles.set(`id:${row.id}`, title);

      if (textOf(row.uid)) {
        folderTitles.set(textOf(row.uid)!, title);
      }
    }
  }

  const dashboards = rows
    .filter((row) => row.is_folder !== 1 && (row.deleted === null || row.deleted === undefined))
    .flatMap((row) => {
      const folderUid = textOf(row.folder_uid);
      const folder =
        (folderUid ? folderTitles.get(folderUid) : undefined) ??
        (numberOf(row.folder_id) ? folderTitles.get(`id:${row.folder_id}`) : undefined);
      const found = foundOf(parseJson(textOf(row.data) ?? ""), {
        source: "database",
        folder,
        where,
        title: textOf(row.title),
        version: numberOf(row.version),
        libraryPanels,
      });

      return found ? [found] : [];
    });

  if (dashboards.length > 0 || !tables.has("resource")) {
    return dashboards;
  }

  // Grafana 12's unified storage: each dashboard a resource, its spec the dashboard.
  const resources = database
    .rows("resource")
    .map((row) => ({ row, value: objectOf(parseJson(textOf(row.value) ?? "")) }));
  const folderResources = new Map(
    resources
      .filter(({ row }) => row.group === "folder.grafana.app")
      .map(({ row, value }) => [textOf(row.name) ?? "", stringOf(objectOf(value.spec).title) ?? ""]),
  );

  return resources
    .filter(({ row }) => row.group === "dashboard.grafana.app" && row.resource === "dashboards")
    .flatMap(({ row, value }) => {
      const folderUid =
        textOf(row.folder) ?? stringOf(objectOf(objectOf(value.metadata).annotations)["grafana.app/folder"]);
      const found = foundOf(
        { ...objectOf(value.spec), uid: stringOf(objectOf(value.spec).uid) ?? textOf(row.name) },
        { source: "database", folder: folderUid ? folderResources.get(folderUid) : undefined, where, libraryPanels },
      );

      return found ? [found] : [];
    });
};

// --- Putting them together ---------------------------------------------------------------------

// What Grafana itself shows wins over what it was provisioned from, being what the user sees there.
const precedence: Readonly<Record<GrafanaSourceKind, number>> = {
  database: 0,
  api: 1,
  operator: 2,
  configMaps: 3,
  secrets: 4,
};

/** The dashboards found, each once: the same dashboard found in several places is one, said to be in each. */
export const mergeFoundDashboards = (found: readonly FoundGrafanaDashboard[]): FoundGrafanaDashboard[] => {
  const byId = new Map<string, FoundGrafanaDashboard>();

  for (const one of found) {
    const known = byId.get(one.id);

    if (!known) {
      byId.set(one.id, one);
      continue;
    }

    const newer =
      known.version !== undefined && one.version !== undefined && one.version !== known.version
        ? one.version > known.version
        : precedence[one.source] < precedence[known.source];
    const [kept, other] = newer ? [one, known] : [known, one];

    byId.set(one.id, {
      ...kept,
      folder: kept.folder ?? other.folder,
      alsoIn: [...new Set([...kept.alsoIn, other.where, ...other.alsoIn])].filter((where) => where !== kept.where),
    });
  }

  return [...byId.values()].sort(
    (one, other) => (one.folder ?? "").localeCompare(other.folder ?? "") || one.title.localeCompare(other.title),
  );
};

const slugOf = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * Where in the library each dashboard goes: `grafana/`, the folder Grafana shows it in, and its
 * title, the uid added to tell apart dashboards of the same title in the same folder.
 */
export const libraryPathsOf = (dashboards: readonly FoundGrafanaDashboard[]): Map<string, string> => {
  const pathOf = (dashboard: FoundGrafanaDashboard, withUid: boolean) => {
    const folder = dashboard.folder ? slugOf(dashboard.folder) : "";
    const name = slugOf(dashboard.title) || "dashboard";
    const suffix = withUid && dashboard.uid ? `-${slugOf(dashboard.uid)}` : "";

    return `${grafanaFolder}/${folder ? `${folder}/` : ""}${name}${suffix}.json`;
  };

  const counts = new Map<string, number>();

  dashboards.forEach((dashboard) =>
    counts.set(pathOf(dashboard, false), (counts.get(pathOf(dashboard, false)) ?? 0) + 1),
  );

  return new Map(
    dashboards.map((dashboard) => [dashboard.id, pathOf(dashboard, (counts.get(pathOf(dashboard, false)) ?? 0) > 1)]),
  );
};

/** What a JSON parse of an answer gives, or undefined. */
export const parseAnswer = parseJson;
