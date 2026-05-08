import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const needsAuth = req.nextUrl.pathname.startsWith('/dashboard');
  if (needsAuth) {
    const token =
      req.cookies.get('next-auth.session-token') ??
      req.cookies.get('__Secure-next-auth.session-token');
    if (!token) {
      return NextResponse.redirect(new URL('/login', req.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
