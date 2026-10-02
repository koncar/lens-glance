import { Div, Span } from "@k8slens/element-components";
import { ErrorOutlineIcon } from "@k8slens/icon";
import { PlainButton } from "@k8slens/input-components";
import { Component, type ErrorInfo, type ReactNode } from "react";

export interface ContainedProps {
  /** What failed, in words for the user: "This panel", "The agent". */
  readonly what: string;
  /** A failure is let go of when this changes, such as when the dashboard's file changes. */
  readonly retryOn?: unknown;
  readonly children: ReactNode;
}

interface ContainedState {
  readonly error?: Error;
  readonly retryOn?: unknown;
}

const Failure = ({
  what,
  error,
  onRetry,
}: {
  readonly what: string;
  readonly error: Error;
  readonly onRetry: () => void;
}) => (
  <Div
    $flex={{ verticalAlign: "center", gap: "s" }}
    $padding={{ horizontal: "m", vertical: "s" }}
    $backgroundColor="backgroundPrimary"
    $border={{ left: { width: "xs", color: "critical" } }}
  >
    <ErrorOutlineIcon $size="s" $color="critical" />
    <Div $flex={{ direction: "vertical" }} $flexChild="shrinkable">
      <Span $font={{ size: "s", bold: true }} $color="textHighlight">
        {what} failed
      </Span>
      <Span $font={{ size: "xs", forceWrap: true }} $color="textMuted">
        {error.message}
      </Span>
    </Div>
    <PlainButton onClick={onRetry}>Try again</PlainButton>
  </Div>
);

// Keeps a failure inside the part of the dashboard it happened in. Without it, it would take
// down the whole tab, which Lens shows again every time the tab is reopened.
export class Contained extends Component<ContainedProps, ContainedState> {
  state: ContainedState = { retryOn: this.props.retryOn };

  static getDerivedStateFromError(error: Error): Partial<ContainedState> {
    return { error };
  }

  static getDerivedStateFromProps(props: ContainedProps, state: ContainedState): Partial<ContainedState> | null {
    return Object.is(props.retryOn, state.retryOn) ? null : { error: undefined, retryOn: props.retryOn };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[lens-glance] ${this.props.what} failed`, error, info.componentStack);
  }

  render() {
    const { error } = this.state;

    return error ? (
      <Failure what={this.props.what} error={error} onRetry={() => this.setState({ error: undefined })} />
    ) : (
      this.props.children
    );
  }
}
