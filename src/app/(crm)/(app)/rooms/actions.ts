"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff, ADMIN_ROLES } from "@/lib/bk/staff";
import { audit } from "@/lib/bk/audit";
import type { Json } from "@/lib/database.types";
import { runAction } from "@/components/admin/server";
import type { ActionResult } from "@/components/admin/shared";

const uuid = z.string().uuid();
const BUCKET = "bk-room-images";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

function revalidateAll() {
  for (const p of ["/rooms", "/calendar", "/rates", "/reservations/new"]) revalidatePath(p);
}

// ---------------------------------------------------------------------------
// Room types
// ---------------------------------------------------------------------------

const RoomTypeSchema = z.object({
  id: uuid,
  name_en: z.string().trim().min(1).max(120),
  name_ar: z.string().trim().min(1).max(120),
  tagline_en: z.string().trim().max(200).nullable(),
  tagline_ar: z.string().trim().max(200).nullable(),
  description_en: z.string().trim().max(4000).nullable(),
  description_ar: z.string().trim().max(4000).nullable(),
  view_en: z.string().trim().max(120).nullable(),
  view_ar: z.string().trim().max(120).nullable(),
  bed_config_en: z.string().trim().max(120).nullable(),
  bed_config_ar: z.string().trim().max(120).nullable(),
  size_sqm: z.number().min(0).max(1000).nullable(),
  max_adults: z.number().int().min(1).max(10),
  max_children: z.number().int().min(0).max(10),
  amenities: z.array(z.string().trim().min(1).max(40)).max(40),
  base_rate_omr: z.number().min(0).max(100000),
  sort_order: z.number().int().min(0).max(1000),
  is_active: z.boolean(),
});

export async function updateRoomType(input: unknown): Promise<ActionResult> {
  return runAction("room_type.update", async () => {
    const { actor } = await requireStaff(ADMIN_ROLES);
    const { id, ...patch } = RoomTypeSchema.parse(input);
    const admin = createAdminClient();
    const { data: before, error: readErr } = await admin.from("bk_room_types").select("*").eq("id", id).maybeSingle();
    if (readErr) return { ok: false, error: readErr.message };
    if (!before) return { ok: false, error: "room_type_not_found" };
    const { error } = await admin
      .from("bk_room_types")
      .update({ ...patch, amenities: patch.amenities as unknown as Json })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
    const diff: Record<string, unknown> = {};
    for (const key of Object.keys(patch) as (keyof typeof patch)[]) {
      const prev = before[key];
      const next = patch[key];
      if (JSON.stringify(prev) !== JSON.stringify(next)) diff[key] = { from: prev, to: next };
    }
    await audit(actor, "room_type.update", "bk_room_types", id, diff);
    revalidateAll();
    return { ok: true };
  });
}

const ImagesSchema = z.object({ id: uuid, images: z.array(z.string().trim().min(1).max(500)).max(30) });

/** Reorder / remove images (paths or public URLs). */
export async function setRoomTypeImages(input: unknown): Promise<ActionResult> {
  return runAction("room_type.images", async () => {
    const { actor } = await requireStaff(ADMIN_ROLES);
    const { id, images } = ImagesSchema.parse(input);
    const admin = createAdminClient();
    const { data: before } = await admin.from("bk_room_types").select("images").eq("id", id).maybeSingle();
    const { error } = await admin.from("bk_room_types").update({ images }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    await audit(actor, "room_type.images", "bk_room_types", id, { from: before?.images ?? [], to: images });
    revalidateAll();
    return { ok: true };
  });
}

/** Upload one image (FormData: room_type_id, file) to Supabase Storage and append its public URL. */
export async function uploadRoomTypeImage(formData: FormData): Promise<ActionResult<{ url: string }>> {
  return runAction("room_type.upload_image", async () => {
    const { actor } = await requireStaff(ADMIN_ROLES);
    const id = uuid.parse(formData.get("room_type_id"));
    const file = formData.get("file");
    if (!(file instanceof File)) return { ok: false, error: "No file received." };
    if (!IMAGE_TYPES.includes(file.type)) return { ok: false, error: "Only JPEG, PNG, WebP or AVIF images are allowed." };
    if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "Image is larger than 8 MB." };
    const admin = createAdminClient();
    const { data: type, error: readErr } = await admin.from("bk_room_types").select("slug, images").eq("id", id).maybeSingle();
    if (readErr) return { ok: false, error: readErr.message };
    if (!type) return { ok: false, error: "room_type_not_found" };
    const ext = file.type === "image/jpeg" ? "jpg" : file.type.slice(6);
    const safeBase = file.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-]+/gi, "-").slice(0, 40) || "image";
    const path = `${type.slug}/${Date.now()}-${safeBase}.${ext}`;
    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) return { ok: false, error: upErr.message };
    const url = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    const images = [...(type.images ?? []), url];
    const { error } = await admin.from("bk_room_types").update({ images }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    await audit(actor, "room_type.upload_image", "bk_room_types", id, { path, url, size: file.size });
    revalidateAll();
    return { ok: true, data: { url } };
  });
}

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

