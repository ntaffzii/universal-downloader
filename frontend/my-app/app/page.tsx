"use client";

import { useState } from "react";
import axios from "axios";
import { 
  Download, 
  Loader2, 
  Link as LinkIcon, 
  AlertCircle, 
  CheckCircle2,
  ClipboardPaste 
} from "lucide-react";

// --- Components & Icons ---
const PlatformBadge = ({ name, color, icon }: { name: string, color: string, icon: React.ReactNode }) => (
  <div className={`flex flex-col items-center gap-2 rounded-xl border border-gray-800 bg-gray-900/50 p-3 transition-all hover:bg-gray-800 hover:border-${color}-500/50 group cursor-default`}>
    <div className={`text-${color}-500 transition-transform group-hover:scale-110`}>{icon}</div>
    <span className="text-xs font-medium text-gray-400">{name}</span>
  </div>
);

const TikTokIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg>
);
const IgIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
);
const FbIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg>
);
const XIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path></svg>
);

export default function Home() {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("idle"); 

  // --- Validation ---
  const validateUrl = (input: string) => {
    const supportedDomains = /(instagram\.com|tiktok\.com|facebook\.com|fb\.watch|twitter\.com|x\.com)/i;
    
    if (!input) return "กรุณาวางลิงก์ก่อนครับ";
    if (!input.startsWith("http")) return "ลิงก์ไม่ถูกต้อง (ต้องขึ้นต้นด้วย http หรือ https)";
    if (!supportedDomains.test(input)) return "ขออภัย ระบบรองรับเฉพาะ TikTok, Instagram, Facebook และ X เท่านั้นครับ";
    
    return null;
  };

  const handlePaste = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        const text = await navigator.clipboard.readText();
        setUrl(text);
      } else {
        alert("Browser ของคุณไม่รองรับการวางอัตโนมัติ กรุณากด Ctrl+V");
      }
    } catch (err) {
      console.error("Failed to read clipboard");
    }
  };

  const handleDownload = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateUrl(url);
    if (validationError) { setError(validationError); return; }

    setIsLoading(true);
    setError("");
    setStatus("processing");

    try {
      // ✅ ใช้ Environment Variable
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
      
      const response = await axios.get(`${apiUrl}/api/download`, {
        params: { url: url },
        responseType: "blob",
        onDownloadProgress: (progressEvent: any) => setStatus("downloading"),
      });

      // --- ⚡ FIX: Logic แก้ไขปัญหารูปเป็น mp4 (Web Version) ⚡ ---
      
      // 1. ตรวจสอบ Content-Type ให้แน่ชัดก่อน
      // (Response type 'blob' จะเก็บ type ไว้ใน response.data.type ด้วย)
      const rawContentType = response.data.type || response.headers['content-type'] || "";
      const contentType = rawContentType.toLowerCase();
      
      console.log("Detected Web Content-Type:", contentType); // Debug ดูได้

      // 2. กำหนดนามสกุลจาก Content-Type เป็นหลัก (Source of Truth)
      let extension = "mp4"; // Default fallback
      if (contentType.includes("image/jpeg") || contentType.includes("image/jpg")) extension = "jpg";
      else if (contentType.includes("image/png")) extension = "png";
      else if (contentType.includes("image/webp")) extension = "webp";
      else if (contentType.includes("image/gif")) extension = "gif";
      
      // 3. ดึงชื่อไฟล์จาก Header Content-Disposition
      let filename = `download_${new Date().getTime()}.${extension}`;
      const disposition = response.headers['content-disposition'];
      
      if (disposition) {
        // หา filename*=UTF-8''... (แบบใหม่)
        const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/);
        if (utf8Match && utf8Match[1]) {
            filename = decodeURIComponent(utf8Match[1]);
        } else {
            // หา filename="..." (แบบเก่า)
            const standardMatch = disposition.match(/filename="?([^";]+)"?/);
            if (standardMatch && standardMatch[1]) {
                filename = standardMatch[1];
            }
        }
      }

      // 4. ⚡ จุดสำคัญ: บังคับเปลี่ยนนามสกุลไฟล์ให้ตรงกับ Content-Type ⚡
      // ถ้าชื่อไฟล์ที่ได้มาลงท้ายด้วย .mp4 แต่ Content-Type จริงๆ เป็น jpg
      // เราต้องลบ .mp4 ทิ้ง แล้วใส่ .jpg แทน
      if (!filename.toLowerCase().endsWith(`.${extension}`)) {
         // Regex นี้จะลบนามสกุลเดิมออก (ถ้ามี) แล้วเราจะเติมอันใหม่ที่ถูกต้อง
         filename = filename.replace(/\.[^/.]+$/, "") + `.${extension}`;
      }
      
      // Save File
      // สร้าง Blob โดยระบุ contentType ที่ถูกต้อง เพื่อให้ Browser เข้าใจว่าเป็นรูป
      const blob = new Blob([response.data], { type: contentType }); 
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.setAttribute("download", filename); // ตั้งชื่อไฟล์ที่นามสกุลถูกแล้ว
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      
      setStatus("success");
      setUrl(""); 
      setTimeout(() => setStatus("idle"), 5000);

    } catch (err: any) {
      console.error(err);
      if (err.response && err.response.data instanceof Blob) {
        const errorText = await err.response.data.text();
        try {
            const errorJson = JSON.parse(errorText);
            setError(errorJson.detail || "เกิดข้อผิดพลาดจาก Server");
        } catch {
            setError("ไม่สามารถดาวน์โหลดได้ ลิงก์อาจเป็น Private หรือถูกลบ");
        }
      } else {
        setError("ไม่สามารถเชื่อมต่อกับ Server ได้");
      }
      setStatus("idle");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] px-4 text-white font-sans selection:bg-blue-500/30">
      
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute top-[20%] left-[20%] w-72 h-72 bg-blue-600/10 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-[20%] right-[20%] w-72 h-72 bg-purple-600/10 rounded-full blur-[100px]"></div>
      </div>

      <div className="w-full max-w-lg space-y-8 animate-in fade-in slide-in-from-bottom-5 duration-700">
        
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-purple-600 shadow-2xl shadow-blue-900/20">
            <Download size={40} className="text-white drop-shadow-md" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
            Universal Saver
          </h1>
          <p className="text-gray-400 text-sm">
            รองรับวิดีโอและรูปภาพจาก TikTok, Instagram, Facebook, และ X (Twitter)
          </p>
        </div>

        {/* Platform Grid */}
        <div className="grid grid-cols-4 gap-3">
            <PlatformBadge name="TikTok" color="pink" icon={<TikTokIcon />} />
            <PlatformBadge name="Instagram" color="purple" icon={<IgIcon />} />
            <PlatformBadge name="Facebook" color="blue" icon={<FbIcon />} />
            <PlatformBadge name="X (Twitter)" color="zinc" icon={<XIcon />} />
        </div>

        {/* Input Form */}
        <div className="bg-gray-900/40 backdrop-blur-md border border-gray-800 p-6 rounded-2xl shadow-xl">
          <form onSubmit={handleDownload} className="space-y-4">
            <div className="relative group">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-gray-500 group-focus-within:text-blue-500 transition-colors">
                <LinkIcon size={20} />
              </div>
              <input
                type="url"
                placeholder="วางลิงก์ที่นี่..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="block w-full rounded-xl border border-gray-700 bg-gray-950/50 p-4 pl-11 pr-12 text-white placeholder-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all outline-none"
              />
              <button 
                type="button"
                onClick={handlePaste}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-white transition-colors"
                title="วางลิงก์"
              >
                <ClipboardPaste size={20} />
              </button>
            </div>

            <button
              type="submit"
              disabled={isLoading || !url}
              className={`flex w-full items-center justify-center rounded-xl px-5 py-4 text-base font-semibold transition-all duration-300
                ${isLoading 
                  ? "cursor-not-allowed bg-gray-800 text-gray-500" 
                  : "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-lg shadow-blue-900/20 transform hover:-translate-y-0.5"
                }`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  {status === "downloading" ? "กำลังรับข้อมูล..." : "กำลังประมวลผล..."}
                </>
              ) : (
                "ดาวน์โหลดทันที"
              )}
            </button>
          </form>
        </div>

        {/* Status Messages */}
        {error && (
          <div className="flex items-start gap-3 rounded-xl bg-red-500/10 p-4 text-sm text-red-200 border border-red-500/20 animate-in fade-in slide-in-from-top-2">
            <AlertCircle size={20} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {status === "success" && (
          <div className="flex items-center gap-3 rounded-xl bg-green-500/10 p-4 text-sm text-green-200 border border-green-500/20 animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 size={20} />
            <span>ดาวน์โหลดสำเร็จ! ไฟล์ถูกบันทึกในเครื่องแล้ว</span>
          </div>
        )}

      </div>

      <footer className="mt-12 text-gray-600 text-xs">
        © {new Date().getFullYear()} Universal Saver. For educational purposes only.
      </footer>
    </main>
  );
}