import React, { useEffect, useRef, useState } from 'react'
import io from "socket.io-client";
import { Badge, IconButton, TextField } from '@mui/material';
import { Button } from '@mui/material';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff'
import styles from "../styles/videoComponent.module.css";
import CallEndIcon from '@mui/icons-material/CallEnd'
import MicIcon from '@mui/icons-material/Mic'
import MicOffIcon from '@mui/icons-material/MicOff'
import ScreenShareIcon from '@mui/icons-material/ScreenShare';
import StopScreenShareIcon from '@mui/icons-material/StopScreenShare'
import ChatIcon from '@mui/icons-material/Chat'
import ClearAllIcon from '@mui/icons-material/ClearAll'
import BrushIcon from '@mui/icons-material/Brush'
import BackspaceIcon from '@mui/icons-material/Backspace'
import server from '../environment';

const server_url =server;

var connections = {};

const peerConfigConnections = {
    "iceServers": [
        { "urls": "stun:stun.l.google.com:19302" }
    ]
}

export default function VideoMeetComponent() {

    var socketRef = useRef();
    let socketIdRef = useRef();

    let localVideoref = useRef();

    let [videoAvailable, setVideoAvailable] = useState(true);
    let [audioAvailable, setAudioAvailable] = useState(true);

    let [video, setVideo] = useState(true);
    let [audio, setAudio] = useState(true);

    let [screen, setScreen] = useState();

    let [showModal, setModal] = useState(true);
    let [screenAvailable, setScreenAvailable] = useState();

    let [messages, setMessages] = useState([])
    let [message, setMessage] = useState("");
    let [newMessages, setNewMessages] = useState(0);

    let [askForUsername, setAskForUsername] = useState(true);
    let [username, setUsername] = useState("");

    const videoRef = useRef([])
    let [videos, setVideos] = useState([])

    const peerNamesRef = useRef({});

    // Chat filtering
    const joinAtRef = useRef(Date.now());
    const clearedAtRef = useRef(0);

    // Logged-in check (adjust keys if your app differs)
    const isUserLoggedIn = () => {
        try {
            const token = localStorage.getItem('authToken') || localStorage.getItem('token') || sessionStorage.getItem('token');
            if (token) return true;
            const user = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || 'null');
            return !!(user && (user.id || user._id || user.email));
        } catch {
            return false;
        }
    };
    const isLoggedInRef = useRef(isUserLoggedIn());

    // ========= Whiteboard (right-side panel) =========
    const CHAT_WIDTH_CSS = 'min(380px, 30vw)';
    const BOARD_WIDTH_CSS = 'min(620px, 45vw)'; // bigger than chat

    const [showBoard, setShowBoard] = useState(false);
    const boardContainerRef = useRef(null);
    const boardCanvasRef = useRef(null);
    const boardCtxRef = useRef(null);
    const boardDPRRef = useRef(1);
    const boardPathsRef = useRef([]); // [{points:[{x,y}], color, size, label, eraser?}]
    const drawingRef = useRef(false);
    const localStrokeRef = useRef(null);
    const remoteStrokesRef = useRef({});
    const [boardColor, setBoardColor] = useState('#1e90ff');
    const [boardSize, setBoardSize] = useState(4);
    const [boardLabel, setBoardLabel] = useState('');
    const [pointerLabel, setPointerLabel] = useState({ visible: false, x: 0, y: 0 });
    const [eraser, setEraser] = useState(false);

    // Whiteboard history persistence (local only, per meeting)
    const deriveMeetingCode = () => {
        try {
            const url = new URL(window.location.href);
            const params = url.searchParams;
            const qp = params.get('code') || params.get('meetingCode') || params.get('room') || params.get('id');
            if (qp) return qp;
            const parts = url.pathname.split('/').filter(Boolean);
            const last = parts[parts.length - 1];
            if (last && last.length >= 3 && last !== 'meet') return last;
            return encodeURIComponent(url.href);
        } catch {
            return encodeURIComponent(window.location.href);
        }
    };
    const meetingCodeRef = useRef(deriveMeetingCode());
    const wbOpenEverRef = useRef(false); // opened at least once
    const wbUsedRef = useRef(false);     // actually drew something while board was open
    const wbStartAtRef = useRef(null);   // when first used

    const wbIndexKey = (code) => `wb:index:${code}`;
    const wbItemKey = (code, id) => `wb:item:${code}:${id}`;

    const saveWhiteboardSession = async () => {
        if (!wbOpenEverRef.current || !wbUsedRef.current || boardPathsRef.current.length === 0) return;
        const code = meetingCodeRef.current;
        const id = wbStartAtRef.current || Date.now();

        // Create a snapshot even if board is closed
        const snapshot = makeSnapshotFromPaths(boardPathsRef.current, 1000, 700); // 1000x700 PNG
        const item = {
            id,
            meetingCode: code,
            startedAt: wbStartAtRef.current || Date.now(),
            endedAt: Date.now(),
            author: username || 'Guest',
            snapshot,
            paths: boardPathsRef.current,
            w: 1000,
            h: 700
        };
        try {
            const idx = JSON.parse(localStorage.getItem(wbIndexKey(code)) || '[]');
            const newIdx = [...idx.filter(x => x !== id), id]; // keep unique, push last
            localStorage.setItem(wbIndexKey(code), JSON.stringify(newIdx));
            localStorage.setItem(wbItemKey(code, id), JSON.stringify(item));
        } catch {}
    };
    // ================================================

    // Get permissions once
    useEffect(() => {
        getPermissions();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    let getDislayMedia = () => {
        if (screen) {
            if (navigator.mediaDevices.getDisplayMedia) {
                navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
                    .then(getDislayMediaSuccess)
                    .then((stream) => { })
                    .catch((e) => console.log(e))
            }
        }
    }

    const getPermissions = async () => {
        try {
            const videoPermission = await navigator.mediaDevices.getUserMedia({ video: true });
            setVideoAvailable(!!videoPermission);

            const audioPermission = await navigator.mediaDevices.getUserMedia({ audio: true });
            setAudioAvailable(!!audioPermission);

            setScreenAvailable(!!navigator.mediaDevices.getDisplayMedia);

            if (videoAvailable || audioAvailable) {
                const userMediaStream = await navigator.mediaDevices.getUserMedia({ video: videoAvailable, audio: audioAvailable });
                if (userMediaStream) {
                    window.localStream = userMediaStream;
                    if (localVideoref.current) {
                        localVideoref.current.srcObject = userMediaStream;
                    }
                }
            }
        } catch (error) {
            console.log(error);
        }
    };

    useEffect(() => {
        if (video !== undefined && audio !== undefined) {
            getUserMedia();
        }
    }, [video, audio])

    let getMedia = () => {
        setVideo(videoAvailable);
        setAudio(audioAvailable);
        connectToSocketServer();
    }

    let getUserMediaSuccess = (stream) => {
        try {
            window.localStream.getTracks().forEach(track => track.stop())
        } catch (e) { console.log(e) }

        window.localStream = stream
        if (localVideoref.current) localVideoref.current.srcObject = stream

        for (let id in connections) {
            if (id === socketIdRef.current) continue

            connections[id].addStream(window.localStream)

            connections[id].createOffer().then((description) => {
                connections[id].setLocalDescription(description)
                    .then(() => {
                        socketRef.current.emit('signal', id, JSON.stringify({ 'sdp': connections[id].localDescription, meta: { username } }))
                    })
                    .catch(e => console.log(e))
            })
        }

        stream.getTracks().forEach(track => track.onended = () => {
            try {
                let tracks = localVideoref.current?.srcObject?.getTracks()
                tracks && tracks.forEach(track => track.stop())
            } catch (e) { console.log(e) }

            let blackSilence = (...args) => new MediaStream([black(...args), silence()])
            window.localStream = blackSilence()
            if (localVideoref.current) localVideoref.current.srcObject = window.localStream

            for (let id in connections) {
                connections[id].addStream(window.localStream)

                connections[id].createOffer().then((description) => {
                    connections[id].setLocalDescription(description)
                        .then(() => {
                            socketRef.current.emit('signal', id, JSON.stringify({ 'sdp': connections[id].localDescription, meta: { username } }))
                        })
                        .catch(e => console.log(e))
                })
            }
        })
    }

    let getUserMedia = () => {
        if ((video && videoAvailable) || (audio && audioAvailable)) {
            navigator.mediaDevices.getUserMedia({ video: video, audio: audio })
                .then(getUserMediaSuccess)
                .then((stream) => { })
                .catch((e) => console.log(e))
        } else {
            try {
                let tracks = localVideoref.current.srcObject.getTracks()
                tracks.forEach(track => track.stop())
            } catch (e) { }
        }
    }

    let getDislayMediaSuccess = (stream) => {
        try {
            window.localStream.getTracks().forEach(track => track.stop())
        } catch (e) { console.log(e) }

        window.localStream = stream
        if (localVideoref.current) localVideoref.current.srcObject = stream

        for (let id in connections) {
            if (id === socketIdRef.current) continue

            connections[id].addStream(window.localStream)

            connections[id].createOffer().then((description) => {
                connections[id].setLocalDescription(description)
                    .then(() => {
                        socketRef.current.emit('signal', id, JSON.stringify({ 'sdp': connections[id].localDescription, meta: { username } }))
                    })
                    .catch(e => console.log(e))
            })
        }

        stream.getTracks().forEach(track => track.onended = () => {
            setScreen(false)

            try {
                let tracks = localVideoref.current?.srcObject?.getTracks()
                tracks && tracks.forEach(track => track.stop())
            } catch (e) { console.log(e) }

            let blackSilence = (...args) => new MediaStream([black(...args), silence()])
            window.localStream = blackSilence()
            if (localVideoref.current) localVideoref.current.srcObject = window.localStream

            getUserMedia()
        })
    }

    // Whiteboard broadcast over signal channel
    const broadcastWB = (payload) => {
        for (let id in connections) {
            if (id === socketIdRef.current) continue;
            try {
                socketRef.current.emit('signal', id, JSON.stringify({ wb: payload }));
            } catch (e) {}
        }
    };

    // Handle incoming whiteboard events
    const handleWBFromPeer = (fromId, wb) => {
        if (wb.type === 'clear') {
            boardPathsRef.current = [];
            if (showBoard) redrawBoard();
            return;
        }

        const markUsedIfOpen = () => {
            if (showBoard && !wbUsedRef.current) {
                wbUsedRef.current = true;
                wbStartAtRef.current = Date.now();
            }
        };

        if (wb.type === 'start') {
            remoteStrokesRef.current[fromId] = {
                color: wb.color || '#1e90ff',
                size: wb.size || 4,
                label: wb.label || '',
                eraser: !!wb.eraser,
                points: [wb.p],
            };
            if (showBoard) {
                drawStrokeSegment(null, wb.p, wb.eraser ? '#ffffff' : (wb.color || '#1e90ff'), wb.size || 4);
            }
            markUsedIfOpen();
            return;
        }

        if (wb.type === 'seg') {
            const s = remoteStrokesRef.current[fromId];
            if (!s) return;
            const prev = s.points[s.points.length - 1];
            s.points.push(wb.p);
            if (showBoard) {
                drawStrokeSegment(prev, wb.p, s.eraser ? '#ffffff' : s.color, s.size);
            }
            markUsedIfOpen();
            return;
        }

        if (wb.type === 'end') {
            const s = remoteStrokesRef.current[fromId];
            if (!s) return;
            const prev = s.points[s.points.length - 1];
            const last = wb.p || prev;
            if (showBoard && prev && last) {
                drawStrokeSegment(prev, last, s.eraser ? '#ffffff' : s.color, s.size);
                if (s.label && !s.eraser) drawTextLabel(s.label, last, s.color);
            }
            boardPathsRef.current.push({ ...s });
            delete remoteStrokesRef.current[fromId];
            markUsedIfOpen();
            return;
        }
    };

    let gotMessageFromServer = (fromId, message) => {
        var signal = JSON.parse(message)

        // Whiteboard
        if (signal?.wb) {
            handleWBFromPeer(fromId, signal.wb);
            return;
        }

        // store peer's username if present
        if (signal?.meta?.username) {
            peerNamesRef.current[fromId] = signal.meta.username;
            setVideos(vs => vs.map(v => v.socketId === fromId ? { ...v, username: signal.meta.username } : v));
        }

        if (fromId !== socketIdRef.current) {
            if (signal.sdp) {
                connections[fromId].setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(() => {
                    if (signal.sdp.type === 'offer') {
                        connections[fromId].createAnswer().then((description) => {
                            connections[fromId].setLocalDescription(description).then(() => {
                                socketRef.current.emit('signal', fromId, JSON.stringify({ 'sdp': connections[fromId].localDescription, meta: { username } }))
                            }).catch(e => console.log(e))
                        }).catch(e => console.log(e))
                    }
                }).catch(e => console.log(e))
            }

            if (signal.ice) {
                connections[fromId].addIceCandidate(new RTCIceCandidate(signal.ice)).catch(e => console.log(e))
            }
        }
    }

    let connectToSocketServer = () => {
        socketRef.current = io.connect(server_url, { secure: false })

        socketRef.current.on('signal', gotMessageFromServer)

        socketRef.current.on('connect', () => {
            // reset join time and chat state
            joinAtRef.current = Date.now();
            setMessages([]);
            setNewMessages(0);

            socketRef.current.emit('join-call', window.location.href)
            socketIdRef.current = socketRef.current.id

            socketRef.current.on('chat-message', addMessage)

            socketRef.current.on('user-left', (id) => {
                setVideos((videos) => videos.filter((video) => video.socketId !== id))
            })

            socketRef.current.on('user-joined', (id, clients) => {
                clients.forEach((socketListId) => {

                    connections[socketListId] = new RTCPeerConnection(peerConfigConnections)

                    // Wait for their ice candidate
                    connections[socketListId].onicecandidate = function (event) {
                        if (event.candidate != null) {
                            socketRef.current.emit('signal', socketListId, JSON.stringify({ 'ice': event.candidate, meta: { username } }))
                        }
                    }

                    // Wait for their video stream
                    connections[socketListId].onaddstream = (event) => {
                        let videoExists = videoRef.current.find(video => video.socketId === socketListId);

                        if (videoExists) {
                            setVideos(videos => {
                                const updatedVideos = videos.map(video =>
                                    video.socketId === socketListId ? { ...video, stream: event.stream } : video
                                );
                                videoRef.current = updatedVideos;
                                return updatedVideos;
                            });
                        } else {
                            let newVideo = {
                                socketId: socketListId,
                                stream: event.stream,
                                autoplay: true,
                                playsinline: true,
                                username: peerNamesRef.current[socketListId] || `User ${socketListId.slice(-4)}`
                            };

                            setVideos(videos => {
                                const updatedVideos = [...videos, newVideo];
                                videoRef.current = updatedVideos;
                                return updatedVideos;
                            });
                        }
                    };

                    // Add the local video stream
                    if (window.localStream !== undefined && window.localStream !== null) {
                        connections[socketListId].addStream(window.localStream)
                    } else {
                        let blackSilence = (...args) => new MediaStream([black(...args), silence()])
                        window.localStream = blackSilence()
                        connections[socketListId].addStream(window.localStream)
                    }
                })

                if (id === socketIdRef.current) {
                    for (let id2 in connections) {
                        if (id2 === socketIdRef.current) continue

                        try {
                            connections[id2].addStream(window.localStream)
                        } catch (e) { }

                        connections[id2].createOffer().then((description) => {
                            connections[id2].setLocalDescription(description)
                                .then(() => {
                                    socketRef.current.emit('signal', id2, JSON.stringify({ 'sdp': connections[id2].localDescription, meta: { username } }))
                                })
                                .catch(e => console.log(e))
                        })
                    }
                }
            })
        })
    }

    let silence = () => {
        let ctx = new AudioContext()
        let oscillator = ctx.createOscillator()
        let dst = oscillator.connect(ctx.createMediaStreamDestination())
        oscillator.start()
        ctx.resume()
        return Object.assign(dst.stream.getAudioTracks()[0], { enabled: false })
    }
    let black = ({ width = 640, height = 480 } = {}) => {
        let canvas = Object.assign(document.createElement("canvas"), { width, height })
        canvas.getContext('2d').fillRect(0, 0, width, height)
        let stream = canvas.captureStream()
        return Object.assign(stream.getVideoTracks()[0], { enabled: false })
    }

    let handleVideo = () => {
        const stream = localVideoref.current?.srcObject;
        if (stream) {
            stream.getVideoTracks().forEach(t => (t.enabled = !t.enabled));
        }
        setVideo(v => !v);
    }

    let handleAudio = () => {
        const stream = localVideoref.current?.srcObject;
        if (stream) {
            stream.getAudioTracks().forEach(t => (t.enabled = !t.enabled));
        }
        setAudio(a => !a);
    }

    useEffect(() => {
        if (screen !== undefined) {
            getDislayMedia();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [screen])

    let handleScreen = () => {
        setScreen(!screen);
    }

    const clearChats = () => {
        setMessages([]);
        setNewMessages(0);
        clearedAtRef.current = Date.now();
    };

    let handleEndCall = async () => {
        // Save whiteboard session if used and open at least once
        await saveWhiteboardSession();

        // Guest: clear chat visually
        if (!isLoggedInRef.current) {
            clearChats();
        }
        try {
            let tracks = localVideoref.current.srcObject.getTracks()
            tracks.forEach(track => track.stop())
        } catch (e) { }
        window.location.href = "/"
    }

    let openChat = () => {
        setModal(true);
        setShowBoard(false); // mutual exclusive
        setNewMessages(0);
    }
    let closeChat = () => {
        setModal(false);
    }

    let handleMessage = (e) => {
        setMessage(e.target.value);
    }

    // Chat with timestamp filtering
    const addMessage = (data, sender, socketIdSender) => {
        let text = data;
        let ts = undefined;
        try {
            const obj = JSON.parse(data);
            if (obj && typeof obj === 'object') {
                if ('t' in obj) text = obj.t;
                if ('text' in obj && text === undefined) text = obj.text;
                ts = obj.ts ?? obj.time ?? obj.timestamp;
            }
        } catch {}

        const now = Date.now();
        const msgTs = typeof ts === 'number' ? ts : undefined;
        const threshold = Math.max(joinAtRef.current || 0, clearedAtRef.current || 0);

        if (typeof msgTs === 'number') {
            if (msgTs < threshold) return;
        } else {
            if (now - joinAtRef.current < 2000) return;
        }

        setMessages((prev) => [...prev, { sender, data: text }]);
        if (socketIdSender !== socketIdRef.current) {
            setNewMessages((prevNew) => prevNew + 1);
        }
    };

    let sendMessage = () => {
        const trimmed = message.trim();
        if (!trimmed) return;
        const payload = JSON.stringify({ t: trimmed, ts: Date.now() });
        socketRef.current.emit('chat-message', payload, username)
        setMessage("");
    }

    let connect = () => {
        setAskForUsername(false);
        getMedia();
    }

    // ================= Whiteboard helpers =================
    const setupBoardCanvas = () => {
        const canvas = boardCanvasRef.current;
        const parent = boardContainerRef.current;
        if (!canvas || !parent) return;
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        boardDPRRef.current = dpr;
        const w = parent.clientWidth || 1;
        const h = parent.clientHeight || 1;
        canvas.width = Math.max(1, Math.floor(w * dpr));
        canvas.height = Math.max(1, Math.floor(h * dpr));
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        const ctx = canvas.getContext('2d');
        ctx.setTransform(1,0,0,1,0,0);
        ctx.scale(dpr, dpr);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        boardCtxRef.current = ctx;
        redrawBoard();
    };

    const getCssSize = () => {
        const parent = boardContainerRef.current;
        return { w: parent?.clientWidth || 0, h: parent?.clientHeight || 0 };
    };

    const toCss = (p) => {
        const { w, h } = getCssSize();
        return { x: p.x * w, y: p.y * h };
    };

    const fromEventToNorm = (e) => {
        const rect = boardCanvasRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
    };

    const clearCanvas = () => {
        const ctx = boardCtxRef.current; if (!ctx) return;
        const { w, h } = getCssSize();
        // white background
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
    };

    const drawStrokeSegment = (prev, curr, color, size) => {
        const ctx = boardCtxRef.current; if (!ctx || !curr) return;
        const p2 = toCss(curr);
        ctx.strokeStyle = color;
        ctx.lineWidth = size;
        ctx.beginPath();
        if (prev) {
            const p1 = toCss(prev);
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
        } else {
            // dot
            ctx.arc(p2.x, p2.y, size / 2, 0, Math.PI * 2);
        }
        ctx.stroke();
    };

    const drawTextLabel = (label, atNormPoint, color = '#000') => {
        if (!label) return;
        const ctx = boardCtxRef.current; if (!ctx || !atNormPoint) return;
        const p = toCss(atNormPoint);
        const fontSize = 12;
        ctx.font = `${fontSize}px sans-serif`;
        // label bubble
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        const padding = 4;
        ctx.fillRect(p.x + 8, p.y - fontSize - padding*2, ctx.measureText(label).width + padding*2, fontSize + padding*2);
        ctx.fillStyle = '#000';
        ctx.fillText(label, p.x + 8 + padding, p.y - padding);
    };

    const redrawBoard = () => {
        clearCanvas();
        const paths = boardPathsRef.current || [];
        paths.forEach(s => {
            const strokeColor = s.eraser ? '#ffffff' : s.color;
            for (let i = 1; i < s.points.length; i++) {
                drawStrokeSegment(s.points[i - 1], s.points[i], strokeColor, s.size);
            }
            if (s.label && !s.eraser) drawTextLabel(s.label, s.points[s.points.length - 1], strokeColor);
        });
    };

    const onBoardPointerDown = (e) => {
        if (!showBoard) return;
        e.preventDefault();
        drawingRef.current = true;
        wbOpenEverRef.current = true;
        if (!wbUsedRef.current) {
            wbUsedRef.current = true;
            wbStartAtRef.current = Date.now();
        }
        const p = fromEventToNorm(e);
        localStrokeRef.current = { color: boardColor, size: boardSize, label: boardLabel, points: [p], eraser };
        const drawColor = eraser ? '#ffffff' : boardColor;
        drawStrokeSegment(null, p, drawColor, boardSize);
        if (boardLabel && !eraser) {
            const css = toCss(p);
            setPointerLabel({ visible: true, x: css.x, y: css.y });
        }
        broadcastWB({ type: 'start', p, color: boardColor, size: boardSize, label: boardLabel, eraser, ts: Date.now() });
    };

    const onBoardPointerMove = (e) => {
        if (!showBoard || !drawingRef.current || !localStrokeRef.current) return;
        e.preventDefault();
        const p = fromEventToNorm(e);
        const pts = localStrokeRef.current.points;
        const prev = pts[pts.length - 1];
        pts.push(p);
        const drawColor = localStrokeRef.current.eraser ? '#ffffff' : localStrokeRef.current.color;
        drawStrokeSegment(prev, p, drawColor, localStrokeRef.current.size);
        if (boardLabel && !localStrokeRef.current.eraser) {
            const css = toCss(p);
            setPointerLabel({ visible: true, x: css.x, y: css.y });
        }
        broadcastWB({ type: 'seg', p, ts: Date.now() });
    };

    const endLocalStroke = (e) => {
        if (!showBoard || !drawingRef.current || !localStrokeRef.current) return;
        e && e.preventDefault();
        drawingRef.current = false;
        const s = localStrokeRef.current;
        const last = s.points[s.points.length - 1];
        if (s.label && !s.eraser) drawTextLabel(s.label, last, s.color);
        boardPathsRef.current.push({ ...s });
        localStrokeRef.current = null;
        setPointerLabel(pl => ({ ...pl, visible: false }));
        broadcastWB({ type: 'end', p: last, ts: Date.now() });
    };

    // Save on whiteboard close if used
    useEffect(() => {
        if (!showBoard) {
            // persist only if opened and used
            saveWhiteboardSession();
        } else {
            wbOpenEverRef.current = true;
            // setup canvas on open
            setTimeout(setupBoardCanvas, 0);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showBoard]);
    // ===================================================

    // Whiteboard canvas lifecycle: size + redraw
    useEffect(() => {
        if (!showBoard) return;
        setupBoardCanvas();
        const onResize = () => setupBoardCanvas();
        window.addEventListener('resize', onResize);
        return () => {
            window.removeEventListener('resize', onResize);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showBoard, showModal])

    // Build a snapshot from paths (even if board is closed)
    const makeSnapshotFromPaths = (paths, outW = 1000, outH = 700) => {
        const c = document.createElement('canvas');
        c.width = outW; c.height = outH;
        const ctx = c.getContext('2d');
        // white bg
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, outW, outH);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const toPx = (p) => ({ x: p.x * outW, y: p.y * outH });
        const drawSeg = (prev, curr, color, size) => {
            if (!curr) return;
            const p2 = toPx(curr);
            ctx.strokeStyle = color;
            ctx.lineWidth = size;
            ctx.beginPath();
            if (prev) {
                const p1 = toPx(prev);
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
            } else {
                ctx.arc(p2.x, p2.y, size / 2, 0, Math.PI * 2);
            }
            ctx.stroke();
        };
        const drawLbl = (label, at, color) => {
            if (!label) return;
            const p = toPx(at);
            const fontSize = 20;
            ctx.font = `${fontSize}px sans-serif`;
            ctx.fillStyle = '#000';
            ctx.fillText(label, p.x + 8, p.y - 8);
        };
        (paths || []).forEach(s => {
            const color = s.eraser ? '#ffffff' : s.color || '#1e90ff';
            for (let i = 1; i < s.points.length; i++) {
                drawSeg(s.points[i - 1], s.points[i], color, s.size || 4);
            }
            if (s.label && !s.eraser) drawLbl(s.label, s.points[s.points.length - 1], color);
        });
        return c.toDataURL('image/png');
    };

    return (
        <div>
            {askForUsername === true ?
                <div className={styles.lobbyWrap}>
                    <h2>Enter into Lobby</h2>
                    <div className={styles.lobbyActions}>
                        <TextField
                            id="outlined-basic"
                            label="Username"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            variant="outlined"
                        />
                        <Button variant="contained" onClick={connect}>Connect</Button>
                    </div>
                    <div>
                        <video ref={localVideoref} autoPlay muted playsInline></video>
                    </div>
                </div>
                :
                <div className={styles.meetVideoContainer}>
                    {showModal ? (
                        <div className={styles.chatRoom}>
                            <div className={styles.chatContainer}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <h2 style={{ margin: 0 }}>Chat</h2>
                                    <Button size="small" variant="text" startIcon={<ClearAllIcon />} onClick={clearChats}>
                                        Clear
                                    </Button>
                                </div>

                                <div className={styles.chattingDisplay}>
                                    {messages.length !== 0 ? messages.map((item, index) => (
                                        <div style={{ marginBottom: "12px" }} key={index}>
                                            <p style={{ fontWeight: "bold", margin: 0 }}>{item.sender}</p>
                                            <p style={{ margin: 0 }}>{item.data}</p>
                                        </div>
                                    )) : <p>No Messages Yet</p>}
                                </div>

                                <div className={styles.chattingArea}>
                                    <TextField
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        id="outlined-basic"
                                        label="Enter your chat"
                                        variant="outlined"
                                        fullWidth
                                    />
                                    <Button variant='contained' onClick={sendMessage}>Send</Button>
                                </div>
                            </div>
                        </div>
                    ) : null}

                    {/* Whiteboard right-side panel (bigger than chat), white background */}
                    {showBoard && (
                        <div
                            ref={boardContainerRef}
                            style={{
                                position: 'absolute',
                                top: 10,
                                right: 10,
                                bottom: 100, // above control bar
                                width: BOARD_WIDTH_CSS,
                                zIndex: 40,
                                borderRadius: 10,
                                overflow: 'hidden',
                                background: '#ffffff',
                                boxShadow: '0 6px 24px rgba(0,0,0,0.3)',
                                border: '1px solid rgba(0,0,0,0.1)'
                            }}
                        >
                            {/* Tools bar */}
                            <div
                                style={{
                                    position: 'absolute',
                                    top: 8,
                                    left: 8,
                                    right: 8,
                                    display: 'flex',
                                    gap: 8,
                                    alignItems: 'center',
                                    zIndex: 2,
                                    background: 'rgba(0,0,0,0.06)',
                                    padding: '6px 8px',
                                    borderRadius: 8,
                                    color: '#000',
                                    backdropFilter: 'blur(2px)'
                                }}
                            >
                                <TextField
                                    size="small"
                                    label="Label"
                                    value={boardLabel}
                                    onChange={e => setBoardLabel(e.target.value)}
                                    variant="outlined"
                                />
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <label style={{ fontSize: 12 }}>Color</label>
                                    <input type="color" value={boardColor} onChange={(e) => setBoardColor(e.target.value)} />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <label style={{ fontSize: 12 }}>Size</label>
                                    <input
                                        type="range"
                                        min={2}
                                        max={12}
                                        value={boardSize}
                                        onChange={(e) => setBoardSize(parseInt(e.target.value || '4', 10))}
                                    />
                                </div>
                                <Button
                                    size="small"
                                    variant={eraser ? 'contained' : 'outlined'}
                                    startIcon={<BackspaceIcon />}
                                    onClick={() => setEraser(e => !e)}
                                >
                                    Eraser
                                </Button>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={() => {
                                        boardPathsRef.current = [];
                                        redrawBoard();
                                        broadcastWB({ type: 'clear', ts: Date.now() });
                                    }}
                                >
                                    Clear Board
                                </Button>
                                <div style={{ flex: 1 }} />
                                <Button
                                    size="small"
                                    variant="contained"
                                    onClick={async () => {
                                        await saveWhiteboardSession();
                                        setShowBoard(false);
                                    }}
                                >
                                    Close
                                </Button>
                            </div>

                            {/* Live label bubble near pointer */}
                            {pointerLabel.visible && boardLabel ? (
                                <div
                                    style={{
                                        position: 'absolute',
                                        left: pointerLabel.x,
                                        top: pointerLabel.y,
                                        transform: 'translate(8px, -24px)',
                                        background: 'rgba(0,0,0,0.7)',
                                        color: '#fff',
                                        fontSize: 12,
                                        padding: '2px 6px',
                                        borderRadius: 4,
                                        pointerEvents: 'none',
                                        zIndex: 3
                                    }}
                                >
                                    {boardLabel}
                                </div>
                            ) : null}

                            <canvas
                                ref={boardCanvasRef}
                                onPointerDown={onBoardPointerDown}
                                onPointerMove={onBoardPointerMove}
                                onPointerUp={endLocalStroke}
                                onPointerLeave={endLocalStroke}
                                style={{ width: '100%', height: '100%' }}
                            />
                        </div>
                    )}

                    <div className={styles.buttonContainers}>
                        <IconButton onClick={handleVideo} style={{ color: "white" }}>
                            {video === true ? <VideocamIcon /> : <VideocamOffIcon />}
                        </IconButton>
                        <IconButton onClick={handleEndCall} style={{ color: "red" }}>
                            <CallEndIcon />
                        </IconButton>
                        <IconButton onClick={handleAudio} style={{ color: "white" }}>
                            {audio === true ? <MicIcon /> : <MicOffIcon />}
                        </IconButton>

                        {screenAvailable === true ?
                            <IconButton onClick={handleScreen} style={{ color: "white" }}>
                                {screen === true ? <ScreenShareIcon /> : <StopScreenShareIcon />}
                            </IconButton> : null}

                        {/* Whiteboard toggle: opens board and closes chat */}
                        <IconButton
                            onClick={() => {
                                const next = !showBoard;
                                setShowBoard(next);
                                if (next) setModal(false); // mutual exclusive
                            }}
                            style={{ color: showBoard ? "#4caf50" : "white" }}
                            title="Whiteboard"
                        >
                            <BrushIcon />
                        </IconButton>

                        <Badge badgeContent={newMessages} max={999} color='error'>
                            <IconButton
                                onClick={() => {
                                    const next = !showModal;
                                    setModal(next);
                                    if (next) {
                                        setShowBoard(false); // mutual exclusive
                                        setNewMessages(0);
                                    }
                                }}
                                style={{ color: "white" }}
                            >
                                <ChatIcon />
                            </IconButton>
                        </Badge>
                    </div>

                    {/* Local video with username tag */}
                    <div className={styles.localVideoWrapper}>
                        <video className={styles.meetUserVideo} ref={localVideoref} autoPlay muted playsInline></video>
                        <div className={styles.nameTag}>{username || "You"}</div>
                    </div>

                    {/* Conference grid; reserve right margin for whichever side panel is open */}
                    <div
                        className={styles.conferenceView}
                        style={{
                            marginRight: showBoard
                                ? `calc(${BOARD_WIDTH_CSS} + 16px)`
                                : (showModal ? `calc(${CHAT_WIDTH_CSS} + 16px)` : 0)
                        }}
                    >
                        {videos.map((video) => (
                            <div
                                className={styles.videoTile}
                                key={video.socketId}
                                style={{
                                    width: 'clamp(140px, 28vw, 240px)',
                                    aspectRatio: '1 / 1',
                                    borderRadius: 10,
                                    overflow: 'hidden',
                                    background: 'black'
                                }}
                            >
                                <video
                                    data-socket={video.socketId}
                                    ref={ref => {
                                        if (ref && video.stream) {
                                            ref.srcObject = video.stream;
                                        }
                                    }}
                                    autoPlay
                                    playsInline
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover',
                                        borderRadius: 0
                                    }}
                                />
                                <div className={styles.nameTag}>
                                    {video.username || `User ${video.socketId.slice(-4)}`}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            }
        </div>
    )
}