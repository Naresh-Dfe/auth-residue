'use client';

import { useEffect, useState } from 'react';
import type { Mode } from '../lib/session';

export function LoginForm() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  return (
    <form action="/api/login" method="post" data-testid="login-form">
      <label>
        Email
        <input
          name="email"
          disabled={!ready}
          type="email"
          autoComplete="username"
          required
          placeholder="Synthetic account email"
        />
      </label>
      <label>
        Password
        <input
          name="password"
          disabled={!ready}
          type="password"
          autoComplete="current-password"
          required
          placeholder="Synthetic test password"
        />
      </label>
      <button type="submit" disabled={!ready}>
        Open test workspace <span aria-hidden="true">↗</span>
      </button>
      {ready && (
        <span data-testid="page-ready" className="ready">
          Local form ready
        </span>
      )}
    </form>
  );
}

export function PrivatePanel({ canary, mode }: { canary: string; mode: Mode }) {
  const [value, setValue] = useState(canary);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const previous = localStorage.getItem('authresidue-private-cache');
    if (mode === 'cache-leak' && previous) setValue(previous);
    else localStorage.setItem('authresidue-private-cache', canary);
    sessionStorage.setItem('authresidue-tab-private', canary);
    setReady(true);
  }, [canary, mode]);
  return (
    <section className="card private">
      <div className="eyebrow">Identity-scoped private content</div>
      <h2>Private test canary</h2>
      <p>
        This synthetic value is the assertion used by AuthResidue. It belongs to
        one test identity.
      </p>
      <code data-testid="private">{value}</code>
      {ready && (
        <span data-testid="page-ready" className="ready">
          Private view ready
        </span>
      )}
    </section>
  );
}

export function StalePanel() {
  const [canary, setCanary] = useState('');
  useEffect(() => {
    setCanary(sessionStorage.getItem('authresidue-tab-private') ?? '');
  }, []);
  return (
    <section className="card">
      <h2>Deliberately retained tab state</h2>
      <p data-testid="private">{canary}</p>
    </section>
  );
}

export function LogoutButton({ mode }: { mode: Mode }) {
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  return (
    <button
      className="secondary"
      data-testid="logout"
      disabled={!ready || busy}
      onClick={async () => {
        setBusy(true);
        const response = await fetch('/api/logout', { method: 'POST' });
        if (!response.ok) {
          setBusy(false);
          return;
        }
        if (mode !== 'cache-leak')
          localStorage.removeItem('authresidue-private-cache');
        sessionStorage.removeItem('authresidue-tab-private');
        location.assign('/login');
      }}
    >
      {busy ? 'Leaving…' : 'Log out'}
    </button>
  );
}
