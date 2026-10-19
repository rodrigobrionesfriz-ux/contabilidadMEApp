// Sin 'use client': lo usa el layout raíz (servidor) dentro de <head>.
/** Se ejecuta en <head> antes de pintar: aplica el tema guardado en la cookie y evita el parpadeo. */
export const SCRIPT_TEMA = `(function(){try{var m=document.cookie.match(/(?:^|; )tema=(claro|oscuro)/);if(m&&m[1]==='claro')document.documentElement.dataset.theme='claro';}catch(e){}})();`;
