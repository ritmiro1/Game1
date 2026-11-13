import os
import re
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = 3000
WEB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'web')

class RangeRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Range')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
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
    server = HTTPServer(('0.0.0.0', PORT), RangeRequestHandler)
    print(f"Server listening on http://0.0.0.0:{PORT} (serving {WEB_DIR})", flush=True)
    server.serve_forever()
