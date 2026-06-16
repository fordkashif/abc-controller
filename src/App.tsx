import React, { useEffect, useState } from 'react';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase/config';
import { useRoom } from './hooks/useRoom';
import {
  updateHeartbeat, leaveRoom, startGame,
  endRound, approveAnswer, advanceRound, forceEndGame, ensureActiveDealer,
} from './firebase/roomActions';
import type { RoomRecord, AnswerCategory } from '@abc/shared';

import JoinScreen      from './screens/JoinScreen';
import LobbyScreen     from './screens/LobbyScreen';
import PlayScreen      from './screens/PlayScreen';
import SubmittedScreen from './screens/SubmittedScreen';
import ResultsScreen   from './screens/ResultsScreen';
import SummaryScreen   from './screens/SummaryScreen';

type Phase = 'auth' | 'join' | 'lobby' | 'playing' | 'submitted' | 'results' | 'summary';
type StoredControllerSession = {
  roomId: string;
  roomCode: string;
  playerName: string;
};

const CONTROLLER_SESSION_KEY = 'abc-controller-session';

function getCodeFromUrl(): string {
  return new URLSearchParams(window.location.search).get('code') ?? '';
}

function readStoredSession(): StoredControllerSession | null {
  try {
    const raw = localStorage.getItem(CONTROLLER_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredControllerSession>;
    if (!parsed.roomId || !parsed.roomCode || !parsed.playerName) return null;
    return {
      roomId: parsed.roomId,
      roomCode: parsed.roomCode,
      playerName: parsed.playerName,
    };
  } catch {
    return null;
  }
}

function writeStoredSession(session: StoredControllerSession) {
  localStorage.setItem(CONTROLLER_SESSION_KEY, JSON.stringify(session));
}

function clearStoredSession() {
  localStorage.removeItem(CONTROLLER_SESSION_KEY);
}

export default function App() {
  const [userId, setUserId]             = useState<string | null>(null);
  const [phase, setPhase]               = useState<Phase>('auth');
  const [roomId, setRoomId]             = useState<string | null>(null);
  const [roomCode, setRoomCode]         = useState('');
  const [playerName, setPlayerName]     = useState('');
  const [myAnswers, setMyAnswers]       = useState<Record<string, string>>({});
  const [trackedRound, setTrackedRound] = useState(0);
  const [restoreAttempted, setRestoreAttempted] = useState(false);
  const [browserOnline, setBrowserOnline] = useState(() => navigator.onLine);

  const { room, players, activePlayers, roomLoaded, playersLoaded } = useRoom(roomId, userId);

  const isDealer = !!(room && userId && room.currentDealerId === userId);

  // Anonymous auth on mount
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      if (user) { setUserId(user.uid); setPhase('join'); }
      else       { signInAnonymously(auth); }
    });
    return unsub;
  }, []);

  useEffect(() => {
    function onOnline() { setBrowserOnline(true); }
    function onOffline() { setBrowserOnline(false); }
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Restore controller session after refresh/reload
  useEffect(() => {
    if (!userId || roomId || restoreAttempted) return;
    const stored = readStoredSession();
    setRestoreAttempted(true);
    if (!stored) return;
    setRoomId(stored.roomId);
    setRoomCode(stored.roomCode);
    setPlayerName(stored.playerName);
    setPhase('lobby');
  }, [userId, roomId, restoreAttempted]);

  // Presence heartbeat
  useEffect(() => {
    if (!roomId || !userId) return;
    const hb = setInterval(() => updateHeartbeat(roomId, userId), 20_000);
    return () => { clearInterval(hb); };
  }, [roomId, userId]);

  // If the saved session no longer maps to a real player, give reconnect a short grace window.
  useEffect(() => {
    if (!roomId || !userId || !roomLoaded || !playersLoaded) return;

    if (!room) {
      clearStoredSession();
      setRoomId(null);
      setRoomCode('');
      setPlayerName('');
      setMyAnswers({});
      setTrackedRound(0);
      setPhase('join');
      return;
    }

    const stillInRoom = players.some(player => player.id === userId);
    if (stillInRoom) return;

    const timeout = window.setTimeout(() => {
      clearStoredSession();
      setRoomId(null);
      setRoomCode('');
      setPlayerName('');
      setMyAnswers({});
      setTrackedRound(0);
      setPhase('join');
    }, browserOnline ? 8_000 : 15_000);

    return () => window.clearTimeout(timeout);
  }, [roomId, userId, room, players, roomLoaded, playersLoaded, browserOnline]);

  // Auto-end if player count drops below 2 during an active game
  useEffect(() => {
    if (!room || !roomId || !userId) return;
    if (room.status !== 'playing' && room.status !== 'round_ended') return;
    if (activePlayers.length < 2) {
      forceEndGame(roomId);
    }
  }, [activePlayers.length, room?.status, roomId, userId]);

  useEffect(() => {
    if (!room || !roomId || activePlayers.length < 1) return;
    if (activePlayers.some(player => player.id === room.currentDealerId)) return;
    void ensureActiveDealer(roomId, room, activePlayers);
  }, [room, roomId, activePlayers]);

  // Drive phase from room state
  useEffect(() => {
    if (!room || !userId) return;
    const myPlayer = players.find(p => p.id === userId);

    if (room.status === 'waiting') { setPhase('lobby'); return; }

    if (room.status === 'playing') {
      if (room.roundNumber !== trackedRound) {
        setTrackedRound(room.roundNumber);
        setMyAnswers({});
        setPhase('playing');
        return;
      }
      setPhase(myPlayer?.submitted ? 'submitted' : 'playing');
      return;
    }

    if (room.status === 'round_ended') { setPhase('results'); return; }
    if (room.status === 'finished')    { setPhase('summary'); return; }
  }, [room, players, userId, trackedRound]);

  function handleJoined(id: string, r: RoomRecord, name: string) {
    setRoomId(id);
    setRoomCode(r.code);
    setPlayerName(name);
    writeStoredSession({ roomId: id, roomCode: r.code, playerName: name });
    setPhase(r.status === 'waiting' ? 'lobby' : 'playing');
  }

  function handlePlayAgain() {
    if (roomId && userId) leaveRoom(roomId, userId);
    clearStoredSession();
    setRoomId(null);
    setRoomCode('');
    setPlayerName('');
    setMyAnswers({});
    setTrackedRound(0);
    setPhase('join');
  }

  async function doStartGame() {
    if (!roomId || !userId) return;
    await startGame(roomId, userId, activePlayers.map(p => p.id));
  }

  async function doEndRound() {
    if (!roomId || !room) return;
    await endRound(roomId, room, activePlayers);
  }

  async function doApprove(playerId: string, category: AnswerCategory, approved: boolean) {
    if (!roomId || !room) return;
    await approveAnswer(roomId, room, activePlayers, playerId, category, approved);
  }

  async function doAdvance() {
    if (!roomId || !room) return;
    await advanceRound(roomId, room, activePlayers);
  }

  const isReconnecting = !!roomId && (!roomLoaded || !playersLoaded || (!!room && !players.some(player => player.id === userId)));
  const connectionBanner = !browserOnline
    ? 'Disconnected. Trying to reconnect...'
    : isReconnecting
      ? 'Reconnecting...'
      : '';

  function withConnectionBanner(screen: React.ReactNode) {
    return (
      <>
        {connectionBanner && (
          <div className={`controller-connection-banner ${browserOnline ? 'reconnecting' : 'offline'}`}>
            {connectionBanner}
          </div>
        )}
        {screen}
      </>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (phase === 'auth') {
    return (
      <div className="page-center">
        <div style={{ fontSize: 52, fontWeight: 900, color: '#58cc02' }}>ABC</div>
        <div className="wait-dots">
          <div className="wait-dot" /><div className="wait-dot" /><div className="wait-dot" />
        </div>
      </div>
    );
  }

  if (phase === 'join' || !room || !userId) {
    return withConnectionBanner(
      <JoinScreen
        initialCode={getCodeFromUrl()}
        userId={userId ?? ''}
        onJoined={handleJoined}
      />
    );
  }

  if (phase === 'lobby') {
    return withConnectionBanner(
      <LobbyScreen
        room={room}
        roomCode={roomCode}
        players={activePlayers}
        userId={userId}
        playerName={playerName}
        isDealer={isDealer}
        onStart={doStartGame}
      />
    );
  }

  if (phase === 'playing') {
    return withConnectionBanner(
      <PlayScreen
        room={room}
        roomId={roomId!}
        userId={userId}
        players={activePlayers}
        isDealer={isDealer}
        onSubmitted={(ans) => { setMyAnswers(ans); setPhase('submitted'); }}
        onEndRound={doEndRound}
      />
    );
  }

  if (phase === 'submitted') {
    return withConnectionBanner(
      <SubmittedScreen
        room={room}
        players={activePlayers}
        userId={userId}
        myAnswers={myAnswers}
        isDealer={isDealer}
        onEndRound={doEndRound}
      />
    );
  }

  if (phase === 'results') {
    return withConnectionBanner(
      <ResultsScreen
        room={room}
        players={activePlayers}
        userId={userId}
        isDealer={isDealer}
        onApprove={doApprove}
        onAdvance={doAdvance}
      />
    );
  }

  if (phase === 'summary') {
    return withConnectionBanner(
      <SummaryScreen
        room={room}
        players={activePlayers}
        userId={userId}
        isDealer={isDealer}
        onPlayAgain={handlePlayAgain}
      />
    );
  }

  return null;
}
