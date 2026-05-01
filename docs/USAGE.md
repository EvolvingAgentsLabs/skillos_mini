# Usage

> Para electricistas, plomeros, pintores y otros oficios. Cómo usar la
> app en un trabajo real, desde la primera apertura hasta el reporte
> final al cliente.

Esta guía está pensada para vos, **el oficio**. Si sos desarrollador y
querés autorizar tu propio cartridge (oficio), mirá
[`TUTORIAL.md`](TUTORIAL.md) en lugar de éste.

---

## Primera apertura

Cuando abrís la app por primera vez ves un onboarding rápido de 4
pantallas:

1. **"Tu bitácora del oficio"** — qué hace la app.
2. **"Foto · Diagnóstico · Reporte"** — el flujo en 3 pasos.
3. **"PDF al cliente, ya con tu marca"** — explicación de privacidad.
4. **"¿Cuál es tu oficio?"** — elegís electricista, plomero, pintor, o
   "Más tarde".

> Si por error elegiste mal, podés cambiarlo desde **Ajustes** (⚙ arriba
> a la derecha) → **Oficio activo**.

### Cargar tus datos

La primera vez que generes un PDF la app te va a pedir tus datos. Estos
salen en el **pie de cada PDF** que mandás al cliente. Te conviene
cargarlos ya:

| Campo | Ejemplo | Para qué sirve |
|---|---|---|
| Nombre | Daniel R. | Identificación personal |
| Empresa o marca | Daniel R. Electricidad | Línea principal del pie de PDF |
| Profesional matriculado | Sí | Activa el campo de matrícula |
| Número de matrícula | UTE-12345 | Crítico para electricistas |
| Teléfono | +598 99 999 999 | Lo ven los clientes en el reporte |
| RUT | 21 1111111 0019 | Para facturación formal |
| Logo | imagen 512×512 max | Va arriba a la derecha del PDF |

> **Privacidad**: estos datos se guardan **solo en tu celular**. Nadie
> los ve hasta que generes y compartas un PDF. Si limpiás los datos del
> dispositivo, se borran.

---

## Tu primer trabajo

Ejemplo: electricista atiende un cliente con problema en la cocina.

### Paso 1 · Capturar fotos

Tap en **"Nuevo trabajo"** (el botón grande con tu color de marca).

La cámara se abre en pantalla completa. Arriba ves un chip que dice
**"Antes"** — eso es el momento del trabajo en el que estás capturando.
La app lo cambia automáticamente a "Durante" / "Después" cuando avanzás.

- Tap **el botón redondo grande** para sacar foto.
- Cada foto se guarda en tu celular y muestra un contador (1, 2, 3...).
- Sacá entre **1 y 3 fotos**. Más no es necesario para el diagnóstico.

> **Tip de Daniel (electricista, 22 años de oficio)**:
> *"No me hagas tipear formularios delante del dueño de casa."*
> Por eso después de cada foto **NO** te aparece un formulario. Las
> anotaciones detalladas se hacen después, en el auto o en tu casa.

### Paso 2 · Continuar al diagnóstico

Cuando tengas suficientes fotos, tap **"Continuar"**. Llegás a la
pantalla de **Diagnóstico**.

Acá tenés tres formas de llenar la información:

#### A. Diagnóstico inteligente (Navigator + IA)

El botón **"✨ Auto-diagnóstico"** activa el Navigator — un sistema que
combina verificaciones técnicas automáticas con la inteligencia de la IA:

- **Verificaciones obligatorias**: la app ejecuta las reglas técnicas
  correspondientes a tu oficio (sección de cable vs térmico, presencia
  de diferencial, etc.). Estas corren siempre — no dependen de la IA.
- **Verificaciones adaptivas**: la IA mira los resultados y decide si
  hacer chequeos adicionales. Por ejemplo, si detecta cable
  subdimensionado, puede verificar también si hay diferencial.
- **Informe final**: la IA lee todos los resultados y compone un
  diagnóstico en lenguaje técnico + explicación al cliente.

Todo esto corre **en menos de 10 segundos** con Gemma 4 local.

- **Vos editás el resultado** antes de seguir. La IA se equivoca a veces;
  vos sos el profesional matriculado.
- La severidad (1 a 5) se setea según las verificaciones técnicas.

> **Privacidad**: con Gemma 4 local, las fotos y datos **nunca salen del
> celular**. Con Gemini/OpenRouter, las fotos viajan a esos
> proveedores (encriptadas). Vos elegís cuál usar en **Ajustes →
> Proveedor**.

> **¿Por qué es más confiable que un chatbot?** Porque las reglas
> técnicas (IEC 60364, normas de seguridad) están codificadas en la app
> como funciones — no como texto en un prompt. La IA no puede
> "olvidarse" de verificar la sección del cable. Eso corre siempre.

