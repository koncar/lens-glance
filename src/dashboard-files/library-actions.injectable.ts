import { getInjectable2 } from "@k8slens/injectable";
import { hostFilesInjectable } from "../platform/host-files.injectable";
import { dashboardLibraryInjectable, folderOfDashboard, nameOfDashboard } from "./dashboard-library.injectable";
import { dashboardsDirectoryInjectable } from "./dashboards-directory.injectable";
import { starterFor } from "./starter-dashboard";
import { writeFileInjectable } from "./write-file.injectable";

/** A name the user typed made fit for a file: lower case, words joined by dashes. */
export const toFileName = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const joined = (folder: string, name: string) => (folder ? `${folder}/${name}` : name);

// Lens's own files about a dashboard, which go where the dashboard goes.
const lensFilesOf = (directory: string, path: string) => {
  const base = `${directory}/.lens/${path.replace(/\.json$/, "")}`;

  return [`${base}.status.json`, `${base}.query.json`, `${base}.query.result.json`];
};

// What the user does to the library from the navigator: new dashboards and folders, renaming
// and deleting. Each answers with the dashboard's path where there is one to open.
export const libraryActionsInjectable = getInjectable2({
  id: "lens-glance-library-actions",

  instantiate: (di) => {
    const files = di.inject(hostFilesInjectable)();
    const getDirectory = di.inject(dashboardsDirectoryInjectable);
    const writeFile = di.inject(writeFileInjectable)();
    const { refresh } = di.inject(dashboardLibraryInjectable)();

    const createDashboard = async (folder: string, title: string) => {
      const name = toFileName(title) || "dashboard";
      const path = joined(folder, `${name}.json`);
      const starter = starterFor(path, name, title.trim() || name);

      await writeFile(`${await getDirectory()}/${path}`, `${JSON.stringify(starter, null, 2)}\n`, {
        onlyIfMissing: true,
      });
      await refresh();

      return path;
    };

    const createFolder = async (parent: string, title: string) => {
      const folder = joined(parent, toFileName(title) || "folder");

      await files.makeDirectory(`${await getDirectory()}/${folder}`);
      await refresh();

      return folder;
    };

    const renameDashboard = async (path: string, title: string) => {
      const directory = await getDirectory();
      const renamed = joined(folderOfDashboard(path), `${toFileName(title) || nameOfDashboard(path)}.json`);

      if (renamed !== path) {
        await files.move(`${directory}/${path}`, `${directory}/${renamed}`);
        await files.remove(...lensFilesOf(directory, path));
        await refresh();
      }

      return renamed;
    };

    const deleteDashboard = async (path: string) => {
      const directory = await getDirectory();

      await files.remove(`${directory}/${path}`, ...lensFilesOf(directory, path));
      await refresh();
    };

    // Only an empty folder is deleted: the dashboards in a folder are deleted one by one, on purpose.
    const deleteFolder = async (folder: string) => {
      await files.removeEmptyDirectory(`${await getDirectory()}/${folder}`);
      await refresh();
    };

    return () => ({ createDashboard, createFolder, renameDashboard, deleteDashboard, deleteFolder });
  },
});
