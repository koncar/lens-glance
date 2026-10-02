import { getInjectable2 } from "@k8slens/injectable";
import { getPersistableValueInjectableBunch } from "@k8slens/persistable-contracts";
import { action, computed, type IObservableValue, observable, runInAction } from "mobx";

const smallest = 0.15;
const largest = 0.85;

/** How much of a dashboard tab's height the agent takes, kept across tabs and restarts. */
export const agentShareBunch = getPersistableValueInjectableBunch<number>()({
  id: "agent-share",
  defaultValue: { instantiate: () => async () => 0.4 },
});

// Where the line between the dashboard and the agent is, which the user drags, as the share of
// the tab the agent takes: a share rather than pixels, so it fits a window of any size.
export const agentSplitInjectable = getInjectable2({
  id: "lens-glance-agent-split",

  instantiate: (di) => {
    const getShare = di.inject(agentShareBunch.persistable);
    const persisted = observable.box<IObservableValue<number> | undefined>(undefined, { deep: false });
    const dragging = observable.box<number | undefined>(undefined);

    void getShare().then((share) => runInAction(() => persisted.set(share)));

    const clamp = (share: number) => Math.min(largest, Math.max(smallest, share));

    return () => ({
      share: computed(() => dragging.get() ?? persisted.get()?.get() ?? 0.4),

      /** The line follows the pointer, from where the tab is on screen. */
      dragTo: action((pointerY: number, tabTop: number, tabHeight: number) => {
        dragging.set(clamp((tabTop + tabHeight - pointerY) / tabHeight));
      }),

      /** Where the line was let go of is kept; it is written once, not on every move. */
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
