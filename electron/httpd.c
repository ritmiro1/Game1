// ============================================================================
//  Мини-сервер: отдаёт встроенную игру по http://127.0.0.1:<порт>/.
//  Нужен, чтобы у страницы был настоящий origin — иначе в WebView2 не работают
//  localStorage (сейвы), pointer lock и часть WebGL-ограничений file://.
//
//  Код переносимый: одинаково собирается под Windows (winsock2) и под Linux
//  (BSD-сокеты), поэтому HTTP-часть можно проверить нативным тестом.
// ============================================================================
#include "httpd.h"

#include <stdio.h>
#include <string.h>

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
typedef SOCKET sock_t;
#define SOCK_INVALID INVALID_SOCKET
#define sock_close closesocket
#define SHUT_WR SD_SEND
#define snprintf _snprintf
#else
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <pthread.h>
typedef int sock_t;
#define SOCK_INVALID (-1)
#define sock_close close
#endif

static const char *g_body = NULL;
static unsigned int g_bodySize = 0;
static sock_t g_listen = SOCK_INVALID;
static int g_port = 0;

static int send_all(sock_t s, const char *buf, int len) {
  while (len > 0) {
    int n = (int)send(s, buf, len, 0);
    if (n <= 0) return 0;
    buf += n;
    len -= n;
  }
  return 1;
}

static void handle_client(sock_t c) {
  char req[2048];
  int got = 0;
  while (got < (int)sizeof(req) - 1) {
    int n = (int)recv(c, req + got, (int)sizeof(req) - 1 - got, 0);
    if (n <= 0) break;
    got += n;
    req[got] = 0;
    if (strstr(req, "\r\n\r\n")) break;
  }
  if (got <= 0) {
    sock_close(c);
    return;
  }

  const int is_index = (strncmp(req, "GET / ", 6) == 0) || (strncmp(req, "GET /index.html", 15) == 0);
  char header[512];
  if (is_index && g_body) {
    snprintf(header, sizeof(header) - 1,
              "HTTP/1.1 200 OK\r\n"
              "Content-Type: text/html; charset=utf-8\r\n"
              "Content-Length: %u\r\n"
              "Cache-Control: no-store\r\n"
              "X-Content-Type-Options: nosniff\r\n"
              "Connection: close\r\n\r\n",
              g_bodySize);
    header[sizeof(header) - 1] = 0;
    send_all(c, header, (int)strlen(header));
    send_all(c, g_body, (int)g_bodySize);
  } else {
    static const char notFound[] = "404: \xD0\xA4\xD0\xB0\xD0\xB9\xD0\xBB \xD0\xBD\xD0\xB5 \xD0\xBD\xD0\xB0\xD0\xB9\xD0\xB4\xD0\xB5\xD0\xBD";
    snprintf(header, sizeof(header) - 1,
              "HTTP/1.1 404 Not Found\r\n"
              "Content-Type: text/plain; charset=utf-8\r\n"
              "Content-Length: %u\r\n"
              "Connection: close\r\n\r\n",
              (unsigned)(sizeof(notFound) - 1));
    header[sizeof(header) - 1] = 0;
    send_all(c, header, (int)strlen(header));
    send_all(c, notFound, (int)(sizeof(notFound) - 1));
  }
  shutdown(c, SHUT_WR);
  sock_close(c);
}

/* ---------------- потоки ---------------- */
#ifdef _WIN32
static DWORD WINAPI client_thread(LPVOID param) {
  handle_client((sock_t)(uintptr_t)param);
  return 0;
}
static DWORD WINAPI accept_thread(LPVOID param) {
  (void)param;
  for (;;) {
    sock_t c = accept(g_listen, NULL, NULL);
    if (c == SOCK_INVALID) break;
    HANDLE th = CreateThread(NULL, 0, client_thread, (LPVOID)(uintptr_t)c, 0, NULL);
    if (th)
      CloseHandle(th);
    else
      sock_close(c);
  }
  return 0;
}
static int start_accept_thread(void) {
  HANDLE th = CreateThread(NULL, 0, accept_thread, NULL, 0, NULL);
  if (!th) return 0;
  CloseHandle(th);
  return 1;
}
#else
static void *client_thread(void *param) {
  handle_client((sock_t)(intptr_t)param);
  return NULL;
}
static void *accept_thread(void *param) {
  (void)param;
  for (;;) {
    sock_t c = accept(g_listen, NULL, NULL);
    if (c == SOCK_INVALID) break;
    pthread_t th;
    if (pthread_create(&th, NULL, client_thread, (void *)(intptr_t)c) == 0)
      pthread_detach(th);
    else
      sock_close(c);
  }
  return NULL;
}
static int start_accept_thread(void) {
  pthread_t th;
  if (pthread_create(&th, NULL, accept_thread, NULL) != 0) return 0;
  pthread_detach(th);
  return 1;
}
#endif

int httpd_start(const char *html, unsigned int htmlSize, int portFirst, int portLast) {
  if (!html || !htmlSize) return 0;

#ifdef _WIN32
  WSADATA wsa;
  if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) return 0;
#endif

  g_body = html;
  g_bodySize = htmlSize;

  g_listen = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
  if (g_listen == SOCK_INVALID) return 0;

  int reuse = 1;
  setsockopt(g_listen, SOL_SOCKET, SO_REUSEADDR, (const char *)&reuse, sizeof(reuse));

  struct sockaddr_in addr;
  memset(&addr, 0, sizeof(addr));
  addr.sin_family = AF_INET;
  addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK); /* только локально, наружу не смотрит */

  int bound = 0;
  for (int port = portFirst; port <= portLast; port++) {
    addr.sin_port = htons((unsigned short)port);
    if (bind(g_listen, (struct sockaddr *)&addr, sizeof(addr)) == 0) {
      g_port = port;
      bound = 1;
      break;
    }
  }
  if (!bound || listen(g_listen, 16) != 0) {
    sock_close(g_listen);
    g_listen = SOCK_INVALID;
    g_port = 0;
    return 0;
  }
  if (!start_accept_thread()) {
    sock_close(g_listen);
    g_listen = SOCK_INVALID;
    g_port = 0;
    return 0;
  }
  return g_port;
}

int httpd_port(void) { return g_port; }

void httpd_stop(void) {
  if (g_listen != SOCK_INVALID) {
    sock_close(g_listen);
    g_listen = SOCK_INVALID;
  }
  g_port = 0;
#ifdef _WIN32
  WSACleanup();
#endif
}
