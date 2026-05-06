import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, verifyAdminSessionToken } from "../../../../lib/adminAuth";
import { createServiceSupabaseClient } from "../../../../lib/supabase/server";

export async function PATCH(request: Request) {
  const token = cookies().get(ADMIN_COOKIE_NAME)?.value;
  if (!verifyAdminSessionToken(token)) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const reportId = String(body.reportId || "");
  const status = String(body.status || "");
  const parentNote = String(body.parentNote || "");

  if (!reportId || !["accepted", "dismissed", "open"].includes(status)) {
    return NextResponse.json({ error: "A report id and valid status are required." }, { status: 400 });
  }

  try {
    const supabase = createServiceSupabaseClient();
    const { data, error } = await supabase
      .from("quiz_issue_reports")
      .update({
        status: status as "accepted" | "dismissed" | "open",
        parent_note: parentNote || null,
      })
      .eq("id", reportId)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ report: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update quiz report." },
      { status: 500 },
    );
  }
}
