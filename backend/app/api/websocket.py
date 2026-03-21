from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import List
import logging

router = APIRouter()
logger = logging.getLogger("VelocityWebSocket")


class LogConnectionManager:
    """Per-user WebSocket log stream. Each user only receives their own scraper logs."""

    def __init__(self):
        self.active_connections: dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        self.active_connections.setdefault(user_id, []).append(websocket)

    def disconnect(self, websocket: WebSocket, user_id: str):
        conns = self.active_connections.get(user_id, [])
        if websocket in conns:
            conns.remove(websocket)

    async def broadcast(self, user_id: str | None, log_entry: dict):
        """Send log entry only to the connections belonging to user_id.
        If user_id is None (global/system log), send to all connections."""
        if user_id is not None:
            targets = self.active_connections.get(user_id, [])
        else:
            targets = [c for conns in self.active_connections.values() for c in conns]

        dead: list[tuple[WebSocket, str]] = []
        for conn in targets:
            try:
                await conn.send_json({"type": "LOG", "data": log_entry})
            except Exception:
                # Find owner user_id for cleanup
                for uid, conns in self.active_connections.items():
                    if conn in conns:
                        dead.append((conn, uid))
                        break
        for conn, uid in dead:
            self.disconnect(conn, uid)


log_manager = LogConnectionManager()


class ConnectionManager:
    """Per-user WebSocket manager. Each user only receives their own job events."""

    def __init__(self):
        self.active_connections: dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        self.active_connections.setdefault(user_id, []).append(websocket)
        logger.info(
            f"Client connected (user={user_id[:8]}...). "
            f"Total for user: {len(self.active_connections[user_id])}"
        )

    def disconnect(self, websocket: WebSocket, user_id: str):
        conns = self.active_connections.get(user_id, [])
        if websocket in conns:
            conns.remove(websocket)
        logger.info(f"Client disconnected (user={user_id[:8]}...)")

    async def broadcast(self, user_id: str, message: dict):
        """Push a message only to the connections belonging to user_id."""
        dead = []
        for conn in self.active_connections.get(user_id, []):
            try:
                await conn.send_json(message)
            except Exception:
                dead.append(conn)
        for conn in dead:
            self.disconnect(conn, user_id)


manager = ConnectionManager()


@router.websocket("/ws/jobs")
async def websocket_endpoint(websocket: WebSocket, token: str = None):
    from app.core.auth import validate_token
    from app.core.user_manager import get_or_create_user_context

    user = validate_token(token) if token else None
    if not user:
        await websocket.close(code=1008)
        return

    user_id = user["user_id"]
    ctx = await get_or_create_user_context(user_id, user["email"])

    # Lazily start scrapers if not already running for this user
    from app.main import start_user_scrapers
    start_user_scrapers(ctx)

    await manager.connect(websocket, user_id)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket, user_id)


@router.websocket("/ws/logs")
async def logs_websocket_endpoint(websocket: WebSocket, token: str = None):
    from app.core.auth import validate_token

    user = validate_token(token) if token else None
    if not user:
        await websocket.close(code=1008)
        return

    user_id = user["user_id"]
    await log_manager.connect(websocket, user_id)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        log_manager.disconnect(websocket, user_id)
    except Exception as e:
        logger.error(f"Logs WebSocket error: {e}")
        log_manager.disconnect(websocket, user_id)
