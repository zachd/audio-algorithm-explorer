// Audio Context and source
let audioContext = null;
let analyser = null;
let gainNode = null;
let audioBuffer = null;
let source = null;
let startTime = 0;
let isPlaying = false;
let preloadedWaveform = null;
let currentSource = null;
let animationFrameId = null;

// Spectrogram state
let rawSpectrogramBuffer = [];
let spectrogramCanvas = null;
let spectrogramCtx = null;
let lastThresholdUpdate = 0;
let maxSpectrogramSamples = 0;
const THRESHOLD_UPDATE_INTERVAL = 50;

// Initialize canvas for visualization
function initCanvas(canvas) {
    if (!canvas) return null;
    
    const ctx = canvas.getContext('2d', { alpha: false });
    const wrapper = canvas.closest('.visualization-wrapper');
    const rect = wrapper.getBoundingClientRect();
    
    // Set actual size in memory (use wrapper size)
    canvas.width = rect.width;
    canvas.height = rect.height;
    
    // Set display size
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    
    // Make sure canvas fills wrapper
    canvas.style.display = 'block';
    
    return ctx;
}

// Create or get grid canvas for spectrogram
function getSpectrogramGridCanvas(container) {
    let gridCanvas = container.querySelector('.spectrogram-grid');
    if (!gridCanvas) {
        gridCanvas = document.createElement('canvas');
        gridCanvas.className = 'spectrogram-grid';
        gridCanvas.style.position = 'absolute';
        gridCanvas.style.top = '0';
        gridCanvas.style.left = '0';
        gridCanvas.style.width = '100%';
        gridCanvas.style.height = '100%';
        gridCanvas.style.pointerEvents = 'none';
        container.appendChild(gridCanvas);
        initCanvas(gridCanvas);
    }
    return gridCanvas;
}

// Update canvas dimensions on resize
window.addEventListener('resize', () => {
    document.querySelectorAll('.visualization-wrapper canvas').forEach(canvas => {
        const ctx = initCanvas(canvas);
        if (ctx) {
            const displayWidth = canvas.width;
            const displayHeight = canvas.height;
            
            // Re-render the appropriate visualization
            const index = Array.from(canvas.parentNode.children).indexOf(canvas);
            switch(index) {
                case 0:
                    renderWaveform(ctx, displayWidth, displayHeight);
                    break;
                case 1:
                    renderSpectrum(ctx, displayWidth, displayHeight);
                    break;
                case 2:
                    renderSpectrogram(ctx, displayWidth, displayHeight);
                    break;
            }
        }
    });
});

// Initialize audio context and nodes
async function initAudio() {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    gainNode = audioContext.createGain();
    
    // Configure analyser
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.85;
    
    // Calculate max spectrogram samples (5 seconds of history)
    maxSpectrogramSamples = Math.ceil((audioContext.sampleRate / analyser.fftSize) * 5);
    
    // Connect nodes
    gainNode.connect(analyser);
    analyser.connect(audioContext.destination);
    
    // Initialize canvases
    document.querySelectorAll('.visualization-wrapper canvas').forEach(canvas => {
        initCanvas(canvas);
    });
    
    // Load demo song by default
    await loadDemoSong();
}

// Resume AudioContext after user interaction
async function resumeAudioContext() {
    if (audioContext && audioContext.state === 'suspended') {
        await audioContext.resume();
    }
}

// Load demo song
async function loadDemoSong() {
    try {
        const response = await fetch('assets/demo-song.mp3');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // Preload waveform
        preloadWaveform();
        
        // Update UI
        updateTimeDisplay();
        const btn = document.getElementById('demoSongBtn');
        btn.textContent = 'Demo Song Loaded!';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-success');
        setTimeout(() => {
            btn.textContent = 'Try Demo Song';
            btn.classList.remove('btn-success');
            btn.classList.add('btn-primary');
        }, 2000);
    } catch (error) {
        console.error('Error loading demo song:', error);
    }
}

// Handle file upload
document.getElementById('audioUpload').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const arrayBuffer = e.target.result;
            try {
                audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                preloadWaveform();
                updateTimeDisplay();
                updatePlayButton(false);
            } catch (error) {
                console.error('Error decoding audio data:', error);
            }
        };
        reader.readAsArrayBuffer(file);
    }
});

