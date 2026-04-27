// Read an image file, downscale to fit within MAX × MAX pixels, and
// return a JPEG data URL. Used for savings-goal photos: we store them
// in localStorage, which has a ~5MB total quota per origin. Phone photos
// are 2-5MB raw, so we MUST compress before saving — otherwise a single
// goal photo can wipe out room for everything else.

const MAX_DIM = 320;
const JPEG_QUALITY = 0.82;

export type ImageReadResult =
  | { ok: true; dataUrl: string; bytes: number }
  | { ok: false; error: string };

export async function fileToCompressedDataUrl(
  file: File
): Promise<ImageReadResult> {
  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "Please pick an image file." };
  }
  if (file.size > 25 * 1024 * 1024) {
    return { ok: false, error: "Image is over 25 MB. Try a smaller one." };
  }

  const sourceUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("could not decode image"));
      i.src = sourceUrl;
    });

    const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return { ok: false, error: "Couldn't render the image." };
    }
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    return { ok: true, dataUrl, bytes: dataUrl.length };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "could not read the image",
    };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
