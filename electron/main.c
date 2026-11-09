// ============================================================================
//  «Тихий Залив» — нативный оконный лаунчер для Windows (Win32 + WebView2).
//
//  Один самодостаточный .exe: вся игра (HTML+CSS+JS, ~1 МБ) встроена в
//  ресурс RT_HTML/101, при запуске распаковывается в
//  %LOCALAPPDATA%\TikhiyZaliv\app.html и открывается в системном WebView2
//  (движок Edge Chromium, входит в Windows 10/11).
//
//  Интерфейсы WebView2 объявлены вручную по официальному WebView2.idl.
//  Порядок методов в vtable проверен по IDL, номера слотов указаны
//  в комментариях у каждого вызова (0..2 — IUnknown).
//
//  Сборка: zig cc -target x86_64-windows-gnu (кросс-компиляция с Linux).
// ============================================================================
#define UNICODE
#define _UNICODE
#define WIN32_LEAN_AND_MEAN

#include <windows.h>
#include <shlobj.h>
#include <stdio.h>
#include <stdlib.h>
#include <wchar.h>

#include "resource.h"
#include "httpd.h"

#ifndef min
#define min(a, b) (((a) < (b)) ? (a) : (b))
#endif

// ---------------------------------------------------------------- вызовы COM
// Слоты vtable по WebView2.idl (0 QueryInterface, 1 AddRef, 2 Release).
typedef ULONG(STDMETHODCALLTYPE *FnAddRef)(void *);
typedef ULONG(STDMETHODCALLTYPE *FnRelease)(void *);

#define VT(obj) (*(void ***)(obj))

static ULONG ComAddRef(void *obj) { return ((FnAddRef)VT(obj)[1])(obj); }
static ULONG ComRelease(void *obj) { return ((FnRelease)VT(obj)[2])(obj); }

// ICoreWebView2Environment::CreateCoreWebView2Controller — слот 3
typedef HRESULT(STDMETHODCALLTYPE *FnCreateController)(void *, HWND, void *);

// ICoreWebView2Controller — слоты
typedef HRESULT(STDMETHODCALLTYPE *FnPutIsVisible)(void *, BOOL);        // 4
typedef HRESULT(STDMETHODCALLTYPE *FnPutBounds)(void *, RECT);           // 6
typedef HRESULT(STDMETHODCALLTYPE *FnGetCoreWebView2)(void *, void **);  // 25

// ICoreWebView2 — слоты
typedef HRESULT(STDMETHODCALLTYPE *FnGetSettings)(void *, void **);          // 3
typedef HRESULT(STDMETHODCALLTYPE *FnNavigate)(void *, LPCWSTR);             // 5
typedef HRESULT(STDMETHODCALLTYPE *FnExecuteScript)(void *, LPCWSTR, void *); // 29

// ICoreWebView2Settings — слоты (propput идут парами с propget)
typedef HRESULT(STDMETHODCALLTYPE *FnPutBool)(void *, BOOL);
// IsScriptEnabled   propget 3 / propput 4
// IsWebMessageEnabled      5 / 6
// AreDefaultScriptDialogs  7 / 8
// IsStatusBarEnabled       9 / 10
// AreDevToolsEnabled      11 / 12
// AreDefaultContextMenus  13 / 14

typedef HRESULT(STDMETHODCALLTYPE *FnCreateEnvWithOptions)(LPCWSTR, LPCWSTR, void *, void *);

// ---------------------------------------------------------------- состояние
static HWND g_hwnd;
static void *g_controller;
static void *g_webview;
static wchar_t g_appHtmlPath[MAX_PATH];
static int g_serverPort = 0;
static const char *g_htmlData = NULL;
static unsigned int g_htmlSize = 0;

// ---------------------------------------------------------------- утилиты
static void JoinPath(wchar_t *out, size_t cap, const wchar_t *a, const wchar_t *b) {
  _snwprintf(out, cap - 1, L"%s\\%s", a, b);
  out[cap - 1] = 0;
}

static void ShowError(const wchar_t *text) {
  MessageBoxW(NULL, text, L"Тихий Залив", MB_OK | MB_ICONERROR);
}

