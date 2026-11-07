# Mi Playwright

Ejecuta tareas de navegador en GitHub Actions y descarga texto, enlaces y capturas. Puedes lanzar una ejecución desde el navegador del iPhone. La tarea inicial abre `https://example.com`.

## Instalar en GitHub

1. Crea un repositorio **público** llamado `mi-playwright`, con un README y rama `main`.
2. Añade los archivos de este proyecto conservando las carpetas. Incluye `package-lock.json`, `test/ejecutar.test.js` y `.github/workflows/playwright.yml`. No subas `node_modules` ni `resultados`.
3. Si recibiste un ZIP, extráelo primero: subir solamente el ZIP a GitHub no instala el proyecto.
4. Desde iPhone puedes usar **Add file → Create new file**. Escribe las rutas completas de las carpetas, por ejemplo `.github/workflows/playwright.yml`. Crea el workflow al final, cuando los demás archivos estén guardados.
5. Entra en **Actions → Ejecutar Playwright → Run workflow**. Deja la dirección opcional vacía para usar `tarea.json` o escribe una URL HTTP/HTTPS para sustituir su primera acción `abrir`. Pulsa **Run workflow**.

## Ver el resultado

Abre la ejecución terminada y descarga **Artifacts → resultados-N**. Contiene `salida.txt`, `resumen.json` y las capturas PNG. También puedes leer la salida en **correr → Ejecutar tarea**. Los archivos descargables se conservan 3 días. El tiempo de ejecución depende de la cola, la instalación y la página visitada.

Si una acción falla, el trabajo se marca en rojo, se detienen los pasos siguientes y se guarda el diagnóstico. Se intenta capturar la pantalla del error. Si falla la instalación antes de arrancar el script, revisa el paso rojo: todavía no habrá resultados de navegación.

## Cambiar la tarea

Edita `tarea.json` y guarda con **Commit changes** en `main`. La ejecución comienza automáticamente. Los selectores identifican elementos concretos de cada página; por ejemplo `#nombre` o `button[type="submit"]`.

| Acción | Ejemplo de paso |
| --- | --- |
| Abrir una página | `{ "accion": "abrir", "url": "https://example.com" }` |
| Hacer clic | `{ "accion": "clic", "selector": "button[type=submit]" }` |
| Escribir en un campo | `{ "accion": "escribir", "selector": "#nombre", "valor": "Prueba" }` |
| Esperar un elemento visible | `{ "accion": "esperar", "selector": "#resultado" }` |
| Esperar un tiempo | `{ "accion": "esperar", "ms": 1000 }` |
| Leer texto | `{ "accion": "texto", "selector": "h1" }` |
| Guardar captura | `{ "accion": "captura", "nombre": "pagina" }` |
| Extraer enlaces | `{ "accion": "enlaces" }` |

Para `texto`, omitir `selector` lee el cuerpo de la página. Las capturas llevan el número del paso para evitar sobrescribirlas. Usa nombres sin extensión, con letras, números, guiones o guiones bajos. `enlaces` devuelve enlaces HTTP/HTTPS únicos. Si la página carga datos después de abrirse o de un clic, añade una espera por el elemento esperado antes de leerlo o capturarlo.

## Ejemplo de formulario de pruebas

Sustituye la URL y los selectores por los de tu formulario de pruebas. El clic en Enviar realmente envía el formulario.

```json
{
  "pasos": [
    { "accion": "abrir", "url": "https://TU-SITIO/contacto" },
    { "accion": "escribir", "selector": "#nombre", "valor": "Prueba" },
    { "accion": "clic", "selector": "button[type=submit]" },
    { "accion": "esperar", "selector": "#confirmacion" },
    { "accion": "texto", "selector": "#confirmacion" },
    { "accion": "captura", "nombre": "resultado" }
  ]
}
```

## Coste y privacidad

Los runners estándar de GitHub Actions son gratuitos en repositorios públicos; siguen aplicándose límites y condiciones de uso. En repositorios privados hay una cuota. Esta configuración usa un runner estándar y no solicita servicios de pago.

Los archivos, registros y resultados de un repositorio público pueden ser accesibles a otras personas. No escribas contraseñas, datos personales ni enlaces privados en la tarea o en el campo de URL. Los Secrets no vuelven privadas las capturas ni el texto extraído. Esta versión está preparada para pruebas con datos públicos, sin credenciales.

GitHub exige que el uso de sus runners esté relacionado con el desarrollo, pruebas, despliegue o publicación del proyecto del repositorio. El navegador se inicia limpio en cada ejecución. Los inicios de sesión no se conservan, y una página puede exigir intervención humana o bloquear la automatización.

## Ejecutar y comprobar localmente

Requiere Node.js 24 o posterior.

```sh
npm ci
npx playwright install --with-deps chromium
npm test
npm start
```

El ejecutor admite hasta 50 pasos, 60 segundos por espera fija y 4 minutos de navegación por tarea. GitHub corta el trabajo completo a los 10 minutos. `npm test` prueba un formulario local sin enviar datos a un sitio externo. Las dependencias están fijadas mediante `package-lock.json`.

Para un equipo que ya tenga Chromium, se puede definir `CHROMIUM_EXECUTABLE_PATH` con su ruta. En GitHub se usa el navegador instalado por Playwright.

Documentación: [Playwright en CI](https://playwright.dev/docs/ci), [facturación de Actions](https://docs.github.com/en/actions/concepts/billing-and-usage), [límites de Actions](https://docs.github.com/en/actions/reference/limits), [condiciones adicionales de GitHub](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features).
