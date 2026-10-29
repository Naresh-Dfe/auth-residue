import { NextResponse } from 'next/server';
import {
  authenticate,
  cookieName,
  createSession,
  localOrigin,
  localRequest,
} from '../../../lib/session';

export async function POST(request: Request) {
  const origin = localOrigin(request);
  if (!origin || !localRequest(request))
    return new Response('Local demo only', { status: 403 });
  const form = await request.formData();
  const identity = authenticate(
    String(form.get('email') ?? ''),
    String(form.get('password') ?? ''),
  );
  if (!identity)
    return NextResponse.redirect(
      new URL('/login?error=synthetic-credentials', origin),
      303,
    );
  const response = NextResponse.redirect(new URL('/dashboard', origin), 303);
  response.cookies.set(cookieName, createSession(identity), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 1800,
  });
  return response;
}
