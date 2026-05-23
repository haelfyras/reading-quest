import { NextResponse } from "next/server";
import { createServiceSupabaseClient, isServiceSupabaseConfigured } from "../../../lib/supabase/server";

const VERIFICATION_WINDOW_MS = 10 * 60 * 1000;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function isExpired(request: Record<string, any>) {
  return Boolean(request.expires_at && Date.now() > new Date(request.expires_at).getTime());
}

async function expireOldRequests(supabase: any) {
  await supabase
    .from("parent_verification_requests")
    .update({ status: "expired" })
    .lt("expires_at", new Date().toISOString())
    .in("status", ["child_pending", "code_pending"]);
}

function mapRequest(request: Record<string, any>, parent?: Record<string, any> | null) {
  return {
    id: request.id,
    parentId: request.parent_profile_id,
    parentName: parent?.real_name || parent?.screen_name || "Parent",
    parentEmail: parent?.email || undefined,
    childId: request.child_profile_id || "",
    childScreenName: request.child_screen_name,
    status: request.status,
    code: request.code_hash || undefined,
    parentCodeEntered: Boolean(request.parent_code_entered),
    childCodeEntered: Boolean(request.child_code_entered),
    createdAt: request.created_at,
    expiresAt: request.expires_at || undefined,
  };
}

async function getRequestsForProfile(supabase: any, profileId: string) {
  await expireOldRequests(supabase);

  const { data: requests, error } = await supabase
    .from("parent_verification_requests")
    .select("*")
    .or(`parent_profile_id.eq.${profileId},child_profile_id.eq.${profileId}`)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  const parentIds = Array.from(new Set((requests ?? []).map((request: any) => request.parent_profile_id).filter(Boolean)));
  const { data: parents } = parentIds.length
    ? await supabase.from("profiles").select("id, screen_name, real_name, email").in("id", parentIds)
    : { data: [] };
  const parentsById = new Map<string, Record<string, any>>((parents ?? []).map((parent: any) => [parent.id, parent]));

  return (requests ?? []).map((request: any) => mapRequest(request, parentsById.get(request.parent_profile_id)));
}