// Preload waveform data
function preloadWaveform() {
    if (!audioBuffer) return;
    
    const waveformVis = document.querySelector('.visualization-wrapper canvas');
    if (!waveformVis) return;
    
    const displayWidth = waveformVis.width;
    const displayHeight = waveformVis.height;
    const data = audioBuffer.getChannelData(0);
    const step = Math.ceil(data.length / displayWidth);
    
    preloadedWaveform = new Float32Array(displayWidth);
    for (let i = 0; i < displayWidth; i++) {
        const idx = Math.floor(i * step);
        preloadedWaveform[i] = data[idx];
    }
}

// Format time as MM:SS
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Update time display and progress
function updateTimeDisplay() {
    if (!audioBuffer) return;
    
    const currentTime = isPlaying ? audioContext.currentTime - startTime : 0;
    const totalTime = audioBuffer.duration;
    const progress = (currentTime / totalTime) * 100;
    
    // Update time display
    document.getElementById('currentTime').textContent = formatTime(currentTime);
    document.getElementById('totalTime').textContent = formatTime(totalTime);
    
    // Update progress bar
    document.getElementById('progressBar').style.width = `${Math.min(100, Math.max(0, progress))}%`;
}

// Update play button state
function updatePlayButton(playing) {
    const playBtn = document.getElementById('playBtn');
    if (playing) {
        playBtn.innerHTML = '<i class="fas fa-pause"></i>';
        playBtn.classList.remove('btn-success');
        playBtn.classList.add('btn-warning');
    } else {
        playBtn.innerHTML = '<i class="fas fa-play"></i>';
        playBtn.classList.remove('btn-warning');
        playBtn.classList.add('btn-success');
    }
}

// Draw grid with labels
function drawGrid(ctx, width, height, margin, xMax, yMax, xFormatter, yFormatter, xStep, yStep, xAxisTitle, yAxisTitle) {
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const plotBottom = height - margin.bottom;
    const plotRight = width - margin.right;
    
    // Clear the background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    
    // Style for grid lines
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    
    // Draw grid lines
    for (let x = 0; x <= xMax; x += xStep) {
        const xPos = margin.left + (x / xMax) * plotWidth;
        ctx.beginPath();
        ctx.moveTo(xPos, margin.top);
        ctx.lineTo(xPos, plotBottom);
        ctx.stroke();
    }
    
    for (let y = 0; y <= yMax; y += yStep) {
        const yPos = plotBottom - (y / yMax) * plotHeight;
        ctx.beginPath();
        ctx.moveTo(margin.left, yPos);
        ctx.lineTo(plotRight, yPos);
        ctx.stroke();
    }
    
    // Draw axes with darker color
    ctx.strokeStyle = '#999999';
    ctx.lineWidth = 2;
    
    // X-axis
    ctx.beginPath();
    ctx.moveTo(margin.left, plotBottom);
    ctx.lineTo(plotRight, plotBottom);
    ctx.stroke();
    
    // Y-axis
    ctx.beginPath();
    ctx.moveTo(margin.left, margin.top);
    ctx.lineTo(margin.left, plotBottom);
    ctx.stroke();
    
    // Draw labels
    ctx.font = '12px Arial';
    
    // Draw X-axis labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#666666';
    
    for (let x = 0; x <= xMax; x += xStep) {
        const xPos = margin.left + (x / xMax) * plotWidth;
        const label = xFormatter(x);
        
        // Draw tick
        ctx.beginPath();
        ctx.moveTo(xPos, plotBottom);
        ctx.lineTo(xPos, plotBottom + 5);
        ctx.stroke();
        
        // Clear background for label
        const metrics = ctx.measureText(label);
        const padding = 2;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(
            xPos - metrics.width/2 - padding,
            plotBottom + 6,
            metrics.width + padding * 2,
            14
        );
        
        // Draw label
        ctx.fillStyle = '#666666';
        ctx.fillText(label, xPos, plotBottom + 8);
    }
    
    // Draw Y-axis labels
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    
    for (let y = 0; y <= yMax; y += yStep) {
        const yPos = plotBottom - (y / yMax) * plotHeight;
        const label = yFormatter(y);
        
        // Draw tick
        ctx.beginPath();
        ctx.moveTo(margin.left - 5, yPos);
        ctx.lineTo(margin.left, yPos);
        ctx.stroke();
        
        // Clear background for label
        const metrics = ctx.measureText(label);
        const padding = 2;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(
            margin.left - metrics.width - 8 - padding,
            yPos - 7,
            metrics.width + padding * 2,
            14
        );
        
        // Draw label
        ctx.fillStyle = '#666666';
        ctx.fillText(label, margin.left - 8, yPos);
    }
    
    // Draw axis titles
    ctx.font = 'bold 14px Arial';
    ctx.fillStyle = '#444444';
    
    // X-axis title
    if (xAxisTitle) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(xAxisTitle, margin.left + plotWidth / 2, height - 10);
    }
    
    // Y-axis title
    if (yAxisTitle) {
        ctx.save();
        ctx.translate(20, margin.top + plotHeight / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(yAxisTitle, 0, 0);
        ctx.restore();
    }
    
    return ctx;
}

