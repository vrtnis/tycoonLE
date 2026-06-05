import { useEffect, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from "react";
import { emptyAssets, loadSpriteAssets, type SpriteAssets, type SpriteSheetKey } from "../render/assets";
import { makeCamera, worldToIso, type IsoCamera } from "../render/iso";
import type { Observation, ReplayFocus, Route, Terrain, WorldNode } from "../sim/types";

interface Props {
  observation: Observation;
  focus?: ReplayFocus;
}

interface SpriteDef {
  sheet: SpriteSheetKey;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  xRel: number;
  yRel: number;
}

interface Drawable {
  depth: number;
  draw: () => void;
}

interface ViewportState {
  zoom: number;
  panX: number;
  panY: number;
}

type TileOverlay = "roadX" | "roadY" | "roadCross" | "railX" | "railY" | "railCross";

const TILE_W = 64;
const TILE_H = 31;
const BUFFER_PADDING = 260;
const MIN_VIEW_ZOOM = 0.55;
const MAX_VIEW_ZOOM = 3;
const WHEEL_ZOOM_SPEED = 0.0012;

const GRASS_TILES = [ground("grass", 1)];
const BARE_TILES = [ground("bare", 1)];
const ROUGH_TILES = [ground("rough", 1)];
const ROCK_TILES = [ground("rocks", 1)];
const FIELD_TILES = [ground("field", 1)];
const WATER_TILES = [ground("riverWater", 1)];

const OVERLAY_SPRITES: Record<TileOverlay, SpriteDef> = {
  roadX: sprite("infra", 434, 2568, 64, 31, -31, 0),
  roadY: sprite("infra", 514, 2568, 64, 31, -31, 0),
  roadCross: sprite("infra", 594, 2568, 64, 31, -31, 0),
  railX: sprite("infra", 82, 40, 64, 31, -31, 0),
  railY: sprite("infra", 162, 40, 64, 31, -31, 0),
  railCross: sprite("infra", 562, 40, 64, 31, -31, 0),
};

const HOUSE_SPRITES = [
  sprite("housesTemperate", 642, 8, 64, 67, -31, -39),
  sprite("housesTemperate", 498, 104, 52, 61, -25, -33),
  sprite("housesTemperate", 562, 104, 52, 61, -25, -33),
  sprite("housesTemperate", 706, 104, 54, 115, -25, -88),
  sprite("housesTemperate", 258, 360, 62, 48, -30, -20),
  sprite("housesTemperate", 418, 360, 62, 83, -30, -55),
  sprite("housesBuildings", 178, 2856, 36, 28, -12, -9),
  sprite("housesBuildings", 578, 2696, 32, 27, -17, -11),
  sprite("housesBuildings", 674, 2696, 32, 27, -17, -11),
];

const PARK_SPRITES = [
  sprite("housesParks", 11, 0, 64, 80, -31, -49),
  sprite("housesParks", 91, 10, 64, 70, -31, -39),
];

const TREE_SPRITES = [
  sprite("treeLeaf01", 150, 0, 45, 80, -24, -73),
  sprite("treeLeaf02", 200, 0, 45, 80, -24, -73),
  sprite("treeConifer03", 250, 0, 45, 80, -24, -73),
  sprite("treeLeaf05", 150, 0, 45, 80, -24, -73),
  sprite("treeLeaf13", 200, 0, 45, 80, -24, -73),
];

const INDUSTRY = {
  coalGround: sprite("coalMine", 690, 8, 64, 31, -31, 0),
  coalShaft: sprite("coalMine", 114, 8, 36, 50, -16, -33),
  coalLoader: sprite("coalMine", 162, 8, 58, 50, -16, -33),
  coalTipple: sprite("coalMine", 418, 8, 48, 41, -29, -18),
  farmGround: sprite("farm", 170, 10, 64, 31, -31, 0),
  farmHouse: sprite("farm", 10, 60, 32, 64, -17, -28),
  farmBarn: sprite("farm", 170, 60, 57, 29, -25, -5),
  farmSilo: sprite("farm", 330, 60, 45, 48, -6, -34),
  factoryGround: sprite("factory", 402, 10, 64, 31, -31, 0),
  factoryHall: sprite("factory", 104, 2, 57, 62, -28, -37),
  factoryStack: sprite("factory", 718, 90, 64, 91, -31, -60),
  sawmillShed: sprite("sawmill", 66, 80, 51, 44, -24, -18),
  sawmillLogs: sprite("sawmill", 354, 80, 54, 38, -27, -12),
  steelGround: sprite("steelMill", 2, 10, 64, 31, -31, 0),
  steelMill: sprite("steelMill", 642, 10, 64, 64, -31, -33),
  steelYard: sprite("steelMill", 82, 138, 64, 39, -31, -8),
};

const ROAD_VEHICLE_SPRITE = sprite("flatbeds", 48, 20, 28, 12, -14, -8);
const TRAIN_ENGINE_SPRITE = sprite("trainEngine", 32, 0, 32, 12, -16, -8);

export function GameCanvas({ observation, focus }: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bufferRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; panX: number; panY: number } | null>(null);
  const [assets, setAssets] = useState<SpriteAssets>(() => emptyAssets());
  const [viewport, setViewport] = useState<ViewportState>(() => ({ zoom: 1, panX: 0, panY: 0 }));
  const [isPanning, setIsPanning] = useState(false);

  useEffect(() => {
    let mounted = true;
    loadSpriteAssets().then((loaded) => {
      if (mounted) setAssets(loaded);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const cursorX = event.clientX - rect.left;
      const cursorY = event.clientY - rect.top;
      const zoomDelta = Math.exp(-event.deltaY * WHEEL_ZOOM_SPEED);
      setViewport((current) => zoomViewport(current, current.zoom * zoomDelta, cursorX, cursorY, rect.width, rect.height));
    };
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let animationFrame = 0;
    const render = (timestamp: number) => {
      drawScene(canvas, bufferRef, observation, focus, assets, timestamp, viewport);
      animationFrame = requestAnimationFrame(render);
    };
    animationFrame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrame);
  }, [assets, focus, observation, viewport]);

  const startPan = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, panX: viewport.panX, panY: viewport.panY };
    setIsPanning(true);
  };

  const movePan = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    setViewport((current) => ({
      ...current,
      panX: drag.panX + event.clientX - drag.x,
      panY: drag.panY + event.clientY - drag.y,
    }));
  };

  const stopPan = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    setIsPanning(false);
  };

  return (
    <div className="map-frame">
      <canvas
        ref={canvasRef}
        aria-label="TycoonLE replay map"
        className={isPanning ? "panning" : undefined}
        onDoubleClick={() => setViewport({ zoom: 1, panX: 0, panY: 0 })}
        onPointerCancel={stopPan}
        onPointerDown={startPan}
        onPointerMove={movePan}
        onPointerUp={stopPan}
      />
      <div className="sprite-credit">OpenGFX sprite replay</div>
    </div>
  );
}

