// SmileGroup Demo 3 · "Von Berlin zu uns nach Şişli": holografik 3B yolculuk haritası.
// Three.js r160 (importmap: 'three', 'three/addons/'). Harita: Natural Earth 1:50m (kamu malı),
// reise-veri.py ile Avrupa + Türkiye kutusuna kırpılıp sadeleştirildi.
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Renkler yazıldığı gibi kullanılsın (gölgelendiricilerle aynı ton)
THREE.ColorManagement.enabled = false;

const LON0 = 21, LAT0 = 47, KX = Math.cos(LAT0 * Math.PI / 180);
const proj = (lon, lat, y = 0) => new THREE.Vector3((lon - LON0) * KX, y, -(lat - LAT0));
const ORT = {
  ber: proj(13.50, 52.37),      // Flughafen BER
  ist: proj(28.75, 41.26),      // İstanbul Havalimanı
  sisli: proj(28.987, 41.062)   // Şişli, Büyükdere Caddesi
};
const VURGU = new Set(['276', '792']); // Almanya, Türkiye
const H_LAND = 0.03, H_VURGU = 0.07;
// Kaydırma akışı: sahnelerin başladığı noktalar (0–1)
const AKT = { flug: 0.13, landung: 0.63, transfer: 0.75, smile: 0.86 };

const klemme = v => Math.min(1, Math.max(0, v));
const abschnitt = (p, a, b) => klemme((p - a) / (b - a));
const weich = t => t * t * (3 - 2 * t);
const eio = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

