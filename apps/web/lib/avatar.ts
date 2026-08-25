"use client";

import { supabaseBrowser } from "./supabase/client";

const BUCKET = "avatars";
/** What lands in storage. Big enough for a 96px avatar on a 2x screen, twice over. */
const SIZE = 256;
/** Rejected before anything is read, so a 40MB photo never reaches memory. */
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Squares and shrinks an image in the browser.
 *
 * The reason this happens client-side is that there is no server to do it on —
 * user data goes straight to Supabase under RLS, and adding a route handler
 * just to resize would put an image pipeline in front of a static export for
 * one feature.
 *
 * So the browser does it, and what reaches the bucket is predictable: a
 * 256×256 WebP, typically around 20KB, whatever was chosen. The alternative is
 * storing the original, which means a phone camera's 4000×3000 JPEG being
 * downloaded in full every time someone looks at a follower list.
 *
 * Centre-cropped rather than squashed. A face stretched into a square is worse
 * than a face with its edges trimmed.
 */
async function toSquareWebp(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);

  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - side) / 2;
    const sy = (bitmap.height - side) / 2;

    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser can't process images.");
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, SIZE, SIZE);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.9),
    );
    if (!blob) throw new Error("That image couldn't be processed.");
    return blob;
  } finally {
    // Frees the decoded frame immediately rather than at the next GC, which
    // matters when the source was a many-megapixel photo.
    bitmap.close();
  }
}

/**
 * Uploads a new profile picture and returns the URL to store on the profile.
 *
 * The path is fixed at `<uid>/avatar.webp` — one picture per account, replaced
 * in place. That is not only tidiness: the storage policy checks that the
 * first path segment is the caller's own user id, so a client-chosen name is
 * a client-chosen owner, and old files would otherwise accumulate forever with
 * nothing tracking them.
 *
 * Because the path never changes, the URL never changes either, and a browser
 * that has seen the old picture would go on showing it. The returned URL
 * carries a timestamp to defeat that; it is not part of the stored object.
 */
export async function uploadAvatar(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Pick an image file.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("That image is over 8MB. Try a smaller one.");
  }

  const client = supabaseBrowser();
  const { data: auth } = await client.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Sign in to change your picture.");

  const webp = await toSquareWebp(file);
  const path = `${uid}/avatar.webp`;

  const { error } = await client.storage.from(BUCKET).upload(path, webp, {
    contentType: "image/webp",
    // The path is stable, so every upload after the first is a replacement.
    upsert: true,
  });

  if (error) {
    // The bucket is created by migration 0005. Say so, rather than repeating
    // a storage error that reads as a bug in the page.
    if (/bucket/i.test(error.message)) {
      throw new Error("Picture storage isn't set up on this project yet (migration 0005).");
    }
    throw new Error(error.message);
  }

  const { data } = client.storage.from(BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}
