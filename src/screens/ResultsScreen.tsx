import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { RoomRecord, PlayerRecord, AnswerCategory } from '@abc/shared';
import { ANSWER_KEYS, CATEGORY_LABELS } from '@abc/shared';
import {
  controllerLogo as gameplayLogo,
  controllerDecorMain as bubbleLg,
  controllerDecorBubble as bubbleSm,
  controllerDecorBubble as bubbleRight,
  controllerDecorCyanTile as starOne,
  controllerDecorCyanTile as starTwo,
  controllerDecorSparkle as sparkleOne,
  controllerDecorSparkle as sparkleTwo,
  controllerDecorPinkSquiggle as squigglePink,
  controllerDecorGreenSquiggle as squiggleGreen,
  controllerDecorPinkTile as blobBlue,
  controllerDecorPinkTile as blobPink,
} from '../assets/controllerTheme';
import winnerBadge from '../assets/gameover/optimized/winner-badge.webp';
import medalSecond from '../assets/gameover/optimized/medal-second.webp';
import medalThird from '../assets/gameover/optimized/medal-third.webp';
import { CONTROLLER_AVATAR_IMAGES } from '../utils/avatarAssets';

interface Props {
  room: RoomRecord;
  players: (PlayerRecord & { id: string })[];
  userId: string;
  isDealer: boolean;
  onApprove: (playerId: string, category: AnswerCategory, approved: boolean) => Promise<void>;
  onAdvance: () => Promise<void>;
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
      <span className={`controller-results-avatar ${className}`}>
        <img src={src} alt="" aria-hidden="true" />
      </span>
    );
  }

  return (
    <span
      className={`controller-results-avatar controller-results-avatar-fallback ${className}`}
      style={{ background: avatarColor(player.name) }}
    >
      {initials(player.name)}
    </span>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <img className="controller-results-rank-image winner" src={winnerBadge} alt="1st place" />;
  if (rank === 2) return <img className="controller-results-rank-image" src={medalSecond} alt="2nd place" />;
  if (rank === 3) return <img className="controller-results-rank-image" src={medalThird} alt="3rd place" />;
  return <span className="controller-results-rank-fallback">{rank}</span>;
}

function getAnswerReviewState(room: RoomRecord, playerId: string, category: AnswerCategory, rawAnswer: string) {
  const answer = rawAnswer.trim();
  if (!answer) return { label: 'Blank', tone: 'blank' as const, valid: false };

  const override = room.answerOverrides?.[`${playerId}:${category}`];
  if (override === true) return { label: 'Accepted', tone: 'accepted' as const, valid: true };
  if (override === false) return { label: 'Rejected', tone: 'rejected' as const, valid: false };

  const startsRight = answer[0]?.toUpperCase() === room.currentLetter.toUpperCase();
  if (!startsRight) return { label: 'Wrong letter', tone: 'rejected' as const, valid: false };
  return { label: 'Accepted', tone: 'accepted' as const, valid: true };
}

