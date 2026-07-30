/**
 * LightningZap — the wow feature.
 * A lightning bolt + particle burst that fires whenever JSON finishes processing.
 * Renders as a fixed overlay, plays once, then vanishes.
 */
import { useEffect, useRef, useState } from "react";

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface LightningZapProps {
  /** Increment this to trigger a new burst */
  trigger: number;
  /** Where the burst originates (viewport coordinates). Defaults to top-right area. */
  originX?: number;
  originY?: number;
}

const COLORS = [
  "#4fbeb0", // teal
  "#e7b238", // gold
  "#ece7da", // parchment
  "#7fa9c7", // signal
  "#ab8bd6", // claim
  "#dd6a44", // rust
];

function randomBetween(a: number, b: number) {
  return a + Math.random() * (b - a);
}

export default function LightningZap({ trigger, originX, originY }: LightningZapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number | null>(null);
  const [visible, setVisible] = useState(false);
  const nextIdRef = useRef(0);

  // Bolt flash state
  const [showBolt, setShowBolt] = useState(false);
  const [boltOrigin, setBoltOrigin] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (trigger === 0) return;

    const ox = originX ?? window.innerWidth - 80;
    const oy = originY ?? 40;
    setBoltOrigin({ x: ox, y: oy });

    // Show the bolt flash
    setShowBolt(true);
    const boltTimer = setTimeout(() => setShowBolt(false), 380);

    // Spawn particles
    setVisible(true);
    const count = 60;
    const newParticles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      const angle = randomBetween(0, Math.PI * 2);
      const speed = randomBetween(2, 9);
      newParticles.push({
        id: nextIdRef.current++,
        x: ox,
        y: oy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - randomBetween(1, 4), // slight upward bias
        life: 1,
        maxLife: randomBetween(0.6, 1.2),
        size: randomBetween(2, 6),
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      });
    }
    particlesRef.current = [...particlesRef.current, ...newParticles];

    let lastTime = performance.now();

    const animate = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particlesRef.current = particlesRef.current.filter((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.18; // gravity
        p.vx *= 0.97; // drag
        p.life -= dt / p.maxLife;
        return p.life > 0;
      });

      for (const p of particlesRef.current) {
        const alpha = Math.max(0, p.life);
        ctx.globalAlpha = alpha;
        ctx.shadowBlur = 8;
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      if (particlesRef.current.length > 0) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setVisible(false);
        rafRef.current = null;
      }
    };

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      clearTimeout(boltTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  // Resize canvas to viewport
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  return (
    <>
      {/* Particle canvas */}
      <canvas
        ref={canvasRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          pointerEvents: "none",
          zIndex: 9999,
          opacity: visible ? 1 : 0,
          transition: "opacity 0.3s",
        }}
      />

      {/* Lightning bolt flash */}
      {showBolt && (
        <div
          style={{
            position: "fixed",
            left: boltOrigin.x - 20,
            top: boltOrigin.y - 20,
            width: 40,
            height: 40,
            pointerEvents: "none",
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: "zap-bolt 0.38s ease-out forwards",
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width="40"
            height="40"
            fill="none"
            style={{ filter: "drop-shadow(0 0 12px #4fbeb0) drop-shadow(0 0 6px #e7b238)" }}
          >
            <path
              d="M13 2L4.5 13.5H11L10 22L20.5 10H14L13 2Z"
              fill="#e7b238"
              stroke="#4fbeb0"
              strokeWidth="1"
            />
          </svg>
        </div>
      )}

      {/* Global ripple ring */}
      {showBolt && (
        <div
          style={{
            position: "fixed",
            left: boltOrigin.x - 40,
            top: boltOrigin.y - 40,
            width: 80,
            height: 80,
            borderRadius: "50%",
            border: "2px solid #4fbeb0",
            pointerEvents: "none",
            zIndex: 9998,
            animation: "zap-ring 0.38s ease-out forwards",
          }}
        />
      )}
    </>
  );
}
