import React, { useState } from 'react';
import type { RoomRecord, PlayerRecord } from '@abc/shared';
import backgroundLogo from '../assets/controller-waiting-room/logo.png';
import bubbleLg from '../assets/controller-waiting-room/decor.png';
import bubbleSm from '../assets/controller-waiting-room/decor-2.png';
import bubbleRight from '../assets/controller-waiting-room/decor-3.png';
import starOne from '../assets/controller-waiting-room/decor-4.png';
import starTwo from '../assets/controller-waiting-room/decor-5.png';
import sparkleOne from '../assets/controller-waiting-room/decor-6.png';
import sparkleTwo from '../assets/controller-waiting-room/decor-7.png';
import squigglePink from '../assets/controller-waiting-room/decor-8.png';
import squiggleGreen from '../assets/controller-waiting-room/decor-9.png';
import blobBlue from '../assets/controller-waiting-room/decor-10.png';
import blobPink from '../assets/controller-waiting-room/decor-11.png';
import { CONTROLLER_AVATAR_IMAGES } from '../utils/avatarAssets';

interface Props {
  room: RoomRecord;
  roomCode: string;
  players: (PlayerRecord & { id: string })[];
  userId: string;
  playerName: string;
  isDealer: boolean;
  onStart: () => Promise<void>;
}

const FALLBACK_COLORS = ['#7854dc', '#3094de', '#58cf00', '#f59c16', '#ef3f94', '#7f55e6'];

function initials(name: string) {
  return name.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2) || '?';
}

function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

function PlayerAvatar({ player, className }: { player: PlayerRecord; className: string }) {
  const src = player.avatarId ? CONTROLLER_AVATAR_IMAGES[player.avatarId] : undefined;
  if (src) {
    return (
      <span className={className}>
        <img src={src} alt="" aria-hidden="true" />
      </span>
    );
  }

  return (
    <span className={`${className} waitroom-fallback`} style={{ background: avatarColor(player.name) }}>
      {initials(player.name)}
    </span>
  );
}

