import sys
import logging
import subprocess
import traceback
import requests
import os  # <--- เพิ่มตัวนี้
import json
import re
from urllib.parse import quote
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import uvicorn

# Setup Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("UniversalDownloader")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Service: Image Streamer ---
def stream_image_logic(url: str):
    # เลียนแบบ Browser เพื่อให้ Server ยอมปล่อยไฟล์ภาพ
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }
    with requests.get(url, stream=True, headers=headers) as r:
        r.raise_for_status()
        for chunk in r.iter_content(chunk_size=8192):
            yield chunk

# --- Service: Video Streamer (yt-dlp) ---
def stream_video_logic(url: str):
    cmd = [
        sys.executable, "-m", "yt_dlp", 
        "--format", "best[ext=mp4]/best",
        "--output", "-",
        "--quiet", "--no-warnings", "--no-playlist",
        "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        url
    ]
    
    with subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=10**6) as process:
        while True:
            chunk = process.stdout.read(64 * 1024)
            if not chunk: break
            yield chunk

# --- 🕵️‍♂️ Fallback Engine: The Bot Masquerade ---
def scrape_og_image(url: str, platform: str):
    logger.info(f"Attempting {platform} Image Fallback (Bot Mode)...")
    
    # ⚡ เปลี่ยน User-Agent: X จะเกรงใจ Googlebot มากกว่า Facebook Bot
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    }
    
    try:
        r = requests.get(url, headers=headers, timeout=10)
        html = r.text
        
        image_url = None

        # กรณี X/Twitter: ให้หา twitter:image ก่อน (มักจะแม่นกว่า og:image ใน X)
        if "twitter" in platform or "x.com" in url:
             # หา <meta name="twitter:image" content="...">
             match_tw = re.search(r'name="twitter:image"\s+content="([^"]+)"', html)
             if match_tw:
                 image_url = match_tw.group(1)
             else:
                 # ถ้าไม่เจอ ลองหา og:image
                 match_og = re.search(r'property="og:image"\s+content="([^"]+)"', html)
                 if match_og: image_url = match_og.group(1)

        # กรณีอื่น (IG/FB): หา og:image เป็นหลัก
        else:
             match_og = re.search(r'property="og:image"\s+content="([^"]+)"', html)
             if match_og: image_url = match_og.group(1)

        # --- ตรวจสอบผลลัพธ์ ---
        if image_url:
            # 🛑 ดักจับรูป Default ของ X (ที่เป็นรูปโลโก้ขาวดำ)
            if "default_profile_images" in image_url or "abs.twimg.com" in image_url:
                logger.warning("Found default/placeholder image. Skipping.")
                return None 

            # Twitter Hack: แปลงรูปเล็กเป็นรูปใหญ่ (Orig)
            if "twimg.com" in image_url:
                # ลบ parameter เก่าออกแล้วเติม name=orig เพื่อเอาภาพชัดสุด
                if "?" in image_url:
                    image_url = image_url.split("?")[0]
                image_url += "?format=jpg&name=orig"
            
            # Decode HTML entities
            image_url = image_url.replace("&amp;", "&")
            
            logger.info(f"Fallback Success! Found image: {image_url}")
            return {
                "ext": "jpg",
                "title": f"{platform}_image_fallback",
                "url": image_url
            }

    except Exception as e:
        logger.error(f"Fallback failed: {e}")
    
    return None

