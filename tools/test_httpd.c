// ============================================================================
//  Нативный тест мини-сервера из electron/httpd.c (тот же код, что внутри .exe).
//  Собирается под Linux и проверяет реальными HTTP-запросами через сокет:
//    * отдача index.html: код 200, Content-Type, Content-Length, тело байт-в-байт
//    * корректная работа с кириллицей в UTF-8 (длина в байтах, не в символах)
//    * 404 на прочие пути
//    * занятый порт → сервер берёт следующий
//  Сборка и запуск: see tools/test_httpd.mjs
// ============================================================================
#include "../electron/httpd.h"

#include <arpa/inet.h>
#include <netinet/in.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <unistd.h>

static int failures = 0;

static void check(int cond, const char *label, const char *extra) {
  printf("  %s %s%s%s\n", cond ? "✓" : "✗", label, extra ? " — " : "", extra ? extra : "");
  if (!cond) failures++;
}

/** Делает один HTTP-запрос к 127.0.0.1:port и возвращает ответ в buf. */
static int http_get(int port, const char *path, char *buf, int cap) {
  int s = socket(AF_INET, SOCK_STREAM, 0);
  if (s < 0) return -1;
  struct sockaddr_in a;
  memset(&a, 0, sizeof(a));
  a.sin_family = AF_INET;
  a.sin_port = htons((unsigned short)port);
  a.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  if (connect(s, (struct sockaddr *)&a, sizeof(a)) != 0) {
    close(s);
    return -1;
  }
  char req[256];
  int n = snprintf(req, sizeof(req), "GET %s HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n", path);
  send(s, req, n, 0);

  int total = 0;
  for (;;) {
    if (total >= cap - 1) break;
    int got = (int)recv(s, buf + total, cap - 1 - total, 0);
    if (got <= 0) break;
    total += got;
  }
  buf[total] = 0;
  close(s);
  return total;
}

int main(int argc, char **argv) {
  // «игра» для теста: кириллица + HTML-теги, длина в байтах ≠ длина в символах
  const char *html =
      "<!DOCTYPE html>\n<html lang=\"ru\"><head><meta charset=\"utf-8\">"
      "<title>Тихий Залив</title></head><body><h1>Тихий Залив</h1>"
      "<p>Проверка кириллицы: ёжик, щука, маяк.</p></body></html>";
  unsigned int size = (unsigned int)strlen(html);

  printf("\n=== ТЕСТ HTTP-СЕРВЕРА (тот же код, что в .exe) ===\n\n");

  // порт 18765 поднят заранее, чтобы проверить автоперебор
  int busy = socket(AF_INET, SOCK_STREAM, 0);
  struct sockaddr_in a;
  memset(&a, 0, sizeof(a));
  a.sin_family = AF_INET;
  a.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  a.sin_port = htons(18765);
  int reuse = 1;
  setsockopt(busy, SOL_SOCKET, SO_REUSEADDR, &reuse, sizeof(reuse));
  int boundBusy = bind(busy, (struct sockaddr *)&a, sizeof(a)) == 0;
  if (boundBusy) listen(busy, 1);


  // Если передан путь — проверяем отдачу настоящего файла (1 МБ игры),
  // иначе — короткого тестового HTML выше.
  char *served = (char *)html;
  unsigned int servedSize = 0;
  static char *fileBuf = NULL;
  if (argc > 1) {
    FILE *f = fopen(argv[1], "rb");
    if (!f) {
      printf("  ✗ не открыть файл %s\n", argv[1]);
      return 1;
    }
    fseek(f, 0, SEEK_END);
    long sz = ftell(f);
    fseek(f, 0, SEEK_SET);
    fileBuf = (char *)malloc((size_t)sz);
    if (!fileBuf || fread(fileBuf, 1, (size_t)sz, f) != (size_t)sz) {
      printf("  ✗ не прочитать файл\n");
      fclose(f);
      return 1;
    }
    fclose(f);
    served = fileBuf;
    servedSize = (unsigned int)sz;
    printf("  · файл на проверку: %s (%u байт)\n", argv[1], servedSize);
    html = served;
    size = servedSize;
  }

  int port = httpd_start(html, size, 18765, 18780);
  char extra[128];
  snprintf(extra, sizeof(extra), "порт %d, занятый 18765 пропущен", port);
  check(port >= 18766 && port <= 18780, "сервер поднялся на свободном порту", extra);

  static char buf[4 * 1024 * 1024];
  int n = http_get(port, "/", buf, sizeof(buf));

  check(n > 0, "GET / отвечает", NULL);

  // заголовки
  char *hdrEnd = strstr(buf, "\r\n\r\n");
  check(hdrEnd != NULL, "заголовки отделены пустой строкой", NULL);
  check(strstr(buf, "HTTP/1.1 200 OK") != NULL, "код 200", NULL);
  check(strstr(buf, "Content-Type: text/html; charset=utf-8") != NULL, "тип содержимого UTF-8", NULL);

  // Content-Length должен равняться размеру в БАЙТАХ (частая ошибка — в символах)
  char lenLabel[128];
  char *cl = strstr(buf, "Content-Length: ");
  long declared = cl ? strtol(cl + 16, NULL, 10) : -1;
  snprintf(lenLabel, sizeof(lenLabel), "%ld байт (ожидалось %u)", declared, size);
  check(declared == (long)size, "Content-Length совпадает с размером данных", lenLabel);

  // тело совпадает побайтово
  char *body = hdrEnd ? hdrEnd + 4 : NULL;
  int bodyLen = body ? n - (int)(body - buf) : -1;
  snprintf(lenLabel, sizeof(lenLabel), "получено %d из %u", bodyLen, size);
  check(bodyLen == (int)size && memcmp(body, html, size) == 0, "тело ответа байт-в-байт", lenLabel);

  // кириллица не побилась
  check(body && strstr(body, "Тихий Залив") != NULL, "кириллица в UTF-8 передана корректно", NULL);
  // этот пункт имеет смысл только для короткого тестового HTML
  if (argc <= 1) check(body && strstr(body, "щука") != NULL, "строчные символы не искажены", NULL);

  // index.html по явному пути
  int n2 = http_get(port, "/index.html", buf, sizeof(buf));
  check(n2 > 0 && strstr(buf, "HTTP/1.1 200 OK") != NULL, "GET /index.html тоже отдаёт игру", NULL);

  // 404 на прочие пути
  int n3 = http_get(port, "/game.js", buf, sizeof(buf));
  check(n3 > 0 && strstr(buf, "HTTP/1.1 404 Not Found") != NULL, "неизвестный путь → 404", NULL);

  // повторные запросы (проверка, что сервер жив после закрытия соединения)
  int ok = 1;
  for (int i = 0; i < 5; i++) {
    int m = http_get(port, "/", buf, sizeof(buf));
    if (m <= 0 || strstr(buf, "HTTP/1.1 200 OK") == NULL) ok = 0;
  }
  check(ok, "выдерживает 5 последовательных запросов", NULL);

  httpd_stop();
  if (boundBusy) {
    close(busy);
  }

  printf("\n  %s: %d\n", failures ? "ПРОВАЛЕНО" : "ВСЁ ЧИСТО", failures);
  return failures ? 1 : 0;
}