function drawScene(
  canvas: HTMLCanvasElement,
  bufferRef: MutableRefObject<HTMLCanvasElement | null>,
  observation: Observation,
  focus: ReplayFocus | undefined,
  assets: SpriteAssets,
  timestamp: number,
  viewport: ViewportState
): void {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.floor(rect.width * ratio);
  canvas.height = Math.floor(rect.height * ratio);

  const context = canvas.getContext("2d");
  if (!context) return;

  if (!bufferRef.current) bufferRef.current = document.createElement("canvas");
  const camera = makeCamera(rect.width, rect.height, observation.world.width, observation.world.height, focus?.camera);
  const bounds = sceneBounds(camera, observation.world.width, observation.world.height);
  const bufferWidth = Math.max(1, Math.ceil(bounds.maxX - bounds.minX + BUFFER_PADDING * 2));
  const bufferHeight = Math.max(1, Math.ceil(bounds.maxY - bounds.minY + BUFFER_PADDING * 2));
  const offsetX = BUFFER_PADDING - bounds.minX;
  const offsetY = BUFFER_PADDING - bounds.minY;
  const buffer = bufferRef.current;
  if (buffer.width !== bufferWidth) buffer.width = bufferWidth;
  if (buffer.height !== bufferHeight) buffer.height = bufferHeight;
  const bufferContext = buffer.getContext("2d");
  if (!bufferContext) return;

  bufferContext.setTransform(1, 0, 0, 1, 0, 0);
  bufferContext.imageSmoothingEnabled = false;
  bufferContext.clearRect(0, 0, buffer.width, buffer.height);
  bufferContext.fillStyle = "#24591d";
  bufferContext.fillRect(0, 0, buffer.width, buffer.height);

  const renderCamera = { ...camera, originX: camera.originX + offsetX, originY: camera.originY + offsetY };
  const infrastructure = buildInfrastructure(observation);
  drawTerrainAndInfrastructure(bufferContext, observation, assets, renderCamera, infrastructure);
  drawRoutePaths(bufferContext, observation.routes, observation.nodes, renderCamera);
  drawObjects(bufferContext, observation, assets, renderCamera);
  drawVehicles(bufferContext, observation.routes, observation.nodes, assets, renderCamera, timestamp);
  drawFocus(bufferContext, focus, renderCamera);

  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, rect.width, rect.height);
  context.fillStyle = "#1f4d1d";
  context.fillRect(0, 0, rect.width, rect.height);
  context.save();
  context.translate(rect.width / 2 + viewport.panX, rect.height / 2 + viewport.panY);
  context.scale(viewport.zoom, viewport.zoom);
  context.translate(-rect.width / 2, -rect.height / 2);
  context.drawImage(buffer, -offsetX, -offsetY);
  context.restore();
  drawNodeLabels(context, observation.nodes, camera, viewport, rect.width, rect.height);
}

