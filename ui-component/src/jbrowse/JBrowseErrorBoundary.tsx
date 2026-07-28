import { Component, type ReactNode } from "react";

interface JBrowseErrorBoundaryProps {
  children: ReactNode;
  resetKey: string;
  onError?: (error: Error) => void;
}

interface JBrowseErrorBoundaryState {
  error: Error | null;
}

/** Prevents a JBrowse render failure from unmounting the SQLite search UI. */
export default class JBrowseErrorBoundary extends Component<
  JBrowseErrorBoundaryProps,
  JBrowseErrorBoundaryState
> {
  state: JBrowseErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): JBrowseErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error): void {
    this.props.onError?.(error);
  }

  componentDidUpdate(previous: JBrowseErrorBoundaryProps): void {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="cvf-jbrowse__error" role="alert">
          The genome browser could not be loaded. Search remains available.
        </div>
      );
    }
    return this.props.children;
  }
}
