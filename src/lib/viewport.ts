// Safari's visible viewport changes when its keyboard or browser bars open.
// Keep fixed panels inside that viewport, without restricting user zoom.
export function trackViewport(){
 const viewport=window.visualViewport;
 const update=()=>{
  if(viewport&&viewport.scale!==1)return;
  document.documentElement.style.setProperty('--app-height',`${Math.round(viewport?.height??window.innerHeight)}px`);
  document.documentElement.style.setProperty('--app-top',`${Math.round(viewport?.offsetTop??0)}px`);
 };
 update();window.addEventListener('resize',update);viewport?.addEventListener('resize',update);viewport?.addEventListener('scroll',update);
 return ()=>{window.removeEventListener('resize',update);viewport?.removeEventListener('resize',update);viewport?.removeEventListener('scroll',update);};
}
