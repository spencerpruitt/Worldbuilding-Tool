import { useSyncExternalStore } from "react";
import { getWorldVersion, subscribeWorld } from "./world-state";

/**
 * useWorldVersion — subscribe a surface to the global world-change signal.
 *
 * Calling this in a component makes it re-render whenever `notifyWorldChanged`
 * fires, at which point the component's plain accessor reads (`getMarkets()`,
 * `getGoods()`, …) return the fresh world data. The returned number is an opaque
 * change token: use it as a memo/effect dependency to force a re-read, not for
 * its value. This is the single line a surface adds to become reactive — the way
 * it *calls* the accessor is otherwise unchanged.
 */
export function useWorldVersion(): number {
  return useSyncExternalStore(subscribeWorld, getWorldVersion);
}
