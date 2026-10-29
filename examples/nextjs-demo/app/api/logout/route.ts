import { NextResponse } from 'next/server';
import { cookieName, localRequest, revokeSession } from '../../../lib/session';

export async function POST(request: Request) {
  if (!localRequest(request))
    return new Response('Local demo only', { status: 403 });
  await revokeSession();
  const response = NextResponse.json({ loggedOut: true });
  response.cookies.set(cookieName, '', { path: '/', maxAge: 0 });
  return response;
}
