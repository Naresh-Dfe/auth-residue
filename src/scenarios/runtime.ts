import type { Browser, BrowserContext, Page } from 'playwright';
import type { Config, ScenarioId } from '../config/schema.js';
import type { Finding } from '../core/results.js';
import type { Credentials } from '../auth/session.js';

export interface ScenarioRuntime {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  config: Config;
  credentials: Credentials;
  id: ScenarioId;
  signal?: AbortSignal;
  createContext: () => Promise<BrowserContext>;
  findings: Finding[];
  setPhase: (phase: string) => void;
}
