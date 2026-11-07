'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const ACCIONES = new Set(['abrir', 'clic', 'escribir', 'esperar', 'texto', 'captura', 'enlaces']);
const MAX_PASOS = 50;
const MAX_DURACION_MS = 240000;

function cadena(valor, campo, vacia = false) {
  if (typeof valor !== 'string' || (!vacia && !valor.trim())) {
    throw new Error(`${campo} debe ser un texto${vacia ? '' : ' no vacío'}.`);
  }
}

function validarUrl(valor) {
  cadena(valor, 'url');
  const url = new URL(valor);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Usa una dirección http:// o https:// sin credenciales.');
  }
}

function validarTarea(tarea) {
  if (!tarea || !Array.isArray(tarea.pasos) || tarea.pasos.length < 1 || tarea.pasos.length > MAX_PASOS) {
    throw new Error(`tarea.json debe contener entre 1 y ${MAX_PASOS} pasos.`);
  }
  for (const [indice, paso] of tarea.pasos.entries()) {
    if (!paso || !ACCIONES.has(paso.accion)) {
      throw new Error(`Acción desconocida en el paso ${indice + 1}.`);
    }
    if (paso.accion === 'abrir') validarUrl(paso.url);
    if (['clic', 'escribir'].includes(paso.accion)) cadena(paso.selector, 'selector');
    if (paso.accion === 'escribir') cadena(paso.valor, 'valor', true);
    if (paso.selector !== undefined) cadena(paso.selector, 'selector');
    if (paso.accion === 'esperar' && paso.selector === undefined) {
      const ms = paso.ms ?? 1000;
      if (!Number.isInteger(ms) || ms < 0 || ms > 60000) {
        throw new Error('La espera debe estar entre 0 y 60000 ms.');
      }
    }
    if (paso.accion === 'captura' && paso.nombre !== undefined) {
      if (typeof paso.nombre !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(paso.nombre)) {
        throw new Error('El nombre de captura admite letras, números, guiones y guiones bajos (sin .png).');
      }
    }
  }
}

