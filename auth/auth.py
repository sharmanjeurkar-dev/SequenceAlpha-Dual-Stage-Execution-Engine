import os
import subprocess
import sys
import time
import webbrowser
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from dotenv import load_dotenv
from fyers_apiv3 import fyersModel

# Resolve project paths
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
TARGET_BROKER_DIR = PROJECT_ROOT / "Data" / "broker_data"
ROOT_ENV_FILE = PROJECT_ROOT / ".env"

# Load credentials from root .env if present
if ROOT_ENV_FILE.exists():
    load_dotenv(dotenv_path=ROOT_ENV_FILE)

CLIENT_ID = os.getenv("CLIENT_ID") or os.getenv("FYERS_CLIENT_ID")
SECRET_KEY = os.getenv("SECRET_ID") or os.getenv("SECREDT_ID") or os.getenv("FYERS_SECRET_KEY")
REDIRECT_URI = os.getenv("REDIRECT_URI", "https://google.com")

if not CLIENT_ID:
    CLIENT_ID = input("Enter App ID (CLIENT_ID): ").strip()
if not SECRET_KEY:
    SECRET_KEY = input("Enter Secret Key (SECRET_ID): ").strip()


def extract_auth_code_from_url(url_str: str) -> str | None:
    if not url_str or "auth_code=" not in url_str:
        return None
    try:
        parsed = urlparse(url_str.strip())
        params = parse_qs(parsed.query)
        if "auth_code" in params and params["auth_code"]:
            return params["auth_code"][0]
    except Exception:
        pass
    return None


def get_browser_redirect_url() -> str | None:
    """Check open tabs/windows in Chrome and Safari using AppleScript to find the redirected URL."""
    # 1. Google Chrome check
    chrome_script = '''
    tell application "System Events"
        set isRunning to (name of processes) contains "Google Chrome"
    end tell
    if isRunning then
        tell application "Google Chrome"
            repeat with w in windows
                repeat with t in tabs of w
                    set tabUrl to URL of t
                    if tabUrl contains "auth_code=" then
                        return tabUrl
                    end if
                end repeat
            end repeat
        end tell
    end if
    return ""
    '''

    # 2. Safari check
    safari_script = '''
    tell application "System Events"
        set isRunning to (name of processes) contains "Safari"
    end tell
    if isRunning then
        tell application "Safari"
            repeat with w in windows
                repeat with t in tabs of w
                    set tabUrl to URL of t
                    if tabUrl contains "auth_code=" then
                        return tabUrl
                    end if
                end repeat
            end repeat
        end tell
    end if
    return ""
    '''

    for script in (chrome_script, safari_script):
        try:
            result = subprocess.run(
                ["osascript", "-e", script],
                capture_output=True,
                text=True,
                timeout=4,
            )
            found_url = result.stdout.strip()
            if found_url and "auth_code=" in found_url:
                return found_url
        except Exception:
            pass

    return None


def get_clipboard_url() -> str | None:
    """Check clipboard if user copied the URL or if clipboard contains auth_code."""
    try:
        result = subprocess.run(["pbpaste"], capture_output=True, text=True, timeout=2)
        clipboard_content = result.stdout.strip()
        if clipboard_content and "auth_code=" in clipboard_content:
            return clipboard_content
    except Exception:
        pass
    return None


def poll_for_auth_code(timeout_seconds: int = 180) -> str | None:
    """Automatically monitor open browser tabs and clipboard for the redirect URL with auth_code."""
    print("⏳ Auto-detecting login in browser... (waiting up to 3 minutes)")
    start_time = time.time()
    last_printed_sec = 0

    while time.time() - start_time < timeout_seconds:
        # Check active browser tabs
        browser_url = get_browser_redirect_url()
        code = extract_auth_code_from_url(browser_url)
        if code:
            print(f"\n🔍 Automatically captured redirect URL from browser: {browser_url}")
            return code

        # Check clipboard
        clip_url = get_clipboard_url()
        code = extract_auth_code_from_url(clip_url)
        if code:
            print(f"\n📋 Automatically captured redirect URL from clipboard: {clip_url}")
            return code

        elapsed = int(time.time() - start_time)
        if elapsed > 0 and elapsed % 15 == 0 and elapsed != last_printed_sec:
            print(f"⏳ Still waiting for you to complete login... ({elapsed}s elapsed)")
            last_printed_sec = elapsed

        time.sleep(2)

    return None


def login_and_generate_token():
    print("🔄 Initializing Fyers Auth Flow...")
    print(f"📌 Client ID: {CLIENT_ID}")
    print(f"📌 Redirect URI: {REDIRECT_URI}")

    session = fyersModel.SessionModel(
        client_id=CLIENT_ID,
        secret_key=SECRET_KEY,
        redirect_uri=REDIRECT_URI,
        response_type="code",
        grant_type="authorization_code",
    )

    try:
        auth_link = session.generate_authcode()
    except Exception as e:
        print(f"\n❌ Error generating auth link: {e}")
        return False

    print("\n🌐 Opening browser for Fyers Login...")
    print(f"Login link:\n{auth_link}\n")
    webbrowser.open(auth_link)

    print("👉 Complete your login in Chrome/Safari.")
    print("👉 Once Fyers redirects to Google, this script will automatically capture the URL and auth_code!")

    auth_code = poll_for_auth_code(timeout_seconds=180)

    # Fallback to manual entry only if auto-detection timed out
    if not auth_code:
        print("\n⚠️ Auto-detection timed out or could not read URL directly.")
        redirected_url = input("📝 Paste the redirected URL here (or press Enter to exit): ").strip()
        auth_code = extract_auth_code_from_url(redirected_url)

    if not auth_code:
        print("\n❌ Could not retrieve valid auth_code.")
        return False

    print("\n✅ Extracted Auth Code successfully.")

    # Exchange auth_code for final Access Token
    session.set_token(auth_code)
    try:
        response = session.generate_token()
    except Exception as e:
        print(f"\n❌ Failed to generate token: {e}")
        return False

    if response.get("s") == "ok":
        access_token = response["access_token"]
        print("\n🎉 SUCCESS! Generated Daily Access Token.")
        print("-" * 60)
        print(access_token)
        print("-" * 60)

        TARGET_BROKER_DIR.mkdir(parents=True, exist_ok=True)

        env_content = (
            f'FYERS_CLIENT_ID="{CLIENT_ID}"\n'
            f'FYERS_ACCESS_TOKEN="{access_token}"\n'
            f'CLIENT_ID="{CLIENT_ID}"\n'
            f'SECRET_ID="{SECRET_KEY}"\n'
            f'REDIRECT_URI="{REDIRECT_URI}"\n'
        )

        # Save to access_token.env in broker_data
        dest_file = TARGET_BROKER_DIR / "access_token.env"
        with open(dest_file, "w") as f:
            f.write(env_content)
        print(f"\n✅ Token successfully saved to: {dest_file}")

        print("\n✨ Ready to trade/scrape! You can close this window now.")
        return True
    else:
        print("\n❌ Failed to generate token. API Response:")
        print(response)
        return False


if __name__ == "__main__":
    success = login_and_generate_token()
    if not success:
        sys.exit(1)
