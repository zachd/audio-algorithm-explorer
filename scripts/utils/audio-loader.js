/**
 * Audio loader class for handling audio file loading and processing
 */
export class AudioLoader {
    constructor() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.audioBuffer = null;
        this.source = null;
        this.startTime = 0;
        this.offset = 0;
        this.isLoaded = false;
    }

    /**
     * Loads and decodes an audio file
     * @param {string} url - URL of the audio file to load
     * @returns {Promise<AudioBuffer>} Decoded audio data
     */
    async loadAudio(url) {
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            this.isLoaded = true;
            return this.audioBuffer;
        } catch (error) {
            console.error('Error loading audio:', error);
            throw error;
        }
    }

    /**
     * Get waveform data from the audio buffer
     * @returns {Float32Array} Waveform data
     */
    getWaveformData() {
        if (!this.isLoaded) {
            throw new Error('Audio not loaded');
        }

        // Get the raw audio data
        const rawData = this.audioBuffer.getChannelData(0);
        
        // Calculate how many samples we want to keep
        const sampleSize = Math.floor(rawData.length / 1000);
        const samples = new Float32Array(1000);
        
        // For each sample, find the peak amplitude
        for (let i = 0; i < 1000; i++) {
            const start = i * sampleSize;
            const end = start + sampleSize;
            let max = 0;
            
            for (let j = start; j < end; j++) {
                const amplitude = Math.abs(rawData[j]);
                if (amplitude > max) {
                    max = amplitude;
                }
            }
            
            samples[i] = max;
        }
        
        return samples;
    }

    /**
     * Get raw audio data for spectral analysis
     * @returns {Float32Array} Raw audio data
     */
    getAudioData() {
        if (!this.isLoaded) {
            throw new Error('Audio not loaded');
        }
        
        // Get the raw audio data from the first channel
        return this.audioBuffer.getChannelData(0);
    }

    /**
     * Play the audio from current offset
     */
    play() {
        if (!this.isLoaded) return;
        
        // Create new source (required for each play)
        this.source = this.audioContext.createBufferSource();
        this.source.buffer = this.audioBuffer;
        this.source.connect(this.audioContext.destination);
        
        // Start playback from offset
        this.startTime = this.audioContext.currentTime;
        this.source.start(0, this.offset);
    }

    /**
     * Pause the audio
     */
    pause() {
        if (this.source) {
            this.source.stop();
            this.offset = this.getCurrentTime();
            this.source = null;
        }
    }

    /**
     * Seek to a specific time
     * @param {number} time - Time in seconds to seek to
     */
    seek(time) {
        const wasPlaying = this.source !== null;
        
        if (wasPlaying) {
            this.source.stop();
            this.source = null;
        }
        
        this.offset = Math.max(0, Math.min(time, this.getDuration()));
        
        if (wasPlaying) {
            this.play();
        }
    }

    /**
     * Get current playback time
     * @returns {number} Current time in seconds
     */
    getCurrentTime() {
        if (!this.isLoaded) return 0;
        if (!this.source) return this.offset;
        
        const elapsed = this.audioContext.currentTime - this.startTime;
        return Math.min(this.offset + elapsed, this.getDuration());
    }

    /**
     * Get the duration of the audio in seconds
     * @returns {number} Duration in seconds
     */
    getDuration() {
        return this.audioBuffer ? this.audioBuffer.duration : 0;
    }

    /**
     * Clean up resources
     */
    dispose() {
        if (this.source) {
            this.source.stop();
        }
        if (this.audioContext) {
            this.audioContext.close();
        }
    }
}
