"""Construccion de la vista que ve CADA jugador.

Aca se garantiza que el efecto oculto de un objeto no viaje al cliente antes de
resolverse: 'current' publico no lleva el tipo del objeto; solo el sostenedor
(o quien uso 👁) recibe el TIPO, nunca el efecto.
"""

import time

from . import items


def _remaining_ms(deadline):
    if deadline is None:
        return None
    return max(0, int((deadline - time.time()) * 1000))


def _seat_view(room, p):
    cur = room.current
    return {
        "seat": p.seat,
        "name": p.name,
        "alive": p.alive,
        "hp": p.hp,
        "coins": p.coins,
        "connected": p.connected,
        "ready": p.ready,
        "isHolder": bool(cur and cur["holder_seat"] == p.seat),
    }


def _item_face(item_type):
    return {"type": item_type, "emoji": items.emoji(item_type), "name": items.label(item_type)}


def build_state(room, viewer):
    seats = [_seat_view(room, room.players[s]) for s in sorted(room.players)]

    current = None
    if room.current:
        c = room.current
        current = {
            "holderSeat": c["holder_seat"],
            "pushesLeft": c["pushes_left"],
            "timerMs": _remaining_ms(c.get("timer_end")),
            "itemsLeft": c["items_left"],
            "mysteryId": c["mystery_id"],
        }

    shop = None
    if room.shop:
        shop = {
            "offers": room.shop["offers"],
            "timerMs": _remaining_ms(room.shop.get("timer_end")),
            "ready": sorted(room.shop["ready"]),
        }

    # bloque privado del que mira
    held_face = None
    if room.current and room.current["holder_seat"] == viewer.seat:
        held_face = _item_face(room.current["item_type"])
    peek_face = None
    if room.current and viewer.seat in room.current.get("revealed_to", set()):
        peek_face = _item_face(room.current["item_type"])

    upgrades = {k: v for k, v in viewer.upgrades.items() if v}

    you = {
        "seat": viewer.seat,
        "name": viewer.name,
        "hp": viewer.hp,
        "coins": viewer.coins,
        "alive": viewer.alive,
        "ready": viewer.ready,
        "upgrades": upgrades,
        "hints": viewer.private_hints[-6:],
        "heldFace": held_face,     # el sostenedor ve el TIPO (no el efecto)
        "peekFace": peek_face,     # 👁 revelo el tipo aunque no lo sostenga
        "isHost": room.host_seat == viewer.seat,
        "canAct": bool(room.current and room.current["holder_seat"] == viewer.seat
                       and room.phase == "CHOOSE" and viewer.alive),
    }

    return {
        "t": "state",
        "code": room.code,
        "phase": room.phase,
        "round": room.round,
        "boxSize": room.box_size,
        "corruption": room.corruption,
        "hostSeat": room.host_seat,
        "started": room.started,
        "seats": seats,
        "current": current,
        "shop": shop,
        "winnerSeat": room.winner_seat,
        "log": room.log[-9:],
        "you": you,
    }
