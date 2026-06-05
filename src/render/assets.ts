export interface SpriteSheet {
  image: HTMLCanvasElement;
  ready: boolean;
}

export type SpriteSheetKey = keyof typeof ASSET_URLS;
export type SpriteAssets = Record<SpriteSheetKey, SpriteSheet>;

const ASSET_URLS = {
  grass: "/assets/opengfx/grass-temperate.png",
  bare: "/assets/opengfx/bare-temperate.png",
  rough: "/assets/opengfx/terrain-rough-temperate.png",
  rocks: "/assets/opengfx/terrain-rocks-temperate.png",
  water: "/assets/opengfx/terrain-water.png",
  riverWater: "/assets/opengfx/terrain-river-water.png",
  field: "/assets/opengfx/terrain-field-48.png",
  infra: "/assets/opengfx/infrastructure-infra06.png",
  housesTemperate: "/assets/opengfx/houses-temperate.png",
  housesBuildings: "/assets/opengfx/houses-buildings.png",
  housesParks: "/assets/opengfx/houses-parks.png",
  coalMine: "/assets/opengfx/industry-coalmine-base.png",
  factory: "/assets/opengfx/industry-factory.png",
  farm: "/assets/opengfx/industry-farm-temperate.png",
  sawmill: "/assets/opengfx/industry-sawmill.png",
  steelMill: "/assets/opengfx/industry-steelmill.png",
  treeLeaf01: "/assets/opengfx/trees-leaf-01.png",
  treeLeaf02: "/assets/opengfx/trees-leaf-02.png",
  treeConifer03: "/assets/opengfx/trees-conifer-03.png",
  treeLeaf05: "/assets/opengfx/trees-leaf-05.png",
  treeLeaf13: "/assets/opengfx/trees-leaf-13.png",
  roadVehicles: "/assets/opengfx/road-vehicles.png",
  flatbeds: "/assets/opengfx/flatbeds.png",
  trainEngine: "/assets/opengfx/train-temperate-engine.png",
  trainWagons: "/assets/opengfx/train-temperate-wagons.png",
} as const;

export async function loadSpriteAssets(): Promise<SpriteAssets> {
  const entries = await Promise.all(
    Object.entries(ASSET_URLS).map(async ([key, url]) => [
      key,
      { image: await loadChromaKeyedImage(url, { keyWhite: isVehicleSheet(key as SpriteSheetKey) }), ready: true },
    ])
  );
  return Object.fromEntries(entries) as SpriteAssets;
}

export function emptyAssets(): SpriteAssets {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const sheet = { image: canvas, ready: false };
  return Object.fromEntries(Object.keys(ASSET_URLS).map((key) => [key, sheet])) as SpriteAssets;
}

function isVehicleSheet(key: SpriteSheetKey): boolean {
  return key === "flatbeds" || key === "roadVehicles" || key === "trainEngine" || key === "trainWagons";
}

async function loadChromaKeyedImage(url: string, options: { keyWhite?: boolean } = {}): Promise<HTMLCanvasElement> {
  const image = new Image();
  image.src = url;
  image.decoding = "async";
  await image.decode();

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) return canvas;

  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const red = pixels.data[index];
    const green = pixels.data[index + 1];
    const blue = pixels.data[index + 2];
    if (blue > 200 && red < 18 && green < 18) {
      pixels.data[index + 3] = 0;
    }
    if (options.keyWhite && red > 242 && green > 242 && blue > 242) {
      pixels.data[index + 3] = 0;
    }
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}
