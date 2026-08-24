const scenes = [...document.querySelectorAll('.scene:not([hidden])')];
const navItems = [...document.querySelectorAll('.side-nav a')];
const current = document.querySelector('.chapter-current');
const progress = document.querySelector('.progress');

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('in-view');
    const index = scenes.indexOf(entry.target);
    navItems.forEach((item, i) => item.classList.toggle('active', i === index));
    current.textContent = entry.target.dataset.chapter;
  });
}, { threshold: .45 });
scenes.forEach(scene => observer.observe(scene));

addEventListener('scroll', () => {
  const total = document.documentElement.scrollHeight - innerHeight;
  progress.style.width = `${total > 0 ? (scrollY / total) * 100 : 0}%`;
}, { passive: true });

document.querySelector('.fullscreen').addEventListener('click', () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
});

addEventListener('keydown', event => {
  if (event.key.toLowerCase() === 'f') document.querySelector('.fullscreen').click();
  if (document.querySelector('.lightbox').classList.contains('open')) return;
  if (!['PageDown','PageUp','ArrowDown','ArrowUp',' '].includes(event.key)) return;
  event.preventDefault();
  const active = Math.max(0, navItems.findIndex(item => item.classList.contains('active')));
  const backwards = event.key === 'PageUp' || event.key === 'ArrowUp';
  scenes[Math.max(0, Math.min(scenes.length - 1, active + (backwards ? -1 : 1)))].scrollIntoView({behavior:'smooth'});
});

const mainVideo = document.querySelector('#main-video');
const mainVideoCaption = document.querySelector('#main-video-caption');
const videoTiles = [...document.querySelectorAll('.video-tile[data-video-src]')];
videoTiles.forEach(tile => tile.addEventListener('click', () => {
  const source = tile.dataset.videoSrc;
  if (mainVideo.getAttribute('src') !== source) {
    mainVideo.pause();
    mainVideo.setAttribute('src', source);
    mainVideo.load();
  }
  mainVideoCaption.textContent = tile.dataset.videoCaption;
  videoTiles.forEach(item => item.classList.toggle('active', item === tile));
  mainVideo.scrollIntoView({ behavior: 'smooth', block: 'center' });
  mainVideo.play().catch(() => {});
}));
mainVideo.addEventListener('play', () => videoTiles.forEach(tile => tile.querySelector('video')?.pause()));

const carousel = document.querySelector('.lead-carousel');
document.querySelector('[data-direction="prev"]')?.addEventListener('click', () => carousel.scrollBy({left: -carousel.clientWidth * .72, behavior:'smooth'}));
document.querySelector('[data-direction="next"]')?.addEventListener('click', () => carousel.scrollBy({left: carousel.clientWidth * .72, behavior:'smooth'}));

const lightbox = document.querySelector('.lightbox');
const lightboxImage = lightbox.querySelector('img');
const lightboxCaption = lightbox.querySelector('.lightbox-caption');
const allLightboxItems = [...document.querySelectorAll('[data-lightbox]')];
let lightboxItems = allLightboxItems;
let lightboxIndex = 0;

const showLightboxItem = index => {
  lightboxIndex = (index + lightboxItems.length) % lightboxItems.length;
  const item = lightboxItems[lightboxIndex];
  const image = item.querySelector('img');
  lightboxImage.src = image.src;
  lightboxImage.alt = image.alt;
  lightboxCaption.textContent = `${item.dataset.caption || image.alt} · ${lightboxIndex + 1} de ${lightboxItems.length}`;
};

allLightboxItems.forEach(item => item.addEventListener('click', () => {
  const isLead = item.classList.contains('lead-shot');
  lightboxItems = allLightboxItems.filter(candidate => candidate.classList.contains('lead-shot') === isLead);
  showLightboxItem(lightboxItems.indexOf(item));
  lightbox.classList.add('open');
}));
lightbox.querySelector('.lightbox-prev').addEventListener('click', () => showLightboxItem(lightboxIndex - 1));
lightbox.querySelector('.lightbox-next').addEventListener('click', () => showLightboxItem(lightboxIndex + 1));
const closeLightbox = () => lightbox.classList.remove('open');
lightbox.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
lightbox.addEventListener('click', event => { if (event.target === lightbox) closeLightbox(); });
let touchStartX = 0;
lightbox.addEventListener('touchstart', event => { touchStartX = event.changedTouches[0].clientX; }, { passive: true });
lightbox.addEventListener('touchend', event => {
  const distance = event.changedTouches[0].clientX - touchStartX;
  if (Math.abs(distance) > 50) showLightboxItem(lightboxIndex + (distance < 0 ? 1 : -1));
}, { passive: true });
addEventListener('keydown', event => {
  if (event.key === 'Escape') closeLightbox();
  if (!lightbox.classList.contains('open')) return;
  if (event.key === 'ArrowLeft') { event.preventDefault(); showLightboxItem(lightboxIndex - 1); }
  if (event.key === 'ArrowRight') { event.preventDefault(); showLightboxItem(lightboxIndex + 1); }
});