function drawTerrainAndInfrastructure(
  context: CanvasRenderingContext2D,
  observation: Observation,
  assets: SpriteAssets,
  camera: IsoCamera,
  infrastructure: Map<string, TileOverlay>
): void {
  for (let y = 0; y < observation.world.height; y += 1) {
    for (let x = 0; x < observation.world.width; x += 1) {
      const terrain = visualTerrain(observation.world.terrain, x, y);
      const point = worldToIso(x, y, camera);
      drawTerrainSprite(context, assets, terrainSprite(terrain, observation.world.seed, x, y), point.x, point.y);
      const overlay = infrastructure.get(tileKey(x, y));
      if (overlay) drawSprite(context, assets, OVERLAY_SPRITES[overlay], point.x, point.y);
    }
  }
}

function drawObjects(context: CanvasRenderingContext2D, observation: Observation, assets: SpriteAssets, camera: IsoCamera): void {
  const drawables: Drawable[] = [];
  addForestObjects(drawables, context, observation, assets, camera);
  for (const node of observation.nodes) {
    if (node.kind === "town") addTownObjects(drawables, context, node, assets, camera, observation.world.seed);
    else addIndustryObjects(drawables, context, node, assets, camera);
  }
  drawables.sort((left, right) => left.depth - right.depth).forEach((item) => item.draw());
}

function addForestObjects(drawables: Drawable[], context: CanvasRenderingContext2D, observation: Observation, assets: SpriteAssets, camera: IsoCamera): void {
  for (let y = 0; y < observation.world.height; y += 1) {
    for (let x = 0; x < observation.world.width; x += 1) {
      const terrain = observation.world.terrain[y]?.[x] ?? "grass";
      if (terrain === "water" || terrain === "town" || isNearNode(observation.nodes, x, y, 3)) continue;
      const density = terrain === "rough" ? 0.12 : 0.17;
      if (hash01(observation.world.seed, x, y, 31) > density) continue;
      const tree = pick(TREE_SPRITES, observation.world.seed, x, y, 32);
      const point = jitteredPoint(observation.world.seed, x, y, camera, 33);
      drawables.push({
        depth: x + y + 0.2,
        draw: () => drawSprite(context, assets, tree, point.x, point.y),
      });
    }
  }
}

