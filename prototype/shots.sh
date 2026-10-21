#!/bin/zsh
# Снимки макета: безголовый Chrome со своим профилем, личный Chrome не трогается.
set -e
cd "$(dirname "$0")"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROFILE=/tmp/paseo-tabs-chrome-profile
URL="file://$PWD/live.html"
shot() { # имя, hash, ширина, высота
  "$CHROME" --headless=new --user-data-dir=$PROFILE --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=2 --window-size=$3,$4 --virtual-time-budget=1500 \
    --screenshot="$PWD/shots/$1.png" "$URL#$2" >/dev/null 2>&1
  echo "shots/$1.png"
}
shot s1-now          "v=now&active=deb&shot=1"                 1560 975
shot s2-a-scroll     "v=a&active=pis&need=1&shot=1"            1560 975
shot s3-b-list       "v=b&active=pis&need=1&pop=1&shot=1"      1560 975
shot s4-b-search     "v=b&active=pis&need=1&pop=1&q=зв&shot=1" 1560 975
shot s5-c-wrap       "v=c&active=pis&need=1&shot=1"            1560 975
shot s6-info         "v=info&shot=1"                           1608 790