@app.get("/api/download")
def download_content(url: str = Query(..., description="Content URL")):
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")

    logger.info(f"Analyzing content: {url}")
    
    # ตัด Youtube ออกตามคำขอ
    if "youtube.com" in url or "youtu.be" in url:
        raise HTTPException(status_code=400, detail="YouTube is not supported in this version.")

    info = {}
    is_fallback = False

    try:
        # 1. พยายามใช้ yt-dlp ก่อน (ดีที่สุดสำหรับวิดีโอ)
        cmd_info = [
            sys.executable, "-m", "yt_dlp",
            "--dump-json",
            "--quiet", "--no-warnings", "--no-playlist",
            "--add-header", "Accept-Language:th-TH,th;q=0.9,en;q=0.8",
            "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "--ignore-no-formats-error", 
            url
        ]
        
        result = subprocess.run(cmd_info, capture_output=True, text=True, encoding='utf-8', timeout=30)
        
        # --- 🛡️ Error Handling & Fallback Zone ---
        if result.returncode != 0 or not result.stdout.strip():
            error_msg = result.stderr.strip()
            logger.warning(f"yt-dlp failed/empty: {error_msg}. Switching to Fallback.")
            
            # ตรวจสอบว่าเป็นเว็บที่เราจะใช้ Fallback ไหม
            if "twitter.com" in url or "x.com" in url:
                fallback_data = scrape_og_image(url, "twitter")
                if fallback_data:
                    info = fallback_data
                    is_fallback = True
                else:
                    raise HTTPException(status_code=400, detail="ไม่พบรูปภาพในลิงก์ X/Twitter นี้ (อาจเป็น Private)")
            
            elif "instagram.com" in url:
                fallback_data = scrape_og_image(url, "instagram")
                if fallback_data:
                    info = fallback_data
                    is_fallback = True
                else:
                    raise HTTPException(status_code=400, detail="ไม่พบรูปภาพ (IG อาจเป็น Private หรือต้อง Login)")
            
            else:
                 # ถ้าไม่ใช่เว็บเป้าหมาย และ yt-dlp พัง ก็จบข่าว
                 raise Exception(f"ไม่สามารถดึงข้อมูลได้: {error_msg}")
        else:
            # yt-dlp ทำงานปกติ (ส่วนใหญ่จะเป็น Video)
            try:
                info = json.loads(result.stdout)
            except json.JSONDecodeError:
                # เผื่อ yt-dlp ส่งขยะมา
                 if "instagram.com" in url:
                    fallback_data = scrape_og_image(url, "instagram")
                    if fallback_data:
                        info = fallback_data
                        is_fallback = True
                    else:
                        raise HTTPException(status_code=500, detail="Instagram Parse Error")
                 else:
                    raise HTTPException(status_code=500, detail="Invalid JSON response")

        # ----------------------------------------------------

        ext = info.get('ext', 'mp4')
        title = info.get('title', 'downloaded_content')
        
        # Clean Title (รองรับภาษาไทย)
        safe_filename = "".join([c for c in title if c.isalnum() or c in (' ', '-', '_', '.')]).strip()
        if not safe_filename: safe_filename = "content"
        safe_filename = safe_filename[:50]

        # แก้ปัญหาชื่อไฟล์ภาษาไทย (Facebook/Others)
        encoded_filename = quote(safe_filename)

        # --- Decision Making ---
        # ถ้าเป็น Fallback เราตีว่าเป็นรูปภาพไว้ก่อน
        if is_fallback or ext in ['jpg', 'jpeg', 'png', 'webp']:
            logger.info("Detected: IMAGE")
            image_url = info.get('url')
            
            # ถ้าไม่มี extension ใน fallback data ให้เดาว่าเป็น jpg
            final_ext = ext if ext in ['jpg', 'jpeg', 'png', 'webp'] else 'jpg'
            
            return StreamingResponse(
                stream_image_logic(image_url),
                media_type=f"image/{final_ext}",
                headers={
                    "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}.{final_ext}",
                    "X-Content-Type": "image"
                }
            )
        else:
            logger.info("Detected: VIDEO")
            return StreamingResponse(
                stream_video_logic(url),
                media_type="video/mp4",
                headers={
                    "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}.mp4",
                    "X-Content-Type": "video"
                }
            )

    except HTTPException as he:
        raise he
    except Exception as e:
        error_trace = traceback.format_exc()
        logger.error(f"Error: {error_trace}")
        raise HTTPException(status_code=500, detail="Server Error")

# ❌ ของเดิม (ใช้ได้แค่ในเครื่องเรา)
# if __name__ == "__main__":
#     uvicorn.run(app, host="127.0.0.1", port=8000)

# ✅ ของใหม่ (ใช้ได้ทั้ง Render และเครื่องเรา)
if __name__ == "__main__":
    # ดึง Port จาก Render ถ้าไม่มีให้ใช้ 8000
    port = int(os.environ.get("PORT", 8000)) 
    
    # เปลี่ยน host เป็น 0.0.0.0 เพื่อให้โลกภายนอกเข้าถึงได้
    uvicorn.run(app, host="0.0.0.0", port=port)