/** Папка данных: %LOCALAPPDATA%\TikhiyZaliv */
static int PrepareDataDir(void) {
  wchar_t base[MAX_PATH];
  if (!SUCCEEDED(SHGetFolderPathW(NULL, CSIDL_LOCAL_APPDATA, NULL, 0, base))) return 0;
  JoinPath(base, MAX_PATH, base, L"TikhiyZaliv");
  CreateDirectoryW(base, NULL);
  if (GetFileAttributesW(base) == INVALID_FILE_ATTRIBUTES) return 0;
  JoinPath(g_appHtmlPath, MAX_PATH, base, L"app.html");
  return 1;
}

static int LoadGameData(void) {
  HRSRC res = FindResourceW(NULL, MAKEINTRESOURCEW(IDR_APP_HTML), RT_HTML);
  if (!res) return 0;
  g_htmlSize = (unsigned int)SizeofResource(NULL, res);
  HGLOBAL data = LoadResource(NULL, res);
  if (!data || !g_htmlSize) return 0;
  g_htmlData = (const char *)LockResource(data);
  return g_htmlData != NULL;
}

/** Достаёт встроенный HTML из ресурсов и пишет его в app.html как есть (UTF-8). */
static int ExtractGame(const wchar_t *outPath) {
  HRSRC res = FindResourceW(NULL, MAKEINTRESOURCEW(IDR_APP_HTML), RT_HTML);
  if (!res) return 0;
  DWORD size = SizeofResource(NULL, res);
  HGLOBAL data = LoadResource(NULL, res);
  if (!data || !size) return 0;
  const void *ptr = LockResource(data);
  if (!ptr) return 0;

  HANDLE h = CreateFileW(outPath, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
  if (h == INVALID_HANDLE_VALUE) return 0;
  DWORD written = 0;
  BOOL ok = WriteFile(h, ptr, size, &written, NULL);
  CloseHandle(h);
  return ok && written == size;
}

static void ResizeWebView(void) {
  if (!g_controller) return;
  RECT rc;
  GetClientRect(g_hwnd, &rc);
  ((FnPutBounds)VT(g_controller)[6])(g_controller, rc);
}

// ---------------------------------------------------------------- обработчики
// ICoreWebView2CreateCoreWebView2ControllerCompletedHandler: слот 3 = Invoke
typedef struct {
  void **lpVtbl;
  DWORD ref;
  int kind;
} Handler;

static HRESULT STDMETHODCALLTYPE Handler_QueryInterface(Handler *self, const IID *iid, void **out) {
  (void)iid;
  *out = self;
  self->ref++;
  return S_OK;
}
static ULONG STDMETHODCALLTYPE Handler_AddRef(Handler *self) { return ++self->ref; }
static ULONG STDMETHODCALLTYPE Handler_Release(Handler *self) {
  ULONG r = --self->ref;
  if (!r) free(self);
  return r;
}

static HRESULT STDMETHODCALLTYPE ControllerReady(Handler *self, HRESULT result, void *controller) {
  (void)self;
  if (FAILED(result) || !controller) {
    ShowError(L"Не удалось создать окно WebView2.\n\n"
              L"Проверьте, что установлен компонент «Microsoft Edge WebView2 Runtime».");
    return result;
  }
  g_controller = controller;
  ComAddRef(controller);
  ResizeWebView();
  ((FnPutIsVisible)VT(controller)[4])(controller, TRUE);

  void *webview = NULL;
  if (FAILED(((FnGetCoreWebView2)VT(controller)[25])(controller, &webview)) || !webview) {
    ShowError(L"WebView2 не передал объект браузера.");
    return E_FAIL;
  }
  g_webview = webview;
  ComAddRef(webview);

  void *settings = NULL;
  if (SUCCEEDED(((FnGetSettings)VT(webview)[3])(webview, &settings)) && settings) {
    ((FnPutBool)VT(settings)[4])(settings, TRUE);   // IsScriptEnabled
    ((FnPutBool)VT(settings)[10])(settings, FALSE); // IsStatusBarEnabled
    ((FnPutBool)VT(settings)[12])(settings, FALSE); // AreDevToolsEnabled
    ((FnPutBool)VT(settings)[14])(settings, FALSE); // AreDefaultContextMenusEnabled
    ComRelease(settings);
  }

  wchar_t url[MAX_PATH + 16];
  if (g_serverPort) {
    _snwprintf(url, MAX_PATH + 15, L"http://127.0.0.1:%d/", g_serverPort);
  } else {
    _snwprintf(url, MAX_PATH + 15, L"file:///%s", g_appHtmlPath);
    for (wchar_t *c = url; *c; ++c)
      if (*c == L'\\') *c = L'/';
  }
  url[MAX_PATH + 15] = 0;
  ((FnNavigate)VT(webview)[5])(webview, url);
  return S_OK;
}

static HRESULT STDMETHODCALLTYPE EnvironmentReady(Handler *self, HRESULT result, void *env) {
  (void)self;
  if (FAILED(result) || !env) {
    ShowError(L"Не удалось запустить среду WebView2.\n\n"
              L"Установите «Microsoft Edge WebView2 Runtime» и запустите игру снова.");
    return result;
  }
  Handler *ch = (Handler *)calloc(1, sizeof(Handler));
  if (!ch) return E_OUTOFMEMORY;
  static void *vtbl[4] = {
      (void *)Handler_QueryInterface, (void *)Handler_AddRef, (void *)Handler_Release,
      (void *)ControllerReady,
  };
  ch->lpVtbl = vtbl;
  ch->ref = 1;
  ch->kind = 1;
  ((FnCreateController)VT(env)[3])(env, g_hwnd, ch);
  return S_OK;
}


// ---------------------------------------------------------------- окно
static LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
  (void)wp;
  switch (msg) {
    case WM_SIZE:
      ResizeWebView();
      return 0;
    case WM_GETMINMAXINFO: {
      MINMAXINFO *mm = (MINMAXINFO *)lp;
      mm->ptMinTrackSize.x = 960;
      mm->ptMinTrackSize.y = 600;
      return 0;
    }
    case WM_ERASEBKGND:
      return 1;
    case WM_DESTROY:
      PostQuitMessage(0);
      return 0;
    default:
      return DefWindowProcW(hwnd, msg, wp, lp);
  }
}

