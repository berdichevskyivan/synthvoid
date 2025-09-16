import { useState, useRef } from 'react'
import { Canvas, useFrame, extend } from '@react-three/fiber'
import { OrbitControls, shaderMaterial } from '@react-three/drei'
import './App.css'
import pulseVertex from './shaders/pulseVertex.glsl?raw'
import pulseFragment from './shaders/pulseFragment.glsl?raw'
import spectrumVertex from './shaders/spectrumVertex.glsl?raw'
import spectrumFragment from './shaders/spectrumFragment.glsl?raw'
import FFT from 'fft.js';

// Create FFT instance once
const FFT_SIZE = 512;
const fft = new FFT(FFT_SIZE);
const out = fft.createComplexArray();
const spectrum = new Float32Array(FFT_SIZE); // to hold magnitudes

// define shader material
const CustomMaterial = shaderMaterial(
  { u_time: 0, u_audio: 0.0 }, // uniforms (new uniform u_audio)
  pulseVertex,
  pulseFragment
)
extend({ CustomMaterial })

const SpectrumMaterial = shaderMaterial(
  { u_time: 0, u_spectrum: new Float32Array(FFT_SIZE), u_energy: 0.0 }, // uniforms (new uniform u_spectrum. An array)
  spectrumVertex,
  spectrumFragment
)
extend({ SpectrumMaterial })

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

function SpectrumWavyPlane({ pos, spectrum, spectrumEnergy }) {
  const materialRef = useRef()
  const meshRef = useRef()

  useFrame((state, delta) => {
    if (materialRef.current) {
      materialRef.current.uniforms.u_time.value = state.clock.elapsedTime
      materialRef.current.uniforms.u_spectrum.value = spectrum.current; // live 
      materialRef.current.uniforms.u_energy.value = spectrumEnergy.current;
    }
    // if (meshRef.current) {
    //   meshRef.current.rotation.y += delta * 0.5
    // }
  })

  return (
    <mesh ref={meshRef} position={[pos.x, pos.y, pos.z]} >
      <sphereGeometry args={[5, 200, 200]} /> 
      <spectrumMaterial ref={materialRef} wireframe/>
    </mesh>
  )
}

function App() {

  const [currentMode, setCurrentMode] = useState('waveform'); // current states: waveform, spectrum
  const [isRecording, setIsRecording] = useState(false)
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const workletNodeRef = useRef(null);
  const latestAmplitude = useRef(0);
  const smoothedAmplitude = useRef(0);
  const latestSpectrum = useRef(new Float32Array(FFT_SIZE));
  const latestEnergy = useRef(0);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      streamRef.current = stream;
      audioContextRef.current = new AudioContext();

      await audioContextRef.current.audioWorklet.addModule('/processor.js');
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const gainNode = audioContextRef.current.createGain();
      gainNode.gain.value = 3.0; // <-- boost 3x (tweak this)

      workletNodeRef.current = new AudioWorkletNode(audioContextRef.current, 'audio-processor');
      source.connect(gainNode).connect(workletNodeRef.current).connect(audioContextRef.current.destination);

      workletNodeRef.current.port.onmessage = (event) => {
        const samples = event.data; // Float32Array

        if(currentMode === 'waveform'){
          // Amplitude-based Time Analysis with RMS (Root Mean Square)
          let sum = 0;
          for(let i = 0; i < samples.length; i++) {
            sum += samples[i] * samples[i]; //square
          }

          const rms = Math.sqrt(sum / samples.length); // root mean square amplitude
          console.log('RMS is: ', rms)

          // Smooth with lerp
          smoothedAmplitude.current = 0.9 * smoothedAmplitude.current + 0.1 * rms;
          latestAmplitude.current = rms; // save in a ref
          // === //
        }else if(currentMode === 'spectrum' && audioContextRef.current){
          // Frequency-based Analysis with Fast Fourier Transform (FFT)
          const realInput = new Array(FFT_SIZE).fill(0);
          for(let i = 0 ; i < Math.min(samples.length, FFT_SIZE); i++){
            realInput[i] = samples[i];
          }

          // Applying FFT
          fft.realTransform(out, realInput);
          fft.completeSpectrum(out);

          for (let i = 0; i < FFT_SIZE; i++) {
            const re = out[2 * i];
            const im = out[2 * i + 1];
            const mag = Math.sqrt(re * re + im * im);

            // apply smoothing
            spectrum[i] = 0.8 * spectrum[i] + 0.2 * mag;
          }

          // Example: take average of first 32 bins (bass)
          let energy = 0;
          const bandSize = 32;
          for (let i = 0; i < bandSize; i++) {
            energy += spectrum[i];
          }
          energy /= bandSize;

          // store it in a ref
          latestEnergy.current = energy;

          // after your FFT for-loop
          latestSpectrum.current.set(spectrum);

          // Logging out the spectrum
          console.log("spectrum", spectrum);
        }
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
        { currentMode === 'waveform' && (
          <WavyPlane pos={{ x: 0, y: 0, z: 0 }} amplitude={smoothedAmplitude}/>
        ) }
        { currentMode === 'spectrum' && (
          <SpectrumWavyPlane pos={{ x: 0, y: 0, z: 0 }} spectrum={latestSpectrum} spectrumEnergy={latestEnergy}/>
        ) }
        <OrbitControls />
      </Canvas>
      <div className="audio-controls">
        <button onClick={startRecording} disabled={isRecording}>
          Start Listening
        </button>
        <button onClick={stopRecording} disabled={!isRecording}>
          Stop Listening
        </button>
      </div>
      <div className="modes-container">
        <button onClick={() => {stopRecording(); setCurrentMode("waveform")}} className={currentMode === "waveform" ? "active-mode" : ""}>
          Waveform
        </button>
        <button onClick={() => {stopRecording(); setCurrentMode("spectrum")}} className={currentMode === "spectrum" ? "active-mode" : ""}>
          Spectrum
        </button>
      </div>
    </>
  )
}

export default App
