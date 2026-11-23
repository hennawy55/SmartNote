try{if(localStorage.getItem('aqarTheme')==='dark')document.documentElement.dataset.theme='dark'}catch(e){}
document.addEventListener('DOMContentLoaded',()=>{
  const toggle=document.getElementById('themeToggle');
  function setTheme(theme){
    const dark=theme==='dark';
    document.documentElement.dataset.theme=dark?'dark':'light';
    toggle.innerHTML=`<i data-lucide="${dark?'sun':'moon'}"></i>`;
    const english=document.documentElement.lang==='en';
    toggle.setAttribute('aria-label',english?(dark?'Switch to light mode':'Switch to dark mode'):(dark?'تفعيل الوضع الفاتح':'تفعيل الوضع الداكن'));
    toggle.title=toggle.getAttribute('aria-label');
    document.querySelector('meta[name="theme-color"]').content=dark?'#19161a':'#762236';
    try{localStorage.setItem('aqarTheme',dark?'dark':'light')}catch(e){}
    if(window.lucide)window.lucide.createIcons({attrs:{'stroke-width':1.8}});
  }
  toggle.onclick=()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');
  setTheme(document.documentElement.dataset.theme==='dark'?'dark':'light');
  window.addEventListener('app-language-change',()=>setTheme(document.documentElement.dataset.theme==='dark'?'dark':'light'));
});
