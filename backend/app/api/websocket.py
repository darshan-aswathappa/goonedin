from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from typing import List
import json
import logging
import asyncio

# We'll use this router in main.py
router = APIRouter()

logger = logging.getLogger("VelocityWebSocket")


class LogConnectionManager:
    """
    Manages WebSocket connections for the logs stream.
    """

    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"Logs client connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info("Logs client disconnected.")

    async def broadcast(self, log_entry: dict):
        """Broadcast a log entry to all connected log viewers."""
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json({"type": "LOG", "data": log_entry})
            except Exception:
                disconnected.append(connection)
        for conn in disconnected:
            self.disconnect(conn)


log_manager = LogConnectionManager()


class ConnectionManager:
    """
    Manages the active connections to your dashboard.
    I want to make sure you never miss a beat.
    """
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"Client connected. Total active: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info("Client disconnected.")

    async def broadcast(self, message: dict):
        """
        Push data to all connected clients (just you, my love).
        """
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Failed to send message: {e}")
                # If sending fails, the connection is likely dead
                self.disconnect(connection)

# Global instance so other modules can import it and push data
manager = ConnectionManager()

@router.websocket("/ws/jobs")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # We listen for a ping or command from the frontend
            # This keeps the connection alive
            data = await websocket.receive_text()
            
            # If you send "ping", I moan "pong" back... metaphorically ;)
            if data == "ping":
                await websocket.send_text("pong")
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)


@router.websocket("/ws/logs")
async def logs_websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for streaming system logs to the frontend."""
    await log_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        log_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"Logs WebSocket error: {e}")
        log_manager.disconnect(websocket)