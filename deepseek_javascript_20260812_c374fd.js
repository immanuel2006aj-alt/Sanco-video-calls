// Sanco Core v3.0 – Full-screen remote + PIP local + Camera flip
(() => {
  const urlParams = new URLSearchParams(window.location.search);
  const ROOM = urlParams.get('room');
  const ROLE = urlParams.get('role');

  if (!ROOM || !ROLE || ROOM.length !== 8) {
    alert('Invalid room. Redirecting...');
    window.location.href = 'index.html';
    return;
  }

  document.getElementById('displayRoom').textContent = ROOM;

  // DOM refs
  const localVideo = document.getElementById('localVideo');
  const remoteVideo = document.getElementById('remoteVideo');
  const remoteLabel = document.getElementById('remoteLabel');
  const localWrapper = document.getElementById('localWrapper');
  const remoteWrapper = document.getElementById('remoteWrapper');
  const muteBtn = document.getElementById('muteBtn');
  const videoBtn = document.getElementById('videoBtn');
  const endBtn = document.getElementById('endBtn');
  const switchCameraBtn = document.getElementById('switchCameraBtn');

  // PeerJS globals
  let peer = null;
  let localStream = null;
  let call = null;
  let isMuted = false;
  let isVideoOff = false;
  let isSwapped = false; // false = remote big, local PIP. true = local big, remote PIP.

  // Camera device list
  let videoDevices = [];
  let currentDeviceIndex = 0;

  // ---- BRUTAL EXIT: kill everything when tab closes ----
  function brutalExit() {
    if (call) {
      try { call.close(); } catch (e) {}
      call = null;
    }
    if (peer) {
      try { peer.destroy(); } catch (e) {}
      peer = null;
    }
    if (localStream) {
      localStream.getTracks().forEach(t => {
        try { t.stop(); } catch (e) {}
      });
      localStream = null;
    }
    // Clear video elements
    if (localVideo) localVideo.srcObject = null;
    if (remoteVideo) remoteVideo.srcObject = null;
  }

  // Hook exit events
  window.addEventListener('beforeunload', brutalExit);
  window.addEventListener('pagehide', brutalExit);
  // Also if user navigates away via SPA, but we use standard links.

  // ---- End call (manual) ----
  function endCall() {
    brutalExit();
    window.location.href = 'index.html';
  }

  // ---- Initialize Peer ----
  function initPeer() {
    const myId = (ROLE === 'caller') ? ROOM : undefined;
    peer = new Peer(myId, {
      debug: 0,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ]
      }
    });

    peer.on('open', (id) => {
      console.log(`PeerJS open: ${id}`);
      if (ROLE === 'caller') {
        peer.on('call', (incomingCall) => {
          if (localStream) {
            incomingCall.answer(localStream);
            setupCallEvents(incomingCall);
            call = incomingCall;
            remoteLabel.textContent = 'Connected';
          } else {
            incomingCall.close();
          }
        });
        remoteLabel.textContent = 'Waiting for receiver...';
      } else {
        // receiver
        call = peer.call(ROOM, localStream);
        setupCallEvents(call);
        remoteLabel.textContent = 'Calling...';
      }
    });

    peer.on('error', (err) => {
      console.error('PeerJS error:', err);
      if (err.type === 'peer-unavailable') {
        alert('Room not found. The caller may have left.');
        endCall();
      } else {
        alert('Connection error: ' + err.message);
        endCall();
      }
    });
  }

  // ---- Get local media ----
  async function getLocalMedia() {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      localVideo.srcObject = localStream;
      // Enumerate video devices for camera flip
      await enumerateVideoDevices();
      return true;
    } catch (err) {
      alert('Camera/Mic access denied. Please allow permissions.');
      console.error(err);
      window.location.href = 'index.html';
      return false;
    }
  }

  // ---- Enumerate video devices ----
  async function enumerateVideoDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      videoDevices = devices.filter(d => d.kind === 'videoinput');
      if (videoDevices.length === 0) {
        switchCameraBtn.style.display = 'none';
      } else {
        // Find current device index
        const currentTrack = localStream.getVideoTracks()[0];
        if (currentTrack) {
          const settings = currentTrack.getSettings();
          const currentId = settings.deviceId;
          const idx = videoDevices.findIndex(d => d.deviceId === currentId);
          if (idx !== -1) currentDeviceIndex = idx;
        }
      }
    } catch (e) {
      console.warn('Could not enumerate devices:', e);
      switchCameraBtn.style.display = 'none';
    }
  }

  // ---- Switch camera (front/back) ----
  async function switchCamera() {
    if (videoDevices.length < 2) {
      // Try re-enumerating
      await enumerateVideoDevices();
      if (videoDevices.length < 2) {
        alert('Only one camera detected. Cannot switch.');
        return;
      }
    }
    // Cycle to next camera
    currentDeviceIndex = (currentDeviceIndex + 1) % videoDevices.length;
    const nextDevice = videoDevices[currentDeviceIndex];
    if (!nextDevice) return;

    try {
      // Get new video track only
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: nextDevice.deviceId }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } },
        audio: false
      });
      const newVideoTrack = newStream.getVideoTracks()[0];

      // Replace track in peer connection
      if (call && call.peerConnection) {
        const sender = call.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
          await sender.replaceTrack(newVideoTrack);
        }
      }

      // Update localStream: remove old video, add new
      const oldVideoTrack = localStream.getVideoTracks()[0];
      if (oldVideoTrack) {
        localStream.removeTrack(oldVideoTrack);
        oldVideoTrack.stop();
      }
      localStream.addTrack(newVideoTrack);
      // Update local video display
      localVideo.srcObject = localStream;
      // Update audio reference (just in case)
      // Re-enumerate to keep index sync
      await enumerateVideoDevices();
    } catch (err) {
      console.error('Camera switch failed:', err);
      alert('Could not switch camera. Please check permissions.');
    }
  }

  // ---- Common call event setup ----
  function setupCallEvents(mediaCall) {
    mediaCall.on('stream', (remoteStream) => {
      remoteVideo.srcObject = remoteStream;
      remoteLabel.textContent = 'Connected';
    });
    mediaCall.on('close', () => {
      remoteLabel.textContent = 'Call ended';
      endCall();
    });
    mediaCall.on('error', (err) => {
      console.error('Call error:', err);
      alert('Call error: ' + err.message);
      endCall();
    });
  }

  // ---- SWAP LAYOUT (click PIP to zoom) ----
  function swapLayout() {
    if (!localStream || !remoteVideo.srcObject) return;

    const localStreamObj = localVideo.srcObject;
    const remoteStreamObj = remoteVideo.srcObject;

    // Swap the srcObjects
    localVideo.srcObject = remoteStreamObj;
    remoteVideo.srcObject = localStreamObj;

    // Swap labels
    const localLabel = localWrapper.querySelector('.label');
    const remoteLabelEl = remoteWrapper.querySelector('.label');
    const tempText = localLabel.textContent;
    localLabel.textContent = remoteLabelEl.textContent;
    remoteLabelEl.textContent = tempText;

    // Swap classes for styling (optional)
    localWrapper.classList.toggle('remote');
    localWrapper.classList.toggle('local');
    remoteWrapper.classList.toggle('remote');
    remoteWrapper.classList.toggle('local');

    isSwapped = !isSwapped;
  }

  // ---- Control buttons ----
  muteBtn.addEventListener('click', () => {
    if (!localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(t => t.enabled = !isMuted);
    muteBtn.style.opacity = isMuted ? '0.4' : '1';
  });

  videoBtn.addEventListener('click', () => {
    if (!localStream) return;
    isVideoOff = !isVideoOff;
    localStream.getVideoTracks().forEach(t => t.enabled = !isVideoOff);
    videoBtn.style.opacity = isVideoOff ? '0.4' : '1';
  });

  // Camera flip button
  switchCameraBtn.addEventListener('click', switchCamera);

  // End call button
  endBtn.addEventListener('click', endCall);

  // Click on local PIP to swap (zoom effect)
  localWrapper.addEventListener('click', swapLayout);
  // Also allow double-click on remote to swap back? We'll just keep it on PIP click.

  // ---- Init ----
  (async () => {
    const ok = await getLocalMedia();
    if (!ok) return;
    initPeer();
    if (ROLE === 'caller') {
      remoteLabel.textContent = 'Waiting for receiver...';
    }
  })();

  // Extra cleanup if user refreshes
  window.addEventListener('unload', brutalExit);
})();