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
let faceapi;
let faceMatcher;

// Initialize face-api.js with models
async function loadModels() {
    await faceapi.nets.tinyFaceDetector.loadFromUri('models');
    await faceapi.nets.faceLandmark68Net.loadFromUri('models');
    await faceapi.nets.faceRecognitionNet.loadFromUri('models');

    // Load training data
    const labeledFaceDescriptors = await loadLabeledImages();
    faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, 0.6);
}

async function loadLabeledImages() {
    const labels = ['Person', 'Not-Person', 'Person-Face'];
    return Promise.all(
        labels.map(async label => {
            const descriptions = [];
            for (let i = 1; i <= 10; i++) { // Assuming 10 images per label
                try {
                    const img = await faceapi.fetchImage(`Files/Training-Data/${label}/image_${i}.jpg`);
                    const detections = await faceapi.detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
                        .withFaceLandmarks()
                        .withFaceDescriptor();
                    descriptions.push(detections.descriptor);
                } catch (e) {
                    console.error(`Error loading ${label}/image_${i}.jpg`, e);
                }
            }
            return new faceapi.LabeledFaceDescriptors(label, descriptions);
        })
    );
}

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

async function detectFaces() {
    if (!video.paused && !video.ended) {
        const detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (detection) {
            const bestMatch = faceMatcher.findBestMatch(detection.descriptor);
            drawDetection(detection, bestMatch.label);
        } else {
            drawDetection(null);
        }

        // Store last frame for 60s buffer
        last60sBuffer.push(canvas.toDataURL('image/jpeg'));
        if (last60sBuffer.length > 60 * 30) { // Assuming ~30fps
            last60sBuffer.shift();
        }

        requestAnimationFrame(detectFaces);
    }
}

function drawDetection(detection, label) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    if (detection) {
        const { x, y, width, height } = detection.box;
        ctx.strokeStyle = label === 'Person-Face' ? '#00ff00' : '#ff0000';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, width, height);

        if (label) {
            ctx.fillStyle = ctx.strokeStyle;
            ctx.font = '16px Arial';
            ctx.fillText(label, x, y > 10 ? y - 5 : 10);
        }
    }
}

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

        // Create download link
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'recording.webm';
        a.click();
    }
});

clipBtn.addEventListener('click', () => {
    if (last60sBuffer.length > 0) {
        const clip = last60sBuffer.slice(-60 * 30); // Last 60s worth of frames
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
                    // Create download link for the clip
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
