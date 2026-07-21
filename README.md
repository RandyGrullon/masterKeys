# masterKeys

Aprender a leer partitura en piano, a contrarreloj — con un plan de estudio y una app que escucha tu piano y mide si de verdad estás leyendo.

## Qué hay aquí

| Carpeta | Qué es |
|---|---|
| [`PLAN.md`](PLAN.md) | Plan de 16 semanas: de no leer nada a leer con fluidez + dos piezas objetivo |
| [`pdf/`](pdf/) | El plan y una hoja de atril, listos para imprimir o llevar en la tablet |
| [`assets/`](assets/) | Diagramas del pentagrama, teclado, intervalos y ritmo (SVG) |
| [`app/`](app/) | **Lectura a Primera Vista** — PWA que entrena la lectura |

## La app

Una PWA que genera ejercicios de lectura **siempre nuevos** y escucha por el micrófono qué nota tocas en un piano acústico.

**La idea central:** la medición solo prueba que *lees* si el material es inédito. Con ejercicios repetidos, el alumno los memoriza y ya no se distingue leer de recordar — que es justo la trampa a evitar. Por eso los ejercicios son generados proceduralmente: infinitos, nunca repetidos, sin derechos de autor de por medio.

- **Detección de tono YIN**, robusta ante los armónicos fuertes del piano (verificada: 25/25 con timbre sintético, ruido y desafinación).
- **Modo con piano** (micrófono) y **modo sin piano** (pantalla táctil), para practicar de viaje sin instrumento.
- **Puerta de Fase 1** medida de verdad: identificar cualquier nota de ambas claves en menos de 2 s con 95% de acierto.
- **Offline**: service worker + almacenamiento local. Funciona en la tablet apoyada en el atril, sin wifi.

### Límite honesto

La detección es **monofónica**: funciona en notas sueltas (los drills de lectura), no en acordes ni con pedal de resonancia. Ante un acorde, cualquier detector de una voz reporta una nota que nadie tocó. Por eso la app se centra en la lectura a primera vista, que es notas sueltas — y es justo la habilidad más perecedera y la que peor cubre tocar de oído.

## Uso

```bash
cd app
node serve.mjs        # -> http://localhost:5174
```

El micrófono necesita `localhost` o HTTPS. En una tablet, sirve la app por HTTPS (o despliégala en cualquier host estático) para el modo con piano; el modo táctil funciona en HTTP.

### Pruebas

```bash
cd app
npm test              # 73 pruebas: detector de tono + teoría/geometría/generador
```

## Estado

- [x] Motor de detección (YIN) verificado contra señales sintéticas
- [x] Generador de ejercicios y renderizador de pentagrama
- [x] Registro de práctica y evaluación de la puerta de Fase 1
- [x] PWA instalable, offline
- [ ] Calibración con un micrófono y un piano reales
- [ ] Capa de coaching (aplazada hasta tener semanas de datos de práctica reales)
