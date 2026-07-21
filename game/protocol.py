"""Vista por-jugador (v2). No filtra efectos ocultos ni la info tapada por la Máscara."""

import time

from . import items, relics


def _ms(deadline):
    if not deadline:
        return None
    return max(0, int((deadline - time.time()) * 1000))


def _face(t):
    return {"type": t, "emoji": items.emoji(t), "name": items.name(t)}


def _relic_list(ids):
    out = []
    for rid in ids:
        m = relics.meta(rid)
        out.append({"id": rid, "emoji": m["emoji"], "name": m["name"], "desc": m["desc"]})
    return out


def _inv_list(inv):
    out = []
    for o in inv:
        t = o["type"]
        meta = items.OBJECTS.get(t, {})
        out.append({"uid": o["uid"], "type": t, "emoji": items.emoji(t), "name": items.name(t),
                    "use": meta.get("use", False), "target": meta.get("target", "self"),
                    "desc": meta.get("desc", "")})
    return out


def build_state(room, viewer):
    sees_all = relics.sees_all(viewer)
    cur = room.current

    seats = []
    for s in sorted(room.players):
        p = room.players[s]
        hide = relics.hides_info(p) and p.seat != viewer.seat and not sees_all
        seats.append({
            "seat": p.seat, "name": p.name, "alive": p.alive, "hp": p.hp,
            "chips": None if hide else p.chips,
            "invCount": None if hide else len(p.inventory),
            "connected": p.connected, "ready": p.ready,
            "bet": p.bet if room.phase == "BET" else None,
            "relics": [relics.meta(r)["emoji"] for r in p.relics],
            # ids para dibujar sus reliquias en 3D: las propias siempre; las ajenas
            # solo si el que mira "ve todo" (reliquia Ojo del Vidente)
            "relicIds": list(p.relics) if (p.seat == viewer.seat or sees_all) else [],
            # la Muñeca Maldita es un objeto FÍSICO en la mesa: todos ven de quién es.
            "hasDoll": relics.has(p, "muneca"),
            "isHolder": bool(cur and cur["holder_seat"] == p.seat)
                        or bool(room.roulette and room.roulette.get("holder_seat") == p.seat),
        })

    current = None
    if cur:
        # objeto CERRADO: nadie ve qué es hasta que alguien lo ABRE (se revela al resolver).
        current = {"holderSeat": cur["holder_seat"],
                   "face": {"type": "?", "emoji": "❔", "name": "Objeto sin abrir"},
                   "blind": True, "pushesLeft": cur["pushes_left"],
                   "timerMs": _ms(cur.get("timer_end")), "itemsLeft": cur["items_left"]}

    slots = None
    if room.slots:
        slots = {"timerMs": _ms(room.slots.get("timer_end")), "results": room.slots["results"]}

    roulette = None
    if room.roulette:
        r = room.roulette
        roulette = {"holderSeat": r.get("holder_seat"), "chambers": r.get("chambers"),
                    "reward": r.get("reward"), "timerMs": _ms(r.get("timer_end")),
                    "in": r.get("in", [])}

    event = None
    if room.event:
        e = room.event
        event = {"id": e.get("id"), "text": e.get("text"), "prize": e.get("prize"),
                 "timerMs": _ms(e.get("timer_end"))}

    market = None
    if room.market:
        market = {"stock": room.market["stock"], "sold": room.market["sold"],
                  "timerMs": _ms(room.market.get("timer_end"))}

    you = {
        "seat": viewer.seat, "name": viewer.name, "hp": viewer.hp, "chips": viewer.chips,
        "alive": viewer.alive, "ready": viewer.ready, "bet": viewer.bet, "whisky": viewer.whisky,
        "isHost": room.host_seat == viewer.seat,
        "relics": _relic_list(viewer.relics),
        "inventory": _inv_list(viewer.inventory),
        "hints": viewer.private_hints[-6:],
        "canAct": bool(cur and cur["holder_seat"] == viewer.seat and room.phase == "OBJETOS"
                       and viewer.alive),
        "rouletteTurn": bool(room.roulette and room.roulette.get("holder_seat") == viewer.seat
                             and viewer.alive),
        "canSpin": bool(room.phase == "SLOTS" and viewer.alive and not viewer.slot_done),
        "myReels": (room.slots["results"].get(viewer.seat) if room.slots else None),
    }

    return {
        "t": "state", "code": room.code, "phase": room.phase, "round": room.round,
        "roundCap": getattr(room, "round_cap", None),
        "menace": room.box.menace if room.box else 0, "pot": room.pot, "betCap": room.bet_cap,
        "betTimerMs": _ms(getattr(room, "bet_end", None)) if room.phase == "BET" else None,
        "hostSeat": room.host_seat, "started": room.started, "activity": room.activity,
        "winnerSeat": room.winner_seat,
        "seats": seats, "current": current, "slots": slots, "roulette": roulette,
        "event": event, "market": market,
        "log": room.log[-9:], "you": you,
    }
