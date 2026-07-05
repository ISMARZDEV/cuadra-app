// Script inline en <head>: aplica el tema ANTES del primer paint (evita el flash). Tema CLARO por
// defecto; solo agrega .dark si el usuario lo eligió explícitamente (localStorage 'theme'='dark').
export function ThemeScript() {
  const code = `(function(){try{if(localStorage.getItem('theme')==='dark'){document.documentElement.classList.add('dark')}}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