function addTownObjects(drawables: Drawable[], context: CanvasRenderingContext2D, town: WorldNode, assets: SpriteAssets, camera: IsoCamera, seed: number): void {
  const radius = town.population && town.population > 1800 ? 3 : 2;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (Math.abs(dx) + Math.abs(dy) > radius + 1) continue;
      const x = town.x + dx;
      const y = town.y + dy;
      const choice = Math.floor(hash01(seed, x, y, 41) * (HOUSE_SPRITES.length + PARK_SPRITES.length));
      const spriteDef = choice < HOUSE_SPRITES.length ? HOUSE_SPRITES[choice] : PARK_SPRITES[choice - HOUSE_SPRITES.length];
      const point = worldToIso(x, y, camera);
      drawables.push({
        depth: x + y + 0.55,
        draw: () => drawSprite(context, assets, spriteDef, point.x, point.y),
      });
    }
  }
}

function addIndustryObjects(drawables: Drawable[], context: CanvasRenderingContext2D, node: WorldNode, assets: SpriteAssets, camera: IsoCamera): void {
  const produced = Object.keys(node.produces ?? {});
  const accepted = Object.keys(node.accepts ?? {});
  const cargoText = [...produced, ...accepted, node.name].join(" ").toLowerCase();
  if (node.kind === "producer" && (cargoText.includes("coal") || cargoText.includes("iron"))) {
    addIndustrySprite(drawables, context, assets, camera, node.x, node.y, INDUSTRY.coalGround, 0.1);
    addIndustrySprite(drawables, context, assets, camera, node.x, node.y, INDUSTRY.coalShaft, 0.5);
    addIndustrySprite(drawables, context, assets, camera, node.x + 1, node.y, INDUSTRY.coalLoader, 0.5);
    addIndustrySprite(drawables, context, assets, camera, node.x, node.y + 1, INDUSTRY.coalTipple, 0.5);
    return;
  }
  if (cargoText.includes("grain") || cargoText.includes("food") || cargoText.includes("farm")) {
    addIndustrySprite(drawables, context, assets, camera, node.x, node.y, INDUSTRY.farmGround, 0.1);
    addIndustrySprite(drawables, context, assets, camera, node.x, node.y, INDUSTRY.farmHouse, 0.5);
    addIndustrySprite(drawables, context, assets, camera, node.x + 1, node.y, INDUSTRY.farmBarn, 0.5);
    addIndustrySprite(drawables, context, assets, camera, node.x + 1, node.y + 1, INDUSTRY.farmSilo, 0.5);
    return;
  }
  if (cargoText.includes("wood") || cargoText.includes("lumber") || cargoText.includes("forest")) {
    addIndustrySprite(drawables, context, assets, camera, node.x, node.y, INDUSTRY.sawmillShed, 0.5);
    addIndustrySprite(drawables, context, assets, camera, node.x + 1, node.y, INDUSTRY.sawmillLogs, 0.5);
    return;
  }
  if (cargoText.includes("steel") || cargoText.includes("iron")) {
    addIndustrySprite(drawables, context, assets, camera, node.x, node.y, INDUSTRY.steelGround, 0.1);
    addIndustrySprite(drawables, context, assets, camera, node.x, node.y, INDUSTRY.steelMill, 0.5);
    addIndustrySprite(drawables, context, assets, camera, node.x + 1, node.y, INDUSTRY.steelYard, 0.5);
    return;
  }
  if (node.kind === "consumer" || cargoText.includes("goods")) {
    addIndustrySprite(drawables, context, assets, camera, node.x, node.y, INDUSTRY.factoryGround, 0.1);
    addIndustrySprite(drawables, context, assets, camera, node.x, node.y, INDUSTRY.factoryHall, 0.5);
    addIndustrySprite(drawables, context, assets, camera, node.x + 1, node.y, INDUSTRY.factoryStack, 0.6);
    return;
  }
  addIndustrySprite(drawables, context, assets, camera, node.x, node.y, INDUSTRY.coalGround, 0.1);
  addIndustrySprite(drawables, context, assets, camera, node.x, node.y, INDUSTRY.coalShaft, 0.5);
  addIndustrySprite(drawables, context, assets, camera, node.x + 1, node.y, INDUSTRY.coalLoader, 0.5);
  addIndustrySprite(drawables, context, assets, camera, node.x, node.y + 1, INDUSTRY.coalTipple, 0.5);
}