static int CreateMainWindow(void) {
  WNDCLASSEXW wc = {0};
  wc.cbSize = sizeof(WNDCLASSEXW);
  wc.style = CS_HREDRAW | CS_VREDRAW;
  wc.lpfnWndProc = WndProc;
  wc.hInstance = GetModuleHandleW(NULL);
  wc.hCursor = LoadCursorW(NULL, IDC_ARROW);
  wc.hbrBackground = (HBRUSH)GetStockObject(BLACK_BRUSH);
  wc.lpszClassName = L"TikhiyZalivWindow";
  wc.hIcon = LoadIconW(wc.hInstance, MAKEINTRESOURCEW(IDI_APP_ICON));
  wc.hIconSm = wc.hIcon;
  if (!RegisterClassExW(&wc)) return 0;

  int sw = GetSystemMetrics(SM_CXSCREEN), sh = GetSystemMetrics(SM_CYSCREEN);
  int w = min(1600, sw > 200 ? sw - 80 : 1600);
  int h = min(900, sh > 200 ? sh - 120 : 900);
  if (w < 960) w = 960;
  if (h < 600) h = 600;

  g_hwnd = CreateWindowExW(0, wc.lpszClassName,
                           L"Тихий Залив — 3D-симулятор рыбалки и исследований",
                           WS_OVERLAPPEDWINDOW, CW_USEDEFAULT, CW_USEDEFAULT, w, h, NULL, NULL,
                           wc.hInstance, NULL);
  if (!g_hwnd) return 0;
  ShowWindow(g_hwnd, SW_SHOW);
  UpdateWindow(g_hwnd);
  return 1;
}