export default function LobbyScreen({ room, roomCode, players, userId, playerName, isDealer, onStart }: Props) {
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);
  const me = players.find(player => player.id === userId);
  const myPlayer: PlayerRecord = me ?? {
    name: playerName || 'Player',
    avatarId: undefined,
    isDealer,
    score: 0,
    submitted: false,
  };
  const joinedCount = players.length;

  async function handleStart() {
    setStarting(true);
    try {
      await onStart();
    } catch {
      setStarting(false);
    }
  }

  async function handleCopyCode() {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="page join2-page">
      <main className={`waitroom-phone ${isDealer ? 'waitroom-dealer-mode' : 'waitroom-nondealer-mode'}`}>
        <img className="waitroom-decor waitroom-bubble-lg" src={bubbleLg} alt="" aria-hidden="true" />
        <img className="waitroom-decor waitroom-bubble-sm" src={bubbleSm} alt="" aria-hidden="true" />
        <img className="waitroom-decor waitroom-bubble-right" src={bubbleRight} alt="" aria-hidden="true" />
        <img className="waitroom-decor waitroom-star-one" src={starOne} alt="" aria-hidden="true" />
        <img className="waitroom-decor waitroom-star-two" src={starTwo} alt="" aria-hidden="true" />
        <img className="waitroom-decor waitroom-sparkle-one" src={sparkleOne} alt="" aria-hidden="true" />
        <img className="waitroom-decor waitroom-sparkle-two" src={sparkleTwo} alt="" aria-hidden="true" />
        <img className="waitroom-decor waitroom-squiggle-pink" src={squigglePink} alt="" aria-hidden="true" />
        <img className="waitroom-decor waitroom-squiggle-green" src={squiggleGreen} alt="" aria-hidden="true" />
        <img className="waitroom-decor waitroom-blob-blue" src={blobBlue} alt="" aria-hidden="true" />
        <img className="waitroom-decor waitroom-blob-pink" src={blobPink} alt="" aria-hidden="true" />

        <section className="waitroom-content">
          <img className="waitroom-logo" src={backgroundLogo} alt="ABC Fast or Slow" />

          <h1 className={`waitroom-title ${isDealer ? 'dealer' : ''}`}>
            {isDealer ? "You're the dealer!" : "You're in!"}
          </h1>

          <p className="waitroom-subtitle">
            {isDealer ? 'Start when everyone is ready.' : 'Waiting for the dealer to start.'}
          </p>

          <section className="waitroom-glass waitroom-player-hero" aria-label="Your player">
            <PlayerAvatar player={myPlayer} className="waitroom-main-avatar" />

            <div>
              <p className="waitroom-player-name">{myPlayer.name}</p>
              <div className="waitroom-chips">
                <span className="waitroom-chip you">YOU</span>
                {isDealer && (
                  <span className="waitroom-chip dealer">
                    <CrownIcon />
                    DEALER
                  </span>
                )}
              </div>
            </div>
          </section>

          <section className="waitroom-glass waitroom-players-card">
            <div className="waitroom-card-header">
              <div className="waitroom-section-icon"><PlayersIcon /></div>
              <div>
                <h2 className="waitroom-section-title">Players</h2>
                <p className="waitroom-section-sub">{joinedCount} joined</p>
              </div>
              <div className="waitroom-mini-avatars">
                {players.slice(0, 3).map(player => (
                  <PlayerAvatar key={player.id} player={player} className="waitroom-mini-avatar" />
                ))}
              </div>
            </div>

            {!isDealer ? (
              <div className="waitroom-player-list">
                {players.map(player => (
                  <div key={player.id} className="waitroom-player-row">
                    <PlayerAvatar player={player} className="waitroom-row-avatar" />
                    <span className="waitroom-row-name">{player.name}</span>
                    {player.id === room.currentDealerId ? (
                      <span className="waitroom-row-badge dealer">Dealer</span>
                    ) : player.id === userId ? (
                      <span className="waitroom-row-badge you">You</span>
                    ) : (
                      <span></span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="waitroom-waiting-copy">Waiting for more players...</p>
            )}
          </section>

          <section className="waitroom-glass waitroom-invite-card" aria-label="Invite players">
            <div className="waitroom-section-icon"><ShareIcon /></div>
            <div>
              <h2 className="waitroom-invite-title">Invite players</h2>
              <p className="waitroom-room-code">Room Code: <strong>{roomCode}</strong></p>
            </div>
            <button className="waitroom-icon-button" type="button" aria-label="Copy room code" onClick={handleCopyCode}>
              <CopyIcon />
            </button>
          </section>

          <div className="waitroom-actions">
            {isDealer ? (
              <button className="waitroom-primary-button" type="button" onClick={handleStart} disabled={starting}>
                <PlayIcon />
                {starting ? 'STARTING GAME' : 'START GAME'}
              </button>
            ) : (
              <button className="waitroom-waiting-button" type="button" aria-disabled="true">
                <ClockIcon />
                WAITING FOR DEALER
              </button>
            )}

            <button className="waitroom-secondary-button" type="button" onClick={handleCopyCode}>
              <ShareIcon />
              {copied ? 'CODE COPIED' : 'INVITE PLAYERS'}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}

function CrownIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M11 45l5-25 13 15 3-19 3 19 13-15 5 25H11z" fill="currentColor" />
      <rect x="13" y="43" width="38" height="8" rx="4" fill="currentColor" />
    </svg>
  );
}

function PlayersIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="24" cy="24" r="9" fill="currentColor" />
      <circle cx="43" cy="27" r="7" fill="currentColor" opacity=".7" />
      <path d="M10 52c2.8-11 9-16 15-16s12.2 5 15 16" fill="currentColor" />
      <path d="M33 52c1.7-7.5 6-11.2 10.7-11.2 4.7 0 8.5 3.6 10.3 11.2" fill="currentColor" opacity=".7" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M24 25l16-9M24 39l16 9" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      <circle cx="20" cy="32" r="8" fill="currentColor" />
      <circle cx="46" cy="14" r="8" fill="currentColor" />
      <circle cx="46" cy="50" r="8" fill="currentColor" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="20" y="18" width="28" height="32" rx="6" fill="none" stroke="currentColor" strokeWidth="5" />
      <rect x="14" y="12" width="28" height="32" rx="6" fill="none" stroke="currentColor" strokeWidth="5" opacity=".55" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M23 16l26 16-26 16V16z" fill="currentColor" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" strokeWidth="6" />
      <path d="M32 20v14l10 7" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
