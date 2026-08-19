const MAX_EDGE = 2048;
const MAX_DATA_URL_CHARS = 2_400_000;
const JPEG_QUALITY = 0.86;

export type ChatImage = {
  dataUrl: string;
  previewUrl: string;
};

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number) {
  return canvas.toDataURL("image/jpeg", quality);
}

function drawBitmapToCanvas(source: CanvasImageSource, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法处理图片");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

function toPreview(source: HTMLCanvasElement) {
  const scale = Math.min(1, 360 / Math.max(source.width, source.height));
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));
  const thumb = drawBitmapToCanvas(source, w, h);
  return canvasToJpeg(thumb, 0.7);
}

function compressCanvas(canvas: HTMLCanvasElement): ChatImage {
  let quality = JPEG_QUALITY;
  let dataUrl = canvasToJpeg(canvas, quality);
  while (dataUrl.length > MAX_DATA_URL_CHARS && quality > 0.5) {
    quality -= 0.08;
    dataUrl = canvasToJpeg(canvas, quality);
  }
  if (dataUrl.length > MAX_DATA_URL_CHARS) {
    throw new Error("图片太大，请裁剪或换一张更小的图");
  }
  return { dataUrl, previewUrl: toPreview(canvas) };
}

export async function blobToChatImage(blob: Blob): Promise<ChatImage> {
  if (blob.type && !blob.type.startsWith("image/")) {
    throw new Error("请选择图片文件");
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    throw new Error("无法读取图片，请换一张再试");
  }
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    return compressCanvas(drawBitmapToCanvas(bitmap, width, height));
  } finally {
    bitmap.close();
  }
}