#### B. Dictado por voz (recomendado en obra)

Al lado de cada textarea hay un botón **"🎤 Hablar"**.

- Tap → la app empieza a escuchar (botón parpadea rojo).
- Hablá en castellano: *"Hay cable VC de 1.5 que viene del tablero hasta
  el horno eléctrico. La sección es chica para la potencia que tira el
  horno. Hay marcas de calentamiento en el tomacorriente."*
- Tap de nuevo o esperá 12 segundos → la app pega el texto en la
  textarea.
- Podés dictar varias veces — cada dictado se **agrega** al texto que ya
  hay.

#### C. Tipear (siempre disponible)

Las textareas son comunes. Podés escribir / pegar / editar.

#### Severidad

El slider de **Severidad** va de 1 a 5:
- **1** — cosmético (un toma flojo, una caja sin tapa)
- **2** — defecto menor sin riesgo (canalización inadecuada)
- **3** — debe corregirse (sin RCD en cocina, toma sin tierra)
- **4** — riesgo importante (cable subdimensionado, conexión floja)
- **5** — peligro inmediato (riesgo de incendio activo, RCD no funcional)

### Paso 3 · Generar el reporte

Tap **"Generar reporte"**.

Si es la primera vez, te aparece la pantalla de **Tus datos** que vimos
arriba. Cargalos y tap **Guardar** — el flujo continúa solo.

La app genera un **PDF** con:

- **Encabezado**: tu logo + datos de empresa + matrícula
- **Resumen** (sección): explicación al cliente en lenguaje llano
- **Antes** (sección): tus fotos con role "before"
- **Trabajo realizado** (sección): cada acción con descripción + fotos
- **Después** (sección): fotos finales
- **Materiales** (tabla): marcas, cantidades, unidades
- **Garantía** (sección): texto del cartridge
- **Pie de página**: disclaimer profesional + número de página

El PDF se ve en pantalla. Si querés cambiar algo, tap **"Editar"** y volvés
a Diagnóstico.

### Paso 4 · Compartir por WhatsApp

Tap **"Compartir por WhatsApp"**.

- Se abre el menú nativo de Android / iOS de "Compartir".
- Elegí WhatsApp → contacto del cliente → enviar.
- También podés elegir Email, Drive, Files, lo que tenga el dispositivo.

> **El trabajo queda marcado como "Compartido"**. Aparece en
> **"Trabajos recientes"** con un check verde. Si el cliente te pide
> reenviarlo más tarde, tap el trabajo → ya tenés el PDF generado, dale
> de vuelta al botón Compartir.

---

## Trabajos recientes

En la pantalla principal, debajo del banner de tu oficio, ves
**"Trabajos recientes (N)"** con tarjetas.

Cada tarjeta muestra:
- Miniatura (la foto de "después" si existe, sino la primera)
- Resumen del cliente (las primeras 80 letras del diagnóstico)
- Estado:
  - **Borrador** — recién empezado, sin fotos
  - **Fotos cargadas** — fotos pero sin diagnóstico aún
  - **Diagnóstico hecho** — listo para ir al reporte
  - **Listo para compartir** — PDF generado, falta enviar
  - **Compartido** — completado y enviado al cliente

Tap cualquier tarjeta → reabre el trabajo en el **paso correcto**:
- Borrador → vuelve a la cámara
- Fotos → vuelve al diagnóstico
- Listo → muestra el PDF para reenviar

### Modo portfolio (pintores)

Si sos pintor, la lista por defecto es **modo portfolio**: una grilla de
**antes/después por trabajo**, estilo Instagram. Buena para mostrarle a
nuevos clientes lo que hiciste antes.

---

## Flujos especiales

### Solo presupuestar (sin ejecutar)

Útil cuando vas a una visita técnica y querés mandar un presupuesto al
cliente, esperar la aprobación, y volver a hacer el trabajo otro día.

1. En el banner del oficio, tap **"Sólo presupuestar"** (electricista) o
   **"Presupuestar"** (pintor) — botón secundario.
2. Sacás 1-3 fotos del lugar.
3. Llegás al **editor de presupuesto** con un item base (mano de obra).
4. Editás los items: tipo (mano de obra / material / cargo / descuento),
   nombre, cantidad, unidad, precio.
5. **Los totales se recalculan solos** — subtotal, IVA, total.
6. Cambiás la fecha de validez si querés (default: 14 días).
7. Tap **"Generar presupuesto"** → PDF con tus datos en el pie.
8. Tap **"Compartir por WhatsApp"** → al cliente.

