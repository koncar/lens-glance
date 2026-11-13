import type { Subscribable } from "@k8slens/subscribable";

/** Reads a subscribable once: subscribed for as long as its first value takes. */
export const readOnce = async <T>(subscribable: Subscribable<T>) => {
  const subscription = subscribable.subscribe();

  subscription.claim();

  try {
    return (await subscription.value).get();
  } finally {
    subscription.dispose();
  }
};
