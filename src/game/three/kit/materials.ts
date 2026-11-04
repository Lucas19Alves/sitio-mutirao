// Biblioteca de materiais compartilhados. Quase tudo usa cor por vértice num único material
// "padrão" (com vento no shader), então centenas de objetos reaproveitam o mesmo programa.
import * as THREE from 'three';

export const wind = { value: 0 };

function withWind<T extends THREE.Material>(m: T): T {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = wind;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float wind;\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec2 wph = instanceMatrix[3].xz;
#else
  vec2 wph = modelMatrix[3].xz;
#endif
  float wt = uTime * 1.7 + wph.x * 0.61 + wph.y * 0.37;
  transformed.x += sin(wt) * 0.05 * wind;
  transformed.z += cos(wt * 0.83) * 0.035 * wind;`);
  };
  m.customProgramCacheKey = () => 'wind';
  return m;
}

/** Superfícies opacas de cor por vértice (madeira, folhas, pedra, tecido…). */
export const matVC = withWind(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 }));
/** Partes com esqueleto (personagens). */
export const matSkin = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 });
/** Vidro de janelas e estufa. */
export const matGlass = new THREE.MeshStandardMaterial({ color: '#bfe7f6', roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.55, emissive: '#2c5d72', emissiveIntensity: 0.15 });
/** Metal das ferramentas. */
export const matMetal = new THREE.MeshStandardMaterial({ color: '#c7ced4', roughness: 0.35, metalness: 0.6 });

/** Sombra de contato barata (disco com gradiente) para objetos pequenos. */
let blobTex: THREE.CanvasTexture | null = null;
export function blobShadowMaterial() {
  if (!blobTex) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(32, 32, 2, 32, 32, 31);
    g.addColorStop(0, 'rgba(0,0,0,0.42)'); g.addColorStop(0.6, 'rgba(0,0,0,0.2)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    blobTex = new THREE.CanvasTexture(c);
  }
  return new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
}

/** Textura de texto (placas, etiquetas) desenhada em canvas. */
export function labelTexture(lines: string[], opts: { w?: number; h?: number; bg?: string; fg?: string; font?: number } = {}) {
  const w = opts.w ?? 512, h = opts.h ?? 256;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d')!;
  x.fillStyle = opts.bg ?? '#fff6e0';
  x.beginPath(); x.roundRect(6, 6, w - 12, h - 12, 28); x.fill();
  x.lineWidth = 8; x.strokeStyle = '#5b3b22'; x.stroke();
  x.fillStyle = opts.fg ?? '#3b2c22'; x.textAlign = 'center'; x.textBaseline = 'middle';
  const fs = opts.font ?? 64;
  lines.forEach((l, i) => { x.font = `${i === 0 ? 800 : 600} ${i === 0 ? fs : fs * 0.62}px Sniglet, Atkinson Hyperlegible, sans-serif`; x.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * fs * 0.95); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
