/**
 * useReadyNotifications — Poll des plats marqués "prêts" par la cuisine.
 *
 * Active seulement pour les rôles non-cuisinier (salle/admin/manager).
 * Toast + son distinct + compteur dans le header.
 */
import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const POLL_MS = 10000;
const SINCE_SEC = 30;

// Beep aigu pour différencier d'autres toasts
const READY_SOUND = "data:audio/wav;base64,UklGRiwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQgAAAB/f39/f39/fw==";

export default function useReadyNotifications(currentUser) {
  const [unread, setUnread] = useState(0);
  const seenRef = useRef(new Set());
  const audioRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!audioRef.current) {
      audioRef.current = new Audio(READY_SOUND);
    }
  }, []);

  useEffect(() => {
    const role = currentUser?.role;
    if (!role || role === "cuisinier") return;
    let cancel = false;

    const tick = async () => {
      try {
        const r = await axios.get(`${API}/cuisine/ready-notifications`, {
          params: { actor_role: role, since_seconds: SINCE_SEC },
          timeout: 8000,
        });
        if (cancel) return;
        const list = r.data.notifications || [];
        let newCount = 0;
        for (const n of list) {
          for (const it of (n.ready_items || [])) {
            const key = `${n.table_id}-${it.name}-${it.ready_at}`;
            if (!seenRef.current.has(key)) {
              seenRef.current.add(key);
              newCount++;
              toast.success(`🍽️ Plat prêt — Table ${n.table_number} : ${it.name} (x${it.quantity})`, { duration: 6000 });
            }
          }
          if (n.all_ready) {
            const allKey = `${n.table_id}-allready`;
            if (!seenRef.current.has(allKey)) {
              seenRef.current.add(allKey);
              newCount++;
              toast.success(`✅ Bon Table ${n.table_number} : TOUT EST PRÊT`, { duration: 8000 });
            }
          }
        }
        if (newCount > 0) {
          setUnread((u) => u + newCount);
          try { audioRef.current?.play().catch(() => {}); } catch {}
        }
      } catch {
        // silent
      }
    };

    tick();
    const id = setInterval(tick, POLL_MS);
    return () => { cancel = true; clearInterval(id); };
  }, [currentUser]);

  return {
    unreadCount: unread,
    clear: () => setUnread(0),
  };
}
