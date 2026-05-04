import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, isAdminConfigured, verifyAdminSessionToken } from "../../../../lib/adminAuth";

export async function GET() {
  const token = cookies().get(ADMIN_COOKIE_NAME)?.value;
  return NextResponse.json({
    authenticated: verifyAdminSessionToken(token),
    configured: isAdminConfigured(),
  });
}
