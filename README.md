# BLACK BOX 📼🎰

> "Una caja vieja encontrada en un depósito militar. Cada vez que alguien la abre,
> alguien sale ganando... y otro no."

Juego web **multiplayer** de deducción social y paranoia alrededor de una única mesa.
Estética **PS1** (low-poly, oscuro, primera persona), **2 a 8 jugadores**. En el centro hay
una caja negra que en cada ronda escupe objetos con **efectos ocultos**. Podés **abrir** un
objeto... o **empujárselo a otro** mintiendo sobre lo que es. Nadie sabe qué hace realmente
cada cosa. Las monedas compran mejoras. El **teléfono** te dice cosas — verdad o mentira,
nunca sabés.

Todo se sirve solo: **no hay que instalar nada** más que Python 3 (que ya trae la stdlib
necesaria) y usar un navegador moderno. Los modelos 3D son **procedurales** (hechos en código,
sin assets externos). Three.js viene vendorizado en `public/vendor/`.

## Correr

```bash
cd BlackBox
python3 server.py
```

Abrí **http://localhost:8080** en el navegador. Listo.

- Otro puerto: `PORT=9000 python3 server.py`
- Jugar con amigos:
  - **Misma red / LAN:** compartiles `http://TU_IP_LOCAL:8080` (el server escucha en `0.0.0.0`).
  - **Por internet:** exponé el puerto 8080 (port-forward del router, o un túnel tipo
    `ssh -R`, `cloudflared`, `ngrok`, etc.).

### Cómo jugar
1. Escribí tu nombre. Dejá el **código de sala vacío** para crear una nueva (te da un código de
   4 letras), o pegá el código de un amigo para unirte.
2. Cuando estén **2 a 8**, el anfitrión (★) toca **ABRIR LA CAJA**.
3. Cada ronda la caja escupe objetos misteriosos. Si te toca sostener uno:
   - **ABRIR** (o **ATENDER** si es el teléfono) → se resuelve su efecto oculto.
   - **EMPUJAR ▸** a otro jugador → que lo abra él (podés mentir sobre lo que es).
   - **🗑 TIRAR** / **🔄 GIRAR** si compraste esas mejoras.
4. Entre rondas: **mercado negro** para gastar 🪙 (👁 ver, 🧲 robar, 🗑 tirar, 🔄 girar, 💀 doble).
5. La caja **crece** cada ronda y **aprende**: si todos juegan igual/pasivo, empeora los objetos;
   si son agresivos, da más recompensas. Sube la **corrupción** y la mesa se enrarece.
6. Último en pie gana. Empezás con 2 ❤; las bombas duelen.

## Tuneo (variables de entorno)

| Var | Default | Qué hace |
|-----|---------|----------|
| `PORT` | `8080` | Puerto HTTP/WS |
| `BB_CHOOSE_SECS` | `12` | Segundos para decidir por objeto |
| `BB_RESOLVE_PAUSE` | `3` | Pausa tras revelar |
| `BB_DEAL_PAUSE` | `2.2` | Pausa al repartir |
| `BB_SHOP_SECS` | `22` | Duración de la tienda |

## Arquitectura

- **`server.py`** — servidor autoritativo en **Python puro (solo stdlib)**: sirve el cliente
  estático de `public/` y hace de servidor WebSocket (handshake + framing a mano) en `/ws`.
- **`game/`** — lógica del juego (vive **solo en el server**; el efecto real de un objeto nunca
  viaja al cliente antes de resolverse):
  - `room.py` — salas, jugadores, ruteo de mensajes, reconexión básica.
  - `engine.py` — máquina de estados de ronda (deal → elegir → resolver → pago → tienda → escala).
  - `items.py` — catálogo de objetos y resolución de efectos **ocultos**.
  - `ai_box.py` — RNG sembrada, generación de objetos y la heurística "la caja aprende".
  - `protocol.py` — arma la **vista por-jugador** (no filtra información oculta).
- **`public/`** — cliente estático (ES modules, sin build):
  - `js/scene.js` `models.js` `items3d.js` `ps1.js` — escena Three.js + look PS1
    (baja resolución + *vertex snapping* + niebla oscura).
  - `js/ui.js` `net.js` `audio.js` `main.js` — HUD/tienda/teléfono, WebSocket, audio, orquestación.
  - `vendor/three.module.js` — Three.js r160 vendorizado (sin CDN).

## Estado

v1 jugable: mesa, caja, 8 objetos con efectos ocultos, agarrar/empujar/abrir, monedas, tienda
(5 mejoras), teléfono con voz distorsionada, "la caja aprende" y corrupción-lite.
Pendiente (post-v1): VHS/TV en vivo, set completo de reglas de corrupción y mímicos, más objetos.
