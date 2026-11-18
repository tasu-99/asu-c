#!/usr/bin/env bash
# 鱼友局推广片 · 合成脚本（65 秒 / 1920x1080 / 30fps）
set -e
cd "C:/Users/txm19/Documents/deepseek-harness/default-workspace"

CARDS="dsh-fish-friends/video/cards"
STAGE="dsh-fish-friends/video/stage"
OUT="dsh-fish-friends/video/build"
mkdir -p "$OUT"

ENC="-c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -r 30"

# 1) 图片段
mk_card() {  # $1=图 $2=时长 $3=输出 $4=fadein
  ffmpeg -y -loglevel error -loop 1 -i "$1" -t "$2" \
    -vf "scale=1920:1080,fade=t=in:st=0:d=${4:-0.5}" $ENC -an "$3"
}

mk_card "$CARDS/01-title.png"   6.0  "$OUT/seg1.mp4" 1.1
mk_card "$CARDS/02-problem.png" 10.5 "$OUT/seg2.mp4" 0.5
mk_card "$CARDS/03-open.png"    6.9  "$OUT/seg3.mp4" 0.5
mk_card "$CARDS/05-door.png"    8.0  "$OUT/seg7.mp4" 0.5

# 4) 录屏 A：0-8s 再定格 1.8s
ffmpeg -y -loglevel error -ss 0 -t 8 -i cut/stage.mp4 \
  -vf "tpad=stop_mode=clone:stop_duration=1.8,fade=t=in:st=0:d=0.6" $ENC -an "$OUT/seg4.mp4"

# 5) 录屏 B：9-17.2s
ffmpeg -y -loglevel error -ss 9 -t 8.2 -i cut/stage.mp4 -vf "fade=t=in:st=0:d=0.4" $ENC -an "$OUT/seg5.mp4"

# 6) 数据卡
mk_card "$CARDS/04-local.png"   7.6  "$OUT/seg6.mp4" 0.5

# 8) 结尾卡（含淡出）
ffmpeg -y -loglevel error -loop 1 -i "$CARDS/06-end.png" -t 8.0 \
  -vf "scale=1920:1080,fade=t=in:st=0:d=0.6,fade=t=out:st=7.2:d=0.8" $ENC -an "$OUT/seg8.mp4"

# 9) 拼接
cd "$OUT"
printf "file '%s'\n" seg1.mp4 seg2.mp4 seg3.mp4 seg4.mp4 seg5.mp4 seg6.mp4 seg7.mp4 seg8.mp4 > list.txt
ffmpeg -y -loglevel error -f concat -safe 0 -i list.txt -c copy video.mp4
cd "C:/Users/txm19/Documents/deepseek-harness/default-workspace"

# 10) 叠字幕 + 混音
ffmpeg -y -loglevel error -i "$OUT/video.mp4" -i "$STAGE/cap1.png" -i "$STAGE/cap2.png" \
  -i "dsh-fish-friends/video/mix.wav" -filter_complex "
    [0:v][1:v]overlay=0:908:enable='between(t,24.0,32.4)'[v1];
    [v1][2:v]overlay=0:896:enable='between(t,33.6,40.8)'[v2];
    [v2]format=yuv420p[vout]
  " -map "[vout]" -map 3:a -c:v libx264 -crf 18 -preset slow -pix_fmt yuv420p \
  -c:a aac -b:a 192k -ar 48000 -movflags +faststart -shortest \
  "dsh-fish-friends/video/鱼友局-推广片-1080p.mp4"

ffprobe -v error -show_entries format=duration,size -show_entries stream=codec_name,width,height,r_frame_rate \
  -of default=nw=1 "dsh-fish-friends/video/鱼友局-推广片-1080p.mp4"
