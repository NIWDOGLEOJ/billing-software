import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../../contexts/theme-context';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseColor: string; // HSL color string, e.g., "239, 84%"
}

export function InteractiveMeshBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { darkMode } = useTheme();
  
  // Track if we are on the login page to preserve its original neon colors untouched!
  const isLoginPage = typeof window !== 'undefined' && window.location.pathname === '/login';

  // Track mouse coordinates for interactive parallax animations
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const mouseRef = useRef({ x: -1000, y: -1000, active: false });

  // Handle global mouse movement for parallax blobs
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) - 0.5;
      const y = (e.clientY / window.innerHeight) - 0.5;
      setMousePosition({ x, y });

      // Update cursor position relative to the canvas bounding rect
      if (canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        mouseRef.current = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          active: true
        };
      }
    };

    const handleMouseLeave = () => {
      mouseRef.current.active = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  // Set up HTML5 Physics Canvas Constellation with battery saver rules
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animationFrameId: number;
    let isLoopRunning = true;
    let particles: Particle[] = [];
    
    // Scale canvas to match actual screen boundaries
    const resizeCanvas = () => {
      const rect = containerRef.current?.getBoundingClientRect() || { width: window.innerWidth, height: window.innerHeight };
      canvas.width = rect.width;
      canvas.height = rect.height;
      
      // Initialize particles based on screen density (around 1 particle per 25000 pixels)
      const area = canvas.width * canvas.height;
      const particleCount = Math.min(Math.max(Math.floor(area / 25000), 45), 90);
      
      // Indigo, Pink, Violet, Cyan for login; Slate blue, Soft ocean teal, Cosmic indigo, Muted lavender/grey for billing/layout
      const darkHues = isLoginPage 
        ? ['239, 84%', '330, 81%', '271, 91%', '188, 86%']
        : ['215, 30%', '174, 35%', '226, 40%', '262, 25%'];
      
      // Soft Blue, Soft Indigo, Soft Rose
      const lightHues = ['221, 83%', '239, 84%', '346, 84%'];
      const currentHues = darkMode ? darkHues : lightHues;

      particles = [];
      for (let i = 0; i < particleCount; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5,
          radius: Math.random() * 1.8 + 1,
          baseColor: currentHues[Math.floor(Math.random() * currentHues.length)]
        });
      }
    };

    resizeCanvas();

    // Attach robust ResizeObserver to container
    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Animation Loop
    const draw = () => {
      if (!isLoopRunning) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Distance limits for connection lines
      const maxDistance = 120;
      const mouseMaxDistance = 180;
      const mouse = mouseRef.current;

      // 1. Physics Calculations and Particle Updates
      particles.forEach((p) => {
        // Hover reaction - gravitational pull
        if (mouse.active) {
          const dx = mouse.x - p.x;
          const dy = mouse.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < mouseMaxDistance) {
            // Apply a very gentle pull force relative to distance (stronger when closer)
            const force = (mouseMaxDistance - dist) / mouseMaxDistance;
            p.vx += (dx / dist) * force * 0.015;
            p.vy += (dy / dist) * force * 0.015;
            
            // Speed limits to prevent runaway velocities
            const maxSpeed = 0.8;
            const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
            if (speed > maxSpeed) {
              p.vx = (p.vx / speed) * maxSpeed;
              p.vy = (p.vy / speed) * maxSpeed;
            }
          }
        }

        // Apply velocities
        p.x += p.vx;
        p.y += p.vy;

        // Friction to slowly dampen acceleration over time
        p.vx *= 0.99;
        p.vy *= 0.99;

        // Edge containment (bounce off walls gently with reversed vectors)
        if (p.x < 0) {
          p.x = 0;
          p.vx *= -1;
        } else if (p.x > canvas.width) {
          p.x = canvas.width;
          p.vx *= -1;
        }

        if (p.y < 0) {
          p.y = 0;
          p.vy *= -1;
        } else if (p.y > canvas.height) {
          p.y = canvas.height;
          p.vy *= -1;
        }

        // Draw soft outer glow and sharp inner dot
        const opacity = darkMode ? (isLoginPage ? '0.22' : '0.12') : '0.28';
        ctx.fillStyle = `hsla(${p.baseColor}, ${isLoginPage ? '50%' : '40%'}, ${opacity})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * 2.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `hsla(${p.baseColor}, ${isLoginPage ? '55%' : '45%'}, ${darkMode ? (isLoginPage ? '0.5' : '0.35') : '0.6'})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      // 2. Draw Constellation Connectors
      ctx.lineWidth = 0.65;
      for (let i = 0; i < particles.length; i++) {
        const p1 = particles[i];

        // Links between particles
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < maxDistance) {
            // Fade connector line alpha relative to distance
            const alpha = ((maxDistance - dist) / maxDistance) * (darkMode ? (isLoginPage ? 0.07 : 0.045) : 0.05);
            ctx.strokeStyle = darkMode 
              ? (isLoginPage ? `hsla(239, 84%, 60%, ${alpha})` : `hsla(226, 35%, 35%, ${alpha})`)
              : `hsla(221, 83%, 50%, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }

        // Active links to mouse cursor
        if (mouse.active) {
          const dx = mouse.x - p1.x;
          const dy = mouse.y - p1.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < mouseMaxDistance) {
            // Stronger visual connection lines tracking the cursor
            const alpha = ((mouseMaxDistance - dist) / mouseMaxDistance) * (darkMode ? (isLoginPage ? 0.14 : 0.12) : 0.1);
            
            // Beautiful color gradient from cursor to node
            const grad = ctx.createLinearGradient(mouse.x, mouse.y, p1.x, p1.y);
            if (darkMode) {
              if (isLoginPage) {
                grad.addColorStop(0, `hsla(330, 81%, 60%, ${alpha * 1.2})`);
                grad.addColorStop(1, `hsla(${p1.baseColor}, 60%, ${alpha})`);
              } else {
                grad.addColorStop(0, `hsla(174, 40%, 45%, ${alpha * 1.1})`);
                grad.addColorStop(1, `hsla(${p1.baseColor}, 40%, ${alpha})`);
              }
            } else {
              grad.addColorStop(0, `hsla(221, 83%, 55%, ${alpha * 1.2})`);
              grad.addColorStop(1, `hsla(${p1.baseColor}, 50%, ${alpha})`);
            }
            
            ctx.strokeStyle = grad;
            ctx.lineWidth = 0.85;
            ctx.beginPath();
            ctx.moveTo(mouse.x, mouse.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.stroke();
            ctx.lineWidth = 0.65; // restore
          }
        }
      }

      animationFrameId = requestAnimationFrame(draw);
    };

    // Battery-Saver triggers to prevent CPU usage in background tabs or minimized screens
    const handleVisibilityChange = () => {
      if (document.hidden) {
        isLoopRunning = false;
        cancelAnimationFrame(animationFrameId);
      } else {
        if (!isLoopRunning) {
          isLoopRunning = true;
          draw();
        }
      }
    };

    const handleFocus = () => {
      if (!isLoopRunning) {
        isLoopRunning = true;
        draw();
      }
    };

    const handleBlur = () => {
      // Pause drawing when focus leaves the window entirely
      isLoopRunning = false;
      cancelAnimationFrame(animationFrameId);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    // Initial loop execution
    draw();

    // Clean up connections
    return () => {
      isLoopRunning = false;
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, [darkMode, isLoginPage]);

  return (
    <div 
      ref={containerRef} 
      className="absolute inset-0 w-full h-full overflow-hidden select-none pointer-events-none z-0"
    >
      {/* 🔮 Interactive Animated Blobs */}
      <div 
        className={`absolute top-[-15%] left-[-15%] w-[60%] h-[60%] rounded-full transition-transform duration-[1200ms] cubic-bezier(0.16, 1, 0.3, 1) will-change-transform ${
          darkMode 
            ? isLoginPage 
              ? 'bg-indigo-500/15 blur-[130px]' 
              : 'bg-slate-800/5 blur-[140px]' 
            : 'bg-indigo-500/10 blur-[130px]'
        }`}
        style={{
          transform: `translate(${mousePosition.x * 140}px, ${mousePosition.y * 140}px) scale(1.05)`
        }}
      />
      <div 
        className={`absolute bottom-[-15%] right-[-15%] w-[60%] h-[60%] rounded-full transition-transform duration-[1200ms] cubic-bezier(0.16, 1, 0.3, 1) will-change-transform ${
          darkMode 
            ? isLoginPage 
              ? 'bg-pink-500/12 blur-[130px]' 
              : 'bg-teal-900/5 blur-[140px]' 
            : 'bg-pink-500/10 blur-[130px]'
        }`}
        style={{
          transform: `translate(${mousePosition.x * -110}px, ${mousePosition.y * -110}px) scale(1.05)`
        }}
      />
      <div 
        className={`absolute top-[25%] left-[35%] w-[450px] h-[450px] rounded-full transition-transform duration-[1500ms] cubic-bezier(0.16, 1, 0.3, 1) animate-pulse will-change-transform ${
          darkMode 
            ? isLoginPage 
              ? 'bg-violet-600/8 blur-[100px]' 
              : 'bg-indigo-950/6 blur-[120px]' 
            : 'bg-violet-600/5 blur-[100px]'
        }`}
        style={{
          transform: `translate(${mousePosition.x * 70}px, ${mousePosition.y * 70}px)`
        }}
      />

      {/* 🕸️ Mesh/Grid Texture overlay reacting with mouse in elegant 3D parallax */}
      <div 
        className={`absolute inset-0 transition-transform duration-[800ms] cubic-bezier(0.16, 1, 0.3, 1) will-change-transform ${
          darkMode 
            ? isLoginPage 
              ? 'opacity-[0.09]' 
              : 'opacity-[0.06]' 
            : 'opacity-[0.05]'
        }`}
        style={{
          backgroundImage: `
            radial-gradient(${darkMode ? (isLoginPage ? '#818cf8' : '#475569') : '#3b82f6'} 0.75px, transparent 0.75px),
            linear-gradient(to right, ${darkMode ? (isLoginPage ? '#3730a3' : '#1e293b') : '#93c5fd'} 0.5px, transparent 0.5px),
            linear-gradient(to bottom, ${darkMode ? (isLoginPage ? '#3730a3' : '#1e293b') : '#93c5fd'} 0.5px, transparent 0.5px)
          `,
          backgroundSize: '48px 48px, 48px 48px, 48px 48px',
          transform: `scale(1.06) translate(${mousePosition.x * 20}px, ${mousePosition.y * 20}px) rotate(${mousePosition.x * 1.2}deg)`
        }}
      />

      {/* ⚡ High performance HTML5 physics canvas */}
      <canvas 
        ref={canvasRef} 
        className="absolute inset-0 w-full h-full block opacity-80 dark:opacity-90 transition-opacity duration-1000"
      />
    </div>
  );
}
