import styles from "./canvas.module.css";
export function CanvasLoading({
  authorization = false,
}: {
  authorization?: boolean;
}) {
  if (authorization)
    return (
      <div className={styles.accessCheck} role="status">
        Confirming repository access…
      </div>
    );
  return (
    <section
      className={`page ${styles.loading}`}
      aria-label="Preparing architecture map"
      aria-busy="true"
    >
      <div>
        <span className={styles.loadingEyebrow}>CANVAS / SOURCE DISCOVERY</span>
        <h1>Your architecture, taking shape.</h1>
        <p>
          Reading permitted source and preparing a static map. First analysis
          can take a moment.
        </p>
      </div>
      <div className={styles.loadingToolbar}>
        <span>Architecture</span>
        <span>Security</span>
        <span>Trust</span>
        <span>Workflows</span>
      </div>
      <div className={styles.loadingMap} aria-hidden="true">
        <div />
        <div />
        <div />
        <div />
        <div />
      </div>
      <p role="status">
        Preparing source-backed architecture. No runtime tests are being
        executed.
      </p>
    </section>
  );
}