const VS_FLAECHE = `
varying vec3 vW; varying vec3 vN; varying vec2 vUv;
void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
const VS_LINIE = `
attribute float aS; varying vec3 vW; varying float vS;
void main(){ vS = aS; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
// Ortak: batıdan doğuya "oluşma" dalgası ve uzaklık sisi
const ORTAK = `
uniform float uAufbau; uniform vec2 uNebel;
float aufbauAlpha(float x){ float xr = mix(-27.0, 27.0, uAufbau); return 1.0 - smoothstep(xr - 0.8, xr + 0.8, x); }
float aufbauKante(float x){ float xr = mix(-27.0, 27.0, uAufbau); return exp(-abs(x - xr) * 2.4) * (1.0 - step(0.999, uAufbau)); }
float nebel(vec3 w){ return 1.0 - smoothstep(uNebel.x, uNebel.y, distance(cameraPosition, w)); }
vec3 holo(float t){
  float s = fract(t) * 5.0;
  vec3 c = mix(vec3(0.812, 0.878, 0.949), vec3(0.902, 0.867, 0.953), smoothstep(0.0, 1.0, s));
  c = mix(c, vec3(0.965, 0.890, 0.831), smoothstep(1.0, 2.0, s));
  c = mix(c, vec3(0.918, 0.851, 0.741), smoothstep(2.0, 3.0, s));
  c = mix(c, vec3(0.969, 0.851, 0.824), smoothstep(3.0, 4.0, s));
  return mix(c, vec3(0.812, 0.878, 0.949), smoothstep(4.0, 5.0, s));
}`;

const FS_LAND = `
uniform float uZeit; uniform float uVurgu;
varying vec3 vW; varying vec3 vN;
${ORTAK}
void main(){
  vec3 v = normalize(cameraPosition - vW);
  vec3 n = normalize(vN);
  float fres = pow(1.0 - clamp(abs(dot(n, v)), 0.0, 1.0), 2.0);
  float t = vW.x * 0.03 - vW.z * 0.025 + fres * 0.45 + uZeit * 0.015;
  vec3 perle = vec3(0.988, 0.982, 0.972);
  vec3 col = mix(perle, holo(t), 0.42 + 0.45 * uVurgu);
  col = mix(col, col * vec3(0.93, 0.95, 1.0), uVurgu * 0.5);
  float oben = smoothstep(0.5, 0.9, n.y);
  col *= mix(0.9, 1.0, oben);
  // Holografik enlem-boylam ızgarası (yalnız üst yüzde)
  vec2 gw = abs(fract(vW.xz * 0.5) - 0.5);
  float dg = min(gw.x, gw.y);
  float netz = 1.0 - smoothstep(0.0, fwidth(dg) * 1.4, dg);
  col = mix(col, vec3(0.55, 0.64, 0.76), netz * 0.22 * oben);
  col += vec3(0.30, 0.42, 0.62) * aufbauKante(vW.x);
  gl_FragColor = vec4(col, aufbauAlpha(vW.x) * nebel(vW));
}`;

const FS_MEER = `
uniform float uZeit; uniform float uPunkte;
varying vec3 vW;
${ORTAK}
void main(){
  vec2 q = vW.xz;
  float r = length((q - vec2(0.5, 0.0)) / vec2(34.0, 26.0));
  float rand = 1.0 - smoothstep(0.45, 1.0, r);
  vec3 tief = mix(vec3(0.88, 0.915, 0.955), vec3(0.925, 0.905, 0.962), 0.5 + 0.5 * sin(q.x * 0.08 + q.y * 0.06 + uZeit * 0.05));
  vec2 g = fract(q * 1.25) - 0.5;
  float punkt = smoothstep(0.07, 0.0, length(g)) * uPunkte;
  vec3 col = mix(tief, vec3(0.30, 0.42, 0.55), punkt * 0.3);
  gl_FragColor = vec4(col, rand * 0.9 * aufbauAlpha(vW.x) * nebel(vW));
}`;

const FS_LINIE = `
uniform vec3 uFarbe; uniform float uAlpha;
varying vec3 vW; varying float vS;
${ORTAK}
void main(){ gl_FragColor = vec4(uFarbe, uAlpha * aufbauAlpha(vW.x) * nebel(vW)); }`;

const FS_ROUTE = `
uniform float uFort; uniform float uZeit; uniform float uAlpha; uniform float uHalo;
varying vec2 vUv; varying vec3 vW;
${ORTAK}
void main(){
  if (vUv.x > uFort) discard;
  vec3 a = vec3(0.50, 0.65, 0.83), b = vec3(0.66, 0.56, 0.81), c = vec3(0.89, 0.60, 0.53), d = vec3(0.79, 0.64, 0.37);
  float s = vUv.x;
  vec3 col = s < 0.33 ? mix(a, b, s / 0.33) : (s < 0.66 ? mix(b, c, (s - 0.33) / 0.33) : mix(c, d, (s - 0.66) / 0.34));
  float puls = 0.5 + 0.5 * sin(vUv.x * 90.0 - uZeit * 4.0);
  col = mix(col, vec3(1.0), puls * 0.22 * (1.0 - uHalo));
  col = mix(col, vec3(1.0), smoothstep(uFort - 0.02, uFort, vUv.x) * 0.6);
  gl_FragColor = vec4(col, uAlpha * nebel(vW));
}`;

const FS_SCHATTEN = `
uniform float uFort;
varying vec3 vW; varying float vS;
${ORTAK}
void main(){
  if (vS > uFort) discard;
  if (fract(vS * 70.0) > 0.55) discard;
  gl_FragColor = vec4(0.17, 0.27, 0.36, 0.34 * aufbauAlpha(vW.x) * nebel(vW));
}`;

const FS_STRAHL = `
uniform vec3 uFarbe; uniform float uAlpha;
varying vec2 vUv;
void main(){ gl_FragColor = vec4(uFarbe, (1.0 - vUv.y) * (1.0 - vUv.y) * uAlpha); }`;

export async function starteReise(sektion, opt = {}) {
  const canvas = sektion.querySelector('.reise__canvas');
  const buehne = sektion.querySelector('.reise__buehne');
  const wenig = !!opt.wenigBewegung;
  const fein = matchMedia('(hover: hover) and (pointer: fine)').matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    sektion.classList.add('reise--statisch', 'reise--ohne-3d');
    return null;
  }
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  scene.fog = new THREE.Fog(0xF4F1EC, 40, 90);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe3d9cb, 1.25));
  const sonne = new THREE.DirectionalLight(0xffffff, 1.5);
  sonne.position.set(-6, 14, 9);
  scene.add(sonne);

  const kamera = new THREE.PerspectiveCamera(32, 1, 0.02, 220);
  const uZeit = { value: 0 }, uAufbau = { value: wenig ? 1 : 0 }, uNebel = { value: new THREE.Vector2(40, 90) };
  const ortak = { uZeit, uAufbau, uNebel };

  /* ---------- Harita ---------- */
  const daten = await fetch(new URL('reise-karte.json', import.meta.url)).then(r => r.json());
  const karte = new THREE.Group();
  scene.add(karte);
  const landMat = vurgu => new THREE.ShaderMaterial({
    uniforms: { ...ortak, uVurgu: { value: vurgu } }, vertexShader: VS_FLAECHE, fragmentShader: FS_LAND, transparent: true
  });
  const matNormal = landMat(0), matVurgu = landMat(1);
  const grenzeN = [], grenzeV = [];
  const zuVec2 = ([lon, lat]) => { const p = proj(lon, lat); return new THREE.Vector2(p.x, -p.z); };
  for (const l of daten.laender) {
    const vurgu = VURGU.has(String(l.id));
    const h = vurgu ? H_VURGU : H_LAND;
    const formen = l.polys.map(poly => {
      const s = new THREE.Shape(poly[0].map(zuVec2));
      poly.slice(1).forEach(loch => s.holes.push(new THREE.Path(loch.map(zuVec2))));
      return s;
    });
    const geo = new THREE.ExtrudeGeometry(formen, { depth: h, bevelEnabled: false, curveSegments: 1 });
    geo.rotateX(-Math.PI / 2);
    karte.add(new THREE.Mesh(geo, vurgu ? matVurgu : matNormal));
    const ziel = vurgu ? grenzeV : grenzeN;
    for (const poly of l.polys) for (const ring of poly) {
      for (let i = 0; i < ring.length; i++) {
        const a = proj(ring[i][0], ring[i][1], h + 0.003);
        const b = proj(ring[(i + 1) % ring.length][0], ring[(i + 1) % ring.length][1], h + 0.003);
        ziel.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
  }
  const linien = (punkte, farbe, alpha) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(punkte, 3));
    g.setAttribute('aS', new THREE.Float32BufferAttribute(new Float32Array(punkte.length / 3), 1));
    return new THREE.LineSegments(g, new THREE.ShaderMaterial({
      uniforms: { ...ortak, uFarbe: { value: new THREE.Color(farbe) }, uAlpha: { value: alpha } },
      vertexShader: VS_LINIE, fragmentShader: FS_LINIE, transparent: true, depthWrite: false
    }));
  };
  karte.add(linien(grenzeN, '#8296AC', 0.75));
  karte.add(linien(grenzeV, '#B08D57', 0.95));

  const uPunkte = { value: 1 };
  const meer = new THREE.Mesh(new THREE.PlaneGeometry(120, 90), new THREE.ShaderMaterial({
    uniforms: { ...ortak, uPunkte }, vertexShader: VS_FLAECHE, fragmentShader: FS_MEER, transparent: true, depthWrite: false
  }));
  meer.rotation.x = -Math.PI / 2;
  meer.position.set(0.5, -0.012, 0);
  meer.renderOrder = -1;
  scene.add(meer);

  // Boğaz: yaklaşık orta hat (İstanbul yakın planı için)
  const bosporus = new THREE.CatmullRomCurve3([
    [28.985, 41.005], [29.012, 41.035], [29.035, 41.062], [29.055, 41.092], [29.063, 41.122],
    [29.074, 41.152], [29.072, 41.182], [29.098, 41.21], [29.125, 41.236]
  ].map(([lon, lat]) => proj(lon, lat, H_VURGU + 0.004)));
  const bosporusMat = new THREE.MeshBasicMaterial({ color: 0x6E9FD3, transparent: true, opacity: 0, fog: false });
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(bosporus, 60, 0.006, 6, false), bosporusMat));

  /* ---------- Uçuş rotası ---------- */
  const start = ORT.ber.clone().setY(H_VURGU + 0.02), ende = ORT.ist.clone().setY(H_VURGU + 0.02);
  const route = new THREE.CubicBezierCurve3(start, start.clone().lerp(ende, 0.27).setY(3.2), start.clone().lerp(ende, 0.73).setY(3.2), ende);
  const routeRohr = (radius, alpha, halo) => new THREE.Mesh(new THREE.TubeGeometry(route, 260, radius, 10, false), new THREE.ShaderMaterial({
    uniforms: { ...ortak, uFort: { value: 0 }, uAlpha: { value: alpha }, uHalo: { value: halo } },
    vertexShader: VS_FLAECHE, fragmentShader: FS_ROUTE, transparent: true, depthWrite: !halo
  }));
  const routeKern = routeRohr(0.016, 1, 0), routeHalo = routeRohr(0.05, 0.18, 1);
  scene.add(routeKern, routeHalo);
  const schattenPunkte = [], schattenS = [];
  for (let i = 0; i <= 200; i++) {
    const p = route.getPointAt(i / 200);
    schattenPunkte.push(p.x, H_VURGU + 0.008, p.z);
    schattenS.push(i / 200);
  }
  const schattenGeo = new THREE.BufferGeometry();
  schattenGeo.setAttribute('position', new THREE.Float32BufferAttribute(schattenPunkte, 3));
  schattenGeo.setAttribute('aS', new THREE.Float32BufferAttribute(schattenS, 1));
  const schattenMat = new THREE.ShaderMaterial({ uniforms: { ...ortak, uFort: { value: 0 } }, vertexShader: VS_LINIE, fragmentShader: FS_SCHATTEN, transparent: true, depthWrite: false });
  scene.add(new THREE.Line(schattenGeo, schattenMat));

  /* ---------- Uçak (kodla, sade seramik görünüm) ---------- */
  const flugzeug = new THREE.Group();
  {
    const weiss = new THREE.MeshStandardMaterial({ color: 0xFCFBF8, roughness: 0.3, metalness: 0.12, envMapIntensity: 1.1 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xC9A86A, roughness: 0.28, metalness: 0.7 });
    const blau = new THREE.MeshStandardMaterial({ color: 0x2C445C, roughness: 0.35, metalness: 0.2 });
    const rumpf = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.92, 8, 20), weiss);
    rumpf.rotation.z = -Math.PI / 2;
    flugzeug.add(rumpf);
    const flaeche = (pkt, dicke, mat) => {
      const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pkt.map(([x, y]) => new THREE.Vector2(x, y))), { depth: dicke, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      return new THREE.Mesh(geo, mat);
    };
    const fluegel = flaeche([[0.16, 0.09], [-0.1, 0.84], [-0.24, 0.84], [-0.13, 0.09], [-0.13, -0.09], [-0.24, -0.84], [-0.1, -0.84], [0.16, -0.09]], 0.018, weiss);
    fluegel.position.y = -0.035;
    const leitwerk = flaeche([[-0.43, 0.05], [-0.57, 0.3], [-0.64, 0.3], [-0.57, 0.05], [-0.57, -0.05], [-0.64, -0.3], [-0.57, -0.3], [-0.43, -0.05]], 0.014, weiss);
    leitwerk.position.y = 0.02;
    const finneGeo = new THREE.ExtrudeGeometry(new THREE.Shape([[-0.38, 0.06], [-0.6, 0.36], [-0.68, 0.36], [-0.62, 0.06]].map(([x, y]) => new THREE.Vector2(x, y))), { depth: 0.016, bevelEnabled: false });
    finneGeo.translate(0, 0, -0.008);
    flugzeug.add(fluegel, leitwerk, new THREE.Mesh(finneGeo, gold));
    for (const z of [-0.3, 0.3]) {
      const tw = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.036, 0.2, 16), blau);
      tw.rotation.z = Math.PI / 2;
      tw.position.set(0.03, -0.085, z);
      flugzeug.add(tw);
    }
    const streifen = new THREE.Mesh(new THREE.CylinderGeometry(0.1015, 0.1015, 0.55, 20, 1, true, 0.25, 0.5), gold);
    streifen.rotation.z = Math.PI / 2;
    streifen.position.x = 0.05;
    flugzeug.add(streifen);
  }
  scene.add(flugzeug);

  /* ---------- Noktalar: ışık sütunu, nabız halkası (ekranda sabit boy) ---------- */
  const marker = (pos, farbe) => {
    const g = new THREE.Group();
    g.position.copy(pos).setY(H_VURGU + 0.006);
    const strahlGeo = new THREE.CylinderGeometry(0.03, 0.03, 2.2, 12, 1, true);
    strahlGeo.translate(0, 1.1, 0);
    const strahl = new THREE.Mesh(strahlGeo, new THREE.ShaderMaterial({ uniforms: { uFarbe: { value: new THREE.Color(farbe) }, uAlpha: { value: 0.7 } }, vertexShader: VS_FLAECHE, fragmentShader: FS_STRAHL, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    const punkt = new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 14), new THREE.MeshStandardMaterial({ color: farbe, roughness: 0.3, metalness: 0.2, emissive: farbe, emissiveIntensity: 0.25 }));
    const ringGeo = new THREE.RingGeometry(0.15, 0.19, 48);
    ringGeo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: farbe, transparent: true, opacity: 0.6, depthWrite: false }));
    g.add(strahl, punkt, ring);
    g.userData = { strahl, ring };
    scene.add(g);
    return g;
  };
  const mBer = marker(ORT.ber, '#4F7FB3'), mIst = marker(ORT.ist, '#DD5845'), mSisli = marker(ORT.sisli, '#A58753');

  /* ---------- Havalimanından Şişli'ye transfer ---------- */
  const tA = ORT.ist.clone().setY(H_VURGU + 0.012), tC = ORT.sisli.clone().setY(H_VURGU + 0.012);
  const tB = tA.clone().lerp(tC, 0.5).add(V3(0.07, 0, -0.05));
  const transfer = new THREE.QuadraticBezierCurve3(tA, tB, tC);
  const transferMat = new THREE.ShaderMaterial({ uniforms: { ...ortak, uFort: { value: 0 }, uAlpha: { value: 1 }, uHalo: { value: 0 } }, vertexShader: VS_FLAECHE, fragmentShader: FS_ROUTE, transparent: true });
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(transfer, 60, 0.0045, 8, false), transferMat));
  const wagen = new THREE.Mesh(new THREE.SphereGeometry(0.011, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xF1D7A6, emissiveIntensity: 0.9 }));
  wagen.visible = false;
  scene.add(wagen);

  /* ---------- SmileGroup amblemi: holografik yükseliş ---------- */
  const emblem = new THREE.Group();
  emblem.position.copy(ORT.sisli).setY(H_VURGU);
  scene.add(emblem);
  const emblemMat = new THREE.MeshPhysicalMaterial({
    color: 0xF6F1E8, roughness: 0.2, metalness: 0.3, iridescence: 1, iridescenceIOR: 1.4,
    iridescenceThicknessRange: [180, 700], clearcoat: 1, clearcoatRoughness: 0.08,
    transparent: true, opacity: 0, side: THREE.DoubleSide, envMapIntensity: 1.4, fog: false
  });
  const traeger = new THREE.Group();
  emblem.add(traeger);
  new SVGLoader().loadAsync(new URL('reise-emblem.svg', import.meta.url)).then(svg => {
    const formen = svg.paths.flatMap(p => SVGLoader.createShapes(p));
    const geo = new THREE.ExtrudeGeometry(formen, { depth: 9, bevelEnabled: true, bevelThickness: 1.2, bevelSize: 0.8, bevelSegments: 3, curveSegments: 12 });
    geo.computeBoundingBox();
    const bb = geo.boundingBox, mitte = bb.getCenter(new THREE.Vector3());
    geo.translate(-mitte.x, -mitte.y, -mitte.z);
    const s = 0.32 / (bb.max.y - bb.min.y);
    const m = new THREE.Mesh(geo, emblemMat);
    m.scale.set(s, -s, s);
    traeger.add(m);
  }).catch(() => {});
  const kegelGeo = new THREE.CylinderGeometry(0.13, 0.03, 0.4, 32, 1, true);
  kegelGeo.translate(0, 0.2, 0);
  const kegelMat = new THREE.ShaderMaterial({ uniforms: { uFarbe: { value: new THREE.Color('#C9A86A') }, uAlpha: { value: 0 } }, vertexShader: VS_FLAECHE, fragmentShader: FS_STRAHL, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const kegel = new THREE.Mesh(kegelGeo, kegelMat);
  kegel.rotation.x = Math.PI;
  kegel.position.y = 0.4;
  emblem.add(kegel);

  /* ---------- Kamera akışı: hedef, hedefe göre konum, gösterilmesi gereken yarı genişlik ---------- */
  const blick = (ziel, versatz, hb) => ({ ziel, versatz, hb });
  const routeMitte = ORT.ber.clone().lerp(ORT.ist, 0.5);
  const istMitte = ORT.ist.clone().lerp(ORT.sisli, 0.5);
  const uebersicht = blick(routeMitte.clone().add(V3(0.2, 0, 0.6)), V3(0.6, 32, 22), 7.4);
  const berlinBlick = blick(ORT.ber.clone().add(V3(0.9, 0, 1.0)), V3(2.0, 8.4, 6.2), 3.2);
  const istBlick = blick(istMitte.clone(), V3(0.8, 4.2, 2.4), 1.7);
  const transferBlick = blick(istMitte.clone().add(V3(0.02, 0, 0.02)), V3(0.4, 2.0, 1.25), 0.9);
  const smileBlick = blick(ORT.sisli.clone().add(V3(0, 0.42, 0)), V3(0.55, 0.5, 1.9), 0.62);
  const statisch = blick(routeMitte.clone().add(V3(-0.4, 0, 0.9)), V3(1.2, 24, 17), 7.5);
  const akt = blick(V3(0, 0, 0), V3(0, 0, 0), 1), tmp = blick(V3(0, 0, 0), V3(0, 0, 0), 1);
  const mische = (a, b, t, out) => {
    out.ziel.lerpVectors(a.ziel, b.ziel, t); out.versatz.lerpVectors(a.versatz, b.versatz, t); out.hb = a.hb + (b.hb - a.hb) * t; return out;
  };
  const tangente = V3(0, 0, 0), flach = V3(0, 0, 0), seite = V3(0, 0, 0), hoch = V3(0, 1, 0);
  const nahF = blick(V3(0, 0, 0), V3(0, 0, 0), 2.6), weitF = blick(V3(0, 0, 0), V3(1.6, 13, 9.5), 6);
  const flugBlick = (f, out) => {
    const p = route.getPointAt(f);
    route.getTangentAt(Math.min(f, 0.999), tangente);
    flach.set(tangente.x, 0, tangente.z).normalize();
    seite.crossVectors(flach, hoch).normalize();
    // Uçağı arkadan-yandan ve yukarıdan izle; altta harita dolu görünsün
    nahF.ziel.copy(p).addScaledVector(flach, 0.8);
    nahF.versatz.copy(flach).multiplyScalar(-3.2).add(V3(0, 6.0, 0)).addScaledVector(seite, 2.4);
    weitF.ziel.copy(p).add(V3(0.3, 0, 0.6));
    return mische(nahF, weitF, Math.pow(Math.sin(Math.PI * f), 1.1), out);
  };
  const kameraZustand = p => {
    if (p < AKT.flug) return mische(uebersicht, berlinBlick, weich(abschnitt(p, 0.02, AKT.flug)), akt);
    if (p < AKT.landung) {
      flugBlick(eio(abschnitt(p, AKT.flug + 0.01, AKT.landung - 0.01)), tmp);
      return mische(berlinBlick, tmp, weich(abschnitt(p, AKT.flug, AKT.flug + 0.07)), akt);
    }
    if (p < AKT.transfer) { flugBlick(1, tmp); return mische(tmp, istBlick, weich(abschnitt(p, AKT.landung, AKT.landung + 0.08)), akt); }
    if (p < AKT.smile) return mische(istBlick, transferBlick, weich(abschnitt(p, AKT.transfer, AKT.smile)), akt);
    return mische(transferBlick, smileBlick, weich(abschnitt(p, AKT.smile, AKT.smile + 0.09)), akt);
  };

  /* ---------- Yerleşim, işaret etiketleri, metinler ---------- */
  const marken = { ber: sektion.querySelector('[data-ort="ber"]'), ist: sektion.querySelector('[data-ort="ist"]'), sisli: sektion.querySelector('[data-ort="sisli"]') };
  const schritte = [...sektion.querySelectorAll('.reise__schritt')];
  const balken = sektion.querySelector('.reise__fortschritt i');
  let breite = 1, hoehe = 1, tanHalb = Math.tan(THREE.MathUtils.degToRad(kamera.fov / 2));
  const groesse = () => {
    // Sabit modda tuval sahneyi kaplar; durağan modda kendi oranlı kutusunda durur
    const r = canvas.getBoundingClientRect();
    breite = Math.max(1, r.width); hoehe = Math.max(1, r.height);
    renderer.setSize(breite, hoehe, false);
    kamera.aspect = breite / hoehe;
    // Sahne, başlık (sol üst / üst) ve metin kartının (sol alt / alt) dışındaki alana kayar
    const mobil = kamera.aspect < 0.9;
    if (!wenig) kamera.setViewOffset(breite, hoehe, mobil ? 0 : -0.12 * breite, mobil ? 0.1 * hoehe : -0.02 * hoehe, breite, hoehe);
    kamera.updateProjectionMatrix();
  };
  groesse();
  new ResizeObserver(groesse).observe(canvas);
  const vp = V3(0, 0, 0);
  const setzeMarke = (el, pos, sicht) => {
    if (!el) return;
    vp.copy(pos).project(kamera);
    const x = (vp.x * 0.5 + 0.5) * breite, y = (-vp.y * 0.5 + 0.5) * hoehe;
    const raus = vp.z > 1 || x < -80 || x > breite + 80 || y < -80 || y > hoehe + 80;
    el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
    el.style.opacity = raus ? '0' : sicht.toFixed(3);
  };
  const ekranBoy = (obj, faktor, min, max) => obj.scale.setScalar(Math.min(max, Math.max(min, kamera.position.distanceTo(obj.position) * faktor)));

  /* ---------- Çizim ---------- */
  let pZiel = 0, pGlatt = 0, sichtbar = false, raf = 0, aufbauStart = -1, aktivSchritt = -1;
  const zeiger = { x: 0, y: 0, gx: 0, gy: 0 };
  const xA = V3(0, 0, 0), yA = V3(0, 0, 0), zA = V3(0, 0, 0), basis = new THREE.Matrix4();
  const zeichne = (p, jetzt) => {
    uZeit.value = jetzt / 1000;
    if (aufbauStart >= 0 && uAufbau.value < 1) uAufbau.value = klemme((jetzt - aufbauStart) / 1900);
    // Kamera
    const k = wenig ? statisch : kameraZustand(p);
    // Dar ekranda gösterilmesi gereken genişlik sığsın diye kamera gerekirse uzaklaşır
    const grund = k.versatz.length();
    const abstand = Math.max(grund, k.hb / (tanHalb * kamera.aspect));
    zeiger.gx += (zeiger.x - zeiger.gx) * 0.05;
    zeiger.gy += (zeiger.y - zeiger.gy) * 0.05;
    kamera.position.copy(k.ziel).addScaledVector(k.versatz, abstand / grund);
    kamera.position.x += zeiger.gx * abstand * 0.025;
    kamera.position.y -= zeiger.gy * abstand * 0.015;
    kamera.lookAt(k.ziel);
    uNebel.value.set(abstand * 1.15, abstand * 2.6);
    scene.fog.near = abstand * 1.15; scene.fog.far = abstand * 2.6;
    uPunkte.value = weich(abschnitt(abstand, 5, 12));
    // Rota ve uçak
    const f = eio(abschnitt(p, AKT.flug + 0.01, AKT.landung - 0.01));
    routeKern.material.uniforms.uFort.value = f;
    routeHalo.material.uniforms.uFort.value = f;
    schattenMat.uniforms.uFort.value = f;
    // İnişten sonra uçuş çizgisi geri çekilir; yakın planda sütun gibi durmasın
    const routeSoenen = wenig ? 0 : weich(abschnitt(p, AKT.landung + 0.03, AKT.transfer + 0.02));
    routeKern.material.uniforms.uAlpha.value = 1 - routeSoenen;
    routeHalo.material.uniforms.uAlpha.value = 0.18 * (1 - routeSoenen);
    routeKern.visible = routeHalo.visible = routeSoenen < 0.999;
    schattenMat.uniforms.uFort.value = f * (1 - routeSoenen);
    mBer.visible = wenig || p < AKT.landung;
    route.getPointAt(f, flugzeug.position);
    route.getTangentAt(Math.min(f, 0.999), xA).normalize();
    zA.crossVectors(xA, hoch).normalize();
    yA.crossVectors(zA, xA);
    flugzeug.quaternion.setFromRotationMatrix(basis.makeBasis(xA, yA, zA));
    flugzeug.visible = !wenig && p >= AKT.flug - 0.02 && p < AKT.landung + 0.06;
    ekranBoy(flugzeug, 0.045, 0.04, 0.75);
    // Noktalar
    const puls = (jetzt / 1600) % 1;
    for (const m of [mBer, mIst, mSisli]) {
      ekranBoy(m, 0.03, 0.02, 1.2);
      m.userData.ring.scale.setScalar(1 + puls * 1.8);
      m.userData.ring.material.opacity = 0.6 * (1 - puls);
    }
    mBer.userData.strahl.material.uniforms.uAlpha.value = 0.7 * (1 - 0.6 * weich(abschnitt(p, AKT.flug, AKT.flug + 0.2)));
    mIst.userData.strahl.material.uniforms.uAlpha.value = (0.3 + 0.45 * weich(abschnitt(p, AKT.landung - 0.1, AKT.landung))) * (1 - weich(abschnitt(p, AKT.transfer, AKT.smile)));
    mSisli.visible = wenig || p > AKT.transfer - 0.03;
    // Şişli'de ışık sütunu yerine amblemin kendi ışık konisi parlar
    mSisli.userData.strahl.material.uniforms.uAlpha.value = 0.7 * (1 - weich(abschnitt(p, AKT.smile - 0.04, AKT.smile + 0.02)));
    // Boğaz, transfer, amblem
    bosporusMat.opacity = wenig ? 0 : 0.85 * weich(abschnitt(p, AKT.landung - 0.04, AKT.landung + 0.05));
    const tf = weich(abschnitt(p, AKT.transfer, AKT.smile - 0.02));
    transferMat.uniforms.uFort.value = tf;
    wagen.visible = tf > 0.001 && tf < 0.999;
    transfer.getPointAt(tf, wagen.position);
    const e = wenig ? 1 : weich(abschnitt(p, AKT.smile - 0.01, AKT.smile + 0.08));
    emblemMat.opacity = e;
    kegelMat.uniforms.uAlpha.value = 0.5 * e;
    traeger.position.y = 0.26 + 0.2 * e + Math.sin(jetzt / 900) * 0.012 * e;
    traeger.rotation.y = Math.sin(jetzt / 2400) * 0.45;
    traeger.scale.setScalar(wenig ? 2.6 : 0.6 + 0.4 * e);
    // Etiketler
    setzeMarke(marken.ber, mBer.position.clone().setY(mBer.scale.y * 0.55), wenig ? 1 : weich(abschnitt(p, 0.03, 0.06)) * (1 - weich(abschnitt(p, AKT.flug, AKT.flug + 0.05))));
    setzeMarke(marken.ist, mIst.position.clone().setY(mIst.scale.y * 0.7), wenig ? 1 : weich(abschnitt(p, AKT.landung - 0.1, AKT.landung - 0.03)) * (1 - weich(abschnitt(p, AKT.transfer + 0.02, AKT.smile))));
    setzeMarke(marken.sisli, emblem.position.clone().setY(traeger.position.y + 0.2 * traeger.scale.y + 0.08), wenig ? 1 : e);
    // Metin ve ilerleme
    if (!wenig) {
      const s = p < AKT.flug ? 0 : p < AKT.landung ? 1 : p < AKT.transfer ? 2 : p < AKT.smile ? 3 : 4;
      if (s !== aktivSchritt) {
        aktivSchritt = s;
        schritte.forEach((li, i) => li.classList.toggle('ist-aktiv', i === s));
      }
      sektion.classList.toggle('ist-unterwegs', p > 0.035);
      if (balken) balken.style.transform = `scaleX(${p.toFixed(4)})`;
    }
    renderer.render(scene, kamera);
  };

  if (wenig) {
    // Hareketi azalt: tek, durağan genel bakış karesi (rota çizili, amblem görünür)
    zeichne(1, 0);
    sektion.classList.add('reise--bereit');
    return { renderer };
  }

  const messen = () => {
    const r = sektion.getBoundingClientRect();
    const lauf = r.height - innerHeight;
    pZiel = lauf > 0 ? klemme(-r.top / lauf) : 1;
  };
  if (fein) buehne.addEventListener('pointermove', e => {
    const r = buehne.getBoundingClientRect();
    zeiger.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    zeiger.y = ((e.clientY - r.top) / r.height) * 2 - 1;
  }, { passive: true });
  const schleife = jetzt => {
    raf = 0;
    if (!sichtbar || document.hidden) return;
    messen();
    pGlatt += (pZiel - pGlatt) * 0.085;
    if (Math.abs(pZiel - pGlatt) < 0.0004) pGlatt = pZiel;
    zeichne(pGlatt, jetzt);
    raf = requestAnimationFrame(schleife);
  };
  new IntersectionObserver(([e]) => {
    sichtbar = e.isIntersecting;
    if (sichtbar) {
      if (aufbauStart < 0) aufbauStart = performance.now();
      if (!raf) raf = requestAnimationFrame(schleife);
    }
  }, { rootMargin: '120px 0px' }).observe(buehne);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && sichtbar && !raf) raf = requestAnimationFrame(schleife); });
  messen();
  pGlatt = pZiel;
  sektion.classList.add('reise--bereit');
  // Test için: belirli bir ilerlemeyi hemen çiz
  sektion.reiseZeige = p => { pZiel = pGlatt = klemme(p); uAufbau.value = 1; aufbauStart = 0; zeichne(pGlatt, performance.now()); };
  return { renderer, scene, kamera };
}
