/**
 * ClosureLockBanner — affiche un bandeau visible quand la journée donnée est clôturée.
 * Si aucune date n'est passée, vérifie la journée d'aujourd'hui.
 *
 * Lien direct vers l'onglet "Point de la Caisse" pour rouvrir le Z si besoin.
 */
import React, { useEffect, useState } from "react";
import axios from "axios";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Lock, ExternalLink } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ClosureLockBanner = ({ date, onOpenPointCaisse }) => {
  const [closed, setClosed] = useState(false);
  const [closure, setClosure] = useState(null);

  const target = date || format(new Date(), "yyyy-MM-dd");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await axios.get(`${API}/cash-closures/live`, { params: { date: target } });
        if (!alive) return;
        const s = r.data.snapshot;
        setClosed(!!s?.already_closed);
        setClosure(s?.already_closed ? { id: s.existing_closure_id } : null);
      } catch {
        // silent
      }
    })();
    return () => { alive = false; };
  }, [target]);

  if (!closed) return null;

  let dateLabel = target;
  try {
    dateLabel = format(parseISO(target), "EEEE dd MMMM yyyy", { locale: fr });
  } catch {}

  return (
    <div
      className="bg-amber-500/15 border border-amber-500/50 rounded-lg px-4 py-2.5 mb-4 flex items-center justify-between gap-3 flex-wrap"
      data-testid="closure-lock-banner"
    >
      <div className="flex items-center gap-2 text-amber-200 text-sm">
        <Lock className="w-4 h-4 flex-shrink-0" />
        <span>
          🔒 La caisse du <strong className="text-amber-100">{dateLabel}</strong> est <strong>clôturée</strong>.
          Les factures et dépenses de cette journée ne peuvent plus être modifiées.
        </span>
      </div>
      {onOpenPointCaisse && (
        <button
          onClick={onOpenPointCaisse}
          className="text-amber-200 hover:text-amber-100 text-xs font-bold flex items-center gap-1 px-2 py-1 rounded border border-amber-500/40 hover:bg-amber-500/10 transition"
          data-testid="closure-lock-banner-open-z"
        >
          Voir le Z <ExternalLink className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};

export default ClosureLockBanner;