// Render waveform visualization
function renderWaveform(ctx, width, height) {
    if (!ctx || !audioBuffer) return;
    
    const margin = { top: 30, right: 20, bottom: 60, left: 80 };  // Increased margins for labels
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const plotBottom = height - margin.bottom;
    const plotRight = width - margin.right;
    
    // Clear canvas and draw grid with labels
    const duration = audioBuffer.duration;
    drawGrid(
        ctx, width, height, margin,
        duration, 1,
        x => x.toFixed(1) + 's',
        y => ((y - 0.5) * 2).toFixed(1),
        Math.ceil(duration / 10), 0.25,
        'Time', 'Amplitude'
    );
    
    const data = audioBuffer.getChannelData(0);
    const samplesPerPixel = Math.ceil(data.length / plotWidth);
    
    // Find max amplitude for scaling
    let maxAmplitude = 0;
    for (let i = 0; i < data.length; i += samplesPerPixel) {
        const abs = Math.abs(data[i]);
        if (abs > maxAmplitude) maxAmplitude = abs;
    }
    
    // Scale factor to make the waveform more visible
    const scaleFactor = 0.8 / maxAmplitude;
    
    // Create ImageData for waveform
    const imageData = ctx.createImageData(plotWidth, plotHeight);
    const pixels = imageData.data;
    
    // Draw points into ImageData
    for (let x = 0; x < plotWidth; x++) {
        const sampleIndex = x * samplesPerPixel;
        const nextSampleIndex = Math.min(sampleIndex + samplesPerPixel, data.length);
        
        // Find min and max in this slice
        let min = 1.0;
        let max = -1.0;
        
        for (let i = sampleIndex; i < nextSampleIndex; i++) {
            const value = data[i] * scaleFactor;
            min = Math.min(min, value);
            max = Math.max(max, value);
        }
        
        // Draw vertical line of points
        const y1 = Math.floor(((1 + Math.max(-1, Math.min(1, min))) / 2) * plotHeight);
        const y2 = Math.floor(((1 + Math.max(-1, Math.min(1, max))) / 2) * plotHeight);
        
        for (let y = Math.max(0, y1); y <= Math.min(plotHeight - 1, y2); y++) {
            const pixelOffset = (y * plotWidth + x) * 4;
            pixels[pixelOffset] = 33;     // R
            pixels[pixelOffset + 1] = 150; // G
            pixels[pixelOffset + 2] = 243; // B
            pixels[pixelOffset + 3] = 100; // A
        }
    }
    
    // Put the waveform on the canvas
    ctx.putImageData(imageData, margin.left, margin.top);
    
    // Draw time marker if playing
    if (isPlaying) {
        const currentTime = audioContext.currentTime - startTime;
        const x = margin.left + (currentTime / duration) * plotWidth;
        
        ctx.beginPath();
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.moveTo(x, margin.top);
        ctx.lineTo(x, plotBottom);
        ctx.stroke();
    }
}