// ---------------------------------------------------------------- WebView2
static HMODULE LoadWebViewLoader(void) {
  HMODULE mod = LoadLibraryW(L"WebView2Loader.dll");  // рядом с игрой (офлайн-комплект)
  if (mod) return mod;

  const wchar_t *roots[] = {
      L"C:\\Program Files (x86)\\Microsoft\\EdgeWebView\\Application",
      L"C:\\Program Files\\Microsoft\\EdgeWebView\\Application",
  };
  for (int i = 0; i < 2 && !mod; i++) {
    wchar_t pattern[MAX_PATH];
    _snwprintf(pattern, MAX_PATH - 1, L"%s\\*", roots[i]);
    pattern[MAX_PATH - 1] = 0;
    WIN32_FIND_DATAW fd;
    HANDLE h = FindFirstFileW(pattern, &fd);
    if (h == INVALID_HANDLE_VALUE) continue;
    do {
      if ((fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) && fd.cFileName[0] != L'.') {
        wchar_t path[MAX_PATH * 2];
        const wchar_t *tails[] = {L"\\EBWebView\\x64\\WebView2Loader.dll", L"\\WebView2Loader.dll"};
        for (int t = 0; t < 2 && !mod; t++) {
          _snwprintf(path, MAX_PATH * 2 - 1, L"%s\\%s%s", roots[i], fd.cFileName, tails[t]);
          path[MAX_PATH * 2 - 1] = 0;
          mod = LoadLibraryW(path);
        }
        if (mod) break;
      }
    } while (FindNextFileW(h, &fd));
    FindClose(h);
  }
  return mod;
}

static int InitWebView(void) {
  HMODULE loader = LoadWebViewLoader();
  if (!loader) {
    ShowError(L"Не найден компонент WebView2.\n\n"
              L"Игре нужен «Microsoft Edge WebView2 Runtime»:\n"
              L"https://go.microsoft.com/fwlink/p/?LinkId=2124703\n\n"
              L"В Windows 11 и в большинстве сборок Windows 10 он уже установлен.");
    return 0;
  }
  FnCreateEnvWithOptions create =
      (FnCreateEnvWithOptions)GetProcAddress(loader, "CreateCoreWebView2EnvironmentWithOptions");
  if (!create) {
    ShowError(L"Версия WebView2 слишком старая. Обновите Microsoft Edge WebView2 Runtime.");
    return 0;
  }

  wchar_t tmp[MAX_PATH], userData[MAX_PATH];
  GetTempPathW(MAX_PATH, tmp);
  JoinPath(userData, MAX_PATH, tmp, L"TikhiyZalivWebView2");
  CreateDirectoryW(userData, NULL);

  Handler *eh = (Handler *)calloc(1, sizeof(Handler));
  if (!eh) return 0;
  static void *vtbl[4] = {
      (void *)Handler_QueryInterface, (void *)Handler_AddRef, (void *)Handler_Release,
      (void *)EnvironmentReady,
  };
  eh->lpVtbl = vtbl;
  eh->ref = 1;

  HRESULT hr = create(NULL, userData, NULL, eh);
  if (FAILED(hr)) {
    ShowError(L"WebView2 Runtime не запустился.\n\n"
              L"Переустановите «Microsoft Edge WebView2 Runtime».");
    return 0;
  }
  return 1;
}

// ---------------------------------------------------------------- точка входа
int WINAPI WinMain(HINSTANCE hInst, HINSTANCE hPrev, LPSTR cmdLine, int show) {
  (void)hInst;
  (void)hPrev;
  (void)cmdLine;
  (void)show;

  SetProcessDPIAware();

  if (!PrepareDataDir()) {
    ShowError(L"Не удалось определить папку данных пользователя.");
    return 1;
  }
  if (!LoadGameData()) {
    ShowError(L"Файл игры повреждён: встроенные данные не читаются.");
    return 1;
  }
  // Резервная копия на диск — если локальный сервер поднять не удалось.
  ExtractGame(g_appHtmlPath);
  g_serverPort = httpd_start(g_htmlData, g_htmlSize, 8765, 8865);
  if (!CreateMainWindow()) {
    ShowError(L"Не удалось создать окно игры.");
    return 1;
  }
  if (!InitWebView()) return 1;

  MSG msg;
  while (GetMessageW(&msg, NULL, 0, 0)) {
    TranslateMessage(&msg);
    DispatchMessageW(&msg);
  }

  if (g_webview) ComRelease(g_webview);
  if (g_controller) ComRelease(g_controller);
  return 0;
}