export async function GET(request: Request) {
  const profileId = new URL(request.url).searchParams.get("profileId") ?? "";
  if (!profileId) {
    return NextResponse.json({ error: "Profile id is required." }, { status: 400 });
  }

  if (!isServiceSupabaseConfigured()) {
    return NextResponse.json({ requests: [] });
  }

  try {
    const supabase = createServiceSupabaseClient() as any;
    const requests = await getRequestsForProfile(supabase, profileId);
    return NextResponse.json({ requests });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load family verification requests." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const action = clean(body.action);

  if (!isServiceSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Family verification requires Supabase service access." },
      { status: 503 },
    );
  }

  try {
    const supabase = createServiceSupabaseClient() as any;
    await expireOldRequests(supabase);

    if (action === "create") {
      const parentId = clean(body.parentId);
      const childScreenName = clean(body.childScreenName);
      if (!parentId || !childScreenName) {
        return NextResponse.json({ error: "Parent id and child screen name are required." }, { status: 400 });
      }

      const { data: parent, error: parentError } = await supabase
        .from("profiles")
        .select("id, screen_name, real_name, email")
        .eq("id", parentId)
        .eq("account_type", "parent")
        .maybeSingle();
      if (parentError || !parent) {
        return NextResponse.json({ error: parentError?.message || "Parent account not found." }, { status: 404 });
      }

      const { data: child, error: childError } = await supabase
        .from("profiles")
        .select("id, screen_name")
        .eq("account_type", "child")
        .ilike("screen_name", childScreenName)
        .maybeSingle();
      if (childError || !child) {
        return NextResponse.json({ error: childError?.message || "Child not found. Please enter their screen name exactly." }, { status: 404 });
      }

      const { data: existingLink } = await supabase
        .from("parent_child_links")
        .select("*")
        .eq("parent_profile_id", parent.id)
        .eq("child_profile_id", child.id)
        .eq("status", "verified")
        .maybeSingle();
      if (existingLink) {
        return NextResponse.json({ error: "This child is already verified for your account." }, { status: 409 });
      }

      const { data: existingRequest } = await supabase
        .from("parent_verification_requests")
        .select("*")
        .eq("parent_profile_id", parent.id)
        .eq("child_profile_id", child.id)
        .in("status", ["child_pending", "code_pending"])
        .maybeSingle();
      if (existingRequest && !isExpired(existingRequest)) {
        return NextResponse.json({ error: "A verification request is already in progress for this child." }, { status: 409 });
      }

      const expiresAt = new Date(Date.now() + VERIFICATION_WINDOW_MS).toISOString();
      const { data: created, error: createError } = await supabase
        .from("parent_verification_requests")
        .insert({
          parent_profile_id: parent.id,
          child_profile_id: child.id,
          child_screen_name: child.screen_name,
          child_first_name: null,
          status: "child_pending",
          expires_at: expiresAt,
        })
        .select("*")
        .single();
      if (createError || !created) {
        return NextResponse.json({ error: createError?.message || "Unable to create verification request." }, { status: 500 });
      }

      return NextResponse.json({ request: mapRequest(created, parent) });
    }

    const requestId = clean(body.requestId);
    if (!requestId) {
      return NextResponse.json({ error: "Verification request id is required." }, { status: 400 });
    }

    const { data: currentRequest, error: requestError } = await supabase
      .from("parent_verification_requests")
      .select("*")
      .eq("id", requestId)
      .maybeSingle();
    if (requestError || !currentRequest) {
      return NextResponse.json({ error: requestError?.message || "That verification request was not found." }, { status: 404 });
    }

    if (action === "retry") {
      if (currentRequest.status === "verified") {
        return NextResponse.json({ error: "This family link is already verified." }, { status: 409 });
      }

      const expiresAt = new Date(Date.now() + VERIFICATION_WINDOW_MS).toISOString();
      const { data: updated, error } = await supabase
        .from("parent_verification_requests")
        .update({
          status: "child_pending",
          code_hash: null,
          parent_code_entered: false,
          child_code_entered: false,
          expires_at: expiresAt,
        })
        .eq("id", requestId)
        .select("*")
        .single();
      if (error || !updated) {
        return NextResponse.json({ error: error?.message || "Unable to restart verification." }, { status: 500 });
      }
      return NextResponse.json({ request: mapRequest(updated) });
    }

    if (isExpired(currentRequest)) {
      await supabase.from("parent_verification_requests").update({ status: "expired" }).eq("id", requestId);
      return NextResponse.json({ error: "That verification request expired. Please start again." }, { status: 410 });
    }

    if (action === "child_confirm") {
      if (currentRequest.status !== "child_pending") {
        return NextResponse.json({ error: "That request is not waiting for child approval." }, { status: 400 });
      }

      const code = generateCode();
      const { data: updated, error } = await supabase
        .from("parent_verification_requests")
        .update({
          status: "code_pending",
          code_hash: code,
          parent_code_entered: false,
          child_code_entered: false,
        })
        .eq("id", requestId)
        .select("*")
        .single();
      if (error || !updated) {
        return NextResponse.json({ error: error?.message || "Unable to confirm parent request." }, { status: 500 });
      }
      return NextResponse.json({ request: mapRequest(updated) });
    }

    if (action === "reject") {
      const { data: updated, error } = await supabase
        .from("parent_verification_requests")
        .update({ status: "rejected" })
        .eq("id", requestId)
        .select("*")
        .single();
      if (error || !updated) {
        return NextResponse.json({ error: error?.message || "Unable to reject request." }, { status: 500 });
      }
      return NextResponse.json({ request: mapRequest(updated) });
    }

    if (action === "enter_code") {
      const actor = clean(body.actor);
      const code = clean(body.code);
      if (!["parent", "child"].includes(actor) || !code) {
        return NextResponse.json({ error: "Actor and code are required." }, { status: 400 });
      }
      if (currentRequest.status !== "code_pending") {
        return NextResponse.json({ error: "That request is not waiting for a code." }, { status: 400 });
      }
      if (currentRequest.code_hash !== code) {
        return NextResponse.json({ error: "That code does not match." }, { status: 400 });
      }

      const nextParentEntered = actor === "parent" ? true : Boolean(currentRequest.parent_code_entered);
      const nextChildEntered = actor === "child" ? true : Boolean(currentRequest.child_code_entered);
      const nextStatus = nextParentEntered && nextChildEntered ? "verified" : "code_pending";

      const { data: updated, error } = await supabase
        .from("parent_verification_requests")
        .update({
          status: nextStatus,
          parent_code_entered: nextParentEntered,
          child_code_entered: nextChildEntered,
        })
        .eq("id", requestId)
        .select("*")
        .single();
      if (error || !updated) {
        return NextResponse.json({ error: error?.message || "Unable to verify code." }, { status: 500 });
      }

      if (nextStatus === "verified") {
        await supabase
          .from("parent_child_links")
          .upsert({
            parent_profile_id: currentRequest.parent_profile_id,
            child_profile_id: currentRequest.child_profile_id,
            status: "verified",
            verified_at: new Date().toISOString(),
          });
      }

      return NextResponse.json({ request: mapRequest(updated), linkedChildId: nextStatus === "verified" ? currentRequest.child_profile_id : undefined });
    }

    return NextResponse.json({ error: "Unsupported verification action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update family verification." },
      { status: 500 },
    );
  }
}
