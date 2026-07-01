import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Tell React this is an act()-aware test environment so state updates dispatched
// via act(...) flush synchronously and React does not warn about it.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// Unmount React trees rendered by React Testing Library between tests so the
// browser DOM (and the module-level app-shell registry) does not leak state
// across component tests.
afterEach(cleanup);
