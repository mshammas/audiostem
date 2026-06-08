import { useState, useRef, useCallback, useEffect } from "react";

const API = "http://localhost:5050/api";

const STEM_META = {
  vocals:  { label: "Vocals",  icon: "🎤", color: "#e8a87c", bg: "#2a1f18" },
  drums:   { label: "Drums",   icon: "🥁", color: "#7cb8e8", bg: "#162030" },
  bass:    { label: "Bass",    icon: "🎸", color: "#a87ce8", bg: "#1f1630" },
  other:   { label: "Other",   icon: "🎹", color: "#7ce8a8", bg: "#162a1e" },
  guitar:  { label: "Guitar",  icon: "🎸", color: "#e87c9a", bg: "#2a1620" },
  piano:   { label: "Piano",   icon: "🎹", color: "#e8d87c", bg: "#2a2616" },
};

function WaveformIcon({ color = "#fff", animated = false }) {
  const bars = [3, 7, 5, 10, 4, 8, 6, 11, 3, 9, 5, 7, 4];
  return (
    <svg width="48" height="24" viewBox="0 0 52 24" fill="none">
      {bars.map((h, i) => (
        <rect
          key={i}
          x={i * 4}
          y={(24 - h) / 2}
          width="2.5"
          height={h}
          rx="1.2"
          fill={color}
          opacity={animated ? 1 : 0.7}
          style={animated ? {
            animation: `wave ${0.6 + i * 0.07}s ease-in-out infinite alternate`,
            animationDelay: `${i * 0.05}s`,
          } : {}}
        />
      ))}
    </svg>
  );
}

function DropZone({ onFile, onUrl, disabled }) {
  const [dragging, setDragging] = useState(false);
  const [urlMode, setUrlMode] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const fileRef = useRef();

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  }, [disabled, onFile]);

  const handleDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = () => setDragging(false);

  const submitUrl = () => {
    const u = urlInput.trim();
    if (!u) return;
    onUrl(u);
    setUrlInput("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Drop area */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !disabled && fileRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? "#e8a87c" : "rgba(255,255,255,0.15)"}`,
          borderRadius: "20px",
          padding: "52px 32px",
          textAlign: "center",
          cursor: disabled ? "not-allowed" : "pointer",
          background: dragging ? "rgba(232,168,124,0.06)" : "rgba(255,255,255,0.02)",
          transition: "all 0.25s ease",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ pointerEvents: "none" }}>
          <div style={{ marginBottom: "16px", opacity: disabled ? 0.4 : 1 }}>
            <WaveformIcon color="#e8a87c" animated={dragging} />
          </div>
          <p style={{ color: "#e8a87c", fontFamily: "'Playfair Display', serif", fontSize: "22px", fontWeight: 600, margin: "0 0 8px" }}>
            Drop your audio or video file
          </p>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px", margin: 0, letterSpacing: "0.05em" }}>
            MP3, WAV, FLAC, AAC, OGG, M4A, MP4, MKV, MOV, AVI, WebM…
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*,video/*"
          style={{ display: "none" }}
          onChange={(e) => e.target.files[0] && onFile(e.target.files[0])}
        />
      </div>

      {/* Divider */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.08)" }} />
        <span style={{ color: "rgba(255,255,255,0.25)", fontSize: "12px", letterSpacing: "0.15em", fontFamily: "monospace" }}>OR</span>
        <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.08)" }} />
      </div>

      {/* URL input */}
      <div style={{ display: "flex", gap: "10px" }}>
        <input
          type="text"
          placeholder="Paste a YouTube link or any audio/video URL…"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submitUrl()}
          disabled={disabled}
          style={{
            flex: 1,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "12px",
            padding: "14px 18px",
            color: "#fff",
            fontSize: "14px",
            outline: "none",
            fontFamily: "inherit",
            transition: "border-color 0.2s",
          }}
          onFocus={(e) => e.target.style.borderColor = "rgba(232,168,124,0.5)"}
          onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
        />
        <button
          onClick={submitUrl}
          disabled={disabled || !urlInput.trim()}
          style={{
            background: "linear-gradient(135deg, #e8a87c, #d4845a)",
            border: "none",
            borderRadius: "12px",
            padding: "14px 22px",
            color: "#1a0f08",
            fontWeight: 700,
            fontSize: "14px",
            cursor: disabled || !urlInput.trim() ? "not-allowed" : "pointer",
            opacity: disabled || !urlInput.trim() ? 0.5 : 1,
            transition: "all 0.2s",
            whiteSpace: "nowrap",
            letterSpacing: "0.03em",
          }}
        >
          Separate ↗
        </button>
      </div>
    </div>
  );
}

