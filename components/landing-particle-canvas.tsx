"use client";

import { useEffect, useRef } from "react";

/**
 * Decorative, mouse-reactive particle field for the landing page hero.
 * Purely visual — no data, no claims. Respects prefers-reduced-motion by
 * rendering a single static frame instead of animating.
 */
export function LandingParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    let width = 0;
    let height = 0;
    let rafId = 0;
    // Runs an O(n^2) pairwise distance check (connect(), below) every frame
    // forever by default — real, measurable CPU/battery cost on a page
    // that's purely decorative. Paused (not just left running off-screen)
    // whenever the tab is hidden or the hero section has scrolled out of
    // view, resumed when either becomes true again.
    let running = false;
    let visible = true;
    let tabVisible = document.visibilityState === "visible";

    type Particle = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      color: string;
      alpha: number;
    };

    let particles: Particle[] = [];
    const mouse = { x: null as number | null, y: null as number | null, radius: 150 };

    function initParticles() {
      particles = [];
      const count = Math.floor(Math.min(width, 1400) / 16);
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.6,
          vy: (Math.random() - 0.5) * 0.6,
          radius: Math.random() * 1.8 + 0.8,
          color: Math.random() > 0.3 ? "16, 185, 129" : "56, 189, 248",
          alpha: Math.random() * 0.5 + 0.2,
        });
      }
    }

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      width = canvas!.clientWidth;
      height = canvas!.clientHeight;
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      initParticles();
    }

    function connect() {
      for (let a = 0; a < particles.length; a++) {
        for (let b = a + 1; b < particles.length; b++) {
          const dx = particles[a].x - particles[b].x;
          const dy = particles[a].y - particles[b].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 110) {
            const opacity = (1 - dist / 110) * 0.2;
            ctx!.strokeStyle = `rgba(56, 189, 248, ${opacity})`;
            ctx!.lineWidth = 0.7;
            ctx!.beginPath();
            ctx!.moveTo(particles[a].x, particles[a].y);
            ctx!.lineTo(particles[b].x, particles[b].y);
            ctx!.stroke();
          }
        }
      }
    }

    function frame() {
      ctx!.clearRect(0, 0, width, height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;

        if (mouse.x !== null && mouse.y !== null) {
          const dx = mouse.x - p.x;
          const dy = mouse.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < mouse.radius) {
            const angle = Math.atan2(dy, dx);
            const force = (mouse.radius - dist) / mouse.radius;
            p.x -= Math.cos(angle) * force * 2.4;
            p.y -= Math.sin(angle) * force * 2.4;
          }
        }

        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(${p.color}, ${p.alpha})`;
        ctx!.fill();
      }
      connect();
      if (!reducedMotion && running) {
        rafId = requestAnimationFrame(frame);
      }
    }

    // Starts/stops the rAF loop based on the two independent gates above —
    // called whenever either one changes, instead of each gate managing the
    // loop directly, so hidden+off-screen (the common case once the user
    // has scrolled past the hero and backgrounded the tab) doesn't double-
    // schedule or leak a frame.
    function syncRunning() {
      const shouldRun = tabVisible && visible && !reducedMotion;
      if (shouldRun && !running) {
        running = true;
        frame();
      } else if (!shouldRun && running) {
        running = false;
        cancelAnimationFrame(rafId);
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas!.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };
    const handleMouseLeave = () => {
      mouse.x = null;
      mouse.y = null;
    };
    const handleVisibilityChange = () => {
      tabVisible = document.visibilityState === "visible";
      syncRunning();
    };

    resize();

    // IntersectionObserver — the hero section (this canvas's parent) is
    // near the top of a long marketing page; once the user scrolls past it
    // there's no visual reason to keep animating, so stop burning CPU.
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        syncRunning();
      },
      { threshold: 0 }
    );
    observer.observe(canvas);

    if (reducedMotion) {
      // Single static frame, as documented on the component — never starts
      // the loop at all.
      frame();
    } else {
      syncRunning();
    }

    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    if (!reducedMotion) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseleave", handleMouseLeave);
    }

    return () => {
      running = false;
      cancelAnimationFrame(rafId);
      observer.disconnect();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full opacity-70"
    />
  );
}
