/**
 * OnyxView - Record Gameplay
 * DESIGN ENGINE ARCHITECTURE BY ONYXSOUL
 * Supports: PS4, PS5, Xbox, Switch, PC + RECORDING!
 */

const video = document.getElementById('videoPlayer');
const videoContainer = document.getElementById('videoContainer');
const select = document.getElementById('cameraSelect');
const startBtn = document.getElementById('startButton');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const recordBtn = document.getElementById('recordBtn');
const downloadBtn = document.getElementById('downloadBtn');
const status = document.getElementById('status');
const recordingIndicator = document.getElementById('recordingIndicator');
const recordingTimer = document.getElementById('recordingTimer');

const brightnessSlider = document.getElementById('brightness');
const contrastSlider = document.getElementById('contrast');
const saturationSlider = document.getElementById('saturation');
const brightnessVal = document.getElementById('brightnessVal');
const contrastVal = document.getElementById('contrastVal');
const saturationVal = document.getElementById('saturationVal');

let stream = null;
let deviceId = null;
let fullscreenActive = false;
let cursorTimeout = null;

// ----- RECORDING VARIABLES -----
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let recordingStartTime = null;
let recordingTimerInterval = null;

// ----- GET DEVICES -----
async function getDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        
        select.innerHTML = '<option value="">— Select Capture Device —</option>';
        
        if (videoDevices.length === 0) {
            select.innerHTML = '<option value="">⚠️ No capture device found</option>';
            status.textContent = '❌ Plug in your capture card';
            status.style.color = '#ff4444';
            return;
        }

        videoDevices.forEach((device, i) => {
            const opt = document.createElement('option');
            opt.value = device.deviceId;
            let label = device.label || `Capture Device ${i + 1}`;
            if (label.toLowerCase().includes('elgato')) label = '🎮 ' + label;
            else if (label.toLowerCase().includes('aver')) label = '🎮 ' + label;
            else if (label.toLowerCase().includes('cam link')) label = '📷 ' + label;
            opt.textContent = label;
            select.appendChild(opt);
        });

        status.textContent = `✅ Found ${videoDevices.length} capture device(s)`;
        status.style.color = '#00f0ff';
        console.log('📷 Devices found:', videoDevices.length);
        
    } catch (err) {
        console.error('Device error:', err);
        status.textContent = '❌ Permission needed. Click padlock → Allow camera';
        status.style.color = '#ff4444';
    }
}

// ----- START STREAM -----
async function startStream() {
    if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
        video.srcObject = null;
        stopRecording();
    }

    const selectedDevice = select.value;
    if (!selectedDevice) {
        status.textContent = '⚠️ Select a capture device first';
        status.style.color = '#ffaa00';
        return;
    }

    status.textContent = '⏳ Connecting...';
    status.style.color = '#ffaa00';
    startBtn.textContent = '⏳ Connecting...';
    startBtn.disabled = true;

    const attempts = [
        {
            video: {
                deviceId: { exact: selectedDevice },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                frameRate: { ideal: 60 }
            },
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            }
        },
        {
            video: {
                deviceId: { exact: selectedDevice },
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 60 }
            },
            audio: false
        },
        {
            video: {
                deviceId: { exact: selectedDevice }
            },
            audio: false
        }
    ];

    for (let i = 0; i < attempts.length; i++) {
        try {
            console.log(`[OnyxView] Trying attempt ${i + 1}`);
            const newStream = await navigator.mediaDevices.getUserMedia(attempts[i]);
            
            const videoTracks = newStream.getVideoTracks();
            if (videoTracks.length === 0) {
                throw new Error('No video track');
            }

            video.srcObject = newStream;
            stream = newStream;
            await video.play();
            
            status.textContent = `✅ STREAM ACTIVE!`;
            status.style.color = '#00ff88';
            startBtn.textContent = '🛑 Stop Stream';
            startBtn.onclick = stopStream;
            startBtn.disabled = false;
            
            console.log('✅ Stream active!');
            return true;
            
        } catch (err) {
            console.warn(`[OnyxView] Attempt ${i + 1} failed:`, err.message);
        }
    }

    status.textContent = '❌ Console not detected';
    status.style.color = '#ff4444';
    startBtn.textContent = '▶ Start Stream';
    startBtn.onclick = startStream;
    startBtn.disabled = false;

    const msg = 
        '❌ Console not detected!\n\n' +
        '🔧 Fix this:\n' +
        '1. ✅ Capture card plugged into USB\n' +
        '2. ✅ Console connected via HDMI to capture card\n' +
        '3. ✅ PS4/PS5: Settings → System → HDCP → OFF\n' +
        '4. ✅ Close OBS, Discord, other camera apps\n' +
        '5. ✅ Try a different USB port';
    
    alert(msg);
    return false;
}

// ----- STOP STREAM -----
function stopStream() {
    if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
        video.srcObject = null;
    }
    stopRecording();
    status.textContent = '⏹️ Stream stopped';
    status.style.color = '#00f0ff';
    startBtn.textContent = '▶ Start Stream';
    startBtn.onclick = startStream;
    startBtn.disabled = false;
}

// ============================================
// ========== RECORDING FUNCTION =============
// ============================================

