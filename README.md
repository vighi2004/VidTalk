# 🎥 VidTalk — Collaborative Video Conferencing with Chat + Whiteboard

> Open to contributions • Built with love for the open‑source community 💛  
> If you like this project, please ⭐ star the repo — it helps a ton!

VidTalk is a real‑time video meeting app with:
- WebRTC video/audio
- Socket.IO signaling + group chat
- A slick right‑side Whiteboard (with labels + eraser) that saves to History
- Guest vs. Logged‑in chat behavior
- Screen share, mic/cam toggles, participant name tags
- Clean layout that keeps chat/board from overlapping video tiles

---

## ✨ Features

- 🔊 WebRTC audio/video with Google STUN
- 🧩 Socket.IO signaling for P2P setup
- 💬 Group chat
  - Guest: chat is not persisted and clears when leaving
  - Logged-in: chat persists per session (not across logins)
  - Clear Chat button
- 🖍️ Whiteboard panel (right side)
  - White background, brush size/color, label while drawing
  - Eraser tool (true “white paint” on white board)
  - Clear board
  - Mutually exclusive with Chat (opening one closes the other)
  - Persisted locally per meeting; previewable from History
- 👤 Participant name tags on video tiles
- 🧱 Square, responsive video tiles (grid never hides behind side panels)
- 🖥 Screen share toggle
- 📱 Plays inline on mobile (no full-screen hijack)

---

## 🧰 Tech Stack

- Frontend: React + Hooks
- UI: MUI (Material UI)
- Realtime: socket.io-client
- Media: WebRTC (getUserMedia/getDisplayMedia)
- Styling: CSS Modules
- Storage:
  - Chat: session-only for logged-in users
  - Whiteboard: localStorage (per meeting, local to device)
- Routing: react-router-dom (for History page)

---

## 📦 Packages to Install

Frontend:
```bash
npm i react react-dom
npm i @mui/material @mui/icons-material
npm i socket.io-client
npm i react-router-dom
