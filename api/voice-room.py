"""Vercel Function: POST /api/voice-room (server/vercel_adapter.py, server/voice_room.py)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'server'))
from vercel_adapter import Handler, make_app  # noqa: E402


class handler(Handler):
    route = '/api/voice-room'
    app = make_app()
