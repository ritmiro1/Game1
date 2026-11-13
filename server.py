import os
import re
import sys
import json
import uuid
import threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse

PORT = 3000
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(ROOT_DIR, 'web')
UPLOAD_DIR = os.path.join(ROOT_DIR, 'uploads')
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Active upload sessions
SESSIONS = {}
SESSIONS_LOCK = threading.Lock()

class RangeRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Range, Content-Type, X-Upload-ID, X-Chunk-Index, X-Offset')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        
        if parsed.path == '/api/upload/init':
            content_len = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_len).decode('utf-8')
            data = json.loads(body)
            raw_filename = data.get('filename', 'movie.mp4')
            filename = re.sub(r'[^a-zA-Z0-9._-]', '_', os.path.basename(raw_filename))
            total_size = int(data.get('filesize', 0))
            
            upload_id = str(uuid.uuid4())
            filepath = os.path.join(UPLOAD_DIR, filename)
            
            # Pre-allocate/truncate file
            with open(filepath, 'wb') as f:
                if total_size > 0:
                    f.truncate(total_size)
            
            with SESSIONS_LOCK:
                SESSIONS[upload_id] = {
                    'filename': filename,
                    'filepath': filepath,
                    'filesize': total_size,
                    'received_bytes': 0,
                    'lock': threading.Lock(),
                    'chunks': set()
                }
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            resp = {'status': 'ok', 'upload_id': upload_id, 'filename': filename, 'filesize': total_size}
            self.wfile.write(json.dumps(resp).encode('utf-8'))
            return

        elif parsed.path == '/api/upload/chunk':
            upload_id = self.headers.get('X-Upload-ID')
            chunk_index = int(self.headers.get('X-Chunk-Index', 0))
            offset = int(self.headers.get('X-Offset', 0))
            content_len = int(self.headers.get('Content-Length', 0))
            
            session = None
            with SESSIONS_LOCK:
                session = SESSIONS.get(upload_id)
            
            if not session:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b'{"error": "Invalid upload_id"}')
                return
            
            chunk_data = self.rfile.read(content_len)
            
            with session['lock']:
                with open(session['filepath'], 'r+b') as f:
                    f.seek(offset)
                    f.write(chunk_data)
                session['received_bytes'] += len(chunk_data)
                session['chunks'].add(chunk_index)
                received_now = session['received_bytes']
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            resp = {'status': 'ok', 'chunk': chunk_index, 'received': received_now}
            self.wfile.write(json.dumps(resp).encode('utf-8'))
            return

        elif parsed.path == '/api/upload/complete':
            content_len = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_len).decode('utf-8')
            data = json.loads(body)
            upload_id = data.get('upload_id')
            
            session = None
            with SESSIONS_LOCK:
                session = SESSIONS.get(upload_id)
            
            if not session:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b'{"error": "Invalid upload_id"}')
                return
            
            real_size = os.path.getsize(session['filepath'])
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            resp = {'status': 'complete', 'filename': session['filename'], 'path': session['filepath'], 'size': real_size}
            self.wfile.write(json.dumps(resp).encode('utf-8'))
            return

        else:
            self.send_response(404)
            self.end_headers()

    def send_head(self):
        path = self.translate_path(self.path)
        if not os.path.exists(path) or os.path.isdir(path):
            return super().send_head()
            
        range_header = self.headers.get('Range')
        if not range_header or not range_header.startswith('bytes='):
            return super().send_head()
            
        file_size = os.path.getsize(path)
        m = re.match(r'bytes=(\d+)-(\d*)', range_header)
        if not m:
            return super().send_head()
            
        start = int(m.group(1))
        end = int(m.group(2)) if m.group(2) else file_size - 1
        if start >= file_size:
            self.send_error(416, "Requested Range Not Satisfiable")
            return None
            
        end = min(end, file_size - 1)
        length = end - start + 1
        
        self.send_response(206)
        ctype = self.guess_type(path)
        self.send_header("Content-type", ctype)
        self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
        self.send_header("Content-Length", str(length))
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()
        
        f = open(path, 'rb')
        f.seek(start)
        return RangeFileWrapper(f, length)

class RangeFileWrapper:
    def __init__(self, f, length):
        self.f = f
        self.length = length
        self.read_so_far = 0

    def read(self, size=-1):
        if self.read_so_far >= self.length:
            return b""
        if size < 0 or size > (self.length - self.read_so_far):
            size = self.length - self.read_so_far
        data = self.f.read(size)
        self.read_so_far += len(data)
        return data

    def close(self):
        self.f.close()

if __name__ == '__main__':
    server = ThreadingHTTPServer(('0.0.0.0', PORT), RangeRequestHandler)
    print(f"High-Speed Threaded Server listening on http://0.0.0.0:{PORT} (serving {WEB_DIR})", flush=True)
    server.serve_forever()
