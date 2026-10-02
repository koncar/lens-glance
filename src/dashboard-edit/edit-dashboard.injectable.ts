import { getInjectable2 } from "@k8slens/injectable";
import { computed, observable, onBecomeObserved, onBecomeUnobserved, reaction, runInAction } from "mobx";
import { dashboardFileInjectable } from "../dashboard-files/dashboard-file.injectable";
import { writeFileInjectable } from "../dashboard-files/write-file.injectable";
import type { DashboardEdit, DashboardJson } from "./dashboard-edits";

const versionsKept = 50;

export class DashboardIsBeingChangedError extends Error {
  constructor() {
    super(
      "The dashboard's file has problems, so it is probably being changed by the agent right now. Wait until it has none, then try again.",
    );
  }
}

// How a dashboard is changed by hand: an edit is applied to the file as it is and written back,
// so the file stays what the dashboard is. Every version the file had while it was shown is
// kept, whoever wrote it, so the last change can be undone, the agent's included.
export const editDashboardInjectable = getInjectable2({
  id: "lens-glance-edit-dashboard",

  instantiate: (di) => {
    const fileOf = di.inject(dashboardFileInjectable);
    const writeFile = di.inject(writeFileInjectable)();

    return (fileName: string) => {
      const file = fileOf(fileName);
      const versions = observable.array<string>([], { deep: false });
      let restoring: string | undefined;
      let stopKeeping: (() => void) | undefined;

      const loaded = () => {
        const current = file.get();

        if (current.status !== "loaded") {
          throw new Error("The dashboard's file is not there to change.");
        }

        return current;
      };

      const history = computed(() => versions.length);

      onBecomeObserved(history, () => {
        stopKeeping = reaction(
          () => {
            const current = file.get();

            return current.status === "loaded" ? current.text : undefined;
          },
          (text, previous) => {
            if (text === undefined || previous === undefined) {
              return;
            }

            if (text === restoring) {
              restoring = undefined;

              return;
            }

            runInAction(() => {
              versions.push(previous);

              if (versions.length > versionsKept) {
                versions.shift();
              }
            });
          },
        );
      });

      onBecomeUnobserved(history, () => stopKeeping?.());

      return {
        /** Applies an edit to the dashboard as its file has it, unless the file has problems. */
        apply: async (edit: DashboardEdit) => {
          const current = loaded();

          if (current.errors.length > 0) {
            throw new DashboardIsBeingChangedError();
          }

          const before = JSON.stringify(JSON.parse(current.text));
          const edited = edit(JSON.parse(current.text) as DashboardJson);

          // A drag that put a panel back where it was changes nothing, and writes nothing.
          if (JSON.stringify(edited) !== before) {
            await writeFile(current.path, `${JSON.stringify(edited, null, 2)}\n`);
          }
        },

        /** Writes the file as the user typed it in the JSON editor, problems and all. */
        replaceText: async (text: string) => {
          await writeFile(loaded().path, text.endsWith("\n") ? text : `${text}\n`);
        },

        canUndo: computed(() => history.get() > 0),

        /** Puts the file back the way it was before its last change. */
        undo: async () => {
          const previous = versions.at(-1);

          if (previous === undefined) {
            return;
          }

          runInAction(() => versions.pop());
          restoring = previous;
          await writeFile(loaded().path, previous);
        },
      };
    };
  },
});
