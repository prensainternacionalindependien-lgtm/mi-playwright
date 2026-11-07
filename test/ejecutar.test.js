'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const ejecutar = promisify(execFile);
const script = path.resolve(__dirname, '../ejecutar.js');

test('navegador real: acciones, cambio de URL, resultados y detención ante errores', async () => {
  const temporal = await fs.mkdtemp(path.join(os.tmpdir(), 'mi-playwright-'));
  let visitas = 0;
  const servidor = http.createServer((peticion, respuesta) => {
    visitas++;
    respuesta.writeHead(peticion.url === '/error' ? 404 : 200, { 'Content-Type': 'text/html; charset=utf-8' });
    respuesta.end(`<!doctype html><html lang="es"><head><title>Prueba local</title></head><body>
      <h1>Prueba del ejecutor</h1><form id="formulario"><input id="nombre"><button type="submit">Enviar</button></form>
      <p id="resultado" hidden></p><a href="/destino">Destino</a><a href="/destino">Duplicado</a>
      <script>document.querySelector('#formulario').onsubmit=(evento)=>{evento.preventDefault();
      const resultado=document.querySelector('#resultado');resultado.textContent='Hola '+document.querySelector('#nombre').value;
      resultado.hidden=false;};</script></body></html>`);
  });
  await new Promise((resolver) => servidor.listen(0, '127.0.0.1', resolver));
  const origen = `http://127.0.0.1:${servidor.address().port}`;

  async function correr(nombre, tarea, url = '') {
    const carpeta = path.join(temporal, nombre);
    await fs.mkdir(carpeta);
    await fs.writeFile(path.join(carpeta, 'tarea.json'), typeof tarea === 'string' ? tarea : JSON.stringify(tarea));
    let codigo = 0;
    try {
      await ejecutar(process.execPath, [script], {
        cwd: carpeta, env: { ...process.env, TARGET_URL: url }, timeout: 60000,
      });
    } catch (error) {
      if (!Number.isInteger(error.code)) throw error;
      codigo = error.code;
    }
    const salida = await fs.readFile(path.join(carpeta, 'resultados/salida.txt'), 'utf8');
    const resumen = JSON.parse(await fs.readFile(path.join(carpeta, 'resultados/resumen.json'), 'utf8'));
    return { codigo, salida, resumen, carpeta };
  }

  try {
    const exito = await correr('exito', { pasos: [
      { accion: 'abrir', url: 'https://example.com' },
      { accion: 'escribir', selector: '#nombre', valor: 'Prueba' },
      { accion: 'clic', selector: 'button' },
      { accion: 'esperar', selector: '#resultado' },
      { accion: 'esperar', ms: 0 },
      { accion: 'texto', selector: '#resultado' },
      { accion: 'captura', nombre: 'formulario' },
      { accion: 'enlaces' },
    ] }, origen);
    assert.equal(exito.codigo, 0, exito.salida);
    assert.equal(exito.resumen.correcto, true);
    assert.equal(exito.resumen.pasosCompletados, 8);
    assert.match(exito.salida, /Hola Prueba/);
    assert.match(exito.salida, /0 ms/);
    assert.equal(exito.salida.split(`${origen}/destino`).length - 1, 1);
    const png = await fs.readFile(path.join(exito.carpeta, 'resultados/07-formulario.png'));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.ok(png.length > 1000);

    const fallo = await correr('fallo-http', { pasos: [
      { accion: 'abrir', url: `${origen}/error` },
      { accion: 'captura', nombre: 'no-ejecutar' },
    ] });
    assert.equal(fallo.codigo, 1);
    assert.equal(fallo.resumen.correcto, false);
    assert.equal(fallo.resumen.pasosCompletados, 0);
    assert.match(fallo.salida, /HTTP 404/);
    const archivos = await fs.readdir(path.join(fallo.carpeta, 'resultados'));
    assert.ok(archivos.includes('01-error.png'));
    assert.ok(!archivos.includes('02-no-ejecutar.png'));

    const antes = visitas;
    const invalida = await correr('nombre-invalido', { pasos: [
      { accion: 'abrir', url: origen },
      { accion: 'captura', nombre: '../fuera' },
    ] });
    assert.equal(invalida.codigo, 1);
    assert.equal(visitas, antes, 'La validación debe ocurrir antes de abrir la web');
    const jsonRoto = await correr('json-roto', '{');
    assert.equal(jsonRoto.codigo, 1);
    assert.equal(jsonRoto.resumen.correcto, false);
    assert.match(jsonRoto.salida, /ERROR de preparación/);
  } finally {
    servidor.closeAllConnections();
    await new Promise((resolver) => servidor.close(resolver));
    await fs.rm(temporal, { recursive: true, force: true });
  }
});
