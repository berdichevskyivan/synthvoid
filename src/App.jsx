import { useState, useRef } from 'react'
import { Canvas, useFrame, extend } from '@react-three/fiber'
import { OrbitControls, shaderMaterial, PerspectiveCamera } from '@react-three/drei'
import './App.css'
import pulseVertex from './shaders/pulseVertex.glsl?raw'
import pulseFragment from './shaders/pulseFragment.glsl?raw'
import spectrumVertex from './shaders/spectrumVertex.glsl?raw'
import spectrumFragment from './shaders/spectrumFragment.glsl?raw'
import FFT from 'fft.js';
import * as THREE from 'three'

// Create FFT instance once
const FFT_SIZE = 1024;
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
  { u_time: 0, u_spectrum: new Float32Array(64) }, // uniforms (new uniform u_spectrum. An array)
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
      <planeGeometry args={[5, 5, 100, 100]} />
      <customMaterial ref={materialRef} wireframe/>
    </mesh>
  )
}

function SpectrumWavyPlane({ pos, spectrum }) {
  const materialRef = useRef()
  const meshRef = useRef()

  useFrame((state, delta) => {
    if (materialRef.current && spectrum) {
      materialRef.current.uniforms.u_time.value = state.clock.elapsedTime
      materialRef.current.uniforms.u_spectrum.value = spectrum.current;
    }
    // if (meshRef.current) {
    //   meshRef.current.rotation.y += delta * 0.5
    // }
  })

  return (
    <mesh ref={meshRef} position={[pos.x, pos.y, pos.z]} >
      <sphereGeometry args={[1, 25, 25]} /> 
      <spectrumMaterial ref={materialRef} wireframe/>
    </mesh>
  )
}

// Converts frequency (Hz) into an FFT Bin index
function frequencyToBinIndex(frequency, sampleRate, fftSize){
  return Math.floor((frequency / sampleRate) * fftSize);
}

const SAMPLE_RATE = 44100;
const NUM_BANDS = 32;
const MIN_FREQUENCY = 20;
const MAX_FREQUENCY = SAMPLE_RATE / 2; // Nyquist = Sample Rate / 2

const logEdges = [];
for(let i = 0; i <= NUM_BANDS; i++){
  const ratio = i / NUM_BANDS; // goes 0 -> 1
  const frequency = MIN_FREQUENCY * Math.pow(MAX_FREQUENCY / MIN_FREQUENCY, ratio);
  logEdges.push(frequencyToBinIndex(frequency, SAMPLE_RATE, FFT_SIZE))
}

function App() {

  const [currentMode, setCurrentMode] = useState('waveform'); // current states: waveform, spectrum
  const [isRecording, setIsRecording] = useState(false);
  const [gainValue, setGainValue] = useState(3.0);
  const gainNodeRef = useRef(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const workletNodeRef = useRef(null);
  const latestAmplitude = useRef(0);
  const smoothedAmplitude = useRef(0);
  const latestSpectrum = useRef(new Float32Array(FFT_SIZE));
  const buckets = Array.from({ length: NUM_BANDS }, () => useRef(new Float32Array(FFT_SIZE)));

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
      gainNode.gain.value = gainValue; // use state
      gainNodeRef.current = gainNode;

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

          latestSpectrum.current.set(spectrum);

          // Now we should slice the spectrum logarithmically
          for(let i = 0; i < NUM_BANDS; i++){
            const start = logEdges[i];
            const end = logEdges[i + 1];
            buckets[i].current = spectrum.slice(start, end);
          }
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

  const CAMERA_WAVEFORM_DISTANCE = 4;   // closer = plane fills screen
  const CAMERA_SPECTRUM_DISTANCE = NUM_BANDS * 0.5 + 20;  // farther out to fit spheres

  return (
    <>
      <Canvas>
        <PerspectiveCamera
          makeDefault
          fov={70}
          position={[
            0,
            currentMode === 'spectrum' ? -NUM_BANDS : 0,
            currentMode === 'spectrum'
              ? CAMERA_SPECTRUM_DISTANCE
              : CAMERA_WAVEFORM_DISTANCE
          ]}
        />
        <ambientLight intensity={0.5} />
        { currentMode === 'waveform' && (
          <WavyPlane pos={{ x: 0, y: 0, z: 0 }} amplitude={smoothedAmplitude}/>
        ) }
        {/* From 512 channels, we can subdivide in 4 bands of 128 channels, representing the various frequency buckets */}
        { currentMode === 'spectrum' && latestSpectrum.current && (
          <>
            {buckets.map((bucket, index) => (
              <SpectrumWavyPlane 
                key={index}
                pos={{ x: 0, y: (NUM_BANDS / 2 - index) * 2, z: 0 }}
                spectrum={bucket}
              />
            ))}
          </>
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
        <div className="gain-control">
          <label>Gain: {gainValue.toFixed(1)}x</label>
          <input
            type="range"
            min="1"
            max="10"
            step="0.1"
            value={gainValue}
            onChange={(e) => {
              const newValue = parseFloat(e.target.value);
              setGainValue(newValue);
              if (gainNodeRef.current) {
                gainNodeRef.current.gain.value = newValue;
              }
            }}
          />
        </div>
      </div>
    </>
  )
}

export default App
