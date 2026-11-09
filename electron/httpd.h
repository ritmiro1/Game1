// Мини-сервер для отдачи встроенной игры локально (см. httpd.c).
#ifndef TIKHIY_ZAHLIV_HTTPD_H
#define TIKHIY_ZAHLIV_HTTPD_H

/**
 * Поднимает сервер на 127.0.0.1, перебирая порты [portFirst..portLast].
 * Возвращает занятый порт или 0 при ошибке.
 */
int httpd_start(const char *html, unsigned int htmlSize, int portFirst, int portLast);

/** Порт, на котором работает сервер (0 — не запущен). */
int httpd_port(void);

/** Останавливает сервер. */
void httpd_stop(void);

#endif
