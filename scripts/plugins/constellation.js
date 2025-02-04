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
        const { minPeakMagnitude } = this.options
        
        // Get the frequency data
        const freqData = frequencies
        const numTimeFrames = freqData.length
        const numFreqBins = freqData[0].length

        // Calculate global statistics for adaptive thresholding
        let maxMagnitude = 0
        let totalMagnitude = 0
        let magnitudeCount = 0

        for (let timeIndex = 0; timeIndex < numTimeFrames; timeIndex++) {
            for (let freqIndex = 0; freqIndex < numFreqBins; freqIndex++) {
                const magnitude = freqData[timeIndex][freqIndex] / 255
                if (magnitude > maxMagnitude) maxMagnitude = magnitude
                totalMagnitude += magnitude
                magnitudeCount++
            }
        }

        const avgMagnitude = totalMagnitude / magnitudeCount
        const dynamicMinMagnitude = Math.max(minPeakMagnitude, avgMagnitude * 1.2)

        // Adjust region size based on audio content
        const energyLevel = avgMagnitude / maxMagnitude
        const baseRegionSize = 8
        const minRegions = 20
        const maxRegions = 40
        const timeRegions = Math.max(minRegions, Math.min(maxRegions, Math.floor(baseRegionSize / energyLevel)))
        const freqRegions = Math.max(minRegions, Math.min(maxRegions, Math.floor(baseRegionSize / energyLevel)))
        
        const timeRegionSize = Math.floor(numTimeFrames / timeRegions)
        const freqRegionSize = Math.floor(numFreqBins / freqRegions)

        // For each region
        for (let timeRegion = 0; timeRegion < timeRegions; timeRegion++) {
            for (let freqRegion = 0; freqRegion < freqRegions; freqRegion++) {
                const timeStart = timeRegion * timeRegionSize
                const timeEnd = Math.min((timeRegion + 1) * timeRegionSize, numTimeFrames)
                const freqStart = freqRegion * freqRegionSize
                const freqEnd = Math.min((freqRegion + 1) * freqRegionSize, numFreqBins)

                let maxMagnitude = 0
                let maxPeak = null
                let regionAvgMagnitude = 0
                let regionCount = 0

                // First pass: calculate region statistics
                for (let timeIndex = timeStart; timeIndex < timeEnd; timeIndex++) {
                    for (let freqIndex = freqStart; freqIndex < freqEnd; freqIndex++) {
                        const magnitude = freqData[timeIndex][freqIndex] / 255
                        regionAvgMagnitude += magnitude
                        regionCount++
                    }
                }
                regionAvgMagnitude /= regionCount

                // Only process region if it has significant energy
                if (regionAvgMagnitude > dynamicMinMagnitude * 0.3) {
                    // Second pass: find peaks
                    for (let timeIndex = timeStart; timeIndex < timeEnd; timeIndex++) {
                        for (let freqIndex = freqStart; freqIndex < freqEnd; freqIndex++) {
                            const magnitude = freqData[timeIndex][freqIndex] / 255

                            // Skip if magnitude is too low relative to both global and local thresholds
                            if (magnitude < dynamicMinMagnitude || magnitude < regionAvgMagnitude * 1.1) continue

                            // Check if it's higher than ALL neighbors in a small window
                            let isHighest = true
                            for (let t = -2; t <= 2 && isHighest; t++) {
                                for (let f = -2; f <= 2 && isHighest; f++) {
                                    if (t === 0 && f === 0) continue
                                    
                                    const neighborTime = timeIndex + t
                                    const neighborFreq = freqIndex + f
                                    
                                    if (neighborTime >= 0 && neighborTime < numTimeFrames && 
                                        neighborFreq >= 0 && neighborFreq < numFreqBins) {
                                        const neighborMag = freqData[neighborTime][neighborFreq] / 255
                                        if (neighborMag >= magnitude) {
                                            isHighest = false
                                            break
                                        }
                                    }
                                }
                            }

                            if (isHighest && magnitude > maxMagnitude) {
                                maxMagnitude = magnitude
                                maxPeak = {
                                    frequency: freqIndex,
                                    magnitude: magnitude,
                                    time: timeIndex
                                }
                            }
                        }
                    }

                    // Add the highest peak from this region if we found one
                    if (maxPeak) {
                        peaks.push(maxPeak)
                    }
                }
            }
        }

        if (peaks.length > 0) {
            console.log('Peak statistics:', {
                totalPeaks: peaks.length,
                timeRegions,
                freqRegions,
                avgMagnitude: avgMagnitude.toFixed(3),
                dynamicMinMagnitude: dynamicMinMagnitude.toFixed(3),
                timeRange: {
                    min: Math.min(...peaks.map(p => p.time)),
                    max: Math.max(...peaks.map(p => p.time))
                },
                freqRange: {
                    min: Math.min(...peaks.map(p => p.frequency)),
                    max: Math.max(...peaks.map(p => p.frequency))
                }
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