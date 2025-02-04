/**
 * Constellation plugin for WaveSurfer
 *
 * Draws constellation points and connections over the spectrogram by finding
 * peak frequencies that are robust against noise and distortion
 */

import EventEmitter from 'https://unpkg.com/wavesurfer.js@7/dist/event-emitter.js'

const defaultOptions = {
    // Minimum magnitude for a point to be considered a peak
    minPeakMagnitude: 0.3,
    
    // Size of neighborhood to check when finding peaks (higher = fewer peaks)
    neighborhoodSize: 3,
    
    // Maximum distance between peaks to draw connections
    maxDistance: 50,
    
    // Maximum time distance (in frames) between peaks to consider connecting
    maxTimeDistance: 30,
    
    // Target density of peaks per time-frequency region
    peakDensity: 0.2,
    
    // Peak drawing options
    peakColor: 'yellow',
    peakRadius: 2,
    
    // Connection drawing options
    connectionColor: 'rgba(255, 255, 0, 0.2)',
    connectionWidth: 1
}

class ConstellationPlugin extends EventEmitter {
    constructor(options = {}) {
        super()
        this.options = { ...defaultOptions, ...options }
        this.peaks = []
        this.canvas = null
        this.ctx = null
        this.wrapper = null
        this.isReady = false
        this.subscriptions = []
        this.name = 'constellation'
        this.frequencies = null
    }

    static create(options) {
        return new ConstellationPlugin(options)
    }

    _init(wavesurfer) {
        this.wavesurfer = wavesurfer
        if (!this.wavesurfer) {
            throw Error('WaveSurfer is not initialized')
        }

        // Subscribe to wavesurfer events
        this.subscriptions.push(
            this.wavesurfer.on('ready', () => {
                // Get the spectrogram container
                const spectrogramPlugin = this.wavesurfer.getActivePlugins()[0]
                if (!spectrogramPlugin) return

                this.wrapper = spectrogramPlugin.wrapper
                if (!this.wrapper) return

                this.createCanvas()
                this.isReady = true
                this.processAudioData()
            }),
            this.wavesurfer.on('redraw', () => this.redraw()),
            this.wavesurfer.on('destroy', () => this.clear())
        )

        // Also process on audioprocess to keep peaks in sync during playback
        this.wavesurfer.on('audioprocess', () => {
            if (this.isReady) {
                this.redraw()
            }
        })
    }

    createCanvas() {
        if (!this.wrapper) return

        // Create canvas overlay
        this.canvas = document.createElement('canvas')
        this.canvas.classList.add('constellation-overlay')
        
        // Match spectrogram dimensions
        const rect = this.wrapper.getBoundingClientRect()
        this.canvas.width = rect.width
        this.canvas.height = rect.height

        // Position absolutely over spectrogram
        this.canvas.style.position = 'absolute'
        this.canvas.style.top = '0'
        this.canvas.style.left = '0'
        this.canvas.style.width = '100%'
        this.canvas.style.height = '100%'
        this.canvas.style.pointerEvents = 'none'
        this.canvas.style.zIndex = '100' // Make sure it's above spectrogram

        this.ctx = this.canvas.getContext('2d')
        
        // Add canvas to wrapper
        this.wrapper.style.position = 'relative' // Ensure absolute positioning works
        this.wrapper.appendChild(this.canvas)

        console.log('Canvas created with:', {
            wrapper: {
                position: this.wrapper.style.position,
                width: this.wrapper.clientWidth,
                height: this.wrapper.clientHeight
            },
            canvas: {
                width: this.canvas.width,
                height: this.canvas.height,
                style: {
                    position: this.canvas.style.position,
                    top: this.canvas.style.top,
                    left: this.canvas.style.left,
                    zIndex: this.canvas.style.zIndex
                }
            }
        })
        
        // Handle canvas resizing
        this.resizeObserver = new ResizeObserver(() => {
            this.updateCanvasSize()
            this.redraw()
        })
        this.resizeObserver.observe(this.wrapper)
    }

    updateCanvasSize() {
        if (!this.wrapper || !this.canvas) return

        const rect = this.wrapper.getBoundingClientRect()
        const dpr = window.devicePixelRatio || 1
        
        this.canvas.width = rect.width * dpr
        this.canvas.height = rect.height * dpr
        this.ctx.scale(dpr, dpr)
    }

    processAudioData() {
        if (!this.isReady || !this.wavesurfer) return

        const decodedData = this.wavesurfer.getDecodedData()
        if (!decodedData) return

        // Get the spectrogram plugin
        const spectrogramPlugin = this.wavesurfer.getActivePlugins()[0]
        if (!spectrogramPlugin || !spectrogramPlugin.getFrequencies) return

        // Get raw frequency data from spectrogram plugin
        const frequencies = spectrogramPlugin.getFrequencies(decodedData)
        if (!frequencies || !frequencies.length) return

        // Get first channel's data (format is [channel][sample][frequency])
        const channelData = frequencies[0]
        
        console.log('Got frequencies:', {
            channels: frequencies.length,
            timeFrames: channelData.length,
            frequencyBins: channelData[0].length,
            sampleTimeSlice: channelData[0].slice(0, 5)
        })

        // Store frequencies for scaling in redraw
        this.frequencies = channelData

        this.findPeaks(channelData)
        this.redraw()
    }