function addIndustrySprite(
  drawables: Drawable[],
  context: CanvasRenderingContext2D,
  assets: SpriteAssets,
  camera: IsoCamera,
  x: number,
  y: number,
  spriteDef: SpriteDef,
  depthOffset: number
): void {
  const point = worldToIso(x, y, camera);
  drawables.push({
    depth: x + y + depthOffset,
    draw: () => drawSprite(context, assets, spriteDef, point.x, point.y),
  });
}

function buildInfrastructure(observation: Observation): Map<string, TileOverlay> {
  const overlays = new Map<string, TileOverlay>();
  for (const town of observation.nodes.filter((node) => node.kind === "town")) {
    const radius = town.population && town.population > 1800 ? 3 : 2;
    for (let offset = -radius - 1; offset <= radius + 1; offset += 1) {
      addOverlay(overlays, town.x + offset, town.y, offset === 0 ? "roadCross" : "roadX");
      addOverlay(overlays, town.x, town.y + offset, offset === 0 ? "roadCross" : "roadY");
    }
  }
  for (const route of observation.routes) {
    const path = routePath(route, observation.nodes);
    if (!path || path.length < 2) continue;
    for (let index = 1; index < path.length; index += 1) {
      const before = path[index - 1];
      const tile = path[index];
      const axis = Math.abs(tile.x - before.x) >= Math.abs(tile.y - before.y) ? "X" : "Y";
      addOverlay(overlays, tile.x, tile.y, `${route.mode === "rail" ? "rail" : "road"}${axis}` as TileOverlay);
    }
  }
  return overlays;
}

function addOverlay(overlays: Map<string, TileOverlay>, x: number, y: number, overlay: TileOverlay): void {
  if (x < 0 || y < 0) return;
  const key = tileKey(x, y);
  const existing = overlays.get(key);
  if (!existing) {
    overlays.set(key, overlay);
    return;
  }
  if (overlay.startsWith("rail")) {
    overlays.set(key, existing.startsWith("rail") && existing !== overlay ? "railCross" : overlay);
  } else if (!existing.startsWith("rail")) {
    overlays.set(key, existing !== overlay ? "roadCross" : overlay);
  }
}

function drawRoutePaths(context: CanvasRenderingContext2D, routes: Route[], nodes: WorldNode[], camera: IsoCamera): void {
  for (const route of routes) {
    const path = routePath(route, nodes);
    if (!path || path.length < 2) continue;
    const points = path.map((tile) => tileCenter(tile.x, tile.y, camera));
    if (route.mode === "rail") drawRailPath(context, points);
    else drawRoadPath(context, points);
  }
}

function drawRoadPath(context: CanvasRenderingContext2D, points: Array<{ x: number; y: number }>): void {
  drawPolyline(context, points, "rgba(28, 29, 26, 0.9)", 11);
  drawPolyline(context, points, "#626766", 8);
  drawPolyline(context, points, "#9da0a0", 2);
}

function drawRailPath(context: CanvasRenderingContext2D, points: Array<{ x: number; y: number }>): void {
  drawPolyline(context, points, "rgba(26, 20, 16, 0.72)", 9);
  drawRailSleepers(context, points);
  drawOffsetPolyline(context, points, -3.4, "#1b1b1b", 3.2);
  drawOffsetPolyline(context, points, 3.4, "#1b1b1b", 3.2);
  drawOffsetPolyline(context, points, -3.4, "#8d8d8d", 1.1);
  drawOffsetPolyline(context, points, 3.4, "#8d8d8d", 1.1);
}