// Render frequency spectrum
function renderSpectrum(ctx, width, height) {
    if (!ctx || !analyser) return;
    
    const margin = { top: 30, right: 20, bottom: 60, left: 80 };  // Match waveform margins
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const plotBottom = height - margin.bottom;
    const plotRight = width - margin.right;
    
    // Draw grid with labels
    drawGrid(
        ctx, width, height, margin,
        analyser.context.sampleRate / 2, // Nyquist frequency
        100, // Max dB
        x => Math.round(x/1000) + 'kHz',
        y => -y + 'dB',
        5000, // X step (5kHz)
        20, // Y step (20 dB)
        'Frequency', 'Magnitude'
    );
    
    // Get frequency data
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);
    
    // Create ImageData for spectrum
    const imageData = ctx.createImageData(plotWidth, plotHeight);
    const pixels = imageData.data;
    
    // Draw spectrum
    const barWidth = Math.ceil(plotWidth / bufferLength);
    
    for (let i = 0; i < bufferLength; i++) {
        const value = dataArray[i] / 255.0; // Normalize to 0-1
        const barHeight = value * plotHeight;
        const x = Math.floor((i / bufferLength) * plotWidth);
        
        // Draw vertical line
        for (let y = 0; y < barHeight; y++) {
            const yPos = plotHeight - y - 1;
            const pixelOffset = (yPos * plotWidth + x) * 4;
            pixels[pixelOffset] = 33;     // R
            pixels[pixelOffset + 1] = 150; // G
            pixels[pixelOffset + 2] = 243; // B
            pixels[pixelOffset + 3] = 100; // A
        }
    }
    
    // Put the spectrum on the canvas
    ctx.putImageData(imageData, margin.left, margin.top);
}

// Start audio playback
async function startPlayback() {
    if (!audioBuffer) return;
    
    // Reset the buffer for new playback
    rawSpectrogramBuffer = [];
    
    // Create new source
    source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(analyser);
    analyser.connect(audioContext.destination);
    
    // Start playback and record start time
    startTime = audioContext.currentTime;
    source.start(0);
    isPlaying = true;
    
    // Start visualization loop
    requestAnimationFrame(updateVisualizations);
}

// Collect frequency data
function collectSpectrogramData() {
    if (!isPlaying) return;
    
    const frequencyData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(frequencyData);
    
    // Store a copy of the frequency data
    rawSpectrogramBuffer.push(new Uint8Array(frequencyData));
}

// Render spectrogram
function renderSpectrogram(ctx, width, height) {
    if (!ctx || !audioBuffer || rawSpectrogramBuffer.length === 0) return;
    
    const margin = { top: 30, right: 20, bottom: 60, left: 80 };  // Match other margins
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    
    // Clear canvas and set white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    
    // Draw grid first
    const timeWindow = audioBuffer.duration;
    const nyquist = audioContext.sampleRate / 2;
    drawGrid(
        ctx, width, height, margin,
        timeWindow, nyquist,
        t => t.toFixed(1) + 's',
        f => (f >= 1000 ? (f/1000) + 'k' : f) + 'Hz',
        Math.ceil(timeWindow / 10), Math.ceil(nyquist / 10000) * 1000,
        'Time', 'Frequency'
    );
    
    // Calculate time parameters
    const currentTime = audioContext.currentTime - startTime;
    const samplesPerSecond = audioContext.sampleRate / analyser.fftSize;
    const samplesPerPixel = (timeWindow * samplesPerSecond) / plotWidth;
    
    // Create temporary canvas for spectrogram
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = plotWidth;
    tempCanvas.height = plotHeight;
    const tempCtx = tempCanvas.getContext('2d');
    const imageData = tempCtx.createImageData(plotWidth, plotHeight);
    imageData.data.fill(255); // Set to white background
    
    // Draw spectrogram
    const currentX = Math.floor((currentTime / timeWindow) * plotWidth);
    const threshold = parseInt(document.getElementById('thresholdSlider').value);
    
    for (let x = 0; x <= currentX && x < plotWidth; x++) {
        // Calculate which sample corresponds to this x position
        const sampleIndex = Math.floor(x * samplesPerPixel);
        
        if (sampleIndex >= rawSpectrogramBuffer.length) break;
        
        const frequencyData = rawSpectrogramBuffer[sampleIndex];
        
        for (let y = 0; y < plotHeight; y++) {
            // Map y position to frequency bin (0Hz at bottom)
            const freqIndex = Math.floor((plotHeight - y - 1) / plotHeight * (frequencyData.length - 1));
            const value = frequencyData[freqIndex];
            
            if (value >= threshold) {
                const color = getSpectrogramColor(value);
                const targetIdx = (y * plotWidth + x) * 4;
                
                if (targetIdx >= 0 && targetIdx < imageData.data.length - 3) {
                    imageData.data[targetIdx] = color.r;
                    imageData.data[targetIdx + 1] = color.g;
                    imageData.data[targetIdx + 2] = color.b;
                    imageData.data[targetIdx + 3] = 255;
                }
            }
        }
    }
    
    // Put the image data on the temporary canvas
    tempCtx.putImageData(imageData, 0, 0);
    
    // Draw the spectrogram at the correct position
    ctx.save();
    ctx.translate(margin.left, margin.top);
    ctx.drawImage(tempCanvas, 0, 0);
    
    // Draw time marker
    if (isPlaying) {
        const x = (currentTime / timeWindow) * plotWidth;
        ctx.beginPath();
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, plotHeight);
        ctx.stroke();
    }
    
    ctx.restore();
}