> **El presupuesto NO finaliza el trabajo**. Si después el cliente
> aprueba, volvés a abrir el mismo trabajo y arrancás el flujo de
> ejecución completo. Las fotos del relevamiento se reutilizan.

### Urgencia (plomeros)

El flujo por defecto del plomero es **"Atender llamada"** (urgencia):

1. Foto rápida del problema (1-2 fotos).
2. Diagnóstico vision-first: *"de dónde realmente viene la pérdida"*.
3. **Mensaje al cliente** auto-generado: *"Revisé y la pérdida es de la
   cañería de descarga del piso de arriba. Necesito conseguir un repuesto
   y vuelvo mañana entre 9 y 11 a colocarlo. Cualquier cosa avisame."*
4. Lo copiás y pegás en WhatsApp del cliente.
5. Volvés cuando lo arreglás → fotos de "Después" → PDF al cierre.

---

## Configuracion

Tap el ⚙ arriba a la derecha en Home.

### Tu perfil

- Tap **"Editar"** → modifica nombre, empresa, matrícula, teléfono, RUT,
  logo.
- Los cambios se reflejan **en el siguiente PDF** que generás.

### Oficio activo

- Lista de oficios disponibles.
- El activo tiene fondo del color de tu oficio.
- "**Sin oficio**" te lleva al modo recetas (cartridges genéricos —
  legacy).
- Cambiar de oficio NO borra trabajos pasados — solo cambia qué se ve en
  el banner y la lista.

### Estadísticas

- Cuántos archivos de cartridges tenés cargados
- Cuántos trabajos hiciste en cada cartridge
- Cuánta memoria SmartMemory ocupada

### Modelo on-device (avanzado)

- Toggle **"On-device LLM providers"** habilita Gemma 4 local.
- Tap **"Manage on-device models…"** para descargar Gemma 4 E2B / E4B.
- Modelos pesan ~1.5 GB / ~2.6 GB. Conviene descargarlos por **WiFi**.
- Una vez descargado, el Auto-diagnóstico corre **sin internet**.

---

## Privacidad

| Acción | ¿Sale algo del celular? |
|---|---|
| Sacar foto | No |
| Generar PDF | No |
| Auto-diagnóstico con Gemma 4 local | **No** — el modelo corre en tu CPU/NPU |
| Auto-diagnóstico con Gemini/OpenRouter | **Sí** — la foto va al proveedor que elegiste |
| Tap "Compartir" | **Sí** — vos lo decidiste, va por WhatsApp/Email |
| Descargar modelo | **Sí** — solo binario del modelo, no datos tuyos |
| Refresh de precios de materiales | **Sí** — solo descarga lista de precios |
| Cualquier otra cosa | **No** — la app no tiene servidores propios |

Si querés mantener todo 100% local, configurá Gemma 4 local en
Settings → Provider y nunca habilites un proveedor cloud. La app sigue
funcionando completa.

---

## Problemas comunes

### "La cámara no abre"

- Permisos: Settings de Android → Apps → skillos → Permisos → Cámara → permitir.
- Reiniciá la app.

### "El logo se ve borroso en el PDF"

- Subí un logo más grande (idealmente 1024×1024).
- Subilo en formato PNG con fondo transparente para mejor resultado.

### "El Auto-diagnóstico tarda mucho"

- Con Gemma 4 local: 6–12 segundos en celulares de gama alta. En gama
  media puede tardar 20–30 s.
- Con cloud: depende de la velocidad de tu internet (1–4 segundos).
- Si usás cloud y no anda, fíjate en Settings que el API key esté
  cargado y vigente.

### "El cliente no recibe el PDF"

- WhatsApp tiene límite de adjunto de **100 MB**. Los PDFs típicos
  pesan 200 KB - 2 MB, así que no debería pasar nunca.
- Si la conversación de WhatsApp con el cliente está bloqueada por
  WhatsApp, mandá por **Email** — funciona igual.

### "Quiero borrar todos mis datos"

- Settings → "Resync from bundle" borra IndexedDB y rehidrata desde
  cero. **Esto borra todos tus trabajos** — usalo solo si estás seguro.
- Para borrar TODO incluyendo modelos descargados: Settings de Android
  → Apps → skillos → Storage → Clear data.

### "Cómo le explico al cliente que la IA me asistió"

Honestamente, no hace falta — los clientes no leen quién hizo el
diagnóstico. Pero si te lo preguntan, el disclaimer del pie del PDF
ya lo dice:

> *"Esta aplicación asiste con documentación y validaciones de norma;
> no sustituye juicio profesional. La decisión final sobre intervenciones
> eléctricas es responsabilidad del electricista matriculado UTE actuante."*

