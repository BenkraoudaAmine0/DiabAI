/** Pre-analysis quality checks on a fundus photograph, run in the browser
 *  before upload (Figma "Vérifications Automatiques de Qualité"). Heuristic
 *  screening only — the clinician decides whether to retake the photo. */

export type CheckStatus = "ok" | "warn" | "fail";

export interface QualityReport {
  sharpness: CheckStatus; // variance of the Laplacian (blur)
  illumination: CheckStatus; // mean brightness + under/over-exposed pixels
  centering: CheckStatus; // bright fundus disc centred in the frame
  artefacts: CheckStatus; // specular reflections (saturated pixels)
  details: { laplacianVar: number; meanLuma: number; darkShare: number; offset: number; saturatedShare: number };
}

const SIZE = 256;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("unreadable image"));
    };
    img.src = url;
  });
}

export async function checkFundusQuality(file: File): Promise<QualityReport> {
  const img = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(img, 0, 0, SIZE, SIZE);
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

  const luma = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    luma[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }

  // fundus region = pixels clearly brighter than the black border
  let sum = 0;
  let count = 0;
  let cx = 0;
  let cy = 0;
  let dark = 0;
  let saturated = 0;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const v = luma[y * SIZE + x];
      if (v > 20) {
        sum += v;
        count++;
        cx += x;
        cy += y;
        if (v < 35) dark++;
        if (v > 245) saturated++;
      }
    }
  }
  const region = Math.max(count, 1);
  const meanLuma = sum / region;
  const darkShare = dark / region;
  const saturatedShare = saturated / region;
  const offset = count ? Math.hypot(cx / region - SIZE / 2, cy / region - SIZE / 2) / SIZE : 1;

  // blur: variance of the 4-neighbour Laplacian inside the fundus region
  let lapSum = 0;
  let lapSq = 0;
  let lapN = 0;
  for (let y = 1; y < SIZE - 1; y++) {
    for (let x = 1; x < SIZE - 1; x++) {
      const i = y * SIZE + x;
      if (luma[i] <= 20) continue;
      const lap = luma[i - 1] + luma[i + 1] + luma[i - SIZE] + luma[i + SIZE] - 4 * luma[i];
      lapSum += lap;
      lapSq += lap * lap;
      lapN++;
    }
  }
  const lapMean = lapSum / Math.max(lapN, 1);
  const laplacianVar = lapSq / Math.max(lapN, 1) - lapMean * lapMean;

  const sharpness: CheckStatus = laplacianVar >= 60 ? "ok" : laplacianVar >= 20 ? "warn" : "fail";
  const illumination: CheckStatus =
    meanLuma >= 50 && meanLuma <= 200 && darkShare < 0.25 ? "ok" : meanLuma >= 30 && meanLuma <= 230 ? "warn" : "fail";
  const centering: CheckStatus = count / (SIZE * SIZE) < 0.15 ? "fail" : offset <= 0.08 ? "ok" : offset <= 0.16 ? "warn" : "fail";
  const artefacts: CheckStatus = saturatedShare < 0.01 ? "ok" : saturatedShare < 0.04 ? "warn" : "fail";

  return {
    sharpness,
    illumination,
    centering,
    artefacts,
    details: { laplacianVar, meanLuma, darkShare, offset, saturatedShare },
  };
}
