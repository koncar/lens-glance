import { getInjectable2 } from "@k8slens/injectable";
import type { DashboardResource } from "@perses-dev/core";
import { computed, observable, onBecomeObserved, onBecomeUnobserved, runInAction } from "mobx";
import { hostFilesInjectable } from "../platform/host-files.injectable";
import { dashboardsDirectoryInjectable } from "./dashboards-directory.injectable";
import { validateDashboard } from "./validate-dashboard";

export type DashboardFile =
  | { readonly status: "loading" }
  | { readonly status: "missing"; readonly path: string }
  | { readonly status: "unreadable"; readonly path: string; readonly error: string }
  | {
      readonly status: "loaded";
      readonly path: string;
      readonly text: string;
      /** Why the file as it is now cannot be shown; empty when it can. */
      readonly errors: readonly string[];
      /** The file as it was when it last could be shown, which is what stays on screen meanwhile. */
      readonly dashboard?: DashboardResource;
      readonly changedAt: number;
    };

// How often the file is read while a dashboard shows it. Lens offers no file watching, so this
// is what makes a change the agent writes appear: within half a second.
const pollIntervalMs = 500;

export const dashboardFileInjectable = getInjectable2({
  id: "lens-glance-dashboard-file",

  instantiate: (di) => {
    const files = di.inject(hostFilesInjectable)();
    const getDirectory = di.inject(dashboardsDirectoryInjectable);

    return (fileName: string) => {
      const state = observable.box<DashboardFile>({ status: "loading" }, { deep: false });
      let timer: ReturnType<typeof setTimeout> | undefined;
      let reading = false;

      const read = async () => {
        let path = fileName;

        try {
          path = files.native(`${await getDirectory()}/${fileName}`);

          const text = await files.read(path);
          const current = state.get();

          if (text === undefined) {
            if (current.status !== "missing") {
              runInAction(() => state.set({ status: "missing", path }));
            }
          } else if (current.status !== "loaded" || current.text !== text) {
            const validation = validateDashboard(text);
            const lastShown = current.status === "loaded" ? current.dashboard : undefined;

            runInAction(() =>
              state.set({
                status: "loaded",
                path,
                text,
                errors: validation.valid ? [] : validation.errors,
                dashboard: validation.valid ? validation.dashboard : lastShown,
                changedAt: Date.now(),
              }),
            );
          }
        } catch (error) {
          runInAction(() =>
            state.set({ status: "unreadable", path, error: String((error as Error).message ?? error) }),
          );
        } finally {
          if (reading) {
            timer = setTimeout(() => void read(), pollIntervalMs);
          }
        }
      };

      onBecomeObserved(state, () => {
        reading = true;
        void read();
      });

      onBecomeUnobserved(state, () => {
        reading = false;
        clearTimeout(timer);
      });

      return computed(() => state.get());
    };
  },
});
