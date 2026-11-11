import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { CameraControls, Html, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { live, STATUS_COLOR, effectiveStatus } from '../store';

const MODEL = '/models/ieee123_city.glb';
const GROUPS = new Set(['Buses', 'Junctions', 'Capacitors', 'Driveways']);   // parent nodes in the GLB
const TINT = /^(House_|Commercial|Substation)/;                              // materials that get the voltage glow
const OVERVIEW = { pos: [0, 430, 480], target: [0, 0, 0] };

function City({ selectedId, hoveredId, onSelect, onHover, heatmap, controls, buses }) {
  const { scene } = useGLTF(MODEL);
  const tmp = useMemo(() => new THREE.Color(), []);
  const ringMat = useRef();
  const ringRef = useRef();

  // Index the GLB once: which Object3D belongs to which bus, with per-house cloned materials
  const index = useMemo(() => {
    scene.updateMatrixWorld(true);
    const pick = new Map(), houses = new Map();
    scene.traverse((o) => {
      const m = /^(Bus|Junction|Capacitor|Driveway)_(\d+)$/.exec(o.name);
      if (!m || !o.parent || !GROUPS.has(o.parent.name)) return;
      const id = +m[2];
      pick.set(o, id);
      if (m[1] !== 'Bus') return;
      const meshes = [];
      o.traverse((c) => {
        if (!c.isMesh) return;
        c.material = c.material.clone();
        c.userData.tint = TINT.test(c.material.name);
        meshes.push(c);
      });
      const box = new THREE.Box3().setFromObject(o);
      houses.set(id, { meshes, center: box.getCenter(new THREE.Vector3()), size: box.getSize(new THREE.Vector3()) });
    });
    return { pick, houses };
  }, [scene]);

  const busIdFrom = (obj) => { for (let o = obj; o; o = o.parent) if (index.pick.has(o)) return index.pick.get(o); return null; };

  // Smooth camera focus on selection (or back to the overview)
  useEffect(() => {
    const c = controls.current; if (!c) return;
    const h = index.houses.get(selectedId);
    if (h) {
      const d = Math.max(h.size.x, h.size.z) * 1.2 + 26;
      c.setLookAt(h.center.x + d * 0.9, h.size.y + d * 0.55, h.center.z + d * 0.9, h.center.x, h.size.y * 0.5, h.center.z, true);
    } else c.setLookAt(...OVERVIEW.pos, ...OVERVIEW.target, true);
  }, [selectedId, index, controls]);

  // Voltage glow on every house + pulsing ring on the selected one
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (const [id, h] of index.houses) {
      const s = effectiveStatus(live.buses.get(id));
      let k = heatmap && s !== 3 ? 0.38 : 0;
      if (id === hoveredId) k += 0.25;
      if (id === selectedId) k = 0.55 + 0.25 * Math.sin(t * 4);
      tmp.set(STATUS_COLOR[s]);
      for (const m of h.meshes) {
        if (!m.userData.tint) continue;
        m.material.emissive.copy(tmp);
        m.material.emissiveIntensity = k;
      }
      if (id === selectedId && ringMat.current) {
        ringMat.current.color.copy(tmp);
        const sc = 1 + 0.06 * Math.sin(t * 4); ringRef.current.scale.set(sc, sc, sc);
      }
    }
  });

  const sel = index.houses.get(selectedId), hov = index.houses.get(hoveredId);
  const ringR = sel ? Math.max(sel.size.x, sel.size.z) * 0.8 + 4 : 0;
  const nameOf = (id) => buses.get(id)?.name ?? `Bus ${id}`;

  return (
    <>
      <primitive
        object={scene}
        onClick={(e) => {
          if (e.delta > 4) return;                    // it was a drag (orbit), not a click
          e.stopPropagation();
          onSelect(busIdFrom(e.object));              // null when ground/road → deselect
        }}
        onPointerOver={(e) => { const id = busIdFrom(e.object); if (id != null) { e.stopPropagation(); onHover(id); document.body.style.cursor = 'pointer'; } }}
        onPointerOut={() => { onHover(null); document.body.style.cursor = 'auto'; }}
      />
      {sel && (
        <group position={[sel.center.x, 0.45, sel.center.z]}>
          <mesh ref={ringRef} rotation-x={-Math.PI / 2}>
            <ringGeometry args={[ringR, ringR + 1.3, 64]} />
            <meshBasicMaterial ref={ringMat} transparent opacity={0.9} side={THREE.DoubleSide} />
          </mesh>
          <Html position={[0, sel.size.y + 10, 0]} center style={{ pointerEvents: 'none' }}>
            <div className="tag tag-sel">{nameOf(selectedId)}</div>
          </Html>
        </group>
      )}
      {hov && hoveredId !== selectedId && (
        <Html position={[hov.center.x, hov.size.y + 8, hov.center.z]} center style={{ pointerEvents: 'none' }}>
          <div className="tag">{nameOf(hoveredId)}</div>
        </Html>
      )}
    </>
  );
}

export default function CityScene({ selectedId, onSelect, heatmap, buses }) {
  const controls = useRef();
  const [hoveredId, setHoveredId] = useState(null);
  return (
    <Canvas camera={{ position: OVERVIEW.pos, fov: 45, near: 0.5, far: 6000 }} dpr={[1, 2]}>
      <color attach="background" args={['#0b1220']} />
      <fog attach="fog" args={['#0b1220', 700, 2600]} />
      <ambientLight intensity={0.75} />
      <hemisphereLight args={['#bcd7ff', '#26331f', 0.55]} />
      <directionalLight position={[250, 420, 180]} intensity={1.6} />
      <CameraControls ref={controls} makeDefault minDistance={8} maxDistance={1100} maxPolarAngle={Math.PI / 2.05} smoothTime={0.35} dollyToCursor />
      <Suspense fallback={<Html center><div className="tag">Loading city…</div></Html>}>
        <City {...{ selectedId, hoveredId, onSelect, heatmap, controls, buses }} onHover={setHoveredId} />
      </Suspense>
    </Canvas>
  );
}
useGLTF.preload(MODEL);
