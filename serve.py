#!/usr/bin/env python3
"""Tiny no-cache static server for local development.

The game is plain ES modules, so it needs to be served over http:// rather than
opened as a file:// URL. That is the only reason this script exists.

    python serve.py [port]        # defaults to 3497
"""
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 3497
ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        # Never cache during development: edit a file, hit refresh, see it.
        self.send_header('Cache-Control', 'no-store, max-age=0')
        super().end_headers()

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    ThreadingHTTPServer.allow_reuse_address = True
    httpd = ThreadingHTTPServer(('', PORT), Handler)
    print('Buy and Sell E-Bikes -> http://localhost:%d  (Ctrl+C to stop)' % PORT, flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
