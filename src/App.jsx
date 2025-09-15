import { useState, useRef } from 'react'
import { Canvas, useFrame, extend } from '@react-three/fiber'
import { OrbitControls, shaderMaterial } from '@react-three/drei'
import './App.css'
import pulseVertex from './shaders/pulseVertex.glsl?raw'
import pulseFragment from './shaders/pulseFragment.glsl?raw'

// define shader material
const CustomMaterial = shaderMaterial(
  { u_time: 0, u_audio: 0.0 }, // uniforms (new uniform u_audio)
  pulseVertex,
  pulseFragment
)
extend({ CustomMaterial })

function WavyPlane({ pos, amplitude }) {
  const materialRef = useRef()
  const meshRef = useRef()

  useFrame((state, delta) => {
    if (materialRef.current) {
      materialRef.current.uniforms.u_time.value = state.clock.elapsedTime
      materialRef.current.uniforms.u_audio.value = amplitude.current; // live audio
    }
    // if (meshRef.current) {
    //   meshRef.current.rotation.y += delta * 0.6 // slow spin on Y
    //   meshRef.current.rotation.x += delta * 0.05 // optional tilt
    // }
  })

  return (
    <mesh ref={meshRef} position={[pos.x, pos.y, pos.z]} >
      <planeGeometry args={[5, 5, 200, 200]} />
      <customMaterial ref={materialRef} wireframe/>
    </mesh>
  )
}

function App() {

  const [isRecording, setIsRecording] = useState(false)
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const workletNodeRef = useRef(null);
  const latestAmplitude = useRef(0);
  const smoothedAmplitude = useRef(0);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioContextRef.current = new AudioContext();

      await audioContextRef.current.audioWorklet.addModule('/processor.js');
      const source = audioContextRef.current.createMediaStreamSource(stream);

      workletNodeRef.current = new AudioWorkletNode(audioContextRef.current, 'audio-processor');
      source.connect(workletNodeRef.current).connect(audioContextRef.current.destination);

      workletNodeRef.current.port.onmessage = (event) => {
        const samples = event.data; // Float32Array

        let sum = 0;
        for(let i = 0; i < samples.length; i++) {
          sum += samples[i] * samples[i]; //square
        }

        const rms = Math.sqrt(sum / samples.length); // root mean square amplitude
        console.log('RMS is: ', rms)

        // Smooth with lerp
        smoothedAmplitude.current = 0.9 * smoothedAmplitude.current + 0.1 * rms;
        latestAmplitude.current = rms; // save in a ref
      };

      setIsRecording(true);
    } catch (err) {
      console.error('Error accessing mic:', err);
    }
  };

  const stopRecording = () => {
    setIsRecording(false);

    // stop the audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // stop all tracks on the stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // disconnect the node
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
  };

  return (
    <>
      <Canvas camera={{ position: [0, 0, 5], fov: 70 }}>
        <ambientLight intensity={0.5} />
        <WavyPlane pos={{ x: 0, y: 0, z: 0 }} amplitude={smoothedAmplitude}/>
        <OrbitControls />
      </Canvas>
      <div className="audio-controls">
        <button onClick={startRecording} disabled={isRecording}>
          Start Recording
        </button>
        <button onClick={stopRecording} disabled={!isRecording}>
          Stop Recording
        </button>
      </div>
    </>
  )
}

export default App
