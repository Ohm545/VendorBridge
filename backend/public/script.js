/* ─────────────────────────────────────────────────────────
   VendorBridge — script.js
   Handles: Lucide icons, navbar, mobile menu, IntersectionObserver
   scroll reveals, step animations, counter animations,
   progress bars, analytics charts (canvas), FAQ accordion
───────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {

  // ── 0. Init Lucide icons ─────────────────────────────────
  lucide.createIcons();

  // ── 1. Navbar scroll state ───────────────────────────────
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });

  // ── 2. Mobile menu toggle ────────────────────────────────
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobileMenu');
  hamburger.addEventListener('click', () => {
    mobileMenu.classList.toggle('open');
  });
  document.querySelectorAll('.mob-link, .mob-cta').forEach(link => {
    link.addEventListener('click', () => mobileMenu.classList.remove('open'));
  });

  // ── 3. Smooth nav links ──────────────────────────────────
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', e => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        e.preventDefault();
        const offset = 72;
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });

  // ── 4. Generic fade-up reveal ────────────────────────────
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  const revealElements = Array.from(document.querySelectorAll('.reveal-up, .reveal-right'));
  revealElements.forEach(el => revealObserver.observe(el));

  const revealVisibleElements = () => {
    revealElements.forEach(el => {
      if (!el.classList.contains('in-view')) {
        const rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight - 40 && rect.bottom > 0) {
          el.classList.add('in-view');
          revealObserver.unobserve(el);
        }
      }
    });
  };
  revealVisibleElements();
  window.addEventListener('resize', revealVisibleElements, { passive: true });
  window.addEventListener('scroll', revealVisibleElements, { passive: true });

  // ── 5. Steps: staggered reveal ───────────────────────────
  const stepsObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const steps = entry.target.querySelectorAll('.step-item');
        steps.forEach((step, i) => {
          setTimeout(() => {
            step.classList.add('in-view');
          }, i * 120);
        });
        stepsObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  const stepsTrack = document.querySelector('.steps-track');
  if (stepsTrack) stepsObserver.observe(stepsTrack);

  // ── 6. Feature rows: staggered left/right ───────────────
  const featureObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        featureObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });

  document.querySelectorAll('.reveal-feature').forEach(el => {
    featureObserver.observe(el);
  });

  const lazyImages = Array.from(document.querySelectorAll('img.lazyload'));
  const lazyImageObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        const src = img.dataset.src;
        if (src) {
          img.src = src;
          img.addEventListener('load', () => img.classList.add('loaded'));
          img.removeAttribute('data-src');
        }
        lazyImageObserver.unobserve(img);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px 120px 0px' });
  lazyImages.forEach(img => lazyImageObserver.observe(img));

  // ── 7. Progress bars (challenges section) ───────────────
  const progressObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.querySelectorAll('.progress-fill').forEach(fill => {
          const target = parseInt(fill.dataset.width);
          fill.style.width = target + '%';
        });
        entry.target.querySelectorAll('.prog-value').forEach(val => {
          const target = parseInt(val.dataset.target);
          animateValue(val, 0, target, 1400, v => v + '%');
        });
        progressObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });

  const progressSection = document.querySelector('.progress-section');
  if (progressSection) progressObserver.observe(progressSection);

  // ── 8. Counter animations (impact section) ───────────────
  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.querySelectorAll('.impact-num').forEach(el => {
          const target = parseInt(el.dataset.target);
          animateValue(el, 0, target, 1800);
        });
        counterObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });

  const impactGrid = document.querySelector('.impact-grid');
  if (impactGrid) counterObserver.observe(impactGrid);

  // Helper: animate numeric value
  function animateValue(el, start, end, duration, formatter = v => v) {
    const startTime = performance.now();
    const update = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease out expo
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const current = Math.round(start + (end - start) * eased);
      el.textContent = formatter(current);
      if (progress < 1) requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  }

  // ── 9. Analytics bar/chart reveals ──────────────────────
  const analyticsObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        // Vendor performance bars
        entry.target.querySelectorAll('.vp-bar').forEach((bar, i) => {
          const w = bar.dataset.w;
          setTimeout(() => { bar.style.width = w + '%'; }, i * 120);
        });
        // Turnaround bars - they already have inline widths, animate
        entry.target.querySelectorAll('.ta-bar').forEach((bar, i) => {
          const w = bar.style.width;
          bar.style.width = '0%';
          setTimeout(() => { bar.style.width = w; }, i * 150);
        });
        analyticsObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.2 });

  const analyticsGrid = document.querySelector('.analytics-grid');
  if (analyticsGrid) analyticsObserver.observe(analyticsGrid);

  // ── 10. AI section bar fills ─────────────────────────────
  const aiObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.querySelectorAll('.av-bar-fill').forEach((bar, i) => {
          const w = bar.style.width;
          bar.style.width = '0%';
          setTimeout(() => { bar.style.width = w; }, i * 80 + 200);
        });
        aiObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.2 });

  const aiWrapper = document.querySelector('.ai-wrapper');
  if (aiWrapper) aiObserver.observe(aiWrapper);

  // ── 11. Spend Trend Chart (canvas) ───────────────────────
  const spendCanvas = document.getElementById('spendChart');
  if (spendCanvas) {
    const chartObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        drawSpendChart(spendCanvas);
        chartObserver.unobserve(spendCanvas);
      }
    }, { threshold: 0.3 });
    chartObserver.observe(spendCanvas);
  }

  function drawSpendChart(canvas) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = 200 * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = '200px';
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = 200;
    const padding = { top: 20, right: 20, bottom: 36, left: 44 };
    const chartW = W - padding.left - padding.right;
    const chartH = H - padding.top - padding.bottom;

    const labels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const values = [3.2, 4.1, 3.8, 5.6, 4.9, 6.7, 5.3, 7.2, 6.8, 8.4, 7.9, 9.1];
    const maxVal = 10;
    const points = values.map((v, i) => ({
      x: padding.left + (i / (labels.length - 1)) * chartW,
      y: padding.top + chartH - (v / maxVal) * chartH
    }));

    // Grid lines
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (i / 4) * chartH;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartW, y);
      ctx.stroke();
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px DM Sans, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText((maxVal - (i / 4) * maxVal).toFixed(0) + 'M', padding.left - 6, y + 3);
    }

    // Area fill
    const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
    gradient.addColorStop(0, 'rgba(15,23,42,0.12)');
    gradient.addColorStop(1, 'rgba(15,23,42,0)');

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const cp1x = (points[i - 1].x + points[i].x) / 2;
      ctx.bezierCurveTo(cp1x, points[i - 1].y, cp1x, points[i].y, points[i].x, points[i].y);
    }
    ctx.lineTo(points[points.length - 1].x, padding.top + chartH);
    ctx.lineTo(points[0].x, padding.top + chartH);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Animate line draw
    let progress = 0;
    const duration = 1400;
    const startTime = performance.now();

    function drawFrame(ts) {
      const elapsed = ts - startTime;
      progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);

      // Clear canvas and re-draw grid
      ctx.clearRect(0, 0, W, H);

      // Grid lines
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = padding.top + (i / 4) * chartH;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + chartW, y);
        ctx.stroke();
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px DM Sans, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText((maxVal - (i / 4) * maxVal).toFixed(0) + 'M', padding.left - 6, y + 3);
      }

      // X labels
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px DM Sans, sans-serif';
      ctx.textAlign = 'center';
      labels.forEach((label, i) => {
        const x = padding.left + (i / (labels.length - 1)) * chartW;
        ctx.fillText(label, x, H - 8);
      });

      // Compute visible points up to progress
      const totalLength = points.length - 1;
      const visibleEnd = eased * totalLength;
      const fullPoints = Math.floor(visibleEnd);
      const frac = visibleEnd - fullPoints;

      const visPoints = [...points.slice(0, fullPoints + 1)];
      if (frac > 0 && fullPoints < points.length - 1) {
        const last = points[fullPoints];
        const next = points[fullPoints + 1];
        visPoints.push({
          x: last.x + (next.x - last.x) * frac,
          y: last.y + (next.y - last.y) * frac
        });
      }

      if (visPoints.length < 2) { requestAnimationFrame(drawFrame); return; }

      // Area fill (partial)
      const areaGrad = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
      areaGrad.addColorStop(0, 'rgba(15,23,42,0.1)');
      areaGrad.addColorStop(1, 'rgba(15,23,42,0)');

      ctx.beginPath();
      ctx.moveTo(visPoints[0].x, visPoints[0].y);
      for (let i = 1; i < visPoints.length; i++) {
        const cpx = (visPoints[i - 1].x + visPoints[i].x) / 2;
        ctx.bezierCurveTo(cpx, visPoints[i - 1].y, cpx, visPoints[i].y, visPoints[i].x, visPoints[i].y);
      }
      ctx.lineTo(visPoints[visPoints.length - 1].x, padding.top + chartH);
      ctx.lineTo(visPoints[0].x, padding.top + chartH);
      ctx.closePath();
      ctx.fillStyle = areaGrad;
      ctx.fill();

      // Line
      ctx.beginPath();
      ctx.moveTo(visPoints[0].x, visPoints[0].y);
      for (let i = 1; i < visPoints.length; i++) {
        const cpx = (visPoints[i - 1].x + visPoints[i].x) / 2;
        ctx.bezierCurveTo(cpx, visPoints[i - 1].y, cpx, visPoints[i].y, visPoints[i].x, visPoints[i].y);
      }
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Dots on full points
      for (let i = 0; i <= fullPoints && i < points.length; i++) {
        ctx.beginPath();
        ctx.arc(points[i].x, points[i].y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#0f172a';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(points[i].x, points[i].y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
      }

      if (progress < 1) requestAnimationFrame(drawFrame);
    }
    requestAnimationFrame(drawFrame);
  }

  // ── 12. Donut chart (canvas) ──────────────────────────────
  const donutCanvas = document.getElementById('donutChart');
  if (donutCanvas) {
    const donutObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        drawDonut(donutCanvas);
        donutObserver.unobserve(donutCanvas);
      }
    }, { threshold: 0.3 });
    donutObserver.observe(donutCanvas);
  }

  function drawDonut(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const size = 160;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const cx = size / 2, cy = size / 2, r = 62, inner = 40;
    const slices = [
      { value: 34, color: '#0f172a' },
      { value: 28, color: '#2563eb' },
      { value: 22, color: '#64748b' },
      { value: 16, color: '#cbd5e1' },
    ];
    const total = slices.reduce((s, sl) => s + sl.value, 0);

    let startAngle = -Math.PI / 2;
    const startTime = performance.now();
    const duration = 1200;

    function drawFrame(ts) {
      const elapsed = ts - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);

      ctx.clearRect(0, 0, size, size);
      let angle = startAngle;

      slices.forEach(slice => {
        const sweep = (slice.value / total) * Math.PI * 2 * eased;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, angle, angle + sweep);
        ctx.closePath();
        ctx.fillStyle = slice.color;
        ctx.fill();
        angle += sweep;
      });

      // Donut hole
      ctx.beginPath();
      ctx.arc(cx, cy, inner, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();

      // Center text
      ctx.fillStyle = '#0f172a';
      ctx.font = `bold ${14 * dpr / dpr}px Syne, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Spend', cx, cy - 7);
      ctx.font = `${11 * dpr / dpr}px DM Sans, sans-serif`;
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('Mix', cx, cy + 8);

      if (progress < 1) requestAnimationFrame(drawFrame);
    }
    requestAnimationFrame(drawFrame);
  }

  // ── 13. FAQ accordion ────────────────────────────────────
  document.querySelectorAll('.faq-item').forEach(item => {
    const btn = item.querySelector('.faq-q');
    btn.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      // Close all
      document.querySelectorAll('.faq-item.open').forEach(el => el.classList.remove('open'));
      // Open clicked if it was closed
      if (!isOpen) item.classList.add('open');
    });
  });

  // ── 14. Step hover active state ──────────────────────────
  document.querySelectorAll('.step-item').forEach(step => {
    step.addEventListener('mouseenter', () => {
      document.querySelectorAll('.step-item').forEach(s => s.classList.remove('active'));
      step.classList.add('active');
    });
    step.addEventListener('mouseleave', () => {
      step.classList.remove('active');
    });
  });

  // ── 15. Re-run icon init after dynamic renders ───────────
  setTimeout(() => lucide.createIcons(), 100);

});