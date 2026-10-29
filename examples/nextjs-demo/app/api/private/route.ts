import {
  account,
  currentIdentity,
  demoMode,
  localRequest,
} from '../../../lib/session';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if (!localRequest(request))
    return new Response('Local demo only', { status: 403 });
  const identity = await currentIdentity();
  if (!identity && demoMode() !== 'public-api')
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  const user = account(identity ?? 'a');
  return Response.json({
    identity: user.name,
    privateCanary: user.canary,
    fixture: user.number,
  });
}
