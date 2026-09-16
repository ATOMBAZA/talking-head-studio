import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, OrbitControls, ContactShadows } from '@react-three/drei'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as THREE from 'three'

const PRESETS = [
  { id: 'brunette', name: 'Brunette (TalkingHead)', url: 'https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@main/avatars/brunette.glb' },
  { id: 'avaturn', name: 'Avaturn', url: 'https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@main/avatars/avaturn.glb' },
  { id: 'vroid', name: 'VRoid', url: 'https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@main/avatars/vroid.glb' },
  { id: 'facecap', name: 'FaceCap head', url: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/models/gltf/facecap.glb' }
]

const MOODS = {
  idle: { smile: 0.08, brow: 0.05 },
  listen: { smile: 0.02, brow: 0.18 },
  talk: { smile: 0.12, brow: 0.1 },
  happy: { smile: 0.45, brow: 0.2 },
  serious: { smile: 0, brow: 0.28 }
}

const MOUTH_KEYS = ['jawOpen','mouthOpen','viseme_aa','viseme_E','viseme_O','viseme_I','viseme_U','viseme_PP','mouthFunnel','mouthPucker']
const SMILE_KEYS = ['mouthSmileLeft','mouthSmileRight','mouthSmile']
const BLINK_KEYS = ['eyeBlinkLeft','eyeBlinkRight','eyesClosed']
const BROW_KEYS = ['browInnerUp','browOuterUpLeft','browOuterUpRight']

function collectMorphs(root) {
  const meshes = []
  root.traverse((obj) => {
    if (obj.isMesh && obj.morphTargetDictionary && obj.morphTargetInfluences) {
      meshes.push({ dict: obj.morphTargetDictionary, influences: obj.morphTargetInfluences, names: Object.keys(obj.morphTargetDictionary) })
    }
  })
  return meshes
}
function setNamed(meshes, names, value) {
  for (const m of meshes) {
    for (const name of names) {
      const idx = m.dict[name]
      if (idx !== undefined) m.influences[idx] = value
    }
  }
}

function Avatar({ url, behavior, manual, speakingRef, ampRef, onMorphs }) {
  const group = useRef()
  const [scene, setScene] = useState(null)
  const morphsRef = useRef([])
  const blinkT = useRef(2 + Math.random() * 3)
  useEffect(() => {
    let cancelled = false
    const loader = new GLTFLoader()
    loader.load(url, (gltf) => {
      if (cancelled) return
      const root = gltf.scene
      root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
      const box = new THREE.Box3().setFromObject(root)
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      root.position.sub(center)
      root.scale.setScalar(1.6 / Math.max(size.y, 0.001))
      morphsRef.current = collectMorphs(root)
      onMorphs([...new Set(morphsRef.current.flatMap((m) => m.names))].sort())
      setScene(root)
    }, undefined, () => { if (!cancelled) setScene(null) })
    return () => { cancelled = true }
  }, [url, onMorphs])
  useFrame((_, dt) => {
    const meshes = morphsRef.current
    if (!meshes.length) return
    const mood = MOODS[behavior.mood] || MOODS.idle
    blinkT.current -= dt
    let blink = 0
    if (behavior.autoBlink) {
      if (blinkT.current < 0.12) blink = 1 - Math.abs(blinkT.current - 0.06) / 0.06
      if (blinkT.current < 0) blinkT.current = 2.2 + Math.random() * 3.4
    }
    const talking = speakingRef.current
    const amp = talking ? Math.min(1, ampRef.current) : 0
    const jaw = talking ? Math.min(1, behavior.mouthGain * (0.18 + amp * 0.82)) : 0.02 * behavior.idleMotion
    setNamed(meshes, MOUTH_KEYS, jaw)
    setNamed(meshes, SMILE_KEYS, mood.smile * behavior.expression)
    setNamed(meshes, BLINK_KEYS, blink)
    setNamed(meshes, BROW_KEYS, mood.brow * behavior.expression)
    for (const [name, val] of Object.entries(manual)) setNamed(meshes, [name], Number(val) || 0)
    if (group.current) {
      const t = performance.now() / 1000
      group.current.rotation.y = Math.sin(t * 0.35) * 0.06 * behavior.idleMotion
      group.current.position.y = Math.sin(t * 1.1) * 0.015 * behavior.idleMotion
    }
  })
  if (!scene) return null
  return <primitive ref={group} object={scene} />
}

export default function App() {
  const [presetId, setPresetId] = useState('brunette')
  const [customUrl, setCustomUrl] = useState('')
  const [fileUrl, setFileUrl] = useState('')
  const [morphNames, setMorphNames] = useState([])
  const [manual, setManual] = useState({})
  const [phrase, setPhrase] = useState('Hello. I am the live service avatar.')
  const [voices, setVoices] = useState([])
  const [voiceURI, setVoiceURI] = useState('')
  const [status, setStatus] = useState('Loading')
  const [behavior, setBehavior] = useState({ mood: 'idle', expression: 1, mouthGain: 1, idleMotion: 1, autoBlink: true, rate: 1, pitch: 1 })
  const speakingRef = useRef(false)
  const ampRef = useRef(0)
  const modelUrl = fileUrl || customUrl.trim() || PRESETS.find((p) => p.id === presetId).url
  useEffect(() => {
    const load = () => {
      const list = speechSynthesis.getVoices()
      setVoices(list)
      if (!voiceURI && list.length) {
        const ru = list.find((v) => v.lang.toLowerCase().startsWith('ru'))
        setVoiceURI((ru || list[0]).voiceURI)
      }
    }
    load()
    speechSynthesis.addEventListener('voiceschanged', load)
    return () => speechSynthesis.removeEventListener('voiceschanged', load)
  }, [voiceURI])
  useEffect(() => { setStatus(modelUrl.split('/').pop()); setManual({}) }, [modelUrl])
  const speak = () => {
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(phrase)
    const voice = voices.find((v) => v.voiceURI === voiceURI)
    if (voice) u.voice = voice
    u.rate = behavior.rate
    u.pitch = behavior.pitch
    u.onstart = () => { speakingRef.current = true; setBehavior((b) => ({ ...b, mood: 'talk' })) }
    u.onend = () => { speakingRef.current = false; ampRef.current = 0; setBehavior((b) => ({ ...b, mood: 'idle' })) }
    speechSynthesis.speak(u)
    let t = 0
    const tick = () => {
      if (!speakingRef.current) return
      t += 0.05
      ampRef.current = 0.35 + 0.65 * Math.abs(Math.sin(t * 7.5))
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }
  const morphPreview = useMemo(() => morphNames.slice(0, 40), [morphNames])
  return (
    <div className="app">
      <div className="stage">
        <Canvas camera={{ position: [0, 0.15, 2.1], fov: 32 }} shadows>
          <color attach="background" args={['#0b0d12']} />
          <ambientLight intensity={0.55} />
          <directionalLight position={[2.4, 3, 2]} intensity={1.35} castShadow />
          <Suspense fallback={null}>
            <Avatar url={modelUrl} behavior={behavior} manual={manual} speakingRef={speakingRef} ampRef={ampRef} onMorphs={setMorphNames} />
            <Environment preset="city" />
          </Suspense>
          <ContactShadows position={[0, -0.85, 0]} opacity={0.35} scale={4} />
          <OrbitControls enablePan={false} minDistance={1.2} maxDistance={4} />
        </Canvas>
      </div>
      <aside className="panel">
        <div className="section">
          <h2>Model</h2>
          <div className="pills">{PRESETS.map((p) => <button key={p.id} className={`pill ${presetId===p.id && !fileUrl && !customUrl ? 'active':''}`} onClick={() => { setPresetId(p.id); setFileUrl(''); setCustomUrl('') }}>{p.name}</button>)}</div>
          <input type="text" value={customUrl} onChange={(e)=>{setCustomUrl(e.target.value); setFileUrl('')}} placeholder="https://...glb" />
          <input type="file" accept=".glb,.gltf" onChange={(e)=>{ const f=e.target.files?.[0]; if(f){ if(fileUrl) URL.revokeObjectURL(fileUrl); setFileUrl(URL.createObjectURL(f)) } }} />
          <p className="status">{status} morphs:{morphNames.length}</p>
        </div>
        <div className="section">
          <h2>Behavior</h2>
          <div className="pills">{Object.keys(MOODS).map((m)=><button key={m} className={`pill ${behavior.mood===m?'active':''}`} onClick={()=>setBehavior(b=>({...b,mood:m}))}>{m}</button>)}</div>
          <input type="range" min="0" max="1.5" step="0.01" value={behavior.expression} onChange={(e)=>setBehavior(b=>({...b,expression:+e.target.value}))} />
          <input type="range" min="0" max="2" step="0.01" value={behavior.mouthGain} onChange={(e)=>setBehavior(b=>({...b,mouthGain:+e.target.value}))} />
          <input type="range" min="0" max="2" step="0.01" value={behavior.idleMotion} onChange={(e)=>setBehavior(b=>({...b,idleMotion:+e.target.value}))} />
        </div>
        <div className="section">
          <h2>Speech</h2>
          <textarea value={phrase} onChange={(e)=>setPhrase(e.target.value)} />
          <select value={voiceURI} onChange={(e)=>setVoiceURI(e.target.value)}>{voices.map(v=><option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)}</select>
          <button className="primary" onClick={speak}>Speak</button>
          <button onClick={()=>{speechSynthesis.cancel(); speakingRef.current=false}} >Stop</button>
        </div>
        <div className="section">
          <h2>Face</h2>
          <div className="morphs">{morphPreview.map(name=>(<div className="morph-row" key={name}><span>{name}</span><input type="range" min="0" max="1" step="0.01" value={manual[name]??0} onChange={(e)=>setManual(m=>({...m,[name]:+e.target.value}))} /></div>))}</div>
        </div>
      </aside>
    </div>
  )
}
