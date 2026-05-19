import { NextResponse } from "next/server";
import { defaultPrizes, type Prize, type PrizeAddRequest } from "../../../lib/prizeData";
import { createServiceSupabaseClient } from "../../../lib/supabase/server";

function clean(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function isUuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function mapRequest(row: Record<string, any>, childName = "Child"): PrizeAddRequest {
  return {
    id: row.id,
    childId: row.child_profile_id,
    childName,
    name: row.prize_name,
    description: row.description ?? "Requested by child",
    pointsRequired: Number(row.suggested_points ?? 10),
    status: row.status === "approved" ? "added" : row.status === "dismissed" ? "dismissed" : "pending",
    requestedAt: row.created_at,
  };
}

function mapPrize(row: Record<string, any>, redemptions: Record<string, any>[]): Prize {
  const matchingRedemptions = redemptions.filter((redemption) =>
    redemption.prize_id === row.id || redemption.prize_name?.trim().toLowerCase() === row.name?.trim().toLowerCase(),
  );
  const activeRedemption = matchingRedemptions.find((redemption) => ["requested", "approved"].includes(redemption.status));

  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    pointsRequired: Number(row.points ?? 0),
    icon: row.icon ?? undefined,
    claimed: Boolean(activeRedemption),
    claimCount: matchingRedemptions.length,
    requestedAt: activeRedemption?.created_at,
    lastClaimedAt: matchingRedemptions[0]?.created_at,
    redemptionId: activeRedemption?.id,
  };
}

