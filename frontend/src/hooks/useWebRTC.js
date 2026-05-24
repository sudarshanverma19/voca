/**
 * useWebRTC — manages a two-socket WebRTC audio call flow.
 *
 * WHY two sockets?
 * The signaling server relays with socket.to(room) which EXCLUDES the sender.
 * A single socket can't play both caller and callee — it would never receive
 * its own relayed offer/answer. Two sockets (userSocket + systemSocket) keep
 * each role distinct so relay works correctly.
 *
 * ROLES:
 *   userSocket   — permanent, registered with userId, callee side.
 *   systemSocket — ephemeral per call, caller/initiator side.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';

const SIGNALING_URL = 'http://localhost:3001';
const ICE_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

const SOCKET_OPTS = {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
};

export function useWebRTC(userId) {
  // 'idle' | 'ringing' | 'connecting' | 'connected'
  const [callState, setCallState] = useState('idle');
  const [incomingSessionId, setIncomingSessionId] = useState(null);
  // Increments on every (re)connect — lets callers react to reconnections
  const [connectedCount, setConnectedCount] = useState(0);

  const userSocketRef = useRef(null);
  const systemSocketRef = useRef(null);
  const userPeerRef = useRef(null);
  const systemPeerRef = useRef(null);
  const localStreamRef = useRef(null);

  // ─── Cleanup ──────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;

    userPeerRef.current?.close();
    userPeerRef.current = null;

    systemPeerRef.current?.close();
    systemPeerRef.current = null;

    systemSocketRef.current?.disconnect();
    systemSocketRef.current = null;

    setCallState('idle');
    setIncomingSessionId(null);
  }, []);

  // ─── User socket (permanent, callee side) ────────────────────────────────
  useEffect(() => {
    const socket = io(SIGNALING_URL, SOCKET_OPTS);
    userSocketRef.current = socket;

    // Fires on connect AND every reconnect — re-register each time,
    // then bump connectedCount so ActiveSessionModal can do fallback recovery
    socket.on('connect', () => {
      socket.emit('register', { user_id: userId });
      setConnectedCount((c) => c + 1);
    });

    socket.on('disconnect', (reason) => {
      console.warn('[useWebRTC] userSocket disconnected:', reason);
      // socket.io auto-reconnects unless reason is 'io server disconnect'
    });

    socket.on('connect_error', (err) => {
      console.error('[useWebRTC] userSocket connect error:', err.message);
    });

    socket.on('call:incoming', ({ session_id }) => {
      setIncomingSessionId(session_id);
      setCallState('ringing');
    });

    socket.on('webrtc:offer', async ({ session_id, sdp }) => {
      try {
        const peer = new RTCPeerConnection(ICE_CONFIG);
        userPeerRef.current = peer;

        peer.onicecandidate = (e) => {
          if (e.candidate) {
            socket.emit('webrtc:ice-candidate', { session_id, candidate: e.candidate });
          }
        };

        peer.ontrack = (e) => {
          const audio = new Audio();
          audio.srcObject = e.streams[0];
          audio.play().catch(() => {});
        };

        const stream = localStreamRef.current;
        if (stream) stream.getTracks().forEach((t) => peer.addTrack(t, stream));

        await peer.setRemoteDescription(sdp);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        socket.emit('webrtc:answer', { session_id, sdp: answer });
        setCallState('connected');
      } catch (err) {
        console.error('[useWebRTC] user peer offer handling failed:', err);
      }
    });

    socket.on('webrtc:ice-candidate', async ({ candidate }) => {
      try {
        await userPeerRef.current?.addIceCandidate(candidate);
      } catch (err) {
        console.error('[useWebRTC] user addIceCandidate failed:', err);
      }
    });

    socket.on('call:ended', () => cleanup());
    socket.on('session:evicted', () => cleanup());
    socket.on('call:error', ({ message }) => {
      console.error('[useWebRTC] call:error from signaling server:', message);
    });

    return () => {
      socket.disconnect();
    };
  }, [userId, cleanup]);

  // ─── startCall ────────────────────────────────────────────────────────────
  // Called by ActiveSessionModal when HTTP poll detects an active session.
  // Guard (callState !== 'idle') is handled by the caller before invoking this.
  const startCall = useCallback(
    async (sessionId) => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStreamRef.current = stream;
      } catch (err) {
        console.error('[useWebRTC] getUserMedia failed:', err);
        return;
      }

      const sysSocket = io(SIGNALING_URL, SOCKET_OPTS);
      systemSocketRef.current = sysSocket;

      sysSocket.on('connect', () => {
        sysSocket.emit('call:start', { session_id: sessionId, callee_user_id: userId });
      });

      sysSocket.on('disconnect', (reason) => {
        console.warn('[useWebRTC] systemSocket disconnected:', reason);
      });

      sysSocket.on('connect_error', (err) => {
        console.error('[useWebRTC] systemSocket connect error:', err.message);
      });

      // Callee joined — now send the WebRTC offer
      sysSocket.on('call:callee_joined', async ({ session_id }) => {
        try {
          const peer = new RTCPeerConnection(ICE_CONFIG);
          systemPeerRef.current = peer;

          peer.onicecandidate = (e) => {
            if (e.candidate) {
              sysSocket.emit('webrtc:ice-candidate', { session_id, candidate: e.candidate });
            }
          };

          peer.ontrack = (e) => {
            const audio = new Audio();
            audio.srcObject = e.streams[0];
            audio.play().catch(() => {});
          };

          const stream = localStreamRef.current;
          if (stream) stream.getTracks().forEach((t) => peer.addTrack(t, stream));

          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          sysSocket.emit('webrtc:offer', { session_id, sdp: offer });
        } catch (err) {
          console.error('[useWebRTC] system offer creation failed:', err);
        }
      });

      sysSocket.on('webrtc:answer', async ({ sdp }) => {
        try {
          await systemPeerRef.current?.setRemoteDescription(sdp);
        } catch (err) {
          console.error('[useWebRTC] system setRemoteDescription failed:', err);
        }
      });

      sysSocket.on('webrtc:ice-candidate', async ({ candidate }) => {
        try {
          await systemPeerRef.current?.addIceCandidate(candidate);
        } catch (err) {
          console.error('[useWebRTC] system addIceCandidate failed:', err);
        }
      });

      sysSocket.on('call:ended', () => cleanup());
      sysSocket.on('call:callee_offline', ({ session_id }) => {
        console.warn('[useWebRTC] callee not registered on signaling server — session_id:', session_id);
        cleanup();
      });
    },
    [userId, cleanup]
  );

  // ─── acceptCall ───────────────────────────────────────────────────────────
  const acceptCall = useCallback((sessionId) => {
    userSocketRef.current?.emit('call:join', { session_id: sessionId });
    setCallState('connecting');
  }, []);

  // ─── hangUp ───────────────────────────────────────────────────────────────
  const hangUp = useCallback(
    (sessionId) => {
      userSocketRef.current?.emit('call:end', { session_id: sessionId });
      cleanup();
    },
    [cleanup]
  );

  return { callState, incomingSessionId, connectedCount, startCall, acceptCall, hangUp };
}
