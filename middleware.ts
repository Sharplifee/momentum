import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: { headers: req.headers } });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => req.cookies.get(name)?.value,
        set: (name: string, value: string, options: CookieOptions) => {
          res.cookies.set({ name, value, ...options });
        },
        remove: (name: string, options: CookieOptions) => {
          res.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = req.nextUrl.pathname;
  const isCrmLogin = path === "/crm/login";
  const isPortalLogin = path === "/portal/login";

  // The native app signs in against Supabase directly and hands its tokens to
  // /crm/session, which converts them into the cookie session the CRM reads.
  // That request necessarily arrives with no cookie yet, so the guard below
  // would bounce it to login and throw the tokens away — the app would hang on
  // a blank screen. Let it through; the page itself does nothing without valid
  // tokens in the URL fragment.
  if (path === "/crm/session") return res;

  if (path.startsWith("/crm") && !isCrmLogin && !user) {
    return NextResponse.redirect(new URL("/crm/login", req.url));
  }
  if (path.startsWith("/portal") && !isPortalLogin && !user) {
    return NextResponse.redirect(new URL("/portal/login", req.url));
  }
  if ((isCrmLogin && user) ) {
    return NextResponse.redirect(new URL("/crm", req.url));
  }
  return res;
}

export const config = { matcher: ["/crm/:path*", "/portal/:path*"] };
