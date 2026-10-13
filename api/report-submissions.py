"""Vercel Function: POST /api/report-submissions (server/vercel_adapter.py)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'server'))
from vercel_adapter import Handler, make_app  # noqa: E402


class handler(Handler):
    route = '/api/report-submissions'
    app = make_app()
