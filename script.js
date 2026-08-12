// Sanco Core – PeerJS edition (no backend, pure static)
(() => {
  const urlParams = new URLSearchParams(window.location.search);
  const ROOM = urlParams.get('room');       // 8-char ID (caller's peer ID)
  const ROLE = urlParams.get('role');       // 'caller' or 'receiver'

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
  const muteBtn = document.getElementById('muteBtn');
  const videoBtn = document.getElementById('videoBtn');
  const endBtn = document.getElementById('endBtn');

  // PeerJS globals
  let peer = null;
  let localStream = null;
  let call = null;
  let isMuted = false;
  let isVideoOff = false;

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
        window.location.href = 'index.html';
      } else {
        alert('Connection error: ' + err.message);
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
      return true;
    } catch (err) {
      alert('Camera/Mic access denied. Please allow permissions.');
      console.error(err);
      window.location.href = 'index.html';
      return false;
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

  // ---- End call cleanly ----
  function endCall() {
    if (call) { call.close(); call = null; }
    if (peer) { peer.destroy(); peer = null; }
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
    }
    window.location.href = 'index.html';
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

  endBtn.addEventListener('click', endCall);

  // ---- Init ----
  (async () => {
    const ok = await getLocalMedia();
    if (!ok) return;
    initPeer();
    if (ROLE === 'caller') {
      remoteLabel.textContent = 'Waiting for receiver...';
    }
  })();

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    if (call) call.close();
    if (peer) peer.destroy();
    if (localStream) localStream.getTracks().forEach(t => t.stop());
  });
})();