function drawVehicles(
  context: CanvasRenderingContext2D,
  routes: Route[],
  nodes: WorldNode[],
  assets: SpriteAssets,
  camera: IsoCamera,
  timestamp: number
): void {
  for (const route of routes) {
    const path = routePath(route, nodes);
    if (!path || path.length < 2 || route.vehicles <= 0) continue;
    const points = path.map((tile) => tileCenter(tile.x, tile.y, camera));
    const count = route.mode === "rail" ? Math.min(route.vehicles, 2) : Math.min(route.vehicles, 4);
    for (let index = 0; index < count; index += 1) {
      const phase = (timestamp / (route.mode === "rail" ? 6800 : 7200) + index / Math.max(1, count)) % 1;
      const forward = route.mode === "road" ? index % 2 === 0 : true;
      const sampled = samplePath(points, forward ? phase : 1 - phase);
      const laneOffset = route.mode === "road" ? (forward ? -4.2 : 4.2) : 0;
      const point = { x: sampled.x + sampled.normal.x * laneOffset, y: sampled.y + sampled.normal.y * laneOffset };
      drawSprite(context, assets, route.mode === "rail" ? TRAIN_ENGINE_SPRITE : ROAD_VEHICLE_SPRITE, point.x, point.y);
    }
  }
}

