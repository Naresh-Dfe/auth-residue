import type { ReactNode } from 'react';
import './style.css';

export const metadata = {
  title: 'AuthResidue · Local test workspace',
  description: 'Synthetic identity-transition fixtures. Local testing only.',
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header>
            <a href="/login" className="brand">
              AuthResidue<span>.</span>
            </a>
            <span className="local">LOCAL TEST FIXTURE</span>
          </header>
          {children}
          <footer>
            Synthetic data only. Never deploy these intentional vulnerabilities
            publicly.
          </footer>
        </div>
      </body>
    </html>
  );
}