    findPeaks(frequencies) {
        if (!frequencies || !frequencies.length) return

        const peaks = []
        const { minPeakMagnitude, neighborhoodSize, peakDensity } = this.options
        const timeNeighborhood = 2

        // Get the frequency data
        const freqData = frequencies
        const numTimeFrames = freqData.length
        const numFreqBins = freqData[0].length

        // Process entire time range in smaller chunks
        const chunkSize = Math.max(20, Math.floor(numTimeFrames * 0.1)) // Process 10% at a time
        for (let startFrame = 0; startFrame < numTimeFrames; startFrame += chunkSize) {
            const endFrame = Math.min(startFrame + chunkSize, numTimeFrames)
            
            // For each time slice in this chunk
            for (let timeIndex = startFrame; timeIndex < endFrame; timeIndex++) {
                if (timeIndex < timeNeighborhood || timeIndex >= numTimeFrames - timeNeighborhood) continue

                const localPeaks = []

                // For each frequency bin (except edges)
                for (let freqIndex = neighborhoodSize; freqIndex < numFreqBins - neighborhoodSize; freqIndex++) {
                    const magnitude = freqData[timeIndex][freqIndex] / 255

                    // Skip if magnitude is too low
                    if (magnitude < minPeakMagnitude) continue

                    // Check if it's a peak in both time and frequency
                    let isPeak = true
                    let isMaxInRegion = true

                    // Check frequency neighborhood
                    for (let f = -neighborhoodSize; f <= neighborhoodSize && isPeak; f++) {
                        if (f === 0) continue
                        const neighborMag = freqData[timeIndex][freqIndex + f] / 255
                        if (neighborMag > magnitude) {
                            isMaxInRegion = false
                            break
                        }
                    }

                    if (!isMaxInRegion) continue

                    // Check time neighborhood
                    for (let t = -timeNeighborhood; t <= timeNeighborhood && isPeak; t++) {
                        if (t === 0) continue
                        const neighborMag = freqData[timeIndex + t][freqIndex] / 255
                        if (neighborMag > magnitude) {
                            isPeak = false
                            break
                        }
                    }

                    if (isPeak && isMaxInRegion) {
                        localPeaks.push({
                            frequency: freqIndex,
                            magnitude: magnitude,
                            time: timeIndex
                        })
                    }
                }

                // Sort peaks by magnitude and keep top ones
                if (localPeaks.length > 0) {
                    localPeaks.sort((a, b) => b.magnitude - a.magnitude)
                    // Adjust number of peaks based on magnitude distribution
                    const strongPeaks = localPeaks.filter(p => p.magnitude > 0.8 * localPeaks[0].magnitude)
                    const numPeaksToKeep = Math.max(
                        1,
                        Math.min(
                            strongPeaks.length,
                            Math.floor(numFreqBins * peakDensity)
                        )
                    )
                    peaks.push(...localPeaks.slice(0, numPeaksToKeep))
                }
            }
        }

        if (peaks.length > 0) {
            console.log('Peak statistics:', {
                totalPeaks: peaks.length,
                timeRange: {
                    min: Math.min(...peaks.map(p => p.time)),
                    max: Math.max(...peaks.map(p => p.time))
                },
                freqRange: {
                    min: Math.min(...peaks.map(p => p.frequency)),
                    max: Math.max(...peaks.map(p => p.frequency))
                },
                samplePeaks: peaks.slice(0, 5).map(p => ({
                    time: `${p.time} (${(p.time / numTimeFrames * 100).toFixed(1)}%)`,
                    freq: `${p.frequency} (${(p.frequency / numFreqBins * 100).toFixed(1)}%)`,
                    magnitude: p.magnitude.toFixed(2)
                }))
            })
        }

        this.peaks = peaks
    }

    redraw() {
        if (!this.ctx || !this.canvas || !this.peaks || !this.peaks.length) return

        // Clear the canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
        
        const numTimeFrames = this.frequencies.length
        const numFreqBins = this.frequencies[0].length
        
        // Draw peaks
        this.ctx.fillStyle = this.options.peakColor
        this.peaks.forEach(peak => {
            // Scale coordinates to match spectrogram dimensions exactly
            const x = (peak.time / numTimeFrames) * this.canvas.width
            // Invert y-coordinate since canvas 0 is at top but frequency 0 is at bottom
            const y = (1 - peak.frequency / numFreqBins) * this.canvas.height

            this.ctx.beginPath()
            this.ctx.arc(x, y, this.options.peakRadius, 0, 2 * Math.PI)
            this.ctx.fill()
        })
    }

    clear() {
        // Clear canvas
        if (this.ctx && this.canvas) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
        }
        // Clear data
        this.peaks = []
        this.frequencies = null
        this.isReady = false
    }
}

export default ConstellationPlugin