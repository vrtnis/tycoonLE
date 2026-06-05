export interface IsoCamera {
  tileW: number;
  tileH: number;
  tileYStep: number;
  originX: number;
  originY: number;
  zoom: number;
}

export function makeCamera(width: number, height: number, worldWidth: number, worldHeight: number, focus?: { centerX: number; centerY: number; zoom?: number }): IsoCamera {
  const tileW = 64;
  const tileH = 31;
  const tileYStep = 16;
  if (focus) {
    const center = worldToIsoRaw(focus.centerX, focus.centerY, tileW, tileYStep);
    return {
      tileW,
      tileH,
      tileYStep,
      originX: Math.round(width * 0.5 - center.x),
      originY: Math.round(height * 0.48 - center.y),
      zoom: focus.zoom ?? 1,
    };
  }
  const mapPixelWidth = (worldWidth + worldHeight) * (tileW / 2);
  const mapPixelHeight = (worldWidth + worldHeight) * tileYStep;
  return {
    tileW,
    tileH,
    tileYStep,
    originX: Math.round(Math.max(180, Math.min(width * 0.52, width - 240)) + Math.max(0, (width - mapPixelWidth) * 0.08)),
    originY: Math.round(Math.min(18, height * 0.03) - Math.max(42, (mapPixelHeight - height) * 0.2)),
    zoom: 1,
  };
}

export function worldToIso(x: number, y: number, camera: IsoCamera): { x: number; y: number } {
  const raw = worldToIsoRaw(x, y, camera.tileW, camera.tileYStep);
  return { x: camera.originX + raw.x * camera.zoom, y: camera.originY + raw.y * camera.zoom };
}

function worldToIsoRaw(x: number, y: number, tileW: number, tileYStep: number): { x: number; y: number } {
  return { x: (x - y) * (tileW / 2), y: (x + y) * tileYStep };
}
