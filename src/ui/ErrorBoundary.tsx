import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional label (e.g. the surface id) for the logged error. */
  label?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * ErrorBoundary — isolates a render error so it cannot tear down the whole app.
 *
 * The app runs a single React root (boot.tsx) that owns every open surface, so
 * an uncaught error thrown while rendering one surface would otherwise unmount
 * the entire tree and blank all surfaces. Wrapping each surface in this boundary
 * contains the failure to that surface: it renders nothing and logs, while the
 * rest of the shell keeps working. Error boundaries must be class components —
 * there is no hook equivalent for `getDerivedStateFromError`.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`Surface "${this.props.label ?? "unknown"}" crashed while rendering`, error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}
