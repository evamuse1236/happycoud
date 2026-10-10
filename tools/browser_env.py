r"""Shared browser and URL settings for the Python Playwright checks in tools/.

CHROMIUM_PATH   browser executable. Default: /usr/bin/google-chrome-stable when it exists,
                otherwise Playwright's own Chromium (on Windows: %LOCALAPPDATA%\ms-playwright).
HAPPYCOUD_URL   running app to check. Default: http://127.0.0.1:4317/ (`npm run dev` without PORT).
"""
import os

LINUX_CHROME = '/usr/bin/google-chrome-stable'


def chromium_path():
    if os.environ.get('CHROMIUM_PATH'):
        return os.environ['CHROMIUM_PATH']
    return LINUX_CHROME if os.path.exists(LINUX_CHROME) else None


def base_url():
    url = os.environ.get('HAPPYCOUD_URL', 'http://127.0.0.1:4317/')
    return url if url.endswith('/') else url + '/'
