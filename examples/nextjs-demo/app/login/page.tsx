import { LoginForm } from '../components';
import { demoMode } from '../../lib/session';

export const dynamic = 'force-dynamic';
export default function Login() {
  const mode = demoMode();
  return (
    <main className="login-grid">
      <section>
        <div className="eyebrow">Test what survives after the user leaves</div>
        <h1>
          A small workspace.
          <br />A meaningful boundary.
        </h1>
        <p className="lead">
          Sign in with one of your synthetic accounts, then let AuthResidue test
          the transition to the next identity.
        </p>
        <div className="mode">
          <span className={mode === 'secure' ? 'dot safe' : 'dot'} />
          Mode: <strong>{mode}</strong>
        </div>
        <p className="muted">
          Change AUTHRESIDUE_DEMO_MODE and restart to select a controlled
          failure.
        </p>
      </section>
      <section className="card">
        <h2>Open your workspace</h2>
        <p>Use credentials exported in the server environment.</p>
        <LoginForm />
        <small>Two synthetic accounts · No database · Loopback only</small>
      </section>
    </main>
  );
}
