# Banco de pruebas del lector de capturas

Mide el lector de capturas de la web (`public/js/capturas/`) con capturas
reales del juego, con el mismo código que usa el navegador y Tesseract en
Node. No forma parte de la web: tiene sus propias dependencias.

Las capturas van en `muestras-ocr/` (en la raíz del proyecto). No se suben a
GitHub porque contienen datos de la sesión del juego. Lo que sí está aquí es
**`verdad.json`**: lo que muestra de verdad cada captura (origen, destino y
minutos), revisado a ojo una por una.

## Uso

```bash
cd herramientas/banco-lector
npm install
npm run leer      # lee todas las capturas → resultado.json
npm run medir     # compara con verdad.json
npm run tiempo    # solo el reconocedor de tiempo, con validación cruzada
```

- **Errores confiados**: un valor equivocado que se propone sin marcarlo para
  revisar. Es el peor fallo (el usuario no lo mira) y debe ser 0.
- **Validación cruzada** (`npm run tiempo`): cada captura se lee con
  plantillas aprendidas de todas las demás, así la cifra no es optimista.

## Añadir capturas nuevas

1. Copia las capturas a `muestras-ocr/`.
2. `npm run leer` y revisa los casos nuevos contra la imagen. Añade a
   `verdad.json` lo que muestra de verdad cada una. Para las de menos de una
   hora, añade también sus segundos en `SEGUNDOS` de `evaltiempo.mjs`.
3. `npm run tiempo` para medir y `npm run plantillas` para regenerar
   `public/js/capturas/plantillas.js` con todas.

## Resultado (2026-09-30, 106 capturas a 1920×1080)

| | Antes | Ahora |
|---|---|---|
| Origen | 106/106 | 106/106 |
| Destino | 105/106 | 106/106 |
| Tiempo | 99/106, 3 errores confiados | 106/106 (validación cruzada 105/106), 0 confiados |