const RoomSchema = z.object({
  room_number: z.string().trim().min(1).max(20),
  room_type_id: uuid,
  floor: z.string().trim().max(40).nullable(),
  status: z.enum(["active", "maintenance"]),
  notes: z.string().trim().max(500).nullable(),
  sort_order: z.number().int().min(0).max(10000),
});

export async function createRoom(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction("room.create", async () => {
    const { actor } = await requireStaff(ADMIN_ROLES);
    const data = RoomSchema.parse(input);
    const admin = createAdminClient();
    const { data: row, error } = await admin
      .from("bk_rooms")
      .insert({ ...data, floor: data.floor || null, notes: data.notes || null })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.code === "23505" ? `Room ${data.room_number} already exists.` : error.message };
    await audit(actor, "room.create", "bk_rooms", row.id, data);
    revalidateAll();
    return { ok: true, data: { id: row.id } };
  });
}

const RoomUpdateSchema = RoomSchema.partial().extend({ id: uuid });

export async function updateRoom(input: unknown): Promise<ActionResult> {
  return runAction("room.update", async () => {
    const { actor } = await requireStaff(ADMIN_ROLES);
    const { id, ...patch } = RoomUpdateSchema.parse(input);
    const admin = createAdminClient();
    const { data: before } = await admin.from("bk_rooms").select("*").eq("id", id).maybeSingle();
    if (!before) return { ok: false, error: "Room not found." };
    const clean = {
      ...patch,
      ...(patch.floor !== undefined ? { floor: patch.floor || null } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes || null } : {}),
    };
    const { error } = await admin.from("bk_rooms").update(clean).eq("id", id);
    if (error) return { ok: false, error: error.code === "23505" ? `Room ${patch.room_number} already exists.` : error.message };
    const diff: Record<string, unknown> = {};
    for (const key of Object.keys(clean) as (keyof typeof clean)[]) {
      if (before[key] !== clean[key]) diff[key] = { from: before[key], to: clean[key] };
    }
    await audit(actor, "room.update", "bk_rooms", id, diff);
    revalidateAll();
    return { ok: true };
  });
}

export async function deleteRoom(input: unknown): Promise<ActionResult> {
  return runAction("room.delete", async () => {
    const { actor } = await requireStaff(ADMIN_ROLES);
    const { id } = z.object({ id: uuid }).parse(input);
    const admin = createAdminClient();
    const { count, error: countErr } = await admin.from("bk_bookings").select("id", { count: "exact", head: true }).eq("room_id", id);
    if (countErr) return { ok: false, error: countErr.message };
    if ((count ?? 0) > 0) return { ok: false, error: `This room has ${count} booking(s) — set it to maintenance instead.` };
    const { data: before } = await admin.from("bk_rooms").select("room_number, room_type_id").eq("id", id).maybeSingle();
    const { error } = await admin.from("bk_rooms").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    await audit(actor, "room.delete", "bk_rooms", id, { room_number: before?.room_number, room_type_id: before?.room_type_id });
    revalidateAll();
    return { ok: true };
  });
}
