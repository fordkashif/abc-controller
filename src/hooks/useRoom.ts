import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import type { RoomRecord, PlayerRecord } from '@abc/shared';

const PLAYER_STALE_MS = 90_000;

function isFreshTimestamp(ts?: { toMillis: () => number }) {
  if (!ts) return true;
  return Date.now() - ts.toMillis() <= PLAYER_STALE_MS;
}

export function useRoom(roomId: string | null, userId?: string | null) {
  const [room, setRoom]       = useState<RoomRecord | null>(null);
  const [players, setPlayers] = useState<(PlayerRecord & { id: string })[]>([]);
  const [roomLoaded, setRoomLoaded] = useState(false);
  const [playersLoaded, setPlayersLoaded] = useState(false);

  useEffect(() => {
    if (!roomId) {
      setRoom(null);
      setPlayers([]);
      setRoomLoaded(false);
      setPlayersLoaded(false);
      return;
    }

    setRoomLoaded(false);
    setPlayersLoaded(false);

    const unsub1 = onSnapshot(doc(db, 'rooms', roomId), snap => {
      setRoom(snap.exists() ? (snap.data() as RoomRecord) : null);
      setRoomLoaded(true);
    });

    const unsub2 = onSnapshot(collection(db, 'rooms', roomId, 'players'), snap => {
      setPlayers(snap.docs.map(d => ({ id: d.id, ...(d.data() as PlayerRecord) })));
      setPlayersLoaded(true);
    });

    return () => { unsub1(); unsub2(); };
  }, [roomId]);

  const activePlayers = players.filter(player => player.id === userId || isFreshTimestamp(player.lastSeenAt));

  return { room, players, activePlayers, roomLoaded, playersLoaded };
}