async function getLinkedChildIds(supabase: any, parentId: string) {
  const { data, error } = await supabase
    .from("parent_child_links")
    .select("child_profile_id")
    .eq("parent_profile_id", parentId)
    .eq("status", "verified");

  if (error) {
    throw error;
  }

  return (data ?? []).map((link: any) => link.child_profile_id).filter(Boolean);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const childId = url.searchParams.get("childId") ?? "";
  const parentId = url.searchParams.get("parentId") ?? "";
  const summary = url.searchParams.get("summary") === "true";

  try {
    const supabase = createServiceSupabaseClient() as any;

    if (summary && isUuid(parentId)) {
      const childIds = await getLinkedChildIds(supabase, parentId);
      if (!childIds.length) {
        return NextResponse.json({ pendingPrizeIdeas: 0, pendingPrizeClaims: 0 });
      }

      const [ideasResult, redemptionsResult] = await Promise.all([
        supabase
          .from("prize_add_requests")
          .select("id")
          .in("child_profile_id", childIds)
          .eq("status", "requested"),
        supabase
          .from("prize_redemptions")
          .select("id")
          .in("profile_id", childIds)
          .in("status", ["requested", "approved"]),
      ]);

      const firstError = [ideasResult.error, redemptionsResult.error].find(Boolean);
      if (firstError) {
        return NextResponse.json({ error: firstError.message }, { status: 500 });
      }

      return NextResponse.json({
        pendingPrizeIdeas: ideasResult.data?.length ?? 0,
        pendingPrizeClaims: redemptionsResult.data?.length ?? 0,
      });
    }

    if (!isUuid(childId)) {
      return NextResponse.json({ error: "A valid child profile id is required." }, { status: 400 });
    }

    const [prizesResult, requestsResult, redemptionsResult, childResult] = await Promise.all([
      supabase
        .from("prizes")
        .select("*")
        .eq("child_profile_id", childId)
        .eq("active", true)
        .order("points", { ascending: true }),
      supabase
        .from("prize_add_requests")
        .select("*")
        .eq("child_profile_id", childId)
        .order("created_at", { ascending: false }),
      supabase
        .from("prize_redemptions")
        .select("*")
        .eq("profile_id", childId)
        .order("created_at", { ascending: false }),
      supabase
        .from("profiles")
        .select("screen_name")
        .eq("id", childId)
        .maybeSingle(),
    ]);

    const firstError = [prizesResult.error, requestsResult.error, redemptionsResult.error, childResult.error].find(Boolean);
    if (firstError) {
      return NextResponse.json({ error: firstError.message }, { status: 500 });
    }

    const redemptions = redemptionsResult.data ?? [];
    const prizes = (prizesResult.data ?? []).map((row: any) => mapPrize(row, redemptions));
    const childName = childResult.data?.screen_name ?? "Child";

    return NextResponse.json({
      prizes: prizes.length ? prizes : defaultPrizes,
      hasSavedPrizes: prizes.length > 0,
      prizeAddRequests: (requestsResult.data ?? []).map((row: any) => mapRequest(row, childName)),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load prize data." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const action = clean(body.action);

  try {
    const supabase = createServiceSupabaseClient() as any;

    if (action === "save_prizes") {
      const childId = clean(body.childId);
      const parentId = clean(body.parentId);
      const prizes = Array.isArray(body.prizes) ? body.prizes as Prize[] : [];

      if (!isUuid(childId)) {
        return NextResponse.json({ error: "A valid child profile id is required." }, { status: 400 });
      }

      const validPrizes = prizes
        .map((prize) => ({
          beta_local_id: clean(prize.id) || null,
          child_profile_id: childId,
          parent_profile_id: isUuid(parentId) ? parentId : null,
          name: clean(prize.name),
          description: clean(prize.description) || null,
          points: Math.max(1, Math.round(Number(prize.pointsRequired ?? 1))),
          icon: clean(prize.icon) || null,
          active: true,
        }))
        .filter((prize) => prize.name && prize.points > 0);

      if (!validPrizes.length) {
        return NextResponse.json({ error: "Add at least one prize with a name and point value." }, { status: 400 });
      }

      const { error: deactivateError } = await supabase
        .from("prizes")
        .update({ active: false })
        .eq("child_profile_id", childId);

      if (deactivateError) {
        return NextResponse.json({ error: deactivateError.message }, { status: 500 });
      }

      const { error: insertError } = await supabase.from("prizes").insert(validPrizes);
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true });
    }

    if (action === "request_prize_idea") {
      const childId = clean(body.childId);
      if (!isUuid(childId)) {
        return NextResponse.json({ error: "A valid child profile id is required." }, { status: 400 });
      }

      const name = clean(body.name);
      if (!name) {
        return NextResponse.json({ error: "Prize name is required." }, { status: 400 });
      }

      const { data, error } = await supabase
        .from("prize_add_requests")
        .insert({
          child_profile_id: childId,
          prize_name: name,
          description: clean(body.description) || null,
          suggested_points: Math.max(10, Math.round(Number(body.pointsRequired ?? 10))),
          status: "requested",
        })
        .select("*")
        .single();

      if (error || !data) {
        return NextResponse.json({ error: error?.message || "Unable to request that prize." }, { status: 500 });
      }

      return NextResponse.json({ request: mapRequest(data, clean(body.childName, "Child")) });
    }

    if (action === "update_prize_request") {
      const requestId = clean(body.requestId);
      const status = body.status === "added" ? "approved" : body.status === "dismissed" ? "dismissed" : "";

      if (!isUuid(requestId) || !status) {
        return NextResponse.json({ error: "A valid request and status are required." }, { status: 400 });
      }

      const { error } = await supabase
        .from("prize_add_requests")
        .update({ status })
        .eq("id", requestId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true });
    }

    if (action === "complete_redemption") {
      const redemptionId = clean(body.redemptionId);
      if (!isUuid(redemptionId)) {
        return NextResponse.json({ error: "A valid redemption id is required." }, { status: 400 });
      }

      const { error } = await supabase
        .from("prize_redemptions")
        .update({ status: "redeemed" })
        .eq("id", redemptionId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unsupported prize action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update prize data." },
      { status: 500 },
    );
  }
}