// Update visualizations
function updateVisualizations() {
    if (!audioContext) return;
    
    // Collect spectrogram data if playing
    if (isPlaying) {
        collectSpectrogramData();
    }
    
    // Update each visualization canvas
    document.querySelectorAll('.visualization-wrapper canvas').forEach((canvas, index) => {
        const ctx = canvas.getContext('2d', { alpha: false });
        
        // Make sure canvas is properly sized
        if (canvas.width !== canvas.offsetWidth || canvas.height !== canvas.offsetHeight) {
            initCanvas(canvas);
        }
        
        // Update the appropriate visualization
        if (index === 0) {
            renderWaveform(ctx, canvas.width, canvas.height);
        } else if (index === 1) {
            renderSpectrum(ctx, canvas.width, canvas.height);
        } else if (index === 2) {
            renderSpectrogram(ctx, canvas.width, canvas.height);
        }
    });
    
    // Request next frame
    animationFrameId = requestAnimationFrame(updateVisualizations);
}

// Handle threshold changes
document.getElementById('thresholdSlider').addEventListener('input', function() {
    const canvas = document.querySelector('.visualization-wrapper canvas:last-child');
    if (canvas && rawSpectrogramBuffer.length > 0) {
        const ctx = canvas.getContext('2d');
        renderSpectrogram(ctx, canvas.width, canvas.height);
    }
});

// Play/Pause functionality
document.getElementById('playBtn').addEventListener('click', async () => {
    await resumeAudioContext();
    
    if (!audioBuffer) return;
    
    if (isPlaying) {
        // Pause playback
        if (source) {
            source.stop();
            source = null;
        }
        isPlaying = false;
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        updatePlayButton(false);
    } else {
        // Start playback
        await startPlayback();
        updatePlayButton(true);
    }
});

// Handle progress bar clicks
document.addEventListener('DOMContentLoaded', () => {
    // Add progress bar click handler
    const progressBar = document.querySelector('#floatingControls .progress');
    if (progressBar) {
        progressBar.addEventListener('click', (e) => {
            if (!audioBuffer) return;
            
            const rect = e.target.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const progress = x / rect.width;
            const time = progress * audioBuffer.duration;
            
            // Stop current playback
            if (source) {
                source.stop();
                source.disconnect();
                source = null;
            }
            
            // Start from new position
            startPlayback();
            source.start(0, time);
            isPlaying = true;
            
            // Update UI
            updatePlayButton(true);
            updateTimeDisplay();
            updateVisualizations();
        });
    }
});

// Pre-calculate frequency colors for better performance
function getSpectrogramColor(intensity) {
    // Use a color scale from black through green to white
    const value = Math.max(0, Math.min(1, intensity / 200)); // Adjust range for better visibility
    
    if (value < 0.5) {
        // Black to green
        const green = Math.floor((value * 2) * 255);
        return { r: 0, g: green, b: 0 };
    } else {
        // Green to white
        const white = Math.floor(((value - 0.5) * 2) * 255);
        return { r: white, g: 255, b: white };
    }
}

// Initialize everything when the page loads
document.addEventListener('DOMContentLoaded', () => {
    initAudio();
});
