import React from 'react';
import type { RoomRecord, PlayerRecord } from '@abc/shared';
import controllerLogo from '../assets/controller-waiting-room/logo.png';
import trophyImage from '../assets/gameover/optimized/trophy-clean.png';
import winnerBadge from '../assets/gameover/optimized/winner-badge.webp';
import medalSecond from '../assets/gameover/optimized/medal-second.webp';
import medalThird from '../assets/gameover/optimized/medal-third.webp';
import { CONTROLLER_AVATAR_IMAGES } from '../utils/avatarAssets';

interface Props {
  room: RoomRecord;
  players: (PlayerRecord & { id: string })[];
  userId: string;
  isDealer: boolean;
  onPlayAgain: () => void;
}

const FALLBACK_COLORS = ['#7854dc', '#3094de', '#58cf00', '#f59c16', '#ef3f94', '#7f55e6'];

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function initials(name: string) {
  return name.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2) || '?';
}

function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

function PlayerAvatar({ player, className = '' }: { player: PlayerRecord; className?: string }) {
  const src = player.avatarId ? CONTROLLER_AVATAR_IMAGES[player.avatarId] : undefined;

  if (src) {
    return (
      <span className={`controller-summary-avatar ${className}`}>
        <img src={src} alt="" aria-hidden="true" />
      </span>
    );
  }

  return (
    <span
      className={`controller-summary-avatar controller-summary-avatar-fallback ${className}`}
      style={{ background: avatarColor(player.name) }}
    >
      {initials(player.name)}
    </span>
  );
}

function RankBadge({ rank, large = false }: { rank: number; large?: boolean }) {
  if (rank === 1) {
    return <img className={`controller-summary-rank-image winner${large ? ' large' : ''}`} src={winnerBadge} alt="1st place" />;
  }
  if (rank === 2) {
    return <img className={`controller-summary-rank-image${large ? ' large' : ''}`} src={medalSecond} alt="2nd place" />;
  }
  if (rank === 3) {
    return <img className={`controller-summary-rank-image${large ? ' large' : ''}`} src={medalThird} alt="3rd place" />;
  }
  return <span className={`controller-summary-rank-fallback${large ? ' large' : ''}`}>{rank}</span>;
}

export default function SummaryScreen({ players, userId, onPlayAgain }: Props) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const myRank = sorted.findIndex(player => player.id === userId) + 1;
  const me = sorted.find(player => player.id === userId);

  if (!me) return null;

  return (
    <div className="page join2-page">
      <main className="controller-summary">
        <span className="controller-summary-float bubble bubble-one" aria-hidden="true"></span>
        <span className="controller-summary-float bubble bubble-two" aria-hidden="true"></span>
        <span className="controller-summary-float bubble bubble-three" aria-hidden="true"></span>
        <span className="controller-summary-float bubble bubble-four" aria-hidden="true"></span>
        <span className="controller-summary-float star star-one" aria-hidden="true">*</span>
        <span className="controller-summary-float star star-two" aria-hidden="true">*</span>
        <span className="controller-summary-float star star-three" aria-hidden="true">*</span>
        <span className="controller-summary-float squiggle squiggle-one" aria-hidden="true"></span>
        <span className="controller-summary-float squiggle squiggle-two" aria-hidden="true"></span>
        <span className="controller-summary-float square square-one" aria-hidden="true"></span>
        <span className="controller-summary-float square square-two" aria-hidden="true"></span>
        <span className="controller-summary-float square square-three" aria-hidden="true"></span>

        <section className="controller-summary-content">
          <img className="controller-summary-logo" src={controllerLogo} alt="ABC Fast or Slow" />

          <section className="controller-summary-hero">
            <div className="controller-summary-trophy-wrap" aria-hidden="true">
              <div className="controller-summary-rays"></div>
              <img className="controller-summary-trophy" src={trophyImage} alt="" />
            </div>
            <h1 className="controller-summary-title">Game Over!</h1>
            <p className="controller-summary-subtitle">{myRank === 1 ? 'You won!' : `You finished ${ordinal(myRank)}.`}</p>
          </section>

          <section className="controller-summary-score-card">
            <div className="controller-summary-score-label">YOUR FINAL SCORE</div>
            <div className="controller-summary-score-main">
              <RankBadge rank={myRank} large />
              <div className="controller-summary-score-copy">
                <div className="controller-summary-score-name">
                  {me.name}
                  <span> (you)</span>
                </div>
                <div className="controller-summary-score-points-wrap">
                  <span className="controller-summary-score-accent left" aria-hidden="true"></span>
                  <div className="controller-summary-score-points">{me.score} pts</div>
                  <span className="controller-summary-score-accent right" aria-hidden="true"></span>
                </div>
              </div>
            </div>
          </section>

          <section className="controller-summary-standings-card">
            <div className="controller-summary-standings-pill">FINAL STANDINGS</div>
            <div className="controller-summary-standings-list">
              {sorted.map((player, index) => (
                <div key={player.id} className={`controller-summary-standing-row${player.id === userId ? ' me' : ''}`}>
                  <RankBadge rank={index + 1} />
                  <PlayerAvatar player={player} className="standing" />
                  <div className="controller-summary-standing-name">
                    {player.name}
                    {player.id === userId ? ' (you)' : ''}
                  </div>
                  <div className="controller-summary-standing-score">{player.score} pts</div>
                </div>
              ))}
            </div>
          </section>

          <button className="controller-summary-play-again" type="button" onClick={onPlayAgain}>
            <span>Play Again</span>
          </button>

          <button className="controller-summary-home-button" type="button" onClick={onPlayAgain}>
            <span>Back to Home</span>
          </button>
        </section>
      </main>
    </div>
  );
}