async function main() {
  const directorio = path.resolve('resultados');
  const salida = [];
  const inicio = new Date().toISOString();
  let navegador;
  let pagina;
  let temporizador;
  let agotado = false;
  let pasoActual = 0;
  let completados = 0;
  let total = 0;
  let correcto = false;

  await fs.mkdir(directorio, { recursive: true });
  const registrar = (mensaje) => salida.push(mensaje);
  const guardar = () => fs.writeFile(path.join(directorio, 'salida.txt'), salida.join('\n\n') + '\n');

  try {
    registrar(`Inicio: ${inicio}`);
    const tarea = JSON.parse(await fs.readFile(process.argv[2] || 'tarea.json', 'utf8'));
    const urlManual = process.env.TARGET_URL?.trim();
    if (urlManual) {
      validarUrl(urlManual);
      const primerAbrir = tarea?.pasos?.find((paso) => paso?.accion === 'abrir');
      if (!primerAbrir) throw new Error('La dirección manual necesita una acción abrir en tarea.json.');
      primerAbrir.url = urlManual;
    }
    validarTarea(tarea);
    total = tarea.pasos.length;
    // Elimina únicamente resultados anteriores de este ejecutor.
    const previos = await fs.readdir(directorio);
    for (const nombre of previos) {
      if (/^\d{2}-[a-zA-Z0-9_-]+\.png$/.test(nombre) || nombre === 'resumen.json') {
        await fs.unlink(path.join(directorio, nombre));
      }
    }
    await guardar();
    navegador = await chromium.launch({
      headless: true,
      timeout: 45000,
      ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
    });
    pagina = await navegador.newPage({ viewport: { width: 1280, height: 800 } });
    pagina.setDefaultTimeout(15000);
    pagina.setDefaultNavigationTimeout(45000);
    temporizador = setTimeout(() => {
      agotado = true;
      navegador.close().catch(() => {});
    }, MAX_DURACION_MS);
    temporizador.unref();

    for (const [indice, paso] of tarea.pasos.entries()) {
      pasoActual = indice + 1;
      if (agotado) throw new Error('Se agotó el tiempo de la tarea.');
      const prefijo = `${pasoActual}/${total} — ${paso.accion}`;
      switch (paso.accion) {
        case 'abrir': {
          const respuesta = await pagina.goto(paso.url, { waitUntil: 'domcontentloaded' });
          if (respuesta && !respuesta.ok()) throw new Error(`La página respondió HTTP ${respuesta.status()}.`);
          registrar(`${prefijo}: ${pagina.url()}`);
          break;
        }
        case 'clic':
          await pagina.locator(paso.selector).click();
          registrar(`${prefijo}: ${paso.selector}`);
          break;
        case 'escribir':
          await pagina.locator(paso.selector).fill(paso.valor);
          registrar(`${prefijo}: ${paso.selector}`);
          break;
        case 'esperar':
          if (paso.selector) {
            await pagina.locator(paso.selector).waitFor({ state: 'visible' });
            registrar(`${prefijo}: visible ${paso.selector}`);
          } else {
            await pagina.waitForTimeout(paso.ms ?? 1000);
            registrar(`${prefijo}: ${paso.ms ?? 1000} ms`);
          }
          break;
        case 'texto': {
          const selector = paso.selector || 'body';
          const texto = await pagina.locator(selector).innerText();
          registrar(`${prefijo} (${selector}):\n${texto}`);
          break;
        }
        case 'captura': {
          const nombre = `${String(pasoActual).padStart(2, '0')}-${paso.nombre || 'captura'}.png`;
          await pagina.screenshot({ path: path.join(directorio, nombre), fullPage: true, timeout: 15000 });
          registrar(`${prefijo}: ${nombre}`);
          break;
        }
        case 'enlaces': {
          const enlaces = await pagina.locator('a[href]').evaluateAll((elementos) =>
            [...new Set(elementos.map((a) => a.href).filter((url) => /^https?:\/\//.test(url)))]);
          registrar(`${prefijo}:\n${enlaces.join('\n') || '(sin enlaces HTTP/HTTPS)'}`);
          break;
        }
      }
      if (agotado) throw new Error('Se agotó el tiempo de la tarea.');
      completados++;
      await guardar();
    }
    correcto = true;
    registrar('RESULTADO: CORRECTO');
  } catch (error) {
    process.exitCode = 1;
    // Playwright puede incluir valores introducidos en la traza: conserva solo el mensaje principal.
    const detalle = agotado ? 'La tarea superó el máximo de 4 minutos.' : String(error.message).split('\n')[0];
    registrar(`ERROR${pasoActual ? ` en el paso ${pasoActual}` : ' de preparación'}: ${detalle}`);
    if (pagina && !pagina.isClosed()) {
      try {
        const nombre = `${String(pasoActual).padStart(2, '0')}-error.png`;
        await pagina.screenshot({ path: path.join(directorio, nombre), fullPage: true, timeout: 5000 });
        registrar(`Captura del error: ${nombre}`);
      } catch {
        registrar('No se pudo capturar la pantalla del error.');
      }
    }
    registrar('RESULTADO: ERROR. Se detuvieron los pasos siguientes.');
  } finally {
    clearTimeout(temporizador);
    try {
      await navegador?.close();
    } catch {
      correcto = false;
      process.exitCode = 1;
      registrar('ERROR al cerrar el navegador.');
    }
    await guardar();
    await fs.writeFile(path.join(directorio, 'resumen.json'), JSON.stringify({
      correcto, inicio, fin: new Date().toISOString(), pasosCompletados: completados, totalPasos: total,
    }, null, 2) + '\n');
    // Evita que el texto de una web se interprete como comandos del registro de Actions.
    if (process.env.GITHUB_ACTIONS) {
      const { randomUUID } = require('node:crypto');
      const marcador = randomUUID();
      console.log(`::stop-commands::${marcador}`);
      console.log(salida.join('\n\n'));
      console.log(`::${marcador}::`);
    } else {
      console.log(salida.join('\n\n'));
    }
  }
}

main().catch((error) => {
  console.error('No se pudieron guardar los resultados:', String(error.message).split('\n')[0]);
  process.exitCode = 1;
});
