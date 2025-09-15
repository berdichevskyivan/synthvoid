class AudioProcessor extends AudioWorkletProcessor {
    process(inputs, outputs, parameters) {
        const input = inputs[0]
        if(input.length > 0){
            const channelData = input[0]; // Float32Array for channel 0

            // Send samples to the main thread
            this.port.postMessage(channelData.slice(0));
        }
        return true; // keep processor alive
    }
}

registerProcessor('audio-processor', AudioProcessor);