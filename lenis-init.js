// Lenis smooth scroll — desktop only
if (window.innerWidth > 768 && typeof Lenis !== 'undefined') {
  const lenis = new Lenis({
    duration: 0.2,
    easing: t => 1 - Math.pow(1 - t, 3),  // ease-out cubic, 되튐 없음
    smoothWheel: true,
    smoothTouch: false,
  });

  function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);

  window.lenis = lenis;
}