function drawNodeLabels(context: CanvasRenderingContext2D, nodes: WorldNode[], camera: IsoCamera, viewport: ViewportState, width: number, height: number): void {
  for (const node of nodes) {
    const point = viewportPoint(worldToIso(node.x, node.y, camera), viewport, width, height);
    context.save();
    context.font = `700 ${node.kind === "town" ? 13 : 12}px Inter, Arial, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = 4;
    context.strokeStyle = "rgba(0,0,0,0.74)";
    context.fillStyle = node.kind === "town" ? "#ffffff" : "#f4e3a6";
    context.strokeText(node.name, point.x, point.y - (node.kind === "town" ? 44 : 38));
    context.fillText(node.name, point.x, point.y - (node.kind === "town" ? 44 : 38));
    context.restore();
  }
}

function drawFocus(ctx: CanvasRenderingContext2D, focus: ReplayFocus | undefined, camera: IsoCamera): void {
  if (!focus) return;
  ctx.save();
  ctx.strokeStyle = "#ffd64d";
  ctx.lineWidth = 3;
  for (const tile of focus.tiles) {
    const point = worldToIso(tile.x, tile.y, camera);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y - 3);
    ctx.lineTo(point.x + camera.tileW / 2 + 4, point.y + camera.tileH / 2);
    ctx.lineTo(point.x, point.y + camera.tileH + 3);
    ctx.lineTo(point.x - camera.tileW / 2 - 4, point.y + camera.tileH / 2);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

function drawPolyline(context: CanvasRenderingContext2D, points: Array<{ x: number; y: number }>, strokeStyle: string, lineWidth: number): void {
  context.save();
  context.strokeStyle = strokeStyle;
  context.lineWidth = lineWidth;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.beginPath();
  for (const [index, point] of points.entries()) {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  }
  context.stroke();
  context.restore();
}

function drawRailSleepers(context: CanvasRenderingContext2D, points: Array<{ x: number; y: number }>): void {
  context.save();
  context.strokeStyle = "#2b2118";
  context.lineWidth = 2;
  context.lineCap = "butt";
  forEachSegmentPoint(points, 9, 3, (point, normal) => {
    context.beginPath();
    context.moveTo(point.x - normal.x * 6.5, point.y - normal.y * 6.5);
    context.lineTo(point.x + normal.x * 6.5, point.y + normal.y * 6.5);
    context.stroke();
  });
  context.restore();
}

function drawOffsetPolyline(context: CanvasRenderingContext2D, points: Array<{ x: number; y: number }>, offset: number, strokeStyle: string, lineWidth: number): void {
  const offsetPoints = points.map((point, index) => {
    const normal = normalAt(points, index);
    return { x: point.x + normal.x * offset, y: point.y + normal.y * offset };
  });
  drawPolyline(context, offsetPoints, strokeStyle, lineWidth);
}

function forEachSegmentPoint(
  points: Array<{ x: number; y: number }>,
  spacing: number,
  startOffset: number,
  visit: (point: { x: number; y: number }, normal: { x: number; y: number }) => void
): void {
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length <= 0) continue;
    const normal = { x: -dy / length, y: dx / length };
    for (let distance = startOffset; distance < length; distance += spacing) {
      const ratio = distance / length;
      visit({ x: start.x + dx * ratio, y: start.y + dy * ratio }, normal);
    }
  }
}

function normalAt(points: Array<{ x: number; y: number }>, index: number): { x: number; y: number } {
  const before = index > 0 ? segmentNormal(points[index - 1], points[index]) : null;
  const after = index < points.length - 1 ? segmentNormal(points[index], points[index + 1]) : null;
  if (before && after) {
    const x = before.x + after.x;
    const y = before.y + after.y;
    const length = Math.hypot(x, y);
    if (length > 0.001) return { x: x / length, y: y / length };
  }
  return after ?? before ?? { x: 0, y: 1 };
}

function segmentNormal(start: { x: number; y: number }, end: { x: number; y: number }): { x: number; y: number } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  return length > 0 ? { x: -dy / length, y: dx / length } : { x: 0, y: 1 };
}

function samplePath(points: Array<{ x: number; y: number }>, progress: number): { x: number; y: number; normal: { x: number; y: number } } {
  const totalLength = pathLength(points);
  let remaining = totalLength * clamp(progress, 0, 0.999);
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length <= 0) continue;
    if (remaining <= length) {
      const ratio = remaining / length;
      return { x: start.x + dx * ratio, y: start.y + dy * ratio, normal: { x: -dy / length, y: dx / length } };
    }
    remaining -= length;
  }
  const last = points[points.length - 1];
  return { x: last.x, y: last.y, normal: normalAt(points, points.length - 1) };
}

function pathLength(points: Array<{ x: number; y: number }>): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  }
  return Math.max(1, length);
}

function terrainSprite(terrain: Terrain, seed: number, x: number, y: number): SpriteDef {
  if (terrain === "water") return pick(WATER_TILES, seed, x, y, 3);
  if (terrain === "rough") return hash01(seed, x, y, 4) > 0.68 ? pick(ROCK_TILES, seed, x, y, 5) : pick(ROUGH_TILES, seed, x, y, 6);
  if (hash01(seed, x, y, 7) < 0.035) return pick(FIELD_TILES, seed, x, y, 8);
  if (hash01(seed, x, y, 9) < 0.07) return pick(BARE_TILES, seed, x, y, 10);
  return pick(GRASS_TILES, seed, x, y, 11);
}

function visualTerrain(terrain: Terrain[][], x: number, y: number): Terrain {
  const tile = terrain[y]?.[x] ?? "grass";
  if (tile !== "water") return tile;
  let waterNeighbors = 0;
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    if (terrain[y + dy]?.[x + dx] === "water") waterNeighbors += 1;
  }
  return waterNeighbors === 0 ? "grass" : "water";
}

function drawSprite(context: CanvasRenderingContext2D, assets: SpriteAssets, spriteDef: SpriteDef, x: number, y: number): void {
  const sheet = assets[spriteDef.sheet];
  if (!sheet.ready) return;
  context.drawImage(
    sheet.image,
    spriteDef.sx,
    spriteDef.sy,
    spriteDef.sw,
    spriteDef.sh,
    Math.round(x + spriteDef.xRel),
    Math.round(y + spriteDef.yRel),
    spriteDef.sw,
    spriteDef.sh
  );
}

function drawTerrainSprite(context: CanvasRenderingContext2D, assets: SpriteAssets, spriteDef: SpriteDef, x: number, y: number): void {
  const sheet = assets[spriteDef.sheet];
  if (!sheet.ready) {
    fallbackDiamond(context, x, y);
    return;
  }
  context.drawImage(sheet.image, spriteDef.sx, spriteDef.sy, spriteDef.sw, spriteDef.sh, Math.round(x + spriteDef.xRel), Math.round(y + spriteDef.yRel), spriteDef.sw, spriteDef.sh);
}

function fallbackDiamond(context: CanvasRenderingContext2D, x: number, y: number): void {
  context.save();
  context.fillStyle = "#5f9a4a";
  context.strokeStyle = "rgba(18, 28, 24, 0.22)";
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(x + TILE_W / 2, y + TILE_H / 2);
  context.lineTo(x, y + TILE_H);
  context.lineTo(x - TILE_W / 2, y + TILE_H / 2);
  context.closePath();
  context.fill();
  context.stroke();
  context.restore();
}

function routePath(route: Route, nodes: WorldNode[]): Array<{ x: number; y: number }> | undefined {
  const source = nodes.find((node) => node.id === route.sourceId);
  const destination = nodes.find((node) => node.id === route.destinationId);
  if (!source || !destination) return undefined;
  return route.path?.length ? route.path : manhattanPath(source.x, source.y, destination.x, destination.y);
}

function zoomViewport(current: ViewportState, requestedZoom: number, cursorX: number, cursorY: number, width: number, height: number): ViewportState {
  const zoom = clamp(requestedZoom, MIN_VIEW_ZOOM, MAX_VIEW_ZOOM);
  if (Math.abs(zoom - current.zoom) < 0.001) return current;
  const ratio = zoom / current.zoom;
  const anchorX = cursorX - width / 2;
  const anchorY = cursorY - height / 2;
  return {
    zoom,
    panX: anchorX - ratio * (anchorX - current.panX),
    panY: anchorY - ratio * (anchorY - current.panY),
  };
}

function viewportPoint(point: { x: number; y: number }, viewport: ViewportState, width: number, height: number): { x: number; y: number } {
  return {
    x: width / 2 + viewport.panX + (point.x - width / 2) * viewport.zoom,
    y: height / 2 + viewport.panY + (point.y - height / 2) * viewport.zoom,
  };
}

function manhattanPath(x1: number, y1: number, x2: number, y2: number): Array<{ x: number; y: number }> {
  const path = [{ x: x1, y: y1 }];
  let x = x1;
  let y = y1;
  while (x !== x2) {
    x += Math.sign(x2 - x);
    path.push({ x, y });
  }
  while (y !== y2) {
    y += Math.sign(y2 - y);
    path.push({ x, y });
  }
  return path;
}

function sceneBounds(camera: IsoCamera, worldWidth: number, worldHeight: number): { minX: number; minY: number; maxX: number; maxY: number } {
  const points = [
    worldToIso(0, 0, camera),
    worldToIso(worldWidth - 1, 0, camera),
    worldToIso(0, worldHeight - 1, camera),
    worldToIso(worldWidth - 1, worldHeight - 1, camera),
  ];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: Math.min(...xs) - camera.tileW * 1.5,
    minY: Math.min(...ys) - 140,
    maxX: Math.max(...xs) + camera.tileW * 1.5,
    maxY: Math.max(...ys) + camera.tileH + 140,
  };
}

function tileCenter(x: number, y: number, camera: IsoCamera): { x: number; y: number } {
  const point = worldToIso(x, y, camera);
  return { x: point.x, y: point.y + camera.tileH / 2 };
}

function jitteredPoint(seed: number, x: number, y: number, camera: IsoCamera, salt: number): { x: number; y: number } {
  const point = worldToIso(x, y, camera);
  return {
    x: point.x + (hash01(seed, x, y, salt) - 0.5) * 22,
    y: point.y + TILE_H * 0.5 + (hash01(seed, x, y, salt + 1) - 0.5) * 10,
  };
}

function isNearNode(nodes: WorldNode[], x: number, y: number, radius: number): boolean {
  return nodes.some((node) => Math.hypot(node.x - x, node.y - y) <= radius);
}

function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hash01(seed: number, x: number, y: number, salt: number): number {
  let hash = Math.imul(seed + 0x9e3779b9, 374761393);
  hash ^= Math.imul(x + salt * 17, 668265263);
  hash ^= Math.imul(y + salt * 31, 2246822519);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

function pick<T>(items: T[], seed: number, x: number, y: number, salt: number): T {
  return items[Math.floor(hash01(seed, x, y, salt) * items.length) % items.length];
}

function ground(sheet: SpriteSheetKey, sx: number): SpriteDef {
  return sprite(sheet, sx, 1, TILE_W, TILE_H, -31, 0);
}

function sprite(sheet: SpriteSheetKey, sx: number, sy: number, sw: number, sh: number, xRel: number, yRel: number): SpriteDef {
  return { sheet, sx, sy, sw, sh, xRel, yRel };
}
