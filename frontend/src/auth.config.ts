import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: { prompt: 'select_account', scope: 'openid email profile' },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // İlk login anında Google id_token gelir
      if (account?.id_token) {
        const res = await fetch(`${process.env.BACKEND_API_URL}/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id_token: account.id_token }),
          cache: 'no-store',
        });
        if (res.ok) {
          const data = (await res.json()) as {
            access_token?: string;
            user_id?: string;
          };
          token.apiToken = data.access_token; // FastAPI JWT
          token.userId = data.user_id;
        } else {
          console.error("[auth] Backend auth failed", res.status);
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.apiToken = token.apiToken ?? undefined;
      session.userId = token.userId ?? undefined;
      return session;
    },
  },
  session: { strategy: 'jwt' },
  secret: process.env.AUTH_SECRET,
});
