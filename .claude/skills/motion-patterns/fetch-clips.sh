#!/usr/bin/env bash
# Restore the reference clips, which are gitignored.
#
#   ./fetch-clips.sh
#
# Reads `video_url` and `clip_file` from every apps/<app>/shot.json and downloads the clip into
# each pattern folder under that app. Skips anything already present. One download per shot even
# when several patterns share it.
set -euo pipefail
cd "$(dirname "$0")"

read_field() { python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get(sys.argv[2],''))" "$1" "$2"; }

missing=0; fetched=0; kept=0
for shot in apps/*/shot.json; do
  app_dir="$(dirname "$shot")"; app="$(basename "$app_dir")"
  url=$(read_field "$shot" video_url)
  name=$(read_field "$shot" clip_file)
  [ -n "$name" ] || name="$(read_field "$shot" slug).mp4"     # older records

  if [ -z "$url" ]; then
    echo "✗ $app: no video_url in shot.json — this clip is unrecoverable"; missing=$((missing+1)); continue
  fi

  tmp=""
  for pat in "$app_dir"/*/; do
    [ -d "$pat" ] || continue
    dest="$pat$name"
    if [ -f "$dest" ]; then kept=$((kept+1)); continue; fi
    if [ -z "$tmp" ]; then
      tmp="$(mktemp)"; echo "→ $app/$name"; curl -fsSL -o "$tmp" "$url"
    fi
    cp "$tmp" "$dest"; fetched=$((fetched+1))
  done
  [ -n "$tmp" ] && rm -f "$tmp"
done
echo "clips: $fetched downloaded, $kept already present, $missing unrecoverable"
[ "$missing" -eq 0 ]
