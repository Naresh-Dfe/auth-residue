import { redirect } from 'next/navigation';
import { account, currentIdentity, demoMode } from '../../lib/session';
import {
  LoginForm,
  LogoutButton,
  PrivatePanel,
  StalePanel,
} from '../components';

export const dynamic = 'force-dynamic';
export default async function Dashboard() {
  const identity = await currentIdentity();
  const mode = demoMode();
  if (!identity) {
    if (mode === 'stale-tab')
      return (
        <main>
          <div className="eyebrow">
            Anonymous view · deliberately broken tab cache
          </div>
          <h1>Session ended</h1>
          <StalePanel />
          <section className="card">
            <LoginForm />
          </section>
        </main>
      );
    redirect('/login');
  }
  const user = account(identity);
  return (
    <main>
      <div className="dashboard-top">
        <div>
          <div className="eyebrow">Synthetic workspace · {mode}</div>
          <h1>
            Welcome, <span data-testid="identity">{user.name}</span>.
          </h1>
          <p className="lead">An identity boundary you can test.</p>
        </div>
        <LogoutButton mode={mode} />
      </div>
      <div className="cards">
        <section className="card">
          <span className="eyebrow">Current identity</span>
          <h2>{user.project}</h2>
          <p>{user.number}</p>
          <small>Authenticated using a local, test-only session.</small>
        </section>
        <section className="card">
          <span className="eyebrow">Read-only API</span>
          <h2>/api/private</h2>
          <p>The endpoint returns only synthetic fixture data.</p>
          <small>
            AuthResidue verifies the canary, not just the status code.
          </small>
        </section>
      </div>
      <PrivatePanel canary={user.canary} mode={mode} />
    </main>
  );
}