function startRecording() {
    if (!stream) {
        alert('Start the stream first!');
        return;
    }

    if (isRecording) {
        stopRecording();
        return;
    }

    console.log('[RECORD] Starting recording...');
    recordedChunks = [];

    // Create a MediaRecorder with the stream
    const mimeTypes = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4'
    ];

    let selectedMimeType = mimeTypes[0];
    for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
            selectedMimeType = type;
            break;
        }
    }

    try {
        const options = {
            mimeType: selectedMimeType,
            videoBitsPerSecond: 5000000 // 5 Mbps for good quality
        };

        mediaRecorder = new MediaRecorder(stream, options);

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
                console.log('[RECORD] Chunk:', event.data.size, 'bytes');
            }
        };

        mediaRecorder.onstop = () => {
            console.log('[RECORD] Stopped, chunks:', recordedChunks.length);
            const blob = new Blob(recordedChunks, { type: selectedMimeType });
            const url = URL.createObjectURL(blob);
            
            // Enable download button
            downloadBtn.disabled = false;
            downloadBtn.onclick = () => {
                const a = document.createElement('a');
                a.href = url;
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                a.download = `gameplay-${timestamp}.webm`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 10000);
                console.log('[RECORD] Downloading...');
            };

            // Reset UI
            recordBtn.textContent = '🔴 Record';
            recordBtn.classList.remove('recording');
            recordingIndicator.classList.remove('active');
            recordingTimer.classList.remove('active');
            if (recordingTimerInterval) {
                clearInterval(recordingTimerInterval);
                recordingTimerInterval = null;
            }
            recordingTimer.textContent = '00:00';
            isRecording = false;
            status.textContent = '✅ Recording saved! Click Download.';
            status.style.color = '#00ff88';
        };

        // Start recording
        mediaRecorder.start(1000); // Capture chunks every second
        isRecording = true;
        recordingStartTime = Date.now();

        // Update UI
        recordBtn.textContent = '⏹️ Stop Recording';
        recordBtn.classList.add('recording');
        recordingIndicator.classList.add('active');
        recordingTimer.classList.add('active');
        status.textContent = '🔴 RECORDING...';
        status.style.color = '#ff0044';

        // Timer
        if (recordingTimerInterval) {
            clearInterval(recordingTimerInterval);
        }
        recordingTimerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
            const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
            const secs = String(elapsed % 60).padStart(2, '0');
            recordingTimer.textContent = `${mins}:${secs}`;
        }, 1000);

        console.log('[RECORD] Recording started!');

    } catch (err) {
        console.error('[RECORD] Error:', err);
        alert('Failed to start recording: ' + err.message);
    }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        console.log('[RECORD] Stopping recording...');
        mediaRecorder.stop();
        // Don't reset immediately - wait for onstop event
    } else {
        // Reset UI if not recording
        recordBtn.textContent = '🔴 Record';
        recordBtn.classList.remove('recording');
        recordingIndicator.classList.remove('active');
        recordingTimer.classList.remove('active');
        if (recordingTimerInterval) {
            clearInterval(recordingTimerInterval);
            recordingTimerInterval = null;
        }
        recordingTimer.textContent = '00:00';
        isRecording = false;
    }
}

// ----- SLIDERS -----
function applyFilters() {
    const b = parseFloat(brightnessSlider.value) || 1;
    const c = parseFloat(contrastSlider.value) || 1;
    const s = parseFloat(saturationSlider.value) || 1;
    video.style.filter = `brightness(${b}) contrast(${c}) saturate(${s})`;
    brightnessVal.textContent = b.toFixed(2);
    contrastVal.textContent = c.toFixed(2);
    saturationVal.textContent = s.toFixed(2);
}

brightnessSlider.addEventListener('input', applyFilters);
contrastSlider.addEventListener('input', applyFilters);
saturationSlider.addEventListener('input', applyFilters);
applyFilters();

// ----- FULLSCREEN -----
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        videoContainer.requestFullscreen()
            .then(() => {
                fullscreenActive = true;
                document.body.classList.add('hidden-cursor');
            })
            .catch(err => console.warn('Fullscreen error:', err));
    } else {
        document.exitFullscreen()
            .then(() => {
                fullscreenActive = false;
                document.body.classList.remove('hidden-cursor');
            })
            .catch(err => console.warn(err));
    }
}

document.addEventListener('fullscreenchange', () => {
    fullscreenActive = !!document.fullscreenElement;
    if (!fullscreenActive) {
        document.body.classList.remove('hidden-cursor');
        videoContainer.style.cursor = 'default';
    }
});

document.addEventListener('mousemove', () => {
    if (fullscreenActive) {
        document.body.classList.remove('hidden-cursor');
        videoContainer.style.cursor = 'default';
        if (cursorTimeout) clearTimeout(cursorTimeout);
        cursorTimeout = setTimeout(() => {
            if (fullscreenActive) {
                document.body.classList.add('hidden-cursor');
                videoContainer.style.cursor = 'none';
            }
        }, 2000);
    }
});

// ----- EVENTS -----
select.addEventListener('change', () => {
    deviceId = select.value;
    if (deviceId) {
        status.textContent = '✅ Device selected. Click Start.';
        status.style.color = '#00f0ff';
    }
});

startBtn.addEventListener('click', startStream);
fullscreenBtn.addEventListener('click', toggleFullscreen);
video.addEventListener('dblclick', toggleFullscreen);
recordBtn.addEventListener('click', startRecording);

// ----- INIT -----
async function init() {
    try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        tempStream.getTracks().forEach(t => t.stop());
        console.log('✅ Permissions granted');
        await getDevices();
        status.textContent = '✅ Ready - Select device and click Start';
        status.style.color = '#00f0ff';
    } catch (err) {
        console.error('Permission error:', err);
        status.textContent = '❌ Click padlock → Allow camera → Reload';
        status.style.color = '#ff4444';
    }
}

init();

console.log('🎮 OnyxView with RECORDING!');
console.log('📌 DESIGN ENGINE ARCHITECTURE BY ONYXSOUL');
console.log('💡 Click Record to save gameplay!');