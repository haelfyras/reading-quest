import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, createAdminSessionToken, isAdminConfigured, verifyAdminCode } from "../../../../lib/adminAuth";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({ code: "" }));
  const code = typeof body.code === "string" ? body.code : "";

  if (!isAdminConfigured()) {
    return NextResponse.json(
      { error: "Admin access is not configured. Set ADMIN_ACCESS_CODE before using the admin site." },
      { status: 503 },
    );
  }

  if (!verifyAdminCode(code)) {
    return NextResponse.json({ error: "That admin code did not match." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE_NAME, createAdminSessionToken(), {
    httpOnly: true,
    maxAge: 12 * 60 * 60,
    path: "/",
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
