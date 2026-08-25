import type { UseDbSearchReturn } from "../hooks/dbSearchState";

type DatabaseStatusProps = Pick<
  UseDbSearchReturn,
  | "loading"
  | "status"
  | "error"
  | "mode"
  | "progress"
  | "diagnostics"
  | "canFallback"
  | "retry"
  | "downloadFullDatabase"
  | "initializationElapsed"
> & { expectedSizeBytes?: number };

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
}

function progressText(progress: NonNullable<DatabaseStatusProps["progress"]>): string {
  const phase = {
    probing: "Checking range support",
    opening: "Opening remote database",
    downloading: "Downloading complete database",
    validating: "Validating downloaded database",
  }[progress.phase];
  const amount = progress.totalBytes
    ? `${formatBytes(progress.loadedBytes)} of ${formatBytes(progress.totalBytes)}`
    : formatBytes(progress.loadedBytes);
  return `${phase}: ${amount}${progress.attempt > 1 ? ` (attempt ${progress.attempt})` : ""}.`;
}

export default function DatabaseStatus(props: DatabaseStatusProps) {
  const { diagnostics, progress } = props;
  return (
    <div className="vf-stack vf-stack--200">
      {props.loading && <p role="status">{progress ? progressText(progress) : props.status}</p>}
      {props.loading && progress?.totalBytes && progress.phase === "downloading" && (
        <progress
          aria-label="Database download progress"
          value={progress.loadedBytes}
          max={progress.totalBytes}
        />
      )}
      {props.error && (
        <div role="alert" className="vf-banner vf-banner--alert vf-banner--danger">
          <div className="vf-banner__content">
            <p className="vf-banner__text">
              <strong>Database or search error:</strong> {props.error}
            </p>
            <button type="button" className="vf-button vf-button--secondary" onClick={props.retry}>
              Retry connection
            </button>
            {props.canFallback && (
              <button
                type="button"
                className="vf-button vf-button--primary"
                onClick={props.downloadFullDatabase}
              >
                Download complete database
                {props.expectedSizeBytes ? ` (${formatBytes(props.expectedSizeBytes)})` : ""}
              </button>
            )}
          </div>
        </div>
      )}
      {diagnostics && (
        <details className="cvf-database-diagnostics">
          <summary>Database loading diagnostics</summary>
          <dl>
            <dt>Mode</dt>
            <dd>
              {diagnostics.mode === "range" ? "Validated byte-range loading" : "Complete download"}
            </dd>
            <dt>Database size</dt>
            <dd>
              {diagnostics.databaseSizeBytes
                ? formatBytes(diagnostics.databaseSizeBytes)
                : "Unknown"}
            </dd>
            <dt>Worker initialisation</dt>
            <dd
              data-testid="database-initialization-time"
              data-milliseconds={props.initializationElapsed ?? ""}
            >
              {props.initializationElapsed === null
                ? "Unknown"
                : `${props.initializationElapsed.toFixed(1)} ms`}
            </dd>
            <dt>Response bytes received</dt>
            <dd data-testid="database-response-bytes" data-bytes={diagnostics.bytesReceived}>
              {formatBytes(diagnostics.bytesReceived)}
            </dd>
            <dt>Last operation</dt>
            <dd
              data-testid="database-operation-bytes"
              data-bytes={diagnostics.operationBytesReceived}
              data-requests={diagnostics.operationRequests}
            >
              {formatBytes(diagnostics.operationBytesReceived)} in {diagnostics.operationRequests}{" "}
              request
              {diagnostics.operationRequests === 1 ? "" : "s"}
            </dd>
            <dt>Retries</dt>
            <dd>{diagnostics.retries}</dd>
          </dl>
        </details>
      )}
    </div>
  );
}
