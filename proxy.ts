import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  // Δημόσιες σελίδες — προσβάσιμες ΧΩΡΙΣ σύνδεση (landing + νομικά + auth).
  // Το /privacy & /terms ΠΡΕΠΕΙ να είναι δημόσια (απαίτηση GDPR).
  const PUBLIC = new Set(["/", "/login", "/signup", "/privacy", "/terms"]);
  // Η πύλη ενοικιαστή (/portal/<token>) είναι δημόσια — πρόσβαση χωρίς login.
  const isPublic = PUBLIC.has(pathname) || pathname.startsWith("/portal/");
  const isAuthPage = pathname === "/login" || pathname === "/signup";

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Συνδεδεμένος χρήστης σε σελίδα σύνδεσης/εγγραφής → πάει στο dashboard.
  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
