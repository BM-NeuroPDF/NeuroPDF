import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  /**
   * Returned by `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
   */
  interface Session {
    accessToken?: string;
    apiToken?: string;
    userId?: string;
    /** Set via `update({ eula_accepted })` from the client */
    eula_accepted?: boolean;
    user: DefaultSession['user'] & {
      id?: string;
      eula_accepted?: boolean;
      accessToken?: string;
      apiToken?: string;
    };
  }

  interface User {
    accessToken?: string;
    eula_accepted?: boolean;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    apiToken?: string;
    userId?: string;
    eula_accepted?: boolean;
  }
}
