import { getInjectable2 } from "@k8slens/injectable";
import { getPersistableValueInjectableBunch } from "@k8slens/persistable-contracts";
import { action, computed, type IObservableValue, observable, runInAction } from "mobx";

const narrowest = 0.3;
const widest = 0.95;
const initial = 0.55;

/** How much of the dashboard's width the editor drawer takes, kept across tabs and restarts. */
export const editorDrawerShareBunch = getPersistableValueInjectableBunch<number>()({
  id: "editor-drawer-share",
  defaultValue: { instantiate: () => async () => initial },
});

// How wide the drawer the editors slide in with is, as the share of the dashboard it covers:
// the user drags its left edge, and where they let go of it is kept.
export const editorDrawerWidthInjectable = getInjectable2({
  id: "lens-glance-editor-drawer-width",

  instantiate: (di) => {
    const getShare = di.inject(editorDrawerShareBunch.persistable);
    const persisted = observable.box<IObservableValue<number> | undefined>(undefined, { deep: false });
    const dragging = observable.box<number | undefined>(undefined);

    void getShare().then((share) => runInAction(() => persisted.set(share)));

    return () => ({
      share: computed(() => dragging.get() ?? persisted.get()?.get() ?? initial),

      dragTo: action((pointerX: number, frameLeft: number, frameWidth: number) => {
        dragging.set(Math.min(widest, Math.max(narrowest, (frameLeft + frameWidth - pointerX) / frameWidth)));
      }),

      drop: action(() => {
        const share = dragging.get();

        if (share !== undefined) {
          persisted.get()?.set(share);
          dragging.set(undefined);
        }
      }),
    });
  },
});