function ProgressBar({ progress, status }) {
  const colors = {
    converting: "#7cb8e8",
    downloading: "#7ce8a8",
    separating: "#e8a87c",
    done: "#7ce8a8",
    error: "#e87c7c",
  };
  const c = colors[status] || "#e8a87c";
  return (
    <div>
      <div style={{
        display: "flex", justifyContent: "space-between",
        marginBottom: "8px", fontSize: "12px",
        color: "rgba(255,255,255,0.5)", letterSpacing: "0.05em",
        fontFamily: "monospace",
      }}>
        <span style={{ color: c, textTransform: "uppercase", letterSpacing: "0.1em" }}>{status}</span>
        <span>{progress}%</span>
      </div>
      <div style={{
        height: "4px", borderRadius: "2px",
        background: "rgba(255,255,255,0.08)",
        overflow: "hidden",
      }}>
        <div style={{
          width: `${progress}%`,
          height: "100%",
          background: status === "error" ? "#e87c7c" :
            `linear-gradient(90deg, ${c}88, ${c})`,
          borderRadius: "2px",
          transition: "width 0.4s ease",
          boxShadow: `0 0 8px ${c}66`,
        }} />
      </div>
    </div>
  );
}

function StemCard({ name, meta, sizeKb, jobId }) {
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`${API}/download/${jobId}/${name}`);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name}.mp3`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Download failed: " + e.message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div style={{
      background: meta.bg,
      border: `1px solid ${meta.color}22`,
      borderRadius: "16px",
      padding: "22px 24px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "16px",
      transition: "transform 0.2s, box-shadow 0.2s",
      cursor: "default",
    }}
    onMouseEnter={e => {
      e.currentTarget.style.transform = "translateY(-2px)";
      e.currentTarget.style.boxShadow = `0 8px 32px ${meta.color}22`;
    }}
    onMouseLeave={e => {
      e.currentTarget.style.transform = "translateY(0)";
      e.currentTarget.style.boxShadow = "none";
    }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        <div style={{
          width: "44px", height: "44px",
          borderRadius: "12px",
          background: `${meta.color}18`,
          border: `1px solid ${meta.color}33`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "22px",
        }}>
          {meta.icon}
        </div>
        <div>
          <div style={{ color: meta.color, fontFamily: "'Playfair Display', serif", fontSize: "18px", fontWeight: 600 }}>
            {meta.label}
          </div>
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "12px", fontFamily: "monospace", marginTop: "2px" }}>
            {sizeKb ? `${(sizeKb / 1024).toFixed(1)} MB · MP3 320k` : "MP3 320k"}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <WaveformIcon color={meta.color} />
        <button
          onClick={download}
          disabled={downloading}
          style={{
            background: `linear-gradient(135deg, ${meta.color}22, ${meta.color}11)`,
            border: `1px solid ${meta.color}44`,
            borderRadius: "10px",
            padding: "10px 18px",
            color: meta.color,
            fontWeight: 600,
            fontSize: "13px",
            cursor: downloading ? "wait" : "pointer",
            transition: "all 0.2s",
            letterSpacing: "0.03em",
            whiteSpace: "nowrap",
          }}
        >
          {downloading ? "↓…" : "↓ Download"}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = (id) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API}/status/${id}`);
        if (!res.ok) throw new Error("Status error");
        const data = await res.json();
        setJob(data);
        if (data.status === "done" || data.status === "error") {
          stopPolling();
          setBusy(false);
        }
      } catch (e) {
        // ignore transient errors
      }
    }, 1200);
  };

  useEffect(() => () => stopPolling(), []);

  const handleFile = async (file) => {
    setError(null);
    setBusy(true);
    setJob({ status: "uploading", progress: 2, message: "Uploading…" });
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API}/upload`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setJobId(data.job_id);
      startPolling(data.job_id);
    } catch (e) {
      setError(e.message);
      setBusy(false);
      setJob(null);
    }
  };

  const handleUrl = async (url) => {
    setError(null);
    setBusy(true);
    setJob({ status: "downloading", progress: 5, message: "Starting download…" });
    try {
      const res = await fetch(`${API}/from-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start");
      setJobId(data.job_id);
      startPolling(data.job_id);
    } catch (e) {
      setError(e.message);
      setBusy(false);
      setJob(null);
    }
  };

  const reset = () => {
    stopPolling();
    if (jobId) fetch(`${API}/cleanup/${jobId}`, { method: "DELETE" }).catch(() => {});
    setJobId(null);
    setJob(null);
    setError(null);
    setBusy(false);
  };

  const isDone = job?.status === "done";
  const isError = job?.status === "error";
  const stems = job?.stems || {};
  const stemEntries = Object.entries(stems);

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0d0d0f",
      backgroundImage: `
        radial-gradient(ellipse 80% 60% at 20% 10%, rgba(232,168,124,0.06) 0%, transparent 60%),
        radial-gradient(ellipse 60% 50% at 80% 80%, rgba(124,184,232,0.04) 0%, transparent 60%)
      `,
      fontFamily: "'Jost', 'Helvetica Neue', sans-serif",
      color: "#fff",
      padding: "0 16px",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Jost:wght@300;400;500;600;700&display=swap');
        @keyframes wave {
          from { transform: scaleY(0.4); }
          to { transform: scaleY(1); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        * { box-sizing: border-box; }
        input::placeholder { color: rgba(255,255,255,0.2); }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
      `}</style>

      <div style={{ maxWidth: "680px", margin: "0 auto", paddingTop: "64px", paddingBottom: "80px" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "52px" }}>
          <div style={{
            display: "inline-flex", gap: "6px", marginBottom: "24px",
            padding: "8px 16px",
            background: "rgba(232,168,124,0.08)",
            border: "1px solid rgba(232,168,124,0.2)",
            borderRadius: "100px",
            fontSize: "11px", letterSpacing: "0.2em", color: "#e8a87c",
            textTransform: "uppercase",
          }}>
            <span>Powered by Demucs htdemucs</span>
          </div>
          <h1 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: "clamp(36px, 7vw, 56px)",
            fontWeight: 700,
            margin: "0 0 16px",
            lineHeight: 1.1,
            background: "linear-gradient(135deg, #fff 40%, rgba(255,255,255,0.5))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}>
            Stem Separator
          </h1>
          <p style={{
            color: "rgba(255,255,255,0.35)",
            fontSize: "16px",
            margin: 0,
            lineHeight: 1.6,
            fontWeight: 300,
          }}>
            Isolate vocals, drums, bass & more from any audio or video.
            <br />Works with local files and YouTube links.
          </p>
        </div>

        {/* Main card */}
        <div style={{
          background: "rgba(255,255,255,0.025)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: "28px",
          padding: "36px",
          backdropFilter: "blur(20px)",
        }}>

          {/* Input area */}
          {!job && (
            <DropZone onFile={handleFile} onUrl={handleUrl} disabled={busy} />
          )}

          {/* Error state */}
          {error && !job && (
            <div style={{ marginTop: "20px", padding: "16px 20px", background: "rgba(232,124,124,0.08)", border: "1px solid rgba(232,124,124,0.2)", borderRadius: "12px", color: "#e87c7c", fontSize: "14px" }}>
              ⚠ {error}
            </div>
          )}

          {/* Processing state */}
          {job && !isDone && (
            <div style={{ animation: "fadeInUp 0.4s ease" }}>
              <div style={{
                display: "flex", alignItems: "center", gap: "14px",
                marginBottom: "28px",
              }}>
                <div style={{
                  width: "40px", height: "40px",
                  borderRadius: "10px",
                  background: "rgba(232,168,124,0.1)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <WaveformIcon color="#e8a87c" animated={!isError} />
                </div>
                <div>
                  <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "18px", fontWeight: 600 }}>
                    {isError ? "Something went wrong" : "Processing your audio…"}
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.35)", fontSize: "13px", marginTop: "2px" }}>
                    {job.message}
                  </div>
                </div>
              </div>

              <ProgressBar progress={job.progress} status={job.status} />

              {isError && (
                <div style={{ marginTop: "20px" }}>
                  <div style={{ padding: "14px 16px", background: "rgba(232,124,124,0.06)", border: "1px solid rgba(232,124,124,0.15)", borderRadius: "10px", color: "#e87c7c", fontSize: "13px", marginBottom: "16px" }}>
                    {job.message}
                  </div>
                  <button onClick={reset} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px", padding: "10px 20px", color: "#fff", cursor: "pointer", fontSize: "14px" }}>
                    ← Try again
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Done state */}
          {isDone && (
            <div style={{ animation: "fadeInUp 0.5s ease" }}>
              {/* Title row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "28px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                    <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#7ce8a8", boxShadow: "0 0 8px #7ce8a8" }} />
                    <span style={{ fontFamily: "'Playfair Display', serif", fontSize: "20px", fontWeight: 600 }}>
                      Separation complete
                    </span>
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "13px", paddingLeft: "18px" }}>
                    {job.original_name || "audio"} · {stemEntries.length} stems
                  </div>
                </div>
                <button onClick={reset} style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "10px",
                  padding: "8px 16px",
                  color: "rgba(255,255,255,0.4)",
                  cursor: "pointer",
                  fontSize: "13px",
                  transition: "all 0.2s",
                }}>
                  ← New file
                </button>
              </div>

              {/* Stem cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {stemEntries.map(([name, info]) => (
                  <StemCard
                    key={name}
                    name={name}
                    meta={STEM_META[name] || { label: name, icon: "🎵", color: "#e8a87c", bg: "#1a1208" }}
                    sizeKb={info.size_kb}
                    jobId={jobId}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer note */}
        <p style={{ textAlign: "center", color: "rgba(255,255,255,0.15)", fontSize: "12px", marginTop: "32px", lineHeight: 1.6 }}>
          Processing is done entirely on your machine — no audio is sent to the cloud.
          <br />Files are auto-deleted after 1 hour.
        </p>
      </div>
    </div>
  );
}
