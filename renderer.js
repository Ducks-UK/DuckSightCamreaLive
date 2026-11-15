const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const recordBtn = document.getElementById('recordBtn');
const clipBtn = document.getElementById('clipBtn');
const statusDiv = document.getElementById('status');

let mediaStream;
let isRecording = false;
let recordedChunks = [];
let last60sBuffer = [];

// Load face-api.js models (pre-trained)
async function loadModels() {
    await faceapi.nets.tinyFaceDetector.loadFromUri('models');
    await faceapi.nets.faceLandmark68Net.loadFromUri('models');
    await faceapi.nets.faceRecognitionNet.loadFromUri('models');
    statusDiv.textContent = "Status: Models loaded";
}

// Start camera and detect faces
async function setupCamera() {
    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = mediaStream;
        video.play();
        statusDiv.textContent = "Status: Camera active";
        detectFaces();
    } catch (err) {
        console.error("Error accessing camera:", err);
        statusDiv.textContent = "Status: Error accessing camera";
    }
}

// Detect faces in real-time (no live learning)
async function detectFaces() {
    if (!video.paused && !video.ended) {
        const detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (detection) {
            drawDetection(detection);
        } else {
            drawDetection(null);
        }

        // Store last frame for 60s buffer
        last60sBuffer.push(canvas.toDataURL('image/jpeg'));
        if (last60sBuffer.length > 60 * 30) { // ~30fps
            last60sBuffer.shift();
        }

        requestAnimationFrame(detectFaces);
    }
}

// Draw hitboxes
function drawDetection(detection) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    if (detection) {
        const { x, y, width, height } = detection.box;
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, width, height);
    }
}

// Recording controls
recordBtn.addEventListener('click', () => {
    if (!isRecording) {
        isRecording = true;
        recordedChunks = [];
        recordBtn.textContent = "Stop Recording";
        statusDiv.textContent = "Status: Recording...";
    } else {
        isRecording = false;
        recordBtn.textContent = "Start Recording";
        statusDiv.textContent = "Status: Recording saved";

        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'recording.webm';
        a.click();
    }
});

// Clip last 60s
clipBtn.addEventListener('click', () => {
    if (last60sBuffer.length > 0) {
        const clip = last60sBuffer.slice(-60 * 30);
        const canvasClip = document.createElement('canvas');
        canvasClip.width = canvas.width;
        canvasClip.height = canvas.height;
        const ctxClip = canvasClip.getContext('2d');

        const frames = [];
        clip.forEach((dataUrl, i) => {
            const img = new Image();
            img.src = dataUrl;
            img.onload = () => {
                ctxClip.clearRect(0, 0, canvasClip.width, canvasClip.height);
                ctxClip.drawImage(img, 0, 0, canvasClip.width, canvasClip.height);
                const frameData = canvasClip.toDataURL('image/jpeg');
                frames.push(frameData);

                if (frames.length === clip.length) {
                    const blob = new Blob([frames.map(f => {
                        const byteString = atob(f.split(',')[1]);
                        const mimeString = f.split(',')[0].split(':')[1].split(';')[0];
                        const ab = new ArrayBuffer(byteString.length);
                        const ia = new Uint8Array(ab);
                        for (let i = 0; i < byteString.length; i++) {
                            ia[i] = byteString.charCodeAt(i);
                        }
                        return new Blob([ab], { type: mimeString });
                    })], { type: 'image/jpeg' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'last60s_clip.jpg';
                    a.click();
                }
            };
        });
    }
});

// Initialize
loadModels().then(setupCamera);
