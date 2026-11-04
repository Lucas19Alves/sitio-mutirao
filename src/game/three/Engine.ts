// Renderer, céu, luzes e o único laço de animação do jogo.
import * as THREE from 'three';
import { wind } from './kit/materials.ts';
import { gfx } from '../gfx.ts';

export interface Tickable { update(dt: number, t: number): void }

const coarse = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

export class Engine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  private tickers = new Set<Tickable>();
  private raf = 0;
  private last = 0;
  private ro: ResizeObserver;
  time = 0;
  fps = 60;
  private frames = 0; private fpsAt = 0;
  /** pausa a simulação (capturas de tela) mantendo a renderização */
  paused = false;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';
    host.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 220);
    this.scene.background = skyTexture();
    this.scene.fog = new THREE.Fog('#bfe3ef', 34, 78);

    this.hemi = new THREE.HemisphereLight('#dff3ff', '#6d8f45', 1.35);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff1d6', 2.4);
    this.sun.position.set(-14, 26, 18);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    const sc = this.sun.shadow.camera;
    sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 80;
    this.scene.add(this.sun, this.sun.target);
    this.applyQuality();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
  }

  applyQuality() {
    const q = gfx.quality;
    const mobile = coarse();
    const dprCap = q === 'high' ? (mobile ? 1.75 : 2) : q === 'medium' ? 1.5 : 1;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, dprCap));
    const size = q === 'high' ? (mobile ? 1024 : 2048) : q === 'medium' ? 1024 : 512;
    // a área de sombra acompanha o que a câmera vê (menos objetos no passe de sombra)
    const ext = q === 'high' ? 17 : 12;
    const sc = this.sun.shadow.camera;
    if (sc.right !== ext) { sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.updateProjectionMatrix(); }
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
    }
    this.renderer.shadowMap.enabled = q !== 'low';
    this.resize();
  }

  resize() {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  add(t: Tickable) { this.tickers.add(t); return () => this.tickers.delete(t); }

  start() {
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - (this.last || now)) / 1000);
      this.last = now;
      if (!this.paused) {
        this.time += dt;
        wind.value = this.time;
        for (const t of this.tickers) t.update(dt, this.time);
      }
      this.renderer.render(this.scene, this.camera);
      this.frames++;
      if (now - this.fpsAt > 1000) { this.fps = (this.frames * 1000) / (now - this.fpsAt); this.frames = 0; this.fpsAt = now; }
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Mantém a sombra do sol centrada no ponto de interesse (sombras nítidas onde se olha). */
  followShadow(x: number, z: number) {
    const s = 1; // arredonda para o texel e evita "tremor" das sombras
    const tx = Math.round(x / s) * s, tz = Math.round(z / s) * s;
    this.sun.position.set(tx - 14, 26, tz + 18);
    this.sun.target.position.set(tx, 0, tz);
  }

  diagnostics() {
    const i = this.renderer.info;
    return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, fps: Math.round(this.fps), dpr: this.renderer.getPixelRatio() };
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.tickers.clear();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function skyTexture() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#5fb3e6'); g.addColorStop(0.55, '#9fd6f0'); g.addColorStop(1, '#d9f0f5');
  x.fillStyle = g; x.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
