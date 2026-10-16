/**
 * When a part of the page breaks (an answer in a shape it does not expect,
 * say after the app was updated while the page stayed open), that part shows
 * a message and a way back; the rest of the desk keeps working.
 */
import { Component, type ReactNode } from "react";

import { useT } from "../state/session";

type Props = { children: ReactNode; message: string; retry: string; reloadPage?: string };

class Catch extends Component<Props, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidCatch(error: Error) {
    console.error("[Picnic Desk]", error);
  }
  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="trouble" role="alert">
        <p>{this.props.message.replace("{message}", this.state.error.message)}</p>
        <div className="actions start">
          <button type="button" className="secondary" onClick={() => this.setState({ error: null })}>
            {this.props.retry}
          </button>
          {this.props.reloadPage && (
            <button type="button" className="quiet" onClick={() => window.location.reload()}>
              {this.props.reloadPage}
            </button>
          )}
        </div>
      </div>
    );
  }
}

/** A part of the page that may break on its own. */
export function Boundary({ children }: { children: ReactNode }) {
  const { t, d } = useT();
  return (
    <Catch message={d.viewBroke} retry={t.retryButton} reloadPage={d.reloadPage}>
      {children}
    </Catch>
  );
}

/**
 * The last line, around everything: outside the language's reach, so it
 * speaks English, and it only ever shows when something escaped the others.
 */
export function PageBoundary({ children }: { children: ReactNode }) {
  return (
    <Catch message="Picnic Desk ran into a problem: {message}" retry="Try again" reloadPage="Reload the page">
      {children}
    </Catch>
  );
}
