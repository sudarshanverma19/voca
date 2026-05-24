require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const CLIENT_URL = process.env.CLIENT_URL;

if (!CLIENT_URL) {
  console.error('[signaling] CLIENT_URL env var is not set — CORS will block all connections');
}

const app = express();
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST'],
  },
});

// user_id -> socket.id (only latest connection per user)
const userSockets = new Map();

// session_id -> { callerId, calleeId, room }
const sessions = new Map();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', connections: userSockets.size, sessions: sessions.size });
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  let registeredUserId = null;

  // ── Register ──────────────────────────────────────────────────────────
  // Client sends: { user_id: string }
  socket.on('register', ({ user_id } = {}) => {
    if (!user_id) return;

    // Evict any stale socket registered under the same user_id
    const prevSocketId = userSockets.get(user_id);
    if (prevSocketId && prevSocketId !== socket.id) {
      const prevSocket = io.sockets.sockets.get(prevSocketId);
      if (prevSocket) {
        prevSocket.emit('session:evicted', { reason: 'new_connection' });
        prevSocket.disconnect(true);
      }
    }

    userSockets.set(user_id, socket.id);
    registeredUserId = user_id;
    socket.emit('registered', { user_id });
  });

  // ── Call Start (triggered by backend scheduler) ────────────────────────
  // Caller sends: { session_id: string, callee_user_id: string }
  // Server creates a room and notifies the callee
  socket.on('call:start', ({ session_id, callee_user_id } = {}) => {
    if (!session_id || !callee_user_id) return;

    const room = `session:${session_id}`;
    socket.join(room);

    sessions.set(session_id, {
      callerId: socket.id,
      calleeId: null,
      room,
    });

    const calleeSocketId = userSockets.get(callee_user_id);
    if (calleeSocketId) {
      io.to(calleeSocketId).emit('call:incoming', {
        session_id,
        caller_socket_id: socket.id,
      });
    } else {
      // Callee is offline — notify caller so it can fall back to push notification
      socket.emit('call:callee_offline', { session_id, callee_user_id });
    }
  });

  // ── Callee joins the session room ──────────────────────────────────────
  // Client sends: { session_id: string }
  socket.on('call:join', ({ session_id } = {}) => {
    if (!session_id) return;

    const session = sessions.get(session_id);
    if (!session) {
      socket.emit('call:error', { session_id, message: 'Session not found' });
      return;
    }

    session.calleeId = socket.id;
    socket.join(session.room);

    // Tell the caller the callee is ready — caller should now send the offer
    io.to(session.callerId).emit('call:callee_joined', { session_id });
  });

  // ── WebRTC Offer ───────────────────────────────────────────────────────
  // Caller sends: { session_id: string, sdp: RTCSessionDescriptionInit }
  socket.on('webrtc:offer', ({ session_id, sdp } = {}) => {
    if (!session_id || !sdp) return;

    const session = sessions.get(session_id);
    if (!session) return;

    // Relay offer to everyone in the room except the sender
    socket.to(session.room).emit('webrtc:offer', { session_id, sdp });
  });

  // ── WebRTC Answer ──────────────────────────────────────────────────────
  // Callee sends: { session_id: string, sdp: RTCSessionDescriptionInit }
  socket.on('webrtc:answer', ({ session_id, sdp } = {}) => {
    if (!session_id || !sdp) return;

    const session = sessions.get(session_id);
    if (!session) return;

    socket.to(session.room).emit('webrtc:answer', { session_id, sdp });
  });

  // ── ICE Candidate ──────────────────────────────────────────────────────
  // Either side sends: { session_id: string, candidate: RTCIceCandidateInit }
  socket.on('webrtc:ice-candidate', ({ session_id, candidate } = {}) => {
    if (!session_id || !candidate) return;

    const session = sessions.get(session_id);
    if (!session) return;

    socket.to(session.room).emit('webrtc:ice-candidate', { session_id, candidate });
  });

  // ── Call End ───────────────────────────────────────────────────────────
  // Either side sends: { session_id: string }
  socket.on('call:end', ({ session_id } = {}) => {
    if (!session_id) return;
    cleanupSession(session_id, socket, 'call_ended');
  });

  // ── Disconnect ─────────────────────────────────────────────────────────
  socket.on('disconnect', (reason) => {
    console.log('User disconnected:', socket.id, '—', reason);
    if (registeredUserId) {
      // Only remove if this is still the active socket for that user
      if (userSockets.get(registeredUserId) === socket.id) {
        userSockets.delete(registeredUserId);
      }
    }

    // End any sessions this socket was part of
    for (const [session_id, session] of sessions.entries()) {
      if (session.callerId === socket.id || session.calleeId === socket.id) {
        cleanupSession(session_id, socket, 'peer_disconnected');
      }
    }
  });

  // ── Error guard ────────────────────────────────────────────────────────
  socket.on('error', (err) => {
    console.error(`[socket error] socket=${socket.id}`, err.message);
  });
});

function cleanupSession(session_id, triggeringSocket, reason) {
  const session = sessions.get(session_id);
  if (!session) return;

  // Notify everyone else in the room that the call ended
  triggeringSocket.to(session.room).emit('call:ended', { session_id, reason });

  // Remove all sockets from the room
  const socketsInRoom = io.sockets.adapter.rooms.get(session.room);
  if (socketsInRoom) {
    for (const socketId of socketsInRoom) {
      const s = io.sockets.sockets.get(socketId);
      if (s) s.leave(session.room);
    }
  }

  sessions.delete(session_id);
}

httpServer.listen(PORT, () => {
  console.log(`[signaling] listening on port ${PORT}`);
});
