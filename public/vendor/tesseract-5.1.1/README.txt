Tesseract.js 5.1.1 (OCR en el navegador) — https://github.com/naptha/tesseract.js
Licencia Apache 2.0 (ver LICENSE-tesseract.js.txt y LICENSE-tesseract-core.txt).

Archivos copiados sin modificar desde los paquetes npm:
  tesseract.esm.min.js              tesseract.js/dist
  worker.min.js                     tesseract.js/dist
  tesseract-core-simd-lstm.wasm.js  tesseract.js-core 5.1.1
  eng.traineddata                   @tesseract.js-data/eng 4.0.0_best_int (sin comprimir)

Se sirven desde este dominio para que la CSP siga permitiendo solo scripts
propios. La carpeta lleva la versión en el nombre: el servidor la cachea 30
días; para actualizar, crear una carpeta nueva y cambiar BASE en
public/js/capturas/ocr.js.