export default function ResultsScreen({ room, players, userId, isDealer, onApprove, onAdvance }: Props) {
  const [advancing, setAdvancing] = useState(false);
  const [overriding, setOverriding] = useState<string | null>(null);
  const [currentReviewIndex, setCurrentReviewIndex] = useState(0);
  const swipeStartX = useRef<number | null>(null);

  const sorted = useMemo(() => [...players].sort((a, b) => b.score - a.score), [players]);
  const me = sorted.find(player => player.id === userId);
  const myRank = sorted.findIndex(player => player.id === userId) + 1;
  const isLastRound = room.roundNumber >= room.settings.rounds;

  const reviewPlayers = useMemo(
    () => [...players].sort((a, b) => {
      const aMs = a.joinedAt ? (a.joinedAt as { toMillis: () => number }).toMillis() : 0;
      const bMs = b.joinedAt ? (b.joinedAt as { toMillis: () => number }).toMillis() : 0;
      return aMs - bMs;
    }),
    [players],
  );

  useEffect(() => {
    if (!reviewPlayers.length) return;
    setCurrentReviewIndex(index => Math.min(index, reviewPlayers.length - 1));
  }, [reviewPlayers.length]);

  const currentReviewPlayer = reviewPlayers[currentReviewIndex] ?? reviewPlayers[0];
  const currentReviewSummary = useMemo(() => {
    if (!currentReviewPlayer) return { accepted: 0, rejected: 0, blank: 0 };

    return ANSWER_KEYS.reduce(
      (acc, category) => {
        const reviewState = getAnswerReviewState(room, currentReviewPlayer.id, category, currentReviewPlayer.answers?.[category] ?? '');
        if (reviewState.tone === 'accepted') acc.accepted += 1;
        else if (reviewState.tone === 'blank') acc.blank += 1;
        else acc.rejected += 1;
        return acc;
      },
      { accepted: 0, rejected: 0, blank: 0 },
    );
  }, [currentReviewPlayer, room]);

  async function handleApprove(playerId: string, category: AnswerCategory, approved: boolean) {
    const key = `${playerId}:${category}`;
    setOverriding(key);
    try {
      await onApprove(playerId, category, approved);
    } finally {
      setOverriding(null);
    }
  }

  async function handleAdvance() {
    if (advancing) return;
    setAdvancing(true);
    try {
      await onAdvance();
    } catch {
      setAdvancing(false);
    }
  }

  function goPrevPlayer() {
    setCurrentReviewIndex(index => Math.max(0, index - 1));
  }

  function goNextPlayer() {
    setCurrentReviewIndex(index => Math.min(reviewPlayers.length - 1, index + 1));
  }

  function handleReviewAction() {
    if (currentReviewIndex < reviewPlayers.length - 1) {
      goNextPlayer();
      return;
    }
    void handleAdvance();
  }

  function onTouchStart(event: React.TouchEvent<HTMLElement>) {
    swipeStartX.current = event.changedTouches[0]?.clientX ?? null;
  }

  function onTouchEnd(event: React.TouchEvent<HTMLElement>) {
    const start = swipeStartX.current;
    const end = event.changedTouches[0]?.clientX ?? null;
    swipeStartX.current = null;
    if (start == null || end == null) return;
    const delta = end - start;
    if (Math.abs(delta) < 44) return;
    if (delta < 0) goNextPlayer();
    if (delta > 0) goPrevPlayer();
  }

  return (
    <div className="page join2-page">
      <main className="controller-results">
        <img className="controller-results-decor controller-results-bubble-lg" src={bubbleLg} alt="" aria-hidden="true" />
        <img className="controller-results-decor controller-results-bubble-sm" src={bubbleSm} alt="" aria-hidden="true" />
        <img className="controller-results-decor controller-results-bubble-right" src={bubbleRight} alt="" aria-hidden="true" />
        <img className="controller-results-decor controller-results-star-one" src={starOne} alt="" aria-hidden="true" />
        <img className="controller-results-decor controller-results-star-two" src={starTwo} alt="" aria-hidden="true" />
        <img className="controller-results-decor controller-results-sparkle-one" src={sparkleOne} alt="" aria-hidden="true" />
        <img className="controller-results-decor controller-results-sparkle-two" src={sparkleTwo} alt="" aria-hidden="true" />
        <img className="controller-results-decor controller-results-squiggle-pink" src={squigglePink} alt="" aria-hidden="true" />
        <img className="controller-results-decor controller-results-squiggle-green" src={squiggleGreen} alt="" aria-hidden="true" />
        <img className="controller-results-decor controller-results-blob-blue" src={blobBlue} alt="" aria-hidden="true" />
        <img className="controller-results-decor controller-results-blob-pink" src={blobPink} alt="" aria-hidden="true" />

        <section className="controller-results-content">
          <header className="controller-results-topbar">
            <button
              className="controller-results-back"
              type="button"
              aria-label="Previous player"
              onClick={isDealer ? goPrevPlayer : undefined}
              disabled={!isDealer || currentReviewIndex === 0}
            >
              <ChevronLeftIcon />
            </button>
            <img className="controller-results-logo" src={gameplayLogo} alt="ABC Fast or Slow" />
            <div className="controller-results-topbar-spacer" aria-hidden="true" />
          </header>

          <section className="controller-results-hero">
            <h1 className="controller-results-title">{isDealer ? `Score Round ${room.roundNumber}` : `Round ${room.roundNumber} Scoring`}</h1>
            <p className="controller-results-letter">Letter <span>{room.currentLetter}</span></p>
          </section>

          {isDealer ? (
            <>
              <section className="controller-results-score-card">
                <div className="controller-results-score-label">THIS ROUND</div>
                <div className="controller-results-score-points">+{me?.roundScore ?? 0} pts</div>
                <div className="controller-results-score-total">Total: {me?.score ?? 0} pts</div>
                <div className="controller-results-score-rank">
                  <TrophyMiniIcon />
                  <span>{ordinal(myRank)} place</span>
                </div>
              </section>

              {currentReviewPlayer && (
                <section
                  className="controller-results-review-shell"
                  onTouchStart={onTouchStart}
                  onTouchEnd={onTouchEnd}
                >
                  <div className="controller-results-review-player">
                    <div className="controller-results-review-player-left">
                      <RankBadge rank={currentReviewIndex + 1} />
                      <PlayerAvatar player={currentReviewPlayer} />
                      <div>
                        <div className="controller-results-review-label">Reviewing</div>
                        <div className="controller-results-review-name">{currentReviewPlayer.name}</div>
                      </div>
                    </div>
                    <div className="controller-results-review-count">{currentReviewIndex + 1} of {reviewPlayers.length} players</div>
                  </div>

                  <div className="controller-results-review-summary">
                    <span className="accepted">{currentReviewSummary.accepted} accepted</span>
                    <span className="rejected">{currentReviewSummary.rejected} rejected</span>
                    <span className="blank">{currentReviewSummary.blank} blank</span>
                  </div>

                  <section className="controller-results-answers-card">
                    <div className="controller-results-card-heading">REVIEW ANSWERS</div>
                    <div className="controller-results-answer-list">
                      {ANSWER_KEYS.map(category => {
                        const answer = (currentReviewPlayer.answers?.[category] ?? '').trim();
                        const reviewKey = `${currentReviewPlayer.id}:${category}`;
                        const reviewState = getAnswerReviewState(room, currentReviewPlayer.id, category, answer);
                        const busy = overriding === reviewKey;

                        return (
                          <div key={category} className="controller-results-answer-row">
                            <div className="controller-results-answer-category">{CATEGORY_LABELS[category]}</div>
                            <div className={`controller-results-answer-value${answer ? '' : ' empty'}${reviewState.valid ? ' valid' : ''}`}>
                              {answer || 'blank'}
                            </div>
                            <div className={`controller-results-answer-state ${reviewState.tone}`}>
                              {reviewState.label}
                            </div>
                            <div className="controller-results-answer-actions">
                              <button
                                className={`controller-results-answer-btn approve${reviewState.tone === 'accepted' ? ' active' : ''}`}
                                type="button"
                                disabled={busy}
                                onClick={() => void handleApprove(currentReviewPlayer.id, category, true)}
                                aria-label={`Approve ${CATEGORY_LABELS[category]}`}
                              >
                                <CheckIcon />
                              </button>
                              <button
                                className={`controller-results-answer-btn reject${reviewState.tone === 'rejected' ? ' active' : ''}`}
                                type="button"
                                disabled={busy}
                                onClick={() => void handleApprove(currentReviewPlayer.id, category, false)}
                                aria-label={`Reject ${CATEGORY_LABELS[category]}`}
                              >
                                <CloseIcon />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="controller-results-tip">
                      <LightBulbIcon />
                      <p>Green is accepted, red is rejected, blank means no answer. Swipe left or right to move between players.</p>
                    </div>
                  </section>

                  <button className="controller-results-next-button" type="button" onClick={handleReviewAction} disabled={advancing}>
                    <span>{advancing ? 'Loading...' : currentReviewIndex < reviewPlayers.length - 1 ? 'Review Next Player' : isLastRound ? 'See Final Results' : 'Next Round'}</span>
                    <ArrowRightIcon />
                  </button>
                </section>
              )}
            </>
          ) : (
            <>
              <section className="controller-results-wait-card">
                <HourglassIcon />
                <div>
                  <h2>Waiting for dealer</h2>
                  <p>Your answers are locked and being reviewed.</p>
                </div>
              </section>

              <section className="controller-results-answers-card waiting">
                <div className="controller-results-card-heading">YOUR SUBMITTED ANSWERS</div>
                <div className="controller-results-answer-list compact">
                  {ANSWER_KEYS.map(category => {
                    const answer = (me?.answers?.[category] ?? '').trim();
                    const reviewState = getAnswerReviewState(room, me?.id ?? userId, category, answer);
                    return (
                      <div key={category} className="controller-results-answer-row compact">
                        <div className="controller-results-answer-category">{CATEGORY_LABELS[category]}</div>
                        <div className={`controller-results-answer-value${reviewState.valid ? ' valid' : answer ? '' : ' empty'}`}>{answer || 'blank'}</div>
                        <div className={`controller-results-answer-state ${reviewState.tone}`}>{reviewState.label}</div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="controller-results-leaderboard-card">
                <div className="controller-results-card-heading align-left">LEADERBOARD</div>
                <div className="controller-results-leaderboard-list">
                  {sorted.map((player, index) => (
                    <div key={player.id} className={`controller-results-leaderboard-row${player.id === userId ? ' me' : ''}`}>
                      <RankBadge rank={index + 1} />
                      <PlayerAvatar player={player} className="small" />
                      <div className="controller-results-leaderboard-name">
                        {player.name}
                        {player.id === userId ? ' (you)' : ''}
                      </div>
                      <div className="controller-results-leaderboard-score">{player.score} pts</div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="controller-results-locked-card">
                <LockIcon />
                <div>
                  <h3>Waiting for dealer...</h3>
                  <p>Accepted and rejected answers will update here before the next round starts.</p>
                </div>
              </section>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14.5 5 8 11.5 14.5 18" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrophyMiniIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 4h8v3.2c0 2.2-1.8 4-4 4s-4-1.8-4-4V4Z" fill="currentColor" />
      <path d="M9.5 13h5M10 18h4M12 11v7M6 5H4c0 2.4 1.4 4 3.6 4.5M18 5h2c0 2.4-1.4 4-3.6 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m6.5 12.5 3.3 3.3 7.7-8.1" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h13M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HourglassIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 3h10M7 21h10M8 3c0 4 4 4.4 4 9s-4 5-4 9M16 3c0 4-4 4.4-4 9s4 5 4 9M9.4 9.3h5.2M9.4 14.7h5.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LightBulbIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3a6 6 0 0 0-3.8 10.6c.7.6 1.2 1.5 1.4 2.4h4.8c.2-.9.7-1.8 1.4-2.4A6 6 0 0 0 12 3Z" fill="currentColor" />
      <path d="M9.5 18h5M10.5 21h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 10V8a4 4 0 1 1 8 0v2M7 10h10a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
