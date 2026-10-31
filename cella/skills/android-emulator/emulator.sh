#!/usr/bin/env bash
# Android emulator with real Chrome and Gboard. See SKILL.md.
# Usage: emulator.sh install | start [--wipe] | stop
set -euo pipefail

ROOT="${ANDROID_ROOT:-$HOME/Library/Android}"
SDK="$ROOT/sdk"
JDK="$ROOT/jdk-17"
AVD=cella-phone
IMAGE='system-images;android-35;google_apis_playstore;arm64-v8a'

export JAVA_HOME="$JDK/Contents/Home"
export ANDROID_HOME="$SDK"
export ANDROID_SDK_ROOT="$SDK"
export PATH="$JAVA_HOME/bin:$SDK/cmdline-tools/latest/bin:$SDK/platform-tools:$SDK/emulator:$PATH"

install() {
  # An Intel Homebrew under Rosetta pulls an x86 emulator with no hardware acceleration, so nothing here goes through it
  if [ "$(uname -s)" != Darwin ] || [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" != 1 ]; then
    echo 'Only written for macOS on Apple silicon.' >&2
    exit 1
  fi
  mkdir -p "$SDK/cmdline-tools"
  local downloads
  downloads="$(mktemp -d)"
  trap 'rm -rf "$downloads"' RETURN

  if [ ! -x "$JAVA_HOME/bin/java" ]; then
    curl -fsSL -o "$downloads/jdk.tar.gz" 'https://api.adoptium.net/v3/binary/latest/17/ga/mac/aarch64/jdk/hotspot/normal/eclipse'
    mkdir -p "$JDK"
    tar -xzf "$downloads/jdk.tar.gz" -C "$JDK" --strip-components=1
  fi

  if [ ! -x "$SDK/cmdline-tools/latest/bin/sdkmanager" ]; then
    local version
    version="$(curl -fsSL https://dl.google.com/android/repository/repository2-3.xml | grep -oE 'commandlinetools-mac-[0-9]+_latest\.zip' | grep -oE '[0-9]+' | sort -n | tail -1)"
    curl -fsSL -o "$downloads/tools.zip" "https://dl.google.com/android/repository/commandlinetools-mac-${version}_latest.zip"
    unzip -q -o "$downloads/tools.zip" -d "$downloads"
    mv "$downloads/cmdline-tools" "$SDK/cmdline-tools/latest"
  fi

  # `yes` ends with SIGPIPE once sdkmanager stops reading, which pipefail would report as a failure
  yes 2>/dev/null | sdkmanager --licenses >/dev/null || true
  sdkmanager --install platform-tools emulator "$IMAGE" | tr '\r' '\n' | grep -vE '^\s*\[=*' | tail -2

  if ! emulator -list-avds | grep -qx "$AVD"; then
    echo no | avdmanager create avd -n "$AVD" -k "$IMAGE" -d pixel_7 >/dev/null
    local config="${ANDROID_AVD_HOME:-$HOME/.android/avd}/$AVD.avd/config.ini"
    # hw.keyboard off: a hardware keyboard stops the on-screen one from opening, which is the whole point
    sed -i '' -E 's/^hw\.ramSize=.*/hw.ramSize=4096/; s/^hw\.keyboard=.*/hw.keyboard=no/' "$config"
  fi
  echo "Installed in $ROOT ($(du -sh "$ROOT" | cut -f1))"
}

dismiss_chrome_prompt() {
  local node
  # Chrome's first-run notification prompt swallows every tap until it is answered
  node="$(adb -e exec-out uiautomator dump /dev/tty 2>/dev/null | grep -oE 'text="No thanks"[^>]*bounds="\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]"' || true)"
  [ -n "$node" ] || return 1
  # shellcheck disable=SC2046
  set -- $(echo "$node" | sed -E 's/.*bounds="\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]"/\1 \2 \3 \4/')
  adb -e shell input tap $((($1 + $3) / 2)) $((($2 + $4) / 2))
}

start() {
  local wipe=()
  [ "${1:-}" = --wipe ] && wipe=(-wipe-data)
  if ! adb devices | grep -q '^emulator-'; then
    nohup emulator -avd "$AVD" -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect -no-snapshot-save "${wipe[@]+"${wipe[@]}"}" >"$ROOT/emulator.log" 2>&1 &
    disown
    adb -e wait-for-device
    until [ "$(adb -e shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; do /bin/sleep 3; done
  fi
  adb -e shell "echo '_ --disable-fre --no-default-browser-check --no-first-run' > /data/local/tmp/chrome-command-line"
  adb -e shell am set-debug-app --persistent com.android.chrome
  adb -e shell am start -a android.intent.action.VIEW -d about:blank -n com.android.chrome/com.google.android.apps.chrome.Main >/dev/null
  for _ in 1 2 3 4 5 6; do
    /bin/sleep 3
    dismiss_chrome_prompt && break
  done
  /bin/sleep 2
  adb -e forward tcp:9222 localabstract:chrome_devtools_remote >/dev/null
  curl -fs --max-time 5 http://localhost:9222/json/version | grep -m1 Browser
}

stop() {
  adb -e emu kill
  adb kill-server
}

case "${1:-}" in
  install) install ;;
  start) start "${2:-}" ;;
  stop) stop ;;
  *)
    echo 'Usage: emulator.sh install | start [--wipe] | stop' >&2
    exit 1
    ;;
esac
