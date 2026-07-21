#!/usr/bin/env python3
"""BLACK BOX - servidor autoritativo (solo stdlib).

Un unico proceso que:
  - sirve el cliente estatico desde ./public
  - expone un endpoint WebSocket en /ws (handshake + framing a mano)
  - mantiene el estado del juego (los efectos ocultos viven SOLO aca)

Correr:  python3 server.py            # http://localhost:8080
         PORT=9000 python3 server.py  # otro puerto
"""

import asyncio
import base64
import hashlib
import json
import mimetypes
import os
import struct
import sys

from game.room import Hub

HERE = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.join(HERE, "public")
WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

hub = Hub()


# --------------------------------------------------------------------------- #
# WebSocket framing (RFC 6455, lo minimo que necesitamos)
# --------------------------------------------------------------------------- #
class WSClosed(Exception):
    pass


async def ws_send(writer, data, opcode=0x1):
    """Manda un frame no enmascarado (servidor->cliente)."""
    if isinstance(data, str):
        data = data.encode("utf-8")
    length = len(data)
    header = bytearray([0x80 | opcode])
    if length < 126:
        header.append(length)
    elif length < 65536:
        header.append(126)
        header += struct.pack("!H", length)
    else:
        header.append(127)
        header += struct.pack("!Q", length)
    writer.write(bytes(header) + data)
    await writer.drain()


async def ws_recv(reader, writer):
    """Lee un mensaje completo (junta frames de continuacion). Devuelve (opcode, bytes).

    Responde ping->pong internamente. Levanta WSClosed en un frame close.
    """
    frags = bytearray()
    msg_opcode = None
    while True:
        b0, b1 = await reader.readexactly(2)
        fin = b0 & 0x80
        opcode = b0 & 0x0F
        masked = b1 & 0x80
        length = b1 & 0x7F
        if length == 126:
            (length,) = struct.unpack("!H", await reader.readexactly(2))
        elif length == 127:
            (length,) = struct.unpack("!Q", await reader.readexactly(8))
        mask = await reader.readexactly(4) if masked else b"\x00\x00\x00\x00"
        payload = bytearray(await reader.readexactly(length))
        for i in range(length):
            payload[i] ^= mask[i & 3]

        if opcode == 0x8:  # close
            raise WSClosed()
        if opcode == 0x9:  # ping -> pong
            await ws_send(writer, bytes(payload), 0xA)
            continue
        if opcode == 0xA:  # pong (ignorar)
            continue

        if opcode in (0x1, 0x2):
            msg_opcode = opcode
        frags += payload
        if fin:
            return msg_opcode or 0x1, bytes(frags)


# --------------------------------------------------------------------------- #
# Conexion de alto nivel que usa el juego
# --------------------------------------------------------------------------- #
class Conn:
    _next_id = 1

    def __init__(self, writer):
        self.id = Conn._next_id
        Conn._next_id += 1
        self.writer = writer
        self.player = None  # se setea al hacer join
        self._lock = asyncio.Lock()
        self.closed = False

    async def send(self, obj):
        if self.closed:
            return
        try:
            async with self._lock:
                await ws_send(self.writer, json.dumps(obj))
        except (ConnectionResetError, BrokenPipeError, WSClosed, RuntimeError):
            self.closed = True


# --------------------------------------------------------------------------- #
# HTTP estatico
# --------------------------------------------------------------------------- #
def safe_path(url_path):
    url_path = url_path.split("?", 1)[0].split("#", 1)[0]
    if url_path in ("/", ""):
        url_path = "/index.html"
    rel = os.path.normpath(url_path).lstrip("/\\")
    full = os.path.join(PUBLIC, rel)
    if not os.path.abspath(full).startswith(os.path.abspath(PUBLIC)):
        return None
    return full


async def serve_static(writer, url_path):
    full = safe_path(url_path)
    if not full or not os.path.isfile(full):
        body = b"404 not found"
        writer.write(
            b"HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\n"
            b"Content-Length: %d\r\nConnection: close\r\n\r\n" % len(body) + body
        )
        await writer.drain()
        return
    ctype, _ = mimetypes.guess_type(full)
    if full.endswith((".js", ".mjs")):
        ctype = "text/javascript"
    ctype = ctype or "application/octet-stream"
    with open(full, "rb") as f:
        body = f.read()
    head = (
        "HTTP/1.1 200 OK\r\n"
        f"Content-Type: {ctype}; charset=utf-8\r\n"
        f"Content-Length: {len(body)}\r\n"
        "Cache-Control: no-cache\r\n"
        "Connection: close\r\n\r\n"
    ).encode("utf-8")
    writer.write(head + body)
    await writer.drain()


# --------------------------------------------------------------------------- #
# Handler de conexion TCP
# --------------------------------------------------------------------------- #
async def handle(reader, writer):
    conn = None
    try:
        request_line = await reader.readline()
        if not request_line:
            return
        try:
            method, path, _ = request_line.decode("latin1").split(" ", 2)
        except ValueError:
            return

        headers = {}
        while True:
            line = await reader.readline()
            if line in (b"\r\n", b"\n", b""):
                break
            k, _, v = line.decode("latin1").partition(":")
            headers[k.strip().lower()] = v.strip()

        is_ws = headers.get("upgrade", "").lower() == "websocket" and path.startswith("/ws")
        if not is_ws:
            await serve_static(writer, path)
            return

        # ---- WebSocket handshake ----
        key = headers.get("sec-websocket-key", "")
        accept = base64.b64encode(
            hashlib.sha1((key + WS_MAGIC).encode()).digest()
        ).decode()
        writer.write(
            (
                "HTTP/1.1 101 Switching Protocols\r\n"
                "Upgrade: websocket\r\n"
                "Connection: Upgrade\r\n"
                f"Sec-WebSocket-Accept: {accept}\r\n\r\n"
            ).encode()
        )
        await writer.drain()

        conn = Conn(writer)
        while True:
            try:
                opcode, data = await ws_recv(reader, writer)
            except (asyncio.IncompleteReadError, WSClosed):
                break
            if opcode != 0x1:
                continue
            try:
                msg = json.loads(data.decode("utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue
            if isinstance(msg, dict):
                await hub.on_message(conn, msg)
    except (asyncio.IncompleteReadError, WSClosed, ConnectionResetError, BrokenPipeError):
        pass
    except Exception as exc:  # noqa
        print("handler error:", repr(exc), file=sys.stderr)
    finally:
        if conn is not None:
            conn.closed = True
            try:
                await hub.on_disconnect(conn)
            except Exception as exc:  # noqa
                print("disconnect error:", repr(exc), file=sys.stderr)
        try:
            writer.close()
        except Exception:
            pass


async def main():
    port = int(os.environ.get("PORT", "8080"))
    host = os.environ.get("HOST", "0.0.0.0")
    server = await asyncio.start_server(handle, host, port)
    print(f"BLACK BOX escuchando en http://localhost:{port}  (Ctrl+C para salir)")
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nchau.")
