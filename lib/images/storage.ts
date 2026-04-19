/**
 * Persist selected images to Supabase Storage and (optionally) attach them
 * to a record via the `records.data.attachments` JSONB array.
 */

import { randomUUID } from "node:crypto";
import { getAssetBucketName, getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type SavedImage = {
  path: string;
  publicUrl: string | null;
  signedUrl: string | null;
  mimeType: string;
  size: number;
  recordId: string | null;
};

export type SaveImageInput =
  | { kind: "data"; base64: string; mimeType: string }
  | { kind: "url"; url: string };

type SaveImageOpts = {
  workspaceId: string;
  recordId?: string | null;
  caption?: string | null;
  createdBy?: string | null;
};

async function toBuffer(input: SaveImageInput): Promise<{ buf: Buffer; mimeType: string }> {
  if (input.kind === "data") {
    return { buf: Buffer.from(input.base64, "base64"), mimeType: input.mimeType };
  }
  const resp = await fetch(input.url);
  if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
  const ct = resp.headers.get("content-type") ?? "image/png";
  const buf = Buffer.from(await resp.arrayBuffer());
  return { buf, mimeType: ct.split(";")[0].trim() };
}

function extensionFor(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "bin";
}

export async function saveImage(input: SaveImageInput, opts: SaveImageOpts): Promise<SavedImage> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase admin client not configured.");
  const { buf, mimeType } = await toBuffer(input);
  const bucket = getAssetBucketName();
  const id = randomUUID();
  const ext = extensionFor(mimeType);
  const path = `workspaces/${opts.workspaceId}/images/${id}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, buf, { contentType: mimeType, upsert: false });
  if (uploadError) throw new Error(uploadError.message);

  const publicUrlData = supabase.storage.from(bucket).getPublicUrl(path);
  const publicUrl = publicUrlData?.data?.publicUrl ?? null;
  let signedUrl: string | null = null;
  try {
    const signed = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 7);
    signedUrl = signed.data?.signedUrl ?? null;
  } catch {
    signedUrl = null;
  }

  if (opts.recordId) {
    const { data: record } = await supabase
      .from("records")
      .select("id, workspace_id, data")
      .eq("id", opts.recordId)
      .eq("workspace_id", opts.workspaceId)
      .maybeSingle();
    if (record) {
      const recordData = ((record.data as Record<string, unknown>) ?? {}) as Record<string, unknown>;
      const existingAttachments = Array.isArray(recordData.attachments)
        ? (recordData.attachments as Array<Record<string, unknown>>)
        : [];
      existingAttachments.push({
        id,
        kind: "image",
        path,
        publicUrl,
        signedUrl,
        mimeType,
        size: buf.length,
        caption: opts.caption ?? null,
        createdAt: new Date().toISOString(),
        createdBy: opts.createdBy ?? null,
      });
      // Also set a canonical `image` URL on the record so CMS sync can read it.
      // Prefer publicUrl: consumers like the gb-automotriz site render this
      // URL in a public <img> tag, and signed URLs expire (typically in days)
      // which would leave dead images on the external page. Only fall back to
      // signedUrl when the bucket is private and has no public URL.
      const nextData: Record<string, unknown> = {
        ...recordData,
        attachments: existingAttachments,
      };
      if (!recordData.image || typeof recordData.image !== "string") {
        nextData.image = publicUrl ?? signedUrl;
      }
      await supabase.from("records").update({ data: nextData }).eq("id", opts.recordId);
    }
  }

  return {
    path,
    publicUrl,
    signedUrl,
    mimeType,
    size: buf.length,
    recordId: opts.recordId ?? null,
  };
}