Vos firmás. La IA es una herramienta como el multímetro.

---

## Recomendaciones por oficio

### Electricista

- **Cargá tu matrícula UTE en el perfil**. Aparece en cada PDF y duplica
  la credibilidad ante clientes que no te conocen.
- **Usá el cartridge `trade-electricista`** — IEC 60364 + UTE. Si
  trabajás obra industrial, el cartridge es residencial — adaptalo.
- **No saltees `power_off_documented`** en el work_plan. El validador
  rechaza el PDF si tocás circuito vivo sin documentar el corte.

### Plomero

- **Urgencias primero**: el flujo por defecto. Para obras grandes, tap
  el botón secundario "Presupuestar obra".
- **Marcas locales**: el cartridge usa FV / Loto / Hidromet / Rotoplas.
  Si trabajás con otras, editá `data/materials_uy.json` o pedile al
  desarrollador que lo agregue.
- **El `client_message` mid-job es oro**: te ahorra explicar por
  WhatsApp manualmente cuando dejás al cliente esperando un repuesto.

### Pintor

- **Modo portfolio**: tu Library default es la grilla antes/después.
  Cuando un cliente nuevo te pide ver trabajos pasados, le mostrás el
  celular y listo.
- **Presupuesto rápido por m²**: el flow `presupuesto` es para visita
  técnica → presupuesto → mandar en menos de 2 horas. Verónica
  (pintora con la que validamos esto) decía: *"el primero que responde
  decente gana el trabajo"*.
- **Validadores blandos**: el painting_sanity solo te avisa si no hay
  paso de preparación cuando el diagnóstico decía "humedad localizada".
  No bloquea, solo recuerda.

---

## Proximos pasos

Cuando hayas hecho 3-5 trabajos con la app:
- Mirá las **estadísticas** en Settings — cuántos PDFs generaste.
- Pedí feedback a 2 clientes: *"¿el reporte que te mandé estaba claro?"*
- Si encontrás un código de problema que falta (ej: nunca aparece
  `panel_yeso_quebrado` en el diagnóstico), avisalo al desarrollador o
  editá `cartridges/<oficio>/data/problem_codes.md`.
- Si tu zona usa marcas distintas a las del cartridge, abrí un PR en
  GitHub o pedí ajuste.

Para autorizar tu propio cartridge (otro oficio: gasista, herrero,
carpintero, jardinero, …) seguí
[`TUTORIAL.md`](TUTORIAL.md).

---

## Cómo funciona por dentro (para curiosos)

No necesitás saber esto para usar la app — pero si te interesa entender
por qué funciona tan rápido y de forma tan confiable:

### El Navigator

Cuando tipeas un problema ("tengo un cable que se calienta"), pasa esto:

1. **Ruteo**: la IA lee tu mensaje y elige cuál "documento de diagnóstico"
   abrir. Es como si eligiera el capítulo correcto de un manual.

2. **Verificaciones obligatorias**: la app ejecuta las reglas técnicas
   que correspondan. Por ejemplo, si el documento dice "verificar sección
   de cable", la app calcula automáticamente si 2.5mm² alcanza para un
   térmico de 32A. Esto no usa IA — es una fórmula.

3. **Verificaciones adaptivas**: la IA mira los resultados y decide si
   profundizar. Si el cable falla, puede decidir verificar también si hay
   diferencial. Pero solo puede usar las herramientas que el documento
   le habilita — no inventa chequeos random.

4. **Siguiente paso**: la IA decide si ir al presupuesto, pedir más datos,
   o dar por terminado el diagnóstico.

5. **Composición**: la IA toma todos los resultados técnicos y escribe
   el informe final — un resumen técnico + explicación al cliente.

### ¿Por qué funciona con un modelo chico en el celular?

La IA (Gemma 4, 1.5GB en tu celular) hace **muy poco**:

- Elige entre 2-5 opciones (una palabra)
- Decide si llamar a una herramienta de una lista corta
- Escribe 2-3 párrafos de resumen

Todo lo demás (cálculos, reglas de seguridad, precios, formato del PDF)
lo hace la app directamente, sin IA. Es como tener un asistente que solo
necesita decir "sí verificá eso también" o "listo, pasemos al presupuesto".

### ¿Qué NO puede hacer mal la IA?

- **No puede saltear verificaciones obligatorias** — corren siempre.
- **No puede inventar herramientas** — solo usa las de una lista aprobada.
- **No puede generar reglas técnicas** — están escritas en código, no en prompts.
- **No puede acceder a internet** — corre 100% en tu celular.

Lo peor que puede pasar es que la IA elija mal el siguiente paso o escriba
un resumen confuso — y para eso está el botón "Editar".

